import bcrypt from "bcryptjs";
import crypto from "crypto";
import { ENV } from "../config/env";
import {
  AuthUser,
  CourseEntitlement,
  CourseEntitlementRecord,
  User,
} from "../shared/types";
import {
  getCourseEntitlementByUserAndType,
  getCourseEntitlementsByUserId,
  getUserByEmail,
  upsertCourseEntitlement,
  upsertUser,
} from "./data.store";
import {
  getCourseEntitlementByUserAndTypePg,
  getCourseEntitlementsByUserIdPg,
  getUserByEmailPg,
  upsertCourseEntitlementPg,
  upsertUserPg,
} from "./data.store.pg";

export const ALLOWED_COURSE_ENTITLEMENTS: CourseEntitlement[] = [
  "course_starter",
  "course_professional",
  "mentoring_premium",
  "admin_course",
];

export type CourseEntitlementSource = CourseEntitlementRecord["source"];

export interface GrantCourseEntitlementInput {
  email: string;
  entitlement: CourseEntitlement;
  name?: string;
  source?: CourseEntitlementSource;
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
}

export interface GrantCourseEntitlementResult {
  user: AuthUser;
  entitlements: CourseEntitlement[];
  entitlement: CourseEntitlement;
  createdUser: boolean;
}

export function isCourseEntitlement(value: unknown): value is CourseEntitlement {
  return ALLOWED_COURSE_ENTITLEMENTS.includes(value as CourseEntitlement);
}

export async function getUserCourseEntitlements(userId: string): Promise<CourseEntitlement[]> {
  const rows =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getCourseEntitlementsByUserIdPg(userId)
      : getCourseEntitlementsByUserId(userId);

  return rows
    .filter((item) => !item.revokedAt)
    .filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > Date.now())
    .map((item) => item.entitlement)
    .filter(isCourseEntitlement);
}

export function toEntitledAuthUser(
  user: User,
  entitlements: CourseEntitlement[] = []
): AuthUser {
  const {
    passwordHash: _passwordHash,
    tokenVersion: _tokenVersion,
    passwordChangedAt: _passwordChangedAt,
    failedLoginCount: _failedLoginCount,
    lastFailedLoginAt: _lastFailedLoginAt,
    lockedUntil: _lockedUntil,
    lastLoginAt: _lastLoginAt,
    ...rest
  } = user as any;
  const createdAt =
    rest.createdAt instanceof Date ? rest.createdAt.toISOString() : rest.createdAt;

  return {
    ...rest,
    createdAt,
    entitlements,
  } as AuthUser;
}

export async function grantCourseEntitlementByEmail(
  input: GrantCourseEntitlementInput
): Promise<GrantCourseEntitlementResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("MISSING_EMAIL");
  if (!isCourseEntitlement(input.entitlement)) throw new Error("INVALID_ENTITLEMENT");

  let createdUser = false;
  let user =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getUserByEmailPg(email)
      : getUserByEmail(email);

  if (!user) {
    createdUser = true;
    user = await createInvitedCourseUser(email, input.name);
  }

  const now = new Date().toISOString();
  const existing =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getCourseEntitlementByUserAndTypePg((user as any).id, input.entitlement)
      : getCourseEntitlementByUserAndType((user as any).id, input.entitlement);

  const record: CourseEntitlementRecord = {
    id: existing?.id || crypto.randomUUID(),
    userId: (user as any).id,
    email,
    product: "newmersive_robot_lab",
    entitlement: input.entitlement,
    source: input.source || "manual",
    metadata: input.metadata || null,
    expiresAt: input.expiresAt || existing?.expiresAt || null,
    revokedAt: null,
    grantedAt: existing?.grantedAt || now,
    updatedAt: now,
  };

  if (ENV.STORAGE_DRIVER === "postgres") await upsertCourseEntitlementPg(record);
  else upsertCourseEntitlement(record);

  const entitlements = await getUserCourseEntitlements((user as any).id);
  return {
    user: toEntitledAuthUser(user as User, entitlements),
    entitlements,
    entitlement: input.entitlement,
    createdUser,
  };
}

export async function revokeCourseEntitlement(userId: string, entitlement: CourseEntitlement) {
  if (!isCourseEntitlement(entitlement)) throw new Error("INVALID_ENTITLEMENT");
  const existing = ENV.STORAGE_DRIVER === "postgres"
    ? await getCourseEntitlementByUserAndTypePg(userId, entitlement)
    : getCourseEntitlementByUserAndType(userId, entitlement);
  if (!existing) throw new Error("ENTITLEMENT_NOT_FOUND");

  const record: CourseEntitlementRecord = {
    ...existing,
    revokedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (ENV.STORAGE_DRIVER === "postgres") await upsertCourseEntitlementPg(record);
  else upsertCourseEntitlement(record);
  return record;
}

async function createInvitedCourseUser(email: string, name?: string) {
  const passwordHash = await bcrypt.hash(
    `invited-${crypto.randomUUID()}-${Date.now()}`,
    10
  );

  const user: User = {
    id: crypto.randomUUID(),
    name: name?.trim() || email.split("@")[0] || "Alumno Newmersive",
    email,
    passwordHash,
    role: "buyer",
    createdAt: new Date().toISOString(),
    tokens: 0,
    allwainBalance: 0,
  };

  if (ENV.STORAGE_DRIVER === "postgres") return upsertUserPg(user);
  return upsertUser(user);
}
