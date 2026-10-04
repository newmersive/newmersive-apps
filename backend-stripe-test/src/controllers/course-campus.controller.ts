import fs from "fs";
import path from "path";
import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ENV } from "../config/env";
import { COURSE_COOKIE } from "../middleware/course-auth.middleware";
import { AuthUser, CourseEntitlement } from "../shared/types";
import {
  getUserProfile,
  loginUser,
  logoutAuthSession,
} from "../services/auth.service";
import {
  acceptCourseConsents,
  allowedCourseModules,
  createCourseSubmission,
  getCourseAdminDashboard,
  getCourseSnapshot,
  getCourseSubmission,
  hashCourseIp,
  recordCourseAudit,
  reviewCourseSubmission,
  saveCourseProgress,
} from "../services/course-campus.service";
import {
  grantCourseEntitlementByEmail,
  isCourseEntitlement,
  revokeCourseEntitlement,
} from "../services/course-entitlements.service";
import { sendCourseSubmissionStatusEmail, sendCourseWelcomeEmail } from "../services/course-mailer.service";
import {
  COURSE_UPLOAD_EXTENSIONS,
  inspectCourseUpload,
  readCourseTextPreview,
  validateCourseUploadMetadata,
} from "../security/course-upload-security";

fs.mkdirSync(ENV.COURSE_UPLOAD_DIR, { recursive: true, mode: 0o750 });

export const courseUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, ENV.COURSE_UPLOAD_DIR),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { files: 1, fileSize: ENV.COURSE_MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, callback) => {
    try {
      validateCourseUploadMetadata(file.originalname, file.mimetype);
      callback(null, true);
    } catch (error) {
      callback(error as Error);
    }
  },
});

export function courseUploadSingle(req: Request, res: Response, next: NextFunction) {
  courseUpload.single("file")(req, res, (error: any) => {
    if (!error) return next();
    const status = error?.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: error?.message || "UPLOAD_FAILED" });
  });
}

function user(req: Request) {
  return (req as any).user as AuthUser;
}

function hasCampusAccess(current: AuthUser) {
  return Boolean(current.entitlements?.some((item) => item.startsWith("course_") || item === "mentoring_premium" || item === "admin_course"));
}

function clientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  return typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.ip;
}

export async function postCourseSession(req: Request, res: Response) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ error: "MISSING_CREDENTIALS" });
    const result = await loginUser(email, password, {
      sourceApp: "course",
      ip: clientIp(req),
      userAgent: req.get("user-agent"),
    });
    if (!hasCampusAccess(result.user)) return res.status(403).json({ error: "COURSE_ENTITLEMENT_REQUIRED" });

    res.cookie(COURSE_COOKIE, result.token, {
      httpOnly: true,
      secure: ENV.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(60_000, new Date(result.accessTokenExpiresAt).getTime() - Date.now()),
    });
    await recordCourseAudit({ actorUserId: result.user.id, targetUserId: result.user.id, action: "course.session.login", ipHash: hashCourseIp(clientIp(req)) });
    return res.status(200).json(await getCourseSnapshot(result.user));
  } catch {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }
}

export async function deleteCourseSession(req: Request, res: Response) {
  const current = user(req);
  res.clearCookie(COURSE_COOKIE, { httpOnly: true, secure: ENV.NODE_ENV === "production", sameSite: "lax", path: "/" });
  const sessionId = String((current as any)?.sessionId || "");
  if (current?.id && sessionId) {
    await logoutAuthSession(current.id, sessionId);
  }
  await recordCourseAudit({ actorUserId: current?.id, targetUserId: current?.id, action: "course.session.logout", ipHash: hashCourseIp(clientIp(req)) });
  return res.status(200).json({ ok: true });
}

export async function getCourseState(req: Request, res: Response) {
  const current = user(req);
  if (!hasCampusAccess(current)) return res.status(403).json({ error: "COURSE_ENTITLEMENT_REQUIRED" });
  return res.status(200).json(await getCourseSnapshot(current));
}

export async function postCourseConsent(req: Request, res: Response) {
  const current = user(req);
  const types = Array.isArray(req.body?.types) ? req.body.types.map(String) : [];
  try {
    const consents = await acceptCourseConsents(current.id, types, hashCourseIp(clientIp(req)));
    await recordCourseAudit({ actorUserId: current.id, targetUserId: current.id, action: "course.legal.accepted", metadata: { version: ENV.COURSE_REQUIRED_LEGAL_VERSION, types }, ipHash: hashCourseIp(clientIp(req)) });
    return res.status(200).json({ ok: true, consents, version: ENV.COURSE_REQUIRED_LEGAL_VERSION });
  } catch (error: unknown) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "INVALID_CONSENT" });
  }
}

export async function patchCourseProgress(req: Request, res: Response) {
  const current = user(req);
  try {
    if (!allowedCourseModules(current).includes(Number(req.params.moduleId))) return res.status(403).json({ error: "COURSE_PLAN_UPGRADE_REQUIRED" });
    const progress = await saveCourseProgress(current.id, { ...req.body, moduleId: req.params.moduleId });
    await recordCourseAudit({ actorUserId: current.id, targetUserId: current.id, action: "course.progress.updated", metadata: { moduleId: progress.moduleId, status: progress.status, percent: progress.percent } });
    return res.status(200).json({ ok: true, progress });
  } catch (error: unknown) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "INVALID_PROGRESS" });
  }
}

export async function postCourseSubmission(req: Request, res: Response) {
  const current = user(req);
  const upload = (req as any).file as Express.Multer.File | undefined;
  try {
    if (!allowedCourseModules(current).includes(Number(req.body?.moduleId))) {
      if (upload?.path) await fs.promises.unlink(upload.path).catch(() => undefined);
      return res.status(403).json({ error: "COURSE_PLAN_UPGRADE_REQUIRED" });
    }
    const inspection = upload
      ? await inspectCourseUpload({
          filePath: upload.path,
          originalName: upload.originalname,
          declaredMimeType: upload.mimetype,
          reportedSize: upload.size,
        })
      : null;
    let textContent = String(req.body?.textContent || "").trim();
    if (
      !textContent &&
      upload &&
      inspection?.textEncoding &&
      COURSE_UPLOAD_EXTENSIONS.has(inspection.extension)
    ) {
      textContent = await readCourseTextPreview(upload.path, inspection.textEncoding);
    }
    const submission = await createCourseSubmission({
      userId: current.id,
      moduleId: req.body?.moduleId,
      artifactType: req.body?.artifactType,
      fileName: inspection?.displayName || null,
      storedName: upload?.filename || null,
      mimeType: inspection?.detectedMimeType || null,
      sizeBytes: upload?.size || null,
      textContent,
    });
    await recordCourseAudit({ actorUserId: current.id, targetUserId: current.id, action: "course.submission.created", metadata: { submissionId: submission.id, moduleId: submission.moduleId, artifactType: submission.artifactType } });
    return res.status(201).json({ ok: true, submission });
  } catch (error: unknown) {
    if (upload?.path) await fs.promises.unlink(upload.path).catch(() => undefined);
    return res.status(400).json({ error: error instanceof Error ? error.message : "SUBMISSION_FAILED" });
  }
}

export async function downloadCourseSubmission(req: Request, res: Response) {
  const current = user(req);
  const submission = await getCourseSubmission(req.params.id);
  const isAdmin = current.role === "admin" || current.entitlements?.includes("admin_course");
  if (!submission || (submission.userId !== current.id && !isAdmin)) return res.status(404).json({ error: "SUBMISSION_NOT_FOUND" });
  if (!submission.storedName) return res.status(404).json({ error: "SUBMISSION_FILE_NOT_FOUND" });
  const target = path.resolve(ENV.COURSE_UPLOAD_DIR, submission.storedName);
  const uploadRoot = path.resolve(ENV.COURSE_UPLOAD_DIR) + path.sep;
  if (!target.startsWith(uploadRoot)) return res.status(400).json({ error: "INVALID_FILE" });
  const stat = await fs.promises.lstat(target).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    return res.status(404).json({ error: "SUBMISSION_FILE_NOT_FOUND" });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  return res.download(target, submission.fileName || "entrega", {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function getCourseAdmin(req: Request, res: Response) {
  return res.status(200).json(await getCourseAdminDashboard());
}

export async function postCourseAdminGrant(req: Request, res: Response) {
  const current = user(req);
  const entitlement = req.body?.entitlement as CourseEntitlement;
  if (!isCourseEntitlement(entitlement)) return res.status(400).json({ error: "INVALID_ENTITLEMENT" });
  try {
    const result = await grantCourseEntitlementByEmail({
      email: String(req.body?.email || ""),
      name: req.body?.name,
      entitlement,
      source: req.body?.source === "demo" ? "demo" : "admin",
      expiresAt: req.body?.expiresAt || null,
      metadata: { granted_by: current.id, note: String(req.body?.note || "").slice(0, 500) },
    });
    await recordCourseAudit({ actorUserId: current.id, targetUserId: result.user.id, action: "course.entitlement.granted", metadata: { entitlement, expiresAt: req.body?.expiresAt || null } });
    await sendCourseWelcomeEmail({ userId: result.user.id, email: result.user.email, entitlement });
    return res.status(200).json({ ok: true, ...result });
  } catch (error: unknown) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "GRANT_FAILED" });
  }
}

export async function postCourseAdminRevoke(req: Request, res: Response) {
  const current = user(req);
  const entitlement = req.body?.entitlement as CourseEntitlement;
  try {
    const revoked = await revokeCourseEntitlement(req.params.userId, entitlement);
    await recordCourseAudit({ actorUserId: current.id, targetUserId: req.params.userId, action: "course.entitlement.revoked", metadata: { entitlement } });
    return res.status(200).json({ ok: true, revoked });
  } catch (error: unknown) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "REVOKE_FAILED" });
  }
}

export async function patchCourseAdminSubmission(req: Request, res: Response) {
  const current = user(req);
  try {
    const submission = await reviewCourseSubmission(req.params.id, req.body || {}, current.id);
    await recordCourseAudit({ actorUserId: current.id, targetUserId: submission.userId, action: "course.submission.reviewed", metadata: { submissionId: submission.id, status: submission.status } });
    const student = await getUserProfile(submission.userId);
    if (student?.email) await sendCourseSubmissionStatusEmail({ userId: submission.userId, email: student.email, status: submission.status, notes: submission.adminNotes || undefined });
    return res.status(200).json({ ok: true, submission });
  } catch (error: unknown) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "REVIEW_FAILED" });
  }
}
