import { Request, Response, NextFunction } from "express";
import { UserRole } from "../shared/types";
import { AuthSourceApp, resolveAccessToken } from "../services/auth-session.service";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    sessionId: string;
    sourceApp: AuthSourceApp;
  };
}

export async function authRequired(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      code: "UNAUTHORIZED",
      message: "Token requerido",
    });
  }

  const token = header.slice(7);

  try {
    const identity = await resolveAccessToken(token);
    req.user = {
      id: identity.id,
      email: identity.email,
      role: identity.role,
      sessionId: identity.sessionId,
      sourceApp: identity.sourceApp,
    };

    next();
  } catch {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      code: "INVALID_TOKEN",
      message: "Sesión expirada o inválida",
    });
  }
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      error: "FORBIDDEN",
      code: "FORBIDDEN",
      message: "Solo admin",
    });
  }

  next();
}
