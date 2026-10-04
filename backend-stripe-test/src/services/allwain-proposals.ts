import { createHash } from "crypto";

import { canonicalAllwainAuditJson } from "./allwain-audit";

export const ALLWAIN_PROPOSAL_MIN_MINUTES = 60;
export const ALLWAIN_PROPOSAL_MAX_MINUTES = 43_200;
export const ALLWAIN_PROPOSAL_DEFAULT_MINUTES = 10_080;

export function normalizeAllwainProposalExpiry(input: {
  validForMinutes?: unknown;
  validUntil?: unknown;
  ceiling?: Date | null;
  now?: Date;
}) {
  const now = input.now || new Date();
  let expiresAt: Date;
  if (input.validForMinutes !== undefined && input.validForMinutes !== null) {
    const minutes = Math.trunc(Number(input.validForMinutes));
    if (
      !Number.isInteger(minutes) ||
      minutes < ALLWAIN_PROPOSAL_MIN_MINUTES ||
      minutes > ALLWAIN_PROPOSAL_MAX_MINUTES
    ) {
      throw new Error("INVALID_PROPOSAL_DURATION");
    }
    expiresAt = new Date(now.getTime() + minutes * 60_000);
  } else if (input.validUntil) {
    expiresAt = new Date(String(input.validUntil));
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new Error("INVALID_PROPOSAL_VALID_UNTIL");
    }
    const durationMinutes = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / 60_000,
    );
    if (
      durationMinutes < ALLWAIN_PROPOSAL_MIN_MINUTES ||
      durationMinutes > ALLWAIN_PROPOSAL_MAX_MINUTES
    ) {
      throw new Error("INVALID_PROPOSAL_DURATION");
    }
  } else {
    expiresAt = new Date(
      now.getTime() + ALLWAIN_PROPOSAL_DEFAULT_MINUTES * 60_000,
    );
  }

  if (input.ceiling && expiresAt > input.ceiling) {
    expiresAt = new Date(input.ceiling);
  }
  if (
    expiresAt.getTime() - now.getTime() <
    ALLWAIN_PROPOSAL_MIN_MINUTES * 60_000
  ) {
    throw new Error("PROPOSAL_WINDOW_TOO_SHORT");
  }
  return expiresAt;
}

export function isAllwainProposalExpired(
  value: Date | string | null | undefined,
  now = new Date(),
) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isFinite(date.getTime()) || date <= now;
}

export function assertAllwainProposalActive(
  value: Date | string | null | undefined,
  now = new Date(),
) {
  if (isAllwainProposalExpired(value, now)) {
    throw new Error("PROPOSAL_EXPIRED");
  }
}

export function allwainProposalSnapshotHash(value: unknown) {
  return createHash("sha256")
    .update(canonicalAllwainAuditJson(value))
    .digest("hex");
}
