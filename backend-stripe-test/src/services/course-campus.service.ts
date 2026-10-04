import crypto from "crypto";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { AuthUser, CourseEntitlement } from "../shared/types";
import { getPublicUsers, getUserProfile } from "./auth.service";
import { getUserCourseEntitlements } from "./course-entitlements.service";

const MODULE_COUNT = 14;
const STARTER_MODULES = [0, 1, 6];
const REQUIRED_CONSENTS = ["terms", "privacy", "risk"] as const;
const PROGRESS_STATUSES = ["not_started", "in_progress", "completed", "blocked"];
const SUBMISSION_STATUSES = ["submitted", "ai_reviewed", "approved", "changes_requested", "archived"];

const memory = {
  progress: new Map<string, any>(),
  submissions: [] as any[],
  messages: [] as any[],
  consents: [] as any[],
  audit: [] as any[],
  emails: [] as any[],
};

function usePostgres() {
  return ENV.STORAGE_DRIVER === "postgres";
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

function serialize<T extends Record<string, any>>(row: T) {
  const result: Record<string, any> = { ...row };
  for (const key of ["createdAt", "updatedAt", "startedAt", "completedAt", "acceptedAt", "reviewedAt", "sentAt"]) {
    if (key in result) result[key] = iso(result[key]);
  }
  return result;
}

function progressKey(userId: string, moduleId: number) {
  return `${userId}:${moduleId}`;
}

export function hashCourseIp(ip: string | undefined) {
  if (!ip) return null;
  return crypto.createHmac("sha256", ENV.COURSE_IP_HASH_SECRET).update(ip).digest("hex");
}

export function allowedCourseModules(user: AuthUser) {
  const entitlements = user.entitlements || [];
  const full = user.role === "admin" || entitlements.some((item) => ["course_professional", "mentoring_premium", "admin_course"].includes(item));
  return full ? Array.from({ length: MODULE_COUNT }, (_value, index) => index) : entitlements.includes("course_starter") ? STARTER_MODULES : [];
}

export async function hasRequiredCourseConsent(userId: string) {
  const consents = await listCourseConsents(userId);
  return REQUIRED_CONSENTS.every((type) =>
    consents.some((item: any) => item.type === type && item.version === ENV.COURSE_REQUIRED_LEGAL_VERSION)
  );
}

export async function listCourseConsents(userId: string) {
  if (!usePostgres()) return memory.consents.filter((item) => item.userId === userId).map(serialize);
  const rows = await (getPrisma() as any).courseConsent.findMany({
    where: { userId },
    orderBy: { acceptedAt: "desc" },
  });
  return rows.map(serialize);
}

export async function acceptCourseConsents(userId: string, types: string[], ipHash: string | null) {
  const accepted = REQUIRED_CONSENTS.filter((type) => types.includes(type));
  if (accepted.length !== REQUIRED_CONSENTS.length) throw new Error("ALL_CONSENTS_REQUIRED");

  if (!usePostgres()) {
    for (const type of accepted) {
      const exists = memory.consents.some((item) => item.userId === userId && item.type === type && item.version === ENV.COURSE_REQUIRED_LEGAL_VERSION);
      if (!exists) memory.consents.push({ id: crypto.randomUUID(), userId, type, version: ENV.COURSE_REQUIRED_LEGAL_VERSION, acceptedAt: new Date().toISOString(), ipHash });
    }
    return listCourseConsents(userId);
  }

  const prisma = getPrisma() as any;
  await Promise.all(accepted.map((type) => prisma.courseConsent.upsert({
    where: { userId_type_version: { userId, type, version: ENV.COURSE_REQUIRED_LEGAL_VERSION } },
    create: { userId, type, version: ENV.COURSE_REQUIRED_LEGAL_VERSION, ipHash },
    update: { ipHash },
  })));
  return listCourseConsents(userId);
}

export async function listCourseProgress(userId: string) {
  if (!usePostgres()) return Array.from(memory.progress.values()).filter((item) => item.userId === userId).map(serialize);
  const rows = await (getPrisma() as any).courseProgress.findMany({ where: { userId }, orderBy: { moduleId: "asc" } });
  return rows.map(serialize);
}

export async function saveCourseProgress(userId: string, input: Record<string, unknown>) {
  const moduleId = Number(input.moduleId);
  const lessonIndex = Math.max(0, Math.min(30, Number(input.lessonIndex || 0)));
  const status = PROGRESS_STATUSES.includes(String(input.status)) ? String(input.status) : "in_progress";
  const percent = Math.max(0, Math.min(100, Math.round(Number(input.percent || 0))));
  if (!Number.isInteger(moduleId) || moduleId < 0 || moduleId >= MODULE_COUNT) throw new Error("INVALID_MODULE");
  const now = new Date();
  const data = {
    lessonIndex,
    status,
    percent,
    studentState: input.studentState && typeof input.studentState === "object" ? input.studentState : undefined,
    startedAt: status !== "not_started" ? now : undefined,
    completedAt: status === "completed" ? now : null,
  };

  if (!usePostgres()) {
    const key = progressKey(userId, moduleId);
    const existing = memory.progress.get(key);
    const row = { id: existing?.id || crypto.randomUUID(), userId, moduleId, createdAt: existing?.createdAt || now.toISOString(), updatedAt: now.toISOString(), ...existing, ...data };
    memory.progress.set(key, row);
    return serialize(row);
  }

  const row = await (getPrisma() as any).courseProgress.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: { userId, moduleId, ...data },
    update: data,
  });
  return serialize(row);
}

export async function listCourseSubmissions(userId: string, take = 50) {
  if (!usePostgres()) return memory.submissions.filter((item) => item.userId === userId).slice(-take).reverse().map(serialize);
  const rows = await (getPrisma() as any).courseSubmission.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
  return rows.map(serialize);
}

export async function getCourseSubmission(id: string) {
  if (!usePostgres()) return memory.submissions.find((item) => item.id === id) || null;
  return (getPrisma() as any).courseSubmission.findUnique({ where: { id } });
}

export async function createCourseSubmission(input: Record<string, any>) {
  const moduleId = Number(input.moduleId);
  if (!Number.isInteger(moduleId) || moduleId < 0 || moduleId >= MODULE_COUNT) throw new Error("INVALID_MODULE");
  const rowData = {
    userId: String(input.userId),
    moduleId,
    artifactType: String(input.artifactType || "other").slice(0, 80),
    fileName: input.fileName || null,
    storedName: input.storedName || null,
    mimeType: input.mimeType || null,
    sizeBytes: input.sizeBytes || null,
    textContent: input.textContent ? String(input.textContent).slice(0, 24_000) : null,
    status: "submitted",
  };
  if (!rowData.fileName && !rowData.textContent) throw new Error("EMPTY_SUBMISSION");

  if (!usePostgres()) {
    const now = new Date().toISOString();
    const row = { id: crypto.randomUUID(), ...rowData, aiReview: null, adminNotes: null, reviewedBy: null, reviewedAt: null, createdAt: now, updatedAt: now };
    memory.submissions.push(row);
    return row;
  }
  return serialize(await (getPrisma() as any).courseSubmission.create({ data: rowData }));
}

export async function attachCourseSubmissionReview(id: string, review: Record<string, unknown>) {
  if (!usePostgres()) {
    const row = memory.submissions.find((item) => item.id === id);
    if (!row) return null;
    row.aiReview = review;
    row.status = "ai_reviewed";
    row.reviewedAt = new Date().toISOString();
    row.updatedAt = row.reviewedAt;
    return row;
  }
  return serialize(await (getPrisma() as any).courseSubmission.update({ where: { id }, data: { aiReview: review, status: "ai_reviewed", reviewedAt: new Date() } }));
}

export async function appendCourseAiMessage(input: Record<string, any>) {
  const data = { userId: String(input.userId), agent: String(input.agent).slice(0, 80), role: String(input.role), content: String(input.content).slice(0, 30_000), metadata: input.metadata || undefined };
  if (!usePostgres()) {
    const row = { id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() };
    memory.messages.push(row);
    return row;
  }
  return serialize(await (getPrisma() as any).courseAiMessage.create({ data }));
}

export async function listCourseAiMessages(userId: string, take = 20) {
  if (!usePostgres()) return memory.messages.filter((item) => item.userId === userId).slice(-take).map(serialize);
  const rows = await (getPrisma() as any).courseAiMessage.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
  return rows.reverse().map(serialize);
}

export async function countCourseAiRequestsToday(userId: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  if (!usePostgres()) return memory.messages.filter((item) => item.userId === userId && item.role === "user" && new Date(item.createdAt) >= start).length;
  return (getPrisma() as any).courseAiMessage.count({ where: { userId, role: "user", createdAt: { gte: start } } });
}

export async function getCourseSnapshot(user: AuthUser) {
  const [profile, progress, submissions, consents, messages] = await Promise.all([
    getUserProfile(user.id),
    listCourseProgress(user.id),
    listCourseSubmissions(user.id, 25),
    listCourseConsents(user.id),
    listCourseAiMessages(user.id, 12),
  ]);
  const completed = progress.filter((item: any) => item.status === "completed").length;
  return {
    user: profile || user,
    entitlements: user.entitlements || [],
    isAdmin: user.role === "admin" || user.entitlements?.includes("admin_course") || false,
    legalVersion: ENV.COURSE_REQUIRED_LEGAL_VERSION,
    allowedModules: allowedCourseModules(user),
    requiresConsent: !(await hasRequiredCourseConsent(user.id)),
    progress,
    submissions,
    messages,
    summary: {
      moduleCount: MODULE_COUNT,
      completedModules: completed,
      percent: Math.round((completed / MODULE_COUNT) * 100),
      pendingSubmissions: submissions.filter((item: any) => ["submitted", "changes_requested"].includes(item.status)).length,
    },
  };
}

export async function recordCourseAudit(input: Record<string, any>) {
  const data = { actorUserId: input.actorUserId || null, targetUserId: input.targetUserId || null, action: String(input.action).slice(0, 120), metadata: input.metadata || undefined, ipHash: input.ipHash || null };
  if (!usePostgres()) {
    const row = { id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() };
    memory.audit.push(row);
    return row;
  }
  return serialize(await (getPrisma() as any).courseAuditEvent.create({ data }));
}

export async function getCourseAdminDashboard() {
  const users = await getPublicUsers();
  const students = [] as any[];
  for (const user of users) {
    if (ENV.NODE_ENV === "production" && String(user.email || "").endsWith(".local")) continue;
    const entitlements = await getUserCourseEntitlements(user.id);
    if (!entitlements.length && user.role !== "admin") continue;
    const [progress, submissions] = await Promise.all([listCourseProgress(user.id), listCourseSubmissions(user.id, 100)]);
    students.push({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      entitlements,
      createdAt: user.createdAt,
      completedModules: progress.filter((item: any) => item.status === "completed").length,
      progressPercent: Math.round((progress.filter((item: any) => item.status === "completed").length / MODULE_COUNT) * 100),
      submissionCount: submissions.length,
      pendingSubmissions: submissions.filter((item: any) => ["submitted", "changes_requested"].includes(item.status)).length,
      lastActivityAt: progress[progress.length - 1]?.updatedAt || submissions[0]?.createdAt || user.createdAt,
    });
  }
  const submissions = usePostgres()
    ? (await (getPrisma() as any).courseSubmission.findMany({ orderBy: { createdAt: "desc" }, take: 100 })).map(serialize)
    : memory.submissions.slice(-100).reverse().map(serialize);
  const audit = usePostgres()
    ? (await (getPrisma() as any).courseAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 })).map(serialize)
    : memory.audit.slice(-50).reverse().map(serialize);
  return {
    summary: {
      students: students.length,
      activeStudents: students.filter((item) => item.entitlements.some((value: CourseEntitlement) => value.startsWith("course_"))).length,
      pendingSubmissions: submissions.filter((item: any) => ["submitted", "changes_requested"].includes(item.status)).length,
      completedModules: students.reduce((sum, item) => sum + item.completedModules, 0),
    },
    students: students.sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt))),
    submissions,
    audit,
  };
}

export async function reviewCourseSubmission(id: string, input: Record<string, unknown>, reviewerId: string) {
  const status = SUBMISSION_STATUSES.includes(String(input.status)) ? String(input.status) : "changes_requested";
  const data = { status, adminNotes: String(input.adminNotes || "").slice(0, 4000), reviewedBy: reviewerId, reviewedAt: new Date() };
  if (!usePostgres()) {
    const row = memory.submissions.find((item) => item.id === id);
    if (!row) throw new Error("SUBMISSION_NOT_FOUND");
    Object.assign(row, data, { reviewedAt: data.reviewedAt.toISOString(), updatedAt: data.reviewedAt.toISOString() });
    return row;
  }
  return serialize(await (getPrisma() as any).courseSubmission.update({ where: { id }, data }));
}

export async function recordCourseEmail(input: Record<string, any>) {
  const data = { userId: input.userId || null, email: String(input.email).toLowerCase(), template: String(input.template), status: String(input.status), provider: input.provider || null, error: input.error || null, sentAt: input.sentAt || null };
  if (!usePostgres()) {
    const row = { id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() };
    memory.emails.push(row);
    return row;
  }
  return serialize(await (getPrisma() as any).courseEmailDelivery.create({ data }));
}
