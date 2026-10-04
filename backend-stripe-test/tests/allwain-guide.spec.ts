import assert from "node:assert";
import { after, before, describe, it } from "node:test";

import { app } from "../src/server";
import { normalizeAllwainGuideAction } from "../src/services/ai/allwain-guide.ai.service";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

describe("Allwain operational guide", () => {
  let buyerToken: string;
  let sellerToken: string;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  before(async () => {
    process.env.OPENAI_API_KEY = "";
    await client.start();
    const buyer = await client.post("/auth/register", {
      name: "Guide Buyer",
      email: `guide-buyer+${Date.now()}@test.local`,
      password: "allwain-test-123",
      sourceApp: "allwain",
    });
    buyerToken = buyer.body.token;
    const seller = await client.post("/auth/register", {
      name: "Guide Seller",
      email: `guide-seller+${Date.now()}@test.local`,
      password: "allwain-test-123",
      sourceApp: "allwain",
    });
    sellerToken = seller.body.token;
    const activation = await client.post(
      "/allwain/participation/seller/activate",
      { sellerType: "producer", displayName: "Guide Seller" },
      { Authorization: `Bearer ${sellerToken}` },
    );
    assert.equal(activation.status, 200);
  });

  after(async () => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
    await client.stop();
  });

  it("uses one guide and does not invent a product from a generic intent", async () => {
    const profile = await client.get("/allwain/guide", {
      Authorization: `Bearer ${buyerToken}`,
    });
    assert.equal(profile.status, 200);
    assert.deepEqual(profile.body.capabilities, ["answer", "create_request", "create_offer"]);

    const reply = await client.post(
      "/allwain/guide/messages",
      { message: "Quiero comprar algo" },
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(reply.status, 200);
    assert.equal(reply.body.action.type, "create_request");
    assert.equal(reply.body.action.fields.productName, null);
    assert.equal(reply.body.action.fields.unit, null);
    assert.ok(reply.body.action.missingFields.includes("productName"));
    assert.equal(reply.body.message.text, "Para continuar, dime qué necesitas.");
  });

  it("does not let the AI discard an explicit selling intent", async () => {
    const originalFetch = global.fetch;
    process.env.OPENAI_API_KEY = "test-guide-key";
    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith("https://api.openai.com/")) {
        return originalFetch(input, init);
      }
      return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: "answer",
                    reply: "¿En qué puedo ayudarte?",
                    action: null,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
    }) as typeof fetch;

    try {
      const reply = await client.post(
        "/allwain/guide/messages",
        { message: "Quiero vender algo" },
        { Authorization: `Bearer ${sellerToken}` },
      );
      assert.equal(reply.status, 200);
      assert.equal(reply.body.provider, "openai");
      assert.equal(reply.body.action.type, "create_offer");
      assert.equal(reply.body.action.fields.title, null);
      assert.equal(reply.body.action.canExecute, false);
    } finally {
      global.fetch = originalFetch;
      process.env.OPENAI_API_KEY = "";
    }
  });

  it("normalizes an orange offer as food sold by kilograms", () => {
    const action = normalizeAllwainGuideAction(
      {
        id: "orange-guide-action",
        type: "create_offer",
        fields: {
          title: "Naranjas valencianas",
          description: "Naranjas recién recolectadas",
          price: 1,
          availableQuantity: 100_000,
          minQuantity: 5,
          deliveryEstimate: "Entrega local en 24 horas",
          productKind: "food",
          foodCategory: "Fruta fresca",
          ownProduction: true,
          originCountry: "ES",
          originRegion: "Foios",
          responsibleOperator: "Guide Seller",
        },
      },
      { sellerEnabled: true },
    );

    assert.ok(action);
    assert.equal(action.status, "ready");
    assert.equal(action.fields.unit, "kg");
    assert.equal((action.fields as any).quantityStep, 1);
    assert.deepEqual(action.missingFields, []);
  });

  it("reclassifies a generic draft when the product becomes known", () => {
    const action = normalizeAllwainGuideAction(
      {
        id: "generic-then-orange",
        type: "create_offer",
        fields: {
          title: "Naranjas",
          productKind: "goods",
        },
      },
      { sellerEnabled: true },
    );

    assert.ok(action);
    assert.equal((action.fields as any).productKind, "food");
    assert.equal(action.fields.unit, "kg");
  });

  it("turns a natural selling phrase into a clean product draft", async () => {
    let reply = await client.post(
      "/allwain/guide/messages",
      { message: "Quiero vender 100 kg de naranjas valencianas a 1 euro por kilo" },
      { Authorization: `Bearer ${sellerToken}` },
    );

    assert.equal(reply.status, 200);
    assert.equal(reply.body.action.fields.title, "naranjas valencianas");
    assert.equal(reply.body.action.fields.availableQuantity, 100);
    assert.equal(reply.body.action.fields.price, 1);
    assert.equal(reply.body.action.fields.unit, "kg");
    assert.equal(reply.body.message.text, "Para continuar, dime pedido mínimo.");

    reply = await client.post(
      "/allwain/guide/messages",
      { message: "5 kg", currentAction: reply.body.action },
      { Authorization: `Bearer ${sellerToken}` },
    );
    assert.equal(reply.body.action.fields.availableQuantity, 100);
    assert.equal(reply.body.action.fields.minQuantity, 5);
    assert.equal(reply.body.message.text, "Para continuar, dime cuándo puedes entregarlo.");

    for (const message of ["en 24 horas", "fruta fresca", "sí", "España"]) {
      reply = await client.post(
        "/allwain/guide/messages",
        { message, currentAction: reply.body.action },
        { Authorization: `Bearer ${sellerToken}` },
      );
    }
    assert.equal(reply.body.action.fields.deliveryEstimate, "en 24 horas");
    assert.equal(reply.body.action.fields.foodCategory, "fruta fresca");
    assert.equal(reply.body.action.fields.ownProduction, true);
    assert.equal(reply.body.action.fields.originCountry, "ES");
    assert.equal(reply.body.action.status, "ready");
  });

  it("reuses quantity, appliance unit, place and date from one natural request", async () => {
    const reply = await client.post(
      "/allwain/guide/messages",
      { message: "Necesito 2 lavadoras en Valencia antes del 15 de septiembre" },
      { Authorization: `Bearer ${buyerToken}` },
    );

    assert.equal(reply.status, 200);
    assert.equal(reply.body.action.fields.productName, "lavadoras");
    assert.equal(reply.body.action.fields.quantity, 2);
    assert.equal(reply.body.action.fields.unit, "ud");
    assert.equal(reply.body.action.fields.deliveryAddress, "Valencia");
    assert.equal(reply.body.action.fields.deliveryWindow, "15 de septiembre");
    assert.deepEqual(reply.body.action.missingFields, ["deliveryMethod"]);
    assert.equal(reply.body.message.text, "Para continuar, dime cómo quieres recibirlo.");
  });

  it("publishes a complete buyer request through the real request flow", async () => {
    const response = await client.post(
      "/allwain/guide/actions",
      {
        idempotencyKey: `guide-request-${Date.now()}`,
        action: {
          id: "request-action-1",
          type: "create_request",
          fields: {
            productName: "Televisor OLED de 55 pulgadas",
            quantity: 1,
            unit: "ud",
            targetPrice: 700,
            deliveryWindow: "Antes del viernes",
            deliveryMethod: "shipping",
            deliveryAddress: "Calle Mayor 10, Valencia",
          },
        },
      },
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(response.status, 201);
    assert.equal(response.body.type, "request");
    assert.equal(response.body.status, "submitted");

    const reopened = await client.get(
      `/allwain/scan-requests/${response.body.id}`,
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.extracted.productName, "Televisor OLED de 55 pulgadas");
    assert.equal(reopened.body.extracted.quantity, 1);
    assert.equal(reopened.body.extracted.unit, "ud");
  });

  it("publishes a seller offer and blocks the same action for a buyer", async () => {
    const action = {
      id: "offer-action-1",
      type: "create_offer",
      fields: {
        title: "Lavadora de carga frontal",
        description: "Lavadora revisada y lista para entrega",
        price: 280,
        unit: "ud",
        availableQuantity: 2,
        minQuantity: 1,
        quantityStep: 1,
        deliveryEstimate: "Entrega en 2 días",
        productKind: "goods",
      },
    };
    const blocked = await client.post(
      "/allwain/guide/actions",
      { idempotencyKey: `guide-blocked-${Date.now()}`, action },
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, "SELLER_ROLE_REQUIRED");

    const published = await client.post(
      "/allwain/guide/actions",
      { idempotencyKey: `guide-offer-${Date.now()}`, action },
      { Authorization: `Bearer ${sellerToken}` },
    );
    assert.equal(published.status, 201);
    assert.equal(published.body.type, "offer");
    assert.equal(published.body.status, "published");

    const offers = await client.get("/allwain/offers", {
      Authorization: `Bearer ${sellerToken}`,
    });
    const offer = offers.body.items.find((item: any) => item.id === published.body.id);
    assert.ok(offer);
    assert.equal(offer.title, "Lavadora de carga frontal");
    assert.equal(offer.meta.unit, "ud");
    assert.equal(offer.meta.availableQuantity, 2);
  });

  it("treats an explicit publish message as confirmation without changing the draft", async () => {
    const currentAction = {
      id: "publish-command-action",
      type: "create_request",
      fields: {
        productName: "PlayStation 5",
        quantity: 1,
        unit: "ud",
        deliveryWindow: "Esta semana",
        deliveryMethod: "shipping",
        deliveryAddress: "Valencia",
      },
    };
    const reply = await client.post(
      "/allwain/guide/messages",
      { message: "Publícala", currentAction },
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(reply.status, 200);
    assert.equal(reply.body.executeRequested, true);
    assert.equal(reply.body.action.fields.productName, "PlayStation 5");
    assert.equal(reply.body.action.status, "ready");
  });

  it("deduplicates two simultaneous confirmations", async () => {
    const title = `Producto idempotente ${Date.now()}`;
    const body = {
      idempotencyKey: `guide-concurrent-${Date.now()}`,
      action: {
        id: "concurrent-offer-action",
        type: "create_offer",
        fields: {
          title,
          description: "Una sola publicación",
          price: 20,
          unit: "ud",
          availableQuantity: 5,
          minQuantity: 1,
          quantityStep: 1,
          deliveryEstimate: "Entrega mañana",
          productKind: "goods",
        },
      },
    };
    const [first, second] = await Promise.all([
      client.post("/allwain/guide/actions", body, {
        Authorization: `Bearer ${sellerToken}`,
      }),
      client.post("/allwain/guide/actions", body, {
        Authorization: `Bearer ${sellerToken}`,
      }),
    ]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.id, second.body.id);

    const offers = await client.get("/allwain/offers", {
      Authorization: `Bearer ${sellerToken}`,
    });
    assert.equal(
      offers.body.items.filter((item: any) => item.title === title).length,
      1,
    );
  });
});
