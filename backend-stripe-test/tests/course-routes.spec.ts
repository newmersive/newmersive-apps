import assert from "node:assert";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import { ENV } from "../src/config/env";
import {
  clearServiceReplayCacheForTests,
  createServiceAccessToken,
} from "../src/middleware/service-auth.middleware";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

describe("Newmersive Robot Lab course routes", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `robot-lab-routes+${suffix}@test.local`;
  const password = "coursePass123";
  let token = "";

  function serviceAuthorization() {
    return `Bearer ${createServiceAccessToken({
      service: "robot-lab-route-tests",
      scopes: ["entitlements:grant"],
    })}`;
  }

  before(async () => {
    clearServiceReplayCacheForTests();
    await client.start();
    const registerRes = await client.post("/auth/register", {
      name: "Robot Lab Route Student",
      email,
      password,
      sourceApp: "trueqia",
    });
    assert.equal(registerRes.status, 201);
    token = registerRes.body.token;
  });

  after(async () => {
    await client.stop();
  });

  it("requires a course entitlement for protected campus tools", async () => {
    const accessRes = await client.get("/course/robot-lab/access", {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(accessRes.status, 200);
    assert.equal(accessRes.body.allowed, false);

    const assistantRes = await client.post(
      "/course/robot-lab/assistant",
      { artifact: "manifest datos riesgo mql5" },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(assistantRes.status, 403);
    assert.equal(assistantRes.body.error, "COURSE_ENTITLEMENT_REQUIRED");
  });

  it("returns fallback AI review for entitled students when OpenAI is not configured", async () => {
    await client.post(
      "/entitlements/grant",
      {
        email,
        entitlement: "course_professional",
        source: "manual",
      },
      { Authorization: serviceAuthorization() }
    );

    const loginRes = await client.post("/auth/login", { email, password });
    assert.equal(loginRes.status, 200);

    const accessRes = await client.get("/course/robot-lab/access", {
      Authorization: `Bearer ${loginRes.body.token}`,
    });

    assert.equal(accessRes.status, 200);
    assert.equal(accessRes.body.allowed, true);
    assert.ok(accessRes.body.entitlements.includes("course_professional"));

    const consentRes = await client.post(
      "/course/robot-lab/consent",
      { types: ["terms", "privacy", "risk"] },
      { Authorization: `Bearer ${loginRes.body.token}` }
    );
    assert.equal(consentRes.status, 200);

    const progressRes = await client.patch(
      "/course/robot-lab/progress/2",
      { lessonIndex: 3, status: "in_progress", percent: 45, studentState: { goal: "parity" } },
      { Authorization: `Bearer ${loginRes.body.token}` }
    );
    assert.equal(progressRes.status, 200);
    assert.equal(progressRes.body.progress.moduleId, 2);

    const stateRes = await client.get("/course/robot-lab/state", {
      Authorization: `Bearer ${loginRes.body.token}`,
    });
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.body.requiresConsent, false);
    assert.ok(stateRes.body.progress.some((item: any) => item.moduleId === 2));

    const nginxAuthRes = await client.getRaw("/course/robot-lab/nginx-auth", {
      Cookie: `newmersiveRobotLabToken=${encodeURIComponent(loginRes.body.token)}`,
    });

    assert.equal(nginxAuthRes.status, 204);

    const previousKey = ENV.OPENAI_API_KEY;
    ENV.OPENAI_API_KEY = undefined;
    try {
      const assistantRes = await client.post(
        "/course/robot-lab/assistant",
        { artifact: "manifest datos riesgo mql5" },
        { Authorization: `Bearer ${loginRes.body.token}` }
      );

      assert.equal(assistantRes.status, 200);
      assert.equal(assistantRes.body.agent, "Tutor principal");
      assert.ok(assistantRes.body.verdict);
    } finally {
      ENV.OPENAI_API_KEY = previousKey;
    }
  });

  it("reports Stripe setup missing before real Price IDs are configured", async () => {
    const previousKey = ENV.STRIPE_SECRET_KEY;
    ENV.STRIPE_SECRET_KEY = undefined;
    try {
      const checkoutRes = await client.post("/course/robot-lab/checkout", {
        email,
        plan: "professional",
      });

      assert.equal(checkoutRes.status, 503);
      assert.equal(checkoutRes.body.error, "STRIPE_NOT_CONFIGURED");
    } finally {
      ENV.STRIPE_SECRET_KEY = previousKey;
    }
  });

  it("allows a course administrator to inspect students and grant access", async () => {
    await client.post(
      "/entitlements/grant",
      { email, entitlement: "admin_course", source: "admin" },
      { Authorization: serviceAuthorization() }
    );

    const loginRes = await client.post("/auth/login", { email, password });
    const adminRes = await client.get("/course/robot-lab/admin", {
      Authorization: `Bearer ${loginRes.body.token}`,
    });
    assert.equal(adminRes.status, 200);
    assert.ok(adminRes.body.summary.students >= 1);

    const grantRes = await client.post(
      "/course/robot-lab/admin/entitlements",
      {
        email: `student-admin-grant+${suffix}@test.local`,
        name: "Granted Student",
        entitlement: "course_starter",
      },
      { Authorization: `Bearer ${loginRes.body.token}` }
    );
    assert.equal(grantRes.status, 200);
    assert.ok(grantRes.body.entitlements.includes("course_starter"));
  });

  it("accepts signed Stripe webhooks once and grants the paid plan", async () => {
    const previousSecret = ENV.STRIPE_WEBHOOK_SECRET;
    const webhookSecret = "whsec_robot_lab_test";
    ENV.STRIPE_WEBHOOK_SECRET = webhookSecret;
    const buyerEmail = `stripe-buyer+${suffix}@test.local`;
    const event = {
      id: `evt_${suffix.replace(/[^a-z0-9]/gi, "")}`,
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: `cs_test_${suffix.replace(/[^a-z0-9]/gi, "")}`,
          payment_status: "paid",
          payment_intent: `pi_${suffix.replace(/[^a-z0-9]/gi, "")}`,
          amount_total: 99700,
          currency: "eur",
          customer_details: { email: buyerEmail, name: "Stripe Buyer" },
          metadata: {
            product: "newmersive_robot_lab",
            plan: "professional",
            entitlement: "course_professional",
          },
        },
      },
    };
    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1_000);
    const signature = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
    try {
      const first = await client.post("/course/robot-lab/stripe/webhook", event, {
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      });
      assert.equal(first.status, 200);
      assert.equal(first.body.received, true);

      const duplicate = await client.post("/course/robot-lab/stripe/webhook", event, {
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      });
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.duplicate, true);

      const status = await client.get(`/course/robot-lab/checkout/status/${event.data.object.id}`);
      assert.equal(status.status, 200);
      assert.equal(status.body.status, "paid");
      assert.equal(status.body.accessGranted, true);

      const refundEvent = {
        id: `evt_partial_${suffix.replace(/[^a-z0-9]/gi, "")}`,
        type: "charge.refunded",
        livemode: false,
        data: { object: { payment_intent: event.data.object.payment_intent, amount: 99700, amount_refunded: 10000, refunded: false } },
      };
      const refundPayload = JSON.stringify(refundEvent);
      const refundSignature = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${refundPayload}`).digest("hex");
      const partialRefund = await client.post("/course/robot-lab/stripe/webhook", refundEvent, {
        "stripe-signature": `t=${timestamp},v1=${refundSignature}`,
      });
      assert.equal(partialRefund.status, 200);
      const partialStatus = await client.get(`/course/robot-lab/checkout/status/${event.data.object.id}`);
      assert.equal(partialStatus.body.status, "partially_refunded");
      assert.equal(partialStatus.body.accessGranted, true);
    } finally {
      ENV.STRIPE_WEBHOOK_SECRET = previousSecret;
    }
  });

  it("provides support, analytics, certificate eligibility and password changes", async () => {
    const loginRes = await client.post("/auth/login", { email, password });
    const headers = { Authorization: `Bearer ${loginRes.body.token}` };

    const analytics = await client.post(
      "/course/robot-lab/events",
      { name: "campus.view", metadata: { view: "support" } },
      headers
    );
    assert.equal(analytics.status, 201);

    const support = await client.post(
      "/course/robot-lab/support",
      { category: "technical", subject: "Error de paridad", message: "Necesito revisar una diferencia reproducible entre el laboratorio y MT5." },
      headers
    );
    assert.equal(support.status, 201);
    assert.equal(support.body.ticket.status, "open");

    const tickets = await client.get("/course/robot-lab/support", headers);
    assert.equal(tickets.status, 200);
    assert.ok(tickets.body.tickets.length >= 1);

    const certificate = await client.get("/course/robot-lab/certificate", headers);
    assert.equal(certificate.status, 200);
    assert.equal(certificate.body.eligibility.eligible, false);

    const adminOperations = await client.get("/course/robot-lab/admin/operations", headers);
    assert.equal(adminOperations.status, 200);
    assert.ok(adminOperations.body.operations.configuration);

    const passwordChange = await client.post(
      "/course/robot-lab/account/password",
      { currentPassword: password, newPassword: "coursePassChanged456!" },
      headers
    );
    assert.equal(passwordChange.status, 200);
    const changedLogin = await client.post("/auth/login", { email, password: "coursePassChanged456!" });
    assert.equal(changedLogin.status, 200);
  });
});
