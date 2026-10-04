import { Request, Response } from "express";
import {
  grantCourseEntitlementByEmail,
  isCourseEntitlement,
} from "../services/course-entitlements.service";
import { CourseEntitlement } from "../shared/types";

export async function postGrantEntitlement(req: Request, res: Response) {
  const { email, entitlement, metadata, name, source } = req.body as {
    email?: string;
    entitlement?: CourseEntitlement;
    metadata?: Record<string, unknown> | null;
    name?: string;
    source?: "stripe" | "manual" | "admin" | "import" | "demo";
    expiresAt?: string | null;
  };

  if (!email || !entitlement) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  if (!isCourseEntitlement(entitlement)) {
    return res.status(400).json({ error: "INVALID_ENTITLEMENT" });
  }

  try {
    const result = await grantCourseEntitlementByEmail({
      email,
      entitlement,
      name,
      source,
      metadata,
      expiresAt: req.body?.expiresAt,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "INTERNAL_ERROR";
    const status = message === "INVALID_ENTITLEMENT" || message === "MISSING_EMAIL" ? 400 : 500;

    return res.status(status).json({
      error: message === "INTERNAL_ERROR" ? "INTERNAL_ERROR" : message,
    });
  }
}
