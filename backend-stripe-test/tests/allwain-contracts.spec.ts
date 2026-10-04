import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

describe("Allwain offer agreement routes", () => {
  let providerHeaders: Record<string, string>;
  let buyerHeaders: Record<string, string>;
  let outsiderHeaders: Record<string, string>;
  let offerId: string;
  let contractId: string;

  before(async () => {
    await client.start();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = "AllwainFlow123!";
    const provider = await client.post("/auth/register", {
      name: "Proveedor Allwain",
      email: `allwain-flow-provider+${suffix}@test.local`,
      password,
      role: "company",
      sourceApp: "allwain",
    });
    const buyer = await client.post("/auth/register", {
      name: "Cliente Allwain",
      email: `allwain-flow-buyer+${suffix}@test.local`,
      password,
      sourceApp: "allwain",
    });
    const outsider = await client.post("/auth/register", {
      name: "Tercero Allwain",
      email: `allwain-flow-outsider+${suffix}@test.local`,
      password,
      sourceApp: "allwain",
    });

    providerHeaders = { Authorization: `Bearer ${provider.body.token}` };
    buyerHeaders = { Authorization: `Bearer ${buyer.body.token}` };
    outsiderHeaders = { Authorization: `Bearer ${outsider.body.token}` };

    const sellerActivation = await client.post(
      "/allwain/participation/seller/activate",
      { sellerType: "company", displayName: "Proveedor Allwain" },
      providerHeaders,
    );
    assert.equal(sellerActivation.status, 200);

    const offer = await client.post(
      "/allwain/offers",
      {
        title: "Pedido de embalaje sostenible",
        description: "Lote de 100 cajas con entrega acordada.",
        price: 129.5,
        meta: {
          unit: "caja",
          availableQuantity: 100,
          minQuantity: 1,
          quantityStep: 1,
        },
      },
      providerHeaders
    );
    assert.equal(offer.status, 201);
    assert.equal(offer.body.meta.imageKey, "packaging");
    assert.match(offer.body.meta.imageUrl, /\/card-images\/packaging\.jpg\?v=1$/);
    offerId = offer.body.id;
  });

  after(async () => {
    await client.stop();
  });

  it("registers interest and blocks accepting your own offer", async () => {
    const interest = await client.post(
      `/allwain/offers/${offerId}/interest`,
      { source: "test", note: "Necesito confirmar el plazo." },
      buyerHeaders
    );
    assert.equal(interest.status, 201);
    assert.equal(interest.body.offerId, offerId);
    assert.equal(interest.body.status, "new");

    const ownOffer = await client.post(
      `/allwain/offers/${offerId}/accept`,
      {},
      providerHeaders
    );
    assert.equal(ownOffer.status, 409);
    assert.equal(ownOffer.body.error, "CANNOT_ACCEPT_OWN_OFFER");

    const missingAddress = await client.post(
      `/allwain/offers/${offerId}/accept`,
      { quantity: 1, deliveryMethod: "shipping" },
      buyerHeaders
    );
    assert.equal(missingAddress.status, 400);
    assert.equal(missingAddress.body.error, "DELIVERY_ADDRESS_REQUIRED");
  });

  it("creates an independent agreement for every buyer order", async () => {
    const created = await client.post(
      `/allwain/offers/${offerId}/accept`,
      {
        quantity: 1,
        deliveryMethod: "shipping",
        deliveryAddress: "Calle Mayor 10, 46134 Foios",
        deliveryNotes: "Entrega por la mañana",
        deliveryLatitude: 39.533421,
        deliveryLongitude: -0.356712,
      },
      buyerHeaders
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.app, "allwain");
    assert.equal(created.body.status, "accepted");
    assert.ok(created.body.requesterAcceptedAt);
    assert.ok(created.body.providerAcceptedAt);
    assert.equal(created.body.paymentStatus, "awaiting_payment");
    assert.equal(created.body.subtotalAmount, 12950);
    assert.equal(created.body.shippingAmount, 200);
    assert.equal(created.body.totalPrice, 131.5);
    assert.equal(created.body.platformFeeAmount, 1295);
    assert.equal(created.body.connectorPlatformShareAmount, 26);
    assert.equal(created.body.connectorDeliveryAmount, 200);
    assert.equal(created.body.connectorFeeAmount, 226);
    assert.equal(created.body.platformNetFeeAmount, 1269);
    assert.equal(created.body.sellerAmount, 11655);
    assert.equal(created.body.deliveryMethod, "shipping");
    assert.equal(created.body.deliveryAddress.formatted, "Calle Mayor 10, 46134 Foios");
    assert.equal(created.body.deliveryAddress.locationLatApprox, 39.533);
    assert.equal(created.body.deliveryAddress.locationLngApprox, -0.357);
    assert.equal(created.body.deliveryNotes, "Entrega por la mañana");
    assert.ok(created.body.generatedText.includes("Entrega local Allwain en Calle Mayor 10"));
    assert.ok(created.body.generatedText.includes("ACUERDO DE OFERTA ALLWAIN"));
    assert.equal(created.body.imageMeta.key, "packaging");
    assert.equal(created.body.imageMeta.illustrative, true);
    contractId = created.body.id;

    const secondOrder = await client.post(
      `/allwain/offers/${offerId}/accept`,
      {
        quantity: 1,
        deliveryMethod: "pickup",
      },
      buyerHeaders
    );
    assert.equal(secondOrder.status, 201);
    assert.notEqual(secondOrder.body.id, contractId);
    assert.equal(secondOrder.body.offerId, offerId);
    assert.equal(secondOrder.body.shippingAmount, 0);
    assert.equal(secondOrder.body.totalPrice, 129.5);

    const carrierWithoutQuote = await client.post(
      `/allwain/offers/${offerId}/accept`,
      {
        quantity: 1,
        deliveryChannel: "carrier",
        deliveryAddress: "Calle Mayor 10, 46134 Foios",
        deliveryPostalCode: "46134",
        deliveryCity: "Foios",
        deliveryCountryCode: "ES",
      },
      buyerHeaders,
    );
    assert.equal(carrierWithoutQuote.status, 400);
    assert.equal(carrierWithoutQuote.body.error, "CARRIER_RATE_REQUIRED");

    const invalidLocation = await client.post(
      `/allwain/offers/${offerId}/accept`,
      {
        quantity: 1,
        deliveryMethod: "shipping",
        deliveryAddress: "Dirección de prueba",
        deliveryLatitude: 120,
        deliveryLongitude: -0.3,
      },
      buyerHeaders,
    );
    assert.equal(invalidLocation.status, 400);
    assert.equal(invalidLocation.body.error, "INVALID_DELIVERY_LOCATION");
  });

  it("shows the already formalized direct order only to participants", async () => {
    const providerList = await client.get("/allwain/contracts", providerHeaders);
    assert.equal(providerList.status, 200);
    const listedContract = providerList.body.items.find(
      (item: any) => item.id === contractId,
    );
    assert.ok(listedContract);
    assert.equal(listedContract.imageMeta.key, "packaging");

    const outsiderList = await client.get("/allwain/contracts", outsiderHeaders);
    assert.equal(outsiderList.status, 200);
    assert.ok(!outsiderList.body.items.some((item: any) => item.id === contractId));

    const outsiderAccept = await client.post(
      `/allwain/contracts/${contractId}/accept`,
      {},
      outsiderHeaders
    );
    assert.equal(outsiderAccept.status, 404);

    const accepted = await client.post(
      `/allwain/contracts/${contractId}/accept`,
      {},
      providerHeaders
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, "accepted");
    assert.ok(accepted.body.providerAcceptedAt);
    assert.equal(accepted.body.imageMeta.key, "packaging");

    const pdf = await client.getRaw(
      `/allwain/contracts/${contractId}/pdf`,
      buyerHeaders
    );
    assert.equal(pdf.status, 200);
    assert.ok(pdf.headers["content-type"].includes("application/pdf"));
    assert.equal(pdf.body.subarray(0, 5).toString("latin1"), "%PDF-");

    const rejectAccepted = await client.post(
      `/allwain/contracts/${contractId}/reject`,
      {},
      buyerHeaders
    );
    assert.equal(rejectAccepted.status, 409);
    assert.equal(rejectAccepted.body.error, "INVALID_CONTRACT_STATUS");
  });

  it("reuses only the buyer's newest opted-in confirmation without mutating prior orders", async () => {
    const details = {
      quantity: 1, deliveryMethod: "shipping", deliveryChannel: "local_connector",
      deliveryRecipientName: "Ana García López", deliveryEmail: "ana@example.com",
      deliveryPhone: "+34 600 123 456", deliveryAddress: "Calle Mayor 10",
      deliveryUnit: "2 B", deliveryPostalCode: "46134", deliveryCity: "Foios",
      deliveryCountryCode: "ES", deliveryDetailsConfirmed: true, saveDeliveryDetails: true,
      purchaseKey: `recipient-${Date.now()}`,
    };
    assert.equal((await client.get("/allwain/purchase-details")).status, 401);
    const first = await client.post(`/allwain/offers/${offerId}/accept`, details, buyerHeaders);
    assert.equal(first.status, 201);
    assert.equal(first.body.requesterName, "Cliente Allwain");
    assert.equal(first.body.deliveryAddress.name, "Ana García López");
    assert.equal(first.body.deliveryAddress.phone, "+34600123456");
    assert.equal(first.body.deliveryAddress.unit, "2 B");
    assert.equal(first.body.deliveryAddress.city, "Foios");
    assert.equal(first.body.deliveryAddress.recipientDetailsVersion, 1);
    assert.ok(first.body.deliveryAddress.confirmedAt);
    const saved = await client.get("/allwain/purchase-details", buyerHeaders);
    assert.equal(saved.body.details.deliveryRecipientName, "Ana García López");
    assert.match(saved.headers["cache-control"], /no-store/);
    for (const headers of [providerHeaders, outsiderHeaders]) {
      const privateDetails = await client.get("/allwain/purchase-details?userId=someone-else", headers);
      assert.equal(privateDetails.status, 200);
      assert.equal(privateDetails.body.details, null);
    }
    const retry = await client.post(`/allwain/offers/${offerId}/accept`, {
      ...details, deliveryRecipientName: "Changed on retry", deliveryAddress: "Other street",
    }, buyerHeaders);
    assert.equal(retry.status, 201);
    assert.equal(retry.body.id, first.body.id);
    assert.deepEqual(retry.body.deliveryAddress, first.body.deliveryAddress);
    const invalid = await client.post(`/allwain/offers/${offerId}/accept`, {
      ...details, purchaseKey: `${details.purchaseKey}-invalid`, deliveryCity: "",
    }, buyerHeaders);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "DELIVERY_CITY_REQUIRED");
    assert.deepEqual((await client.get("/allwain/purchase-details", buyerHeaders)).body, saved.body);
    const second = await client.post(`/allwain/offers/${offerId}/accept`, {
      ...details, purchaseKey: `${details.purchaseKey}-second`, deliveryRecipientName: "Luis Pérez",
    }, buyerHeaders);
    assert.equal(second.status, 201);
    assert.equal((await client.get("/allwain/purchase-details", buyerHeaders)).body.details.deliveryRecipientName, "Luis Pérez");
    const original = await client.get(`/allwain/contracts/${first.body.id}`, buyerHeaders);
    assert.equal(original.status, 200);
    assert.deepEqual(original.body.deliveryAddress, first.body.deliveryAddress);
    const optOut = await client.post(`/allwain/offers/${offerId}/accept`, {
      ...details, purchaseKey: `${details.purchaseKey}-out`, deliveryMethod: "pickup", deliveryChannel: "pickup",
      saveDeliveryDetails: false,
    }, buyerHeaders);
    assert.equal(optOut.status, 201);
    assert.equal(optOut.body.deliveryAddress.name, "Ana García López");
    assert.equal(optOut.body.deliveryAddress.formatted, null);
    assert.equal((await client.get("/allwain/purchase-details", buyerHeaders)).body.details, null);
  });
});
