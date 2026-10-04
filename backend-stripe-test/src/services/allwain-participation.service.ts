import crypto from "crypto";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import {
  AllwainParticipationSnapshot,
  AllwainProfileStatus,
  User,
} from "../shared/types";
import {
  addReferralStat,
  getDatabase,
  getReferralStatsByUser,
  getUserById,
  upsertUser,
} from "./data.store";
import {
  getUserByIdPg,
  getUserBySponsorCodePg,
  upsertUserPg,
} from "./data.store.pg";
import {
  allwainPaymentsConfigured,
  normalizeAllwainCommercialModel,
  normalizeAllwainLocalDeliveryFeeAmount,
} from "./allwain-money";
import {
  appendAllwainAuditEventTx,
  canonicalAllwainAuditJson,
} from "./allwain-audit";
import {
  hasActiveAllwainDocumentMandate,
  isAllwainFiscalProfileReady,
} from "./allwain-compliance.service";

const SELLER_TYPES = new Set([
  "producer",
  "professional",
  "self_employed",
  "shop",
  "company",
  "other",
]);
const CONNECTOR_RADII = new Set([1, 5, 10, 20, 50]);
const CONNECTOR_DEMO_SCENARIOS = [
  {
    id: "demo-logistics-oranges-foios",
    title: "15 kg de naranjas",
    pickupZone: "Agricultor de Foios",
    deliveryZone: "Familia de Foios",
    distanceKm: 2.4,
  },
  {
    id: "demo-logistics-market-meliana",
    title: "2 cajas de producto local",
    pickupZone: "Comercio de Meliana",
    deliveryZone: "Punto vecinal de Alboraya",
    distanceKm: 4.8,
  },
  {
    id: "demo-logistics-pantry-valencia",
    title: "Pedido semanal de alimentación",
    pickupZone: "Productor de l'Horta Nord",
    deliveryZone: "Comprador de Valencia",
    distanceKm: 7.6,
  },
] as const;

function allwainConnectorDemoLogistics() {
  const feeAmount = normalizeAllwainLocalDeliveryFeeAmount();
  return CONNECTOR_DEMO_SCENARIOS.map((scenario, index) => ({
    ...scenario,
    orderId: null,
    status: "open",
    feeAmount,
    networkBonusAmount: 0,
    currency: "eur",
    pickupAddress: null,
    deliveryAddress: null,
    mine: false,
    demo: true,
    createdAt: new Date(Date.UTC(2026, 8, 4, 8, index)).toISOString(),
  }));
}
const activeSellerStatuses = new Set<AllwainProfileStatus>([
  "onboarding",
  "pending_verification",
  "active",
]);

export function resolveAllwainSellerWorkspaceStatus(
  profileStatus: unknown,
  paymentStatus?: unknown,
): AllwainProfileStatus {
  const normalized = normalizeProfileStatus(profileStatus);
  // Older Stripe synchronizations copied a restricted payment capability into
  // the seller profile. Payment readiness and marketplace access are separate.
  if (normalized === "restricted" && paymentStatus === "restricted") {
    return "onboarding";
  }
  return normalized;
}

export function isAllwainSellerWorkspaceStatusEnabled(
  profileStatus: unknown,
  paymentStatus?: unknown,
) {
  return activeSellerStatuses.has(
    resolveAllwainSellerWorkspaceStatus(profileStatus, paymentStatus),
  );
}

export function isAllwainSellerPaymentStateReady(input: {
  profileStatus: unknown;
  paymentStatus?: unknown;
  fiscalReady: boolean;
  chargesEnabled: boolean;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
}) {
  return Boolean(
    isAllwainSellerWorkspaceStatusEnabled(
      input.profileStatus,
      input.paymentStatus,
    ) &&
      input.fiscalReady &&
      input.chargesEnabled &&
      input.transfersEnabled &&
      input.payoutsEnabled,
  );
}

export function isAllwainSellerProfileActivatedStatus(value: unknown) {
  return normalizeProfileStatus(value) !== "not_activated";
}

type SellerActivationInput = {
  sellerType?: string;
  displayName?: string;
  locationLabel?: string | null;
  pickupAddress?: string | null;
  shippingPostalCode?: string | null;
  shippingCity?: string | null;
  shippingCountryCode?: string | null;
  shippingPhone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type ConnectorActivationInput = {
  available?: boolean;
  radiusKm?: number;
  locationLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const memorySellerProfiles = new Map<string, any>();
const memoryConnectorProfiles = new Map<string, any>();
const memoryExperienceProfiles = new Map<string, any>();
export const ALLWAIN_ONBOARDING_VERSION = 4;

function configuredPlatformSeller(user: any) {
  return ENV.ALLWAIN_PLATFORM_SELLER_EMAILS.includes(
    String(user?.email || "").trim().toLowerCase(),
  );
}

function usePostgres() {
  return ENV.STORAGE_DRIVER === "postgres";
}

function normalizeProfileStatus(value: unknown): AllwainProfileStatus {
  if (
    value === "onboarding" ||
    value === "pending_verification" ||
    value === "active" ||
    value === "restricted"
  ) {
    return value;
  }
  return "not_activated";
}

function normalizeRadius(value: unknown): 1 | 5 | 10 | 20 | 50 {
  const radius = Number(value);
  return (CONNECTOR_RADII.has(radius) ? radius : 5) as 1 | 5 | 10 | 20 | 50;
}

function normalizeLocationCoordinate(
  value: unknown,
  min: number,
  max: number,
  errorCode = "INVALID_CONNECTOR_LOCATION",
) {
  if (value === null || value === undefined || value === "") return null;
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new Error(errorCode);
  }
  // About 110 metres at the equator: enough for Km 0 matching without
  // retaining a doorstep-level coordinate.
  return Math.round(coordinate * 1_000) / 1_000;
}

function normalizedLocation(input: ConnectorActivationInput) {
  const locationLabel = String(input.locationLabel || "").trim().slice(0, 120) || null;
  const locationLatApprox = normalizeLocationCoordinate(input.latitude, -90, 90);
  const locationLngApprox = normalizeLocationCoordinate(input.longitude, -180, 180);
  if ((locationLatApprox === null) !== (locationLngApprox === null)) {
    throw new Error("INVALID_CONNECTOR_LOCATION");
  }
  return { locationLabel, locationLatApprox, locationLngApprox };
}

function normalizedSellerLocation(input: SellerActivationInput) {
  const locationLabel = String(input.locationLabel || "").trim().slice(0, 120) || null;
  const pickupAddress = String(input.pickupAddress || "").trim().slice(0, 500) || null;
  const locationLatApprox = normalizeLocationCoordinate(
    input.latitude,
    -90,
    90,
    "INVALID_SELLER_LOCATION",
  );
  const locationLngApprox = normalizeLocationCoordinate(
    input.longitude,
    -180,
    180,
    "INVALID_SELLER_LOCATION",
  );
  if ((locationLatApprox === null) !== (locationLngApprox === null)) {
    throw new Error("INVALID_SELLER_LOCATION");
  }
  return { locationLabel, pickupAddress, locationLatApprox, locationLngApprox };
}

function normalizedSellerShipping(input: SellerActivationInput) {
  const shippingPostalCode =
    String(input.shippingPostalCode || "").trim().toUpperCase().slice(0, 12) || null;
  const shippingCity = String(input.shippingCity || "").trim().slice(0, 80) || null;
  const shippingCountryCode = String(input.shippingCountryCode || "ES")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const shippingPhone =
    String(input.shippingPhone || "").trim().replace(/[^+\d]/g, "").slice(0, 20) || null;
  if (shippingCountryCode && !/^[A-Z]{2}$/.test(shippingCountryCode)) {
    throw new Error("INVALID_SELLER_SHIPPING_COUNTRY");
  }
  if (shippingPhone && !/^\+?\d{7,18}$/.test(shippingPhone)) {
    throw new Error("INVALID_SELLER_SHIPPING_PHONE");
  }
  return { shippingPostalCode, shippingCity, shippingCountryCode, shippingPhone };
}

async function getUser(userId: string) {
  return usePostgres() ? getUserByIdPg(userId) : getUserById(userId);
}

async function sponsorCodeExists(code: string) {
  if (usePostgres()) return Boolean(await getUserBySponsorCodePg(code));
  return getDatabase().users.some((user) => user.sponsorCode === code);
}

async function ensureSponsorCode(user: any): Promise<string> {
  if (user.sponsorCode) return String(user.sponsorCode);

  let code = "";
  do {
    code = "NID-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  } while (await sponsorCodeExists(code));

  user.sponsorCode = code;
  if (usePostgres()) await upsertUserPg(user as User);
  else upsertUser(user as User);
  return code;
}

export async function ensureAllwainParticipationProfiles(user: any) {
  if (!user?.id) throw new Error("USER_NOT_FOUND");

  if (!usePostgres()) {
    const platformSeller = configuredPlatformSeller(user);
    if (!memorySellerProfiles.has(user.id)) {
      memorySellerProfiles.set(user.id, {
        userId: user.id,
        status:
          platformSeller || user.role === "company" || user.role === "admin"
            ? "active"
            : "not_activated",
        commercialModel: platformSeller ? "platform_direct" : "marketplace",
        sellerType: platformSeller || user.role === "company" ? "company" : null,
        displayName: platformSeller
          ? "Allwain"
          : user.role === "company" || user.role === "admin"
            ? user.name
            : null,
        locationLabel: null,
        pickupAddress: null,
        locationLatApprox: null,
        locationLngApprox: null,
      });
    }
    if (!memoryConnectorProfiles.has(user.id)) {
      memoryConnectorProfiles.set(user.id, {
        userId: user.id,
        status: "not_activated",
        available: false,
        radiusKm: 5,
        locationLabel: null,
      });
    }
    if (!memoryExperienceProfiles.has(user.id)) {
      memoryExperienceProfiles.set(user.id, {
        userId: user.id,
        onboardingVersion: 0,
        onboardingCompletedAt: null,
        primaryIntent: null,
        guidanceEnabled: true,
        lastContext: null,
      });
    }
    return;
  }

  const prisma = getPrisma() as any;
  const legacySeller = user.role === "company" || user.role === "admin";
  const platformSeller = configuredPlatformSeller(user);
  await prisma.$transaction([
    prisma.allwainBuyerProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, status: "active" },
      update: {},
    }),
    prisma.allwainSellerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: legacySeller || platformSeller ? "active" : "not_activated",
        commercialModel: platformSeller ? "platform_direct" : "marketplace",
        sellerType: platformSeller
          ? "company"
          : user.role === "company"
            ? "company"
            : user.role === "admin"
              ? "admin"
              : null,
        displayName: platformSeller ? "Allwain" : legacySeller ? user.name : null,
        activatedAt: legacySeller || platformSeller ? new Date() : null,
      },
      update: platformSeller
        ? {
            status: "active",
            commercialModel: "platform_direct",
            sellerType: "company",
            displayName: "Allwain",
            activatedAt: new Date(),
            restrictedAt: null,
          }
        : {},
    }),
    prisma.allwainConnectorProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, status: "not_activated", available: false, radiusKm: 5 },
      update: {},
    }),
    prisma.allwainExperienceProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
  ]);
}

function allwainExperienceDto(row: any) {
  return {
    onboardingVersion: Number(row?.onboardingVersion || 0),
    onboardingCompletedAt:
      row?.onboardingCompletedAt?.toISOString?.() ||
      row?.onboardingCompletedAt ||
      null,
    primaryIntent: row?.primaryIntent || null,
    guidanceEnabled: row?.guidanceEnabled !== false,
    lastContext: row?.lastContext || null,
  };
}

export async function updateAllwainExperienceProfile(
  userId: string,
  input: {
    onboardingVersion?: unknown;
    primaryIntent?: unknown;
    guidanceEnabled?: unknown;
    lastContext?: unknown;
  },
) {
  const user = await getUser(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  await ensureAllwainParticipationProfiles(user);

  const data: Record<string, unknown> = {};
  if (input.onboardingVersion !== undefined) {
    const version = Number(input.onboardingVersion);
    if (
      !Number.isInteger(version) ||
      version < 0 ||
      version > ALLWAIN_ONBOARDING_VERSION
    ) {
      throw new Error("INVALID_ONBOARDING_VERSION");
    }
    data.onboardingVersion = version;
    if (version === ALLWAIN_ONBOARDING_VERSION) {
      data.onboardingCompletedAt = new Date();
    }
  }
  if (input.primaryIntent !== undefined) {
    const primaryIntent = String(input.primaryIntent || "").trim();
    if (!new Set(["buy", "sell", "connector"]).has(primaryIntent)) {
      throw new Error("INVALID_PRIMARY_INTENT");
    }
    data.primaryIntent = primaryIntent;
  }
  if (input.guidanceEnabled !== undefined) {
    if (typeof input.guidanceEnabled !== "boolean") {
      throw new Error("INVALID_GUIDANCE_SETTING");
    }
    data.guidanceEnabled = input.guidanceEnabled;
  }
  if (input.lastContext !== undefined) {
    const lastContext = String(input.lastContext || "").trim();
    if (lastContext.length > 64) throw new Error("INVALID_EXPERIENCE_CONTEXT");
    data.lastContext = lastContext || null;
  }
  if (!Object.keys(data).length) throw new Error("EXPERIENCE_UPDATE_REQUIRED");

  if (!usePostgres()) {
    const next = { ...memoryExperienceProfiles.get(userId), ...data };
    memoryExperienceProfiles.set(userId, next);
    return allwainExperienceDto(next);
  }
  const saved = await (getPrisma() as any).allwainExperienceProfile.update({
    where: { userId },
    data,
  });
  return allwainExperienceDto(saved);
}

export async function recordAllwainReferralAttribution(user: any) {
  if (!user?.id || !user.referredByCode) return;

  const sponsor = usePostgres()
    ? await getUserBySponsorCodePg(String(user.referredByCode))
    : getDatabase().users.find((item) => item.sponsorCode === user.referredByCode);
  if (!sponsor || sponsor.id === user.id) return;

  if (usePostgres()) {
    await (getPrisma() as any).referralStat.upsert({
      where: {
        userId_invitedUserId: {
          userId: sponsor.id,
          invitedUserId: user.id,
        },
      },
      create: {
        userId: sponsor.id,
        invitedUserId: user.id,
        source: "registration_code",
        status: "registered",
      },
      update: {
        source: "registration_code",
        status: "registered",
      },
    });
    return;
  }

  const existing = getReferralStatsByUser(sponsor.id).find(
    (item) => item.invitedUserId === user.id,
  );
  if (!existing) {
    addReferralStat({
      id: crypto.randomUUID(),
      userId: sponsor.id,
      invitedUserId: user.id,
      totalSavedByInvited: 0,
      commissionEarned: 0,
      monthlyHistory: [],
    });
  }
}

export async function getAllwainParticipationSnapshot(
  userId: string,
): Promise<AllwainParticipationSnapshot> {
  const user = await getUser(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  await ensureAllwainParticipationProfiles(user);
  const newmersiveId = await ensureSponsorCode(user);

  let seller: any;
  let connector: any;
  let paymentStatus: string | null = null;
  let paymentReady = false;
  let fiscalProfile: any = null;
  let experience: any;

  if (usePostgres()) {
    const prisma = getPrisma() as any;
    const [sellerRow, connectorRow, payment, businessFiscal, experienceRow] = await Promise.all([
      prisma.allwainSellerProfile.findUnique({ where: { userId } }),
      prisma.allwainConnectorProfile.findUnique({ where: { userId } }),
      prisma.allwainSellerPaymentAccount.findUnique({ where: { userId } }),
      prisma.allwainFiscalProfile.findUnique({
        where: { userId_kind: { userId, kind: "business" } },
      }),
      prisma.allwainExperienceProfile.findUnique({ where: { userId } }),
    ]);
    seller = sellerRow;
    connector = connectorRow;
    fiscalProfile = businessFiscal;
    experience = experienceRow;
    paymentStatus = payment?.status || null;
    paymentReady =
      normalizeAllwainCommercialModel(sellerRow?.commercialModel) ===
      "platform_direct"
        ? allwainPaymentsConfigured()
        : Boolean(
            payment?.chargesEnabled &&
              payment?.transfersEnabled &&
              payment?.payoutsEnabled,
          );
  } else {
    seller = memorySellerProfiles.get(userId);
    connector = memoryConnectorProfiles.get(userId);
    experience = memoryExperienceProfiles.get(userId);
    paymentReady = normalizeProfileStatus(seller?.status) === "active";
  }

  const storedSellerStatus = normalizeProfileStatus(seller?.status);
  const workspaceSellerStatus = resolveAllwainSellerWorkspaceStatus(
    storedSellerStatus,
    paymentStatus,
  );
  const fiscalReady = usePostgres()
    ? isAllwainFiscalProfileReady(fiscalProfile) &&
      hasActiveAllwainDocumentMandate(fiscalProfile)
    : storedSellerStatus === "active";
  const sellerStatus: AllwainProfileStatus =
    workspaceSellerStatus === "not_activated" ||
    workspaceSellerStatus === "restricted"
      ? workspaceSellerStatus
      : fiscalReady && paymentReady
        ? "active"
        : paymentStatus === "pending"
          ? "pending_verification"
          : "onboarding";
  const connectorStatus = normalizeProfileStatus(connector?.status);
  const referralUrl =
    ENV.ALLWAIN_APP_URL.replace(/\/$/, "") +
    "/?ref=" +
    encodeURIComponent(newmersiveId);

  return {
    experience: allwainExperienceDto(experience),
    buyer: { status: "active", enabled: true },
    seller: {
      status: sellerStatus,
      enabled: activeSellerStatuses.has(sellerStatus),
      sellerType: seller?.sellerType || null,
      commercialModel: normalizeAllwainCommercialModel(
        seller?.commercialModel,
      ),
      businessOfRecord:
        normalizeAllwainCommercialModel(seller?.commercialModel) ===
        "platform_direct"
          ? "platform"
          : "seller",
      displayName: seller?.displayName || null,
      paymentStatus,
      fiscalStatus: fiscalProfile?.status || seller?.fiscalStatus || "not_started",
      fiscalReady,
      paymentReady,
      sellerReady: sellerStatus === "active",
      locationLabel: seller?.locationLabel || null,
      pickupAddress: seller?.pickupAddress || null,
      locationReady: Boolean(seller?.locationLabel && seller?.pickupAddress),
      shippingPostalCode: seller?.shippingPostalCode || null,
      shippingCity: seller?.shippingCity || null,
      shippingCountryCode: seller?.shippingCountryCode || "ES",
      shippingPhone: seller?.shippingPhone || null,
      carrierReady: Boolean(
        seller?.pickupAddress &&
          seller?.shippingPostalCode &&
          seller?.shippingCity &&
          seller?.shippingCountryCode,
      ),
    },
    connector: {
      status: connectorStatus,
      enabled: connectorStatus === "active",
      newmersiveId,
      referralUrl,
      available: Boolean(connector?.available),
      radiusKm: normalizeRadius(connector?.radiusKm),
      locationLabel: connector?.locationLabel || null,
    },
  };
}

export async function activateAllwainSeller(userId: string, input: SellerActivationInput) {
  const user = await getUser(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  await ensureAllwainParticipationProfiles(user);

  const sellerType = String(input.sellerType || "other").trim().toLowerCase();
  if (!SELLER_TYPES.has(sellerType)) throw new Error("INVALID_SELLER_TYPE");
  const displayName = String(input.displayName || user.name || "").trim().slice(0, 120);
  if (!displayName) throw new Error("SELLER_DISPLAY_NAME_REQUIRED");
  const location = normalizedSellerLocation(input);
  const shipping = normalizedSellerShipping(input);

  if (usePostgres()) {
    await (getPrisma() as any).allwainSellerProfile.update({
      where: { userId },
      data: {
        sellerType,
        displayName,
        ...location,
        ...shipping,
        status: "onboarding",
        activatedAt: new Date(),
        restrictedAt: null,
      },
    });
  } else {
    memorySellerProfiles.set(userId, {
      ...memorySellerProfiles.get(userId),
      userId,
      sellerType,
      displayName,
      ...location,
      ...shipping,
      status: "onboarding",
    });
  }

  return getAllwainParticipationSnapshot(userId);
}

export async function updateAllwainSeller(
  userId: string,
  input: SellerActivationInput,
) {
  const current = await getAllwainParticipationSnapshot(userId);
  if (current.seller.status === "not_activated") throw new Error("SELLER_NOT_ACTIVE");
  const data: Record<string, unknown> = {};
  if (input.sellerType !== undefined) {
    const sellerType = String(input.sellerType).trim().toLowerCase();
    if (!SELLER_TYPES.has(sellerType)) throw new Error("INVALID_SELLER_TYPE");
    data.sellerType = sellerType;
  }
  if (input.displayName !== undefined) {
    const displayName = String(input.displayName).trim().slice(0, 120);
    if (!displayName) throw new Error("SELLER_DISPLAY_NAME_REQUIRED");
    data.displayName = displayName;
  }
  const updatesLocation = [
    input.locationLabel,
    input.pickupAddress,
    input.latitude,
    input.longitude,
  ].some((value) => value !== undefined);
  if (updatesLocation) {
    const locationLabel = String(
      input.locationLabel ?? current.seller.locationLabel ?? "",
    ).trim().slice(0, 120) || null;
    const pickupAddress = String(
      input.pickupAddress ?? current.seller.pickupAddress ?? "",
    ).trim().slice(0, 500) || null;
    if (!locationLabel || !pickupAddress) {
      throw new Error("SELLER_LOCATION_REQUIRED");
    }
    data.locationLabel = locationLabel;
    data.pickupAddress = pickupAddress;

    const updatesCoordinates =
      input.latitude !== undefined || input.longitude !== undefined;
    if (updatesCoordinates) {
      if (input.latitude === undefined || input.longitude === undefined) {
        throw new Error("INVALID_SELLER_LOCATION");
      }
      const location = normalizedSellerLocation({
        locationLabel,
        pickupAddress,
        latitude: input.latitude,
        longitude: input.longitude,
      });
      data.locationLatApprox = location.locationLatApprox;
      data.locationLngApprox = location.locationLngApprox;
    }
  }
  const updatesShipping = [
    input.shippingPostalCode,
    input.shippingCity,
    input.shippingCountryCode,
    input.shippingPhone,
  ].some((value) => value !== undefined);
  if (updatesShipping) {
    const shipping = normalizedSellerShipping({
      shippingPostalCode:
        input.shippingPostalCode ?? current.seller.shippingPostalCode ?? null,
      shippingCity: input.shippingCity ?? current.seller.shippingCity ?? null,
      shippingCountryCode:
        input.shippingCountryCode ?? current.seller.shippingCountryCode ?? "ES",
      shippingPhone: input.shippingPhone ?? current.seller.shippingPhone ?? null,
    });
    Object.assign(data, shipping);
  }
  if (!Object.keys(data).length) throw new Error("SELLER_UPDATE_REQUIRED");

  if (usePostgres()) {
    await (getPrisma() as any).allwainSellerProfile.update({
      where: { userId },
      data,
    });
  } else {
    memorySellerProfiles.set(userId, {
      ...memorySellerProfiles.get(userId),
      ...data,
    });
  }
  return getAllwainParticipationSnapshot(userId);
}

export async function activateAllwainConnector(
  userId: string,
  input: ConnectorActivationInput,
) {
  const user = await getUser(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  await ensureAllwainParticipationProfiles(user);
  await ensureSponsorCode(user);

  const radiusKm = normalizeRadius(input.radiusKm);
  const location = normalizedLocation(input);
  const data = {
    status: "active",
    available: Boolean(input.available),
    radiusKm,
    ...location,
    activatedAt: new Date(),
    restrictedAt: null,
  };

  if (usePostgres()) {
    await (getPrisma() as any).allwainConnectorProfile.update({
      where: { userId },
      data,
    });
  } else {
    memoryConnectorProfiles.set(userId, {
      ...memoryConnectorProfiles.get(userId),
      userId,
      ...data,
    });
  }

  return getAllwainParticipationSnapshot(userId);
}

export async function updateAllwainConnector(
  userId: string,
  input: ConnectorActivationInput,
) {
  const current = await getAllwainParticipationSnapshot(userId);
  if (!current.connector.enabled) throw new Error("CONNECTOR_NOT_ACTIVE");

  const location = normalizedLocation(input);
  const data: Record<string, unknown> = {};
  if (input.available !== undefined) data.available = Boolean(input.available);
  if (input.radiusKm !== undefined) data.radiusKm = normalizeRadius(input.radiusKm);
  if (input.locationLabel !== undefined) data.locationLabel = location.locationLabel;
  if (input.latitude !== undefined) data.locationLatApprox = location.locationLatApprox;
  if (input.longitude !== undefined) data.locationLngApprox = location.locationLngApprox;

  if (usePostgres()) {
    await (getPrisma() as any).allwainConnectorProfile.update({ where: { userId }, data });
  } else {
    memoryConnectorProfiles.set(userId, {
      ...memoryConnectorProfiles.get(userId),
      ...data,
    });
  }
  return getAllwainParticipationSnapshot(userId);
}

function privateDisplayName(name: unknown) {
  const parts = String(name || "Usuario").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Usuario";
  return parts[0] + " " + parts[1].slice(0, 1).toUpperCase() + ".";
}

export async function getAllwainConnectorNetwork(
  userId: string,
  options: { limit?: number; cursor?: string | null } = {},
) {
  const participation = await getAllwainParticipationSnapshot(userId);
  if (!participation.connector.enabled) throw new Error("CONNECTOR_NOT_ACTIVE");
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(options.limit) || 30)));
  const cursor = String(options.cursor || "").trim() || null;

  if (!usePostgres()) {
    const rows = getReferralStatsByUser(userId);
    const cursorIndex = cursor ? rows.findIndex((row) => row.id === cursor) : -1;
    if (cursor && cursorIndex < 0) throw new Error("INVALID_NETWORK_CURSOR");
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const page = rows.slice(start, start + limit + 1);
    const hasNextPage = page.length > limit;
    const itemsPage = page.slice(0, limit);
    return {
      newmersiveId: participation.connector.newmersiveId,
      referralUrl: participation.connector.referralUrl,
      totals: { users: rows.length, sellers: 0, active: rows.length },
      items: itemsPage.map((row) => ({
        id: row.id,
        userId: row.invitedUserId,
        displayName: privateDisplayName(getUserById(row.invitedUserId)?.name),
        kind: "buyer",
        status: "registered",
      })),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage ? itemsPage[itemsPage.length - 1]?.id || null : null,
      },
    };
  }

  const prisma = getPrisma() as any;
  if (cursor) {
    const ownsCursor = await prisma.referralStat.findFirst({
      where: { id: cursor, userId },
      select: { id: true },
    });
    if (!ownsCursor) throw new Error("INVALID_NETWORK_CURSOR");
  }
  const rows = await prisma.referralStat.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const invitedIds = pageRows.map((row: any) => row.invitedUserId);
  const [users, sellerProfiles, totalUsers, totalActive, sellerCountRows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: invitedIds } },
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.allwainSellerProfile.findMany({
      where: { userId: { in: invitedIds } },
      select: { userId: true, status: true },
    }),
    prisma.referralStat.count({ where: { userId } }),
    prisma.referralStat.count({ where: { userId, status: "registered" } }),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count
       FROM "ReferralStat" referral
       INNER JOIN "AllwainSellerProfile" seller
         ON seller."userId" = referral."invitedUserId"
       WHERE referral."userId" = $1
         AND seller.status <> 'not_activated'`,
      userId,
    ),
  ]);
  const usersById = new Map(users.map((item: any) => [item.id, item]));
  const sellersById = new Map(sellerProfiles.map((item: any) => [item.userId, item]));
  const items = pageRows.map((row: any) => {
    const invited: any = usersById.get(row.invitedUserId);
    const seller: any = sellersById.get(row.invitedUserId);
    const sellerActive = seller?.status && seller.status !== "not_activated";
    return {
      id: row.id,
      userId: row.invitedUserId,
      displayName: privateDisplayName(invited?.name),
      kind: sellerActive ? "seller" : "buyer",
      status: row.status,
      joinedAt: invited?.createdAt || row.createdAt,
      sellerStatus: seller?.status || "not_activated",
    };
  });

  return {
    newmersiveId: participation.connector.newmersiveId,
    referralUrl: participation.connector.referralUrl,
    totals: {
      users: totalUsers,
      sellers: Number(sellerCountRows?.[0]?.count || 0),
      active: totalActive,
    },
    items,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? items[items.length - 1]?.id || null : null,
    },
  };
}

type ApproximatePoint = { latitude: number; longitude: number };

function approximatePoint(latitude: unknown, longitude: unknown): ApproximatePoint | null {
  if (
    latitude === null ||
    latitude === undefined ||
    latitude === "" ||
    longitude === null ||
    longitude === undefined ||
    longitude === ""
  ) {
    return null;
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function calculateApproximateDistanceKm(from: ApproximatePoint, to: ApproximatePoint) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6_371;
  const latDelta = radians(to.latitude - from.latitude);
  const lngDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(lngDelta / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function normalizedZoneTokens(value: unknown) {
  return new Set(
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !["zona", "actual", "entrega", "recogida"].includes(token)),
  );
}

function zonesOverlap(connectorLabel: unknown, ...zones: unknown[]) {
  const connectorTokens = normalizedZoneTokens(connectorLabel);
  if (!connectorTokens.size) return false;
  return zones.some((zone) => {
    const zoneTokens = normalizedZoneTokens(zone);
    return Array.from(connectorTokens).some((token) => zoneTokens.has(token));
  });
}

export function allwainConnectorAssignmentMatch(assignment: any, connector: any) {
  const connectorPoint = approximatePoint(
    connector?.locationLatApprox,
    connector?.locationLngApprox,
  );
  const pickupPoint = approximatePoint(
    assignment?.pickupLatApprox,
    assignment?.pickupLngApprox,
  );
  const deliveryPoint = approximatePoint(
    assignment?.deliveryLatApprox,
    assignment?.deliveryLngApprox,
  );
  const radiusKm = normalizeRadius(connector?.radiusKm);

  if (connectorPoint && (pickupPoint || deliveryPoint)) {
    const pickupDistanceKm = pickupPoint
      ? calculateApproximateDistanceKm(connectorPoint, pickupPoint)
      : null;
    const deliveryDistanceKm = deliveryPoint
      ? calculateApproximateDistanceKm(connectorPoint, deliveryPoint)
      : null;
    const compatible = [pickupDistanceKm, deliveryDistanceKm]
      .filter((value): value is number => value !== null)
      .every((value) => value <= radiusKm);
    return { compatible, pickupDistanceKm, deliveryDistanceKm };
  }

  return {
    compatible: zonesOverlap(
      connector?.locationLabel,
      assignment?.pickupZone,
      assignment?.deliveryZone,
    ),
    pickupDistanceKm: null,
    deliveryDistanceKm: null,
  };
}

export async function getAllwainConnectorLogistics(userId: string) {
  const participation = await getAllwainParticipationSnapshot(userId);
  if (!participation.connector.enabled) throw new Error("CONNECTOR_NOT_ACTIVE");
  if (!usePostgres()) {
    return {
      items: [],
      demoItems: allwainConnectorDemoLogistics(),
      radiusKm: participation.connector.radiusKm,
    };
  }

  await ensureAllwainLogisticsAssignments();

  const prisma = getPrisma() as any;
  const [connector, rows] = await Promise.all([
    prisma.allwainConnectorProfile.findUnique({ where: { userId } }),
    prisma.allwainDeliveryAssignment.findMany({
    where: {
      OR: [
        { connectorUserId: userId },
        ...(participation.connector.available
          ? [
              {
                connectorUserId: null,
                status: "open",
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  }),
  ]);
  const localOrders = await prisma.allwainOrder.findMany({
    where: {
      id: { in: rows.map((row: any) => row.orderId) },
      operationalArchivedAt: null,
      deliveryChannel: "local_connector",
    },
    select: { id: true, buyerUserId: true, sellerUserId: true },
  });
  const localOrderIds = new Set(
    localOrders.map((order: any) => order.id),
  );
  const ordersById = new Map<string, any>(
    localOrders.map((order: any) => [order.id, order]),
  );
  const visibleRows = rows.filter((row: any) => {
    if (!localOrderIds.has(row.orderId)) return false;
    if (row.connectorUserId === userId) return true;
    return allwainConnectorAssignmentMatch(row, connector).compatible;
  });
  const acceptedParticipantIds = Array.from(
    new Set<string>(
      visibleRows.flatMap((row: any) => {
        if (row.connectorUserId !== userId) return [];
        const order = ordersById.get(row.orderId);
        return order ? [order.buyerUserId, order.sellerUserId] : [];
      }),
    ),
  );
  const participantUsers = acceptedParticipantIds.length
    ? await prisma.user.findMany({
        where: { id: { in: acceptedParticipantIds } },
        select: { id: true, name: true },
      })
    : [];
  const participantUsersById = new Map<string, any>(
    participantUsers.map((account: any) => [account.id, account]),
  );
  return {
    radiusKm: participation.connector.radiusKm,
    demoItems: allwainConnectorDemoLogistics(),
    items: visibleRows.map((row: any) => {
      const mine = row.connectorUserId === userId;
      const match = allwainConnectorAssignmentMatch(row, connector);
      const order = mine ? ordersById.get(row.orderId) : null;
      return {
        id: row.id,
        orderId: row.orderId,
        status: row.status,
        feeAmount: row.feeAmount,
        networkBonusAmount: row.networkBonusAmount || 0,
        currency: row.currency,
        pickupZone: row.pickupZone || "Zona de recogida protegida",
        deliveryZone: row.deliveryZone || "Zona de entrega protegida",
        distanceKm: row.routeDistanceKm ?? row.maxDistanceKm,
        distanceToPickupKm: match.pickupDistanceKm,
        pickupAddress: mine ? row.pickupAddress?.formatted || null : null,
        deliveryAddress: mine ? row.deliveryAddress?.formatted || null : null,
        seller: order
          ? {
              id: order.sellerUserId,
              name:
                participantUsersById.get(order.sellerUserId)?.name ||
                "Vendedor Allwain",
            }
          : null,
        buyer: order
          ? {
              id: order.buyerUserId,
              name:
                participantUsersById.get(order.buyerUserId)?.name ||
                "Comprador Allwain",
            }
          : null,
        mine,
        createdAt: row.createdAt,
      };
    }),
  };
}

function protectedDeliveryZone(address: any) {
  const formatted = String(address?.formatted || "").trim();
  if (!formatted) return "Zona de entrega protegida";
  const parts = formatted.split(",").map((part) => part.trim()).filter(Boolean);
  return (parts.slice(-2).join(", ") || "Zona de entrega protegida").slice(0, 120);
}

export async function ensureAllwainLogisticsAssignments() {
  if (!usePostgres()) return 0;
  const prisma = getPrisma() as any;
  const orders = await prisma.allwainOrder.findMany({
    where: {
      operationalArchivedAt: null,
      deliveryMethod: "shipping",
      deliveryChannel: "local_connector",
      paymentStatus: { in: ["paid", "partially_refunded", "refund_pending"] },
      fulfillmentStatus: { in: ["pending", "preparing", "ready"] },
      connectorUserId: null,
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  if (!orders.length) return 0;
  const sellerIds = Array.from(new Set(orders.map((order: any) => order.sellerUserId)));
  const sellers = await prisma.allwainSellerProfile.findMany({
      where: { userId: { in: sellerIds } },
      select: {
        userId: true,
        locationLabel: true,
        pickupAddress: true,
        locationLatApprox: true,
        locationLngApprox: true,
      },
  });
  const sellersById = new Map(sellers.map((seller: any) => [seller.userId, seller]));
  const operations = orders.map((order: any) => {
      const seller: any = sellersById.get(order.sellerUserId);
      const pickupPoint = approximatePoint(
        seller?.locationLatApprox,
        seller?.locationLngApprox,
      );
      const deliveryPoint = approximatePoint(
        order.deliveryAddress?.locationLatApprox,
        order.deliveryAddress?.locationLngApprox,
      );
      const routeDistanceKm =
        pickupPoint && deliveryPoint
          ? calculateApproximateDistanceKm(pickupPoint, deliveryPoint)
          : null;
      const locationData = {
        pickupZone: seller?.locationLabel || "Zona de recogida protegida",
        deliveryZone: protectedDeliveryZone(order.deliveryAddress),
        pickupAddress: seller?.pickupAddress
          ? { formatted: seller.pickupAddress, source: "seller_profile" }
          : undefined,
        deliveryAddress: order.deliveryAddress || undefined,
        pickupLatApprox: pickupPoint?.latitude ?? null,
        pickupLngApprox: pickupPoint?.longitude ?? null,
        deliveryLatApprox: deliveryPoint?.latitude ?? null,
        deliveryLngApprox: deliveryPoint?.longitude ?? null,
        routeDistanceKm,
        maxDistanceKm: routeDistanceKm,
      };
      return prisma.allwainDeliveryAssignment.upsert({
        where: { orderId: order.id },
        create: {
        orderId: order.id,
        status: "open",
        feeAmount: order.connectorDeliveryAmount || 0,
        networkBonusAmount: order.connectorPlatformShareAmount || 0,
        currency: order.currency,
          ...locationData,
        },
        update: {
          ...locationData,
          feeAmount: order.connectorDeliveryAmount || 0,
          networkBonusAmount: order.connectorPlatformShareAmount || 0,
        },
      });
  });
  await prisma.$transaction(operations);
  return operations.length;
}

export async function acceptAllwainConnectorLogistics(userId: string, assignmentId: string) {
  const participation = await getAllwainParticipationSnapshot(userId);
  if (!participation.connector.enabled) throw new Error("CONNECTOR_NOT_ACTIVE");
  if (!usePostgres()) throw new Error("LOGISTICS_REQUIRE_POSTGRES");

  const prisma = getPrisma() as any;
  const payoutAccount = await prisma.allwainSellerPaymentAccount.findUnique({
    where: { userId },
  });
  if (
    payoutAccount?.status !== "enabled" ||
    !payoutAccount.transfersEnabled ||
    !payoutAccount.payoutsEnabled
  ) {
    throw new Error("CONNECTOR_PAYOUTS_NOT_READY");
  }

  return prisma.$transaction(async (tx: any) => {
    const assignment = await tx.allwainDeliveryAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new Error("LOGISTICS_ASSIGNMENT_NOT_FOUND");
    if (assignment.status !== "open" || assignment.connectorUserId) {
      throw new Error("LOGISTICS_ASSIGNMENT_UNAVAILABLE");
    }
    const connector = await tx.allwainConnectorProfile.findUnique({ where: { userId } });
    if (!connector?.available) throw new Error("LOGISTICS_ASSIGNMENT_UNAVAILABLE");
    if (!allwainConnectorAssignmentMatch(assignment, connector).compatible) {
      throw new Error("LOGISTICS_OUTSIDE_RADIUS");
    }

    const order = await tx.allwainOrder.findUnique({ where: { id: assignment.orderId } });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.deliveryChannel !== "local_connector") {
      throw new Error("LOGISTICS_NOT_LOCAL_CONNECTOR");
    }
    const connectorDeliveryAmount = Number(
      order.connectorDeliveryAmount || assignment.feeAmount || 0,
    );
    const connectorPlatformShareAmount = Number(
      order.connectorPlatformShareAmount || assignment.networkBonusAmount || 0,
    );
    const connectorFeeAmount =
      connectorDeliveryAmount + connectorPlatformShareAmount;
    if (connectorFeeAmount !== Number(order.connectorFeeAmount || 0)) {
      throw new Error("LOGISTICS_SETTLEMENT_MISMATCH");
    }
    const claimed = await tx.allwainDeliveryAssignment.updateMany({
      where: { id: assignmentId, status: "open", connectorUserId: null },
      data: {
        connectorUserId: userId,
        status: "accepted",
        feeAmount: connectorDeliveryAmount,
        networkBonusAmount: connectorPlatformShareAmount,
        acceptedAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new Error("LOGISTICS_ASSIGNMENT_UNAVAILABLE");
    const accepted = await tx.allwainDeliveryAssignment.findUnique({
      where: { id: assignmentId },
    });
    const currentSettlement = await tx.allwainSettlementPlan.findFirst({
      where: { orderId: order.id },
      orderBy: { version: "desc" },
    });
    if (!currentSettlement) throw new Error("SETTLEMENT_PLAN_NOT_FOUND");
    if (
      currentSettlement.status === "checkout_locked" &&
      order.paymentStatus !== "paid"
    ) {
      throw new Error("LOGISTICS_AVAILABLE_AFTER_PAYMENT");
    }
    await tx.allwainOrder.update({
      where: { id: assignment.orderId },
      data: {
        connectorUserId: userId,
        connectorTransferStatus: order.paymentStatus === "paid" ? "pending" : "not_started",
        paymentArchitecture: "separate_charges_and_transfers",
      },
    });
    await tx.allwainPayment.updateMany({
      where: {
        orderId: assignment.orderId,
        paidAt: null,
      },
      data: {
        connectorTransferStatus: order.paymentStatus === "paid" ? "pending" : "not_started",
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateId: order.id,
      eventType: "logistics.connector_assigned",
      actorUserId: userId,
      actorRole: "connector",
      source: "connector_logistics_acceptance",
      payload: {
        assignmentId,
        settlementPlanId: currentSettlement.id,
        settlementVersion: currentSettlement.version,
        settlementHash: currentSettlement.snapshotHash,
        connectorFeeAmount,
        connectorPlatformShareAmount,
        connectorDeliveryAmount,
        platformNetFeeAmount: order.platformNetFeeAmount,
      },
    });
    return accepted;
  });
}

export async function updateAllwainConnectorLogistics(
  _userId: string,
  _assignmentId: string,
  _action: "pickup" | "deliver",
) {
  throw new Error("LOGISTICS_QR_REQUIRED");
}

export async function isAllwainSellerEnabled(userId: string, legacyRole?: string | null) {
  if (legacyRole === "admin") return true;
  if (!usePostgres()) {
    const seller = memorySellerProfiles.get(userId);
    if (seller) return isAllwainSellerWorkspaceStatusEnabled(seller.status);
    return legacyRole === "company";
  }
  const prisma = getPrisma() as any;
  const [seller, payment] = await Promise.all([
    prisma.allwainSellerProfile.findUnique({ where: { userId }, select: { status: true } }),
    prisma.allwainSellerPaymentAccount.findUnique({
      where: { userId },
      select: { status: true },
    }),
  ]);
  if (!seller) return legacyRole === "company";
  return isAllwainSellerWorkspaceStatusEnabled(seller.status, payment?.status);
}

export async function getAllwainSellerCommercialModel(userId: string) {
  if (!usePostgres()) {
    return normalizeAllwainCommercialModel(
      memorySellerProfiles.get(userId)?.commercialModel,
    );
  }
  const seller = await (getPrisma() as any).allwainSellerProfile.findUnique({
    where: { userId },
    select: { commercialModel: true },
  });
  return normalizeAllwainCommercialModel(seller?.commercialModel);
}

export async function isAllwainPaymentRecipientEnabled(
  userId: string,
  legacyRole?: string | null,
) {
  if (!usePostgres()) {
    if (legacyRole === "admin") return true;
    const seller = memorySellerProfiles.get(userId);
    if (normalizeProfileStatus(seller?.status) === "active") return true;
    return normalizeProfileStatus(memoryConnectorProfiles.get(userId)?.status) === "active";
  }
  const prisma = getPrisma() as any;
  const [seller, fiscal, payment, connector] = await Promise.all([
    prisma.allwainSellerProfile.findUnique({
      where: { userId },
      select: { status: true },
    }),
    prisma.allwainFiscalProfile.findUnique({
      where: { userId_kind: { userId, kind: "business" } },
    }),
    prisma.allwainSellerPaymentAccount.findUnique({ where: { userId } }),
    prisma.allwainConnectorProfile.findUnique({
      where: { userId },
      select: { status: true },
    }),
  ]);
  if (
    isAllwainSellerPaymentStateReady({
      profileStatus: seller?.status,
      paymentStatus: payment?.status,
      fiscalReady:
        isAllwainFiscalProfileReady(fiscal) &&
        hasActiveAllwainDocumentMandate(fiscal),
      chargesEnabled: Boolean(payment?.chargesEnabled),
      transfersEnabled: Boolean(payment?.transfersEnabled),
      payoutsEnabled: Boolean(payment?.payoutsEnabled),
    })
  ) {
    return true;
  }
  return normalizeProfileStatus(connector?.status) === "active";
}

export async function isAllwainPaymentOnboardingAllowed(
  userId: string,
  legacyRole?: string | null,
) {
  if (legacyRole === "admin") return true;
  if (!usePostgres()) {
    const seller = memorySellerProfiles.get(userId);
    if (seller && isAllwainSellerProfileActivatedStatus(seller.status)) return true;
    return normalizeProfileStatus(memoryConnectorProfiles.get(userId)?.status) === "active";
  }
  const prisma = getPrisma() as any;
  const [seller, connector] = await Promise.all([
    prisma.allwainSellerProfile.findUnique({
      where: { userId },
      select: { status: true },
    }),
    prisma.allwainConnectorProfile.findUnique({
      where: { userId },
      select: { status: true },
    }),
  ]);
  return (
    isAllwainSellerProfileActivatedStatus(seller?.status) ||
    normalizeProfileStatus(connector?.status) === "active" ||
    legacyRole === "company"
  );
}
