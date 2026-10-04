import assert from "node:assert";
import { after, before, describe, it } from "node:test";

import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

describe("Allwain direct contact requests", () => {
  let senderToken: string;
  let receiverToken: string;
  let outsiderToken: string;
  let senderId: string;
  let receiverId: string;
  let outsiderId: string;
  let conversationId: string;
  let initialMessageId: string;

  before(async () => {
    await client.start();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sender = await client.post("/auth/register", {
      name: "Allwain Direct Sender",
      email: `allwain-direct-sender+${suffix}@test.local`,
      password: "DirectChatTest123!",
      sourceApp: "allwain",
    });
    const receiver = await client.post("/auth/register", {
      name: "Allwain Direct Receiver",
      email: `allwain-direct-receiver+${suffix}@test.local`,
      password: "DirectChatTest123!",
      sourceApp: "allwain",
    });
    const outsider = await client.post("/auth/register", {
      name: "Allwain Direct Outsider",
      email: `allwain-direct-outsider+${suffix}@test.local`,
      password: "DirectChatTest123!",
      sourceApp: "allwain",
    });
    senderToken = sender.body.token;
    receiverToken = receiver.body.token;
    outsiderToken = outsider.body.token;
    senderId = sender.body.user.id;
    receiverId = receiver.body.user.id;
    outsiderId = outsider.body.user.id;
  });

  after(async () => {
    await client.stop();
  });

  it("rejects self-contact", async () => {
    const response = await client.post(
      `/chat/allwain/direct/${senderId}`,
      { text: "No debo poder enviarme esto." },
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "DIRECT_CHAT_SELF_FORBIDDEN");
  });

  it("keeps video calls hidden until a LiveKit provider is configured", async () => {
    const capability = await client.get("/chat/allwain/video-capability", {
      Authorization: `Bearer ${senderToken}`,
    });
    assert.equal(capability.status, 200);
    assert.deepEqual(capability.body, {
      enabled: false,
      provider: "livekit",
      recording: false,
      endToEndEncryptionPlanned: true,
    });

    const token = await client.post(
      "/chat/allwain/conversations/not-configured/video-token",
      {},
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(token.status, 503);
    assert.equal(token.body.error, "VIDEO_CALL_NOT_CONFIGURED");
  });

  it("creates one pending request with an initial message", async () => {
    const response = await client.post(
      `/chat/allwain/direct/${receiverId}`,
      { text: "Hola, quisiera preguntarte por esta oferta." },
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(response.status, 201);
    assert.equal(response.body.created, true);
    assert.equal(response.body.conversation.contextType, "direct");
    assert.equal(response.body.conversation.status, "pending");
    assert.equal(response.body.conversation.requestDirection, "outgoing");
    assert.equal(response.body.conversation.canSend, false);
    assert.equal(response.body.message.text, "Hola, quisiera preguntarte por esta oferta.");
    conversationId = response.body.conversation.id;
    initialMessageId = response.body.message.id;

    const repeated = await client.post(
      `/chat/allwain/direct/${receiverId}`,
      { text: "No debe crear otra solicitud." },
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(repeated.status, 409);
    assert.equal(repeated.body.error, "CHAT_REQUEST_PENDING");
  });

  it("shows the request to the recipient and keeps outsiders out", async () => {
    const list = await client.get("/chat/allwain/conversations", {
      Authorization: `Bearer ${receiverToken}`,
    });
    const incoming = list.body.items.find((item: any) => item.id === conversationId);
    assert.ok(incoming);
    assert.equal(incoming.requestDirection, "incoming");
    assert.equal(incoming.canAccept, true);
    assert.equal(incoming.unreadCount, 1);

    const outsider = await client.get(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages`,
      { Authorization: `Bearer ${outsiderToken}` },
    );
    assert.equal(outsider.status, 404);
    assert.equal(outsider.body.error, "CHAT_NOT_FOUND");

    const outsiderTranslation = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(initialMessageId)}/translate`,
      { targetLocale: "en" },
      { Authorization: `Bearer ${outsiderToken}` },
    );
    assert.equal(outsiderTranslation.status, 404);
    assert.equal(outsiderTranslation.body.error, "CHAT_NOT_FOUND");
  });

  it("allows only the recipient to accept", async () => {
    const senderAttempt = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/request-response`,
      { decision: "accept" },
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(senderAttempt.status, 422);
    assert.equal(senderAttempt.body.error, "CHAT_REQUEST_NOT_RECIPIENT");

    const accepted = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/request-response`,
      { decision: "accept" },
      { Authorization: `Bearer ${receiverToken}` },
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, "active");
    assert.equal(accepted.body.canSend, true);
    assert.equal(accepted.body.requestDirection, null);
  });

  it("reuses the active conversation and persists both directions", async () => {
    const receiverMessage = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages`,
      { text: "Claro, dime qué necesitas." },
      { Authorization: `Bearer ${receiverToken}` },
    );
    assert.equal(receiverMessage.status, 201);

    const fromAnotherCard = await client.post(
      `/chat/allwain/direct/${receiverId}`,
      { text: "Necesito conocer el plazo de entrega." },
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(fromAnotherCard.status, 200);
    assert.equal(fromAnotherCard.body.created, false);
    assert.equal(fromAnotherCard.body.conversation.id, conversationId);

    const history = await client.get(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages`,
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(history.status, 200);
    assert.ok(history.body.items.some((item: any) => item.id === receiverMessage.body.id));
    assert.ok(
      history.body.items.some(
        (item: any) => item.text === "Necesito conocer el plazo de entrega.",
      ),
    );
  });

  it("keeps blocking authoritative after acceptance", async () => {
    const blocked = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/block`,
      { targetUserId: receiverId },
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(blocked.status, 200);

    const rejectedMessage = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages`,
      { text: "No debe llegar." },
      { Authorization: `Bearer ${receiverToken}` },
    );
    assert.equal(rejectedMessage.status, 409);
    assert.equal(rejectedMessage.body.error, "CHAT_BLOCKED");

    const unblocked = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/unblock`,
      { targetUserId: receiverId },
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(unblocked.status, 200);
  });

  it("preserves a rejected request as closed to further contact", async () => {
    const created = await client.post(
      `/chat/allwain/direct/${outsiderId}`,
      { text: "¿Podemos hablar de esta petición?" },
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(created.status, 201);
    const rejectedConversationId = created.body.conversation.id;

    const rejected = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(rejectedConversationId)}/request-response`,
      { decision: "reject" },
      { Authorization: `Bearer ${outsiderToken}` },
    );
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.status, "rejected");
    assert.equal(rejected.body.canSend, false);

    const retry = await client.post(
      `/chat/allwain/direct/${outsiderId}`,
      { text: "No debe reabrirse automáticamente." },
      { Authorization: `Bearer ${senderToken}` },
    );
    assert.equal(retry.status, 409);
    assert.equal(retry.body.error, "CHAT_REQUEST_REJECTED");
  });
});
