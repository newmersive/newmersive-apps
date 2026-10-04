import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { ENV } from "../config/env";

const SERVICE_TOKEN_ISSUER = "newmersive-internal";
const SERVICE_TOKEN_AUDIENCE = "newmersive-api";
const SERVICE_TOKEN_MAX_LIFETIME_SECONDS = 90;
const replayCache = new Map<string, number>();

type ServiceClaims = JwtPayload & {
  kind?: string;
  scopes?: string[];
};

function bearerToken(req: Request) {
  const authorization = String(req.headers.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function pruneReplayCache(nowSeconds: number) {
  for (const [jti, expiresAt] of replayCache) {
    if (expiresAt <= nowSeconds) replayCache.delete(jti);
  }
  if (replayCache.size <= 10_000) return;
  const oldest = [...replayCache.entries()]
    .sort((left, right) => left[1] - right[1])
    .slice(0, replayCache.size - 10_000);
  for (const [jti] of oldest) replayCache.delete(jti);
}

export function createServiceAccessToken(input: {
  service: string;
  scopes: string[];
  ttlSeconds?: number;
}) {
  const service = String(input.service || "").trim();
  const scopes = [...new Set(input.scopes.map((scope) => String(scope).trim()).filter(Boolean))];
  const ttlSeconds = Math.min(
    60,
    Math.max(10, Math.trunc(Number(input.ttlSeconds || 45))),
  );
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(service)) {
    throw new Error("INVALID_SERVICE_IDENTITY");
  }
  if (!scopes.length || scopes.some((scope) => !/^[a-z0-9][a-z0-9:._-]{2,95}$/i.test(scope))) {
    throw new Error("INVALID_SERVICE_SCOPE");
  }
  return jwt.sign(
    { kind: "service", scopes },
    ENV.SERVICE_TOKEN,
    {
      algorithm: "HS512",
      issuer: SERVICE_TOKEN_ISSUER,
      audience: SERVICE_TOKEN_AUDIENCE,
      subject: service,
      jwtid: crypto.randomUUID(),
      expiresIn: ttlSeconds,
    },
  );
}

export function serviceScopeRequired(requiredScope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return res.status(401).json({ error: "SERVICE_AUTH_REQUIRED" });
    }

    let claims: ServiceClaims;
    try {
      claims = jwt.verify(token, ENV.SERVICE_TOKEN, {
        algorithms: ["HS512"],
        issuer: SERVICE_TOKEN_ISSUER,
        audience: SERVICE_TOKEN_AUDIENCE,
        clockTolerance: 5,
        maxAge: `${SERVICE_TOKEN_MAX_LIFETIME_SECONDS}s`,
      }) as ServiceClaims;
    } catch {
      res.setHeader("WWW-Authenticate", "Bearer error=\"invalid_token\"");
      return res.status(401).json({ error: "SERVICE_AUTH_INVALID" });
    }

    const nowSeconds = Math.floor(Date.now() / 1_000);
    if (
      claims.kind !== "service" ||
      typeof claims.sub !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(claims.sub) ||
      typeof claims.jti !== "string" ||
      claims.jti.length < 16 ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number" ||
      claims.exp - claims.iat > SERVICE_TOKEN_MAX_LIFETIME_SECONDS ||
      claims.iat > nowSeconds + 5 ||
      claims.exp <= nowSeconds
    ) {
      return res.status(401).json({ error: "SERVICE_AUTH_INVALID" });
    }
    if (!Array.isArray(claims.scopes) || !claims.scopes.includes(requiredScope)) {
      return res.status(403).json({ error: "SERVICE_SCOPE_REQUIRED" });
    }

    pruneReplayCache(nowSeconds);
    if (replayCache.has(claims.jti)) {
      return res.status(401).json({ error: "SERVICE_TOKEN_REPLAYED" });
    }
    replayCache.set(claims.jti, claims.exp);
    (req as any).serviceIdentity = {
      id: claims.sub,
      scopes: claims.scopes,
      tokenId: claims.jti,
    };
    return next();
  };
}

export function clearServiceReplayCacheForTests() {
  if (ENV.NODE_ENV === "test") replayCache.clear();
}
