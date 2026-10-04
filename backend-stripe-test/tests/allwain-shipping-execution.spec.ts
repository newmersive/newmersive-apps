import assert from "node:assert/strict";
import { it, mock } from "node:test";
import { ENV } from "../src/config/env";
import * as db from "../src/db/prisma";
import * as http from "../src/security/external-http";
import * as audit from "../src/services/allwain-audit";
import * as notifications from "../src/services/allwain-notifications.service";
import { createAllwainCarrierShipment } from "../src/services/allwain-shipping.service";

async function fixture(run: (state: any) => Promise<void>, initial?: Record<string, unknown>) {
  const originals = { driver: ENV.STORAGE_DRIVER, publicKey: ENV.SENDCLOUD_PUBLIC_KEY, secretKey: ENV.SENDCLOUD_SECRET_KEY };
  ENV.STORAGE_DRIVER = "postgres";
  ENV.SENDCLOUD_PUBLIC_KEY = "test-fixture";
  ENV.SENDCLOUD_SECRET_KEY = "test-fixture";
  let row: any = initial ? { id: "shipment", orderId: "order", externalShipmentId: null, ...initial } : null;
  const state = {
    calls: 0,
    row: () => row,
    provider: async (): Promise<any> => ({ response: { ok: true, status: 200 }, data: { data: { id: "external-shipment", parcels: [] } } }),
  };
  const prisma = {
    user: { findUnique: async ({ where }: any) => ({ id: where.id, role: "user", name: "Test", email: "test@example.test" }) },
    allwainOrder: { findUnique: async () => ({ id: "order", sellerUserId: "seller", buyerUserId: "buyer", deliveryChannel: "carrier", paymentStatus: "paid", fulfillmentStatus: "ready", offerId: "offer", quantity: 1, totalAmount: 1000, currency: "EUR", carrierDeliveryAmount: 500, carrierQuote: { shippingOptionCode: "test-option" }, deliveryAddress: { formatted: "Calle prueba 1", postalCode: "46134", city: "Foios" } }) },
    allwainSellerProfile: { findUnique: async () => ({ pickupAddress: "Calle prueba 2", shippingPostalCode: "46134", shippingCity: "Foios" }) },
    offer: { findUnique: async () => ({ meta: { unit: "kg" } }) },
    allwainShipment: {
      findUnique: async () => row ? { ...row } : null,
      create: async ({ data }: any) => {
        if (row) throw Object.assign(new Error("unique"), { code: "P2002" });
        row = { id: "shipment", status: "creating", externalShipmentId: null, ...data };
        return { ...row };
      },
      update: async ({ data }: any) => { row = { ...row, ...data }; return { ...row }; },
      updateMany: async ({ where, data }: any) => {
        if (!row || Object.entries(where).some(([key, value]) => row[key] !== value)) return { count: 0 };
        row = { ...row, ...data }; return { count: 1 };
      },
    },
  };
  const mocks = [
    mock.method(db, "getPrisma", () => prisma as any),
    mock.method(http, "fetchBoundedJson", async () => { state.calls++; return state.provider(); }),
    mock.method(audit, "appendAllwainAuditEvent", async () => undefined as any),
    mock.method(notifications, "notifyAllwainOrderParticipants", async () => undefined as any),
  ];
  try { await run(state); } finally {
    mocks.forEach(m => m.mock.restore());
    ENV.STORAGE_DRIVER = originals.driver;
    ENV.SENDCLOUD_PUBLIC_KEY = originals.publicKey;
    ENV.SENDCLOUD_SECRET_KEY = originals.secretKey;
  }
}

it("simultaneous shipment creation calls the carrier only once", () => fixture(async state => {
  await Promise.all([createAllwainCarrierShipment("seller", "order"), createAllwainCarrierShipment("seller", "order")]);
  assert.equal(state.calls, 1);
  assert.equal(state.row().externalShipmentId, "external-shipment");
}));

it("simultaneous retries of a rejected shipment acquire one claim", () => fixture(async state => {
  await Promise.all([createAllwainCarrierShipment("seller", "order"), createAllwainCarrierShipment("seller", "order")]);
  assert.equal(state.calls, 1);
}, { status: "failed" }));

it("timeout leaves an uncertain booking and never repeats the external request", () => fixture(async state => {
  state.provider = async () => { throw new Error("SENDCLOUD_TIMEOUT"); };
  await assert.rejects(createAllwainCarrierShipment("seller", "order"), /TIMEOUT/);
  assert.equal(state.row().status, "uncertain");
  await createAllwainCarrierShipment("seller", "order");
  assert.equal(state.calls, 1);
}));

it("a response without a shipment identity is uncertain, not a confirmed booking", () => fixture(async state => {
  state.provider = async () => ({ response: { ok: false, status: 409 }, data: {} });
  await assert.rejects(createAllwainCarrierShipment("seller", "order"), /RESULT_UNCERTAIN/);
  assert.equal(state.row().status, "uncertain");
}));

it("notification failure does not mark a recorded carrier booking as retryable", () => fixture(async state => {
  const notification = mock.method(notifications, "notifyAllwainOrderParticipants", async () => { throw new Error("NOTIFICATION_FAILED"); });
  try {
    await assert.rejects(createAllwainCarrierShipment("seller", "order"), /NOTIFICATION_FAILED/);
    assert.equal(state.row().status, "announcing");
    await createAllwainCarrierShipment("seller", "order");
    assert.equal(state.calls, 1);
  } finally { notification.mock.restore(); }
}));

it("a failed shipment with an external identity cannot silently buy a second shipment", () => fixture(async state => {
  await createAllwainCarrierShipment("seller", "order");
  assert.equal(state.calls, 0);
}, { status: "failed", externalShipmentId: "already-booked" }));
