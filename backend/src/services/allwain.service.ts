import { randomUUID } from "crypto";
import {
  Offer,
  Product,
  OrderGroup,
  AllwainSavingTransaction,
  ReferralStat,
} from "../shared/types";
import { ENV } from "../config/env";
import { getUserByIdPg, upsertUserPg } from "./data.store.pg";
import {
  getRandomProductPg,
  getProductByEANPg,
  getAllwainOffersPg,
  addAllwainOfferPg,
  getOrderGroupsPg,
  createOrderGroupPg,
  updateOrderGroupPg,
  addSavingPg,
  addReferralStatPg,
  getReferralStatsByUserPg,
} from "./data.store.allwain.pg";

/* =========================
   SCAN DEMO (POSTGRES)
========================= */

export async function scanDemoProduct(ean?: string) {
  const product = ean
    ? await getProductByEANPg(ean)
    : await getRandomProductPg();

  if (!product) {
    return { product: null, offers: [] };
  }

  const offers = (await getAllwainOffersPg()).filter(
    o => o.productId === product.id
  );

  return { product, offers };
}

/* =========================
   OFFERS
========================= */

export async function listAllwainOffers() {
  return getAllwainOffersPg();
}

export async function createAllwainOffer(
  userId: string,
  title: string,
  description: string,
  price: number,
  productId?: string,
  meta?: Record<string, unknown>
): Promise<Offer> {
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

  return addAllwainOfferPg(offer);
}

/* =========================
   ORDER GROUPS
========================= */

export async function listOrderGroups() {
  return getOrderGroupsPg();
}

export async function createOrderGroup(
  productId: string,
  minUnitsPerClient: number
): Promise<OrderGroup> {
  const group: OrderGroup = {
    id: randomUUID(),
    productId,
    totalUnits: 0,
    minUnitsPerClient,
    status: "open",
    participants: [],
  };

  return createOrderGroupPg(group);
}

export async function joinOrderGroup(
  groupId: string,
  userId: string,
  units: number
) {
  const groups = await getOrderGroupsPg();
  const group = groups.find(g => g.id === groupId);
  if (!group) throw new Error("GROUP_NOT_FOUND");

  const participants = group.participants as any[];

  const participant = participants.find(p => p.userId === userId);
  if (participant) participant.units += units;
  else participants.push({ userId, units });

  group.totalUnits += units;
  group.participants = participants;

  return updateOrderGroupPg(group);
}

/* =========================
   SAVINGS + REFERRALS
========================= */

export async function registerSaving(
  userId: string,
  amount: number
): Promise<{ saving: AllwainSavingTransaction; referral?: ReferralStat }> {
  const user = await getUserByIdPg(userId);
  if (!user) throw new Error("USER_NOT_FOUND");

  const saving: AllwainSavingTransaction = {
    id: randomUUID(),
    userId,
    amount,
    createdAt: new Date().toISOString(),
  };

  await addSavingPg(saving);

  user.allwainBalance = (user.allwainBalance || 0) + amount;
  await upsertUserPg(user);

  let referral: ReferralStat | undefined;

  if (user.referredByCode) {
    const stats = await getReferralStatsByUserPg(user.referredByCode);
    const sponsorId = stats?.[0]?.userId;
    if (sponsorId) {
      const sponsor = await getUserByIdPg(sponsorId);
      if (sponsor) {
        const commission = amount * 0.1;
        sponsor.allwainBalance =
          (sponsor.allwainBalance || 0) + commission;
        await upsertUserPg(sponsor);

        referral = {
          id: randomUUID(),
          userId: sponsor.id,
          invitedUserId: user.id,
          totalSavedByInvited: amount,
          commissionEarned: commission,
          monthlyHistory: [],
        };

        await addReferralStatPg(referral);
      }
    }
  }

  return { saving, referral };
}

export async function getSponsorSummary(userId: string) {
  const stats = await getReferralStatsByUserPg(userId);

  const totalInvited = stats.length;
  const totalSaved = stats.reduce((s, r) => s + r.totalSavedByInvited, 0);
  const totalCommission = stats.reduce((s, r) => s + r.commissionEarned, 0);

  return {
    totalInvited,
    totalSaved,
    totalCommission,
    referrals: stats,
  };
}
