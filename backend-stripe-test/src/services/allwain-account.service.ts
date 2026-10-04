import { Prisma } from "@prisma/client";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { appendAllwainAuditEventTx } from "./allwain-audit";
import { archiveAllwainOfferMeta } from "./allwain-inventory";

const CLOSED_ORDER_STATUSES = ["completed", "canceled", "expired", "refunded"];
const OPEN_TRADE_STATUSES = ["pending", "accepted", "active"];

export async function deleteAllwainAccount(userId: string) {
  if (ENV.STORAGE_DRIVER !== "postgres") throw new Error("ACCOUNT_DELETION_REQUIRES_POSTGRES");
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    const accountLockKey = `allwain-account:${userId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${accountLockKey}))`);
    // Share the row lock with Trueqia tester writes so voluntary reports cannot
    // arrive between their erasure and this account's final anonymization.
    await tx.$executeRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new Error("USER_NOT_FOUND");

    // Serialize publication/stock writes before checking for open orders, then
    // archive the current locked inventory without discarding historical counters.
    const ownedOffers = await tx.$queryRaw(Prisma.sql`
      SELECT "id", "meta" FROM "Offer"
      WHERE "owner" = 'allwain' AND "ownerUserId" = ${userId}
      ORDER BY "id" FOR UPDATE
    `) as { id: string; meta: Record<string, unknown> | null }[];

    const openOrders = await tx.allwainOrder.count({
      where: {
        OR: [
          { buyerUserId: userId },
          { sellerUserId: userId },
          { connectorUserId: userId },
        ],
        status: { notIn: CLOSED_ORDER_STATUSES },
      },
    });
    if (openOrders > 0) throw new Error("ACCOUNT_HAS_OPEN_ORDERS");

    const openTrades = await tx.trade.count({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: { in: OPEN_TRADE_STATUSES },
      },
    });
    if (openTrades > 0) throw new Error("ACCOUNT_HAS_OPEN_TRADES");

    const deletedAt = new Date();
    const testerTickets = await tx.allwainSupportTicket.findMany({
      where: { requesterUserId: userId, source: "web_tester" },
      select: { id: true },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "user_account",
      aggregateId: userId,
      eventType: "account.deleted",
      actorUserId: userId,
      actorRole: user.role,
      source: "newmersive_account",
      payload: { deletedAt: deletedAt.toISOString(), anonymized: true },
    });

    const cleanup = [
      tx.authIdentity.deleteMany({ where: { userId } }),
      tx.authSession.deleteMany({ where: { userId } }),
      // Soft deletion retains User; explicitly erase enrolled and pending MFA secrets.
      tx.adminMfa.deleteMany({ where: { userId } }),
      tx.allwainBuyerProfile.deleteMany({ where: { userId } }),
      tx.allwainSellerProfile.deleteMany({ where: { userId } }),
      tx.allwainConnectorProfile.deleteMany({ where: { userId } }),
      tx.allwainAppTesterProgress.deleteMany({ where: { userId } }),
      tx.allwainAppTesterActionProgress.deleteMany({ where: { userId } }),
      tx.trueqiaTesterAction.deleteMany({ where: { userId } }),
      tx.trueqiaTesterIncident.deleteMany({ where: { userId } }),
      tx.allwainBuyerPaymentProfile.deleteMany({ where: { userId } }),
      tx.allwainNotification.deleteMany({ where: { userId } }),
      tx.chatParticipant.deleteMany({ where: { userId } }),
      tx.chatBlock.deleteMany({
        where: { OR: [{ blockerUserId: userId }, { blockedUserId: userId }] },
      }),
      tx.trueqiaChatMessage.updateMany({
        where: { senderId: userId },
        data: { senderName: "Cuenta eliminada" },
      }),
      tx.passwordResetToken.deleteMany({ where: { userId } }),
      tx.allwainScanRequest.updateMany({
        where: { userId },
        data: { status: "archived" },
      }),
      ...ownedOffers.map((offer) =>
        tx.offer.update({
          where: { id: offer.id },
          data: {
            allwainStatus: "closed",
            meta: archiveAllwainOfferMeta(offer.meta, deletedAt),
          },
        }),
      ),
    ];
    if (user.sponsorCode) {
      cleanup.push(tx.user.updateMany({
        where: { referredByCode: user.sponsorCode || "__none__" },
        data: { referredByCode: null },
      }));
    }
    await Promise.all(cleanup);
    // The database keeps audit/support history append-only by default. Account erasure
    // opens a transaction-local, user-scoped exception for the two tester records that
    // contain voluntary feedback and for redacting that user's tester messages.
    await tx.$executeRaw(Prisma.sql`
      SELECT set_config('allwain.account_erasure_user_id', ${userId}, true)
    `);
    const testerTicketIds = testerTickets.map((ticket: { id: string }) => ticket.id);
    if (testerTicketIds.length) {
      const erasedContact = "deleted-web-tester@deleted.invalid";
      await tx.allwainSupportMessage.updateMany({
        where: { ticketId: { in: testerTicketIds } },
        data: {
          authorUserId: null,
          fromEmail: erasedContact,
          toEmail: erasedContact,
          subject: null,
          bodyText: "Contenido eliminado al borrar la cuenta.",
          providerMessageId: null,
          inReplyTo: null,
          references: Prisma.DbNull,
        },
      });
      await tx.allwainSupportTicket.updateMany({
        where: { id: { in: testerTicketIds } },
        data: {
          requesterUserId: null,
          requesterEmail: erasedContact,
          requesterName: null,
          subject: "Incidencia web anonimizada",
          status: "closed",
          aiSummary: null,
          aiTriage: {
            anonymized: true,
            retainedFields: ["category", "priority", "riskLevel", "status", "timestamps"],
          },
          resolvedAt: deletedAt,
        },
      });
    }
    await tx.allwainAuditEvent.deleteMany({
      where: {
        aggregateType: "web_tester_feedback",
        eventType: "web_tester.feedback_submitted",
        actorUserId: userId,
      },
    });
    await tx.allwainAuditEvent.deleteMany({
      where: {
        aggregateType: "app_tester_progress_request",
        eventType: "app_tester.progress_completed",
        actorUserId: userId,
      },
    });
    await tx.allwainAuditEvent.deleteMany({
      where: {
        aggregateType: "app_tester_action_request",
        eventType: "app_tester.action_updated",
        actorUserId: userId,
      },
    });
    await tx.$executeRaw(Prisma.sql`
      SELECT set_config('allwain.account_erasure_user_id', ${""}, true)
    `);
    await tx.allwainSellerPaymentAccount.updateMany({
      where: { userId },
      data: {
        status: "account_deleted",
        transfersEnabled: false,
        payoutsEnabled: false,
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        name: "Cuenta eliminada",
        email: `deleted-${userId}@deleted.invalid`,
        passwordHash: null,
        sponsorCode: null,
        referredByCode: null,
        avatarUrl: null,
        tokens: 0,
        allwainBalance: 0,
        status: "disabled",
        tokenVersion: { increment: 1 },
        deletedAt,
      },
    });
    return { deleted: true, deletedAt: deletedAt.toISOString() };
  });
}
