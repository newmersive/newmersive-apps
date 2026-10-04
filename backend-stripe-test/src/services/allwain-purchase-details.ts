/** Recipient details belong to a purchase, independently of the account identity. */
export interface AllwainPurchaseDetailsInput {
  deliveryRecipientName?: unknown;
  deliveryEmail?: unknown;
  deliveryPhone?: unknown;
  deliveryUnit?: unknown;
  deliveryAddress?: unknown;
  deliveryPostalCode?: unknown;
  deliveryCity?: unknown;
  deliveryCountryCode?: unknown;
  deliveryDetailsConfirmed?: unknown;
  saveDeliveryDetails?: unknown;
}

function textField(value: unknown, max: number, code: string) {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error(code);
  const result = value.trim().replace(/\s+/g, " ");
  if (result.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(code);
  return result;
}

export function normalizeAllwainPurchaseDetails(
  input: AllwainPurchaseDetailsInput,
  pickup: boolean,
  now = new Date(),
) {
  // Existing apps and existing orders keep their original contract. Once any
  // new recipient field is supplied, a complete explicit confirmation is required.
  const requested = input.deliveryRecipientName !== undefined ||
    input.deliveryEmail !== undefined || input.deliveryUnit !== undefined ||
    input.deliveryDetailsConfirmed !== undefined || input.saveDeliveryDetails !== undefined;
  if (!requested) return null;
  if (input.deliveryDetailsConfirmed !== true) throw new Error("DELIVERY_DETAILS_CONFIRMATION_REQUIRED");
  if (typeof input.saveDeliveryDetails !== "boolean") throw new Error("INVALID_SAVE_DELIVERY_DETAILS");
  const name = textField(input.deliveryRecipientName, 160, "INVALID_DELIVERY_RECIPIENT_NAME");
  if (name.length < 2) throw new Error("DELIVERY_RECIPIENT_NAME_REQUIRED");
  const email = textField(input.deliveryEmail, 254, "INVALID_DELIVERY_EMAIL").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INVALID_DELIVERY_EMAIL");
  const rawPhone = textField(input.deliveryPhone, 40, "INVALID_DELIVERY_PHONE");
  if (!/^[+\d\s().-]+$/.test(rawPhone)) throw new Error("INVALID_DELIVERY_PHONE");
  const phone = rawPhone.replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,18}$/.test(phone)) throw new Error("INVALID_DELIVERY_PHONE");
  const formatted = pickup ? null : textField(input.deliveryAddress, 500, "DELIVERY_ADDRESS_TOO_LONG");
  const city = pickup ? null : textField(input.deliveryCity, 80, "INVALID_DELIVERY_CITY");
  const postalCode = pickup ? null : textField(input.deliveryPostalCode, 12, "INVALID_DELIVERY_POSTAL_CODE").toUpperCase();
  const countryCode = pickup ? null : textField(input.deliveryCountryCode || "ES", 2, "INVALID_DELIVERY_COUNTRY").toUpperCase();
  const unit = pickup ? null : textField(input.deliveryUnit, 100, "INVALID_DELIVERY_UNIT") || null;
  if (!pickup) {
    if (!formatted) throw new Error("DELIVERY_ADDRESS_REQUIRED");
    if (!city) throw new Error("DELIVERY_CITY_REQUIRED");
    if (!postalCode) throw new Error("DELIVERY_POSTAL_CODE_REQUIRED");
    // Preserve the Spain-only destination restriction previously enforced by Checkout.
    if (countryCode !== "ES") throw new Error("INVALID_DELIVERY_COUNTRY");
    if (!/^\d{5}$/.test(postalCode)) throw new Error("INVALID_DELIVERY_POSTAL_CODE");
  }
  return {
    recipientDetailsVersion: 1 as const,
    confirmedAt: now.toISOString(),
    saveForFuture: input.saveDeliveryDetails,
    name, email, phone, unit, formatted, city, postalCode, countryCode,
  };
}

export function hasConfirmedAllwainPurchaseDetails(value: any): boolean {
  return Boolean(value && value.recipientDetailsVersion === 1 && value.confirmedAt);
}

export function savedAllwainPurchaseDetails(value: any) {
  if (!hasConfirmedAllwainPurchaseDetails(value) || value.saveForFuture !== true) return null;
  return {
    deliveryRecipientName: value.name,
    deliveryEmail: value.email,
    deliveryPhone: value.phone,
    deliveryUnit: value.unit || "",
    deliveryAddress: value.formatted || "",
    deliveryPostalCode: value.postalCode || "",
    deliveryCity: value.city || "",
    deliveryCountryCode: value.countryCode || "ES",
  };
}

/** A Stripe return can enrich legacy deliveries, never rewrite a confirmed one. */
export function allwainDeliveryAddressFromCheckout(currentAddress: any, shippingDetails: any, customerPhone?: string | null) {
  if (hasConfirmedAllwainPurchaseDetails(currentAddress) || !shippingDetails?.address) return null;
  return {
    ...(currentAddress && typeof currentAddress === "object" ? currentAddress : {}),
    ...shippingDetails.address,
    name: shippingDetails.name || null,
    phone: shippingDetails.phone || customerPhone || null,
    source: "stripe_checkout",
  };
}

export function allwainConfirmedStripeShipping(address: any, deliveryMethod?: string | null) {
  if (!hasConfirmedAllwainPurchaseDetails(address) || deliveryMethod === "pickup" || !address.formatted) return undefined;
  return {
    name: address.name,
    phone: address.phone,
    address: {
      line1: address.formatted,
      ...(address.unit ? { line2: address.unit } : {}),
      city: address.city,
      postal_code: address.postalCode,
      country: address.countryCode,
    },
  };
}
