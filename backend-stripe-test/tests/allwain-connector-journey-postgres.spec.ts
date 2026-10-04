import assert from "node:assert/strict";
import { it, mock } from "node:test";
import { app } from "../src/server";
import { getPrisma, closePrisma } from "../src/db/prisma";
import { TestClient } from "./helpers/test-client";
import * as payments from "../src/services/allwain-payments.service";

it("connector accepts once, verifies pickup and delivery with private proofs and persists notifications", async () => {
  const fixtureUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(fixtureUrl.hostname));
  assert.match(fixtureUrl.pathname, /^\/(?:newmersive_e2e_|allwain_audit6_e2e_)/);
  const client = new TestClient(app);
  const prisma = getPrisma();
  // This journey starts from a simulated paid order. No provider payout is made.
  const payout = mock.method(payments, "syncAllwainOrderTransfers", async () => undefined as any);
  await client.start();
  try {
    async function account(name: string, company = false) {
      const r = await client.post("/auth/register", { name, email: `${name}-${Date.now()}@example.test`, password: "LocalConnectorTest2026!", sourceApp: "allwain", ...(company ? { role: "company" } : {}) });
      assert.equal(r.status, 201);
      return { id: r.body.user.id, headers: { Authorization: `Bearer ${r.body.token}` } };
    }
    const buyer = await account("buyer"), seller = await account("seller", true);
    const connector = await account("connector"), other = await account("other-connector");
    const activated = await client.post("/allwain/participation/seller/activate", { sellerType: "company", displayName: "Test seller", locationLabel: "Foios", pickupAddress: "Calle prueba 1, Foios" }, seller.headers);
    assert.equal(activated.status, 200);
    for (const person of [connector, other]) {
      const r = await client.post("/allwain/participation/connector/activate", { available: true, radiusKm: 10, locationLabel: "Foios", latitude: 39.533, longitude: -0.357 }, person.headers);
      assert.equal(r.status, 200);
      await prisma.allwainSellerPaymentAccount.create({ data: { userId: person.id, status: "enabled", transfersEnabled: true, payoutsEnabled: true } });
    }
    const offer = await client.post("/allwain/offers", { title: "Naranjas prueba conector", description: "Solo prueba local", price: 1, meta: { currency: "EUR", unit: "kg", stockQuantity: 50, availableQuantity: 50, minQuantity: 5, quantityStep: 1, saleMode: "immediate", locationLabel: "Foios", deliveryEstimate: "Recogida" } }, seller.headers);
    assert.equal(offer.status, 201);
    const contract = await client.post(`/allwain/offers/${offer.body.id}/accept`, { quantity: 10, deliveryMethod: "pickup", deliveryChannel: "pickup", purchaseKey: `connector-local-${buyer.id}` }, buyer.headers);
    assert.equal(contract.status, 201, JSON.stringify(contract.body));
    const order = await prisma.allwainOrder.findFirstOrThrow({ where: { contractId: contract.body.id } });
    await prisma.allwainOrder.update({ where: { id: order.id }, data: { paymentStatus: "paid", status: "confirmed", fulfillmentStatus: "ready", deliveryMethod: "shipping", deliveryChannel: "local_connector", deliveryAddress: { formatted: "Calle prueba 2, Foios", locationLatApprox: 39.533, locationLngApprox: -0.357 } } });
    const listing = await client.get("/allwain/participation/connector/logistics", connector.headers);
    assert.equal(listing.status, 200);
    const assignment = await prisma.allwainDeliveryAssignment.findUniqueOrThrow({ where: { orderId: order.id } });
    const accepted = await client.post(`/allwain/participation/connector/logistics/${assignment.id}/accept`, {}, connector.headers);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const duplicate = await client.post(`/allwain/participation/connector/logistics/${assignment.id}/accept`, {}, other.headers);
    assert.notEqual(duplicate.status, 200);
    const denied = await client.get(`/allwain/participation/logistics/orders/${order.id}/checkpoint?type=seller_handoff`, buyer.headers);
    assert.equal(denied.status, 403);
    async function proof(type: string, owner: typeof buyer) {
      const r = await client.get(`/allwain/participation/logistics/orders/${order.id}/checkpoint?type=${type}`, owner.headers);
      assert.equal(r.status, 200);
      return r.body.qrValue;
    }
    const pickupProof = await proof("seller_handoff", seller);
    const wrongActor = await client.post(`/allwain/participation/connector/logistics/${assignment.id}/verify`, { proof: pickupProof }, other.headers);
    assert.equal(wrongActor.status, 403);
    const pickup = await client.post(`/allwain/participation/connector/logistics/${assignment.id}/verify`, { proof: pickupProof }, connector.headers);
    assert.equal(pickup.status, 200);
    assert.equal(pickup.body.status, "picked_up");
    const replay = await client.post(`/allwain/participation/connector/logistics/${assignment.id}/verify`, { proof: pickupProof }, connector.headers);
    assert.notEqual(replay.status, 200);
    const deliveryProof = await proof("buyer_delivery", buyer);
    const delivery = await client.post(`/allwain/participation/connector/logistics/${assignment.id}/verify`, { proof: deliveryProof }, connector.headers);
    assert.equal(delivery.status, 200);
    assert.equal(delivery.body.status, "delivered");
    const persisted = await prisma.allwainOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(persisted.fulfillmentStatus, "delivered");
    const notices = await prisma.allwainNotification.findMany({ where: { routeParams: { path: ["orderId"], equals: order.id } } });
    for (const type of ["logistics.accepted", "logistics.pickup_verified", "logistics.delivery_verified"]) {
      for (const recipient of [buyer.id, seller.id]) assert.ok(notices.some(n => n.type === type && n.userId === recipient), `${type}:${recipient}`);
    }
  } finally {
    payout.mock.restore(); await client.stop(); await closePrisma();
  }
});

