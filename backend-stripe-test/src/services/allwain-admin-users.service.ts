import { Prisma } from "@prisma/client";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { appendAllwainAuditEvent, appendAllwainAuditEventTx } from "./allwain-audit";

const USER_STATUSES = new Set(["active", "disabled", "locked"]);
const PARTICIPATION_PROFILES = new Set(["seller", "connector"]);
const PROFILE_STATUSES = new Set([
  "not_activated",
  "onboarding",
  "pending_verification",
  "active",
  "restricted",
]);

export class AllwainAdminUserError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "AllwainAdminUserError";
  }
}

function ensurePostgres() {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    throw new AllwainAdminUserError("ADMIN_USER_MANAGEMENT_REQUIRES_POSTGRES");
  }
}

function boundedLimit(value: unknown, fallback = 30) {
  const parsed = Number(value);
  return Math.max(1, Math.min(100, Number.isFinite(parsed) ? Math.trunc(parsed) : fallback));
}

function clean(value: unknown, maximum = 200) {
  return String(value || "").trim().slice(0, maximum);
}

function requireReason(value: unknown) {
  const reason = clean(value, 500);
  if (reason.length < 8) throw new AllwainAdminUserError("ADMIN_REASON_REQUIRED");
  return reason;
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function countMap(rows: any[], key: string) {
  return new Map(rows.map((row) => [String(row[key]), Number(row._count?._all || 0)]));
}

function rowMap(rows: any[], key = "userId") {
  return new Map(rows.map((row) => [String(row[key]), row]));
}

async function hydrateAdminUsers(rows: any[]) {
  if (!rows.length) return [];
  const prisma = getPrisma() as any;
  const ids = rows.map((row) => row.id);
  const now = new Date();
  const [
    sellers,
    connectors,
    paymentAccounts,
    reputations,
    sessions,
    offers,
    requests,
    ordersBought,
    ordersSold,
    unreadNotifications,
    supportTickets,
  ] = await Promise.all([
    prisma.allwainSellerProfile.findMany({ where: { userId: { in: ids } } }),
    prisma.allwainConnectorProfile.findMany({ where: { userId: { in: ids } } }),
    prisma.allwainSellerPaymentAccount.findMany({ where: { userId: { in: ids } } }),
    prisma.allwainReputation.findMany({ where: { userId: { in: ids } } }),
    prisma.authSession.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, revokedAt: null, expiresAt: { gt: now } },
      _count: { _all: true },
    }),
    prisma.offer.groupBy({
      by: ["ownerUserId"],
      where: { owner: "allwain", ownerUserId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.allwainScanRequest.groupBy({
      by: ["userId"],
      where: { userId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.allwainOrder.groupBy({
      by: ["buyerUserId"],
      where: { buyerUserId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.allwainOrder.groupBy({
      by: ["sellerUserId"],
      where: { sellerUserId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.allwainNotification.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, readAt: null, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.allwainSupportTicket.groupBy({
      by: ["requesterUserId"],
      where: { requesterUserId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const sellerByUser = rowMap(sellers);
  const connectorByUser = rowMap(connectors);
  const paymentByUser = rowMap(paymentAccounts);
  const reputationByUser = rowMap(reputations);
  const sessionCount = countMap(sessions, "userId");
  const offerCount = countMap(offers, "ownerUserId");
  const requestCount = countMap(requests, "userId");
  const boughtCount = countMap(ordersBought, "buyerUserId");
  const soldCount = countMap(ordersSold, "sellerUserId");
  const unreadCount = countMap(unreadNotifications, "userId");
  const ticketCount = countMap(supportTickets, "requesterUserId");

  return rows.map((user) => {
    const seller = sellerByUser.get(user.id);
    const connector = connectorByUser.get(user.id);
    const payment = paymentByUser.get(user.id);
    const reputation = reputationByUser.get(user.id);
    const lockedUntil = user.lockedUntil instanceof Date ? user.lockedUntil : null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl || null,
      role: user.role,
      status: user.status || "active",
      preferredLocale: user.preferredLocale || null,
      analyticsConsent: user.analyticsConsent,
      emailVerifiedAt: iso(user.emailVerifiedAt),
      lastLoginAt: iso(user.lastLoginAt),
      createdAt: iso(user.createdAt),
      sponsorCode: user.sponsorCode || null,
      referredByCode: user.referredByCode || null,
      security: {
        locked: Boolean(lockedUntil && lockedUntil.getTime() > Date.now()),
        lockedUntil: iso(lockedUntil),
        failedLoginCount: Number(user.failedLoginCount || 0),
        activeSessions: sessionCount.get(user.id) || 0,
      },
      participation: {
        buyer: { status: "active" },
        seller: {
          status: seller?.status || "not_activated",
          sellerType: seller?.sellerType || null,
          displayName: seller?.displayName || null,
          fiscalStatus: seller?.fiscalStatus || "not_started",
          paymentStatus: payment?.status || "not_started",
          transfersEnabled: Boolean(payment?.transfersEnabled),
          payoutsEnabled: Boolean(payment?.payoutsEnabled),
        },
        connector: {
          status: connector?.status || "not_activated",
          available: Boolean(connector?.available),
          radiusKm: Number(connector?.radiusKm || 5),
        },
      },
      reputation: {
        averageRating: Number(reputation?.averageRating || 0),
        reviewCount: Number(reputation?.reviewCount || 0),
        completedOrders: Number(reputation?.completedOrders || 0),
      },
      activity: {
        offers: offerCount.get(user.id) || 0,
        requests: requestCount.get(user.id) || 0,
        ordersBought: boughtCount.get(user.id) || 0,
        ordersSold: soldCount.get(user.id) || 0,
        unreadNotifications: unreadCount.get(user.id) || 0,
        supportTickets: ticketCount.get(user.id) || 0,
      },
    };
  });
}

export async function listAllwainAdminUsers(input: {
  limit?: unknown;
  cursor?: unknown;
  query?: unknown;
  status?: unknown;
  participation?: unknown;
}) {
  ensurePostgres();
  const prisma = getPrisma() as any;
  const limit = boundedLimit(input.limit);
  const query = clean(input.query, 120);
  const status = clean(input.status, 30).toLowerCase();
  const participation = clean(input.participation, 30).toLowerCase();
  const cursorId = clean(input.cursor, 100);
  if (status && status !== "all" && !USER_STATUSES.has(status)) {
    throw new AllwainAdminUserError("INVALID_USER_STATUS");
  }
  if (participation && participation !== "all" && !["buyer", "seller", "connector"].includes(participation)) {
    throw new AllwainAdminUserError("INVALID_PARTICIPATION_FILTER");
  }

  let participantIds: string[] | null = null;
  if (participation === "seller") {
    const profiles = await prisma.allwainSellerProfile.findMany({
      where: { status: { not: "not_activated" } },
      select: { userId: true },
    });
    participantIds = profiles.map((profile: any) => profile.userId);
  } else if (participation === "connector") {
    const profiles = await prisma.allwainConnectorProfile.findMany({
      where: { status: { not: "not_activated" } },
      select: { userId: true },
    });
    participantIds = profiles.map((profile: any) => profile.userId);
  }

  const cursor = cursorId
    ? await prisma.user.findFirst({
        where: { id: cursorId, deletedAt: null },
        select: { id: true, createdAt: true },
      })
    : null;
  if (cursorId && !cursor) throw new AllwainAdminUserError("INVALID_USER_CURSOR");

  const clauses: any[] = [{ deletedAt: null }];
  if (status && status !== "all") clauses.push({ status });
  if (participantIds) clauses.push({ id: { in: participantIds } });
  if (query) {
    clauses.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { sponsorCode: { contains: query, mode: "insensitive" } },
      ],
    });
  }
  if (cursor) {
    clauses.push({
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    });
  }
  const where = { AND: clauses };
  const [rows, total, statusGroups] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    prisma.user.count({ where: { AND: clauses.filter((_: any, index: number) => index !== clauses.length - 1 || !cursor) } }),
    prisma.user.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  return {
    users: await hydrateAdminUsers(pageRows),
    total,
    statusTotals: Object.fromEntries(
      statusGroups.map((group: any) => [group.status || "active", Number(group._count?._all || 0)]),
    ),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? pageRows.at(-1)?.id || null : null,
    },
  };
}

export async function getAllwainAdminUser(userId: string) {
  ensurePostgres();
  const prisma = getPrisma() as any;
  const row = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!row) throw new AllwainAdminUserError("USER_NOT_FOUND");
  const [user] = await hydrateAdminUsers([row]);
  const [recentSessions, recentAudit] = await Promise.all([
    prisma.authSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        sourceApp: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        revokeReason: true,
      },
    }),
    prisma.allwainAuditEvent.findMany({
      where: { aggregateType: "user", aggregateId: userId },
      orderBy: { sequence: "desc" },
      take: 20,
      select: {
        id: true,
        sequence: true,
        eventType: true,
        actorUserId: true,
        source: true,
        occurredAt: true,
        payload: true,
        eventHash: true,
      },
    }),
  ]);
  return {
    ...user,
    recentSessions: recentSessions.map((session: any) => ({
      ...session,
      createdAt: iso(session.createdAt),
      lastUsedAt: iso(session.lastUsedAt),
      expiresAt: iso(session.expiresAt),
      revokedAt: iso(session.revokedAt),
    })),
    recentAudit: recentAudit.map((event: any) => ({
      ...event,
      occurredAt: iso(event.occurredAt),
      eventHash: String(event.eventHash || "").slice(0, 16),
    })),
  };
}

function assertTargetCanBeManaged(target: any, actorUserId: string) {
  if (!target || target.deletedAt) throw new AllwainAdminUserError("USER_NOT_FOUND");
  if (target.id === actorUserId) throw new AllwainAdminUserError("ADMIN_SELF_ACTION_FORBIDDEN");
  if (target.role === "admin") throw new AllwainAdminUserError("ADMIN_ACCOUNT_PROTECTED");
}

export async function updateAllwainAdminUserAccess(input: {
  actorUserId: string;
  userId: string;
  action: unknown;
  reason: unknown;
  requestId?: string;
}) {
  ensurePostgres();
  const action = clean(input.action, 30).toLowerCase();
  if (!new Set(["enable", "disable", "unlock"]).has(action)) {
    throw new AllwainAdminUserError("INVALID_ADMIN_USER_ACTION");
  }
  const reason = requireReason(input.reason);
  const prisma = getPrisma() as any;
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`admin-user:${input.userId}`}))`);
    const target = await tx.user.findUnique({ where: { id: input.userId } });
    assertTargetCanBeManaged(target, input.actorUserId);
    const nextStatus = action === "disable" ? "disabled" : "active";
    await tx.user.update({
      where: { id: input.userId },
      data: {
        status: nextStatus,
        lockedUntil: null,
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        tokenVersion: { increment: 1 },
      },
    });
    await tx.authSession.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: `admin_${action}` },
    });
    const eventAction = action === "unlock" ? "unlocked" : `${action}d`;
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "user",
      aggregateId: input.userId,
      eventType: `admin.user_${eventAction}`,
      actorUserId: input.actorUserId,
      actorRole: "admin",
      source: "allwain_admin",
      requestId: input.requestId,
      payload: {
        previousStatus: target.status || "active",
        nextStatus,
        reason,
        sessionsRevoked: true,
      },
    });
  });
  return getAllwainAdminUser(input.userId);
}

export async function revokeAllwainAdminUserSessions(input: {
  actorUserId: string;
  userId: string;
  reason: unknown;
  requestId?: string;
}) {
  ensurePostgres();
  const reason = requireReason(input.reason);
  const prisma = getPrisma() as any;
  let revoked = 0;
  await prisma.$transaction(async (tx: any) => {
    const target = await tx.user.findUnique({ where: { id: input.userId } });
    assertTargetCanBeManaged(target, input.actorUserId);
    await tx.user.update({
      where: { id: input.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    const result = await tx.authSession.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "admin_security_revoke" },
    });
    revoked = Number(result.count || 0);
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "user",
      aggregateId: input.userId,
      eventType: "admin.user_sessions_revoked",
      actorUserId: input.actorUserId,
      actorRole: "admin",
      source: "allwain_admin",
      requestId: input.requestId,
      payload: { reason, revokedSessions: revoked },
    });
  });
  return { userId: input.userId, revokedSessions: revoked };
}

export async function updateAllwainAdminParticipation(input: {
  actorUserId: string;
  userId: string;
  profile: unknown;
  action: unknown;
  reason: unknown;
  requestId?: string;
}) {
  ensurePostgres();
  const profile = clean(input.profile, 30).toLowerCase();
  const action = clean(input.action, 30).toLowerCase();
  if (!PARTICIPATION_PROFILES.has(profile)) {
    throw new AllwainAdminUserError("INVALID_PARTICIPATION_PROFILE");
  }
  if (!new Set(["restrict", "restore_review"]).has(action)) {
    throw new AllwainAdminUserError("INVALID_PARTICIPATION_ACTION");
  }
  const reason = requireReason(input.reason);
  const prisma = getPrisma() as any;
  await prisma.$transaction(async (tx: any) => {
    const target = await tx.user.findUnique({ where: { id: input.userId } });
    assertTargetCanBeManaged(target, input.actorUserId);
    const model = profile === "seller" ? tx.allwainSellerProfile : tx.allwainConnectorProfile;
    const current = await model.findUnique({ where: { userId: input.userId } });
    if (!current) throw new AllwainAdminUserError("PARTICIPATION_PROFILE_NOT_FOUND");
    if (!PROFILE_STATUSES.has(String(current.status))) {
      throw new AllwainAdminUserError("INVALID_PARTICIPATION_STATUS");
    }
    const nextStatus = action === "restrict" ? "restricted" : "pending_verification";
    await model.update({
      where: { userId: input.userId },
      data: {
        status: nextStatus,
        restrictedAt: action === "restrict" ? new Date() : null,
        ...(profile === "connector" && action === "restrict" ? { available: false } : {}),
      },
    });
    await appendAllwainAuditEventTx(tx, {
      aggregateType: "user",
      aggregateId: input.userId,
      eventType: `admin.${profile}_${action}`,
      actorUserId: input.actorUserId,
      actorRole: "admin",
      source: "allwain_admin",
      requestId: input.requestId,
      payload: { profile, previousStatus: current.status, nextStatus, reason },
    });
  });
  return getAllwainAdminUser(input.userId);
}

export async function auditAllwainAdminUserListAccess(input: {
  actorUserId: string;
  returned: number;
  queryApplied: boolean;
  requestId?: string;
}) {
  try {
    await appendAllwainAuditEvent({
      aggregateType: "admin_access",
      aggregateId: input.actorUserId,
      eventType: "privacy.admin_user_list_accessed",
      actorUserId: input.actorUserId,
      actorRole: "admin",
      source: "allwain_admin",
      requestId: input.requestId,
      payload: { returned: input.returned, queryApplied: input.queryApplied },
    });
  } catch (error) {
    console.error("ADMIN_USER_LIST_AUDIT_FAILED", error);
  }
}
