import crypto from "crypto";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import type { Offer } from "../shared/types";
import { validateAllwainOrderQuantity } from "./allwain-inventory";
import { appendAllwainAuditEvent, appendAllwainAuditEventTx } from "./allwain-audit";
import { ensureAllwainOperationalDocumentTx } from "./allwain-compliance.service";
import { deriveAllwainOrderStatus } from "./allwain-payment-state";
import { notifyAllwainOrderParticipants } from "./allwain-notifications.service";
import { fetchBoundedJson } from "../security/external-http";
import { hasConfirmedAllwainPurchaseDetails } from "./allwain-purchase-details";

export interface AllwainCarrierAddressInput {
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode?: string | null;
  phone?: string | null;
}

export interface AllwainCarrierQuoteInput extends AllwainCarrierAddressInput {
  offerId: string;
  quantity: number;
}

export interface ValidatedAllwainCarrierQuote {
  id: string;
  provider: "sendcloud";
  shippingOptionCode: string;
  providerContractId: number | null;
  carrierCode: string | null;
  carrierName: string | null;
  serviceName: string;
  amount: number;
  currency: string;
  expiresAt: Date;
}

type NormalizedAddress = {
  addressLine1: string;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
};

type Parcel = {
  weight: { value: string; unit: "kg" };
  dimensions?: { length: string; width: string; height: string; unit: "cm" };
};

function requirePostgres() {
  if (ENV.STORAGE_DRIVER !== "postgres") throw new Error("SHIPPING_REQUIRES_POSTGRES");
}

function safeText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function normalizeCountry(value: unknown) {
  const country = safeText(value || "ES", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("INVALID_CARRIER_COUNTRY");
  return country;
}

function normalizePhone(value: unknown) {
  const phone = safeText(value, 30).replace(/[^+\d]/g, "");
  if (!phone) return null;
  if (!/^\+?\d{7,18}$/.test(phone)) throw new Error("INVALID_CARRIER_PHONE");
  return phone;
}

export function normalizeAllwainCarrierAddress(
  input: AllwainCarrierAddressInput,
): NormalizedAddress {
  const addressLine1 = safeText(input.addressLine1, 200);
  const postalCode = safeText(input.postalCode, 12).toUpperCase();
  const city = safeText(input.city, 80);
  if (addressLine1.length < 4) throw new Error("CARRIER_ADDRESS_REQUIRED");
  if (postalCode.length < 3) throw new Error("CARRIER_POSTAL_CODE_REQUIRED");
  if (city.length < 2) throw new Error("CARRIER_CITY_REQUIRED");
  return {
    addressLine1,
    postalCode,
    city,
    countryCode: normalizeCountry(input.countryCode),
    phone: normalizePhone(input.phone),
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
}

export function allwainShippingHash(value: unknown) {
  return crypto.createHash("sha256").update(canonical(value)).digest("hex");
}

export function allwainSendcloudConfigured() {
  return Boolean(ENV.SENDCLOUD_PUBLIC_KEY && ENV.SENDCLOUD_SECRET_KEY);
}

export function getAllwainShippingConfig() {
  return {
    provider: "sendcloud" as const,
    name: "Sendcloud",
    available: allwainSendcloudConfigured(),
    configured: allwainSendcloudConfigured(),
    quoteTtlSeconds: Math.min(
      3_600,
      Math.max(60, Number(ENV.SENDCLOUD_QUOTE_TTL_SECONDS) || 900),
    ),
    webhookUrl: `${ENV.ALLWAIN_API_URL.replace(/\/$/, "")}/api/allwain/shipping/webhook`,
  };
}

function offerFromRow(row: any): Offer {
  return {
    ...row,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  } as Offer;
}

function positiveMetaNumber(meta: Record<string, unknown>, key: string) {
  const value = Number(meta[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function resolveAllwainCarrierParcel(
  offer: Pick<Offer, "meta">,
  quantity: number,
): Parcel {
  const meta = (offer.meta || {}) as Record<string, unknown>;
  const unit = safeText(meta.unit || "unidad", 40).toLowerCase();
  let weightKg: number | null = null;
  if (["kg", "kilo", "kilos", "kilogramo", "kilogramos"].includes(unit)) {
    weightKg = quantity;
  } else if (["g", "gr", "gramo", "gramos"].includes(unit)) {
    weightKg = quantity / 1_000;
  } else {
    const perUnit = positiveMetaNumber(meta, "shippingWeightKgPerUnit");
    const total = positiveMetaNumber(meta, "shippingWeightKg");
    weightKg = perUnit ? perUnit * quantity : total;
  }
  if (!weightKg || !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 1_000) {
    throw new Error("CARRIER_WEIGHT_REQUIRED");
  }
  const parcel: Parcel = {
    weight: { value: weightKg.toFixed(3), unit: "kg" },
  };
  const length = positiveMetaNumber(meta, "shippingLengthCm");
  const width = positiveMetaNumber(meta, "shippingWidthCm");
  const height = positiveMetaNumber(meta, "shippingHeightCm");
  if (length && width && height) {
    parcel.dimensions = {
      length: length.toFixed(2),
      width: width.toFixed(2),
      height: height.toFixed(2),
      unit: "cm",
    };
  }
  return parcel;
}

function quoteAmount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function parseAllwainSendcloudQuoteOptions(payload: any, currency: string) {
  const expectedCurrency = currency.toUpperCase();
  const options = Array.isArray(payload?.data) ? payload.data : [];
  const parsed: Array<{
    shippingOptionCode: string;
    providerContractId: number | null;
    carrierCode: string | null;
    carrierName: string | null;
    serviceName: string;
    amount: number;
    currency: string;
    leadTimeHours: number | null;
    requirements: unknown;
  }> = [];
  for (const option of options) {
    const code = safeText(option?.code || option?.shipping_option_code, 160);
    if (!code) continue;
    const lastMile = safeText(option?.functionalities?.last_mile, 80).toLowerCase();
    if (lastMile === "service_point" || option?.functionalities?.tracked === false) continue;
    const candidates = Array.isArray(option?.quotes)
      ? option.quotes
      : option?.quote
        ? [option.quote]
        : [option];
    for (const quote of candidates) {
      const total =
        quote?.price?.total ||
        quote?.total_price ||
        quote?.total ||
        option?.price?.total ||
        option?.price;
      const quoteCurrency = safeText(total?.currency || expectedCurrency, 3).toUpperCase();
      const amount = quoteAmount(total?.value ?? total?.amount ?? total);
      if (amount === null || quoteCurrency !== expectedCurrency) continue;
      const contractValue = Number(
        quote?.contract_id ?? option?.contract_id ?? option?.contract?.id,
      );
      parsed.push({
        shippingOptionCode: code,
        providerContractId: Number.isInteger(contractValue) ? contractValue : null,
        carrierCode:
          safeText(option?.carrier?.code || option?.carrier_code, 80) || null,
        carrierName:
          safeText(option?.carrier?.name || option?.carrier_name, 120) || null,
        serviceName:
          safeText(option?.name || option?.product?.name || code, 160) || code,
        amount,
        currency: quoteCurrency.toLowerCase(),
        leadTimeHours: Number.isFinite(Number(quote?.lead_time))
          ? Number(quote.lead_time)
          : null,
        requirements: option?.requirements || null,
      });
      break;
    }
  }
  return parsed
    .sort((left, right) => left.amount - right.amount)
    .filter(
      (item, index, rows) =>
        rows.findIndex(
          (candidate) =>
            candidate.shippingOptionCode === item.shippingOptionCode &&
            candidate.providerContractId === item.providerContractId,
        ) === index,
    )
    .slice(0, 8);
}

async function sendcloudRequest(path: string, body: unknown) {
  if (!allwainSendcloudConfigured()) throw new Error("SENDCLOUD_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(30_000, Math.max(2_000, Number(ENV.SENDCLOUD_REQUEST_TIMEOUT_MS) || 10_000)),
  );
  try {
    const { response, data: payload } = await fetchBoundedJson<any>(
      `${ENV.SENDCLOUD_API_BASE_URL.replace(/\/$/, "")}${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${ENV.SENDCLOUD_PUBLIC_KEY}:${ENV.SENDCLOUD_SECRET_KEY}`).toString("base64")}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
      {
        service: "SENDCLOUD",
        timeoutMs: ENV.SENDCLOUD_REQUEST_TIMEOUT_MS,
        maxResponseBytes: 2_000_000,
      },
    );
    if (!response.ok && response.status !== 409) {
      const error = new Error(
        response.status === 401 || response.status === 403
          ? "SENDCLOUD_AUTH_FAILED"
          : response.status === 422 || response.status === 400
            ? "SENDCLOUD_REQUEST_REJECTED"
            : "SENDCLOUD_REQUEST_FAILED",
      ) as Error & { status?: number; providerPayload?: unknown };
      error.status = response.status;
      error.providerPayload = payload;
      throw error;
    }
    return { status: response.status, payload };
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("SENDCLOUD_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function quoteDto(row: any) {
  return {
    id: row.id,
    provider: row.provider,
    shippingOptionCode: row.shippingOptionCode,
    carrierCode: row.carrierCode,
    carrierName: row.carrierName,
    serviceName: row.serviceName,
    amount: row.amount,
    currency: row.currency,
    leadTimeHours: row.providerSnapshot?.leadTimeHours ?? null,
    expiresAt:
      row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
  };
}

async function sellerOrigin(sellerUserId: string): Promise<NormalizedAddress> {
  const prisma = getPrisma() as any;
  const seller = await prisma.allwainSellerProfile.findUnique({
    where: { userId: sellerUserId },
  });
  if (!seller) throw new Error("SELLER_CARRIER_ADDRESS_REQUIRED");
  const postalFallback = String(seller.pickupAddress || "").match(/\b\d{5}\b/)?.[0];
  try {
    return normalizeAllwainCarrierAddress({
      addressLine1: seller.pickupAddress,
      postalCode: seller.shippingPostalCode || postalFallback,
      city: seller.shippingCity || seller.locationLabel,
      countryCode: seller.shippingCountryCode || "ES",
      phone: seller.shippingPhone,
    });
  } catch {
    throw new Error("SELLER_CARRIER_ADDRESS_REQUIRED");
  }
}

export async function createAllwainCarrierQuotes(
  buyerUserId: string,
  input: AllwainCarrierQuoteInput,
) {
  requirePostgres();
  if (!allwainSendcloudConfigured()) throw new Error("SENDCLOUD_NOT_CONFIGURED");
  const prisma = getPrisma() as any;
  const [offerRow, buyer] = await Promise.all([
    prisma.offer.findUnique({ where: { id: safeText(input.offerId, 100) } }),
    prisma.user.findUnique({ where: { id: buyerUserId } }),
  ]);
  if (!offerRow || offerRow.owner !== "allwain") throw new Error("OFFER_NOT_FOUND");
  if (!buyer) throw new Error("USER_NOT_FOUND");
  if (offerRow.ownerUserId === buyerUserId) throw new Error("CANNOT_ACCEPT_OWN_OFFER");
  if (!["active", "sold_out"].includes(String(offerRow.allwainStatus || "active"))) {
    throw new Error("OFFER_NOT_AVAILABLE");
  }
  const meta = (offerRow.meta || {}) as Record<string, unknown>;
  if (meta.archived === true || (meta.demo === true && meta.checkoutEnabled === false)) {
    throw new Error("DEMO_OFFER_READ_ONLY");
  }
  if (meta.visibility === "internal_test" && buyer.role !== "admin") {
    throw new Error("OFFER_NOT_FOUND");
  }
  const offer = offerFromRow(offerRow);
  const { inventory, quantity } = validateAllwainOrderQuantity(offer, Number(input.quantity));
  const destination = normalizeAllwainCarrierAddress(input);
  const origin = await sellerOrigin(offer.ownerUserId);
  if (origin.countryCode !== destination.countryCode) {
    throw new Error("SENDCLOUD_INTERNATIONAL_NOT_READY");
  }
  const parcel = resolveAllwainCarrierParcel(offer, quantity);
  const currency = safeText(offerRow.currency || meta.currency || ENV.ALLWAIN_CURRENCY, 3).toLowerCase();
  const destinationAddressHash = allwainShippingHash(destination);
  const originAddressHash = allwainShippingHash(origin);
  const parcelHash = allwainShippingHash(parcel);
  const requestFingerprint = allwainShippingHash({
    offerId: offer.id,
    buyerUserId,
    sellerUserId: offer.ownerUserId,
    quantity,
    unit: inventory.unit,
    currency,
    destinationAddressHash,
    originAddressHash,
    parcelHash,
  });
  const now = new Date();
  const cached = await prisma.allwainCarrierQuote.findMany({
    where: { requestFingerprint, status: "quoted", expiresAt: { gt: now } },
    orderBy: { amount: "asc" },
    take: 8,
  });
  if (cached.length) {
    return { cached: true, quoteRequestId: cached[0].quoteRequestId, quotes: cached.map(quoteDto) };
  }

  const response = await sendcloudRequest("/shipping-options", {
    from_address: {
      postal_code: origin.postalCode,
      city: origin.city,
      country_code: origin.countryCode,
    },
    to_address: {
      postal_code: destination.postalCode,
      city: destination.city,
      country_code: destination.countryCode,
    },
    parcels: [parcel],
    calculate_quotes: true,
  });
  const parsed = parseAllwainSendcloudQuoteOptions(response.payload, currency);
  if (!parsed.length) throw new Error("SENDCLOUD_NO_SHIPPING_OPTIONS");
  const quoteRequestId = crypto.randomUUID();
  const ttlSeconds = getAllwainShippingConfig().quoteTtlSeconds;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
  const rows = await prisma.$transaction(
    parsed.map((option) =>
      prisma.allwainCarrierQuote.create({
        data: {
          quoteRequestId,
          offerId: offer.id,
          buyerUserId,
          sellerUserId: offer.ownerUserId,
          shippingOptionCode: option.shippingOptionCode,
          providerContractId: option.providerContractId,
          carrierCode: option.carrierCode,
          carrierName: option.carrierName,
          serviceName: option.serviceName,
          amount: option.amount,
          currency: option.currency,
          quantity,
          unit: inventory.unit,
          requestFingerprint,
          originAddressHash,
          destinationAddressHash,
          parcelHash,
          requirements: option.requirements || undefined,
          requestSnapshot: {
            version: "allwain-sendcloud-quote-v1",
            origin: { postalCode: origin.postalCode, countryCode: origin.countryCode },
            destination: {
              postalCode: destination.postalCode,
              city: destination.city,
              countryCode: destination.countryCode,
            },
            parcel,
          },
          providerSnapshot: {
            shippingOptionCode: option.shippingOptionCode,
            carrierCode: option.carrierCode,
            carrierName: option.carrierName,
            serviceName: option.serviceName,
            amount: option.amount,
            currency: option.currency,
            leadTimeHours: option.leadTimeHours,
          },
          expiresAt,
        },
      }),
    ),
  );
  await appendAllwainAuditEvent({
    aggregateType: "carrier_quote_request",
    aggregateId: quoteRequestId,
    eventType: "carrier.quotes_created",
    actorUserId: buyerUserId,
    actorRole: "buyer",
    source: "sendcloud_shipping_options",
    payload: {
      offerId: offer.id,
      sellerUserId: offer.ownerUserId,
      quantity,
      unit: inventory.unit,
      currency,
      quoteIds: rows.map((row: any) => row.id),
      amounts: rows.map((row: any) => row.amount),
      destinationAddressHash,
      originAddressHash,
      parcelHash,
      expiresAt: expiresAt.toISOString(),
    },
  });
  return { cached: false, quoteRequestId, quotes: rows.map(quoteDto) };
}

export async function validateAllwainCarrierQuoteForAgreement(input: {
  quoteId: string;
  buyerUserId: string;
  offerId: string;
  sellerUserId: string;
  quantity: number;
  unit: string;
  address: AllwainCarrierAddressInput;
  currency: string;
}): Promise<ValidatedAllwainCarrierQuote> {
  requirePostgres();
  const quote = await (getPrisma() as any).allwainCarrierQuote.findUnique({
    where: { id: safeText(input.quoteId, 100) },
  });
  if (!quote) throw new Error("CARRIER_QUOTE_NOT_FOUND");
  if (quote.status !== "quoted") throw new Error("CARRIER_QUOTE_ALREADY_USED");
  if (quote.expiresAt.getTime() <= Date.now()) throw new Error("CARRIER_QUOTE_EXPIRED");
  const destination = normalizeAllwainCarrierAddress(input.address);
  const exactQuantity = Math.abs(Number(quote.quantity) - Number(input.quantity)) < 0.000001;
  if (
    quote.buyerUserId !== input.buyerUserId ||
    quote.offerId !== input.offerId ||
    quote.sellerUserId !== input.sellerUserId ||
    !exactQuantity ||
    quote.unit !== input.unit ||
    quote.currency.toLowerCase() !== input.currency.toLowerCase() ||
    quote.destinationAddressHash !== allwainShippingHash(destination)
  ) {
    throw new Error("CARRIER_QUOTE_MISMATCH");
  }
  return {
    id: quote.id,
    provider: "sendcloud",
    shippingOptionCode: quote.shippingOptionCode,
    providerContractId: quote.providerContractId,
    carrierCode: quote.carrierCode,
    carrierName: quote.carrierName,
    serviceName: quote.serviceName,
    amount: quote.amount,
    currency: quote.currency,
    expiresAt: quote.expiresAt,
  };
}

function shipmentDto(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.orderId,
    provider: row.provider,
    status: row.status,
    carrierCode: row.carrierCode,
    carrierName: row.carrierName,
    serviceName: row.serviceName,
    trackingNumber: row.trackingNumber,
    trackingUrl: row.trackingUrl,
    quotedAmount: row.quotedAmount,
    actualCostAmount: row.actualCostAmount,
    currency: row.currency,
    announcedAt: row.announcedAt?.toISOString?.() || row.announcedAt,
    deliveredAt: row.deliveredAt?.toISOString?.() || row.deliveredAt,
    failedAt: row.failedAt?.toISOString?.() || row.failedAt,
    lastEventAt: row.lastEventAt?.toISOString?.() || row.lastEventAt,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
  };
}

async function requireOrderAccess(userId: string, orderId: string) {
  const prisma = getPrisma() as any;
  const [user, order] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.allwainOrder.findUnique({ where: { id: orderId }, include: { carrierQuote: true } }),
  ]);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (
    user.role !== "admin" &&
    ![order.buyerUserId, order.sellerUserId, order.connectorUserId].includes(userId)
  ) {
    throw new Error("FORBIDDEN");
  }
  return { user, order };
}

export async function getAllwainCarrierShipment(userId: string, orderId: string) {
  requirePostgres();
  await requireOrderAccess(userId, orderId);
  const row = await (getPrisma() as any).allwainShipment.findUnique({ where: { orderId } });
  return shipmentDto(row);
}

function sendcloudAddress(
  address: NormalizedAddress,
  contact: { name: string; email: string; companyName?: string | null; addressLine2?: string | null },
) {
  return {
    name: safeText(contact.name, 120),
    ...(contact.companyName ? { company_name: safeText(contact.companyName, 120) } : {}),
    address_line_1: address.addressLine1,
    ...(contact.addressLine2 ? { address_line_2: safeText(contact.addressLine2, 100) } : {}),
    postal_code: address.postalCode,
    city: address.city,
    country_code: address.countryCode,
    ...(address.phone ? { phone_number: address.phone } : {}),
    email: safeText(contact.email, 200),
  };
}

export function assertAllwainCarrierShipmentCanBeCreated(order: {
  paymentStatus: string;
  fulfillmentStatus: string;
}) {
  if (!["paid", "partially_refunded", "legacy_confirmed"].includes(order.paymentStatus)) {
    throw new Error("ORDER_NOT_PAID");
  }
  if (order.fulfillmentStatus !== "ready") throw new Error("ORDER_NOT_READY");
}

export async function createAllwainCarrierShipment(userId: string, orderId: string) {
  requirePostgres();
  if (!allwainSendcloudConfigured()) throw new Error("SENDCLOUD_NOT_CONFIGURED");
  const prisma = getPrisma() as any;
  const { user, order } = await requireOrderAccess(userId, orderId);
  if (user.role !== "admin" && order.sellerUserId !== userId) throw new Error("FORBIDDEN");
  if (order.deliveryChannel !== "carrier" || !order.carrierQuote) {
    throw new Error("ORDER_NOT_CARRIER_DELIVERY");
  }
  assertAllwainCarrierShipmentCanBeCreated(order);
  const existing = await prisma.allwainShipment.findUnique({ where: { orderId } });
  if (existing && (existing.status !== "failed" || existing.externalShipmentId)) {
    return shipmentDto(existing);
  }

  const [buyer, seller, sellerProfile, offer] = await Promise.all([
    prisma.user.findUnique({ where: { id: order.buyerUserId } }),
    prisma.user.findUnique({ where: { id: order.sellerUserId } }),
    prisma.allwainSellerProfile.findUnique({ where: { userId: order.sellerUserId } }),
    prisma.offer.findUnique({ where: { id: order.offerId } }),
  ]);
  if (!buyer || !seller || !sellerProfile || !offer) throw new Error("SHIPMENT_DATA_INCOMPLETE");
  const delivery = (order.deliveryAddress || {}) as Record<string, unknown>;
  const confirmedRecipient = hasConfirmedAllwainPurchaseDetails(delivery);
  const destination = normalizeAllwainCarrierAddress({
    addressLine1: safeText(delivery.formatted, 200),
    postalCode: safeText(delivery.postalCode, 12),
    city: safeText(delivery.city, 80),
    countryCode: safeText(delivery.countryCode || "ES", 2),
    phone: safeText(delivery.phone, 30),
  });
  const origin = await sellerOrigin(order.sellerUserId);
  if (origin.countryCode !== destination.countryCode) {
    throw new Error("SENDCLOUD_INTERNATIONAL_NOT_READY");
  }
  const parcel = resolveAllwainCarrierParcel(offerFromRow(offer), Number(order.quantity));
  const externalReferenceId = `allwain-order-${order.id}`;
  let shipment = existing;
  if (!shipment) {
    try {
      shipment = await prisma.allwainShipment.create({
        data: {
          orderId: order.id,
          quoteId: order.carrierQuoteId,
          externalReferenceId,
          shippingOptionCode: order.carrierQuote.shippingOptionCode,
          providerContractId: order.carrierQuote.providerContractId,
          carrierCode: order.carrierQuote.carrierCode,
          carrierName: order.carrierQuote.carrierName,
          serviceName: order.carrierQuote.serviceName,
          quotedAmount: order.carrierDeliveryAmount,
          currency: order.currency,
        },
      });
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
      shipment = await prisma.allwainShipment.findUnique({ where: { orderId } });
      if (!shipment) throw new Error("SHIPMENT_CREATE_CONFLICT");
      return shipmentDto(shipment);
    }
  } else {
    const claimed = await prisma.allwainShipment.updateMany({
      where: { id: shipment.id, status: "failed", externalShipmentId: null },
      data: { status: "creating", failedAt: null },
    });
    if (claimed.count !== 1) {
      return shipmentDto(await prisma.allwainShipment.findUnique({ where: { orderId } }));
    }
  }
  if (!shipment) throw new Error("SHIPMENT_CREATE_CONFLICT");

  const shipWithProperties: Record<string, unknown> = {
    shipping_option_code: order.carrierQuote.shippingOptionCode,
  };
  if (order.carrierQuote.providerContractId) {
    shipWithProperties.contract_id = order.carrierQuote.providerContractId;
  }
  let providerResultSaved = false;
  try {
    const response = await sendcloudRequest("/shipments", {
      to_address: sendcloudAddress(destination, {
        name: confirmedRecipient ? String(delivery.name) : buyer.name,
        email: confirmedRecipient ? String(delivery.email) : buyer.email,
        addressLine2: confirmedRecipient ? safeText(delivery.unit, 100) : null,
      }),
      from_address: sendcloudAddress(origin, {
        name: seller.name,
        email: seller.email,
        companyName: sellerProfile.displayName,
      }),
      ship_with: { type: "shipping_option_code", properties: shipWithProperties },
      order_number: order.id,
      total_order_price: {
        currency: order.currency.toUpperCase(),
        value: (order.totalAmount / 100).toFixed(2),
      },
      parcels: [
        {
          ...parcel,
          ...(order.deliveryNotes
            ? { label_notes: safeText(order.deliveryNotes, 200) }
            : {}),
        },
      ],
      reference: `Pedido Allwain ${order.id}`,
      external_reference_id: externalReferenceId,
    });
    const data = response.payload?.data || response.payload?.shipment || response.payload;
    const firstParcel = Array.isArray(data?.parcels) ? data.parcels[0] : null;
    const externalShipmentId = safeText(
      data?.id || data?.uuid || firstParcel?.shipment_uuid,
      160,
    ) || null;
    if (!externalShipmentId) throw new Error("SENDCLOUD_SHIPMENT_RESULT_UNCERTAIN");
    const providerStatus = safeText(firstParcel?.status?.code || data?.status?.code, 80);
    const nextStatus = /fail|unable|cancel|error/i.test(providerStatus)
      ? "failed"
      : "announcing";
    const updated = await prisma.allwainShipment.update({
      where: { id: shipment.id },
      data: {
        status: nextStatus,
        externalShipmentId,
        externalParcelId: safeText(firstParcel?.id, 160) || null,
        carrierCode: safeText(data?.carrier?.code, 80) || shipment.carrierCode,
        carrierName: safeText(data?.carrier?.name, 120) || shipment.carrierName,
        trackingNumber: safeText(firstParcel?.tracking_number, 160) || null,
        trackingUrl: safeText(firstParcel?.tracking_url, 500) || null,
        announcedAt: firstParcel?.announced_at ? new Date(firstParcel.announced_at) : null,
        failedAt: nextStatus === "failed" ? new Date() : null,
        providerPayloadHash: allwainShippingHash(response.payload),
      },
    });
    providerResultSaved = true;
    await appendAllwainAuditEvent({
      aggregateId: order.id,
      eventType: "carrier.shipment_created",
      actorUserId: userId,
      actorRole: user.role === "admin" ? "admin" : "seller",
      source: "sendcloud_shipments_api",
      payload: {
        shipmentId: updated.id,
        carrierQuoteId: order.carrierQuoteId,
        externalShipmentId,
        externalReferenceId,
        shippingOptionCode: updated.shippingOptionCode,
        quotedAmount: updated.quotedAmount,
        currency: updated.currency,
        providerStatus: providerStatus || null,
        providerPayloadHash: updated.providerPayloadHash,
      },
    });
    await notifyAllwainOrderParticipants(order.id, {
      excludeUserId: userId,
      type: "carrier.shipment_created",
      title: "Envío preparado",
      body: `${updated.carrierName || "La empresa de mensajería"} está preparando el envío.`,
      dedupeSuffix: updated.id,
    });
    return shipmentDto(updated);
  } catch (error: any) {
    // A timeout can follow a successful remote booking. Never issue another
    // shipment until its result has been reconciled; notification failures must
    // also leave an already recorded booking intact.
    if (!providerResultSaved) {
      const rejected = [400, 401, 403, 422].includes(error?.status);
      await prisma.allwainShipment.updateMany({
        where: { id: shipment.id, status: "creating", externalShipmentId: null },
        data: { status: rejected ? "failed" : "uncertain", failedAt: new Date() },
      });
    }
    throw error;
  }
}

export function verifyAllwainSendcloudSignature(
  rawBody: Buffer,
  signature: unknown,
  secret = ENV.SENDCLOUD_WEBHOOK_SECRET || ENV.SENDCLOUD_SECRET_KEY,
) {
  const received = safeText(signature, 200).replace(/^sha256=/i, "").toLowerCase();
  if (!secret || !/^[a-f0-9]{64}$/.test(received)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

export function parseAllwainSendcloudTimestamp(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const milliseconds = numeric >= 1_000_000_000_000 ? numeric : numeric * 1_000;
  const parsed = new Date(milliseconds);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function mapAllwainSendcloudWebhookStatus(payload: any) {
  const code = safeText(payload?.parcel?.status?.code || payload?.parcel?.status?.id, 80);
  const message = safeText(payload?.parcel?.status?.message, 160);
  const normalizedCode = code.toUpperCase();
  if (/DELIVERED/.test(normalizedCode)) return "delivered";
  if (/RETURN/.test(normalizedCode)) return "returned";
  if (/FAIL|UNABLE|CANCEL|REFUSED|LOST|DAMAGED|ERROR/.test(normalizedCode)) {
    return "failed";
  }
  if (
    /TRANSIT|ROUTE|SORTING|OUT_FOR_DELIVERY|PICKED_UP|COLLECTED|DELAYED/.test(
      normalizedCode,
    )
  ) {
    return "in_transit";
  }
  if (/ANNOUNC|READY_TO_SEND|LABEL/.test(normalizedCode)) return "announced";
  const signal = message.toLowerCase();
  if (/delivered|entregado/.test(signal)) return "delivered";
  if (/return|returned|devoluci/.test(signal)) return "returned";
  if (/fail|unable|cancel|refused|lost|damaged|error/.test(signal)) return "failed";
  if (/transit|route|sorting|carrier|shipped|picked up|out for delivery/.test(signal)) {
    return "in_transit";
  }
  if (/announc|ready to send|label/.test(signal)) return "announced";
  return "unknown";
}

export async function processAllwainSendcloudWebhook(rawBody: Buffer, signature: unknown) {
  requirePostgres();
  if (!verifyAllwainSendcloudSignature(rawBody, signature)) {
    throw new Error("INVALID_SENDCLOUD_SIGNATURE");
  }
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new Error("INVALID_SENDCLOUD_PAYLOAD");
  }
  const action = safeText(payload?.action, 100);
  if (!action) throw new Error("INVALID_SENDCLOUD_PAYLOAD");
  const parcel = payload?.parcel || {};
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const eventKey = allwainShippingHash({
    action,
    timestamp: payload?.timestamp,
    carrierTimestamp: payload?.carrier_status_change_timestamp,
    parcelId: parcel?.id,
    shipmentUuid: parcel?.shipment_uuid,
    status: parcel?.status,
    payloadHash,
  });
  const occurredAt = parseAllwainSendcloudTimestamp(
    payload?.carrier_status_change_timestamp || payload?.timestamp,
  );
  const providerStatus = mapAllwainSendcloudWebhookStatus(payload);
  const prisma = getPrisma() as any;

  const result = await prisma.$transaction(async (tx: any) => {
    const duplicate = await tx.allwainCarrierEvent.findUnique({ where: { eventKey } });
    if (duplicate) return { duplicate: true, orderId: duplicate.orderId, changed: false };
    const externalShipmentId = safeText(parcel?.shipment_uuid || parcel?.external_shipment_id, 160);
    const externalParcelId = safeText(parcel?.id, 160);
    const orderNumber = safeText(parcel?.order_number, 100);
    const shipmentSelectors = [
      ...(externalShipmentId ? [{ externalShipmentId }] : []),
      ...(externalParcelId ? [{ externalParcelId }] : []),
      ...(orderNumber ? [{ orderId: orderNumber }] : []),
    ];
    let shipment = shipmentSelectors.length
      ? await tx.allwainShipment.findFirst({ where: { OR: shipmentSelectors } })
      : null;
    const event = await tx.allwainCarrierEvent.create({
      data: {
        eventKey,
        shipmentId: shipment?.id || null,
        orderId: shipment?.orderId || null,
        action,
        externalParcelId: externalParcelId || null,
        statusCode: safeText(parcel?.status?.code || parcel?.status?.id, 80) || null,
        statusMessage: safeText(parcel?.status?.message, 160) || null,
        payloadHash,
        sanitizedPayload: {
          action,
          timestamp: payload?.timestamp || null,
          carrierStatusChangeTimestamp:
            payload?.carrier_status_change_timestamp || null,
          parcelId: externalParcelId || null,
          shipmentUuid: externalShipmentId || null,
          orderNumber: orderNumber || null,
          status: parcel?.status || null,
          trackingNumber: safeText(parcel?.tracking_number, 160) || null,
        },
        occurredAt,
        processedAt: shipment ? new Date() : null,
        error: shipment ? null : "SHIPMENT_NOT_FOUND",
      },
    });
    if (!shipment) return { duplicate: false, orderId: orderNumber || null, changed: false };
    if (shipment.lastEventAt && occurredAt && shipment.lastEventAt > occurredAt) {
      return { duplicate: false, orderId: shipment.orderId, changed: false, stale: true };
    }
    shipment = await tx.allwainShipment.update({
      where: { id: shipment.id },
      data: {
        status: providerStatus === "unknown" ? shipment.status : providerStatus,
        externalShipmentId: shipment.externalShipmentId || externalShipmentId || null,
        externalParcelId: shipment.externalParcelId || externalParcelId || null,
        trackingNumber:
          safeText(parcel?.tracking_number, 160) || shipment.trackingNumber || null,
        trackingUrl:
          safeText(parcel?.tracking_url || parcel?.tracking_url_details, 500) ||
          shipment.trackingUrl ||
          null,
        lastEventAt: occurredAt || new Date(),
        deliveredAt: providerStatus === "delivered" ? occurredAt || new Date() : shipment.deliveredAt,
        failedAt: providerStatus === "failed" ? occurredAt || new Date() : shipment.failedAt,
        providerPayloadHash: payloadHash,
      },
    });
    const order = await tx.allwainOrder.findUnique({ where: { id: shipment.orderId } });
    let changed = false;
    let nextFulfillment = order?.fulfillmentStatus;
    if (order && providerStatus === "in_transit" && order.fulfillmentStatus === "ready") {
      nextFulfillment = "dispatched";
    }
    if (
      order &&
      providerStatus === "delivered" &&
      ["ready", "dispatched"].includes(order.fulfillmentStatus)
    ) {
      nextFulfillment = "delivered";
    }
    if (order && nextFulfillment && nextFulfillment !== order.fulfillmentStatus) {
      const nextOrderStatus = deriveAllwainOrderStatus({
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: nextFulfillment,
        disputeStatus: order.disputeStatus,
      });
      const now = occurredAt || new Date();
      const updatedOrder = await tx.allwainOrder.update({
        where: { id: order.id },
        data: {
          fulfillmentStatus: nextFulfillment,
          status: nextOrderStatus,
          ...(nextFulfillment === "dispatched" ? { dispatchedAt: now } : {}),
          ...(nextFulfillment === "delivered" ? { deliveredAt: now } : {}),
        },
      });
      await tx.allwainOrderStatusEvent.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: nextOrderStatus,
          source: "sendcloud_webhook",
          metadata: {
            fromFulfillmentStatus: order.fulfillmentStatus,
            toFulfillmentStatus: nextFulfillment,
            carrierEventId: event.id,
          },
        },
      });
      if (nextFulfillment === "delivered") {
        await ensureAllwainOperationalDocumentTx(
          tx,
          updatedOrder,
          "delivery_confirmation",
          {
            confirmedByRole: "carrier",
            carrier: shipment.carrierName || shipment.carrierCode || "sendcloud",
            sourceReference: `sendcloud:${shipment.id}:delivery`,
            fulfillmentStatus: nextFulfillment,
          },
        );
      }
      await appendAllwainAuditEventTx(tx, {
        aggregateId: order.id,
        eventType: `fulfillment.${nextFulfillment}`,
        actorRole: "carrier",
        source: "sendcloud_webhook",
        providerEventId: eventKey,
        occurredAt: now,
        payload: {
          shipmentId: shipment.id,
          carrierEventId: event.id,
          providerStatus,
          fromFulfillmentStatus: order.fulfillmentStatus,
          toFulfillmentStatus: nextFulfillment,
          payloadHash,
        },
      });
      changed = true;
    }
    await appendAllwainAuditEventTx(tx, {
      aggregateId: shipment.orderId,
      eventType: "carrier.status_received",
      actorRole: "carrier",
      source: "sendcloud_webhook",
      providerEventId: eventKey,
      occurredAt: occurredAt || new Date(),
      payload: {
        shipmentId: shipment.id,
        carrierEventId: event.id,
        providerStatus,
        statusCode: event.statusCode,
        statusMessage: event.statusMessage,
        trackingNumber: shipment.trackingNumber,
        payloadHash,
      },
    });
    return { duplicate: false, orderId: shipment.orderId, changed, providerStatus };
  });
  if (result.orderId && result.changed) {
    await notifyAllwainOrderParticipants(result.orderId, {
      type: `carrier.${result.providerStatus}`,
      title:
        result.providerStatus === "delivered"
          ? "Pedido entregado"
          : "Tu pedido está en camino",
      body:
        result.providerStatus === "delivered"
          ? "La mensajería ha confirmado la entrega."
          : "La mensajería ha recogido el pedido.",
      dedupeSuffix: eventKey,
    });
  }
  return result;
}
