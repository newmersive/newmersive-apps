import {
  addAllwainSavingTransaction,
  findUserBySponsorCode,
  getReferralStat,
  getReferralStats,
  getReferralStatsBySponsor,
  getUserById,
  upsertReferralStat,
  upsertUser,
  addLead,
  addOffer,
  addOrderGroup,
  getOfferById,
  getOffersByOwner,
  getOrderGroupById,
  getOrderGroups,
  getProductByEan,
  getProductById,
  updateOrderGroup,
} from "./data.store";

import {
  AllwainSavingTransaction,
  ReferralMonthlyHistory,
  ReferralStat,
  Lead,
  Offer,
  OrderGroup,
  OrderGroupParticipant,
  Product,
  User,
} from "../shared/types";

interface LocationInput {
  lat: number;
  lng: number;
}

interface CreateAllwainOfferInput {
  title: string;
  description: string;
  price?: number;
  tokens?: number;
  productId?: string;
  meta?: Record<string, unknown>;
  ownerUserId: string;
}

interface CreateOrderGroupInput {
  productId: string;
  totalUnits: number;
  minUnitsPerClient: number;
}

/**
 * =========================
 *  BLOQUE: PRODUCTOS / OFERTAS / GRUPOS DE PEDIDO
 * =========================
 */

export function getAllwainProductById(id: string): Product | undefined {
  return getProductById(id);
}

export function getAllwainProductByEan(ean: string): Product | undefined {
  return getProductByEan(ean);
}

export function listAllwainOffers(location?: LocationInput): Offer[] {
  const offers = getOffersByOwner("allwain");

  if (!location) return offers;

  // Mock de distancia determinista para demo
  const withDistance = offers.map((offer, index) => {
    const distanceKm = ((offer.id.length + index * 7) % 80) + 5;
    return {
      ...offer,
      meta: { ...(offer.meta || {}), distanceKm },
    } as Offer;
  });

  // Solo devolvemos hasta 60 km para simular cercanía
  return withDistance.filter(
    (offer) => (offer.meta?.["distanceKm"] as number) <= 60
  );
}

export function createAllwainOffer(input: CreateAllwainOfferInput): Offer {
  const id = `offer-allwain-${Date.now()}`;
  const offer: Offer = {
    id,
    title: input.title,
    description: input.description,
    owner: "allwain",
    ownerUserId: input.ownerUserId,
    price: input.price,
    tokens: input.tokens,
    productId: input.productId,
    meta: input.meta,
  };

  return addOffer(offer);
}

export function createOfferInterest(
  offerId: string,
  userId: string,
  message?: string
): Lead {
  const offer = getOfferById(offerId);
  if (!offer) {
    throw new Error("OFFER_NOT_FOUND");
  }

  const user = getUserById(userId);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const lead: Lead = {
    id: `lead-${Date.now()}`,
    name: user.name,
    email: user.email,
    source: "allwain-offer-interest",
    message,
    offerId: offer.id,
    userId: user.id,
    status: "new",
    createdAt: new Date().toISOString(),
  };

  return addLead(lead);
}

export function listOrderGroups(): OrderGroup[] {
  return getOrderGroups();
}

export function createOrderGroup(input: CreateOrderGroupInput): OrderGroup {
  const product = getProductById(input.productId);
  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  const orderGroup: OrderGroup = {
    id: `order-group-${Date.now()}`,
    productId: input.productId,
    totalUnits: input.totalUnits,
    minUnitsPerClient: input.minUnitsPerClient,
    status: "open",
    participants: [],
  };

  return addOrderGroup(orderGroup);
}

export function joinOrderGroup(
  id: string,
  participant: OrderGroupParticipant
): OrderGroup {
  const orderGroup = getOrderGroupById(id);
  if (!orderGroup) {
    throw new Error("ORDER_GROUP_NOT_FOUND");
  }

  if (orderGroup.status === "closed") {
    throw new Error("ORDER_GROUP_CLOSED");
  }

  if (participant.units < orderGroup.minUnitsPerClient) {
    throw new Error("MIN_UNITS_NOT_MET");
  }

  const currentUnits = orderGroup.participants.reduce(
    (sum, p) => sum + p.units,
    0
  );
  if (currentUnits + participant.units > orderGroup.totalUnits) {
    throw new Error("ORDER_GROUP_FULL");
  }

  const existing = orderGroup.participants.find(
    (p) => p.userId === participant.userId
  );
  if (existing) {
    existing.units += participant.units;
  } else {
    orderGroup.participants.push(participant);
  }

  const updatedUnits = orderGroup.participants.reduce(
    (sum, p) => sum + p.units,
    0
  );

  if (updatedUnits >= orderGroup.totalUnits) {
    orderGroup.status = "closing";
  }

  return updateOrderGroup(orderGroup);
}

/**
 * =========================
 *  BLOQUE: SPONSORS / AHORROS / COMISIONES
 * =========================
 */

const ALLWAIN_FEE_PERCENTAGE = 0.1; // 10% de fee de Allwain sobre el ahorro
const SPONSOR_SHARE_OF_FEE = 0.5;   // 50% de esa fee va al sponsor

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function registerAllwainSaving(
  userId: string,
  amount: number
): {
  transaction: AllwainSavingTransaction;
  sponsorCommission?: number;
  sponsorId?: string;
  referralStat?: ReferralStat;
} {
  if (amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const now = new Date();
  const transaction: AllwainSavingTransaction = {
    id: generateId("saving"),
    userId,
    amount,
    createdAt: now.toISOString(),
  };

  // Guardamos la transacción de ahorro
  addAllwainSavingTransaction(transaction);

  const user = getUserById(userId);
  if (!user || !user.referredByCode) {
    // No tiene sponsor -> solo registramos ahorro
    return { transaction };
  }

  const sponsor = findUserBySponsorCode(user.referredByCode);
  if (!sponsor) {
    return { transaction };
  }

  const allwainFee = amount * ALLWAIN_FEE_PERCENTAGE;
  const sponsorCommission = allwainFee * SPONSOR_SHARE_OF_FEE;

  const stat = updateReferralStat({
    sponsorId: sponsor.id,
    invitedUserId: user.id,
    saved: amount,
    commission: sponsorCommission,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });

  sponsor.allwainBalance = (sponsor.allwainBalance ?? 0) + sponsorCommission;
  upsertUser(sponsor);

  return {
    transaction,
    sponsorCommission,
    sponsorId: sponsor.id,
    referralStat: stat,
  };
}

export function getSponsorSummary(userId: string) {
  const stats = getReferralStatsBySponsor(userId);
  const invitedCount = stats.length;
  const totalSaved = stats.reduce(
    (acc, stat) => acc + stat.totalSavedByInvited,
    0
  );
  const totalCommission = stats.reduce(
    (acc, stat) => acc + stat.commissionEarned,
    0
  );

  const monthlyHistoryMap = new Map<string, ReferralMonthlyHistory>();
  stats.forEach((stat) => {
    stat.monthlyHistory.forEach((item) => {
      const key = `${item.year}-${item.month}`;
      const existing = monthlyHistoryMap.get(key);
      if (!existing) {
        monthlyHistoryMap.set(key, { ...item });
      } else {
        existing.saved += item.saved;
        existing.commission += item.commission;
      }
    });
  });

  const user = getUserById(userId);

  return {
    invitedCount,
    totalSaved,
    totalCommission,
    balance: user?.allwainBalance ?? 0,
    monthlyHistory: Array.from(monthlyHistoryMap.values()).sort((a, b) => {
      if (a.year === b.year) return a.month - b.month;
      return a.year - b.year;
    }),
    referrals: stats.map((stat) => ({
      ...stat,
      invitedName: getUserById(stat.invitedUserId)?.name,
    })),
  };
}

export function listAllSponsorStats() {
  return getReferralStats().map((stat) => {
    const sponsor = getUserById(stat.userId);
    const invited = getUserById(stat.invitedUserId);
    return {
      ...stat,
      sponsorName: sponsor?.name,
      invitedName: invited?.name,
    };
  });
}

function updateReferralStat(params: {
  sponsorId: string;
  invitedUserId: string;
  saved: number;
  commission: number;
  month: number;
  year: number;
}): ReferralStat {
  const existing =
    getReferralStat(params.sponsorId, params.invitedUserId) ||
    createEmptyReferralStat(params.sponsorId, params.invitedUserId);

  existing.totalSavedByInvited += params.saved;
  existing.commissionEarned += params.commission;

  const monthlyEntry = existing.monthlyHistory.find(
    (m) => m.month === params.month && m.year === params.year
  );

  if (monthlyEntry) {
    monthlyEntry.saved += params.saved;
    monthlyEntry.commission += params.commission;
  } else {
    existing.monthlyHistory.push({
      month: params.month,
      year: params.year,
      saved: params.saved,
      commission: params.commission,
    });
  }

  return upsertReferralStat(existing);
}

function createEmptyReferralStat(
  sponsorId: string,
  invitedUserId: string
): ReferralStat {
  return {
    id: generateId("referral"),
    userId: sponsorId,
    invitedUserId,
    totalSavedByInvited: 0,
    commissionEarned: 0,
    monthlyHistory: [],
  };
}
