import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { appendAllwainAuditEventTx } from "./allwain-audit";
import { adminTotp, decryptMfaSecret, encryptMfaSecret, mfaKey, newMfaSecret, newRecoveryCodes, recoveryHash, validMfaStep } from "./admin-mfa-crypto";

type Identity = { id: string; sessionId: string };
const GRANT_MS = 10 * 60_000;
const FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

function configured() {
  if (ENV.STORAGE_DRIVER !== "postgres") throw new Error("ADMIN_MFA_REQUIRES_POSTGRES");
  mfaKey(ENV.ADMIN_MFA_ENCRYPTION_KEY);
}

function active(user: any, session: any, now: Date) {
  return user?.role === "admin" && user.status === "active" && !user.deletedAt && session &&
    session.userId === user.id && !session.revokedAt && session.expiresAt > now && session.tokenVersion === user.tokenVersion;
}

function status(factor: any, session: any) {
  const required = ENV.ADMIN_MFA_REQUIRED || Boolean(factor?.secretCiphertext);
  const verified = !required || Boolean(factor?.secretCiphertext && session?.adminMfaVersion === factor.version &&
    session.adminMfaVerifiedUntil > new Date() && !(factor.lockedUntil > new Date()));
  return { required, enrolled: Boolean(factor?.secretCiphertext), verified,
    verifiedUntil: verified && required ? session.adminMfaVerifiedUntil.toISOString() : null,
    recoveryCodesRemaining: factor?.recoveryCodeHashes.length || 0,
    lockedUntil: factor?.lockedUntil > new Date() ? factor.lockedUntil.toISOString() : null };
}

export async function getAdminMfaStatus(identity: Identity) {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    if (ENV.ADMIN_MFA_REQUIRED) configured();
    return status(null, null);
  }
  const db = getPrisma() as any;
  const user = await db.user.findUnique({ where: { id: identity.id } });
  const session = await db.authSession.findUnique({ where: { id: identity.sessionId } });
  if (!active(user, session, new Date())) throw new Error("FORBIDDEN");
  const factor = await db.adminMfa.findUnique({ where: { userId: identity.id } });
  if (ENV.ADMIN_MFA_REQUIRED || factor?.secretCiphertext) configured();
  return status(factor, session);
}

export async function assertAdminMfa(identity: Identity) {
  const current = await getAdminMfaStatus(identity);
  if (!current.verified) throw new Error(current.enrolled ? "ADMIN_MFA_REQUIRED" : "ADMIN_MFA_ENROLLMENT_REQUIRED");
}

function strictBody(value: unknown, allowed: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)))
    throw new Error("ADMIN_MFA_INVALID_REQUEST");
  return value as Record<string, unknown>;
}

async function audit(tx: any, identity: Identity, event: string, payload: Record<string, unknown> = {}) {
  await appendAllwainAuditEventTx(tx, { aggregateType: "admin_security", aggregateId: identity.id,
    actorUserId: identity.id, actorRole: "admin", source: "admin_mfa", eventType: event,
    payload: { sessionId: identity.sessionId, ...payload } });
}

async function locked<T>(identity: Identity, run: (tx: any, factor: any, session: any, user: any) => Promise<T>) {
  configured();
  const result: any = await (getPrisma() as any).$transaction(async (tx: any) => {
    // One per-user lock protects enrollment, attempts, replay and recovery across sessions/workers.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${identity.id} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: identity.id } });
    const session = await tx.authSession.findUnique({ where: { id: identity.sessionId } });
    if (!active(user, session, new Date())) throw new Error("FORBIDDEN");
    const factor = await tx.adminMfa.upsert({ where: { userId: identity.id }, create: { userId: identity.id }, update: {} });
    if (factor.lockedUntil > new Date()) return { error: "ADMIN_MFA_LOCKED" };
    return run(tx, factor, session, user);
  });
  // Failed attempt counters must commit; throwing inside the transaction would erase them.
  if (result?.error) throw new Error(result.error);
  return result as T;
}

async function failed(tx: any, factor: any, identity: Identity, code = "ADMIN_MFA_INVALID_CODE") {
  const now = new Date();
  const inWindow = factor.failedWindowStartedAt && now.getTime() - factor.failedWindowStartedAt.getTime() < FAILURE_WINDOW_MS;
  const count = (inWindow ? factor.failedAttempts : 0) + 1;
  const lockedUntil = count >= MAX_FAILURES ? new Date(now.getTime() + FAILURE_WINDOW_MS) : null;
  await tx.adminMfa.update({ where: { userId: identity.id }, data: { failedAttempts: count,
    failedWindowStartedAt: inWindow ? factor.failedWindowStartedAt : now, lockedUntil } });
  if (lockedUntil) await clearGrants(tx, identity.id);
  await audit(tx, identity, "security.admin_mfa_failed", { locked: Boolean(lockedUntil) });
  return { error: lockedUntil ? "ADMIN_MFA_LOCKED" : code };
}

async function clearGrants(tx: any, userId: string) {
  await tx.authSession.updateMany({ where: { userId }, data: { adminMfaVersion: null, adminMfaVerifiedUntil: null } });
}

async function grant(tx: any, identity: Identity, version: number) {
  const until = new Date(Date.now() + GRANT_MS);
  await tx.authSession.update({ where: { id: identity.sessionId }, data: { adminMfaVersion: version, adminMfaVerifiedUntil: until } });
  return until.toISOString();
}

async function consumeFactor(tx: any, factor: any, identity: Identity, input: Record<string, unknown>) {
  if (!factor.secretCiphertext) return { error: "ADMIN_MFA_ENROLLMENT_REQUIRED" };
  if (input.recoveryCode !== undefined) {
    const code = input.recoveryCode;
    if (input.code !== undefined || typeof code !== "string" || !/^[a-f0-9]{32}$/.test(code)) return failed(tx, factor, identity);
    const hash = recoveryHash(identity.id, code);
    if (!factor.recoveryCodeHashes.includes(hash)) return failed(tx, factor, identity);
    const hashes = factor.recoveryCodeHashes.filter((item: string) => item !== hash);
    await tx.adminMfa.update({ where: { userId: identity.id }, data: { recoveryCodeHashes: hashes, failedAttempts: 0,
      failedWindowStartedAt: null, lockedUntil: null } });
    await clearGrants(tx, identity.id);
    await audit(tx, identity, "security.admin_mfa_recovery_used", { remaining: hashes.length });
    return { recovery: true };
  }
  const secret = decryptMfaSecret(factor.secretCiphertext, identity.id, ENV.ADMIN_MFA_ENCRYPTION_KEY);
  const step = validMfaStep(secret, input.code, factor.lastUsedStep);
  if (step === null) return failed(tx, factor, identity);
  await tx.adminMfa.update({ where: { userId: identity.id }, data: { lastUsedStep: step,
    failedAttempts: 0, failedWindowStartedAt: null, lockedUntil: null } });
  return { recovery: false };
}

export async function beginAdminMfaEnrollment(identity: Identity, body: unknown) {
  const input = strictBody(body, ["code", "recoveryCode", "confirmation"]);
  return locked(identity, async (tx, factor, session, user) => {
    const now = new Date();
    if (factor.pendingExpiresAt > now && factor.pendingFamilyId === session.familyId) {
      const secret = decryptMfaSecret(factor.pendingCiphertext, identity.id, ENV.ADMIN_MFA_ENCRYPTION_KEY);
      return { secret, uri: adminTotp(secret, user.email).toString(), expiresAt: factor.pendingExpiresAt.toISOString() };
    }
    if (factor.pendingExpiresAt > now && !factor.secretCiphertext) return { error: "ADMIN_MFA_ENROLLMENT_IN_PROGRESS" };
    if (factor.secretCiphertext) {
      if (input.confirmation !== "replace_authenticator") return { error: "ADMIN_MFA_REPLACEMENT_CONFIRMATION_REQUIRED" };
      const proof = await consumeFactor(tx, factor, identity, input);
      if ("error" in proof) return proof;
    } else {
      const firstSession = await tx.authSession.findUnique({ where: { id: session.familyId } });
      if (!firstSession || now.getTime() - firstSession.createdAt.getTime() > 5 * 60_000)
        return { error: "ADMIN_MFA_FRESH_LOGIN_REQUIRED" };
    }
    const secret = newMfaSecret();
    const expiresAt = new Date(now.getTime() + GRANT_MS);
    await tx.adminMfa.update({ where: { userId: identity.id }, data: {
      pendingCiphertext: encryptMfaSecret(secret, identity.id, ENV.ADMIN_MFA_ENCRYPTION_KEY),
      pendingFamilyId: session.familyId, pendingExpiresAt: expiresAt,
    } });
    await audit(tx, identity, "security.admin_mfa_enrollment_started", { replacement: Boolean(factor.secretCiphertext), supersededPending: factor.pendingExpiresAt > now });
    return { secret, uri: adminTotp(secret, user.email).toString(), expiresAt: expiresAt.toISOString() };
  });
}

export async function confirmAdminMfaEnrollment(identity: Identity, body: unknown) {
  const input = strictBody(body, ["code"]);
  return locked(identity, async (tx, factor, session) => {
    if (!factor.pendingCiphertext || factor.pendingFamilyId !== session.familyId || !(factor.pendingExpiresAt > new Date()))
      return { error: "ADMIN_MFA_ENROLLMENT_EXPIRED" };
    const secret = decryptMfaSecret(factor.pendingCiphertext, identity.id, ENV.ADMIN_MFA_ENCRYPTION_KEY);
    const step = validMfaStep(secret, input.code, -1);
    if (step === null) return failed(tx, factor, identity);
    const recovery = newRecoveryCodes(identity.id);
    const version = factor.version + 1;
    await tx.adminMfa.update({ where: { userId: identity.id }, data: {
      secretCiphertext: factor.pendingCiphertext, pendingCiphertext: null, pendingFamilyId: null, pendingExpiresAt: null,
      version, lastUsedStep: step, recoveryCodeHashes: recovery.hashes, enrolledAt: new Date(),
      failedAttempts: 0, failedWindowStartedAt: null, lockedUntil: null,
    } });
    await clearGrants(tx, identity.id);
    const verifiedUntil = await grant(tx, identity, version);
    await audit(tx, identity, "security.admin_mfa_enrolled", { version, replacement: Boolean(factor.secretCiphertext) });
    return { verified: true, verifiedUntil, recoveryCodes: recovery.codes };
  });
}

export async function verifyAdminMfa(identity: Identity, body: unknown) {
  const input = strictBody(body, ["code", "recoveryCode"]);
  return locked(identity, async (tx, factor) => {
    const proof = await consumeFactor(tx, factor, identity, input);
    if ("error" in proof) return proof;
    const verifiedUntil = await grant(tx, identity, factor.version);
    await audit(tx, identity, "security.admin_mfa_verified", { recovery: proof.recovery });
    return { verified: true, verifiedUntil };
  });
}

export async function rotateAdminRecoveryCodes(identity: Identity, body: unknown) {
  const input = strictBody(body, ["code", "recoveryCode", "confirmation"]);
  if (input.confirmation !== "replace_recovery_codes") throw new Error("ADMIN_MFA_INVALID_REQUEST");
  return locked(identity, async (tx, factor) => {
    const proof = await consumeFactor(tx, factor, identity, input);
    if ("error" in proof) return proof;
    const recovery = newRecoveryCodes(identity.id);
    const version = factor.version + 1;
    await tx.adminMfa.update({ where: { userId: identity.id }, data: { recoveryCodeHashes: recovery.hashes, version } });
    await clearGrants(tx, identity.id);
    const verifiedUntil = await grant(tx, identity, version);
    await audit(tx, identity, "security.admin_mfa_recovery_rotated", { version });
    return { verified: true, verifiedUntil, recoveryCodes: recovery.codes };
  });
}

export async function lockAdminSession(identity: Identity) {
  configured();
  await (getPrisma() as any).$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${identity.id} FOR UPDATE`;
    const session = await tx.authSession.findUnique({ where: { id: identity.sessionId } });
    if (!session || session.userId !== identity.id) throw new Error("FORBIDDEN");
    await tx.authSession.updateMany({ where: { userId: identity.id, familyId: session.familyId },
      data: { adminMfaVersion: null, adminMfaVerifiedUntil: null } });
    await audit(tx, identity, "security.admin_session_locked");
  });
  return { locked: true };
}
