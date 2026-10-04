import assert from "node:assert";
import { after, before, describe, it, mock } from "node:test";

import { TestClient } from "./helpers/test-client";

const envModule = require("../src/config/env") as typeof import("../src/config/env");
const prismaModule = require("../src/db/prisma") as typeof import("../src/db/prisma");
const authModule = require("../src/services/auth-session.service") as typeof import("../src/services/auth-session.service");

(envModule.ENV as any).STORAGE_DRIVER = "postgres";

const users = [
  { id: "tester-user-a", name: "Tester Uno", email: "tester-a@test.local", deletedAt: null },
  { id: "tester-user-b", name: "Tester Dos", email: "tester-b@test.local", deletedAt: null },
];
const tickets: any[] = [];
const messages: any[] = [];
const auditEvents: any[] = [];
const appTesterProgress: any[] = [];
const appTesterActionProgress: any[] = [];
let serial = 0;
let failNextAuditCreate = false;

const emptyDeleteModel = {
  deleteMany: async () => ({ count: 0 }),
};
const emptyUpdateModel = {
  updateMany: async () => ({ count: 0 }),
};

function nextId(prefix: string) {
  serial += 1;
  return `${prefix}-${String(serial).padStart(4, "0")}`;
}

function whereMatches(row: any, where: Record<string, any> | undefined) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    return row[key] === value;
  });
}

function ticketWithMessages(ticket: any) {
  return ticket
    ? { ...ticket, messages: messages.filter((message) => message.ticketId === ticket.id) }
    : null;
}

const fakePrisma: any = {
  user: {
    findUnique: async ({ where }: any) => users.find((user) => user.id === where.id) || null,
    update: async ({ where, data }: any) => {
      const user: any = users.find((item) => item.id === where.id);
      if (!user) throw new Error("USER_NOT_FOUND");
      Object.assign(user, data, {
        tokenVersion: typeof data.tokenVersion?.increment === "number"
          ? Number(user.tokenVersion || 0) + data.tokenVersion.increment
          : data.tokenVersion ?? user.tokenVersion,
      });
      return user;
    },
  },
  allwainOrder: { count: async () => 0 },
  trade: { count: async () => 0 },
  offer: {
    findMany: async () => [],
    update: async () => null,
  },
  allwainSupportTicket: {
    create: async ({ data }: any) => {
      const now = data.lastMessageAt || new Date();
      const row = {
        id: nextId("ticket"),
        ...data,
        assignedAdminUserId: null,
        autoResolvedAt: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      tickets.push(row);
      return row;
    },
    findUnique: async ({ where, include }: any) => {
      const row = tickets.find((ticket) => ticket.id === where.id) || null;
      return include?.messages ? ticketWithMessages(row) : row;
    },
    findMany: async ({ where, take }: any) => {
      const found = tickets.filter((ticket) => whereMatches(ticket, where));
      return (typeof take === "number" ? found.slice(0, take) : found).map(ticketWithMessages);
    },
    updateMany: async ({ where, data }: any) => {
      const ids = new Set(where?.id?.in || []);
      let count = 0;
      tickets.forEach((ticket) => {
        if (ids.size && !ids.has(ticket.id)) return;
        Object.assign(ticket, data);
        count += 1;
      });
      return { count };
    },
  },
  allwainSupportMessage: {
    create: async ({ data }: any) => {
      const row = {
        id: nextId("message"),
        ...data,
        sentAt: null,
        createdAt: data.createdAt || new Date(),
      };
      messages.push(row);
      return row;
    },
    findUnique: async ({ where, include }: any) => {
      const row = messages.find(
        (message) => message.providerMessageId === where.providerMessageId,
      );
      if (!row) return null;
      return include?.ticket
        ? { ...row, ticket: ticketWithMessages(tickets.find((ticket) => ticket.id === row.ticketId)) }
        : row;
    },
    updateMany: async ({ where, data }: any) => {
      const ids = new Set(where?.ticketId?.in || []);
      let count = 0;
      messages.forEach((message) => {
        if (ids.size && !ids.has(message.ticketId)) return;
        Object.assign(message, data);
        count += 1;
      });
      return { count };
    },
  },
  allwainAppTesterProgress: {
    findMany: async ({ where }: any) => appTesterProgress.filter((row) => whereMatches(row, where)),
    findUnique: async ({ where }: any) => {
      const key = where.userId_programId_stepId;
      return appTesterProgress.find((row) =>
        row.userId === key.userId && row.programId === key.programId && row.stepId === key.stepId,
      ) || null;
    },
    upsert: async ({ where, create, update }: any) => {
      const key = where.userId_programId_stepId;
      const existing = appTesterProgress.find((row) =>
        row.userId === key.userId && row.programId === key.programId && row.stepId === key.stepId,
      );
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const now = new Date();
      const row = {
        id: nextId("app-progress"),
        ...create,
        createdAt: now,
        updatedAt: now,
      };
      appTesterProgress.push(row);
      return row;
    },
    deleteMany: async ({ where }: any) => {
      let count = 0;
      for (let index = appTesterProgress.length - 1; index >= 0; index -= 1) {
        if (!whereMatches(appTesterProgress[index], where)) continue;
        appTesterProgress.splice(index, 1);
        count += 1;
      }
      return { count };
    },
  },
  allwainAppTesterActionProgress: {
    findMany: async ({ where }: any) =>
      appTesterActionProgress.filter((row) => whereMatches(row, where)),
    findUnique: async ({ where }: any) => {
      const key = where.userId_programId_stepId_actionId;
      return appTesterActionProgress.find((row) =>
        row.userId === key.userId &&
        row.programId === key.programId &&
        row.stepId === key.stepId &&
        row.actionId === key.actionId,
      ) || null;
    },
    upsert: async ({ where, create, update }: any) => {
      const key = where.userId_programId_stepId_actionId;
      const existing = appTesterActionProgress.find((row) =>
        row.userId === key.userId &&
        row.programId === key.programId &&
        row.stepId === key.stepId &&
        row.actionId === key.actionId,
      );
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const now = new Date();
      const row = {
        id: nextId("app-action-progress"),
        ...create,
        createdAt: now,
        updatedAt: now,
      };
      appTesterActionProgress.push(row);
      return row;
    },
    deleteMany: async ({ where }: any) => {
      let count = 0;
      for (let index = appTesterActionProgress.length - 1; index >= 0; index -= 1) {
        if (!whereMatches(appTesterActionProgress[index], where)) continue;
        appTesterActionProgress.splice(index, 1);
        count += 1;
      }
      return { count };
    },
  },
  allwainAuditEvent: {
    findFirst: async ({ where, orderBy }: any) => {
      const found = auditEvents.filter((event) => whereMatches(event, where));
      if (orderBy?.sequence === "desc") found.sort((a, b) => b.sequence - a.sequence);
      return found[0] || null;
    },
    findMany: async ({ where, take }: any) => auditEvents
      .filter((event) => whereMatches(event, where))
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, take),
    create: async ({ data }: any) => {
      if (failNextAuditCreate) {
        failNextAuditCreate = false;
        throw new Error("SIMULATED_AUDIT_FAILURE");
      }
      const row = { id: nextId("audit"), occurredAt: new Date(), ...data };
      auditEvents.push(row);
      return row;
    },
    deleteMany: async ({ where }: any) => {
      let count = 0;
      for (let index = auditEvents.length - 1; index >= 0; index -= 1) {
        if (!whereMatches(auditEvents[index], where)) continue;
        auditEvents.splice(index, 1);
        count += 1;
      }
      return { count };
    },
  },
  authIdentity: emptyDeleteModel,
  trueqiaTesterAction: emptyDeleteModel,
  trueqiaTesterIncident: emptyDeleteModel,
  authSession: emptyDeleteModel,
  allwainBuyerProfile: emptyDeleteModel,
  allwainSellerProfile: emptyDeleteModel,
  allwainConnectorProfile: emptyDeleteModel,
  allwainBuyerPaymentProfile: emptyDeleteModel,
  allwainNotification: emptyDeleteModel,
  chatParticipant: emptyDeleteModel,
  chatBlock: emptyDeleteModel,
  trueqiaChatMessage: emptyUpdateModel,
  passwordResetToken: emptyDeleteModel,
  allwainScanRequest: emptyUpdateModel,
  allwainSellerPaymentAccount: emptyUpdateModel,
  // This fixture owns no publications; the deletion transaction now locks
  // current owned rows before its open-operation checks.
  $queryRaw: async () => [],
  $executeRaw: async () => 1,
  $transaction: async (operation: any) => {
    if (typeof operation === "function") {
      const lengths = {
        tickets: tickets.length,
        messages: messages.length,
        auditEvents: auditEvents.length,
        appTesterProgress: appTesterProgress.length,
        appTesterActionProgress: appTesterActionProgress.length,
      };
      try {
        return await operation(fakePrisma);
      } catch (error) {
        tickets.splice(lengths.tickets);
        messages.splice(lengths.messages);
        auditEvents.splice(lengths.auditEvents);
        appTesterProgress.splice(lengths.appTesterProgress);
        appTesterActionProgress.splice(lengths.appTesterActionProgress);
        throw error;
      }
    }
    return Promise.all(operation);
  },
};

mock.method(prismaModule, "getPrisma", () => fakePrisma);
mock.method(authModule, "resolveAccessToken", async (token: string) => {
  const user = token === "token-a" ? users[0] : token === "token-b" ? users[1] : null;
  if (!user) throw new Error("INVALID_TOKEN");
  return {
    id: user.id,
    email: user.email,
    role: "buyer" as const,
    sessionId: `session-${user.id}`,
    sourceApp: "allwain" as const,
  };
});

const { app } = require("../src/server") as typeof import("../src/server");
const client = new TestClient(app);
const firstHeaders = { Authorization: "Bearer token-a" };
const secondHeaders = { Authorization: "Bearer token-b" };

describe("allwain web tester HTTP routes", () => {
  before(async () => {
    await client.start();
  });

  after(async () => {
    await client.stop();
    mock.restoreAll();
  });

  it("rejects anonymous access", async () => {
    const response = await client.get("/allwain/tester/incidents");
    assert.equal(response.status, 401);
    const creation = await client.post("/allwain/tester/incidents", {
      category: "functionality",
      description: "Una persona anónima no debe poder crear incidencias.",
      clientReference: "incident-http-anonymous-0001",
    });
    assert.equal(creation.status, 401);
    const state = await client.get("/allwain/tester/state");
    assert.equal(state.status, 401);
    const action = await client.patch("/allwain/tester/progress/access/actions/a1", {
      status: "completed",
      platform: "android",
      clientReference: "action-http-anonymous-0001",
    });
    assert.equal(action.status, 401);
  });

  it("keeps the app tester room locked until authenticated survey feedback exists", async () => {
    const state = await client.get("/allwain/tester/state", firstHeaders);
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
    assert.equal(state.body.progress.items.length, 12);
    assert.ok(state.body.progress.items.every((item: any) => item.status === "pending"));
    assert.deepEqual(state.body.program.actionsPerStep, ["a1", "a2"]);
    assert.equal(state.body.program.totalActions, 24);
    assert.equal(state.body.progress.completedActionCount, 0);
    assert.equal(state.body.progress.totalActionCount, 24);
    assert.ok(state.body.progress.items.every(
      (item: any) => item.actions.length === 2 && item.totalActionCount === 2,
    ));

    const blocked = await client.patch("/allwain/tester/progress/access", {
      status: "completed",
      platform: "android",
      appVersion: "1.0.0",
      clientReference: "progress-http-blocked-0001",
    }, firstHeaders);
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
    assert.equal(blocked.body.error, "TESTER_FEEDBACK_REQUIRED");

    const blockedAction = await client.patch("/allwain/tester/progress/access/actions/a1", {
      status: "completed",
      platform: "android",
      appVersion: "1.0.0",
      clientReference: "action-http-blocked-0001",
    }, firstHeaders);
    assert.equal(blockedAction.status, 403, JSON.stringify(blockedAction.body));
    assert.equal(blockedAction.body.error, "TESTER_FEEDBACK_REQUIRED");

    const blockedIncident = await client.post("/allwain/tester/incidents", {
      category: "functionality",
      description: "La prueba todavía no debería aceptar incidencias.",
      clientReference: "incident-http-blocked-0001",
    }, firstHeaders);
    assert.equal(blockedIncident.status, 403, JSON.stringify(blockedIncident.body));
    assert.equal(blockedIncident.body.error, "TESTER_FEEDBACK_REQUIRED");

    const blockedIncidentList = await client.get("/allwain/tester/incidents", firstHeaders);
    assert.equal(blockedIncidentList.status, 403, JSON.stringify(blockedIncidentList.body));
    assert.equal(blockedIncidentList.body.error, "TESTER_FEEDBACK_REQUIRED");
    assert.equal(tickets.length, 0);
    assert.equal(messages.length, 0);
  });

  it("qualifies each tester with survey feedback before incident access", async () => {
    const first = await client.post("/allwain/tester/feedback", {
      submissionId: "feedback-http-qualification-a-0001",
      schemaVersion: 1,
      locale: "es",
      answers: { papel: "buyer" },
    }, firstHeaders);
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const second = await client.post("/allwain/tester/feedback", {
      submissionId: "feedback-http-qualification-b-0001",
      schemaVersion: 1,
      locale: "es",
      answers: { papel: "seller" },
    }, secondHeaders);
    assert.equal(second.status, 201, JSON.stringify(second.body));

    const firstState = await client.get("/allwain/tester/state", firstHeaders);
    const secondState = await client.get("/allwain/tester/state", secondHeaders);
    assert.equal(firstState.body.qualified, true);
    assert.deepEqual(firstState.body.profile, { preferredRole: "buyer" });
    assert.equal(secondState.body.qualified, true);
    assert.deepEqual(secondState.body.profile, { preferredRole: "seller" });
  });

  it("creates, redacts, deduplicates and isolates an incident", async () => {
    const body = {
      category: "accessibility",
      severity: "high",
      description: "No distingo el texto sobre la tarjeta naranja.",
      screen: "comprar",
      locale: "es",
      release: "smart-pass-v1",
      clientReference: "incident-http-0001",
      target: "app",
      stepId: "buy",
      platform: "android",
      appVersion: "1.0.0",
    };
    const created = await client.post("/allwain/tester/incidents", body, firstHeaders);
    assert.equal(created.status, 201);
    assert.equal(created.body.incident.source, "web_tester");
    assert.equal(created.body.incident.messages[0].channel, "web");
    assert.deepEqual(created.body.incident.context, {
      target: "app",
      stepId: "buy",
      platform: "android",
      appVersion: "1.0.0",
    });
    assert.doesNotMatch(JSON.stringify(created.body), /tester-a@test\.local/i);

    const retried = await client.post("/allwain/tester/incidents", body, firstHeaders);
    assert.equal(retried.status, 200);
    assert.equal(retried.body.deduplicated, true);

    const conflictingRetry = await client.post(
      "/allwain/tester/incidents",
      { ...body, description: "La misma referencia ahora describe un problema diferente." },
      firstHeaders,
    );
    assert.equal(conflictingRetry.status, 409);

    const mine = await client.get("/allwain/tester/incidents", firstHeaders);
    const other = await client.get("/allwain/tester/incidents", secondHeaders);
    assert.equal(mine.body.items.length, 1);
    assert.equal(other.body.items.length, 0);
    assert.equal(tickets[0].requesterUserId, users[0].id);
    assert.equal(messages[0].authorUserId, users[0].id);
    assert.equal(auditEvents[0].source, "web_tester");
  });

  it("rolls back the whole incident when its audit event cannot be stored", async () => {
    const before = {
      tickets: tickets.length,
      messages: messages.length,
      auditEvents: auditEvents.length,
    };
    const body = {
      category: "functionality",
      description: "El visor no conserva la opción seleccionada durante la prueba.",
      clientReference: "incident-http-atomic-0001",
    };
    failNextAuditCreate = true;
    const failed = await client.post("/allwain/tester/incidents", body, firstHeaders);
    assert.equal(failed.status, 500);
    assert.equal(tickets.length, before.tickets);
    assert.equal(messages.length, before.messages);
    assert.equal(auditEvents.length, before.auditEvents);

    const retried = await client.post("/allwain/tester/incidents", body, firstHeaders);
    assert.equal(retried.status, 201);
    assert.equal(retried.body.deduplicated, false);
    assert.equal(tickets.length, before.tickets + 1);
    assert.equal(messages.length, before.messages + 1);
    assert.equal(auditEvents.length, before.auditEvents + 1);
  });

  it("requires an idempotency reference for every incident", async () => {
    const response = await client.post(
      "/allwain/tester/incidents",
      { category: "functionality", description: "El visor no responde al tocar el botón." },
      firstHeaders,
    );
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "TESTER_CLIENT_REFERENCE_REQUIRED");
  });

  it("stores structured feedback, handles retries and keeps it private per user", async () => {
    const body = {
      submissionId: "feedback-http-0001",
      schemaVersion: 1,
      locale: "es",
      release: "smart-pass-v1",
      answers: { web_clara: "yes", tester: "yes", papel: "buyer" },
      comment: "Compararía dos ofertas a la vez.",
    };
    const created = await client.post("/allwain/tester/feedback", body, firstHeaders);
    assert.equal(created.status, 201);
    const retried = await client.post("/allwain/tester/feedback", body, firstHeaders);
    assert.equal(retried.status, 200);
    assert.equal(retried.body.receipt.id, created.body.receipt.id);

    const conflictingRetry = await client.post(
      "/allwain/tester/feedback",
      { ...body, answers: { ...body.answers, tester: "maybe" } },
      firstHeaders,
    );
    assert.equal(conflictingRetry.status, 409);

    const mine = await client.get("/allwain/tester/feedback", firstHeaders);
    const other = await client.get("/allwain/tester/feedback", secondHeaders);
    assert.equal(mine.body.items.length, 2);
    assert.equal(
      mine.body.items.find((item: any) => item.submissionId === body.submissionId).answers.tester,
      "yes",
    );
    assert.equal(other.body.items.length, 1);
    assert.equal(other.body.items[0].submissionId, "feedback-http-qualification-b-0001");
    const event = auditEvents.find((item) => item.aggregateType === "web_tester_feedback");
    assert.equal(event.actorUserId, users[0].id);
    assert.equal("email" in event.payload, false);

    const collision = await client.post("/allwain/tester/feedback", body, secondHeaders);
    assert.equal(collision.status, 409);
  });

  it("upserts app tester progress idempotently after the survey and returns no PII", async () => {
    const firstBody = {
      status: "completed",
      platform: "android",
      appVersion: "1.0.0 (42)",
      clientReference: "progress-http-0001",
    };
    const created = await client.patch(
      "/allwain/tester/progress/buy",
      firstBody,
      firstHeaders,
    );
    assert.equal(created.status, 200);
    assert.equal(created.body.deduplicated, false);
    assert.equal(created.body.progress.item.stepId, "buy");
    assert.equal(created.body.progress.item.platform, "android");
    assert.doesNotMatch(JSON.stringify(created.body), /tester-a@test\.local/i);

    const retried = await client.patch(
      "/allwain/tester/progress/buy",
      firstBody,
      firstHeaders,
    );
    assert.equal(retried.status, 200);
    assert.equal(retried.body.deduplicated, true);
    assert.equal(appTesterProgress.length, 1);

    const conflict = await client.patch(
      "/allwain/tester/progress/buy",
      { ...firstBody, platform: "ios" },
      firstHeaders,
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, "TESTER_PROGRESS_REFERENCE_CONFLICT");

    const updated = await client.patch(
      "/allwain/tester/progress/buy",
      {
        status: "completed",
        platform: "ios",
        appVersion: "1.0.1",
        clientReference: "progress-http-0002",
      },
      firstHeaders,
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.progress.item.platform, "ios");
    assert.equal(appTesterProgress.length, 1);

    const state = await client.get("/allwain/tester/state", firstHeaders);
    assert.equal(state.body.qualified, true);
    assert.deepEqual(state.body.profile, { preferredRole: "buyer" });
    assert.equal(state.body.progress.completedCount, 1);
    assert.equal(state.body.progress.totalCount, 12);
    const buy = state.body.progress.items.find((item: any) => item.stepId === "buy");
    assert.equal(buy.appVersion, "1.0.1");
    assert.equal(state.body.progress.completedActionCount, 2);
    assert.equal(buy.completedActionCount, 2);
    assert.ok(buy.actions.every((action: any) => action.status === "completed"));
    assert.doesNotMatch(JSON.stringify(state.body), /tester-a@test\.local/i);
  });

  it("marks and unmarks each stable app action idempotently without changing route progress", async () => {
    const completedBody = {
      status: "completed",
      platform: "android",
      appVersion: "1.2.0 (57)",
      clientReference: "action-http-buy-a1-0001",
    };
    const completed = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      completedBody,
      firstHeaders,
    );
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    assert.equal(completed.body.deduplicated, false);
    assert.deepEqual(completed.body.progress.item, {
      stepId: "buy",
      actionId: "a1",
      status: "completed",
      platform: "android",
      appVersion: "1.2.0 (57)",
      completedAt: completed.body.progress.item.completedAt,
      updatedAt: completed.body.progress.item.updatedAt,
    });
    assert.ok(completed.body.progress.item.completedAt);
    assert.doesNotMatch(JSON.stringify(completed.body), /tester-a@test\.local/i);

    const retried = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      completedBody,
      firstHeaders,
    );
    assert.equal(retried.status, 200);
    assert.equal(retried.body.deduplicated, true);
    assert.equal(appTesterActionProgress.length, 1);

    const conflict = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      { ...completedBody, status: "pending" },
      firstHeaders,
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, "TESTER_ACTION_REFERENCE_CONFLICT");

    const crossUserConflict = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      completedBody,
      secondHeaders,
    );
    assert.equal(crossUserConflict.status, 409);
    assert.equal(crossUserConflict.body.error, "TESTER_ACTION_REFERENCE_CONFLICT");

    const unmarked = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      {
        status: "pending",
        platform: "ios",
        appVersion: "1.2.1",
        clientReference: "action-http-buy-a1-0002",
      },
      firstHeaders,
    );
    assert.equal(unmarked.status, 200);
    assert.equal(unmarked.body.progress.item.status, "pending");
    assert.equal(unmarked.body.progress.item.completedAt, null);
    assert.equal(appTesterActionProgress.length, 1);

    const markedAgain = await client.patch(
      "/allwain/tester/progress/buy/actions/a1",
      {
        status: "completed",
        platform: "ios",
        appVersion: "1.2.1",
        clientReference: "action-http-buy-a1-0003",
      },
      firstHeaders,
    );
    assert.equal(markedAgain.status, 200);

    const secondAction = await client.patch(
      "/allwain/tester/progress/buy/actions/a2",
      {
        status: "completed",
        platform: "ios",
        appVersion: "1.2.1",
        clientReference: "action-http-buy-a2-0001",
      },
      firstHeaders,
    );
    assert.equal(secondAction.status, 200);

    const state = await client.get("/allwain/tester/state", firstHeaders);
    const buy = state.body.progress.items.find((item: any) => item.stepId === "buy");
    assert.equal(state.body.progress.completedActionCount, 2);
    assert.equal(state.body.progress.totalActionCount, 24);
    assert.equal(buy.completedActionCount, 2);
    assert.equal(buy.totalActionCount, 2);
    assert.deepEqual(buy.actions.map((action: any) => action.actionId), ["a1", "a2"]);
    assert.ok(buy.actions.every((action: any) => action.status === "completed"));
    assert.equal(buy.status, "completed");

    const otherState = await client.get("/allwain/tester/state", secondHeaders);
    assert.equal(otherState.body.progress.completedActionCount, 0);
    assert.ok(otherState.body.progress.items.every(
      (item: any) => item.actions.every((action: any) => action.status === "pending"),
    ));

    const audit = auditEvents.find(
      (event) => event.aggregateType === "app_tester_action_request" &&
        event.aggregateId === completedBody.clientReference,
    );
    assert.equal(audit.eventType, "app_tester.action_updated");
    assert.equal(audit.actorUserId, users[0].id);
    assert.equal(audit.payload.stepId, "buy");
    assert.equal(audit.payload.actionId, "a1");
    assert.equal("email" in audit.payload, false);
  });

  it("rolls back action progress when its audit mutation cannot be stored", async () => {
    const before = appTesterActionProgress.length;
    const body = {
      status: "completed",
      platform: "android",
      clientReference: "action-http-support-a1-0001",
    };
    failNextAuditCreate = true;
    const failed = await client.patch(
      "/allwain/tester/progress/support/actions/a1",
      body,
      firstHeaders,
    );
    assert.equal(failed.status, 500);
    assert.equal(appTesterActionProgress.length, before);

    const retried = await client.patch(
      "/allwain/tester/progress/support/actions/a1",
      body,
      firstHeaders,
    );
    assert.equal(retried.status, 200);
    assert.equal(retried.body.deduplicated, false);
    assert.equal(appTesterActionProgress.length, before + 1);
  });

  it("rejects unknown action ids and arbitrary action metadata", async () => {
    const unknown = await client.patch("/allwain/tester/progress/buy/actions/a3", {
      status: "completed",
      platform: "android",
      clientReference: "action-http-invalid-id-0001",
    }, firstHeaders);
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error, "INVALID_TESTER_ACTION");

    const privateField = await client.patch("/allwain/tester/progress/buy/actions/a1", {
      status: "completed",
      platform: "android",
      clientReference: "action-http-private-key-0001",
      address: "dato que no debe almacenarse",
    }, firstHeaders);
    assert.equal(privateField.status, 400);
    assert.equal(privateField.body.error, "INVALID_TESTER_ACTION_KEY");
  });

  it("erases tester feedback and anonymizes tester incidents when the account is deleted", async () => {
    const firstTicketIds = tickets
      .filter((ticket) => ticket.requesterUserId === users[0].id && ticket.source === "web_tester")
      .map((ticket) => ticket.id);
    assert.ok(firstTicketIds.length >= 2);
    assert.ok(auditEvents.some(
      (event) => event.aggregateType === "web_tester_feedback" && event.actorUserId === users[0].id,
    ));
    assert.ok(appTesterProgress.some((item) => item.userId === users[0].id));
    assert.ok(appTesterActionProgress.some((item) => item.userId === users[0].id));
    assert.ok(auditEvents.some(
      (event) => event.aggregateType === "app_tester_progress_request" &&
        event.actorUserId === users[0].id,
    ));
    assert.ok(auditEvents.some(
      (event) => event.aggregateType === "app_tester_action_request" &&
        event.actorUserId === users[0].id,
    ));

    const response = await client.delete("/allwain/account", firstHeaders);
    assert.equal(response.status, 200);
    const anonymizedTickets = tickets.filter((ticket) => firstTicketIds.includes(ticket.id));
    assert.ok(anonymizedTickets.every((ticket) => ticket.requesterUserId === null));
    assert.ok(anonymizedTickets.every(
      (ticket) => ticket.requesterEmail === "deleted-web-tester@deleted.invalid",
    ));
    assert.ok(anonymizedTickets.every((ticket) => ticket.requesterName === null));
    assert.ok(anonymizedTickets.every((ticket) => ticket.subject === "Incidencia web anonimizada"));
    const anonymizedMessages = messages.filter((message) => firstTicketIds.includes(message.ticketId));
    assert.ok(anonymizedMessages.every((message) => message.authorUserId === null));
    assert.ok(anonymizedMessages.every(
      (message) => message.bodyText === "Contenido eliminado al borrar la cuenta.",
    ));
    assert.ok(anonymizedMessages.every((message) => message.providerMessageId === null));
    assert.equal(auditEvents.some(
      (event) => event.aggregateType === "web_tester_feedback" && event.actorUserId === users[0].id,
    ), false);
    assert.equal(appTesterProgress.some((item) => item.userId === users[0].id), false);
    assert.equal(appTesterActionProgress.some((item) => item.userId === users[0].id), false);
    assert.equal(auditEvents.some(
      (event) => event.aggregateType === "app_tester_progress_request" &&
        event.actorUserId === users[0].id,
    ), false);
    assert.equal(auditEvents.some(
      (event) => event.aggregateType === "app_tester_action_request" &&
        event.actorUserId === users[0].id,
    ), false);
    assert.ok(auditEvents.some(
      (event) => event.aggregateType === "support_ticket" && firstTicketIds.includes(event.aggregateId),
    ));
  });
});
