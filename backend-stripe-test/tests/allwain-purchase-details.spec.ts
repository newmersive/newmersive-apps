import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allwainConfirmedStripeShipping,
  allwainDeliveryAddressFromCheckout,
  normalizeAllwainPurchaseDetails,
  savedAllwainPurchaseDetails,
} from "../src/services/allwain-purchase-details";
import { allwainStripeCheckoutCollectionConfig } from "../src/services/allwain-money";

const input = {
  deliveryRecipientName: " Ana García López ",
  deliveryEmail: "Ana@Example.com",
  deliveryPhone: "+34 600 123 456",
  deliveryUnit: "2 B",
  deliveryAddress: "Calle Mayor 10",
  deliveryPostalCode: "46134",
  deliveryCity: "Foios",
  deliveryCountryCode: "ES",
  deliveryDetailsConfirmed: true,
  saveDeliveryDetails: true,
};

describe("Allwain confirmed recipient details", () => {
  it("validates explicit confirmation and contact without changing the legacy contract", () => {
    assert.equal(normalizeAllwainPurchaseDetails({ deliveryAddress: "Old address" }, false), null);
    for (const [patch, code] of [
      [{ deliveryDetailsConfirmed: false }, "DELIVERY_DETAILS_CONFIRMATION_REQUIRED"],
      [{ saveDeliveryDetails: "yes" }, "INVALID_SAVE_DELIVERY_DETAILS"],
      [{ deliveryRecipientName: "" }, "DELIVERY_RECIPIENT_NAME_REQUIRED"],
      [{ deliveryEmail: "invalid" }, "INVALID_DELIVERY_EMAIL"],
      [{ deliveryPhone: "600a123456" }, "INVALID_DELIVERY_PHONE"],
      [{ deliveryPostalCode: "46" }, "INVALID_DELIVERY_POSTAL_CODE"],
      [{ deliveryCountryCode: "FR" }, "INVALID_DELIVERY_COUNTRY"],
      [{ deliveryCity: "" }, "DELIVERY_CITY_REQUIRED"],
    ] as const) {
      assert.throws(() => normalizeAllwainPurchaseDetails({ ...input, ...patch }, false), new RegExp(code));
    }
  });

  it("keeps pickup contact and discards hidden destination fields", () => {
    const details = normalizeAllwainPurchaseDetails(input, true)!;
    assert.equal(details.name, "Ana García López");
    assert.equal(details.email, "ana@example.com");
    assert.equal(details.phone, "+34600123456");
    assert.equal(details.formatted, null);
    assert.equal(details.city, null);
    assert.equal(details.postalCode, null);
    assert.equal(details.unit, null);
    assert.equal(allwainConfirmedStripeShipping(details, "pickup"), undefined);
    assert.equal(savedAllwainPurchaseDetails({ ...details, saveForFuture: false }), null);
  });

  it("binds Stripe shipping to the order and retains live billing requirements", () => {
    const details = normalizeAllwainPurchaseDetails(input, false)!;
    assert.deepEqual(allwainConfirmedStripeShipping(details, "shipping"), {
      name: "Ana García López", phone: "+34600123456",
      address: { line1: "Calle Mayor 10", line2: "2 B", city: "Foios", postal_code: "46134", country: "ES" },
    });
    assert.deepEqual(allwainStripeCheckoutCollectionConfig({
      mode: "payment", testOnlyNonFiscal: false, deliveryMethod: "shipping", confirmedDeliveryDetails: true,
    }), { billing_address_collection: "required", phone_number_collection: { enabled: true } });
    assert.deepEqual(allwainStripeCheckoutCollectionConfig({
      mode: "payment", testOnlyNonFiscal: true, deliveryMethod: "shipping", confirmedDeliveryDetails: true,
    }), { payment_method_types: ["card"] });
  });

  it("ignores conflicting Checkout recipients for confirmed orders, retaining legacy enrichment", () => {
    const details = normalizeAllwainPurchaseDetails(input, false)!;
    const original = structuredClone(details);
    const incoming = { name: "Different Person", address: { line1: "Different street", city: "Madrid" }, phone: "999999999" };
    assert.equal(allwainDeliveryAddressFromCheckout(details, incoming), null);
    assert.deepEqual(details, original);
    assert.deepEqual(allwainDeliveryAddressFromCheckout({ formatted: "Legacy street" }, incoming), {
      formatted: "Legacy street", line1: "Different street", city: "Madrid", name: "Different Person", phone: "999999999", source: "stripe_checkout",
    });
  });
});
