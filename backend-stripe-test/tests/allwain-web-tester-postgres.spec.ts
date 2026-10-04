import assert from "node:assert";
import { after, before, describe, it } from "node:test";

import { closePrisma, getPrisma } from "../src/db/prisma";
import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);
const prisma = getPrisma() as any;

type Session = {
  userId: string;
  email: string;
  headers: Record<string, string>;
};

async function register(label: string): Promise<Session> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `tester-${label}+${suffix}@test.local`;
  const response = await client.post("/auth/register", {
    name: `Tester ${label}`,
    email,
    password: "WebTesterE2E123!",
    sourceApp: "allwain",
  });
  assert.equal(response.status, 201);
  return {
    userId: response.body.user.id,
    email,
    headers: { Authorization: `Bearer ${response.body.token}` },
  };
}

describe("allwain authenticated web tester area", () => {
  let first: Session;
  let second: Session;
  let incidentId: string;
  const incidentReference = `incident-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const feedbackReference = `feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const progressReference = `progress-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const actionReference = `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const firstQualificationReference = `qualification-first-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const secondQualificationReference = `qualification-second-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  before(async () => {
    await client.start();
    first = await register("uno");
    second = await register("dos");
  });

  after(async () => {
    await client.stop();
    await closePrisma();
  });

  it("requires a valid shared allwain identity", async () => {
    const incident = await client.post("/allwain/tester/incidents", {
      category: "functionality",
      description: "El botón de comparación no actualiza el visor.",
      clientReference: `incident-anonymous-${Date.now()}`,
    });
    assert.equal(incident.status, 401);
    const incidents = await client.get("/allwain/tester/incidents");
    assert.equal(incidents.status, 401);
    const feedback = await client.get("/allwain/tester/feedback");
    assert.equal(feedback.status, 401);
  });

  it("exposes a PII-free locked app program before survey qualification", async () => {
    const state = await client.get("/allwain/tester/state", first.headers);
    assert.equal(state.status, 200);
    assert.equal(state.body.qualified, false);
    assert.deepEqual(state.body.profile, { preferredRole: null });
    assert.equal(state.body.program.id, "allwain-app-pilot-v1");
    assert.deepEqual(state.body.program.steps, [
      "access",
      "profile",
      "capture",
      "buy",
      "compare",
      "sell",
      "connector",
      "notifications",
      "delivery",
      "assistant",
      "accessibility",
      "support",
    ]);
    assert.ok(state.body.progress.items.every((item: any) => item.status === "pending"));
    assert.deepEqual(state.body.program.actionsPerStep, ["a1", "a2"]);
    assert.equal(state.body.program.totalActions, 24);
    assert.equal(state.body.progress.completedActionCount, 0);
    assert.equal(state.body.progress.totalActionCount, 24);
    assert.ok(state.body.progress.items.every(
      (item: any) => item.actions.length === 2 && item.totalActionCount === 2,
    ));
    assert.doesNotMatch(JSON.stringify(state.body), new RegExp(first.email, "i"));

    const blocked = await client.patch("/allwain/tester/progress/access", {
      status: "completed",
      platform: "android",
      clientReference: `progress-blocked-${Date.now()}`,
    }, first.headers);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, "TESTER_FEEDBACK_REQUIRED");

    const blockedAction = await client.patch("/allwain/tester/progress/access/actions/a1", {
      status: "completed",
      platform: "android",
      clientReference: `action-blocked-${Date.now()}`,
    }, first.headers);
    assert.equal(blockedAction.status, 403);
    assert.equal(blockedAction.body.error, "TESTER_FEEDBACK_REQUIRED");

    const blockedIncident = await client.post("/allwain/tester/incidents", {
      category: "functionality",
      description: "La sala no debe aceptar incidencias antes de la encuesta.",
      clientReference: `incident-blocked-${Date.now()}`,
    }, first.headers);
    assert.equal(blockedIncident.status, 403, JSON.stringify(blockedIncident.body));
    assert.equal(blockedIncident.body.error, "TESTER_FEEDBACK_REQUIRED");

    const blockedIncidentList = await client.get("/allwain/tester/incidents", first.headers);
    assert.equal(blockedIncidentList.status, 403, JSON.stringify(blockedIncidentList.body));
    assert.equal(blockedIncidentList.body.error, "TESTER_FEEDBACK_REQUIRED");
  });

  it("qualifies both testers before granting incident access", async () => {
    const firstFeedback = await client.post("/allwain/tester/feedback", {
      submissionId: firstQualificationReference,
      schemaVersion: 1,
      locale: "es",
      answers: { papel: "buyer" },
    }, first.headers);
    assert.equal(firstFeedback.status, 201, JSON.stringify(firstFeedback.body));

    const secondFeedback = await client.post("/allwain/tester/feedback", {
      submissionId: secondQualificationReference,
      schemaVersion: 1,
      locale: "es",
      answers: { papel: "seller" },
    }, second.headers);
    assert.equal(secondFeedback.status, 201, JSON.stringify(secondFeedback.body));

    const firstState = await client.get("/allwain/tester/state", first.headers);
    const secondState = await client.get("/allwain/tester/state", second.headers);
    assert.equal(firstState.body.qualified, true);
    assert.deepEqual(firstState.body.profile, { preferredRole: "buyer" });
    assert.equal(secondState.body.qualified, true);
    assert.deepEqual(secondState.body.profile, { preferredRole: "seller" });
  });

  it("creates a web incident in the existing support inbox and redacts contact fields", async () => {
    const created = await client.post(
      "/allwain/tester/incidents",
      {
        category: "accessibility",
        severity: "high",
        subject: "Contraste insuficiente en Comprar",
        description: "El texto pequeño pierde contraste sobre el fondo naranja.",
        steps: "Abrir Comprar, elegir 55 pulgadas y ampliar el texto.",
        screen: "comprar",
        locale: "es",
        release: "20260906-smart-pass-v1",
        clientReference: incidentReference,
      },
      first.headers,
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.deduplicated, false);
    assert.equal(created.body.incident.source, "web_tester");
    assert.equal(created.body.incident.messages[0].channel, "web");
    assert.equal(created.body.incident.messages[0].direction, "inbound");
    assert.doesNotMatch(JSON.stringify(created.body), new RegExp(first.email, "i"));
    assert.equal("requesterEmail" in created.body.incident, false);
    assert.equal("fromEmail" in created.body.incident.messages[0], false);
    incidentId = created.body.incident.id;

    const ticket = await prisma.allwainSupportTicket.findUnique({
      where: { id: created.body.incident.id },
      include: { messages: true },
    });
    assert.equal(ticket.requesterUserId, first.userId);
    assert.equal(ticket.source, "web_tester");
    assert.equal(ticket.automationDisposition, "human_review");
    assert.equal(ticket.messages[0].authorUserId, first.userId);
    assert.equal(ticket.messages[0].channel, "web");

    const audit = await prisma.allwainAuditEvent.findFirst({
      where: {
        aggregateType: "support_ticket",
        aggregateId: ticket.id,
        eventType: "support.web_tester_incident_created",
      },
    });
    assert.equal(audit.actorUserId, first.userId);
    assert.equal(audit.source, "web_tester");
  });

  it("deduplicates retries and isolates each tester's incident list", async () => {
    const retried = await client.post(
      "/allwain/tester/incidents",
      {
        category: "accessibility",
        severity: "high",
        subject: "Contraste insuficiente en Comprar",
        description: "El texto pequeño pierde contraste sobre el fondo naranja.",
        steps: "Abrir Comprar, elegir 55 pulgadas y ampliar el texto.",
        screen: "comprar",
        locale: "es",
        release: "20260906-smart-pass-v1",
        clientReference: incidentReference,
      },
      first.headers,
    );
    assert.equal(retried.status, 200);
    assert.equal(retried.body.deduplicated, true);

    const conflictingRetry = await client.post(
      "/allwain/tester/incidents",
      {
        category: "accessibility",
        severity: "high",
        description: "Esta descripción no coincide con la petición original.",
        screen: "comprar",
        clientReference: incidentReference,
      },
      first.headers,
    );
    assert.equal(conflictingRetry.status, 409);

    const mine = await client.get("/allwain/tester/incidents", first.headers);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.items.length, 1);
    const other = await client.get("/allwain/tester/incidents", second.headers);
    assert.equal(other.status, 200);
    assert.deepEqual(other.body.items, []);
  });

  it("stores structured feedback as an append-only, user-linked audit event", async () => {
    const body = {
      submissionId: feedbackReference,
      schemaVersion: 1,
      locale: "es",
      release: "20260906-smart-pass-v1",
      answers: {
        web_clara: "yes",
        propuesta_clara: "partial",
        preventa: "maybe",
        valor: "local_economy",
        sostenibilidad: "yes",
        tester: "yes",
        papel: "buyer",
      },
      comment: "El visor de compra debería permitir comparar dos propuestas.",
    };
    const created = await client.post("/allwain/tester/feedback", body, first.headers);
    assert.equal(created.status, 201);
    assert.equal(created.body.deduplicated, false);
    assert.equal(created.body.receipt.submissionId, feedbackReference);

    const retried = await client.post("/allwain/tester/feedback", body, first.headers);
    assert.equal(retried.status, 200);
    assert.equal(retried.body.deduplicated, true);
    assert.equal(retried.body.receipt.id, created.body.receipt.id);

    const conflictingRetry = await client.post(
      "/allwain/tester/feedback",
      { ...body, answers: { ...body.answers, tester: "maybe" } },
      first.headers,
    );
    assert.equal(conflictingRetry.status, 409);

    const mine = await client.get("/allwain/tester/feedback", first.headers);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.items.length, 2);
    assert.equal(
      mine.body.items.find((item: any) => item.submissionId === feedbackReference).answers.tester,
      "yes",
    );
    const other = await client.get("/allwain/tester/feedback", second.headers);
    assert.equal(other.status, 200);
    assert.equal(other.body.items.length, 1);
    assert.equal(other.body.items[0].submissionId, secondQualificationReference);

    const event = await prisma.allwainAuditEvent.findFirst({
      where: { aggregateType: "web_tester_feedback", aggregateId: feedbackReference },
    });
    assert.equal(event.actorUserId, first.userId);
    assert.equal(event.source, "web_tester");
    assert.equal(event.payload.locale, "es");
    assert.equal("email" in event.payload, false);
    assert.equal("name" in event.payload, false);

    const collision = await client.post("/allwain/tester/feedback", body, second.headers);
    assert.equal(collision.status, 409);
  });

  it("rejects unstructured or empty survey payloads", async () => {
    const invalid = await client.post(
      "/allwain/tester/feedback",
      {
        submissionId: `feedback-invalid-${Date.now()}`,
        answers: { web_clara: "un texto libre que no es una opción" },
      },
      first.headers,
    );
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "INVALID_TESTER_FEEDBACK_ANSWER");
  });

  it("persists idempotent app progress only after feedback qualification", async () => {
    const state = await client.get("/allwain/tester/state", first.headers);
    assert.equal(state.body.qualified, true);
    assert.deepEqual(state.body.profile, { preferredRole: "buyer" });

    const body = {
      status: "completed",
      platform: "android",
      appVersion: "1.0.0 (42)",
      clientReference: progressReference,
    };
    const completed = await client.patch(
      "/allwain/tester/progress/buy",
      body,
      first.headers,
    );
    assert.equal(completed.status, 200);
    assert.equal(completed.body.deduplicated, false);
    assert.equal(completed.body.progress.item.stepId, "buy");
    assert.doesNotMatch(JSON.stringify(completed.body), new RegExp(first.email, "i"));

    const retried = await client.patch(
      "/allwain/tester/progress/buy",
      body,
      first.headers,
    );
    assert.equal(retried.status, 200);
    assert.equal(retried.body.deduplicated, true);

    const row = await prisma.allwainAppTesterProgress.findUnique({
      where: {
        userId_programId_stepId: {
          userId: first.userId,
          programId: "allwain-app-pilot-v1",
          stepId: "buy",
        },
      },
    });
    assert.equal(row.status, "completed");
    assert.equal(row.platform, "android");
    assert.equal(row.clientReference, progressReference);
    const audit = await prisma.allwainAuditEvent.findFirst({
      where: {
        aggregateType: "app_tester_progress_request",
        aggregateId: progressReference,
        eventType: "app_tester.progress_completed",
      },
    });
    assert.equal(audit.actorUserId, first.userId);
    assert.equal(audit.payload.stepId, "buy");

    const accessibilityCompleted = await client.patch(
      "/allwain/tester/progress/accessibility",
      {
        ...body,
        clientReference: `${progressReference}-accessibility`,
      },
      first.headers,
    );
    assert.equal(accessibilityCompleted.status, 200);
    assert.equal(accessibilityCompleted.body.progress.item.stepId, "accessibility");

    const refreshed = await client.get("/allwain/tester/state", first.headers);
    assert.equal(refreshed.body.progress.completedCount, 2);
    assert.equal(
      refreshed.body.progress.items.find((item: any) => item.stepId === "buy").status,
      "completed",
    );
    assert.equal(
      refreshed.body.progress.items.find((item: any) => item.stepId === "accessibility").status,
      "completed",
    );
    assert.equal(refreshed.body.progress.completedActionCount, 4);
    assert.ok(refreshed.body.progress.items
      .find((item: any) => item.stepId === "buy")
      .actions.every((action: any) => action.status === "completed"));
  });

  it("persists audited, idempotent action marks and unmarks for all 24 action slots", async () => {
    const completedBody = {
      status: "completed",
      platform: "android",
      appVersion: "1.2.0 (57)",
      clientReference: actionReference,
    };
    const completed = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      completedBody,
      first.headers,
    );
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    assert.equal(completed.body.deduplicated, false);
    assert.equal(completed.body.progress.item.stepId, "buy");
    assert.equal(completed.body.progress.item.actionId, "a1");
    assert.equal(completed.body.progress.item.status, "completed");
    assert.ok(completed.body.progress.item.completedAt);
    assert.doesNotMatch(JSON.stringify(completed.body), new RegExp(first.email, "i"));

    const retried = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      completedBody,
      first.headers,
    );
    assert.equal(retried.status, 200);
    assert.equal(retried.body.deduplicated, true);

    const conflict = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      { ...completedBody, status: "pending" },
      first.headers,
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, "TESTER_ACTION_REFERENCE_CONFLICT");

    const crossUserConflict = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      completedBody,
      second.headers,
    );
    assert.equal(crossUserConflict.status, 409);
    assert.equal(crossUserConflict.body.error, "TESTER_ACTION_REFERENCE_CONFLICT");

    const unmarked = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      {
        status: "pending",
        platform: "ios",
        appVersion: "1.2.1",
        clientReference: `${actionReference}-pending`,
      },
      first.headers,
    );
    assert.equal(unmarked.status, 200);
    assert.equal(unmarked.body.progress.item.status, "pending");
    assert.equal(unmarked.body.progress.item.completedAt, null);

    const remarked = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      {
        status: "completed",
        platform: "ios",
        appVersion: "1.2.1",
        clientReference: `${actionReference}-remark`,
      },
      first.headers,
    );
    assert.equal(remarked.status, 200);

    const secondAction = await client.patch(
      "/allwain/tester/progress/buy/actions/a2",
      {
        status: "completed",
        platform: "ios",
        appVersion: "1.2.1",
        clientReference: `${actionReference}-second`,
      },
      first.headers,
    );
    assert.equal(secondAction.status, 200);

    const row = await prisma.allwainAppTesterActionProgress.findUnique({
      where: {
        userId_programId_stepId_actionId: {
          userId: first.userId,
          programId: "allwain-app-pilot-v1",
          stepId: "buy",
          actionId: "a1",
        },
      },
    });
    assert.equal(row.status, "completed");
    assert.equal(row.platform, "ios");
    assert.equal(row.clientReference, `${actionReference}-remark`);

    const audit = await prisma.allwainAuditEvent.findFirst({
      where: {
        aggregateType: "app_tester_action_request",
        aggregateId: actionReference,
        eventType: "app_tester.action_updated",
      },
    });
    assert.equal(audit.actorUserId, first.userId);
    assert.equal(audit.payload.stepId, "buy");
    assert.equal(audit.payload.actionId, "a1");
    assert.equal(audit.payload.status, "completed");
    assert.equal("email" in audit.payload, false);

    const state = await client.get("/allwain/tester/state", first.headers);
    const buy = state.body.progress.items.find((item: any) => item.stepId === "buy");
    assert.equal(state.body.progress.completedActionCount, 4);
    assert.equal(state.body.progress.totalActionCount, 24);
    assert.equal(buy.completedActionCount, 2);
    assert.equal(buy.totalActionCount, 2);
    assert.deepEqual(buy.actions.map((action: any) => action.actionId), ["a1", "a2"]);
    assert.ok(buy.actions.every((action: any) => action.status === "completed"));

    const otherState = await client.get("/allwain/tester/state", second.headers);
    assert.equal(otherState.body.progress.completedActionCount, 0);
    assert.doesNotMatch(JSON.stringify(otherState.body), new RegExp(first.email, "i"));
  });

  it("removes tester feedback and anonymizes tester support records on account deletion", async () => {
    await assert.rejects(
      prisma.allwainAuditEvent.deleteMany({
        where: {
          aggregateType: "web_tester_feedback",
          eventType: "web_tester.feedback_submitted",
          actorUserId: first.userId,
        },
      }),
    );
    await assert.rejects(
      prisma.allwainSupportMessage.updateMany({
        where: { ticketId: incidentId },
        data: { subject: "Mutación no autorizada" },
      }),
    );

    const deleted = await client.delete("/allwain/account", first.headers);
    assert.equal(deleted.status, 200);

    const ticket = await prisma.allwainSupportTicket.findUnique({
      where: { id: incidentId },
      include: { messages: true },
    });
    assert.equal(ticket.requesterUserId, null);
    assert.equal(ticket.requesterEmail, "deleted-web-tester@deleted.invalid");
    assert.equal(ticket.requesterName, null);
    assert.equal(ticket.subject, "Incidencia web anonimizada");
    assert.equal(ticket.aiSummary, null);
    assert.equal(ticket.status, "closed");
    assert.equal(ticket.messages[0].authorUserId, null);
    assert.equal(ticket.messages[0].fromEmail, "deleted-web-tester@deleted.invalid");
    assert.equal(ticket.messages[0].toEmail, "deleted-web-tester@deleted.invalid");
    assert.equal(ticket.messages[0].bodyText, "Contenido eliminado al borrar la cuenta.");
    assert.equal(ticket.messages[0].providerMessageId, null);

    const feedback = await prisma.allwainAuditEvent.findFirst({
      where: {
        aggregateType: "web_tester_feedback",
        eventType: "web_tester.feedback_submitted",
        actorUserId: first.userId,
      },
    });
    assert.equal(feedback, null);
    const testerProgress = await prisma.allwainAppTesterProgress.findMany({
      where: { userId: first.userId },
    });
    assert.deepEqual(testerProgress, []);
    const testerActionProgress = await prisma.allwainAppTesterActionProgress.findMany({
      where: { userId: first.userId },
    });
    assert.deepEqual(testerActionProgress, []);
    const progressAudit = await prisma.allwainAuditEvent.findFirst({
      where: {
        aggregateType: "app_tester_progress_request",
        eventType: "app_tester.progress_completed",
        actorUserId: first.userId,
      },
    });
    assert.equal(progressAudit, null);
    const actionAudit = await prisma.allwainAuditEvent.findFirst({
      where: {
        aggregateType: "app_tester_action_request",
        eventType: "app_tester.action_updated",
        actorUserId: first.userId,
      },
    });
    assert.equal(actionAudit, null);
    const secondTesterFeedback = await prisma.allwainAuditEvent.findFirst({
      where: {
        aggregateType: "web_tester_feedback",
        eventType: "web_tester.feedback_submitted",
        actorUserId: second.userId,
      },
    });
    assert.ok(secondTesterFeedback);
    const incidentAudit = await prisma.allwainAuditEvent.findFirst({
      where: {
        aggregateType: "support_ticket",
        aggregateId: incidentId,
        eventType: "support.web_tester_incident_created",
      },
    });
    assert.ok(incidentAudit);
    assert.equal("comment" in incidentAudit.payload, false);
  });
});
