import { randomUUID } from "crypto";
import {
  Offer,
  Product,
  OrderGroup,
  AllwainSavingTransaction,
  ReferralStat,
  UserRole,
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

const ALLOWED_ROLES: UserRole[] = ["user", "buyer", "company", "admin"];
const normalizeRole = (role: any): UserRole =>
  ALLOWED_ROLES.includes(role) ? role : "user";

/* =========================
   SCAN DEMO (POSTGRES)
========================= */

export async function scanDemoProduct(ean?: string) {
  const product = ean ? await getProductByEANPg(ean) : await getRandomProductPg();

  if (!product) {
    return { product: null, offers: [] };
  }

  const offers = (await getAllwainOffersPg()).filter((o) => o.productId === product.id);

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

export async function joinOrderGroup(groupId: string, userId: string, units: number) {
  const groups = await getOrderGroupsPg();
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new Error("GROUP_NOT_FOUND");

  const participants = group.participants as any[];

  const participant = participants.find((p) => p.userId === userId);
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

  user.allwainBalance = ((user as any).allwainBalance || 0) + amount;
  (user as any).role = normalizeRole((user as any).role);
  await upsertUserPg(user as any);

  let referral: ReferralStat | undefined;

  if ((user as any).referredByCode) {
    const stats = await getReferralStatsByUserPg((user as any).referredByCode);
    const sponsorId = (stats as any)?.[0]?.userId;

    if (sponsorId) {
      const sponsor = await getUserByIdPg(sponsorId);
      if (sponsor) {
        const commission = amount * 0.1;

        (sponsor as any).allwainBalance = ((sponsor as any).allwainBalance || 0) + commission;
        (sponsor as any).role = normalizeRole((sponsor as any).role);
        await upsertUserPg(sponsor as any);

        referral = {
          id: randomUUID(),
          userId: (sponsor as any).id,
          invitedUserId: (user as any).id,
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
  const totalSaved = (stats as any[]).reduce((s, r) => s + (r.totalSavedByInvited || 0), 0);
  const totalCommission = (stats as any[]).reduce((s, r) => s + (r.commissionEarned || 0), 0);

  return {
    totalInvited,
    totalSaved,
    totalCommission,
    referrals: stats,
  };
}
