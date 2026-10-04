import { NextFunction, Request, Response } from "express";
import { getUserCourseEntitlements } from "../services/course-entitlements.service";
import { resolveAccessToken } from "../services/auth-session.service";
import { AuthUser } from "../shared/types";

export const COURSE_COOKIE = "newmersiveRobotLabToken";

function cookieValue(req: Request, name: string) {
  const pair = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : "";
}

export function courseToken(req: Request) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return cookieValue(req, COURSE_COOKIE);
}

export async function resolveCourseUser(req: Request): Promise<AuthUser | undefined> {
  const token = courseToken(req);
  if (!token) return undefined;
  const identity = await resolveAccessToken(token);
  const entitlements = await getUserCourseEntitlements(identity.id);
  return {
    id: identity.id,
    name: identity.name,
    email: identity.email,
    role: identity.role,
    createdAt: identity.createdAt,
    entitlements,
    sessionId: identity.sessionId,
    sourceApp: identity.sourceApp,
  } as AuthUser;
}

export async function courseAuthRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolveCourseUser(req);
    if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
    (req as any).user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
}

export async function courseAdminRequired(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthUser | undefined;
  const allowed = user?.role === "admin" || user?.entitlements?.includes("admin_course");
  if (!allowed) return res.status(403).json({ error: "COURSE_ADMIN_REQUIRED" });
  return next();
}
