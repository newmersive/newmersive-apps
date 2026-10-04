import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

describe("Offers routes", () => {
  let token: string;
  let companyToken: string;
  let companyUserId: string;
  let buyerToken: string;
  let secondBuyerToken: string;

  before(async () => {
    await client.start();
    const login = await client.post("/auth/login", {
      email: "admin@newmersive.local",
      password: "HighAssuranceTestOnly!2026",
    });
    token = login.body.token;
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const company = await client.post("/auth/register", {
      name: "Featured Offer Company",
      email: `featured-company+${suffix}@test.local`,
      password: "FeaturedOffer123!",
      role: "company",
      sourceApp: "allwain",
    });
    const buyer = await client.post("/auth/register", {
      name: "Featured Offer Buyer",
      email: `featured-buyer+${suffix}@test.local`,
      password: "FeaturedOffer123!",
      role: "buyer",
      sourceApp: "allwain",
    });
    const secondBuyer = await client.post("/auth/register", {
      name: "Second Featured Offer Buyer",
      email: `featured-buyer-2+${suffix}@test.local`,
      password: "FeaturedOffer123!",
      role: "buyer",
      sourceApp: "allwain",
    });
    companyToken = company.body.token;
    companyUserId = company.body.user.id;
    buyerToken = buyer.body.token;
    secondBuyerToken = secondBuyer.body.token;
    const sellerActivation = await client.post(
      "/allwain/participation/seller/activate",
      { sellerType: "company", displayName: "Featured Offer Company" },
      { Authorization: `Bearer ${companyToken}` },
    );
    assert.equal(sellerActivation.status, 200);
  });

  after(async () => {
    await client.stop();
  });

  describe("GET /trueqia/offers", () => {
    it("returns only TrueQIA offers when token is valid", async () => {
      const res = await client.get("/trueqia/offers", {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.length > 0, "should return demo trueques");
      res.body.items.forEach((offer: any) => {
        assert.ok(offer.owner);
        assert.ok(typeof offer.owner.id === "string");
      });
    });
  });

  describe("GET /trueqia/trades/:id", () => {
    it("returns a trade detail when the token belongs to a participant", async () => {
      const listRes = await client.get("/trueqia/trades", {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(listRes.status, 200);
      assert.ok(Array.isArray(listRes.body.items));
      assert.ok(listRes.body.items.length > 0, "should return demo trades");

      const trade = listRes.body.items[0];
      const res = await client.get(`/trueqia/trades/${trade.id}`, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.trade.id, trade.id);
      assert.equal(typeof res.body.trade.title, "string");
    });
  });

  describe("GET /allwain/offers", () => {
    it("returns 200 with a valid token and only Allwain offers", async () => {
      const res = await client.get("/allwain/offers", {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.length > 0, "should return demo compras/comisiones");
      res.body.items.forEach((offer: any) => {
        assert.equal(offer.owner, "allwain");
      });
    });

    it("rejects requests without a token", async () => {
      const res = await client.get("/allwain/offers");

      assert.equal(res.status, 401);
      assert.equal(res.body.error, "UNAUTHORIZED");
    });

    it("lets companies publish and reserves featured campaigns for admins", async () => {
      const buyerPublish = await client.post(
        "/allwain/offers",
        {
          title: "Oferta no permitida",
          description: "Un comprador no debe publicar catalogo.",
          price: 10,
        },
        { Authorization: `Bearer ${buyerToken}` },
      );
      assert.equal(buyerPublish.status, 403);
      assert.equal(buyerPublish.body.error, "SELLER_ROLE_REQUIRED");

      const companyPublish = await client.post(
        "/allwain/offers",
        {
          title: "Oferta propia de empresa",
          description: "Catalogo publicado por una empresa.",
          price: 24.5,
          meta: {
            featured: true,
            unit: "caja",
            availableQuantity: 20,
            minQuantity: 2,
            quantityStep: 1,
          },
        },
        { Authorization: `Bearer ${companyToken}` },
      );
      assert.equal(companyPublish.status, 201);
      assert.equal(companyPublish.body.meta.featured, false);

      const demoOffer = await client.post(
        "/admin/allwain/offers",
        {
          targetUserId: companyUserId,
          title: "Tomates locales de demostración",
          description: "Ficha visible para recorrer el flujo sin crear pedidos.",
          price: 2.4,
          meta: {
            demo: true,
            checkoutEnabled: false,
            unit: "kg",
            stockQuantity: 40,
            availableQuantity: 40,
            minQuantity: 2,
            quantityStep: 1,
          },
        },
        { Authorization: `Bearer ${token}` },
      );
      assert.equal(demoOffer.status, 201);
      const demoPurchase = await client.post(
        `/allwain/offers/${demoOffer.body.id}/accept`,
        { quantity: 2 },
        { Authorization: `Bearer ${buyerToken}` },
      );
      assert.equal(demoPurchase.status, 409);
      assert.equal(demoPurchase.body.error, "DEMO_OFFER_READ_ONLY");

      const featured = await client.post(
        "/admin/allwain/offers",
        {
          targetUserId: companyUserId,
          title: "Naranjas valencianas destacadas",
          description: "Oferta destacada del piloto agrícola.",
          price: 1,
          featured: true,
          meta: {
            imageUrl: "https://allwain.test/featured.jpg",
            unit: "kg",
            availableQuantity: 12,
            minQuantity: 5,
            quantityStep: 1,
          },
        },
        { Authorization: `Bearer ${token}` },
      );
      assert.equal(featured.status, 201);
      assert.equal(featured.body.unit, "kg");
      assert.equal(featured.body.category, "alimentacion");
      assert.equal(featured.body.productKind, "produce_weight");
      assert.equal(featured.body.meta.minQuantity, 5);
      assert.equal(featured.body.ownerUserId, companyUserId);
      assert.equal(featured.body.meta.featured, true);
      assert.equal(featured.body.meta.imageUrl, "https://allwain.test/featured.jpg");

      const buyerList = await client.get("/allwain/offers", {
        Authorization: `Bearer ${buyerToken}`,
      });
      assert.equal(buyerList.body.items[0].id, featured.body.id);
      assert.equal(buyerList.body.items[0].provider.id, companyUserId);

      const belowMinimum = await client.post(
        `/allwain/offers/${featured.body.id}/accept`,
        { quantity: 4 },
        { Authorization: `Bearer ${buyerToken}` },
      );
      assert.equal(belowMinimum.status, 400);
      assert.equal(belowMinimum.body.error, "MINIMUM_ORDER_NOT_MET");

      const invalidStep = await client.post(
        `/allwain/offers/${featured.body.id}/accept`,
        { quantity: 5.5 },
        { Authorization: `Bearer ${buyerToken}` },
      );
      assert.equal(invalidStep.status, 400);
      assert.equal(invalidStep.body.error, "INVALID_QUANTITY_STEP");

      const firstOrder = await client.post(
        `/allwain/offers/${featured.body.id}/accept`,
        { quantity: 5 },
        { Authorization: `Bearer ${buyerToken}` },
      );
      assert.equal(firstOrder.status, 201);
      assert.equal(firstOrder.body.quantity, 5);
      assert.equal(firstOrder.body.unit, "kg");
      assert.equal(firstOrder.body.totalPrice, 5);
      assert.equal(firstOrder.body.subtotalAmount, 500);
      assert.equal(firstOrder.body.platformFeeBps, 1000);
      assert.equal(firstOrder.body.platformFeeAmount, 50);
      assert.equal(firstOrder.body.sellerAmount, 450);
      assert.equal(firstOrder.body.paymentStatus, "awaiting_payment");
      assert.equal(firstOrder.body.inventoryStatus, "reserved");
      assert.equal(firstOrder.body.status, "accepted");
      assert.ok(firstOrder.body.providerAcceptedAt);

      const tooLarge = await client.post(
        `/allwain/offers/${featured.body.id}/accept`,
        { quantity: 8 },
        { Authorization: `Bearer ${secondBuyerToken}` },
      );
      assert.equal(tooLarge.status, 409);
      assert.equal(tooLarge.body.error, "INSUFFICIENT_STOCK");

      const secondOrder = await client.post(
        `/allwain/offers/${featured.body.id}/accept`,
        { quantity: 7 },
        { Authorization: `Bearer ${secondBuyerToken}` },
      );
      assert.equal(secondOrder.status, 201);
      assert.equal(secondOrder.body.quantity, 7);

      const stillAwaitingPayment = await client.post(
        `/allwain/contracts/${secondOrder.body.id}/accept`,
        {},
        { Authorization: `Bearer ${companyToken}` },
      );
      assert.equal(stillAwaitingPayment.status, 200);
      assert.equal(stillAwaitingPayment.body.status, "accepted");
      assert.equal(stillAwaitingPayment.body.inventoryStatus, "reserved");
      assert.equal(stillAwaitingPayment.body.paymentStatus, "awaiting_payment");

      const cancelled = await client.post(
        `/allwain/contracts/${firstOrder.body.id}/reject`,
        {},
        { Authorization: `Bearer ${buyerToken}` },
      );
      assert.equal(cancelled.status, 409);
      assert.equal(cancelled.body.error, "INVALID_CONTRACT_STATUS");

      const afterOrders = await client.get("/allwain/offers", {
        Authorization: `Bearer ${buyerToken}`,
      });
      const inventoryOffer = afterOrders.body.items.find(
        (item: any) => item.id === featured.body.id,
      );
      assert.equal(inventoryOffer.meta.availableQuantity, 0);
      assert.equal(inventoryOffer.meta.reservedQuantity, 12);
      assert.equal(inventoryOffer.meta.soldQuantity, 0);

      const adjusted = await client.post(
        `/allwain/offers/${featured.body.id}/inventory`,
        { stockQuantity: 20, minQuantity: 5, quantityStep: 1 },
        { Authorization: `Bearer ${companyToken}` },
      );
      assert.equal(adjusted.status, 200);
      assert.equal(adjusted.body.meta.stockQuantity, 20);
      assert.equal(adjusted.body.meta.availableQuantity, 8);
    });
  });
});
