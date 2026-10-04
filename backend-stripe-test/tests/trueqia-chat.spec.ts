import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";
import { createSyntheticAdmin } from "./helpers/synthetic-admin";

const client = new TestClient(app);

describe("TrueQIA chat routes", () => {
  let token: string;
  let fixtureUserId: string;
  let requesterToken: string;
  let providerToken: string;
  let outsiderToken: string;
  let requesterId: string;
  let providerId: string;
  let chatTradeId: string;
  let conversationId: string;

  before(async () => {
    await client.start();
    const login = await createSyntheticAdmin(client, "trueqia-chat-admin");
    token = login.token;
    fixtureUserId = login.user.id;

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const requester = await client.post("/auth/register", {
      name: "Chat Requester",
      email: `chat-requester+${suffix}@test.local`,
      password: "ChatTestPass123!",
      sourceApp: "trueqia",
    });
    const provider = await client.post("/auth/register", {
      name: "Chat Provider",
      email: `chat-provider+${suffix}@test.local`,
      password: "ChatTestPass123!",
      sourceApp: "trueqia",
    });
    const outsider = await client.post("/auth/register", {
      name: "Chat Outsider",
      email: `chat-outsider+${suffix}@test.local`,
      password: "ChatTestPass123!",
      sourceApp: "trueqia",
    });
    requesterToken = requester.body.token;
    providerToken = provider.body.token;
    outsiderToken = outsider.body.token;
    requesterId = requester.body.user.id;
    providerId = provider.body.user.id;
    const offer = await client.post(
      "/trueqia/offers",
      {
        title: "Conversación verificable",
        description: "Oferta creada para comprobar el chat entre participantes.",
        tokens: 25,
      },
      { Authorization: `Bearer ${providerToken}` },
    );
    const trade = await client.post(
      "/trueqia/trades",
      { offerId: offer.body.id, toUserId: providerId, tokens: 25 },
      { Authorization: `Bearer ${requesterToken}` },
    );
    chatTradeId = trade.body.id;
  });

  after(async () => {
    await client.stop();
  });

  it("requires authentication", async () => {
    const res = await client.get("/trueqia/chat/messages");

    assert.equal(res.status, 401);
    assert.equal(res.body.error, "UNAUTHORIZED");
  });

  it("creates a persisted welcome thread for the current user", async () => {
    const res = await client.get("/trueqia/chat/messages", {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.items.length >= 1);
    assert.equal(res.body.items[0].senderRole, "system");
    assert.equal(res.body.items[0].userId, fixtureUserId);
  });

  it("stores a user message in the current user's chat", async () => {
    const created = await client.post(
      "/trueqia/chat/messages",
      { text: "Necesito cerrar este trueque con contrato IA." },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(created.status, 201);
    assert.equal(created.body.senderRole, "user");
    assert.equal(created.body.senderId, fixtureUserId);
    assert.equal(created.body.text, "Necesito cerrar este trueque con contrato IA.");

    const list = await client.get("/trueqia/chat/messages", {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(list.status, 200);
    assert.ok(list.body.items.some((item: any) => item.id === created.body.id));
  });

  it("rejects blank messages", async () => {
    const res = await client.post(
      "/trueqia/chat/messages",
      { text: "   " },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "INVALID_CHAT_MESSAGE");
  });

  it("creates a persisted chat thread for a trade participant", async () => {
    const trades = await client.get("/trueqia/trades", {
      Authorization: `Bearer ${requesterToken}`,
    });
    assert.equal(trades.status, 200);
    const trade = trades.body.items.find((row: any) => row.id === chatTradeId);
    assert.ok(trade, "The explicitly created participant trade is visible");

    const thread = await client.get(`/trueqia/trades/${trade.id}/chat/messages`, {
      Authorization: `Bearer ${requesterToken}`,
    });

    assert.equal(thread.status, 200);
    assert.ok(Array.isArray(thread.body.items));
    assert.equal(thread.body.items[0].senderRole, "system");
    assert.equal(thread.body.items[0].tradeId, trade.id);

    const created = await client.post(
      `/trueqia/trades/${trade.id}/chat/messages`,
      { text: "Confirmo condiciones para este trueque." },
      { Authorization: `Bearer ${requesterToken}` }
    );

    assert.equal(created.status, 201);
    assert.equal(created.body.tradeId, trade.id);
    assert.equal(created.body.senderRole, "user");
    assert.equal(created.body.text, "Confirmo condiciones para este trueque.");

    const list = await client.get(`/trueqia/trades/${trade.id}/chat/messages`, {
      Authorization: `Bearer ${requesterToken}`,
    });

    assert.equal(list.status, 200);
    assert.ok(list.body.items.some((item: any) => item.id === created.body.id));
  });

  it("rejects unknown trade chat threads", async () => {
    const res = await client.get("/trueqia/trades/missing-trade/chat/messages", {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error, "TRADE_NOT_FOUND");
  });

  it("lists trade conversations with a privacy-safe summary", async () => {
    const opened = await client.post(
      `/chat/trueqia/contexts/trade/${chatTradeId}/open`,
      {},
      { Authorization: `Bearer ${requesterToken}` },
    );
    assert.equal(opened.status, 200);
    conversationId = opened.body.id;
    assert.equal(opened.body.contextId, chatTradeId);
    assert.equal(opened.body.otherUser.id, providerId);

    const list = await client.get("/chat/trueqia/conversations", {
      Authorization: `Bearer ${requesterToken}`,
    });
    assert.equal(list.status, 200);
    assert.equal(list.body.unreadCount, 0);
    assert.ok(list.body.items.some((item: any) => item.id === conversationId));
  });

  it("tracks unread messages and marks a conversation as read", async () => {
    // The preceding participant scenario now uses a real synthetic trade rather
    // than a global demo. Establish the unread precondition through the normal API.
    const initialRead = await client.post(
      `/chat/trueqia/conversations/${encodeURIComponent(conversationId)}/read`, {},
      { Authorization: `Bearer ${providerToken}` },
    );
    assert.equal(initialRead.status, 200);
    const initialConversations = await client.get("/chat/trueqia/conversations", {
      Authorization: `Bearer ${providerToken}`,
    });
    assert.equal(initialConversations.status, 200);
    assert.equal(initialConversations.body.items.find((item: any) => item.id === conversationId).unreadCount, 0);
    const sent = await client.post(
      `/chat/trueqia/conversations/${encodeURIComponent(conversationId)}/messages`,
      { text: "¿Te parece bien cerrar el intercambio el viernes?" },
      { Authorization: `Bearer ${requesterToken}` },
    );
    assert.equal(sent.status, 201);
    assert.equal(sent.body.senderId, requesterId);

    const providerList = await client.get("/chat/trueqia/conversations", {
      Authorization: `Bearer ${providerToken}`,
    });
    const providerConversation = providerList.body.items.find(
      (item: any) => item.id === conversationId,
    );
    assert.equal(providerConversation.unreadCount, 1);
    assert.equal(providerConversation.lastMessage.id, sent.body.id);

    const read = await client.post(
      `/chat/trueqia/conversations/${encodeURIComponent(conversationId)}/read`,
      {},
      { Authorization: `Bearer ${providerToken}` },
    );
    assert.equal(read.status, 200);
    const afterRead = await client.get("/chat/trueqia/conversations", {
      Authorization: `Bearer ${providerToken}`,
    });
    assert.equal(
      afterRead.body.items.find((item: any) => item.id === conversationId).unreadCount,
      0,
    );
  });

  it("keeps outsiders out of another user's conversation", async () => {
    const res = await client.get(
      `/chat/trueqia/conversations/${encodeURIComponent(conversationId)}/messages`,
      { Authorization: `Bearer ${outsiderToken}` },
    );
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "CHAT_NOT_FOUND");
  });

  it("blocks and restores bilateral messaging without deleting history", async () => {
    const blocked = await client.post(
      `/chat/trueqia/conversations/${encodeURIComponent(conversationId)}/block`,
      {},
      { Authorization: `Bearer ${requesterToken}` },
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.blockedUserId, providerId);

    const rejected = await client.post(
      `/chat/trueqia/conversations/${encodeURIComponent(conversationId)}/messages`,
      { text: "Este mensaje debe quedar bloqueado." },
      { Authorization: `Bearer ${providerToken}` },
    );
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.error, "CHAT_BLOCKED");

    const unblocked = await client.post(
      `/chat/trueqia/conversations/${encodeURIComponent(conversationId)}/unblock`,
      {},
      { Authorization: `Bearer ${requesterToken}` },
    );
    assert.equal(unblocked.status, 200);

    const sent = await client.post(
      `/chat/trueqia/conversations/${encodeURIComponent(conversationId)}/messages`,
      { text: "Perfecto, queda confirmado para el viernes." },
      { Authorization: `Bearer ${providerToken}` },
    );
    assert.equal(sent.status, 201);

    const history = await client.get(
      `/chat/trueqia/conversations/${encodeURIComponent(conversationId)}/messages`,
      { Authorization: `Bearer ${requesterToken}` },
    );
    assert.equal(history.status, 200);
    assert.ok(history.body.items.some((item: any) => item.id === sent.body.id));
    assert.ok(
      history.body.items.every((item: any) => item.senderName !== "TrueQIA IA"),
      "the bilateral channel must not inject assistant replies",
    );
  });
});
