import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import {
  clearServiceReplayCacheForTests,
  createServiceAccessToken,
} from "../src/middleware/service-auth.middleware";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

describe("Newmersive Robot Lab course entitlements", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `robot-lab+${suffix}@test.local`;
  const password = "coursePass123";

  function serviceAuthorization(scopes = ["entitlements:grant"]) {
    return `Bearer ${createServiceAccessToken({
      service: "robot-lab-tests",
      scopes,
    })}`;
  }

  before(async () => {
    clearServiceReplayCacheForTests();
    await client.start();
  });

  after(async () => {
    await client.stop();
  });

  it("keeps course access empty until a protected service grant is applied", async () => {
    const registerRes = await client.post("/auth/register", {
      name: "Robot Lab Student",
      email,
      password,
      sourceApp: "trueqia",
    });

    assert.equal(registerRes.status, 201);
    assert.deepEqual(registerRes.body.entitlements, []);
    assert.deepEqual(registerRes.body.user.entitlements, []);

    const denied = await client.post("/entitlements/grant", {
      email,
      entitlement: "course_professional",
    });

    assert.equal(denied.status, 401);
    assert.equal(denied.body.error, "SERVICE_AUTH_REQUIRED");

    const legacySecret = await client.post(
      "/entitlements/grant",
      {
        email,
        entitlement: "course_professional",
      },
      { Authorization: `Bearer ${process.env.SERVICE_TOKEN || "test-service-token"}` }
    );

    assert.equal(legacySecret.status, 401);
    assert.equal(legacySecret.body.error, "SERVICE_AUTH_INVALID");

    const insufficientScope = await client.post(
      "/entitlements/grant",
      {
        email,
        entitlement: "course_professional",
      },
      { Authorization: serviceAuthorization(["courses:read"]) }
    );

    assert.equal(insufficientScope.status, 403);
    assert.equal(insufficientScope.body.error, "SERVICE_SCOPE_REQUIRED");

    const invalid = await client.post(
      "/entitlements/grant",
      {
        email,
        entitlement: "unknown_course",
      },
      { Authorization: serviceAuthorization() }
    );

    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "INVALID_ENTITLEMENT");
  });

  it("rejects replay of a valid one-use service token", async () => {
    const authorization = serviceAuthorization();
    const body = {
      email,
      entitlement: "unknown_course",
    };

    const first = await client.post(
      "/entitlements/grant",
      body,
      { Authorization: authorization }
    );
    assert.equal(first.status, 400);

    const replay = await client.post(
      "/entitlements/grant",
      body,
      { Authorization: authorization }
    );
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error, "SERVICE_TOKEN_REPLAYED");
  });

  it("grants paid course access to an existing Newmersive ID", async () => {
    const grantRes = await client.post(
      "/entitlements/grant",
      {
        email,
        entitlement: "course_professional",
        source: "stripe",
        metadata: {
          stripe_session_id: `cs_test_${suffix}`,
          plan: "professional",
        },
      },
      { Authorization: serviceAuthorization() }
    );

    assert.equal(grantRes.status, 200);
    assert.equal(grantRes.body.ok, true);
    assert.equal(grantRes.body.createdUser, false);
    assert.ok(grantRes.body.entitlements.includes("course_professional"));

    const loginRes = await client.post("/auth/login", { email, password });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.entitlements.includes("course_professional"));
    assert.ok(loginRes.body.user.entitlements.includes("course_professional"));

    const meRes = await client.get("/auth/me", {
      Authorization: `Bearer ${loginRes.body.token}`,
    });

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.email, email);
    assert.ok(meRes.body.entitlements.includes("course_professional"));
  });

  it("creates invited buyer records for private/manual course sales", async () => {
    const invitedEmail = `manual-course+${suffix}@test.local`;
    const grantRes = await client.post(
      "/entitlements/grant",
      {
        email: invitedEmail,
        name: "Manual Course Buyer",
        entitlement: "course_starter",
        source: "manual",
      },
      { Authorization: serviceAuthorization() }
    );

    assert.equal(grantRes.status, 200);
    assert.equal(grantRes.body.createdUser, true);
    assert.equal(grantRes.body.user.email, invitedEmail);
    assert.equal(grantRes.body.user.role, "buyer");
    assert.ok(grantRes.body.entitlements.includes("course_starter"));
  });
});
