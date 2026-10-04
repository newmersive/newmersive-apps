import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

describe("Multi-user demo journeys", () => {
  before(async () => {
    await client.start();
  });

  after(async () => {
    await client.stop();
  });

  it("completes a TrueQIA negotiation, contract and token transfer", async () => {
    const password = "JourneyPass123!";
    const requester = await client.post("/auth/register", {
      name: "Requester Journey",
      email: `requester-journey+${suffix}@test.local`,
      password,
      sourceApp: "trueqia",
    });
    const provider = await client.post("/auth/register", {
      name: "Provider Journey",
      email: `provider-journey+${suffix}@test.local`,
      password,
      sourceApp: "trueqia",
    });
    const outsider = await client.post("/auth/register", {
      name: "Outsider Journey",
      email: `outsider-journey+${suffix}@test.local`,
      password,
      sourceApp: "trueqia",
    });

    assert.equal(requester.status, 201);
    assert.equal(provider.status, 201);
    const requesterHeaders = { Authorization: `Bearer ${requester.body.token}` };
    const providerHeaders = { Authorization: `Bearer ${provider.body.token}` };
    const outsiderHeaders = { Authorization: `Bearer ${outsider.body.token}` };

    const offer = await client.post(
      "/trueqia/offers",
      {
        title: "Fotografía multiusuario",
        description: "Sesión y edición para probar el recorrido completo.",
        tokens: 40,
        meta: { demo: true },
      },
      providerHeaders
    );
    assert.equal(offer.status, 201);

    const trade = await client.post(
      "/trueqia/trades",
      {
        offerId: offer.body.id,
        toUserId: provider.body.user.id,
        tokens: 40,
      },
      requesterHeaders
    );
    assert.equal(trade.status, 201);
    assert.equal(trade.body.status, "pending");

    const ownTrade = await client.post(
      "/trueqia/trades",
      {
        offerId: offer.body.id,
        toUserId: provider.body.user.id,
        tokens: 40,
      },
      providerHeaders
    );
    assert.equal(ownTrade.status, 409);
    assert.equal(ownTrade.body.error, "CANNOT_TRADE_OWN_OFFER");

    const earlyContract = await client.post(
      "/trueqia/contracts/preview",
      {
        offerTitle: offer.body.title,
        requesterName: requester.body.user.name,
        providerName: provider.body.user.name,
        tokens: 40,
        offerId: offer.body.id,
        tradeId: trade.body.id,
        toUserId: provider.body.user.id,
      },
      requesterHeaders
    );
    assert.equal(earlyContract.status, 409);
    // Signing is now rejected by the shared lifecycle guard before contract creation.
    assert.equal(trade.body.status, "pending");
    assert.equal(earlyContract.body.error, "INVALID_TRADE_STATUS");
    const afterForbiddenSigning = await client.get(`/trueqia/trades/${trade.body.id}`, requesterHeaders);
    assert.equal(afterForbiddenSigning.status, 200);
    assert.equal(afterForbiddenSigning.body.trade.status, "pending");
    const forbiddenContracts = await client.get("/trueqia/contracts", requesterHeaders);
    assert.equal(forbiddenContracts.status, 200);
    assert.ok(!forbiddenContracts.body.items.some((row: any) => row.tradeId === trade.body.id), "Pending trade cannot create a signable contract");

    const forbiddenAcceptance = await client.post(
      `/trueqia/trades/${trade.body.id}/accept`,
      {},
      outsiderHeaders
    );
    assert.equal(forbiddenAcceptance.status, 403);
    assert.equal(forbiddenAcceptance.body.error, "TRADE_ACTION_FORBIDDEN");

    const forbiddenRejection = await client.post(
      `/trueqia/trades/${trade.body.id}/reject`,
      {},
      outsiderHeaders
    );
    assert.equal(forbiddenRejection.status, 403);
    assert.equal(forbiddenRejection.body.error, "TRADE_ACTION_FORBIDDEN");

    const requesterChat = await client.post(
      `/trueqia/trades/${trade.body.id}/chat/messages`,
      { text: "Necesito la entrega en diez días y una ronda de revisión." },
      requesterHeaders
    );
    const providerChat = await client.post(
      `/trueqia/trades/${trade.body.id}/chat/messages`,
      { text: "Acepto el plazo y la revisión para este escenario demo." },
      providerHeaders
    );
    assert.equal(requesterChat.status, 201);
    assert.equal(providerChat.status, 201);

    const acceptedTrade = await client.post(
      `/trueqia/trades/${trade.body.id}/accept`,
      {},
      providerHeaders
    );
    assert.equal(acceptedTrade.status, 200);
    assert.equal(acceptedTrade.body.status, "accepted");

    const requesterBeforeContract = await client.post("/auth/login", {
      email: requester.body.user.email,
      password,
    });
    const providerBeforeContract = await client.post("/auth/login", {
      email: provider.body.user.email,
      password,
    });
    assert.equal(requesterBeforeContract.body.user.tokens, 100);
    assert.equal(providerBeforeContract.body.user.tokens, 100);

    const draft = await client.post(
      "/trueqia/contracts/preview",
      {
        offerTitle: offer.body.title,
        requesterName: requester.body.user.name,
        providerName: provider.body.user.name,
        tokens: 40,
        offerId: offer.body.id,
        tradeId: trade.body.id,
        toUserId: provider.body.user.id,
        description: offer.body.description,
        notes: "Entrega en diez días con una revisión.",
      },
      requesterHeaders
    );
    assert.equal(draft.status, 201);
    assert.equal(draft.body.status, "draft");

    const requesterAcceptance = await client.post(
      `/trueqia/contracts/${draft.body.id}/accept`,
      {},
      requesterHeaders
    );
    assert.equal(requesterAcceptance.status, 200);
    assert.equal(requesterAcceptance.body.status, "partially_accepted");

    const providerAcceptance = await client.post(
      `/trueqia/contracts/${draft.body.id}/accept`,
      {},
      providerHeaders
    );
    assert.equal(providerAcceptance.status, 200);
    assert.equal(providerAcceptance.body.status, "accepted");

    const acceptedAgain = await client.post(
      `/trueqia/trades/${trade.body.id}/accept`,
      {},
      providerHeaders
    );
    assert.equal(acceptedAgain.status, 200);
    assert.equal(acceptedAgain.body.status, "active");
    assert.ok(acceptedAgain.body.tokensTransferredAt);

    const activeTrades = await client.get("/trueqia/trades", requesterHeaders);
    const activeTrade = activeTrades.body.items.find((item: any) => item.id === trade.body.id);
    assert.equal(activeTrade.status, "active");
    assert.equal(activeTrade.contractStatus, "accepted");

    const forbiddenCompletion = await client.post(
      `/trueqia/trades/${trade.body.id}/complete`,
      {},
      outsiderHeaders
    );
    assert.equal(forbiddenCompletion.status, 403);

    const requesterCompletion = await client.post(
      `/trueqia/trades/${trade.body.id}/complete`,
      {},
      requesterHeaders
    );
    assert.equal(requesterCompletion.status, 200);
    assert.equal(requesterCompletion.body.status, "active");
    assert.ok(requesterCompletion.body.fromCompletedAt);
    assert.equal(requesterCompletion.body.toCompletedAt, null);

    const requesterCompletionAgain = await client.post(
      `/trueqia/trades/${trade.body.id}/complete`,
      {},
      requesterHeaders
    );
    assert.equal(requesterCompletionAgain.status, 200);
    assert.equal(requesterCompletionAgain.body.status, "active");

    const providerCompletion = await client.post(
      `/trueqia/trades/${trade.body.id}/complete`,
      {},
      providerHeaders
    );
    assert.equal(providerCompletion.status, 200);
    assert.equal(providerCompletion.body.status, "completed");
    assert.ok(providerCompletion.body.fromCompletedAt);
    assert.ok(providerCompletion.body.toCompletedAt);
    assert.ok(providerCompletion.body.completedAt);

    const requesterLogin = await client.post("/auth/login", {
      email: requester.body.user.email,
      password,
    });
    const providerLogin = await client.post("/auth/login", {
      email: provider.body.user.email,
      password,
    });
    assert.equal(requesterLogin.body.user.tokens, 60);
    assert.equal(providerLogin.body.user.tokens, 140);
  });

  it("completes an Allwain scan, competing offer and grouped purchase flow", async () => {
    const password = "JourneyPass123!";
    const provider = await client.post("/auth/register", {
      name: "Allwain Provider Journey",
      email: `allwain-provider-journey+${suffix}@test.local`,
      password,
      role: "company",
      sourceApp: "allwain",
    });
    const buyer = await client.post("/auth/register", {
      name: "Allwain Buyer Journey",
      email: `allwain-buyer-journey+${suffix}@test.local`,
      password,
      sourceApp: "allwain",
    });
    const partner = await client.post("/auth/register", {
      name: "Allwain Partner Journey",
      email: `allwain-partner-journey+${suffix}@test.local`,
      password,
      sourceApp: "allwain",
    });

    assert.equal(provider.status, 201);
    assert.equal(buyer.status, 201);
    assert.equal(partner.status, 201);
    const providerHeaders = { Authorization: `Bearer ${provider.body.token}` };
    const buyerHeaders = { Authorization: `Bearer ${buyer.body.token}` };
    const partnerHeaders = { Authorization: `Bearer ${partner.body.token}` };

    const sellerActivation = await client.post(
      "/allwain/participation/seller/activate",
      { sellerType: "company", displayName: "Allwain Provider Journey" },
      providerHeaders,
    );
    assert.equal(sellerActivation.status, 200);

    const offer = await client.post(
      "/allwain/offers",
      {
        title: "Cajas recicladas multiusuario",
        description: "100 unidades con entrega en diez días.",
        price: 134,
        productId: "demo-allwain-labels-1",
        meta: {
          // This journey creates a commercial fixture: demo offers are deliberately read-only.
          demo: false,
          units: 100,
          deliveryDays: 10,
          unit: "caja",
          availableQuantity: 100,
          minQuantity: 1,
          quantityStep: 1,
        },
      },
      providerHeaders
    );
    assert.equal(offer.status, 201);

    const scan = await client.post(
      "/allwain/scan-requests",
      {
        sourceType: "text",
        provider: "mock",
        rawText: "Caja reciclada 40x30x30. Cantidad 100 unidades. Presupuesto 140 EUR.",
      },
      buyerHeaders
    );
    assert.equal(scan.status, 201);
    assert.ok(scan.body.extracted);

    const group = await client.post(
      "/allwain/order-groups",
      { productId: "demo-allwain-labels-1", minUnitsPerClient: 10 },
      buyerHeaders
    );
    assert.equal(group.status, 201);

    const buyerJoin = await client.post(
      `/allwain/order-groups/${group.body.id}/join`,
      { units: 60 },
      buyerHeaders
    );
    const partnerJoin = await client.post(
      `/allwain/order-groups/${group.body.id}/join`,
      { units: 40 },
      partnerHeaders
    );
    assert.equal(buyerJoin.status, 200);
    assert.equal(partnerJoin.status, 200);
    assert.equal(partnerJoin.body.totalUnits, 100);
    assert.equal(partnerJoin.body.participants.length, 2);

    const purchase = await client.post(
      `/allwain/offers/${offer.body.id}/accept`,
      {
        quantity: 10,
        deliveryMethod: "pickup",
        purchaseKey: `allwain:journey:${suffix}:boxes`,
      },
      buyerHeaders,
    );
    assert.equal(purchase.status, 201);
    assert.equal(purchase.body.quantity, 10);
    assert.equal(purchase.body.requesterUserId, buyer.body.user.id);
    assert.equal(purchase.body.providerUserId, provider.body.user.id);

    const legacySaving = await client.post(
      "/allwain/savings",
      { amount: 18.5 },
      buyerHeaders,
    );
    assert.equal(legacySaving.status, 410);
    assert.equal(legacySaving.body.error, "LEGACY_SAVINGS_DISABLED");

    const offers = await client.get("/allwain/offers", buyerHeaders);
    const requests = await client.get("/allwain/scan-requests", buyerHeaders);
    assert.equal(offers.status, 200);
    assert.ok(offers.body.items.some((item: any) => item.id === offer.body.id));
    assert.equal(requests.status, 200);
    assert.ok(requests.body.items.some((item: any) => item.id === scan.body.id));
  });
});
