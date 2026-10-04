import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { ENV } from "../src/config/env";
import { app } from "../src/server";
import {
  extractAllwainDocumentFromText,
  scanProductImage,
} from "../src/services/scan.service";
import { TestClient } from "./helpers/test-client";
import { getProducts } from "../src/services/data.store";

const client = new TestClient(app);
const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TEST_IMAGE_DATA_URL = `data:image/png;base64,${TEST_IMAGE_BASE64}`;

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Allwain scan requests", () => {
  let token: string;
  let tokenUserId: string;
  const catalogProductId = `scan-catalog-fixture-${Date.now()}`;
  let buyerToken: string;
  let companyToken: string;
  let companyUserId: string;

  before(async () => {
    await client.start();
    const login = await client.post("/auth/register", {
      name: "Scan request owner",
      email: `scan-owner+${Date.now()}@test.local`,
      password: "allwain-test-123",
      sourceApp: "allwain",
    });
    assert.equal(login.status, 201);
    token = login.body.token;
    tokenUserId = login.body.user.id;
    getProducts().push({
      id: catalogProductId,
      name: "Cafe de origen Chiapas 250g",
      ean: "7501234567008",
    });
    const buyerLogin = await client.post("/auth/register", {
      name: "Allwain Scan Buyer",
      email: `allwain-scan-buyer+${Date.now()}@test.local`,
      password: "allwain-test-123",
      sourceApp: "allwain",
    });
    buyerToken = buyerLogin.body.token;
    const companyLogin = await client.post("/auth/register", {
      name: "Allwain Test Seller",
      email: `allwain-seller+${Date.now()}@test.local`,
      password: "allwain-test-123",
      role: "company",
      sourceApp: "allwain",
    });
    companyToken = companyLogin.body.token;
    companyUserId = companyLogin.body.user.id;
    const sellerActivation = await client.post(
      "/allwain/participation/seller/activate",
      { sellerType: "company", displayName: "Allwain Test Seller" },
      { Authorization: `Bearer ${companyToken}` },
    );
    assert.equal(sellerActivation.status, 200);
  });

  after(async () => {
    const products = getProducts();
    const fixtureIndex = products.findIndex((item) => item.id === catalogProductId);
    if (fixtureIndex >= 0) products.splice(fixtureIndex, 1);
    await client.stop();
  });

  it("extracts several receipt lines without turning totals into products", () => {
    const document = extractAllwainDocumentFromText(
      [
        "SUPERMERCADO FOIOS",
        "Ticket 48392",
        "2 x Leche entera 2,50 EUR",
        "Arroz redondo 2,40 EUR",
        "Aceite oliva 5,90 EUR",
        "TOTAL 10,80 EUR",
      ].join("\n"),
    );

    assert.ok(document);
    assert.equal(document?.kind, "receipt");
    assert.equal(document?.items.length, 3);
    assert.equal(document?.items[0].quantity, 2);
    assert.equal(document?.items[0].lineTotal, 2.5);
    assert.equal(document?.items.some((item) => /total/i.test(item.productName)), false);
  });

  it("creates an editable request from OCR text", async () => {
    const res = await client.post(
      "/allwain/scan-requests",
      {
        sourceType: "text",
        rawText: [
          "Producto: Cafe origen Chiapas 250g",
          "Proveedor: Cooperativa Sur",
          "Cantidad: 24 uds",
          "Precio: 32.50 EUR",
          "EAN: 7501234567890",
        ].join("\n"),
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.userId, tokenUserId);
    assert.equal(res.body.extracted.productName, "Cafe origen Chiapas 250g");
    assert.equal(res.body.extracted.supplier, "Cooperativa Sur");
    assert.equal(res.body.extracted.quantity, 24);
    assert.equal(res.body.extracted.unit, "ud");
    assert.equal(res.body.extracted.measurement.label, "Unidades");
    assert.equal(res.body.extracted.targetPrice, 32.5);
    assert.equal(res.body.extracted.ean, "7501234567890");
    assert.equal(res.body.status, "draft");
    assert.deepEqual(res.body.offers, []);
    assert.ok(res.body.ai.confidence >= 0.6);
    assert.equal(res.body.imageMeta.illustrative, true);
    assert.match(res.body.imageMeta.url, /\/card-images\/coffee\.jpg\?v=1$/);
  });

  it("creates a draft request from a camera image", async () => {
    const res = await client.post(
      "/allwain/scan-requests",
      {
        sourceType: "camera",
        imageBase64: TEST_IMAGE_DATA_URL,
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.sourceType, "camera");
    assert.equal(res.body.imageMeta.hasImage, true);
    assert.equal(res.body.imageMeta.mimeType, "image/png");
    assert.ok(res.body.imageMeta.bytesApprox > 0);
    assert.equal(res.body.imageMeta.source, "captured");
    assert.equal(res.body.imageMeta.illustrative, false);
    assert.match(res.body.imageMeta.url, /\/allwain\/media\/uploads\/.+\.png$/);
    assert.ok(res.body.ai.warnings.includes("Sin texto OCR ni código de barras."));

    const mediaPath = new URL(res.body.imageMeta.url).pathname.replace(/^\/api/, "");
    const unauthenticated = await client.get(mediaPath);
    assert.equal(unauthenticated.status, 401);
    const authenticated = await client.getRaw(mediaPath, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.headers["content-type"], "image/png");
    assert.ok(authenticated.body.length > 0);
  });

  it("does not invent a demo category or product for a real written request", async () => {
    const result = await scanProductImage({
      provider: "mock",
      sourceType: "text",
      rawText: "Necesito 7 kg de mandarinas para el viernes en Foios",
    });

    assert.equal(result.extracted.productName, "mandarinas");
    assert.equal(result.extracted.deliveryWindow, "el viernes");
    assert.equal(result.extracted.deliveryAddress, "Foios");
    assert.equal(result.extracted.category, null);
    assert.equal(result.product, null);
    assert.deepEqual(result.offers, []);
    assert.match(result.summary, /detectó/);
  });

  it("extracts a bare unit count from a natural written request", async () => {
    const result = await scanProductImage({
      provider: "mock",
      sourceType: "text",
      rawText: "Quiero 2 televisores OLED de 65 pulgadas",
    });

    assert.equal(result.extracted.productName, "televisores OLED de 65 pulgadas");
    assert.equal(result.extracted.quantity, 2);
    assert.equal(result.extracted.unit, "ud");
    assert.equal(result.extracted.measurement?.label, "Unidades");
  });

  it("does not confuse lavadoras with liters and keeps inline place and date", async () => {
    const result = await scanProductImage({
      provider: "mock",
      sourceType: "text",
      rawText: "Necesito 2 lavadoras en Valencia antes del 15 de septiembre",
    });

    assert.equal(result.extracted.productName, "lavadoras");
    assert.equal(result.extracted.quantity, 2);
    assert.equal(result.extracted.unit, "ud");
    assert.equal(result.extracted.productKind, "appliance");
    assert.equal(result.extracted.deliveryAddress, "Valencia");
    assert.equal(result.extracted.deliveryWindow, "15 de septiembre");
  });

  it("keeps a google scan request editable when Vision is not configured", async () => {
    const originalKey = ENV.GOOGLE_CLOUD_VISION_API_KEY;
    ENV.GOOGLE_CLOUD_VISION_API_KEY = undefined;

    try {
      const res = await client.post(
        "/allwain/scan-requests",
        {
          provider: "google",
          sourceType: "camera",
          imageBase64: TEST_IMAGE_DATA_URL,
        },
        { Authorization: `Bearer ${token}` }
      );

      assert.equal(res.status, 201);
      assert.equal(res.body.ai.provider, "google");
      assert.equal(res.body.ai.model, "google-vision-multimodal-analysis");
      assert.equal(res.body.ai.rawData.status, "missing-api-key");
      assert.ok(
        res.body.ai.warnings.includes("Google Vision no configurado; se aplico extraccion local.")
      );
    } finally {
      ENV.GOOGLE_CLOUD_VISION_API_KEY = originalKey;
    }
  });

  it("extracts request fields from Google Vision OCR text", async () => {
    const originalKey = ENV.GOOGLE_CLOUD_VISION_API_KEY;
    const originalEndpoint = ENV.GOOGLE_CLOUD_VISION_ENDPOINT;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: any }> = [];

    ENV.GOOGLE_CLOUD_VISION_API_KEY = "test-key";
    ENV.GOOGLE_CLOUD_VISION_ENDPOINT = "https://vision.test/v1/images:annotate";
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body || "{}")),
      });

      return jsonResponse({
        responses: [
          {
            textAnnotations: [
              {
                description: [
                  "Producto: Cafe natural 1kg",
                  "Proveedor: OCR Coop",
                  "Cantidad: 12 uds",
                  "Precio: 18.90 EUR",
                  "EAN: 1234567890123",
                ].join("\n"),
              },
            ],
          },
        ],
      });
    }) as typeof fetch;

    try {
      const res = await scanProductImage({
        provider: "google",
        sourceType: "camera",
        imageBase64: TEST_IMAGE_DATA_URL,
      });

      assert.equal(res.provider, "google");
      assert.equal(res.rawData.status, "ok");
      assert.equal(res.extracted.productName, "Cafe natural 1kg");
      assert.equal(res.extracted.supplier, "OCR Coop");
      assert.equal(res.extracted.quantity, 12);
      assert.equal(res.extracted.unit, "ud");
      assert.equal(res.extracted.targetPrice, 18.9);
      assert.equal(res.extracted.ean, "1234567890123");
      assert.ok(calls[0].url.includes("key=test-key"));
      assert.equal(calls[0].body.requests[0].image.content, TEST_IMAGE_BASE64);
      assert.equal(calls[0].body.requests[0].features[0].type, "TEXT_DETECTION");
    } finally {
      ENV.GOOGLE_CLOUD_VISION_API_KEY = originalKey;
      ENV.GOOGLE_CLOUD_VISION_ENDPOINT = originalEndpoint;
      globalThis.fetch = originalFetch;
    }
  });

  it("analyzes live camera frames without creating a request", async () => {
    const originalKey = ENV.GOOGLE_CLOUD_VISION_API_KEY;
    const originalEndpoint = ENV.GOOGLE_CLOUD_VISION_ENDPOINT;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ body: any }> = [];
    const before = await client.get("/allwain/scan-requests", {
      Authorization: `Bearer ${buyerToken}`,
    });

    ENV.GOOGLE_CLOUD_VISION_API_KEY = "test-key";
    ENV.GOOGLE_CLOUD_VISION_ENDPOINT = "https://vision.test/v1/images:annotate";
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      if (!String(url).startsWith("https://vision.test/")) {
        return originalFetch(url as any, init);
      }
      calls.push({ body: JSON.parse(String(init?.body || "{}")) });
      return jsonResponse({
        responses: [
          {
            textAnnotations: [
              {
                description: [
                  "Producto: Cafe natural 1kg",
                  "Marca: Sierra",
                  "Cantidad: 12 uds",
                  "EAN: 1234567890123",
                ].join("\n"),
              },
            ],
            labelAnnotations: [
              { description: "Coffee", score: 0.94 },
              { description: "Package", score: 0.81 },
            ],
            localizedObjectAnnotations: [{ name: "Packaged goods", score: 0.88 }],
          },
        ],
      });
    }) as typeof fetch;

    try {
      const res = await client.post(
        "/allwain/scan-analysis",
        {
          provider: "google",
          sourceType: "camera",
          imageBase64: TEST_IMAGE_DATA_URL,
        },
        { Authorization: `Bearer ${buyerToken}` }
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.ready, true);
      assert.ok(res.body.readingProgress >= 40);
      assert.ok(res.body.confidence >= 60);
      assert.equal(res.body.extracted.productName, "Cafe natural 1kg");
      assert.equal(res.body.signals.labels[0].name, "Coffee");
      assert.equal(res.body.signals.objects[0].name, "Packaged goods");
      assert.deepEqual(
        calls[0].body.requests[0].features.map((feature: any) => feature.type),
        ["TEXT_DETECTION", "LABEL_DETECTION", "OBJECT_LOCALIZATION"]
      );
      assert.equal(calls.length, 1);

      const afterList = await client.get("/allwain/scan-requests", {
        Authorization: `Bearer ${buyerToken}`,
      });
      assert.equal(afterList.body.items.length, before.body.items.length);
    } finally {
      ENV.GOOGLE_CLOUD_VISION_API_KEY = originalKey;
      ENV.GOOGLE_CLOUD_VISION_ENDPOINT = originalEndpoint;
      globalThis.fetch = originalFetch;
    }
  });

  it("reviews, confirms and launches a complete product request", async () => {
    const created = await client.post(
      "/allwain/scan-requests",
      {
        sourceType: "text",
        rawText: [
          "Producto: Cafe inicial",
          "Proveedor: Proveedor temporal",
          "Cantidad: 10 uds",
          "Precio: 12 EUR",
        ].join("\n"),
      },
      { Authorization: `Bearer ${buyerToken}` }
    );

    assert.equal(created.body.status, "draft");
    assert.deepEqual(created.body.offers, []);

    const edited = await client.patch(
      `/allwain/scan-requests/${created.body.id}`,
      {
        extracted: {
          productName: "Cafe de origen Chiapas 250g",
          ean: "7501234567008",
          supplier: "Proveedor final",
          quantity: "36",
          unit: "uds",
          targetPrice: "29.95",
          currency: "EUR",
          locationLabel: "Centro de Madrid",
          locationLatApprox: 40.4168,
          locationLngApprox: -3.7038,
          deliveryWindow: "Antes del 15 de septiembre",
          deliveryMethod: "shipping",
          deliveryAddress: "Calle Mayor 10, Madrid",
          deliveryNotes: "Llamar antes de entregar",
        },
      },
      { Authorization: `Bearer ${buyerToken}` }
    );

    assert.equal(edited.status, 200);
    assert.equal(edited.body.status, "draft");
    assert.equal(edited.body.title, "Buscar Cafe de origen Chiapas 250g");
    assert.equal(edited.body.extracted.quantity, 36);
    assert.equal(edited.body.extracted.deliveryMethod, "shipping");
    assert.equal(edited.body.extracted.currency, "EUR");
    assert.equal(edited.body.extracted.locationLabel, "Centro de Madrid");
    assert.equal(edited.body.extracted.locationLatApprox, 40.4168);
    assert.equal(edited.body.extracted.locationLngApprox, -3.7038);
    assert.ok(edited.body.description.includes("36 ud"));

    const confirmed = await client.post(
      `/allwain/scan-requests/${created.body.id}/confirm`,
      {},
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.status, "ready");

    const launched = await client.post(
      `/allwain/scan-requests/${created.body.id}/launch`,
      {},
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(launched.status, 200);
    assert.equal(launched.body.status, "submitted");
    assert.equal(launched.body.paymentGuaranteeStatus, "not_started");
    assert.equal(launched.body.product?.id, catalogProductId);
    assert.equal(launched.body.offers.length, 0);

    const reopened = await client.get(
      `/allwain/scan-requests/${created.body.id}`,
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.status, "submitted");
    assert.equal(reopened.body.extracted.deliveryAddress, "Calle Mayor 10, Madrid");
  });

  it("validates structured currency and approximate coordinates", async () => {
    const created = await client.post(
      "/allwain/scan-requests",
      { sourceType: "text", rawText: "Producto: Lavadora\nCantidad: 1 unidad" },
      { Authorization: `Bearer ${buyerToken}` },
    );

    const badCurrency = await client.patch(
      `/allwain/scan-requests/${created.body.id}`,
      { extracted: { currency: "EUROS" } },
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(badCurrency.status, 400);
    assert.equal(badCurrency.body.error, "INVALID_CURRENCY");

    const badLocation = await client.patch(
      `/allwain/scan-requests/${created.body.id}`,
      { extracted: { locationLatApprox: 120 } },
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(badLocation.status, 400);
    assert.equal(badLocation.body.error, "INVALID_LOCATION");
  });

  it("moves canceled requests to the archived phase and blocks invalid transitions", async () => {
    const created = await client.post(
      "/allwain/scan-requests",
      { sourceType: "text", rawText: "Producto: PS5\nCantidad: 1 unidad" },
      { Authorization: `Bearer ${buyerToken}` },
    );
    const canceled = await client.patch(
      `/allwain/scan-requests/${created.body.id}`,
      { status: "canceled" },
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(canceled.status, 200);
    assert.equal(canceled.body.status, "canceled");

    const archived = await client.patch(
      `/allwain/scan-requests/${created.body.id}`,
      { status: "archived" },
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(archived.status, 200);
    assert.equal(archived.body.status, "archived");

    const reopened = await client.patch(
      `/allwain/scan-requests/${created.body.id}`,
      { status: "submitted" },
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(reopened.status, 409);
    assert.equal(reopened.body.error, "INVALID_SCAN_TRANSITION");
  });

  it("blocks confirmation until the product and delivery sheet is complete", async () => {
    const created = await client.post(
      "/allwain/scan-requests",
      { sourceType: "camera", imageBase64: TEST_IMAGE_DATA_URL },
      { Authorization: `Bearer ${buyerToken}` }
    );

    const confirm = await client.post(
      `/allwain/scan-requests/${created.body.id}/confirm`,
      {},
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(confirm.status, 422);
    assert.equal(confirm.body.error, "INCOMPLETE_PRODUCT_SHEET");
    assert.ok(confirm.body.fields.includes("quantity"));
    assert.ok(confirm.body.fields.includes("deliveryMethod"));

    const launch = await client.post(
      `/allwain/scan-requests/${created.body.id}/launch`,
      {},
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(launch.status, 409);
    assert.equal(launch.body.error, "INVALID_SCAN_TRANSITION");
  });

  it("rejects updates for unknown scan requests", async () => {
    const res = await client.patch(
      "/allwain/scan-requests/missing-id",
      { status: "submitted" },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.error, "SCAN_REQUEST_NOT_FOUND");
  });

  it("lists scan requests for the current user", async () => {
    const res = await client.get("/allwain/scan-requests", {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.items.some((item: any) => item.extracted?.supplier === "Cooperativa Sur"));
  });

  it("lets a company answer a buyer request and formalize the agreement", async () => {
    const productName = `Televisor QA ${Date.now()}`;
    const created = await client.post(
      "/allwain/scan-requests",
      {
        sourceType: "text",
        rawText: `Producto: ${productName}\nCantidad: 1 unidad\nPrecio: 420 EUR`,
      },
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(created.status, 201);

    const edited = await client.patch(
      `/allwain/scan-requests/${created.body.id}`,
      {
        extracted: {
          productName,
          category: "Electronica",
          quantity: 1,
          unit: "unidad",
          targetPrice: 420,
          currency: "EUR",
          deliveryWindow: "Durante la proxima semana",
          deliveryMethod: "shipping",
          deliveryAddress: "Calle de prueba 10, Madrid",
        },
      },
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(edited.status, 200);

    const confirmed = await client.post(
      `/allwain/scan-requests/${created.body.id}/confirm`,
      {},
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(confirmed.status, 200);

    const launched = await client.post(
      `/allwain/scan-requests/${created.body.id}/launch`,
      {},
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(launched.status, 200);
    assert.equal(launched.body.status, "submitted");

    const buyerMarket = await client.get("/allwain/market/requests", {
      Authorization: `Bearer ${buyerToken}`,
    });
    assert.equal(buyerMarket.status, 403);
    assert.equal(buyerMarket.body.error, "SELLER_ROLE_REQUIRED");

    const sellerMarket = await client.get("/allwain/market/requests", {
      Authorization: `Bearer ${companyToken}`,
    });
    assert.equal(sellerMarket.status, 200);
    const marketRequest = sellerMarket.body.items.find(
      (item: any) => item.id === created.body.id
    );
    assert.ok(marketRequest);
    assert.equal(marketRequest.extracted.productName, productName);
    assert.equal(marketRequest.extracted.deliveryAddress, undefined);
    assert.equal(marketRequest.myOffer, null);

    const offer = await client.post(
      `/allwain/market/requests/${created.body.id}/offers`,
      {
        price: 399.9,
        availableQuantity: 1,
        deliveryEstimate: "Entrega en 3 dias laborables",
        description: "Televisor nuevo con transporte incluido.",
      },
      { Authorization: `Bearer ${companyToken}` }
    );
    assert.equal(offer.status, 201);
    assert.equal(offer.body.ownerUserId, companyUserId);
    assert.equal(offer.body.provider.id, companyUserId);
    assert.equal(offer.body.meta.requestId, created.body.id);

    const improvedOffer = await client.post(
      `/allwain/market/requests/${created.body.id}/offers`,
      {
        price: 390,
        deliveryEstimate: "Entrega en 2 dias",
        description: "Propuesta mejorada con entrega mas rapida.",
      },
      { Authorization: `Bearer ${companyToken}` }
    );
    assert.equal(improvedOffer.status, 201);
    assert.equal(improvedOffer.body.id, offer.body.id);
    assert.equal(improvedOffer.body.price, 390);
    assert.equal(improvedOffer.body.proposalRevision, 2);

    const buyerRequest = await client.get(
      `/allwain/scan-requests/${created.body.id}`,
      { Authorization: `Bearer ${buyerToken}` }
    );
    const receivedOffer = buyerRequest.body.offers.find(
      (item: any) => item.id === improvedOffer.body.id
    );
    assert.ok(receivedOffer);
    assert.equal(receivedOffer.provider.id, companyUserId);
    assert.equal(receivedOffer.price, 390);
    assert.equal(receivedOffer.proposalRevision, 2);

    const agreement = await client.post(
      `/allwain/offers/${improvedOffer.body.id}/accept`,
      {},
      { Authorization: `Bearer ${buyerToken}` }
    );
    assert.equal(agreement.status, 201);
    assert.ok(agreement.body.requesterAcceptedAt);
    assert.ok(agreement.body.providerAcceptedAt);
    assert.equal(agreement.body.status, "accepted");

    const awardedRequest = await client.get(
      `/allwain/scan-requests/${created.body.id}`,
      { Authorization: `Bearer ${buyerToken}` },
    );
    assert.equal(awardedRequest.status, 200);
    assert.equal(awardedRequest.body.status, "awarded");
    assert.equal(awardedRequest.body.selectedOfferId, improvedOffer.body.id);

    const sellerContracts = await client.get("/allwain/contracts", {
      Authorization: `Bearer ${companyToken}`,
    });
    assert.ok(
      sellerContracts.body.items.some((item: any) => item.id === agreement.body.id)
    );

    const formalized = await client.post(
      `/allwain/contracts/${agreement.body.id}/accept`,
      {},
      { Authorization: `Bearer ${companyToken}` }
    );
    assert.equal(formalized.status, 200);
    assert.equal(formalized.body.status, "accepted");
    assert.ok(formalized.body.providerAcceptedAt);
  });
});
