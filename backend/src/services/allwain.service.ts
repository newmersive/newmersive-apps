import { randomUUID } from "crypto";
import {
  Offer,
  Product,
  OrderGroup,
  AllwainSavingTransaction,
  ReferralStat,
} from "../shared/types";
import {
  getOffersByOwner,
  addOffer,
  getProducts,
  getProductById,
  getProductByEAN,
  getOrderGroups,
  addOrderGroup,
  addSaving,
  addReferralStat,
  getReferralStatsByUser,
  getUserById,
  upsertUser,
} from "./data.store";

/* =========================
   SCAN DEMO
========================= */

export function scanDemoProduct(ean?: string) {
  let product: Product | undefined;

  if (ean) {
    product = getProductByEAN(ean);
  }

  if (!product) {
    const products = getProducts();
    product = products[Math.floor(Math.random() * products.length)];
  }

  if (!product)
    return {
      product: null,
      offers: [],
    };

  const offers = getOffersByOwner("allwain").filter(
    o => o.productId === product!.id
  );

  return {
    product,
    offers,
  };
}

/* =========================
   OFFERS (ALLWAIN)
========================= */

export function listAllwainOffers() {
  return getOffersByOwner("allwain");
}

export function createAllwainOffer(
  userId: string,
  title: string,
  description: string,
  price: number,
  productId?: string,
  meta?: Record<string, unknown>
): Offer {
  const offer: Offer = {
    id: randomUUID(),
    title,
    description,
    owner: "allwain",
    ownerUserId: userId,
    price,
    productId,
    meta,
  };

  return addOffer(offer);
}

/* =========================
   ORDER GROUPS
========================= */

export function listOrderGroups() {
  return getOrderGroups();
}

export function createOrderGroup(
  productId: string,
  minUnitsPerClient: number
): OrderGroup {
  const group: OrderGroup = {
    id: randomUUID(),
    productId,
    totalUnits: 0,
    minUnitsPerClient,
    status: "open",
    participants: [],
  };

  return addOrderGroup(group);
}

export function joinOrderGroup(
  groupId: string,
  userId: string,
  units: number
) {
  const groups = getOrderGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) throw new Error("GROUP_NOT_FOUND");

  const participant = group.participants.find(p => p.userId === userId);
  if (participant) {
    participant.units += units;
  } else {
    group.participants.push({ userId, units });
  }

  group.totalUnits += units;
  return group;
}

/* =========================
   SAVINGS + REFERRALS
========================= */

export function registerSaving(
  userId: string,
  amount: number
): {
  saving: AllwainSavingTransaction;
  referral?: ReferralStat;
} {
  const user = getUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");

  const saving: AllwainSavingTransaction = {
    id: randomUUID(),
    userId,
    amount,
    createdAt: new Date().toISOString(),
  };

  addSaving(saving);

  user.allwainBalance = (user.allwainBalance || 0) + amount;
  upsertUser(user);

  let referralStat: ReferralStat | undefined;

  if (user.referredByCode) {
    const sponsor = getUserById(
      getReferralStatsByUser(user.referredByCode)?.[0]?.userId || ""
    );

    if (sponsor) {
      const commission = amount * 0.1;

      sponsor.allwainBalance =
        (sponsor.allwainBalance || 0) + commission;
      upsertUser(sponsor);

      referralStat = {
        id: randomUUID(),
        userId: sponsor.id,
        invitedUserId: user.id,
        totalSavedByInvited: amount,
        commissionEarned: commission,
        monthlyHistory: [],
      };

      addReferralStat(referralStat);
    }
  }

  return { saving, referral: referralStat };
}

/* =========================
   SPONSORS SUMMARY
========================= */

export function getSponsorSummary(userId: string) {
  const stats = getReferralStatsByUser(userId);

  const totalInvited = stats.length;
  const totalSaved = stats.reduce(
    (sum, r) => sum + r.totalSavedByInvited,
    0
  );
  const totalCommission = stats.reduce(
    (sum, r) => sum + r.commissionEarned,
    0
  );

  return {
    totalInvited,
    totalSaved,
    totalCommission,
    referrals: stats,
  };
}
