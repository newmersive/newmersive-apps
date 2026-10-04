import type {
  AllwainParticipation,
  AllwainProfileStatus,
} from "../config/api";

const PROFILE_STATUSES = new Set<AllwainProfileStatus>([
  "not_activated",
  "onboarding",
  "pending_verification",
  "active",
  "restricted",
]);

const SELLER_ENABLED_STATUSES = new Set<AllwainProfileStatus>([
  "onboarding",
  "pending_verification",
  "active",
]);

const CONNECTOR_RADII = new Set([1, 5, 10, 20, 50]);

function objectOrEmpty(value: unknown): Record<string, any> {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : {};
}

function profileStatus(value: unknown): AllwainProfileStatus {
  return PROFILE_STATUSES.has(value as AllwainProfileStatus)
    ? (value as AllwainProfileStatus)
    : "not_activated";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Keeps old cached sessions renderable while the API snapshot is refreshed. */
export function normalizeAllwainParticipation(
  value: unknown,
): AllwainParticipation {
  const source = objectOrEmpty(value);
  const experience = objectOrEmpty(source.experience);
  const seller = objectOrEmpty(source.seller);
  const connector = objectOrEmpty(source.connector);
  const sellerStatus = profileStatus(seller.status);
  const connectorStatus = profileStatus(connector.status);
  const rawRadius = Number(connector.radiusKm);
  const radiusKm = (CONNECTOR_RADII.has(rawRadius) ? rawRadius : 5) as
    | 1
    | 5
    | 10
    | 20
    | 50;
  const onboardingVersion = Number(experience.onboardingVersion);

  return {
    experience: {
      onboardingVersion:
        Number.isInteger(onboardingVersion) && onboardingVersion >= 0
          ? onboardingVersion
          : 0,
      onboardingCompletedAt: nullableString(
        experience.onboardingCompletedAt,
      ),
      primaryIntent:
        experience.primaryIntent === "buy" ||
        experience.primaryIntent === "sell" ||
        experience.primaryIntent === "connector"
          ? experience.primaryIntent
          : null,
      guidanceEnabled: experience.guidanceEnabled !== false,
      lastContext: nullableString(experience.lastContext),
    },
    buyer: { status: "active", enabled: true },
    seller: {
      status: sellerStatus,
      commercialModel:
        seller.commercialModel === "platform_direct"
          ? "platform_direct"
          : "marketplace",
      businessOfRecord:
        seller.businessOfRecord === "platform" ? "platform" : "seller",
      enabled:
        typeof seller.enabled === "boolean"
          ? seller.enabled
          : SELLER_ENABLED_STATUSES.has(sellerStatus),
      sellerType: nullableString(seller.sellerType),
      displayName: nullableString(seller.displayName),
      paymentStatus: nullableString(seller.paymentStatus),
      fiscalStatus: nullableString(seller.fiscalStatus) || "not_started",
      fiscalReady: seller.fiscalReady === true,
      paymentReady: seller.paymentReady === true,
      sellerReady: seller.sellerReady === true,
      locationLabel: nullableString(seller.locationLabel),
      pickupAddress: nullableString(seller.pickupAddress),
      locationReady: seller.locationReady === true,
      shippingPostalCode: nullableString(seller.shippingPostalCode),
      shippingCity: nullableString(seller.shippingCity),
      shippingCountryCode:
        nullableString(seller.shippingCountryCode)?.toUpperCase() || "ES",
      shippingPhone: nullableString(seller.shippingPhone),
      carrierReady: seller.carrierReady === true,
    },
    connector: {
      status: connectorStatus,
      enabled:
        typeof connector.enabled === "boolean"
          ? connector.enabled
          : connectorStatus === "active",
      newmersiveId: nullableString(connector.newmersiveId),
      referralUrl: nullableString(connector.referralUrl),
      available: connector.available === true,
      radiusKm,
      locationLabel: nullableString(connector.locationLabel),
    },
  };
}
