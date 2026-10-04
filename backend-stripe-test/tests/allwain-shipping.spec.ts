import assert from "node:assert";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import {
  allwainShippingHash,
  assertAllwainCarrierShipmentCanBeCreated,
  mapAllwainSendcloudWebhookStatus,
  normalizeAllwainCarrierAddress,
  parseAllwainSendcloudQuoteOptions,
  parseAllwainSendcloudTimestamp,
  resolveAllwainCarrierParcel,
  verifyAllwainSendcloudSignature,
} from "../src/services/allwain-shipping.service";

describe("Allwain Sendcloud shipping", () => {
  it("normalizes a complete carrier address and rejects incomplete addresses", () => {
    assert.deepEqual(
      normalizeAllwainCarrierAddress({
        addressLine1: "  Carrer Major, 12  ",
        postalCode: " 46134 ",
        city: " Foios ",
        countryCode: "es",
        phone: "+34 600 123 123",
      }),
      {
        addressLine1: "Carrer Major, 12",
        postalCode: "46134",
        city: "Foios",
        countryCode: "ES",
        phone: "+34600123123",
      },
    );
    assert.throws(
      () =>
        normalizeAllwainCarrierAddress({
          addressLine1: "Carrer Major, 12",
          city: "Foios",
        }),
      /CARRIER_POSTAL_CODE_REQUIRED/,
    );
  });

  it("calculates parcel weight from kilograms or explicit unit weight", () => {
    assert.deepEqual(
      resolveAllwainCarrierParcel({ meta: { unit: "kg" } } as any, 15),
      { weight: { value: "15.000", unit: "kg" } },
    );
    assert.deepEqual(
      resolveAllwainCarrierParcel(
        { meta: { unit: "unidad", shippingWeightKgPerUnit: 2.5 } } as any,
        2,
      ),
      { weight: { value: "5.000", unit: "kg" } },
    );
    assert.throws(
      () => resolveAllwainCarrierParcel({ meta: { unit: "unidad" } } as any, 1),
      /CARRIER_WEIGHT_REQUIRED/,
    );
  });

  it("extracts, orders and deduplicates Sendcloud quote options", () => {
    const quotes = parseAllwainSendcloudQuoteOptions(
      {
        data: [
          {
            code: "postnl:standard",
            name: "Standard",
            carrier: { code: "postnl", name: "PostNL" },
            quotes: [{ price: { total: { value: "6.20", currency: "EUR" } } }],
          },
          {
            code: "dhl:parcel",
            name: "DHL Parcel",
            carrier: { code: "dhl", name: "DHL" },
            contract_id: 17,
            quotes: [{ price: { total: { value: "4.75", currency: "EUR" } } }],
          },
          {
            code: "dhl:parcel",
            name: "Duplicated",
            carrier: { code: "dhl", name: "DHL" },
            contract_id: 17,
            quotes: [{ price: { total: { value: "5.10", currency: "EUR" } } }],
          },
          {
            code: "wrong-currency",
            quotes: [{ price: { total: { value: "1.00", currency: "USD" } } }],
          },
          {
            code: "correos:premium/service_point",
            name: "Correos Premium Pudo Delivery",
            functionalities: { last_mile: "service_point", tracked: true },
            quotes: [{ price: { total: { value: "3.50", currency: "EUR" } } }],
          },
          {
            code: "sendcloud:letter",
            name: "Unstamped letter",
            functionalities: { last_mile: "mailbox", tracked: false },
            quotes: [{ price: { total: { value: "0.00", currency: "EUR" } } }],
          },
        ],
      },
      "eur",
    );

    assert.equal(quotes.length, 2);
    assert.equal(quotes[0].shippingOptionCode, "dhl:parcel");
    assert.equal(quotes[0].amount, 475);
    assert.equal(quotes[0].providerContractId, 17);
    assert.equal(quotes[1].amount, 620);
  });

  it("verifies Sendcloud HMAC signatures over the untouched request body", () => {
    const rawBody = Buffer.from('{"action":"parcel_status_changed","parcel":{"id":42}}');
    const secret = "sendcloud-test-secret";
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    assert.equal(verifyAllwainSendcloudSignature(rawBody, signature, secret), true);
    assert.equal(
      verifyAllwainSendcloudSignature(rawBody, `sha256=${signature}`, secret),
      true,
    );
    assert.equal(
      verifyAllwainSendcloudSignature(Buffer.from(`${rawBody.toString()} `), signature, secret),
      false,
    );
  });

  it("creates stable hashes regardless of object key order", () => {
    assert.equal(
      allwainShippingHash({ postalCode: "46134", city: "Foios" }),
      allwainShippingHash({ city: "Foios", postalCode: "46134" }),
    );
  });

  it("accepts Sendcloud timestamps in seconds or milliseconds", () => {
    assert.equal(
      parseAllwainSendcloudTimestamp(1_725_000_000)?.toISOString(),
      parseAllwainSendcloudTimestamp(1_725_000_000_000)?.toISOString(),
    );
    assert.equal(parseAllwainSendcloudTimestamp("invalid"), null);
  });

  it("maps carrier codes without depending only on translated messages", () => {
    assert.equal(
      mapAllwainSendcloudWebhookStatus({ parcel: { status: { code: "OUT_FOR_DELIVERY" } } }),
      "in_transit",
    );
    assert.equal(
      mapAllwainSendcloudWebhookStatus({ parcel: { status: { code: "DELIVERED" } } }),
      "delivered",
    );
    assert.equal(
      mapAllwainSendcloudWebhookStatus({ parcel: { status: { code: "RETURNED_TO_SENDER" } } }),
      "returned",
    );
  });

  it("never creates a carrier shipment before payment and seller readiness", () => {
    assert.throws(
      () =>
        assertAllwainCarrierShipmentCanBeCreated({
          paymentStatus: "setup_complete",
          fulfillmentStatus: "ready",
        }),
      /ORDER_NOT_PAID/,
    );
    assert.throws(
      () =>
        assertAllwainCarrierShipmentCanBeCreated({
          paymentStatus: "paid",
          fulfillmentStatus: "preparing",
        }),
      /ORDER_NOT_READY/,
    );
    assert.doesNotThrow(() =>
      assertAllwainCarrierShipmentCanBeCreated({
        paymentStatus: "paid",
        fulfillmentStatus: "ready",
      }),
    );
  });
});
