import { getPrisma } from "../db/prisma";
import {
  User,
  Offer,
  Trade,
  Product,
  Lead,
  LeadGlobal,
  Contract,
  OrderGroup,
  ReferralStat,
  AllwainSavingTransaction,
  TradeStatus,
} from "../shared/types";

/* =========================
   USERS
========================= */

export async function getUsersPg() {
  return getPrisma().user.findMany();
}

export async function getUserByIdPg(id: string) {
  return getPrisma().user.findUnique({ where: { id } });
}

export async function getUserByEmailPg(email: string) {
  return getPrisma().user.findUnique({ where: { email } });
}

export async function getUserBySponsorCodePg(code: string) {
  return getPrisma().user.findUnique({ where: { sponsorCode: code } });
}

export async function upsertUserPg(user: User) {
  return getPrisma().user.upsert({
    where: { id: user.id },
    create: user as any,
    update: user as any,
  });
}

/* =========================
   OFFERS
========================= */

export async function getOffersByOwnerPg(owner: "trueqia" | "allwain") {
  return getPrisma().offer.findMany({ where: { owner } });
}

export async function getOfferByIdPg(id: string) {
  return getPrisma().offer.findUnique({ where: { id } });
}

export async function addOfferPg(offer: Offer) {
  return getPrisma().offer.create({ data: offer as any });
}

/* =========================
   TRADES
========================= */

export async function getTradesPg() {
  return getPrisma().trade.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getTradeByIdPg(id: string) {
  return getPrisma().trade.findUnique({ where: { id } });
}

export async function getTradesByOfferIdPg(offerId: string) {
  return getPrisma().trade.findMany({ where: { offerId }, orderBy: { createdAt: "desc" } });
}

export async function addTradePg(trade: Trade) {
  return getPrisma().trade.create({ data: trade as any });
}

export async function updateTradeStatusPg(tradeId: string, status: TradeStatus) {
  return getPrisma().trade.update({
    where: { id: tradeId },
    data: {
      status,
      resolvedAt: status === "pending" ? null : new Date(),
    },
  });
}

export async function rejectOtherPendingTradesForOfferPg(offerId: string, exceptTradeId: string) {
  return getPrisma().trade.updateMany({
    where: {
      offerId,
      id: { not: exceptTradeId },
      status: "pending",
    },
    data: {
      status: "rejected",
      resolvedAt: new Date(),
    },
  });
}

/* =========================
   PRODUCTS
========================= */

export async function getProductsPg() {
  return getPrisma().product.findMany();
}

export async function getProductByIdPg(id: string) {
  return getPrisma().product.findUnique({ where: { id } });
}

export async function getProductByEANPg(ean: string) {
  return getPrisma().product.findUnique({ where: { ean } });
}

/* =========================
   ORDER GROUPS
========================= */

export async function getOrderGroupsPg() {
  return getPrisma().orderGroup.findMany();
}

export async function addOrderGroupPg(group: OrderGroup) {
  return getPrisma().orderGroup.create({ data: group as any });
}

export async function updateOrderGroupPg(group: OrderGroup) {
  return getPrisma().orderGroup.update({
    where: { id: group.id },
    data: group as any,
  });
}

/* =========================
   SAVINGS + REFERRALS
========================= */

export async function addSavingPg(tx: AllwainSavingTransaction) {
  return getPrisma().allwainSavingTransaction.create({ data: tx as any });
}

export async function addReferralStatPg(stat: ReferralStat) {
  return getPrisma().referralStat.create({ data: stat as any });
}

export async function getReferralStatsByUserPg(userId: string) {
  return getPrisma().referralStat.findMany({ where: { userId } });
}

/* =========================
   LEADS
========================= */

export async function addLeadPg(lead: Lead) {
  return getPrisma().lead.create({ data: lead as any });
}

export async function addLeadGlobalPg(lead: LeadGlobal): Promise<LeadGlobal> {
  const created = await getPrisma().leadGlobal.create({ data: lead as any });
  return created as any;
}

export async function getLeadsGlobalPg(): Promise<LeadGlobal[]> {
  const items = await getPrisma().leadGlobal.findMany({ orderBy: { createdAt: "desc" } });
  return items as any;
}

/* =========================
   CONTRACTS
========================= */

export async function createContractPg(contract: Contract) {
  return getPrisma().contract.create({ data: contract as any });
}

/* =========================
   PASSWORD RESET TOKENS
========================= */

export async function savePasswordResetTokenPg(token: string, userId: string, expiresAt: number) {
  return getPrisma().passwordResetToken.upsert({
    where: { token },
    create: { token, userId, expiresAt: BigInt(expiresAt) },
    update: { userId, expiresAt: BigInt(expiresAt) },
  });
}

export async function getPasswordResetTokenPg(token: string): Promise<{ token: string; userId: string; expiresAt: number } | null> {
  const rec = await getPrisma().passwordResetToken.findUnique({ where: { token } });
  if (!rec) return null;
  return {
    token: (rec as any).token,
    userId: (rec as any).userId,
    expiresAt: Number((rec as any).expiresAt),
  };
}

export async function deletePasswordResetTokenPg(token: string) {
  try {
    return await getPrisma().passwordResetToken.delete({ where: { token } });
  } catch {
    return null;
  }
}

