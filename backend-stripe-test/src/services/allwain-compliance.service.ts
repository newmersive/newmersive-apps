import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import {
  canonicalAllwainAuditJson,
  appendAllwainAuditEvent,
  appendAllwainAuditEventTx,
} from "./allwain-audit";
import { buildTextPdf } from "./pdf.service";
import {
  notifyAllwainOrderParticipants,
  notifyAllwainUser,
} from "./allwain-notifications.service";
import { normalizeAllwainPreorderChargeDeadline } from "./allwain-preorders";
import { assertAllwainReviewedTotal } from "./allwain-payment-state";
import {
  ALLWAIN_STRIPE_TEST_TREATMENT_CODE,
  allwainBusinessOfRecord,
  allwainStripeTestCheckoutEnabled,
  allwainStripeTestOfferEnabled,
  isAllwainStripeTestDetermination,
  normalizeAllwainCommercialModel,
} from "./allwain-money";

const FISCAL_KINDS = new Set(["consumer", "business"]);
const LEGAL_FORMS = new Set([
  "individual",
  "self_employed",
  "company",
  "association",
  "cooperative",
  "other",
]);
const VAT_REGIMES = new Set([
  "general",
  "reagp",
  "exempt",
  "non_taxable",
  "other",
  "unknown",
]);
const REAGP_ACTIVITIES = new Set([
  "agricultural_forestry",
  "livestock_fishing",
]);
const BUYER_CAPACITIES = new Set(["consumer", "business"]);
const PRODUCT_KINDS = new Set(["food", "goods", "service", "other"]);
const TAX_MODES = new Set(["none", "included", "added"]);
const COMPENSATION_MODES = new Set(["none", "added"]);
const TAX_BASE_SOURCES = new Set(["product", "shipping"]);
const FISCAL_DOCUMENT_TYPES = new Set([
  "invoice",
  "simplified_invoice",
  "purchase_receipt",
  "reagp_compensation_receipt",
  "platform_service_invoice",
]);
const DOCUMENT_PARTIES = new Set(["buyer", "seller", "platform"]);
const INCIDENT_TYPES = new Set([
  "cancellation",
  "not_delivered",
  "rejected_delivery",
  "quality",
  "wrong_quantity",
  "payment",
  "other",
]);
const INCIDENT_STATUSES = new Set([
  "open",
  "in_review",
  "resolved",
  "rejected",
]);

function cleanText(value: unknown, max = 250) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function cleanCountry(value: unknown) {
  const country = String(value || "ES")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("INVALID_COUNTRY_CODE");
  return country;
}

function cleanTaxId(value: unknown) {
  const taxId = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!taxId) return null;
  if (!/^[A-Z0-9.\-/]{5,24}$/.test(taxId)) throw new Error("INVALID_TAX_ID");
  return taxId;
}

function cleanEmail(value: unknown) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("INVALID_INVOICE_EMAIL");
  return email.slice(0, 320);
}

function safeJson(value: unknown) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function snapshotHash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(canonicalAllwainAuditJson(value))
    .digest("hex");
}

function fiscalProfileDto(profile: any) {
  if (!profile) return null;
  return {
    id: profile.id,
    kind: profile.kind,
    status: profile.status,
    legalForm: profile.legalForm,
    legalName: profile.legalName,
    tradeName: profile.tradeName,
    taxIdType: profile.taxIdType,
    taxId: profile.taxId,
    vatId: profile.vatId,
    countryCode: profile.countryCode,
    taxTerritory: profile.taxTerritory,
    vatRegime: profile.vatRegime,
    reagpActivity: profile.reagpActivity,
    ownProduction: profile.ownProduction,
    invoiceEmail: profile.invoiceEmail,
    billingAddress: profile.billingAddress,
    version: profile.version,
    attestedAt: profile.attestedAt,
    documentMandateVersion: profile.documentMandateVersion,
    documentMandateAcceptedAt: profile.documentMandateAcceptedAt,
    documentMandateRevokedAt: profile.documentMandateRevokedAt,
    documentMandateActive: hasActiveAllwainDocumentMandate(profile),
    verifiedAt: profile.verifiedAt,
    updatedAt: profile.updatedAt,
  };
}

function fiscalProfileComplete(profile: any) {
  if (!profile) return false;
  if (profile.kind === "consumer")
    return Boolean(profile.legalName && profile.countryCode);
  if (
    !profile.legalForm ||
    !profile.legalName ||
    !profile.taxId ||
    !profile.countryCode
  )
    return false;
  if (!profile.vatRegime || profile.vatRegime === "unknown") return false;
  if (profile.vatRegime === "reagp") {
    return Boolean(profile.reagpActivity && profile.ownProduction === true);
  }
  return true;
}

export function isAllwainFiscalProfileReady(profile: any) {
  return (
    fiscalProfileComplete(profile) &&
    ["attested", "verified"].includes(profile.status)
  );
}

export function hasActiveAllwainDocumentMandate(profile: any) {
  return Boolean(
    profile?.documentMandateVersion === ENV.ALLWAIN_DOCUMENT_MANDATE_VERSION &&
      profile?.documentMandateAcceptedAt &&
      !profile?.documentMandateRevokedAt &&
      profile?.documentMandateEvidenceHash,
  );
}

export async function getAllwainComplianceProfile(userId: string) {
  const prisma = getPrisma() as any;
  const [user, profiles, buyer, seller, payment] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.allwainFiscalProfile.findMany({
      where: { userId },
      orderBy: { kind: "asc" },
    }),
    prisma.allwainBuyerProfile.findUnique({ where: { userId } }),
    prisma.allwainSellerProfile.findUnique({ where: { userId } }),
    prisma.allwainSellerPaymentAccount.findUnique({ where: { userId } }),
  ]);
  if (!user) throw new Error("USER_NOT_FOUND");
  const business =
    profiles.find((item: any) => item.kind === "business") || null;
  const consumer =
    profiles.find((item: any) => item.kind === "consumer") || null;
  return {
    profiles: profiles.map(fiscalProfileDto),
    defaults: {
      buyerFiscalProfileId: buyer?.defaultFiscalProfileId || null,
      sellerFiscalProfileId: seller?.defaultFiscalProfileId || null,
    },
    readiness: {
      consumer: isAllwainFiscalProfileReady(consumer),
      business: isAllwainFiscalProfileReady(business),
      documentMandate: hasActiveAllwainDocumentMandate(business),
      sellerFiscal:
        isAllwainFiscalProfileReady(business) &&
        hasActiveAllwainDocumentMandate(business),
      sellerPayments: Boolean(
        payment?.chargesEnabled &&
          payment?.transfersEnabled &&
          payment?.payoutsEnabled,
      ),
      sellerReady: Boolean(
        isAllwainFiscalProfileReady(business) &&
          hasActiveAllwainDocumentMandate(business) &&
          payment?.chargesEnabled &&
          payment?.transfersEnabled &&
        payment?.payoutsEnabled,
      ),
    },
    attestationVersion: ENV.ALLWAIN_FISCAL_ATTESTATION_VERSION,
    documentMandateVersion: ENV.ALLWAIN_DOCUMENT_MANDATE_VERSION,
  };
}

export async function saveAllwainFiscalProfile(
  userId: string,
  input: Record<string, unknown>,
  requestId?: string,
  context: { clientAddress?: string | null; userAgent?: string | null } = {},
) {
  const prisma = getPrisma() as any;
  const kind = String(input.kind || "business").toLowerCase();
  if (!FISCAL_KINDS.has(kind)) throw new Error("INVALID_FISCAL_PROFILE_KIND");
  const legalForm = cleanText(input.legalForm, 40);
  if (legalForm && !LEGAL_FORMS.has(legalForm))
    throw new Error("INVALID_LEGAL_FORM");
  const vatRegime = String(input.vatRegime || "unknown").toLowerCase();
  if (!VAT_REGIMES.has(vatRegime)) throw new Error("INVALID_VAT_REGIME");
  const reagpActivity = cleanText(input.reagpActivity, 40);
  if (reagpActivity && !REAGP_ACTIVITIES.has(reagpActivity)) {
    throw new Error("INVALID_REAGP_ACTIVITY");
  }
  const attest = input.attest === true;
  const acceptDocumentMandate = input.documentMandateAccepted === true;
  const revokeDocumentMandate = input.documentMandateRevoked === true;
  if (acceptDocumentMandate && revokeDocumentMandate) {
    throw new Error("INVALID_DOCUMENT_MANDATE_ACTION");
  }
  if (kind !== "business" && (acceptDocumentMandate || revokeDocumentMandate)) {
    throw new Error("INVALID_DOCUMENT_MANDATE_PROFILE");
  }
  const normalized = {
    kind,
    legalForm,
    legalName: cleanText(input.legalName, 200),
    tradeName: cleanText(input.tradeName, 200),
    taxIdType: cleanText(input.taxIdType, 30),
    taxId: cleanTaxId(input.taxId),
    vatId: cleanTaxId(input.vatId),
    countryCode: cleanCountry(input.countryCode),
    taxTerritory: cleanText(input.taxTerritory, 100),
    vatRegime,
    reagpActivity: vatRegime === "reagp" ? reagpActivity : null,
    ownProduction:
      vatRegime === "reagp"
        ? input.ownProduction === true
          ? true
          : input.ownProduction === false
            ? false
            : null
        : null,
    invoiceEmail: cleanEmail(input.invoiceEmail),
    billingAddress: safeJson(input.billingAddress),
  };
  if (attest && !fiscalProfileComplete(normalized))
    throw new Error("INCOMPLETE_FISCAL_PROFILE");

  const result = await prisma.$transaction(async (tx: any) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("USER_NOT_FOUND");
    const current = await tx.allwainFiscalProfile.findUnique({
      where: { userId_kind: { userId, kind } },
    });
    const currentMandateActive = hasActiveAllwainDocumentMandate(current);
    if (
      attest &&
      kind === "business" &&
      !acceptDocumentMandate &&
      !currentMandateActive
    ) {
      throw new Error("DOCUMENT_MANDATE_REQUIRED");
    }
    const mandateAcceptedAt = acceptDocumentMandate
      ? new Date()
      : current?.documentMandateAcceptedAt || null;
    const mandateVersion = acceptDocumentMandate
      ? ENV.ALLWAIN_DOCUMENT_MANDATE_VERSION
      : current?.documentMandateVersion || null;
    const mandateRevokedAt = revokeDocumentMandate
      ? new Date()
      : acceptDocumentMandate
        ? null
        : current?.documentMandateRevokedAt || null;
    const status = attest
      ? "attested"
      : current?.status === "verified"
        ? "verified"
        : "draft";
    const profile = await tx.allwainFiscalProfile.upsert({
      where: { userId_kind: { userId, kind } },
      create: {
        userId,
        ...normalized,
        status,
        version: 1,
        attestationVersion: attest
          ? ENV.ALLWAIN_FISCAL_ATTESTATION_VERSION
          : null,
        attestedAt: attest ? new Date() : null,
        documentMandateVersion: mandateVersion,
        documentMandateAcceptedAt: mandateAcceptedAt,
        documentMandateRevokedAt: mandateRevokedAt,
      },
      update: {
        ...normalized,
        status,
        version: { increment: 1 },
        attestationVersion: attest
          ? ENV.ALLWAIN_FISCAL_ATTESTATION_VERSION
          : current?.attestationVersion,
        attestedAt: attest ? new Date() : current?.attestedAt,
        documentMandateVersion: mandateVersion,
        documentMandateAcceptedAt: mandateAcceptedAt,
        documentMandateRevokedAt: mandateRevokedAt,
        restrictedAt: null,
      },
    });

    let savedProfile = profile;
    if (acceptDocumentMandate) {
      const evidence = {
        profileId: profile.id,
        profileVersion: profile.version,
        userId,
        kind,
        documentVersion: ENV.ALLWAIN_DOCUMENT_MANDATE_VERSION,
        legalName: profile.legalName,
        taxIdHash: profile.taxId ? snapshotHash(profile.taxId) : null,
        statement:
          "Autorizo a Allwain a generar, conservar y poner a disposición los documentos previstos para mis operaciones en mi nombre, sin sustituir mis obligaciones legales.",
        requestId: requestId || null,
        clientAddressHash: hashedClientAddress(context.clientAddress),
        userAgent: cleanText(context.userAgent, 500),
        acceptedAt: mandateAcceptedAt?.toISOString(),
      };
      const evidenceHash = snapshotHash(evidence);
      await tx.allwainConsentEvidence.create({
        data: {
          userId,
          consentType: "fiscal_document_generation_mandate",
          documentVersion: ENV.ALLWAIN_DOCUMENT_MANDATE_VERSION,
          granted: true,
          evidence,
          evidenceHash,
          idempotencyKey: `allwain-document-mandate:${profile.id}:${profile.version}:accepted`,
        },
      });
      savedProfile = await tx.allwainFiscalProfile.update({
        where: { id: profile.id },
        data: { documentMandateEvidenceHash: evidenceHash },
      });
    } else if (revokeDocumentMandate) {
      const evidence = {
        profileId: profile.id,
        profileVersion: profile.version,
        userId,
        kind,
        documentVersion:
          profile.documentMandateVersion || ENV.ALLWAIN_DOCUMENT_MANDATE_VERSION,
        requestId: requestId || null,
        clientAddressHash: hashedClientAddress(context.clientAddress),
        userAgent: cleanText(context.userAgent, 500),
        revokedAt: mandateRevokedAt?.toISOString(),
      };
      await tx.allwainConsentEvidence.create({
        data: {
          userId,
          consentType: "fiscal_document_generation_mandate",
          documentVersion: String(evidence.documentVersion),
          granted: false,
          evidence,
          evidenceHash: snapshotHash(evidence),
          idempotencyKey: `allwain-document-mandate:${profile.id}:${profile.version}:revoked`,
        },
      });
    }

    if (kind === "consumer") {
      await tx.allwainBuyerProfile.upsert({
        where: { userId },
        create: {
          userId,
          status: "active",
          defaultFiscalProfileId: profile.id,
        },
        update: { defaultFiscalProfileId: profile.id },
      });
    } else {
      const payment = await tx.allwainSellerPaymentAccount.findUnique({
        where: { userId },
      });
      const sellerStatus =
        isAllwainFiscalProfileReady(savedProfile) &&
        hasActiveAllwainDocumentMandate(savedProfile) &&
        payment?.chargesEnabled &&
        payment?.transfersEnabled &&
        payment?.payoutsEnabled
          ? "active"
          : "onboarding";
      await tx.allwainSellerProfile.updateMany({
        where: { userId, status: { not: "not_activated" } },
        data: {
          defaultFiscalProfileId: savedProfile.id,
          fiscalStatus: savedProfile.status,
          status: sellerStatus,
          verifiedAt: sellerStatus === "active" ? new Date() : null,
          restrictedAt: null,
        },
      });
    }
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "user_compliance",
      aggregateId: userId,
      eventType: attest ? "fiscal_profile.attested" : "fiscal_profile.saved",
      actorUserId: userId,
      actorRole: user.role,
      source: "allwain_compliance",
      requestId,
      payload: {
        profileId: savedProfile.id,
        kind: savedProfile.kind,
        status: savedProfile.status,
        version: savedProfile.version,
        countryCode: savedProfile.countryCode,
        vatRegime: savedProfile.vatRegime,
        taxIdHash: savedProfile.taxId ? snapshotHash(savedProfile.taxId) : null,
        documentMandateActive: hasActiveAllwainDocumentMandate(savedProfile),
      },
    });
    return savedProfile;
  });
  return fiscalProfileDto(result);
}

export async function saveAllwainProductCompliance(
  userId: string,
  offerId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const prisma = getPrisma() as any;
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.owner !== "allwain" || offer.ownerUserId !== userId) {
    throw new Error("OFFER_NOT_FOUND");
  }
  const normalized = normalizeAllwainProductComplianceInput(input);
  const profile = await prisma.allwainProductComplianceProfile.upsert({
    where: { offerId },
    create: { offerId, sellerUserId: userId, ...normalized },
    update: { ...normalized, version: { increment: 1 } },
  });
  await appendAllwainAuditEvent({
    aggregateType: "offer_compliance",
    aggregateId: offerId,
    eventType: "product_compliance.saved",
    actorUserId: userId,
    actorRole: "seller",
    source: "allwain_compliance",
    requestId,
    payload: {
      offerId,
      version: profile.version,
      productKind: profile.productKind,
      onlineInfoComplete: profile.onlineInfoComplete,
      lotTrackingRequired: profile.lotTrackingRequired,
    },
  });
  return profile;
}

export function normalizeAllwainProductComplianceInput(
  input: Record<string, unknown>,
) {
  const productKind = String(input.productKind || "other").toLowerCase();
  if (!PRODUCT_KINDS.has(productKind)) throw new Error("INVALID_PRODUCT_KIND");
  const normalized = {
    productKind,
    foodCategory: cleanText(input.foodCategory, 100),
    ownProduction:
      input.ownProduction === true
        ? true
        : input.ownProduction === false
          ? false
          : null,
    producerName: cleanText(input.producerName, 200),
    originCountry: input.originCountry
      ? cleanCountry(input.originCountry)
      : null,
    originRegion: cleanText(input.originRegion, 150),
    responsibleOperator: cleanText(input.responsibleOperator, 250),
    registrationNumber: cleanText(input.registrationNumber, 80),
    ingredients: cleanText(input.ingredients, 4_000),
    allergens: safeJson(input.allergens),
    nutrition: safeJson(input.nutrition),
    nominalQuantity:
      input.nominalQuantity === null || input.nominalQuantity === undefined
        ? null
        : Number(input.nominalQuantity),
    nominalUnit: cleanText(input.nominalUnit, 30),
    storageInstructions: cleanText(input.storageInstructions, 1_000),
    onlineInfoComplete: input.onlineInfoComplete === true,
    lotTrackingRequired: input.lotTrackingRequired === true,
    metadata: safeJson(input.metadata),
  };
  if (
    normalized.nominalQuantity !== null &&
    (!Number.isFinite(normalized.nominalQuantity) ||
      normalized.nominalQuantity <= 0)
  ) {
    throw new Error("INVALID_NOMINAL_QUANTITY");
  }
  return normalized;
}

export function assertAllwainProductCompliancePublishable(
  profile: Record<string, any>,
) {
  if (profile.productKind !== "food") return;
  if (
    !profile.foodCategory ||
    profile.ownProduction === null ||
    !profile.originCountry ||
    !profile.responsibleOperator ||
    profile.onlineInfoComplete !== true ||
    profile.lotTrackingRequired !== true
  ) {
    throw new Error("INCOMPLETE_PRODUCT_COMPLIANCE");
  }
}

function profileSnapshot(profile: any, user: any, fallbackCapacity: string) {
  return {
    userId: user?.id || null,
    displayName: profile?.tradeName || profile?.legalName || user?.name || null,
    email: profile?.invoiceEmail || user?.email || null,
    actingCapacity: profile?.kind || fallbackCapacity,
    legalForm: profile?.legalForm || null,
    legalName: profile?.legalName || user?.name || null,
    tradeName: profile?.tradeName || null,
    taxIdType: profile?.taxIdType || null,
    taxId: profile?.taxId || null,
    vatId: profile?.vatId || null,
    countryCode: profile?.countryCode || "ES",
    taxTerritory: profile?.taxTerritory || null,
    vatRegime: profile?.vatRegime || "unknown",
    reagpActivity: profile?.reagpActivity || null,
    ownProduction: profile?.ownProduction ?? null,
    billingAddress: profile?.billingAddress || null,
    documentMandateVersion: profile?.documentMandateVersion || null,
    documentMandateAcceptedAt:
      profile?.documentMandateAcceptedAt?.toISOString?.() ||
      profile?.documentMandateAcceptedAt ||
      null,
    documentMandateEvidenceHash: profile?.documentMandateEvidenceHash || null,
    documentMandateRevokedAt:
      profile?.documentMandateRevokedAt?.toISOString?.() ||
      profile?.documentMandateRevokedAt ||
      null,
    profileId: profile?.id || null,
    profileVersion: profile?.version || null,
    capturedAt: new Date().toISOString(),
  };
}

function matchesCondition(actual: unknown, expected: unknown) {
  if (Array.isArray(expected)) return expected.includes(actual);
  if (expected === null || expected === undefined || expected === "*")
    return true;
  return actual === expected;
}

function ruleMatches(rule: any, input: any) {
  const conditions = rule?.conditions || {};
  return Object.entries(conditions).every(([key, expected]) =>
    matchesCondition(input[key], expected),
  );
}

function normalizedDocumentPlan(outcome: any) {
  if (!Array.isArray(outcome?.requiredDocuments) || !outcome.requiredDocuments.length) {
    return null;
  }
  const seenTypes = new Set<string>();
  const plan = outcome.requiredDocuments.map((entry: any) => {
    const documentType = String(entry?.documentType || entry?.type || "");
    const issuer = String(entry?.issuer || "");
    const recipient = String(entry?.recipient || "");
    const amountSource = String(entry?.amountSource || "order_total");
    const signatureBy = String(entry?.signatureBy || issuer);
    const documentTaxMode = String(
      entry?.taxMode || (amountSource === "platform_fee" ? "" : "order"),
    );
    const documentTaxRateBps = Number(entry?.taxRateBps ?? 0);
    if (
      !FISCAL_DOCUMENT_TYPES.has(documentType) ||
      !DOCUMENT_PARTIES.has(issuer) ||
      !DOCUMENT_PARTIES.has(recipient) ||
      !DOCUMENT_PARTIES.has(signatureBy) ||
      issuer === recipient ||
      !["order_total", "product", "platform_fee", "compensation"].includes(
        amountSource,
      ) ||
      !["order", "none", "included"].includes(documentTaxMode) ||
      !Number.isInteger(documentTaxRateBps) ||
      documentTaxRateBps < 0 ||
      documentTaxRateBps > 10_000 ||
      (amountSource === "platform_fee" && documentTaxMode === "order") ||
      (documentTaxMode === "none" && documentTaxRateBps !== 0)
    ) {
      throw new Error("INVALID_TAX_DOCUMENT_PLAN");
    }
    if (seenTypes.has(documentType)) throw new Error("INVALID_TAX_DOCUMENT_PLAN");
    seenTypes.add(documentType);
    const legalBasis = cleanText(entry?.legalBasis || outcome?.legalBasis, 1_000);
    if (!legalBasis) throw new Error("INVALID_TAX_DOCUMENT_PLAN");
    return {
      documentType,
      issuer,
      recipient,
      amountSource,
      signatureRequired: entry?.signatureRequired === true,
      signatureBy,
      taxMode: documentTaxMode,
      taxRateBps: documentTaxRateBps,
      series: cleanText(entry?.series, 20),
      legalBasis,
    };
  });
  return plan;
}

function normalizedTaxBaseSources(value: unknown, mode: string) {
  if (mode === "none") {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length !== 0) {
      throw new Error("INVALID_TAX_BASE_SOURCES");
    }
    return [];
  }
  if (!Array.isArray(value) || !value.length) {
    throw new Error("INVALID_TAX_BASE_SOURCES");
  }
  const sources = [...new Set(value.map((item) => String(item)))];
  if (sources.length !== value.length || sources.some((item) => !TAX_BASE_SOURCES.has(item))) {
    throw new Error("INVALID_TAX_BASE_SOURCES");
  }
  return sources;
}

function amountForTaxSources(
  sources: string[],
  amounts: { product: number; shipping: number },
) {
  return sources.reduce((total, source) => total + amounts[source as keyof typeof amounts], 0);
}

export function calculateAllwainTaxSettlement(order: any, outcome: any) {
  const commercialModel = normalizeAllwainCommercialModel(
    order.commercialModel,
  );
  const platformDirect = commercialModel === "platform_direct";
  const businessOfRecord = allwainBusinessOfRecord(commercialModel);
  const taxMode = String(outcome?.taxMode || "");
  const compensationMode = String(outcome?.compensationMode || "");
  const taxRateBps = Number(outcome?.taxRateBps ?? 0);
  const compensationRateBps = Number(
    outcome?.agriculturalCompensationRateBps ?? 0,
  );
  if (
    !TAX_MODES.has(taxMode) ||
    !COMPENSATION_MODES.has(compensationMode) ||
    ![taxRateBps, compensationRateBps].every(
      (rate) => Number.isInteger(rate) && rate >= 0 && rate <= 10_000,
    ) ||
    (taxMode === "none" && taxRateBps !== 0) ||
    (compensationMode === "none" && compensationRateBps !== 0)
  ) {
    throw new Error("INVALID_TAX_RULE_OUTCOME");
  }
  const documentPlan = normalizedDocumentPlan(outcome);
  if (!documentPlan) throw new Error("INVALID_TAX_DOCUMENT_PLAN");

  const productAmount = Number(order.subtotalAmount);
  const shippingAmount = Number(order.shippingAmount || 0);
  const carrierDeliveryAmount = Number(order.carrierDeliveryAmount || 0);
  const taxBaseSources = normalizedTaxBaseSources(outcome?.taxBaseSources, taxMode);
  const compensationBaseSources = normalizedTaxBaseSources(
    outcome?.compensationBaseSources,
    compensationMode,
  );
  const taxableBaseAmount = amountForTaxSources(taxBaseSources, {
    product: productAmount,
    shipping: shippingAmount,
  });
  const compensationBaseAmount = amountForTaxSources(compensationBaseSources, {
    product: productAmount,
    shipping: shippingAmount,
  });
  const taxAmount =
    taxMode === "included" && taxRateBps > 0
      ? Math.round((taxableBaseAmount * taxRateBps) / (10_000 + taxRateBps))
      : taxMode === "added"
        ? Math.round((taxableBaseAmount * taxRateBps) / 10_000)
        : 0;
  const compensationAmount =
    compensationMode === "added"
      ? Math.round((compensationBaseAmount * compensationRateBps) / 10_000)
      : 0;
  const platformFeePayer = String(order.platformFeePayer || "seller");
  if (!["seller", "buyer", "platform"].includes(platformFeePayer)) {
    throw new Error("INVALID_PLATFORM_FEE_PAYER");
  }
  const platformFeeAmount = platformDirect
    ? 0
    : Number(order.platformFeeAmount || 0);
  const buyerPlatformFeeAmount =
    !platformDirect && platformFeePayer === "buyer" ? platformFeeAmount : 0;
  const grossAmount =
    productAmount +
    shippingAmount +
    (taxMode === "added" ? taxAmount : 0) +
    compensationAmount +
    buyerPlatformFeeAmount;
  const connectorPlatformShareAmount = platformDirect
    ? 0
    : Number(order.connectorPlatformShareAmount || 0);
  const connectorDeliveryAmount = Number(order.connectorDeliveryAmount || 0);
  const connectorAmount =
    connectorPlatformShareAmount + connectorDeliveryAmount;
  const platformNetFeeAmount =
    platformFeeAmount - connectorPlatformShareAmount;
  const sellerAmount = platformDirect
    ? 0
    : platformFeePayer === "buyer"
      ? productAmount +
        (taxMode === "added" ? taxAmount : 0) +
        compensationAmount
      : grossAmount -
        platformFeeAmount -
        connectorDeliveryAmount -
        carrierDeliveryAmount;
  const platformRetainedAmount = platformDirect
    ? grossAmount - connectorAmount - carrierDeliveryAmount
    : platformNetFeeAmount;
  if (
    ![
      grossAmount,
      platformNetFeeAmount,
      platformRetainedAmount,
      sellerAmount,
      connectorPlatformShareAmount,
      connectorDeliveryAmount,
      carrierDeliveryAmount,
    ].every(
      (amount) => Number.isSafeInteger(amount) && amount >= 0,
    ) ||
    connectorAmount !== Number(order.connectorFeeAmount || 0) ||
    sellerAmount + platformRetainedAmount + connectorAmount + carrierDeliveryAmount !==
      grossAmount
  ) {
    throw new Error("INVALID_SETTLEMENT_ALLOCATION");
  }
  return {
    taxMode,
    compensationMode,
    taxRateBps,
    compensationRateBps,
    taxBaseSources,
    compensationBaseSources,
    taxableBaseAmount,
    compensationBaseAmount,
    taxAmount,
    compensationAmount,
    grossAmount,
    productAmount,
    shippingAmount,
    carrierDeliveryAmount,
    commercialModel,
    businessOfRecord,
    platformFeeAmount,
    feeBasis: String(order.feeBasis || "sale_amount"),
    platformFeePayer,
    referenceAmount: order.referenceAmount ?? null,
    acceptedOfferAmount: order.acceptedOfferAmount ?? null,
    grossSavingsAmount: order.grossSavingsAmount ?? null,
    netSavingsAmount: order.netSavingsAmount ?? null,
    platformNetFeeAmount,
    platformRetainedAmount,
    connectorAmount,
    connectorPlatformShareAmount,
    connectorDeliveryAmount,
    sellerAmount,
    documentPlan,
  };
}

async function applySettlementDeterminationTx(
  tx: any,
  order: any,
  determination: any,
  rule: any,
) {
  if (determination.status !== "determined") return null;
  const calculated = calculateAllwainTaxSettlement(order, determination.outputSnapshot || {});
  const [partySnapshots, orderLines] = await Promise.all([
    tx.allwainPartySnapshot.findMany({
      where: { orderId: order.id },
      select: { role: true, snapshotHash: true },
      orderBy: { role: "asc" },
    }),
    tx.allwainOrderLine.findMany({
      where: { orderId: order.id },
      select: { id: true, productSnapshotHash: true },
      orderBy: { id: "asc" },
    }),
  ]);
  const formulaSnapshot = {
    architecture: "separate_charges_and_transfers",
    commercialModel: calculated.commercialModel,
    businessOfRecord: calculated.businessOfRecord,
    processorFeePayer: "platform",
    feeBasis: calculated.feeBasis,
    platformFeePayer: calculated.platformFeePayer,
    referenceAmount: calculated.referenceAmount,
    acceptedOfferAmount: calculated.acceptedOfferAmount,
    grossSavingsAmount: calculated.grossSavingsAmount,
    netSavingsAmount: calculated.netSavingsAmount,
    platformFeeBps: order.platformFeeBps,
    taxMode: calculated.taxMode,
    taxRateBps: calculated.taxRateBps,
    taxBaseSources: calculated.taxBaseSources,
    taxableBaseAmount: calculated.taxableBaseAmount,
    compensationMode: calculated.compensationMode,
    agriculturalCompensationRateBps: calculated.compensationRateBps,
    compensationBaseSources: calculated.compensationBaseSources,
    compensationBaseAmount: calculated.compensationBaseAmount,
    productAmount: calculated.productAmount,
    shippingAmount: calculated.shippingAmount,
    carrierDeliveryAmount: calculated.carrierDeliveryAmount,
    taxAmount: calculated.taxAmount,
    agriculturalCompensationAmount: calculated.compensationAmount,
    grossAmount: calculated.grossAmount,
    platformFeeAmount: calculated.platformFeeAmount,
    connectorAmount: calculated.connectorAmount,
    connectorPlatformShareAmount:
      calculated.connectorPlatformShareAmount,
    connectorDeliveryAmount: calculated.connectorDeliveryAmount,
    platformNetFeeAmount: calculated.platformNetFeeAmount,
    platformRetainedAmount: calculated.platformRetainedAmount,
    sellerAmount: calculated.sellerAmount,
    taxRuleCode: rule?.code || null,
    taxRuleVersion: rule?.version || null,
    professionalApprovalReference:
      determination.professionalApprovalReference ||
      rule?.advisorReference ||
      null,
    taxDeterminationId: determination.id,
    taxDeterminationOutputHash: snapshotHash(
      determination.outputSnapshot || null,
    ),
    documentPlanHash: snapshotHash(determination.documentPlan || null),
    partySnapshotHashes: Object.fromEntries(
      partySnapshots.map((item: any) => [item.role, item.snapshotHash]),
    ),
    orderLineSnapshotHashes: orderLines.map((item: any) => ({
      id: item.id,
      hash: item.productSnapshotHash,
    })),
    commercialTermsVersion: order.commercialTermsVersion,
  };
  const settlementHash = snapshotHash(formulaSnapshot);
  const current = await tx.allwainSettlementPlan.findFirst({
    where: { orderId: order.id },
    orderBy: { version: "desc" },
  });
  if (["checkout_locked", "locked"].includes(current?.status || "")) {
    if (current.snapshotHash !== settlementHash) {
      throw new Error("LOCKED_SETTLEMENT_MISMATCH");
    }
    return current;
  }
  const version = current?.version || 1;
  const data = {
    status: "ready",
    grossAmount: calculated.grossAmount,
    productAmount: calculated.productAmount,
    shippingAmount: calculated.shippingAmount,
    carrierDeliveryAmount: calculated.carrierDeliveryAmount,
    taxAmount: calculated.taxAmount,
    agriculturalCompensationAmount: calculated.compensationAmount,
    platformFeeAmount: calculated.platformFeeAmount,
    connectorAmount: calculated.connectorAmount,
    connectorPlatformShareAmount:
      calculated.connectorPlatformShareAmount,
    connectorDeliveryAmount: calculated.connectorDeliveryAmount,
    platformNetFeeAmount: calculated.platformNetFeeAmount,
    platformRetainedAmount: calculated.platformRetainedAmount,
    sellerAmount: calculated.sellerAmount,
    feeBasis: calculated.feeBasis,
    platformFeePayer: calculated.platformFeePayer,
    referenceAmount: calculated.referenceAmount,
    acceptedOfferAmount: calculated.acceptedOfferAmount,
    grossSavingsAmount: calculated.grossSavingsAmount,
    netSavingsAmount: calculated.netSavingsAmount,
    commercialModel: calculated.commercialModel,
    businessOfRecord: calculated.businessOfRecord,
    currency: order.currency,
    formulaSnapshot,
    snapshotHash: settlementHash,
    professionalApprovalReference:
      determination.professionalApprovalReference ||
      rule?.advisorReference ||
      null,
    approvedAt: determination.determinedAt || new Date(),
  };
  const settlement = current
    ? await tx.allwainSettlementPlan.update({ where: { id: current.id }, data })
    : await tx.allwainSettlementPlan.create({
        data: { orderId: order.id, version, ...data },
      });
  await tx.allwainOrder.update({
    where: { id: order.id },
    data: {
      taxStatus: "determined",
      settlementStatus: "ready",
      shippingAmount: calculated.shippingAmount,
      carrierDeliveryAmount: calculated.carrierDeliveryAmount,
      taxAmount: calculated.taxAmount,
      agriculturalCompensationAmount: calculated.compensationAmount,
      totalAmount: calculated.grossAmount,
      platformNetFeeAmount: calculated.platformNetFeeAmount,
      platformRetainedAmount: calculated.platformRetainedAmount,
      sellerAmount: calculated.sellerAmount,
      settlementPlanVersion: settlement.version,
      settlementSnapshotHash: settlementHash,
      commercialModel: calculated.commercialModel,
      businessOfRecord: calculated.businessOfRecord,
      processorFeePayer: "platform",
    },
  });
  return settlement;
}

async function determineTaxTx(tx: any, order: any, input: any) {
  let status = "manual_review";
  let rule: any = null;
  let treatmentCode: string | null = null;
  let taxAmount = 0;
  let compensationAmount = 0;
  let explanation =
    "La operación necesita revisión antes de emitir documentación fiscal.";

  if (input.testOnlyNonFiscal === true) {
    // A deterministic, explicitly non-fiscal rule lets real user offers reach
    // Stripe TEST without inventing tax identities or professional approval.
    // The webhook path never issues the planned placeholder document.
    rule = {
      code: ALLWAIN_STRIPE_TEST_TREATMENT_CODE,
      version: "2026-09-10",
      advisorReference: "stripe-test-no-legal-effect",
      requiresProfessionalReview: false,
      outcome: {
        testOnlyNonFiscal: true,
        treatmentCode: ALLWAIN_STRIPE_TEST_TREATMENT_CODE,
        taxMode: "none",
        compensationMode: "none",
        taxRateBps: 0,
        agriculturalCompensationRateBps: 0,
        taxBaseSources: [],
        compensationBaseSources: [],
        requiredDocuments: [
          {
            documentType: "simplified_invoice",
            issuer: "platform",
            recipient: "buyer",
            amountSource: "order_total",
            signatureRequired: false,
            signatureBy: "platform",
            taxMode: "none",
            taxRateBps: 0,
            series: "TEST",
            legalBasis:
              "Stripe TEST: marcador técnico sin validez fiscal; no se emite.",
          },
        ],
      },
    };
    status = "determined";
    treatmentCode = ALLWAIN_STRIPE_TEST_TREATMENT_CODE;
    explanation =
      "Operación de comercio Stripe TEST, sin identidad ni documento fiscal.";
  } else if (!input.sellerFiscalReady) {
    status = "pending_profile";
    explanation = "Falta confirmar el perfil fiscal del vendedor.";
  } else if (input.buyerCapacity === "business" && !input.buyerFiscalReady) {
    status = "pending_profile";
    explanation = "Faltan los datos fiscales del comprador profesional.";
  } else {
    const rules = await tx.allwainTaxRuleVersion.findMany({
      where: {
        status: "active",
        advisorApprovedAt: { not: null },
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: new Date() } }],
        AND: [
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
        ],
      },
      orderBy: [{ priority: "asc" }, { version: "desc" }],
    });
    rule =
      rules.find((candidate: any) => {
        if (input.businessOfRecord === "platform") {
          const expected = candidate?.conditions?.businessOfRecord;
          const explicitlyCoversPlatform = Array.isArray(expected)
            ? expected.includes("platform")
            : expected === "platform";
          if (!explicitlyCoversPlatform) return false;
        }
        return ruleMatches(candidate, input);
      }) || null;
    if (rule) {
      const outcome = rule.outcome || {};
      try {
        const calculated = calculateAllwainTaxSettlement(order, outcome);
        taxAmount = calculated.taxAmount;
        compensationAmount = calculated.compensationAmount;
        treatmentCode = String(outcome.treatmentCode || rule.code);
        status =
          rule.requiresProfessionalReview || !ENV.ALLWAIN_TAX_AUTOMATION_ENABLED
            ? "manual_review"
            : "determined";
        explanation = String(
          outcome.explanation || `Regla ${rule.code} v${rule.version}.`,
        ).slice(0, 1_000);
      } catch (error: any) {
        status = "manual_review";
        explanation = `La regla fiscal no está completa: ${String(error?.message || error)}`.slice(
          0,
          1_000,
        );
      }
    }
  }

  const determination = await tx.allwainTaxDetermination.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      status,
      ruleVersionId: rule?.id || null,
      treatmentCode,
      taxableBaseAmount:
        status === "determined"
          ? calculateAllwainTaxSettlement(order, rule?.outcome || {}).taxableBaseAmount
          : order.subtotalAmount,
      taxAmount,
      agriculturalCompensationAmount: compensationAmount,
      currency: order.currency,
      explanation,
      inputSnapshot: safeJson(input),
      outputSnapshot: safeJson(rule?.outcome || null),
      professionalApprovalReference: rule?.advisorReference || null,
      documentPlan:
        status === "determined"
          ? safeJson(normalizedDocumentPlan(rule?.outcome || {}))
          : null,
      determinedAt: status === "determined" ? new Date() : null,
    },
    update: {
      status,
      ruleVersionId: rule?.id || null,
      treatmentCode,
      taxableBaseAmount:
        status === "determined"
          ? calculateAllwainTaxSettlement(order, rule?.outcome || {}).taxableBaseAmount
          : order.subtotalAmount,
      taxAmount,
      agriculturalCompensationAmount: compensationAmount,
      explanation,
      inputSnapshot: safeJson(input),
      outputSnapshot: safeJson(rule?.outcome || null),
      professionalApprovalReference: rule?.advisorReference || null,
      documentPlan:
        status === "determined"
          ? safeJson(normalizedDocumentPlan(rule?.outcome || {}))
          : null,
      determinedAt: status === "determined" ? new Date() : null,
    },
  });
  await tx.allwainOrder.update({
    where: { id: order.id },
    data: { taxStatus: status },
  });
  await applySettlementDeterminationTx(tx, order, determination, rule);
  return determination;
}

export async function ensureAllwainOrderComplianceTx(tx: any, order: any) {
  const [buyer, seller, offer, buyerProfile, sellerProfile, productProfile] =
    await Promise.all([
      tx.user.findUnique({ where: { id: order.buyerUserId } }),
      tx.user.findUnique({ where: { id: order.sellerUserId } }),
      tx.offer.findUnique({ where: { id: order.offerId } }),
      tx.allwainFiscalProfile.findUnique({
        where: {
          userId_kind: {
            userId: order.buyerUserId,
            kind: order.buyerCapacity || "consumer",
          },
        },
      }),
      tx.allwainFiscalProfile.findUnique({
        where: {
          userId_kind: { userId: order.sellerUserId, kind: "business" },
        },
      }),
      tx.allwainProductComplianceProfile.findUnique({
        where: { offerId: order.offerId },
      }),
    ]);
  if (!buyer || !seller || !offer)
    throw new Error("ORDER_COMPLIANCE_SOURCE_MISSING");

  const existingSettlement = await tx.allwainSettlementPlan.findFirst({
    where: { orderId: order.id },
    orderBy: { version: "desc" },
  });
  const snapshotsLocked = ["checkout_locked", "locked", "settled"].includes(
    existingSettlement?.status || "",
  );

  const buyerSnapshot = profileSnapshot(
    buyerProfile,
    buyer,
    order.buyerCapacity || "consumer",
  );
  const sellerSnapshot = profileSnapshot(sellerProfile, seller, "business");
  for (const item of [
    {
      role: "buyer",
      userId: buyer.id,
      profile: buyerProfile,
      snapshot: buyerSnapshot,
    },
    {
      role: "seller",
      userId: seller.id,
      profile: sellerProfile,
      snapshot: sellerSnapshot,
    },
  ]) {
    const exists = await tx.allwainPartySnapshot.findUnique({
      where: { orderId_role: { orderId: order.id, role: item.role } },
    });
    if (!exists) {
      await tx.allwainPartySnapshot.create({
        data: {
          orderId: order.id,
          role: item.role,
          userId: item.userId,
          fiscalProfileId: item.profile?.id || null,
          profileVersion: item.profile?.version || null,
          actingCapacity: item.snapshot.actingCapacity,
          countryCode: item.snapshot.countryCode,
          taxTerritory: item.snapshot.taxTerritory,
          vatRegime: item.snapshot.vatRegime,
          displayName: item.snapshot.displayName,
          snapshot: item.snapshot,
          snapshotHash: snapshotHash(item.snapshot),
        },
      });
    } else if (!snapshotsLocked) {
      const currentHash = snapshotHash(item.snapshot);
      if (exists.snapshotHash !== currentHash) {
        await tx.allwainPartySnapshot.update({
          where: { id: exists.id },
          data: {
            userId: item.userId,
            fiscalProfileId: item.profile?.id || null,
            profileVersion: item.profile?.version || null,
            actingCapacity: item.snapshot.actingCapacity,
            countryCode: item.snapshot.countryCode,
            taxTerritory: item.snapshot.taxTerritory,
            vatRegime: item.snapshot.vatRegime,
            displayName: item.snapshot.displayName,
            snapshot: item.snapshot,
            snapshotHash: currentHash,
          },
        });
      }
    }
  }

  const shoppingListProposalItems = order.shoppingListId
    ? await tx.allwainShoppingListProposalItem.findMany({
        where: {
          shoppingListId: order.shoppingListId,
          offerId: order.offerId,
          sellerUserId: order.sellerUserId,
        },
        include: { shoppingListItem: true },
        orderBy: { position: "asc" },
      })
    : [];
  if (order.shoppingListId && !shoppingListProposalItems.length) {
    throw new Error("SHOPPING_LIST_ORDER_LINES_MISSING");
  }
  if (shoppingListProposalItems.length) {
    const proposalSubtotal = shoppingListProposalItems.reduce(
      (sum: number, item: any) => sum + Number(item.subtotalAmount),
      0,
    );
    if (proposalSubtotal !== Number(order.subtotalAmount)) {
      throw new Error("SHOPPING_LIST_TOTAL_MISMATCH");
    }
    for (const item of shoppingListProposalItems) {
      const productSnapshot = {
        offerId: offer.id,
        shoppingListId: order.shoppingListId,
        shoppingListItemId: item.shoppingListItemId,
        shoppingListProposalItemId: item.id,
        requested: item.shoppingListItem
          ? {
              productName: item.shoppingListItem.productName,
              description: item.shoppingListItem.description,
              quantity: Number(item.shoppingListItem.quantity),
              unit: item.shoppingListItem.unit,
              category: item.shoppingListItem.category,
              subcategory: item.shoppingListItem.subcategory,
              productKind: item.shoppingListItem.productKind,
            }
          : null,
        supplied: {
          productName: item.productName,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPriceAmount: item.unitPriceAmount,
          subtotalAmount: item.subtotalAmount,
          isSubstitution: item.isSubstitution,
          notes: item.notes,
        },
        offerMeta: offer.meta,
        compliance: productProfile || null,
        capturedAt: new Date().toISOString(),
        acceptedProposalRevisionId:
          order.acceptedProposalRevisionId || null,
      };
      const lineReferenceAmount =
        item.shoppingListItem?.targetUnitPriceAmount === null ||
        item.shoppingListItem?.targetUnitPriceAmount === undefined
          ? null
          : Math.round(
              Number(item.shoppingListItem.targetUnitPriceAmount) *
                Number(item.quantity),
            );
      const data = {
        offerId: order.offerId,
        shoppingListItemId: item.shoppingListItemId,
        shoppingListProposalItemId: item.id,
        proposalRevisionId: order.acceptedProposalRevisionId || null,
        referenceAmount: lineReferenceAmount,
        grossSavingsAmount:
          lineReferenceAmount === null
            ? null
            : lineReferenceAmount - Number(item.subtotalAmount),
        sellerUserId: order.sellerUserId,
        productName: item.productName,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceAmount: item.unitPriceAmount,
        subtotalAmount: item.subtotalAmount,
        currency: item.currency,
        productSnapshot,
        productSnapshotHash: snapshotHash(productSnapshot),
      };
      const existingLine = await tx.allwainOrderLine.findUnique({
        where: {
          orderId_shoppingListItemId: {
            orderId: order.id,
            shoppingListItemId: item.shoppingListItemId,
          },
        },
      });
      if (!existingLine) {
        await tx.allwainOrderLine.create({
          data: { orderId: order.id, ...data },
        });
      } else if (!snapshotsLocked) {
        await tx.allwainOrderLine.update({
          where: { id: existingLine.id },
          data,
        });
      }
    }
  } else {
    const existingLine = await tx.allwainOrderLine.findFirst({
      where: { orderId: order.id },
    });
    const productSnapshot = {
      offerId: offer.id,
      title: offer.title,
      description: offer.description,
      productId: offer.productId,
      offerMeta: offer.meta,
      compliance: productProfile || null,
      acceptedProposalRevisionId: order.acceptedProposalRevisionId || null,
      referenceAmount: order.referenceAmount ?? null,
      grossSavingsAmount: order.grossSavingsAmount ?? null,
      capturedAt: new Date().toISOString(),
    };
    if (!existingLine) {
      await tx.allwainOrderLine.create({
        data: {
          orderId: order.id,
          offerId: order.offerId,
          proposalRevisionId: order.acceptedProposalRevisionId || null,
          referenceAmount: order.referenceAmount ?? null,
          grossSavingsAmount: order.grossSavingsAmount ?? null,
          sellerUserId: order.sellerUserId,
          productName: offer.title,
          description: offer.description,
          quantity: order.quantity,
          unit: order.unit,
          unitPriceAmount: order.unitPriceAmount,
          subtotalAmount: order.subtotalAmount,
          currency: order.currency,
          productSnapshot,
          productSnapshotHash: snapshotHash(productSnapshot),
        },
      });
    } else if (!snapshotsLocked) {
      await tx.allwainOrderLine.update({
        where: { id: existingLine.id },
        data: {
          productName: offer.title,
          description: offer.description,
          quantity: order.quantity,
          unit: order.unit,
          unitPriceAmount: order.unitPriceAmount,
          subtotalAmount: order.subtotalAmount,
          currency: order.currency,
          productSnapshot,
          productSnapshotHash: snapshotHash(productSnapshot),
        },
      });
    }
  }
  if (!existingSettlement) {
    const commercialModel = normalizeAllwainCommercialModel(
      order.commercialModel,
    );
    const businessOfRecord = allwainBusinessOfRecord(commercialModel);
    const draftFormula = {
      architecture: "separate_charges_and_transfers",
      commercialModel,
      businessOfRecord,
      processorFeePayer: "platform",
      feeBasis: order.feeBasis || "sale_amount",
      platformFeePayer: order.platformFeePayer || "seller",
      referenceAmount: order.referenceAmount ?? null,
      acceptedOfferAmount: order.acceptedOfferAmount ?? null,
      grossSavingsAmount: order.grossSavingsAmount ?? null,
      netSavingsAmount: order.netSavingsAmount ?? null,
      platformFeeBps: order.platformFeeBps,
      platformFeeAmount: order.platformFeeAmount,
      connectorFeeAmount: order.connectorFeeAmount || 0,
      connectorPlatformShareAmount:
        order.connectorPlatformShareAmount || 0,
      connectorDeliveryAmount: order.connectorDeliveryAmount || 0,
      carrierDeliveryAmount: order.carrierDeliveryAmount || 0,
      platformNetFeeAmount: order.platformNetFeeAmount,
      platformRetainedAmount:
        order.platformRetainedAmount ?? order.platformNetFeeAmount,
      sellerAmount: order.sellerAmount,
      commercialTermsVersion: order.commercialTermsVersion,
      taxStatus: "pending",
    };
    await tx.allwainSettlementPlan.create({
      data: {
        orderId: order.id,
        version: 1,
        status: "draft",
        grossAmount: order.totalAmount || order.subtotalAmount,
        productAmount: order.subtotalAmount,
        shippingAmount: order.shippingAmount || 0,
        carrierDeliveryAmount: order.carrierDeliveryAmount || 0,
        platformFeeAmount: order.platformFeeAmount,
        connectorAmount: order.connectorFeeAmount || 0,
        connectorPlatformShareAmount:
          order.connectorPlatformShareAmount || 0,
        connectorDeliveryAmount: order.connectorDeliveryAmount || 0,
        platformNetFeeAmount: order.platformNetFeeAmount,
        platformRetainedAmount:
          order.platformRetainedAmount ?? order.platformNetFeeAmount,
        sellerAmount: order.sellerAmount,
        feeBasis: order.feeBasis || "sale_amount",
        platformFeePayer: order.platformFeePayer || "seller",
        referenceAmount: order.referenceAmount ?? null,
        acceptedOfferAmount: order.acceptedOfferAmount ?? null,
        grossSavingsAmount: order.grossSavingsAmount ?? null,
        netSavingsAmount: order.netSavingsAmount ?? null,
        commercialModel,
        businessOfRecord,
        currency: order.currency,
        formulaSnapshot: draftFormula,
        snapshotHash: snapshotHash(draftFormula),
      },
    });
  }

  const taxInput = {
    testOnlyNonFiscal: allwainStripeTestOfferEnabled(offer),
    commercialModel: normalizeAllwainCommercialModel(order.commercialModel),
    businessOfRecord:
      order.businessOfRecord ||
      allwainBusinessOfRecord(
        normalizeAllwainCommercialModel(order.commercialModel),
      ),
    sellerVatRegime: sellerProfile?.vatRegime || "unknown",
    sellerCountryCode: sellerProfile?.countryCode || "ES",
    sellerTaxTerritory: sellerProfile?.taxTerritory || null,
    sellerOwnProduction:
      sellerProfile?.ownProduction ?? productProfile?.ownProduction ?? null,
    sellerReagpActivity: sellerProfile?.reagpActivity || null,
    sellerFiscalReady: isAllwainFiscalProfileReady(sellerProfile),
    buyerCapacity: order.buyerCapacity || "consumer",
    buyerFiscalReady:
      (order.buyerCapacity || "consumer") === "consumer" ||
      isAllwainFiscalProfileReady(buyerProfile),
    buyerCountryCode: buyerProfile?.countryCode || "ES",
    productKind: productProfile?.productKind || "other",
    foodCategory: productProfile?.foodCategory || null,
    deliveryMethod: order.deliveryMethod || null,
    currency: order.currency,
  };
  if (!["checkout_locked", "locked"].includes(existingSettlement?.status || "")) {
    await determineTaxTx(tx, order, taxInput);
  }
  await tx.allwainOrder.update({
    where: { id: order.id },
    data: {
      legalSellerUserId: order.sellerUserId,
      traceabilityStatus: productProfile?.lotTrackingRequired
        ? "lot_required"
        : "not_required",
    },
  });
}

function hashedClientAddress(value?: string | null) {
  if (!value) return null;
  return crypto
    .createHmac("sha256", ENV.ALLWAIN_AUDIT_HMAC_SECRET)
    .update(value)
    .digest("hex");
}

function commercialTermsSnapshot(order: any) {
  const commercialModel = normalizeAllwainCommercialModel(
    order.commercialModel,
  );
  const platformDirect = commercialModel === "platform_direct";
  return {
    version: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
    orderId: order.id,
    contractId: order.contractId,
    offerId: order.offerId,
    buyerUserId: order.buyerUserId,
    sellerUserId: order.sellerUserId,
    legalSellerUserId: order.sellerUserId,
    commercialModel,
    platformRole: platformDirect
      ? "direct_seller"
      : "marketplace_intermediary",
    businessOfRecord: allwainBusinessOfRecord(commercialModel),
    paymentArchitecture: "separate_charges_and_transfers",
    processorFeePayer: "platform",
    quantity: order.quantity,
    unit: order.unit,
    productAmount: order.subtotalAmount,
    totalAmount: order.totalAmount,
    currency: order.currency,
    platformFeeBps: order.platformFeeBps,
    platformFeeAmount: order.platformFeeAmount,
    platformNetFeeAmount: order.platformNetFeeAmount,
    platformRetainedAmount:
      order.platformRetainedAmount ?? order.platformNetFeeAmount,
    connectorFeeAmount: order.connectorFeeAmount,
    connectorPlatformShareAmount:
      order.connectorPlatformShareAmount || 0,
    connectorDeliveryAmount: order.connectorDeliveryAmount || 0,
    carrierDeliveryAmount: order.carrierDeliveryAmount || 0,
    sellerAmount: order.sellerAmount,
    shippingAmount: order.shippingAmount,
    taxAmount: order.taxAmount,
    agriculturalCompensationAmount: order.agriculturalCompensationAmount,
    settlementPlanVersion: order.settlementPlanVersion,
    settlementSnapshotHash: order.settlementSnapshotHash,
    deliveryMethod: order.deliveryMethod || null,
    preorderChargeDeadlineAt:
      order.preorderChargeDeadlineAt?.toISOString?.() ||
      order.preorderChargeDeadlineAt ||
      null,
    cancellationRule:
      "La cancelación, devolución y desistimiento se aplican según el tipo de producto, su estado y la normativa vigente.",
  };
}

function preorderMandateSnapshot(order: any) {
  const deadline = normalizeAllwainPreorderChargeDeadline(
    order.preorderChargeDeadlineAt,
  );
  return {
    version: ENV.ALLWAIN_PREORDER_MANDATE_VERSION,
    orderId: order.id,
    contractId: order.contractId,
    offerId: order.offerId,
    buyerUserId: order.buyerUserId,
    sellerUserId: order.sellerUserId,
    paymentProcessor: "stripe",
    paymentMethodStorage: "stripe",
    chargeType: "one_time_off_session",
    maximumChargeAmount: Number(order.totalAmount),
    currency: String(order.currency).toLowerCase(),
    chargeDeadlineAt: deadline.toISOString(),
    settlementPlanVersion: order.settlementPlanVersion,
    settlementSnapshotHash: order.settlementSnapshotHash,
    cancellationPath: `/api/allwain/payments/orders/${order.id}/cancel`,
    statement:
      "Autorizo guardar el método de pago en Stripe y realizar una única vez el cobro máximo indicado para este pedido antes de la fecha límite. Puedo cancelar antes de que se inicie el cobro, sujeto al estado del pedido y a las condiciones aceptadas.",
  };
}

async function recordPreorderMandateConsentTx(
  tx: any,
  order: any,
  input: {
    userId: string;
    accepted: boolean;
    documentVersion?: string;
    requestId?: string;
    clientAddress?: string | null;
    userAgent?: string | null;
  },
) {
  if (order.paymentMode !== "preorder") return null;
  if (
    input.documentVersion &&
    input.documentVersion !== ENV.ALLWAIN_PREORDER_MANDATE_VERSION
  ) {
    throw new Error("PREORDER_MANDATE_VERSION_MISMATCH");
  }
  const mandate = preorderMandateSnapshot(order);
  const mandateHash = snapshotHash(mandate);
  const idempotencyKey = [
    "allwain-preorder-mandate",
    order.id,
    input.userId,
    ENV.ALLWAIN_PREORDER_MANDATE_VERSION,
  ].join(":");
  const evidence = {
    mandate,
    mandateHash,
    requestId: input.requestId || null,
    clientAddressHash: hashedClientAddress(input.clientAddress),
    userAgent: cleanText(input.userAgent, 500),
    capturedBy: "allwain_backend",
  };
  const existing = await tx.allwainConsentEvidence.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    if (
      !existing.evidenceHash ||
      existing.evidence?.mandateHash !== mandateHash
    ) {
      throw new Error("PREORDER_MANDATE_SNAPSHOT_MISMATCH");
    }
    return existing;
  }
  if (input.accepted !== true) throw new Error("RESERVATION_CONSENT_REQUIRED");
  const consent = await tx.allwainConsentEvidence.upsert({
    where: { idempotencyKey },
    create: {
      userId: input.userId,
      orderId: order.id,
      consentType: "preorder_off_session_mandate",
      documentVersion: ENV.ALLWAIN_PREORDER_MANDATE_VERSION,
      granted: true,
      evidence,
      evidenceHash: snapshotHash(evidence),
      idempotencyKey,
    },
    update: {},
  });
  await tx.allwainOrder.update({
    where: { id: order.id },
    data: {
      reservationConsentAt: consent.occurredAt,
      preorderMandateVersion: ENV.ALLWAIN_PREORDER_MANDATE_VERSION,
      preorderMandateAcceptedAt: consent.occurredAt,
      preorderMandateEvidenceHash: consent.evidenceHash,
    },
  });
  if (!existing) {
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: "legal.preorder_charge_mandate_accepted",
      actorUserId: input.userId,
      actorRole: "buyer",
      source: "allwain_checkout",
      requestId: input.requestId,
      payload: {
        consentId: consent.id,
        documentVersion: ENV.ALLWAIN_PREORDER_MANDATE_VERSION,
        mandateHash,
        evidenceHash: consent.evidenceHash,
        maximumChargeAmount: mandate.maximumChargeAmount,
        currency: mandate.currency,
        chargeDeadlineAt: mandate.chargeDeadlineAt,
      },
    });
  }
  return consent;
}

async function recordCommercialTermsConsentTx(
  tx: any,
  order: any,
  input: {
    userId: string;
    accepted: boolean;
    documentVersion?: string;
    requestId?: string;
    clientAddress?: string | null;
    userAgent?: string | null;
  },
) {
  if (input.accepted !== true) throw new Error("COMMERCIAL_TERMS_CONSENT_REQUIRED");
  if (
    input.documentVersion &&
    input.documentVersion !== ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION
  ) {
    throw new Error("COMMERCIAL_TERMS_VERSION_MISMATCH");
  }
  const terms = commercialTermsSnapshot(order);
  const termsHash = snapshotHash(terms);
  const idempotencyKey = [
    "allwain-commercial-terms",
    order.id,
    input.userId,
    ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
  ].join(":");
  const evidence = {
    terms,
    termsHash,
    requestId: input.requestId || null,
    clientAddressHash: hashedClientAddress(input.clientAddress),
    userAgent: cleanText(input.userAgent, 500),
    capturedBy: "allwain_backend",
  };
  const existingConsent = await tx.allwainConsentEvidence.findUnique({
    where: { idempotencyKey },
  });
  const consent = await tx.allwainConsentEvidence.upsert({
    where: { idempotencyKey },
    create: {
      userId: input.userId,
      orderId: order.id,
      consentType: "marketplace_purchase_terms",
      documentVersion: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
      granted: true,
      evidence,
      evidenceHash: snapshotHash(evidence),
      idempotencyKey,
    },
    update: {},
  });
  await tx.allwainOrder.update({
    where: { id: order.id },
    data: {
      commercialTermsVersion: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
      commercialTermsAcceptedAt: consent.occurredAt,
      commercialTermsSnapshotHash: termsHash,
    },
  });
  if (!existingConsent) {
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: "legal.commercial_terms_accepted",
      actorUserId: input.userId,
      actorRole: "buyer",
      source: "allwain_checkout",
      requestId: input.requestId,
      payload: {
        consentId: consent.id,
        documentVersion: ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
        termsHash,
        evidenceHash: consent.evidenceHash,
      },
    });
  }
  return consent;
}

export async function prepareAllwainOrderPaymentTx(
  tx: any,
  input: {
    orderId: string;
    buyerUserId: string;
    reviewedTotalAmount?: unknown;
    reviewedCurrency?: unknown;
    commercialTermsAccepted: boolean;
    commercialTermsVersion?: string;
    preorderMandateAccepted?: boolean;
    preorderMandateVersion?: string;
    recurringPlanId?: string;
    requestId?: string;
    clientAddress?: string | null;
    userAgent?: string | null;
  },
) {
  const rows = (await tx.$queryRaw(
    Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${input.orderId} FOR UPDATE`,
  )) as any[];
  let order = rows[0];
  if (!order || order.buyerUserId !== input.buyerUserId) {
    throw new Error("ORDER_NOT_FOUND");
  }
  if (order.paymentStatus === "paid") throw new Error("ORDER_ALREADY_PAID");

  await ensureAllwainOrderComplianceTx(tx, order);
  order = await tx.allwainOrder.findUnique({ where: { id: input.orderId } });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  // Recheck the buyer's reviewed amount after fiscal recalculation under the
  // order lock, before recording any consent or creating a Checkout session.
  assertAllwainReviewedTotal(order, input);
  const commercialModel = normalizeAllwainCommercialModel(
    order.commercialModel,
  );
  const platformDirect = commercialModel === "platform_direct";
  const businessOfRecord = allwainBusinessOfRecord(commercialModel);
  if (input.recurringPlanId) {
    const recurringConsent = await tx.allwainConsentEvidence.findUnique({
      where: {
        idempotencyKey: [
          "allwain-commercial-terms",
          order.id,
          input.buyerUserId,
          ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
        ].join(":"),
      },
    });
    if (
      !recurringConsent?.granted ||
      !recurringConsent.evidenceHash ||
      recurringConsent.consentType !== "recurring_occurrence_terms" ||
      recurringConsent.evidence?.recurringPlanId !== input.recurringPlanId
    ) {
      throw new Error("RECURRING_MANDATE_NOT_VALID");
    }
  } else {
    await recordCommercialTermsConsentTx(tx, order, {
      userId: input.buyerUserId,
      accepted: input.commercialTermsAccepted,
      documentVersion: input.commercialTermsVersion,
      requestId: input.requestId,
      clientAddress: input.clientAddress,
      userAgent: input.userAgent,
    });
  }
  const preorderMandate = await recordPreorderMandateConsentTx(tx, order, {
    userId: input.buyerUserId,
    accepted: input.preorderMandateAccepted === true,
    documentVersion: input.preorderMandateVersion,
    requestId: input.requestId,
    clientAddress: input.clientAddress,
    userAgent: input.userAgent,
  });

  const [
    account,
    determination,
    settlement,
    product,
    consent,
    sellerDocumentProfile,
    buyerDocumentProfile,
  ] =
    await Promise.all([
      tx.allwainSellerPaymentAccount.findUnique({
        where: { userId: order.sellerUserId },
      }),
      tx.allwainTaxDetermination.findUnique({ where: { orderId: order.id } }),
      tx.allwainSettlementPlan.findFirst({
        where: { orderId: order.id },
        orderBy: { version: "desc" },
      }),
      tx.allwainProductComplianceProfile.findUnique({
        where: { offerId: order.offerId },
      }),
      tx.allwainConsentEvidence.findUnique({
        where: {
          idempotencyKey: [
            "allwain-commercial-terms",
            order.id,
            input.buyerUserId,
            ENV.ALLWAIN_COMMERCIAL_TERMS_VERSION,
          ].join(":"),
        },
      }),
      tx.allwainFiscalProfile.findUnique({
        where: {
          userId_kind: { userId: order.sellerUserId, kind: "business" },
        },
      }),
      tx.allwainFiscalProfile.findUnique({
        where: {
          userId_kind: {
            userId: order.buyerUserId,
            kind: order.buyerCapacity || "consumer",
          },
        },
      }),
    ]);
  const testOnlyTransaction = isAllwainStripeTestDetermination(determination);
  if (testOnlyTransaction && !allwainStripeTestCheckoutEnabled()) {
    throw new Error("STRIPE_TEST_ORDER_REQUIRES_TEST_MODE");
  }
  if (
    !testOnlyTransaction &&
    (!ENV.ALLWAIN_LEGAL_NAME ||
      !ENV.ALLWAIN_LEGAL_TAX_ID ||
      !ENV.ALLWAIN_LEGAL_ADDRESS)
  ) {
    throw new Error("ALLWAIN_LEGAL_IDENTITY_REQUIRED");
  }
  if (
    !testOnlyTransaction &&
    !platformDirect &&
    (!account?.stripeAccountId ||
      !account.chargesEnabled ||
      !account.transfersEnabled ||
      !account.payoutsEnabled)
  ) {
    throw new Error("SELLER_PAYMENTS_NOT_READY");
  }
  if (
    determination?.status !== "determined" ||
    !determination.professionalApprovalReference ||
    !Array.isArray(determination.documentPlan) ||
    !determination.documentPlan.length
  ) {
    throw new Error("TAX_TREATMENT_NOT_APPROVED");
  }
  const documentIssuers = new Set(
    (determination.documentPlan as Array<Record<string, unknown>>)
      .map((item) => String(item.issuer || ""))
      .filter((issuer) => issuer !== "platform"),
  );
  if (
    (documentIssuers.has("seller") &&
      !hasActiveAllwainDocumentMandate(sellerDocumentProfile)) ||
    (documentIssuers.has("buyer") &&
      !hasActiveAllwainDocumentMandate(buyerDocumentProfile))
  ) {
    throw new Error("DOCUMENT_MANDATE_REQUIRED");
  }
  const settlementGrossAmount = Number(settlement?.grossAmount);
  const settlementSellerAmount = Number(settlement?.sellerAmount);
  const settlementPlatformFeeAmount = Number(settlement?.platformFeeAmount);
  const settlementConnectorAmount = Number(settlement?.connectorAmount || 0);
  const settlementConnectorPlatformShareAmount = Number(
    settlement?.connectorPlatformShareAmount || 0,
  );
  const settlementConnectorDeliveryAmount = Number(
    settlement?.connectorDeliveryAmount || 0,
  );
  const settlementPlatformNetFeeAmount = Number(
    settlement?.platformNetFeeAmount || 0,
  );
  const settlementPlatformRetainedAmount = Number(
    settlement?.platformRetainedAmount || 0,
  );
  const settlementCarrierDeliveryAmount = Number(
    settlement?.carrierDeliveryAmount || 0,
  );
  if (
    !settlement ||
    !["ready", "checkout_locked"].includes(settlement.status) ||
    !settlement.snapshotHash ||
    settlement.snapshotHash !== order.settlementSnapshotHash ||
    settlementGrossAmount !== Number(order.totalAmount) ||
    settlementSellerAmount !== Number(order.sellerAmount) ||
    settlementPlatformFeeAmount !== Number(order.platformFeeAmount) ||
    settlementConnectorAmount !== Number(order.connectorFeeAmount || 0) ||
    settlementConnectorPlatformShareAmount !==
      Number(order.connectorPlatformShareAmount || 0) ||
    settlementConnectorDeliveryAmount !==
      Number(order.connectorDeliveryAmount || 0) ||
    settlementCarrierDeliveryAmount !== Number(order.carrierDeliveryAmount || 0) ||
    settlementConnectorAmount !==
      settlementConnectorPlatformShareAmount +
        settlementConnectorDeliveryAmount ||
    settlementPlatformNetFeeAmount !== Number(order.platformNetFeeAmount) ||
    settlementPlatformRetainedAmount !==
      Number(order.platformRetainedAmount || 0) ||
    (platformDirect
      ? settlementPlatformFeeAmount !== 0 ||
        settlementPlatformNetFeeAmount !== 0 ||
        settlementSellerAmount !== 0 ||
        settlementConnectorPlatformShareAmount !== 0
      : settlementPlatformRetainedAmount !==
          settlementPlatformNetFeeAmount ||
        settlementPlatformFeeAmount !==
          settlementPlatformNetFeeAmount +
            settlementConnectorPlatformShareAmount) ||
    settlementSellerAmount +
         settlementPlatformRetainedAmount +
         settlementConnectorAmount +
         settlementCarrierDeliveryAmount !==
      settlementGrossAmount
  ) {
    throw new Error("SETTLEMENT_NOT_APPROVED");
  }
  if (
    !testOnlyTransaction &&
    product?.productKind === "food" &&
    !product.onlineInfoComplete
  ) {
    throw new Error("FOOD_INFORMATION_INCOMPLETE");
  }
  if (!consent?.granted || !consent.evidenceHash) {
    throw new Error("COMMERCIAL_TERMS_CONSENT_REQUIRED");
  }
  order = await tx.allwainOrder.update({
    where: { id: order.id },
    data: {
      settlementMerchantAccountId: platformDirect
        ? null
        : testOnlyTransaction
          ? null
          : account.stripeAccountId,
      commercialModel,
      businessOfRecord,
      processorFeePayer: "platform",
      settlementPlanVersion: settlement.version,
      settlementSnapshotHash: settlement.snapshotHash,
      settlementStatus: "checkout_locked",
      ...(testOnlyTransaction
        ? {
            sellerTransferStatus: "not_required",
            connectorTransferStatus: "not_required",
            transferStatus: "not_required",
          }
        : {}),
    },
  });
  await tx.allwainSettlementPlan.update({
    where: { id: settlement.id },
    data: { status: "checkout_locked" },
  });
  await appendAllwainAuditEventTx(tx, {
    aggregateId: order.id,
    eventType: testOnlyTransaction
      ? "payment.stripe_test_gate_passed"
      : "payment.legal_gate_passed",
    actorUserId: input.buyerUserId,
    actorRole: "buyer",
    source: testOnlyTransaction
      ? "allwain_stripe_test_gate"
      : "allwain_payment_gate",
    requestId: input.requestId,
    payload: {
      settlementPlanId: settlement.id,
      settlementVersion: settlement.version,
      settlementHash: settlement.snapshotHash,
      taxDeterminationId: determination.id,
      taxTreatmentCode: determination.treatmentCode,
      professionalApprovalReference:
        determination.professionalApprovalReference,
      consentId: consent.id,
      recurringPlanId: input.recurringPlanId || null,
      settlementMerchantAccountId:
        platformDirect || testOnlyTransaction
          ? null
          : account.stripeAccountId,
      commercialModel,
      businessOfRecord,
      processorFeePayer: "platform",
      testOnlyNonFiscal: testOnlyTransaction,
    },
  });
  return {
    order,
    settlement,
    account,
    determination,
    consent,
    preorderMandate,
    testOnlyNonFiscal: testOnlyTransaction,
  };
}

function ledgerRows(input: {
  order: any;
  payment: any;
  settlement: any;
  referenceType: string;
  referenceId: string;
  occurredAt?: Date;
}) {
  const occurredAt = input.occurredAt || new Date();
  const base = {
    orderId: input.order.id,
    paymentId: input.payment.id,
    settlementPlanId: input.settlement.id,
    currency: input.order.currency,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    occurredAt,
  };
  const platformDirect =
    normalizeAllwainCommercialModel(input.order.commercialModel) ===
    "platform_direct";
  const platformRevenueAccount = platformDirect
    ? "platform_direct_sales_proceeds"
    : "platform_fee_revenue";
  const platformRevenueAmount = Number(
    input.settlement.platformRetainedAmount ??
      input.settlement.platformNetFeeAmount ??
      0,
  );
  const rows: any[] = [
    {
      ...base,
      accountCode: "stripe_clearing",
      direction: "debit",
      amount: input.settlement.grossAmount,
      idempotencyKey: `${input.referenceType}:${input.referenceId}:stripe_clearing:debit`,
    },
  ];
  if (Number(input.settlement.sellerAmount || 0) > 0) {
    rows.push({
      ...base,
      accountCode: "seller_payable",
      direction: "credit",
      amount: input.settlement.sellerAmount,
      idempotencyKey: `${input.referenceType}:${input.referenceId}:seller_payable:credit`,
    });
  }
  if (platformRevenueAmount > 0) {
    rows.push({
      ...base,
      accountCode: platformRevenueAccount,
      direction: "credit",
      amount: platformRevenueAmount,
      idempotencyKey: `${input.referenceType}:${input.referenceId}:${platformRevenueAccount}:credit`,
    });
  }
  if (input.settlement.connectorAmount > 0) {
    rows.push({
      ...base,
      accountCode: "connector_payable",
      direction: "credit",
      amount: input.settlement.connectorAmount,
      idempotencyKey: `${input.referenceType}:${input.referenceId}:connector_payable:credit`,
    });
  }
  if (Number(input.settlement.carrierDeliveryAmount || 0) > 0) {
    rows.push({
      ...base,
      accountCode: "carrier_shipping_payable",
      direction: "credit",
      amount: input.settlement.carrierDeliveryAmount,
      idempotencyKey: `${input.referenceType}:${input.referenceId}:carrier_shipping_payable:credit`,
    });
  }
  if (Number(input.payment.processorFeeAmount || 0) > 0) {
    rows.push(
      {
        ...base,
        accountCode: "processor_fee_expense",
        direction: "debit",
        amount: input.payment.processorFeeAmount,
        idempotencyKey: `${input.referenceType}:${input.referenceId}:processor_fee_expense:debit`,
      },
      {
        ...base,
        accountCode: "stripe_clearing",
        direction: "credit",
        amount: input.payment.processorFeeAmount,
        idempotencyKey: `${input.referenceType}:${input.referenceId}:processor_fee:stripe_clearing:credit`,
      },
    );
  }
  return rows.filter((row) => row.amount > 0);
}

export async function recordAllwainPaymentLedgerTx(
  tx: any,
  order: any,
  payment: any,
) {
  const settlement = await tx.allwainSettlementPlan.findFirst({
    where: { orderId: order.id },
    orderBy: { version: "desc" },
  });
  if (!settlement) throw new Error("SETTLEMENT_PLAN_NOT_FOUND");
  const referenceId = payment.stripePaymentIntentId || payment.id;
  for (const row of ledgerRows({
    order,
    payment,
    settlement,
    referenceType: "payment",
    referenceId,
    occurredAt: payment.paidAt || new Date(),
  })) {
    await tx.allwainLedgerEntry.upsert({
      where: { idempotencyKey: row.idempotencyKey },
      create: row,
      update: {},
    });
  }
  await tx.allwainSettlementPlan.update({
    where: { id: settlement.id },
    data: {
      status: "locked",
      lockedAt: settlement.lockedAt || new Date(),
      processorFeeAmount:
        payment.processorFeeAmount ?? settlement.processorFeeAmount,
    },
  });
  await tx.allwainOrder.updateMany({
    where: {
      id: order.id,
      settlementStatus: { in: ["draft", "ready", "checkout_locked"] },
    },
    data: { settlementStatus: "locked" },
  });
}

export async function recordAllwainTransferTx(
  tx: any,
  input: {
    order: any;
    payment: any;
    recipientUserId: string;
    recipientRole: "seller" | "connector";
    stripeAccountId: string;
    stripeTransferId: string;
    amount: number;
    releaseTrigger: string;
    idempotencyKey?: string;
  },
) {
  const idempotencyKey =
    input.idempotencyKey ||
    `allwain-order-${input.order.id}-${input.recipientRole}-transfer`;
  const transfer = await tx.allwainTransfer.upsert({
    where: { idempotencyKey },
    create: {
      orderId: input.order.id,
      paymentId: input.payment.id,
      recipientUserId: input.recipientUserId,
      recipientRole: input.recipientRole,
      stripeAccountId: input.stripeAccountId,
      stripeTransferId: input.stripeTransferId,
      status: "transferred",
      amount: input.amount,
      currency: input.order.currency,
      releaseTrigger: input.releaseTrigger,
      idempotencyKey,
      transferredAt: new Date(),
    },
    update: {
      stripeTransferId: input.stripeTransferId,
      stripeAccountId: input.stripeAccountId,
      status: "transferred",
      transferredAt: new Date(),
    },
  });
  const settlement = await tx.allwainSettlementPlan.findFirst({
    where: { orderId: input.order.id },
    orderBy: { version: "desc" },
  });
  if (input.amount > 0) {
    for (const row of [
      {
        orderId: input.order.id,
        paymentId: input.payment.id,
        settlementPlanId: settlement?.id || null,
        accountCode: `${input.recipientRole}_payable`,
        direction: "debit",
        amount: input.amount,
        currency: input.order.currency,
        referenceType: "transfer",
        referenceId: input.stripeTransferId,
        idempotencyKey: `transfer:${input.stripeTransferId}:${input.recipientRole}_payable:debit`,
      },
      {
        orderId: input.order.id,
        paymentId: input.payment.id,
        settlementPlanId: settlement?.id || null,
        accountCode: "stripe_clearing",
        direction: "credit",
        amount: input.amount,
        currency: input.order.currency,
        referenceType: "transfer",
        referenceId: input.stripeTransferId,
        idempotencyKey: `transfer:${input.stripeTransferId}:stripe_clearing:credit`,
      },
    ]) {
      await tx.allwainLedgerEntry.upsert({
        where: { idempotencyKey: row.idempotencyKey },
        create: row,
        update: {},
      });
    }
  }
  return transfer;
}

export async function recordAllwainTransferReversalTx(
  tx: any,
  input: {
    order: any;
    payment: any;
    recipientRole: "seller" | "connector";
    stripeTransferId: string;
    stripeReversalId: string;
    amount: number;
  },
) {
  if (!Number.isInteger(input.amount) || input.amount < 1) return null;
  const recipientUserId =
    input.recipientRole === "seller"
      ? input.order.sellerUserId
      : input.order.connectorUserId;
  if (!recipientUserId) return null;

  const transferKey = `allwain-order-${input.order.id}-${input.recipientRole}-transfer`;
  let transfer = await tx.allwainTransfer.findFirst({
    where: {
      OR: [
        { stripeTransferId: input.stripeTransferId },
        { idempotencyKey: transferKey },
      ],
    },
  });
  if (!transfer) {
    transfer = await tx.allwainTransfer.create({
      data: {
        orderId: input.order.id,
        paymentId: input.payment.id,
        recipientUserId,
        recipientRole: input.recipientRole,
        stripeTransferId: input.stripeTransferId,
        status: "transferred",
        amount:
          input.recipientRole === "seller"
            ? input.order.sellerAmount
            : input.order.connectorFeeAmount || 0,
        currency: input.order.currency,
        releaseTrigger: "legacy",
        idempotencyKey: transferKey,
        transferredAt:
          input.order.deliveredAt || input.payment.paidAt || new Date(),
      },
    });
  }

  const ledgerKey = `transfer_reversal:${input.stripeReversalId}:stripe_clearing:debit`;
  const alreadyRecorded = await tx.allwainLedgerEntry.findUnique({
    where: { idempotencyKey: ledgerKey },
  });
  if (alreadyRecorded) return transfer;

  const settlement = await tx.allwainSettlementPlan.findFirst({
    where: { orderId: input.order.id },
    orderBy: { version: "desc" },
  });
  const originalEntries = await tx.allwainLedgerEntry.findMany({
    where: {
      orderId: input.order.id,
      referenceType: "transfer",
      referenceId: input.stripeTransferId,
    },
  });
  const payableCode = `${input.recipientRole}_payable`;
  const rows = [
    {
      accountCode: "stripe_clearing",
      direction: "debit",
      reversalOfEntryId:
        originalEntries.find(
          (entry: any) =>
            entry.accountCode === "stripe_clearing" &&
            entry.direction === "credit",
        )?.id || null,
    },
    {
      accountCode: payableCode,
      direction: "credit",
      reversalOfEntryId:
        originalEntries.find(
          (entry: any) =>
            entry.accountCode === payableCode && entry.direction === "debit",
        )?.id || null,
    },
  ];
  for (const row of rows) {
    await tx.allwainLedgerEntry.create({
      data: {
        orderId: input.order.id,
        paymentId: input.payment.id,
        settlementPlanId: settlement?.id || null,
        accountCode: row.accountCode,
        direction: row.direction,
        amount: input.amount,
        currency: input.order.currency,
        referenceType: "transfer_reversal",
        referenceId: input.stripeReversalId,
        idempotencyKey: `transfer_reversal:${input.stripeReversalId}:${row.accountCode}:${row.direction}`,
        reversalOfEntryId: row.reversalOfEntryId,
        metadata: {
          stripeTransferId: input.stripeTransferId,
          recipientRole: input.recipientRole,
        },
      },
    });
  }

  const reversedAmount = Math.min(
    transfer.amount,
    transfer.reversedAmount + input.amount,
  );
  return tx.allwainTransfer.update({
    where: { id: transfer.id },
    data: {
      reversedAmount,
      status:
        reversedAmount >= transfer.amount ? "reversed" : "partially_reversed",
    },
  });
}

export async function recordAllwainRefundLedgerTx(
  tx: any,
  input: {
    order: any;
    originalPayment: any;
    refundPayment: any;
    stripeRefundId: string;
    refundAmount: number;
    sellerAmount: number;
    connectorAmount: number;
    platformAmount: number;
    totalRefunded: number;
  },
) {
  const settlement = await tx.allwainSettlementPlan.findFirst({
    where: { orderId: input.order.id },
    orderBy: { version: "desc" },
  });
  if (!settlement) throw new Error("SETTLEMENT_PLAN_NOT_FOUND");
  const platformRevenueAccount =
    normalizeAllwainCommercialModel(input.order.commercialModel) ===
    "platform_direct"
      ? "platform_direct_sales_proceeds"
      : "platform_fee_revenue";

  const originalReferenceId =
    input.originalPayment.stripePaymentIntentId || input.originalPayment.id;
  const originalEntries = await tx.allwainLedgerEntry.findMany({
    where: {
      orderId: input.order.id,
      referenceType: "payment",
      referenceId: originalReferenceId,
    },
  });
  const rows = [
    {
      accountCode: "seller_payable",
      direction: "debit",
      amount: input.sellerAmount,
      originalDirection: "credit",
    },
    {
      accountCode: "connector_payable",
      direction: "debit",
      amount: input.connectorAmount,
      originalDirection: "credit",
    },
    {
      accountCode: platformRevenueAccount,
      direction: "debit",
      amount: input.platformAmount,
      originalDirection: "credit",
    },
    {
      accountCode: "stripe_clearing",
      direction: "credit",
      amount: input.refundAmount,
      originalDirection: "debit",
    },
  ].filter((row) => row.amount > 0);

  for (const row of rows) {
    const original = originalEntries.find(
      (entry: any) =>
        entry.accountCode === row.accountCode &&
        entry.direction === row.originalDirection,
    );
    await tx.allwainLedgerEntry.upsert({
      where: {
        idempotencyKey: `refund:${input.stripeRefundId}:${row.accountCode}:${row.direction}`,
      },
      create: {
        orderId: input.order.id,
        paymentId: input.refundPayment.id,
        settlementPlanId: settlement.id,
        accountCode: row.accountCode,
        direction: row.direction,
        amount: row.amount,
        currency: input.order.currency,
        referenceType: "refund",
        referenceId: input.stripeRefundId,
        idempotencyKey: `refund:${input.stripeRefundId}:${row.accountCode}:${row.direction}`,
        reversalOfEntryId: original?.id || null,
        metadata: { originalPaymentId: input.originalPayment.id },
      },
      update: {},
    });
  }

  const fullyRefunded = input.totalRefunded >= input.originalPayment.amount;
  await tx.allwainSettlementPlan.update({
    where: { id: settlement.id },
    data: { status: fullyRefunded ? "refunded" : "partially_refunded" },
  });
  await tx.allwainOrder.update({
    where: { id: input.order.id },
    data: {
      refundedAmount: input.totalRefunded,
      settlementStatus: fullyRefunded ? "refunded" : "partially_refunded",
    },
  });
}

function documentContent(
  order: any,
  type: string,
  extras: Record<string, unknown> = {},
) {
  return {
    type,
    orderId: order.id,
    contractId: order.contractId,
    sellerUserId: order.sellerUserId,
    buyerUserId: order.buyerUserId,
    quantity: order.quantity,
    unit: order.unit,
    subtotalAmount: order.subtotalAmount,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    generatedAt: new Date().toISOString(),
    ...extras,
  };
}

export async function ensureAllwainOperationalDocumentTx(
  tx: any,
  order: any,
  documentType:
    | "purchase_confirmation"
    | "delivery_confirmation"
    | "seller_settlement"
    | "refund_confirmation",
  extras: Record<string, unknown> = {},
) {
  const sourceReference = cleanText(extras.sourceReference, 200);
  const existing = await tx.allwainFiscalDocument.findFirst({
    where: {
      orderId: order.id,
      documentType,
      status: { not: "void" },
      ...(sourceReference ? { sourceReference } : {}),
    },
  });
  if (existing) return existing;
  const content = documentContent(order, documentType, extras);
  const requestedAmount =
    documentType === "seller_settlement"
      ? Number(extras.sellerAmount ?? order.sellerAmount)
      : documentType === "refund_confirmation"
        ? Number(extras.refundAmount ?? 0)
        : order.subtotalAmount;
  const totalAmount =
    Number.isInteger(requestedAmount) && requestedAmount >= 0
      ? requestedAmount
      : order.subtotalAmount;
  const document = await tx.allwainFiscalDocument.create({
    data: {
      orderId: order.id,
      documentType,
      status: "issued",
      issuerUserId: null,
      recipientUserId:
        documentType === "seller_settlement"
          ? order.sellerUserId
          : order.buyerUserId,
      sourceReference,
      currency: order.currency,
      subtotalAmount: totalAmount,
      taxAmount: 0,
      totalAmount,
      templateVersion: "allwain-operational-document-v1",
      contentSnapshot: content,
      contentHash: snapshotHash(content),
      issuedAt: new Date(),
    },
  });
  await tx.allwainOrder.updateMany({
    where: { id: order.id, documentStatus: "not_started" },
    data: { documentStatus: "operational_available" },
  });
  await appendAllwainAuditEventTx(tx, {
    aggregateId: order.id,
    eventType: `document.${documentType}.issued`,
    source: "allwain_document_engine",
    payload: {
      documentId: document.id,
      documentType,
      contentHash: document.contentHash,
    },
  });
  return document;
}

function fiscalDocumentPartyUserId(order: any, party: string) {
  if (party === "buyer") return order.buyerUserId;
  if (party === "seller") return order.sellerUserId;
  return null;
}

function fiscalDocumentSeries(
  documentType: string,
  issuerUserId: string | null,
  requested?: string | null,
) {
  if (requested && /^[A-Z0-9-]{2,20}$/i.test(requested)) {
    return requested.toUpperCase();
  }
  const prefixes: Record<string, string> = {
    invoice: "FAC",
    simplified_invoice: "FS",
    purchase_receipt: "REC",
    reagp_compensation_receipt: "REAGP",
    platform_service_invoice: "AW-SRV",
  };
  const issuerSuffix = issuerUserId
    ? crypto.createHash("sha256").update(issuerUserId).digest("hex").slice(0, 6).toUpperCase()
    : "PLATFORM";
  return `${prefixes[documentType] || "DOC"}-${issuerSuffix}`;
}

async function nextFiscalDocumentNumberTx(
  tx: any,
  documentType: string,
  series: string,
) {
  const year = new Date().getUTCFullYear();
  await tx.allwainDocumentSequence.upsert({
    where: { documentType_series_year: { documentType, series, year } },
    create: { documentType, series, year, nextNumber: 1 },
    update: {},
  });
  const rows = (await tx.$queryRaw(
    Prisma.sql`SELECT * FROM "AllwainDocumentSequence" WHERE "documentType" = ${documentType} AND "series" = ${series} AND "year" = ${year} FOR UPDATE`,
  )) as any[];
  const sequence = rows[0];
  if (!sequence) throw new Error("DOCUMENT_SEQUENCE_NOT_FOUND");
  const number = Number(sequence.nextNumber);
  await tx.allwainDocumentSequence.update({
    where: { id: sequence.id },
    data: { nextNumber: { increment: 1 } },
  });
  return `${series}-${year}-${String(number).padStart(8, "0")}`;
}

function fiscalDocumentAmounts(order: any, settlement: any, specification: any) {
  const amountSource = specification.amountSource;
  if (amountSource === "platform_fee") {
    const totalAmount = Number(settlement.platformFeeAmount);
    const taxAmount =
      specification.taxMode === "included" && specification.taxRateBps > 0
        ? Math.round(
            (totalAmount * Number(specification.taxRateBps)) /
              (10_000 + Number(specification.taxRateBps)),
          )
        : 0;
    return { subtotalAmount: totalAmount - taxAmount, taxAmount, totalAmount };
  }
  if (amountSource === "compensation") {
    const totalAmount = Number(settlement.agriculturalCompensationAmount || 0);
    return { subtotalAmount: totalAmount, taxAmount: 0, totalAmount };
  }
  if (amountSource === "product") {
    const taxMode = String((settlement.formulaSnapshot as any)?.taxMode || "none");
    const taxAmount = Number(settlement.taxAmount || 0);
    const totalAmount =
      Number(settlement.productAmount) + (taxMode === "added" ? taxAmount : 0);
    return {
      subtotalAmount: Math.max(0, totalAmount - taxAmount),
      taxAmount,
      totalAmount,
    };
  }
  const totalAmount = Number(settlement.grossAmount);
  const taxAmount = Number(settlement.taxAmount || 0);
  return {
    subtotalAmount: Math.max(0, totalAmount - taxAmount),
    taxAmount,
    totalAmount,
  };
}

async function refreshRequiredDocumentStatusTx(tx: any, orderId: string) {
  const determination = await tx.allwainTaxDetermination.findUnique({
    where: { orderId },
  });
  const plan = Array.isArray(determination?.documentPlan)
    ? determination.documentPlan
    : [];
  if (determination?.status !== "determined" || !plan.length) {
    await tx.allwainOrder.update({
      where: { id: orderId },
      data: { documentStatus: "blocked" },
    });
    return false;
  }
  const documents = await tx.allwainFiscalDocument.findMany({
    where: {
      orderId,
      documentType: { in: plan.map((item: any) => item.documentType) },
      status: { not: "void" },
    },
  });
  const complete = plan.every((item: any) => {
    const document = documents.find(
      (candidate: any) => candidate.documentType === item.documentType,
    );
    return Boolean(
      document?.documentNumber &&
        document?.issuedAt &&
        (!item.signatureRequired || document.signatureStatus === "signed"),
    );
  });
  const pendingSignature = documents.some(
    (document: any) => document.signatureStatus === "pending",
  );
  await tx.allwainOrder.update({
    where: { id: orderId },
    data: {
      documentStatus: complete
        ? "complete"
        : pendingSignature
          ? "pending_signature"
          : "incomplete",
    },
  });
  return complete;
}

export async function ensureAllwainRequiredFiscalDocumentsTx(
  tx: any,
  order: any,
) {
  const [determination, settlement, partySnapshots, orderLines] = await Promise.all([
    tx.allwainTaxDetermination.findUnique({ where: { orderId: order.id } }),
    tx.allwainSettlementPlan.findFirst({
      where: { orderId: order.id },
      orderBy: { version: "desc" },
    }),
    tx.allwainPartySnapshot.findMany({ where: { orderId: order.id } }),
    tx.allwainOrderLine.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const plan = Array.isArray(determination?.documentPlan)
    ? determination.documentPlan
    : [];
  if (
    determination?.status !== "determined" ||
    !settlement?.snapshotHash ||
    !plan.length
  ) {
    throw new Error("FISCAL_DOCUMENT_PLAN_NOT_APPROVED");
  }

  for (const specification of plan) {
    const existing = await tx.allwainFiscalDocument.findFirst({
      where: {
        orderId: order.id,
        documentType: specification.documentType,
        sourceReference: settlement.snapshotHash,
        status: { not: "void" },
      },
    });
    if (existing) continue;
    const issuerPartySnapshot = partySnapshots.find(
      (item: any) => item.role === specification.issuer,
    );
    const issuerSnapshot = issuerPartySnapshot?.snapshot as
      | Record<string, any>
      | undefined;
    if (
      specification.issuer !== "platform" &&
      (!issuerSnapshot?.documentMandateEvidenceHash ||
        issuerSnapshot.documentMandateVersion !==
          ENV.ALLWAIN_DOCUMENT_MANDATE_VERSION ||
        issuerSnapshot.documentMandateRevokedAt)
    ) {
      throw new Error("DOCUMENT_MANDATE_REQUIRED");
    }
    const issuerUserId = fiscalDocumentPartyUserId(order, specification.issuer);
    const recipientUserId = fiscalDocumentPartyUserId(
      order,
      specification.recipient,
    );
    const series = fiscalDocumentSeries(
      specification.documentType,
      issuerUserId,
      specification.series,
    );
    const documentNumber = await nextFiscalDocumentNumberTx(
      tx,
      specification.documentType,
      series,
    );
    const amounts = fiscalDocumentAmounts(order, settlement, specification);
    const issuedAt = new Date();
    const content = {
      documentType: specification.documentType,
      documentNumber,
      series,
      orderId: order.id,
      contractId: order.contractId,
      issuedAt: issuedAt.toISOString(),
      issuer: specification.issuer === "platform"
        ? {
            role: "platform",
            legalName: ENV.ALLWAIN_LEGAL_NAME,
            taxId: ENV.ALLWAIN_LEGAL_TAX_ID,
            address: ENV.ALLWAIN_LEGAL_ADDRESS,
          }
        : partySnapshots.find((item: any) => item.role === specification.issuer)?.snapshot,
      recipient:
        specification.recipient === "platform"
          ? {
              role: "platform",
              legalName: ENV.ALLWAIN_LEGAL_NAME,
              taxId: ENV.ALLWAIN_LEGAL_TAX_ID,
              address: ENV.ALLWAIN_LEGAL_ADDRESS,
            }
          : partySnapshots.find((item: any) => item.role === specification.recipient)?.snapshot,
      amounts,
      currency: order.currency,
      lines: orderLines.map((line: any) => ({
        id: line.id,
        productName: line.productName,
        description: line.description,
        quantity: String(line.quantity),
        unit: line.unit,
        unitPriceAmount: line.unitPriceAmount,
        subtotalAmount: line.subtotalAmount,
        productSnapshotHash: line.productSnapshotHash,
      })),
      productAmount: settlement.productAmount,
      shippingAmount: settlement.shippingAmount,
      carrierDeliveryAmount: settlement.carrierDeliveryAmount,
      agriculturalCompensationAmount:
        settlement.agriculturalCompensationAmount,
      platformFeeAmount: settlement.platformFeeAmount,
      taxTreatmentCode: determination.treatmentCode,
      taxRuleVersionId: determination.ruleVersionId,
      professionalApprovalReference:
        determination.professionalApprovalReference,
      legalBasis: specification.legalBasis,
      taxMode: specification.taxMode,
      taxRateBps: specification.taxRateBps,
      taxableBaseAmount: determination.taxableBaseAmount,
      signatureRequired: specification.signatureRequired,
      signatureBy: specification.signatureBy,
      issuerDocumentMandateEvidenceHash:
        specification.issuer === "platform"
          ? null
          : issuerSnapshot?.documentMandateEvidenceHash,
      settlementVersion: settlement.version,
      settlementHash: settlement.snapshotHash,
      commercialTermsVersion: order.commercialTermsVersion,
      commercialTermsSnapshotHash: order.commercialTermsSnapshotHash,
    };
    const document = await tx.allwainFiscalDocument.create({
      data: {
        orderId: order.id,
        documentType: specification.documentType,
        status: "issued",
        issuerUserId,
        recipientUserId,
        documentNumber,
        series,
        sourceReference: settlement.snapshotHash,
        currency: order.currency,
        ...amounts,
        templateVersion: "allwain-fiscal-document-v3",
        contentSnapshot: content,
        contentHash: snapshotHash(content),
        signatureRequired: specification.signatureRequired,
        signatureStatus: specification.signatureRequired
          ? "pending"
          : "not_required",
        issuedAt,
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: `fiscal_document.${specification.documentType}.issued`,
      source: "allwain_fiscal_document_engine",
      payload: {
        documentId: document.id,
        documentNumber,
        contentHash: document.contentHash,
        signatureRequired: specification.signatureRequired,
        settlementHash: settlement.snapshotHash,
      },
    });
  }
  return refreshRequiredDocumentStatusTx(tx, order.id);
}

export async function allwainSettlementDocumentsReady(orderId: string) {
  const prisma = getPrisma() as any;
  const order = await prisma.allwainOrder.findUnique({ where: { id: orderId } });
  if (!order || order.taxStatus !== "determined" || order.documentStatus !== "complete") {
    return false;
  }
  if (
    order.traceabilityStatus === "lot_required" ||
    order.traceabilityStatus === "recall_attention"
  ) {
    return false;
  }
  return true;
}

export async function signAllwainFiscalDocument(
  userId: string,
  documentId: string,
  input: Record<string, unknown>,
  context: {
    requestId?: string;
    clientAddress?: string | null;
    userAgent?: string | null;
  } = {},
) {
  if (input.confirm !== true) throw new Error("DOCUMENT_SIGNATURE_CONFIRMATION_REQUIRED");
  const typedName = cleanText(input.typedName, 250);
  if (!typedName) throw new Error("DOCUMENT_SIGNATURE_NAME_REQUIRED");
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const document = await tx.allwainFiscalDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new Error("DOCUMENT_NOT_FOUND");
    if (!document.signatureRequired) throw new Error("DOCUMENT_SIGNATURE_NOT_REQUIRED");
    if (document.signatureStatus === "signed") return document;
    const order = await tx.allwainOrder.findUnique({
      where: { id: document.orderId },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const content = (document.contentSnapshot || {}) as Record<string, any>;
    const expectedUserId = fiscalDocumentPartyUserId(
      order,
      String(content.signatureBy || ""),
    );
    if (!expectedUserId || expectedUserId !== userId) throw new Error("FORBIDDEN");
    const evidence = {
      documentId,
      documentNumber: document.documentNumber,
      documentContentHash: document.contentHash,
      typedName,
      attestation:
        "Confirmo el contenido del documento, mi identidad y la firma asociada a esta operación.",
      requestId: context.requestId || null,
      clientAddressHash: hashedClientAddress(context.clientAddress),
      userAgent: cleanText(context.userAgent, 500),
      signedAt: new Date().toISOString(),
    };
    const signed = await tx.allwainFiscalDocument.update({
      where: { id: document.id },
      data: {
        signatureStatus: "signed",
        signedByUserId: userId,
        signedAt: new Date(evidence.signedAt),
        signatureEvidence: evidence,
        signatureHash: snapshotHash(evidence),
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: "fiscal_document.signed",
      actorUserId: userId,
      source: "allwain_document_signature",
      requestId: context.requestId,
      payload: {
        documentId: document.id,
        documentNumber: document.documentNumber,
        documentContentHash: document.contentHash,
        signatureHash: signed.signatureHash,
      },
    });
    await refreshRequiredDocumentStatusTx(tx, order.id);
    return signed;
  });
}

function documentLabel(type: string) {
  const labels: Record<string, string> = {
    purchase_confirmation: "Justificante de compra",
    delivery_confirmation: "Confirmación de entrega",
    seller_settlement: "Liquidación de la operación",
    refund_confirmation: "Justificante de reembolso",
    invoice: "Factura",
    simplified_invoice: "Factura simplificada",
    purchase_receipt: "Recibo de compra",
    reagp_compensation_receipt: "Recibo de compensación agraria",
    platform_service_invoice: "Factura de servicios de Allwain",
  };
  return labels[type] || "Documento Allwain";
}

function documentPaymentLabel(status: string) {
  const labels: Record<string, string> = {
    awaiting_payment: "Pendiente",
    checkout_open: "Pago iniciado",
    payment_processing: "En proceso",
    payment_method_saved: "Método de pago guardado",
    requires_customer_action: "Pendiente de confirmación del cliente",
    payment_failed: "Rechazado",
    paid: "Confirmado",
    partially_refunded: "Reembolso parcial",
    refund_pending: "Reembolso en proceso",
    refunded: "Reembolsado",
    legacy_confirmed: "Confirmado sin pago en línea",
  };
  return labels[status] || "Pendiente";
}

function documentFulfillmentLabel(status: string) {
  const labels: Record<string, string> = {
    not_started: "Pendiente",
    pending: "Pendiente de preparación",
    preparing: "En preparación",
    ready: "Listo para entregar",
    dispatched: "En camino",
    delivered: "Entregado",
    completed: "Finalizado por el comprador",
    canceled: "Cancelado",
  };
  return labels[status] || "Pendiente";
}

function documentDate(value: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(value);
}

export async function listAllwainOrderDocuments(
  userId: string,
  orderId: string,
) {
  const prisma = getPrisma() as any;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const order = await prisma.allwainOrder.findUnique({
    where: { id: orderId },
  });
  if (!user || !order) throw new Error("ORDER_NOT_FOUND");
  if (
    ![order.buyerUserId, order.sellerUserId, order.connectorUserId].includes(
      userId,
    ) &&
    user.role !== "admin"
  ) {
    throw new Error("FORBIDDEN");
  }
  const items = await prisma.allwainFiscalDocument.findMany({
    where: { orderId, status: { not: "void" } },
    orderBy: { createdAt: "asc" },
  });
  return items.map((item: any) => ({
    id: item.id,
    documentType: item.documentType,
    title: documentLabel(item.documentType),
    status: item.status,
    documentNumber: item.documentNumber,
    sourceReference: item.sourceReference,
    totalAmount: item.totalAmount,
    currency: item.currency,
    issuedAt: item.issuedAt,
    contentHash: item.contentHash,
    signatureRequired: item.signatureRequired,
    signatureStatus: item.signatureStatus,
    signedAt: item.signedAt,
    canSign:
      item.signatureRequired &&
      item.signatureStatus === "pending" &&
      fiscalDocumentPartyUserId(
        order,
        String((item.contentSnapshot as Record<string, any>)?.signatureBy || ""),
      ) === userId,
  }));
}

export async function exportAllwainDocumentPdf(
  userId: string,
  documentId: string,
) {
  const prisma = getPrisma() as any;
  const [user, document] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.allwainFiscalDocument.findUnique({ where: { id: documentId } }),
  ]);
  if (!user || !document) throw new Error("DOCUMENT_NOT_FOUND");
  const order = await prisma.allwainOrder.findUnique({
    where: { id: document.orderId },
  });
  if (!order) throw new Error("DOCUMENT_NOT_FOUND");
  if (
    ![order.buyerUserId, order.sellerUserId, order.connectorUserId].includes(
      userId,
    ) &&
    user.role !== "admin"
  ) {
    throw new Error("FORBIDDEN");
  }
  const parties = await prisma.user.findMany({
    where: {
      id: {
        in: [order.buyerUserId, order.sellerUserId, order.connectorUserId].filter(
          (id): id is string => Boolean(id),
        ),
      },
    },
    select: { id: true, name: true },
  });
  const partyName = (id: string | null) =>
    parties.find((party: any) => party.id === id)?.name || "Identidad registrada";
  const content = (document.contentSnapshot || {}) as Record<string, any>;
  const currency = String(document.currency).toUpperCase();
  const money = (amount: unknown) =>
    `${(Number(amount || 0) / 100).toFixed(2)} ${currency}`;
  const formattedAddress = (value: unknown) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object" && "formatted" in (value as any)) {
      return cleanText((value as any).formatted, 500);
    }
    return cleanText(JSON.stringify(value), 500);
  };
  const partyLines = (heading: string, party: any, fallback: string) => [
    heading,
    `Nombre o razón social: ${party?.legalName || party?.displayName || party?.tradeName || fallback}`,
    ...(party?.taxId || party?.vatId
      ? [`Identificación fiscal: ${party.taxId || party.vatId}`]
      : []),
    ...(formattedAddress(party?.address || party?.billingAddress)
      ? [`Domicilio: ${formattedAddress(party?.address || party?.billingAddress)}`]
      : []),
    "",
  ];
  const fiscalDocument = FISCAL_DOCUMENT_TYPES.has(document.documentType);
  const documentLines = Array.isArray(content.lines) ? content.lines : [];
  const detailLines =
    document.documentType === "platform_service_invoice"
      ? [
          `Servicio de intermediación de Allwain: ${money(document.totalAmount)}`,
        ]
      : document.documentType === "reagp_compensation_receipt"
        ? [
            `Compensación agraria de la operación: ${money(document.totalAmount)}`,
          ]
        : documentLines.length
          ? documentLines.flatMap((line: any, index: number) => [
              `${index + 1}. ${line.productName || "Producto o servicio"}`,
              `   ${line.quantity} ${line.unit} x ${money(line.unitPriceAmount)} = ${money(line.subtotalAmount)}`,
              ...(line.description ? [`   ${String(line.description).slice(0, 500)}`] : []),
            ])
          : [`Cantidad: ${order.quantity} ${order.unit}`];
  const lines = [
    fiscalDocument ? "DOCUMENTO FISCAL" : "JUSTIFICANTE OPERATIVO",
    `Documento: ${document.documentNumber || document.id}`,
    ...(document.series ? [`Serie: ${document.series}`] : []),
    `Pedido: ${order.id}`,
    `Contrato: ${order.contractId}`,
    `Fecha de emisión: ${documentDate(document.issuedAt || document.createdAt)}`,
    "",
    ...partyLines(
      "EMISOR",
      content.issuer,
      document.issuerUserId
        ? partyName(document.issuerUserId)
        : ENV.ALLWAIN_LEGAL_NAME || "Allwain",
    ),
    ...partyLines(
      "DESTINATARIO",
      content.recipient,
      document.recipientUserId
        ? partyName(document.recipientUserId)
        : "Destinatario registrado",
    ),
    "DETALLE",
    ...detailLines,
    "",
    "IMPORTES",
    `Base: ${money(document.subtotalAmount)}`,
    `Impuestos: ${money(document.taxAmount)}`,
    ...(Number(content.agriculturalCompensationAmount || 0) > 0
      ? [
          `Compensación agraria: ${money(content.agriculturalCompensationAmount)}`,
        ]
      : []),
    `Total: ${money(document.totalAmount)}`,
    ...(Number(content.taxRateBps || 0) > 0
      ? [`Tipo indicado: ${(Number(content.taxRateBps) / 100).toFixed(2)} %`]
      : []),
    "",
    ...(content.taxTreatmentCode
      ? ["TRATAMIENTO", `Código: ${content.taxTreatmentCode}`]
      : []),
    ...(content.legalBasis ? [`Base indicada: ${content.legalBasis}`] : []),
    ...(content.professionalApprovalReference
      ? [`Validación profesional: ${content.professionalApprovalReference}`]
      : []),
    ...(content.taxTreatmentCode || content.legalBasis ? [""] : []),
    "ESTADO REGISTRADO",
    `Pago: ${documentPaymentLabel(order.paymentStatus)}`,
    `Entrega: ${documentFulfillmentLabel(order.fulfillmentStatus)}`,
    ...(order.connectorUserId
      ? [`Conector: ${partyName(order.connectorUserId)}`]
      : []),
    "",
    ...(document.signatureRequired
      ? [
          "FIRMA",
          `Estado: ${document.signatureStatus === "signed" ? "Firmado" : "Pendiente"}`,
          ...((document.signatureEvidence as any)?.typedName
            ? [`Firmado por: ${(document.signatureEvidence as any).typedName}`]
            : []),
          ...(document.signedAt
            ? [`Fecha: ${documentDate(document.signedAt)}`]
            : []),
          ...(document.signatureHash
            ? [`Huella de firma: ${document.signatureHash}`]
            : []),
          "",
        ]
      : []),
    "",
    "VERIFICACIÓN",
    `Huella SHA-256: ${document.contentHash}`,
    `Versión de plantilla: ${document.templateVersion}`,
    ...(content.settlementHash
      ? [`Huella de liquidación: ${content.settlementHash}`]
      : []),
    "El contenido versionado se conserva en Allwain para auditoría.",
    "",
    ...(fiscalDocument
      ? []
      : [
          "Este justificante acredita el estado operativo indicado. No es una factura.",
        ]),
  ];
  return {
    orderId: order.id,
    filename: `allwain-${document.documentType}-${order.id}.pdf`,
    buffer: buildTextPdf({
      title: `Allwain - ${documentLabel(document.documentType)}`,
      lines,
    }),
  };
}

export async function getAllwainOrderCompliance(
  userId: string,
  orderId: string,
) {
  const prisma = getPrisma() as any;
  const [user, order] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.allwainOrder.findUnique({ where: { id: orderId } }),
  ]);
  if (!user || !order) throw new Error("ORDER_NOT_FOUND");
  if (
    ![order.buyerUserId, order.sellerUserId, order.connectorUserId].includes(
      userId,
    ) &&
    user.role !== "admin"
  ) {
    throw new Error("FORBIDDEN");
  }
  const [
    lines,
    parties,
    tax,
    settlements,
    transfers,
    documents,
    lots,
    incidents,
  ] = await Promise.all([
    prisma.allwainOrderLine.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.allwainPartySnapshot.findMany({
      where: { orderId },
      orderBy: { role: "asc" },
    }),
    prisma.allwainTaxDetermination.findUnique({ where: { orderId } }),
    prisma.allwainSettlementPlan.findMany({
      where: { orderId },
      orderBy: { version: "desc" },
    }),
    prisma.allwainTransfer.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    }),
    listAllwainOrderDocuments(userId, orderId),
    prisma.allwainOrderLotAllocation.findMany({
      where: { orderId },
      include: {
        lot: {
          select: {
            id: true,
            code: true,
            status: true,
            originCountry: true,
            originRegion: true,
            harvestOrProducedAt: true,
            recall: {
              select: {
                id: true,
                status: true,
                reason: true,
                instructions: true,
                affectedOrderCount: true,
                affectedBuyerCount: true,
                createdAt: true,
              },
            },
          },
        },
        orderLine: { select: { id: true, productName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.allwainIncident.findMany({
      where: { orderId },
      include: { reporter: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    orderId,
    statuses: {
      tax: order.taxStatus,
      documents: order.documentStatus,
      traceability: order.traceabilityStatus,
      settlement: order.settlementStatus,
    },
    legalSellerUserId: order.legalSellerUserId || order.sellerUserId,
    commercialTermsVersion: order.commercialTermsVersion,
    lines,
    parties: parties.map((party: any) => ({
      role: party.role,
      displayName: party.displayName,
      actingCapacity: party.actingCapacity,
      countryCode: party.countryCode,
      vatRegime:
        user.role === "admin" || party.userId === userId
          ? party.vatRegime
          : undefined,
      snapshotHash: party.snapshotHash,
      createdAt: party.createdAt,
    })),
    tax,
    settlements,
    transfers: transfers.map((transfer: any) => ({
      id: transfer.id,
      recipientRole: transfer.recipientRole,
      status: transfer.status,
      amount: transfer.amount,
      reversedAmount: transfer.reversedAmount,
      currency: transfer.currency,
      releaseTrigger: transfer.releaseTrigger,
      transferredAt: transfer.transferredAt,
    })),
    documents,
    lots,
    incidents,
  };
}

export async function createAllwainProductLot(
  userId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const prisma = getPrisma() as any;
  const code = cleanText(input.code, 100);
  if (!code) throw new Error("LOT_CODE_REQUIRED");
  const offerId = cleanText(input.offerId, 100);
  if (offerId) {
    const offer = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer || offer.ownerUserId !== userId)
      throw new Error("OFFER_NOT_FOUND");
  }
  const quantity =
    input.availableQuantity === undefined || input.availableQuantity === null
      ? null
      : Number(input.availableQuantity);
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0))
    throw new Error("INVALID_LOT_QUANTITY");
  const lot = await prisma.allwainProductLot.upsert({
    where: { sellerUserId_code: { sellerUserId: userId, code } },
    create: {
      sellerUserId: userId,
      offerId,
      code,
      originCountry: input.originCountry
        ? cleanCountry(input.originCountry)
        : null,
      originRegion: cleanText(input.originRegion, 150),
      harvestOrProducedAt: input.harvestOrProducedAt
        ? new Date(String(input.harvestOrProducedAt))
        : null,
      bestBeforeAt: input.bestBeforeAt
        ? new Date(String(input.bestBeforeAt))
        : null,
      expiresAt: input.expiresAt ? new Date(String(input.expiresAt)) : null,
      availableQuantity: quantity,
      unit: cleanText(input.unit, 30),
      traceabilityData: safeJson(input.traceabilityData),
    },
    update: {
      offerId,
      originCountry: input.originCountry
        ? cleanCountry(input.originCountry)
        : null,
      originRegion: cleanText(input.originRegion, 150),
      bestBeforeAt: input.bestBeforeAt
        ? new Date(String(input.bestBeforeAt))
        : null,
      expiresAt: input.expiresAt ? new Date(String(input.expiresAt)) : null,
      availableQuantity: quantity,
      unit: cleanText(input.unit, 30),
      traceabilityData: safeJson(input.traceabilityData),
    },
  });
  await appendAllwainAuditEvent({
    aggregateType: "product_lot",
    aggregateId: lot.id,
    eventType: "lot.saved",
    actorUserId: userId,
    actorRole: "seller",
    source: "allwain_traceability",
    requestId,
    payload: {
      lotId: lot.id,
      offerId: lot.offerId,
      code: lot.code,
      status: lot.status,
    },
  });
  return lot;
}

export async function allocateAllwainOrderLot(
  userId: string,
  orderId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const prisma = getPrisma() as any;
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error("INVALID_LOT_QUANTITY");
  return prisma.$transaction(async (tx: any) => {
    const order = await tx.allwainOrder.findUnique({ where: { id: orderId } });
    if (!order || order.sellerUserId !== userId)
      throw new Error("ORDER_NOT_FOUND");
    const line = input.orderLineId
      ? await tx.allwainOrderLine.findUnique({
          where: { id: String(input.orderLineId) },
        })
      : await tx.allwainOrderLine.findFirst({
          where: { orderId },
          orderBy: { createdAt: "asc" },
        });
    const lot = await tx.allwainProductLot.findUnique({
      where: { id: String(input.lotId || "") },
    });
    if (
      !line ||
      line.orderId !== orderId ||
      !lot ||
      lot.sellerUserId !== userId
    ) {
      throw new Error("LOT_NOT_FOUND");
    }
    const allocation = await tx.allwainOrderLotAllocation.upsert({
      where: { orderLineId_lotId: { orderLineId: line.id, lotId: lot.id } },
      create: {
        orderId,
        orderLineId: line.id,
        lotId: lot.id,
        quantity,
        unit: order.unit,
      },
      update: { quantity, unit: order.unit },
    });
    await tx.allwainOrder.update({
      where: { id: orderId },
      data: { traceabilityStatus: "lot_assigned" },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: orderId,
      eventType: "traceability.lot_assigned",
      actorUserId: userId,
      actorRole: "seller",
      source: "allwain_traceability",
      requestId,
      payload: {
        lotId: lot.id,
        lotCode: lot.code,
        orderLineId: line.id,
        quantity,
        unit: order.unit,
      },
    });
    return allocation;
  });
}

type RecallAllocation = {
  orderId: string;
  order: { buyerUserId: string };
};

export function buildAllwainRecallImpact(allocations: RecallAllocation[]) {
  const orderIds = new Set<string>();
  const buyerIds = new Set<string>();
  const recipients = new Map<
    string,
    { buyerUserId: string; orderId: string }
  >();
  for (const allocation of allocations) {
    orderIds.add(allocation.orderId);
    buyerIds.add(allocation.order.buyerUserId);
    recipients.set(`${allocation.order.buyerUserId}:${allocation.orderId}`, {
      buyerUserId: allocation.order.buyerUserId,
      orderId: allocation.orderId,
    });
  }
  return {
    orderIds: Array.from(orderIds),
    buyerIds: Array.from(buyerIds),
    recipients: Array.from(recipients.values()),
  };
}

export async function recallAllwainProductLot(
  userId: string,
  lotId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const prisma = getPrisma() as any;
  const reason = cleanText(input.reason, 2_000);
  const instructions = cleanText(input.instructions, 2_000);
  if (!reason) throw new Error("LOT_RECALL_REASON_REQUIRED");

  const result = await prisma.$transaction(async (tx: any) => {
    const [user, lot] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { role: true } }),
      tx.allwainProductLot.findUnique({
        where: { id: lotId },
        include: {
          recall: true,
          orderAllocations: {
            select: {
              orderId: true,
              order: { select: { buyerUserId: true } },
            },
          },
        },
      }),
    ]);
    if (!user) throw new Error("USER_NOT_FOUND");
    if (!lot || (lot.sellerUserId !== userId && user.role !== "admin")) {
      throw new Error("LOT_NOT_FOUND");
    }

    const impact = buildAllwainRecallImpact(lot.orderAllocations);
    if (lot.recall) {
      return { recall: lot.recall, lot, impact, created: false };
    }

    const recall = await tx.allwainProductRecall.create({
      data: {
        lotId: lot.id,
        sellerUserId: lot.sellerUserId,
        issuedByUserId: userId,
        reason,
        instructions,
        affectedOrderCount: impact.orderIds.length,
        affectedBuyerCount: impact.buyerIds.length,
        affectedOrderIds: impact.orderIds,
        affectedBuyerIds: impact.buyerIds,
      },
    });
    await tx.allwainProductLot.update({
      where: { id: lot.id },
      data: { status: "recalled" },
    });
    if (impact.orderIds.length) {
      await tx.allwainOrder.updateMany({
        where: { id: { in: impact.orderIds } },
        data: { traceabilityStatus: "recalled" },
      });
    }
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "product_lot",
      aggregateId: lot.id,
      eventType: "lot.recalled",
      actorUserId: userId,
      actorRole: user.role,
      source: "allwain_traceability",
      requestId,
      payload: {
        recallId: recall.id,
        lotCode: lot.code,
        reason,
        affectedOrderCount: impact.orderIds.length,
        affectedBuyerCount: impact.buyerIds.length,
      },
    });
    for (const orderId of impact.orderIds) {
      await appendAllwainAuditEventTx(tx, {
        aggregateId: orderId,
        eventType: "traceability.lot_recalled",
        actorUserId: userId,
        actorRole: user.role,
        source: "allwain_traceability",
        requestId,
        payload: { recallId: recall.id, lotId: lot.id, lotCode: lot.code },
      });
    }
    return { recall, lot, impact, created: true };
  });

  await Promise.all(
    result.impact.recipients.map(
      (recipient: { buyerUserId: string; orderId: string }) =>
      notifyAllwainUser({
        userId: recipient.buyerUserId,
        type: "traceability.lot_recalled",
        title: "Retirada de producto",
        body: `Revisa el pedido del lote ${result.lot.code}. El vendedor ha comunicado una retirada.`,
        route: "order",
        routeParams: {
          orderId: recipient.orderId,
          recallId: result.recall.id,
          mode: "buy",
        },
        dedupeKey: `traceability.lot_recalled:${result.recall.id}:${recipient.orderId}:${recipient.buyerUserId}`,
      }),
    ),
  );

  return {
    id: result.recall.id,
    lotId: result.recall.lotId,
    status: result.recall.status,
    reason: result.recall.reason,
    instructions: result.recall.instructions,
    affectedOrderCount: result.recall.affectedOrderCount,
    affectedBuyerCount: result.recall.affectedBuyerCount,
    createdAt: result.recall.createdAt,
    created: result.created,
  };
}

export async function createAllwainIncident(
  userId: string,
  orderId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const prisma = getPrisma() as any;
  const type = String(input.type || "other").toLowerCase();
  if (!INCIDENT_TYPES.has(type)) throw new Error("INVALID_INCIDENT_TYPE");
  const reason = cleanText(input.reason, 2_000);
  if (!reason) throw new Error("INCIDENT_REASON_REQUIRED");
  const incident = await prisma.$transaction(async (tx: any) => {
    const order = await tx.allwainOrder.findUnique({
      where: { id: orderId },
    });
    if (
      !order ||
      ![order.buyerUserId, order.sellerUserId, order.connectorUserId].includes(
        userId,
      )
    ) {
      throw new Error("ORDER_NOT_FOUND");
    }
    const created = await tx.allwainIncident.create({
      data: {
        orderId,
        reporterUserId: userId,
        type,
        reason,
        requestedResolution: cleanText(input.requestedResolution, 500),
        evidence: safeJson(input.evidence),
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: orderId,
      eventType: "incident.opened",
      actorUserId: userId,
      source: "allwain_incidents",
      requestId,
      payload: {
        incidentId: created.id,
        type,
        requestedResolution: created.requestedResolution,
      },
    });
    return created;
  });
  await notifyAllwainOrderParticipants(orderId, {
    excludeUserId: userId,
    type: "incident.opened",
    title: "Hay una incidencia en el pedido",
    body: "Una de las partes ha solicitado revisar la operación.",
    dedupeSuffix: incident.id,
  });
  const admins = await prisma.user.findMany({
    where: { role: "admin", deletedAt: null },
    select: { id: true },
  });
  await Promise.all(
    admins.map((admin: any) =>
      notifyAllwainUser({
        userId: admin.id,
        type: "incident.admin_review",
        title: "Nueva incidencia por revisar",
        body: `Pedido ${orderId.slice(0, 8)} · ${type}`,
        route: "order",
        routeParams: { orderId, incidentId: incident.id },
        dedupeKey: `incident.admin_review:${incident.id}:${admin.id}`,
      }),
    ),
  );
  return incident;
}

export async function listAllwainAdminIncidents(
  options: { status?: string; limit?: number; cursor?: string | null } = {},
) {
  const normalizedStatus = options.status
    ? String(options.status).trim().toLowerCase()
    : undefined;
  if (normalizedStatus && !INCIDENT_STATUSES.has(normalizedStatus)) {
    throw new Error("INVALID_INCIDENT_STATUS");
  }
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(options.limit) || 50)));
  const rows = await (getPrisma() as any).allwainIncident.findMany({
    where: normalizedStatus ? { status: normalizedStatus } : undefined,
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      order: {
        select: {
          id: true,
          buyerUserId: true,
          sellerUserId: true,
          connectorUserId: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          subtotalAmount: true,
          refundedAmount: true,
          currency: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;
  return {
    items,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? items[items.length - 1]?.id || null : null,
    },
  };
}

export async function updateAllwainIncident(
  adminUserId: string,
  incidentId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const status = String(input.status || "").trim().toLowerCase();
  if (!INCIDENT_STATUSES.has(status)) {
    throw new Error("INVALID_INCIDENT_STATUS");
  }
  const resolutionNote = cleanText(input.resolutionNote, 2_000);
  if (["resolved", "rejected"].includes(status) && !resolutionNote) {
    throw new Error("INCIDENT_RESOLUTION_REQUIRED");
  }
  const prisma = getPrisma() as any;
  const result = await prisma.$transaction(async (tx: any) => {
    const incident = await tx.allwainIncident.findUnique({
      where: { id: incidentId },
    });
    if (!incident) throw new Error("INCIDENT_NOT_FOUND");
    const updated = await tx.allwainIncident.update({
      where: { id: incidentId },
      data: {
        status,
        assignedToUserId:
          status === "open"
            ? null
            : input.assignedToUserId
              ? String(input.assignedToUserId)
              : adminUserId,
        resolution: resolutionNote
          ? {
              note: resolutionNote,
              outcome: cleanText(input.outcome, 120),
              resolvedByUserId: adminUserId,
            }
          : undefined,
        resolvedAt: ["resolved", "rejected"].includes(status)
          ? new Date()
          : null,
      },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: incident.orderId,
      eventType: `incident.${status}`,
      actorUserId: adminUserId,
      actorRole: "admin",
      source: "allwain_incidents",
      requestId,
      payload: {
        incidentId,
        previousStatus: incident.status,
        status,
        resolutionNote,
      },
    });
    return updated;
  });
  await notifyAllwainOrderParticipants(result.orderId, {
    type: `incident.${status}`,
    title:
      status === "resolved"
        ? "La incidencia se ha resuelto"
        : status === "rejected"
          ? "La incidencia se ha revisado"
          : "La incidencia está en revisión",
    body:
      resolutionNote ||
      "El equipo de Allwain ha actualizado el estado de la incidencia.",
    dedupeSuffix: `${incidentId}:${status}`,
  });
  return result;
}

export async function reviewAllwainTaxDetermination(
  adminUserId: string,
  orderId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const decision = String(input.decision || "");
  const professionalApprovalReference = cleanText(
    input.professionalApprovalReference,
    500,
  );
  if (!["approve", "reject"].includes(decision)) {
    throw new Error("INVALID_TAX_REVIEW_DECISION");
  }
  if (decision === "approve" && !professionalApprovalReference) {
    throw new Error("PROFESSIONAL_APPROVAL_REFERENCE_REQUIRED");
  }
  const prisma = getPrisma() as any;
  const actor = await prisma.user.findUnique({ where: { id: adminUserId } });
  if (!actor || actor.role !== "admin") throw new Error("FORBIDDEN");
  return prisma.$transaction(async (tx: any) => {
    const rows = (await tx.$queryRaw(
      Prisma.sql`SELECT * FROM "AllwainOrder" WHERE "id" = ${orderId} FOR UPDATE`,
    )) as any[];
    const order = rows[0];
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (["checkout_locked", "locked", "settled"].includes(order.settlementStatus)) {
      throw new Error("TAX_REVIEW_LOCKED");
    }
    const determination = await tx.allwainTaxDetermination.findUnique({
      where: { orderId },
    });
    if (!determination?.ruleVersionId) throw new Error("TAX_RULE_NOT_FOUND");
    const rule = await tx.allwainTaxRuleVersion.findUnique({
      where: { id: determination.ruleVersionId },
    });
    if (!rule?.advisorApprovedAt || !rule.advisorReference) {
      throw new Error("TAX_RULE_REQUIRES_ADVISOR_APPROVAL");
    }
    if (decision === "reject") {
      const rejected = await tx.allwainTaxDetermination.update({
        where: { id: determination.id },
        data: {
          status: "manual_review",
          reviewedByUserId: adminUserId,
          reviewedAt: new Date(),
          overrideReason: cleanText(input.reason, 1_000),
          professionalApprovalReference: null,
          documentPlan: null,
          determinedAt: null,
        },
      });
      await tx.allwainOrder.update({
        where: { id: orderId },
        data: { taxStatus: "manual_review", settlementStatus: "draft" },
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateId: orderId,
        eventType: "tax.determination_rejected",
        actorUserId: adminUserId,
        actorRole: "admin",
        source: "allwain_tax_review",
        requestId,
        payload: {
          determinationId: determination.id,
          ruleVersionId: rule.id,
          reason: cleanText(input.reason, 1_000),
        },
      });
      return rejected;
    }

    const calculated = calculateAllwainTaxSettlement(order, determination.outputSnapshot || {});
    const now = new Date();
    const approved = await tx.allwainTaxDetermination.update({
      where: { id: determination.id },
      data: {
        status: "determined",
        taxAmount: calculated.taxAmount,
        agriculturalCompensationAmount: calculated.compensationAmount,
        documentPlan: calculated.documentPlan,
        professionalApprovalReference,
        reviewedByUserId: adminUserId,
        reviewedAt: now,
        overrideReason: cleanText(input.reason, 1_000),
        determinedAt: now,
      },
    });
    const settlement = await applySettlementDeterminationTx(
      tx,
      order,
      approved,
      rule,
    );
    if (!settlement) throw new Error("SETTLEMENT_NOT_APPROVED");
    await tx.allwainSettlementPlan.update({
      where: { id: settlement.id },
      data: {
        approvedByUserId: adminUserId,
        professionalApprovalReference,
        approvedAt: now,
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: orderId,
      eventType: "tax.determination_approved",
      actorUserId: adminUserId,
      actorRole: "admin",
      source: "allwain_tax_review",
      requestId,
      payload: {
        determinationId: approved.id,
        ruleVersionId: rule.id,
        professionalApprovalReference,
        settlementPlanId: settlement.id,
        settlementVersion: settlement.version,
        settlementHash: settlement.snapshotHash,
      },
    });
    return approved;
  });
}

export async function createAllwainTaxRule(
  adminUserId: string,
  input: Record<string, unknown>,
  requestId?: string,
) {
  const prisma = getPrisma() as any;
  const code = String(input.code || "")
    .trim()
    .toUpperCase();
  const version = Number(input.version || 1);
  if (
    !/^[A-Z0-9_]{4,80}$/.test(code) ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new Error("INVALID_TAX_RULE_IDENTITY");
  }
  const status = String(input.status || "draft");
  const advisorApprovedAt = input.advisorApprovedAt
    ? new Date(String(input.advisorApprovedAt))
    : null;
  const advisorReference = cleanText(input.advisorReference, 500);
  if (advisorApprovedAt && Number.isNaN(advisorApprovedAt.getTime())) {
    throw new Error("INVALID_ADVISOR_APPROVAL_DATE");
  }
  if (status === "active" && (!advisorApprovedAt || !advisorReference))
    throw new Error("TAX_RULE_REQUIRES_ADVISOR_APPROVAL");
  if (status === "active") {
    calculateAllwainTaxSettlement(
      {
        subtotalAmount: 10_000,
        shippingAmount: 0,
        platformFeeAmount: 1_000,
        connectorFeeAmount: 0,
      },
      input.outcome || {},
    );
  }
  const rule = await prisma.allwainTaxRuleVersion.create({
    data: {
      code,
      version,
      status,
      priority: Number(input.priority || 100),
      effectiveFrom: input.effectiveFrom
        ? new Date(String(input.effectiveFrom))
        : null,
      effectiveTo: input.effectiveTo
        ? new Date(String(input.effectiveTo))
        : null,
      conditions: safeJson(input.conditions || {}),
      outcome: safeJson(input.outcome || {}),
      sourceReferences: safeJson(input.sourceReferences),
      requiresProfessionalReview: input.requiresProfessionalReview !== false,
      advisorApprovedAt,
      advisorReference,
      createdByUserId: adminUserId,
    },
  });
  await appendAllwainAuditEvent({
    aggregateType: "tax_rule",
    aggregateId: rule.id,
    eventType: "tax_rule.created",
    actorUserId: adminUserId,
    actorRole: "admin",
    source: "allwain_tax_engine",
    requestId,
    payload: {
      code: rule.code,
      version: rule.version,
      status: rule.status,
      advisorReference: rule.advisorReference,
    },
  });
  return rule;
}

export async function listAllwainTaxRules() {
  return (getPrisma() as any).allwainTaxRuleVersion.findMany({
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
}
