import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { UserRole } from "../shared/types";

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: UserRole };
}

export function authRequired(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ error: "UNAUTHORIZED" });

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, ENV.JWT_SECRET) as any;
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin")
    return res.status(403).json({ error: "FORBIDDEN" });
  next();
}