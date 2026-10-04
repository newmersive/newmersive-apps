import { Prisma } from "@prisma/client";
import { assertTrueqiaSigningAllowed } from "./trueqia.workspace.service";
import { getPrisma } from "../db/prisma";
import {
  User,
  CourseEntitlement,
  CourseEntitlementRecord,
  Offer,
  Trade,
  Product,
  Lead,
  LeadGlobal,
  Contract,
  TrueqiaChatMessage,
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
   COURSE ENTITLEMENTS
========================= */

function mapCourseEntitlementPg(row: any): CourseEntitlementRecord {
  return {
    id: row.id,
    userId: row.userId,
    email: row.email,
    product: row.product,
    entitlement: row.entitlement,
    source: row.source,
    metadata: row.metadata ?? null,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
    revokedAt: row.revokedAt instanceof Date ? row.revokedAt.toISOString() : row.revokedAt,
    grantedAt: row.grantedAt instanceof Date ? row.grantedAt.toISOString() : row.grantedAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

export async function getCourseEntitlementsByUserIdPg(
  userId: string
): Promise<CourseEntitlementRecord[]> {
  const items = await (getPrisma() as any).courseEntitlement.findMany({
    where: { userId },
    orderBy: { grantedAt: "asc" },
  });

  return items.map(mapCourseEntitlementPg);
}

export async function getCourseEntitlementByUserAndTypePg(
  userId: string,
  entitlement: CourseEntitlement
): Promise<CourseEntitlementRecord | null> {
  const item = await (getPrisma() as any).courseEntitlement.findUnique({
    where: {
      userId_entitlement: {
        userId,
        entitlement,
      },
    },
  });

  return item ? mapCourseEntitlementPg(item) : null;
}

export async function upsertCourseEntitlementPg(
  record: CourseEntitlementRecord
): Promise<CourseEntitlementRecord> {
  const created = await (getPrisma() as any).courseEntitlement.upsert({
    where: {
      userId_entitlement: {
        userId: record.userId,
        entitlement: record.entitlement,
      },
    },
    create: {
      id: record.id,
      userId: record.userId,
      email: record.email,
      product: record.product,
      entitlement: record.entitlement,
      source: record.source,
      metadata: record.metadata ?? undefined,
      expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
      revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
      grantedAt: new Date(record.grantedAt),
      updatedAt: new Date(record.updatedAt),
    },
    update: {
      email: record.email,
      product: record.product,
      source: record.source,
      metadata: record.metadata ?? undefined,
      expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
      revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
      updatedAt: new Date(record.updatedAt),
    },
  });

  return mapCourseEntitlementPg(created);
}

/* =========================
   OFFERS
========================= */

export async function getOffersByOwnerPg(owner: "trueqia" | "allwain") {
  return getPrisma().offer.findMany({
    where: { owner },
    orderBy: { createdAt: "desc" },
  });
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

async function activateTradeInTransaction(tx: any, tradeId: string) {
  const trade = await tx.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error("TRADE_NOT_FOUND");
  if (trade.status === "active" || trade.status === "completed") return trade;
  if (trade.status !== "accepted") throw new Error("INVALID_TRADE_STATUS");

  const now = new Date();

  // Legacy accepted trades were already charged before contract activation existed.
  if (trade.tokensTransferredAt) {
    return tx.trade.update({
      where: { id: tradeId },
      data: {
        status: "active",
        startedAt: trade.startedAt || now,
      },
    });
  }

  const claimed = await tx.trade.updateMany({
    where: {
      id: tradeId,
      status: "accepted",
      tokensTransferredAt: null,
    },
    data: {
      status: "active",
      startedAt: now,
      tokensTransferredAt: now,
    },
  });

  if (claimed.count === 0) {
    const current = await tx.trade.findUnique({ where: { id: tradeId } });
    if (current?.status === "active" || current?.status === "completed") return current;
    throw new Error("INVALID_TRADE_STATUS");
  }

  const debited = await tx.user.updateMany({
    where: {
      id: trade.fromUserId,
      tokens: { gte: trade.tokens },
    },
    data: { tokens: { decrement: trade.tokens } },
  });
  if (debited.count !== 1) throw new Error("INSUFFICIENT_TOKENS");

  await tx.user.updateMany({
    where: { id: trade.toUserId, tokens: null },
    data: { tokens: 0 },
  });
  await tx.user.update({
    where: { id: trade.toUserId },
    data: { tokens: { increment: trade.tokens } },
  });

  return tx.trade.findUnique({ where: { id: tradeId } });
}

export async function acceptTrueqiaContractAndActivateTradePg(
  contractId: string,
  userId: string
): Promise<Contract> {
  const prisma = getPrisma() as any;

  return prisma.$transaction(async (tx: any) => {
    let contract = await tx.contract.findUnique({ where: { id: contractId } });
    if (
      !contract ||
      contract.app !== "trueqia" ||
      (contract.requesterUserId !== userId && contract.providerUserId !== userId)
    ) {
      throw new Error("CONTRACT_NOT_FOUND");
    }
    if (
      contract.status !== "draft" &&
      contract.status !== "partially_accepted" &&
      contract.status !== "accepted"
    ) {
      throw new Error("INVALID_CONTRACT_STATUS");
    }

    if (contract.tradeId) {
      // Same lock order as negotiation/cancellation: trade, then contract.
      await tx.$queryRawUnsafe('SELECT "id" FROM "Trade" WHERE "id" = $1 FOR UPDATE', contract.tradeId);
      contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!["draft", "partially_accepted", "accepted"].includes(contract.status)) throw new Error("INVALID_CONTRACT_STATUS");
      assertTrueqiaSigningAllowed(await tx.trade.findUnique({ where: { id: contract.tradeId } }));
    }
    await tx.$queryRawUnsafe('SELECT "id" FROM "Contract" WHERE "id" = $1 FOR UPDATE', contractId);
    contract = await tx.contract.findUnique({ where: { id: contractId } });
    if (contract.status !== "accepted") {
      const now = new Date();
      const acceptanceData: Record<string, Date> = { updatedAt: now };
      if (contract.requesterUserId === userId && !contract.requesterAcceptedAt) {
        acceptanceData.requesterAcceptedAt = now;
      }
      if (contract.providerUserId === userId && !contract.providerAcceptedAt) {
        acceptanceData.providerAcceptedAt = now;
      }

      await tx.contract.update({
        where: { id: contractId },
        data: acceptanceData,
      });
      contract = await tx.contract.findUnique({ where: { id: contractId } });

      const requesterDone = !contract.requesterUserId || Boolean(contract.requesterAcceptedAt);
      const providerDone = !contract.providerUserId || Boolean(contract.providerAcceptedAt);
      const status = requesterDone && providerDone ? "accepted" : "partially_accepted";
      contract = await tx.contract.update({
        where: { id: contractId },
        data: { status, updatedAt: now },
      });
    }

    if (contract.status === "accepted" && contract.tradeId) {
      await activateTradeInTransaction(tx, contract.tradeId);
    }

    return mapContractPg(contract);
  });
}

export async function completeTradePg(tradeId: string, userId: string) {
  const prisma = getPrisma() as any;

  return prisma.$transaction(async (tx: any) => {
    let trade = await tx.trade.findUnique({ where: { id: tradeId } });
    if (!trade) throw new Error("TRADE_NOT_FOUND");
    if (trade.fromUserId !== userId && trade.toUserId !== userId) {
      throw new Error("TRADE_ACTION_FORBIDDEN");
    }
    if (trade.status === "completed") return trade;
    if (trade.status !== "active") throw new Error("INVALID_TRADE_STATUS");

    const now = new Date();
    const completionData: Record<string, Date> = {};
    if (trade.fromUserId === userId && !trade.fromCompletedAt) {
      completionData.fromCompletedAt = now;
    }
    if (trade.toUserId === userId && !trade.toCompletedAt) {
      completionData.toCompletedAt = now;
    }
    if (Object.keys(completionData).length > 0) {
      await tx.trade.update({ where: { id: tradeId }, data: completionData });
    }

    trade = await tx.trade.findUnique({ where: { id: tradeId } });
    if (trade.fromCompletedAt && trade.toCompletedAt) {
      trade = await tx.trade.update({
        where: { id: tradeId },
        data: { status: "completed", completedAt: trade.completedAt || now },
      });
    }

    return trade;
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

function mapContractPg(row: any): Contract {
  return {
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    requesterAcceptedAt:
      row.requesterAcceptedAt instanceof Date ? row.requesterAcceptedAt.toISOString() : row.requesterAcceptedAt,
    providerAcceptedAt:
      row.providerAcceptedAt instanceof Date ? row.providerAcceptedAt.toISOString() : row.providerAcceptedAt,
    preorderChargeDeadlineAt:
      row.preorderChargeDeadlineAt instanceof Date
        ? row.preorderChargeDeadlineAt.toISOString()
        : row.preorderChargeDeadlineAt,
    operationalArchivedAt:
      row.operationalArchivedAt instanceof Date
        ? row.operationalArchivedAt.toISOString()
        : row.operationalArchivedAt,
  };
}

export async function createContractPg(contract: Contract) {
  const item = await getPrisma().contract.create({ data: contract as any });
  return mapContractPg(item);
}

export async function getContractsPg(): Promise<Contract[]> {
  const items = await getPrisma().contract.findMany({ orderBy: { createdAt: "desc" } });
  return items.map(mapContractPg);
}

export async function getAllwainContractPagePg(
  userId: string,
  input: {
    limit: number;
    cursor?: string | null;
    scope?: "buyer" | "seller" | null;
    statuses?: string[] | null;
    query?: string | null;
  },
) {
  const participant: Prisma.ContractWhereInput =
    input.scope === "buyer"
      ? { requesterUserId: userId }
      : input.scope === "seller"
        ? { providerUserId: userId }
        : {
            OR: [
              { requesterUserId: userId },
              { providerUserId: userId },
            ],
          };
  const where: Prisma.ContractWhereInput = {
    app: "allwain",
    operationalArchivedAt: null,
    AND: [
      participant,
      input.query
        ? {
            OR: [
              { offerTitle: { contains: input.query, mode: "insensitive" } },
              { requesterName: { contains: input.query, mode: "insensitive" } },
              { providerName: { contains: input.query, mode: "insensitive" } },
            ],
          }
        : {},
    ],
    ...(input.statuses?.length ? { status: { in: input.statuses } } : {}),
  };
  const rows = await getPrisma().contract.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > input.limit;
  const pageRows = hasNextPage ? rows.slice(0, input.limit) : rows;
  return {
    items: pageRows.map(mapContractPg),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage
        ? pageRows[pageRows.length - 1]?.id || null
        : null,
    },
  };
}

export async function getContractByIdPg(id: string): Promise<Contract | null> {
  const item = await getPrisma().contract.findUnique({ where: { id } });
  return item ? mapContractPg(item) : null;
}

export async function getContractByPurchaseKeyPg(
  purchaseKey: string,
): Promise<Contract | null> {
  const item = await getPrisma().contract.findUnique({ where: { purchaseKey } });
  return item ? mapContractPg(item) : null;
}

export async function updateContractStatusPg(id: string, status: Contract["status"]): Promise<Contract> {
  const item = await getPrisma().contract.update({
    where: { id },
    data: {
      status,
      updatedAt: new Date(),
    },
  });
  return mapContractPg(item);
}

export async function updateContractAcceptancePg(
  id: string,
  patch: Pick<Contract, "status"> & Partial<Pick<Contract, "requesterAcceptedAt" | "providerAcceptedAt">>
): Promise<Contract> {
  const item = await getPrisma().contract.update({
    where: { id },
    data: {
      status: patch.status,
      requesterAcceptedAt:
        "requesterAcceptedAt" in patch && patch.requesterAcceptedAt
          ? new Date(patch.requesterAcceptedAt)
          : "requesterAcceptedAt" in patch
            ? null
            : undefined,
      providerAcceptedAt:
        "providerAcceptedAt" in patch && patch.providerAcceptedAt
          ? new Date(patch.providerAcceptedAt)
          : "providerAcceptedAt" in patch
            ? null
            : undefined,
      updatedAt: new Date(),
    },
  });
  return mapContractPg(item);
}

/* =========================
   TRUEQIA CHAT
========================= */

function mapTrueqiaChatMessagePg(row: any): TrueqiaChatMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    userId: row.userId,
    tradeId: row.tradeId ?? null,
    senderId: row.senderId ?? null,
    senderName: row.senderName,
    senderRole: row.senderRole,
    text: row.text,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

export async function getTrueqiaChatMessagesPg(userId: string, threadId: string) {
  const items = await (getPrisma() as any).trueqiaChatMessage.findMany({
    where: { userId, threadId },
    orderBy: { createdAt: "asc" },
  });

  return items.map(mapTrueqiaChatMessagePg);
}

export async function getTrueqiaChatThreadMessagesPg(threadId: string) {
  const items = await (getPrisma() as any).trueqiaChatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });

  return items.map(mapTrueqiaChatMessagePg);
}

export async function addTrueqiaChatMessagePg(message: TrueqiaChatMessage) {
  const created = await (getPrisma() as any).trueqiaChatMessage.create({
    data: {
      id: message.id,
      threadId: message.threadId,
      userId: message.userId,
      tradeId: message.tradeId ?? undefined,
      senderId: message.senderId ?? undefined,
      senderName: message.senderName,
      senderRole: message.senderRole,
      text: message.text,
      createdAt: new Date(message.createdAt),
    },
  });

  return mapTrueqiaChatMessagePg(created);
}

/* =========================
   PASSWORD RESET TOKENS
========================= */

export async function savePasswordResetTokenPg(token: string, userId: string, expiresAt: number) {
  return (getPrisma() as any).$transaction(async (tx: any) => {
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    return tx.passwordResetToken.create({
      data: { token, userId, expiresAt: BigInt(expiresAt) },
    });
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

export async function deletePasswordResetTokensForUserPg(userId: string) {
  return (getPrisma() as any).passwordResetToken.deleteMany({ where: { userId } });
}

