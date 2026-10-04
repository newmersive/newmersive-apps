import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import type { ServeStaticOptions } from "serve-static";
import { ENV } from "./config/env";
import apiRouter from "./routes";
import { closePrisma } from "./db/prisma";
import crypto from "crypto";
import {
  runAllwainPaymentMaintenance,
  runScheduledAllwainReconciliation,
} from "./services/allwain-payments.service";
import { flushQueuedAllwainEmails } from "./services/allwain-mailer.service";
import { syncAllwainSupportInbox } from "./services/allwain-support.service";

export const app = express();
app.disable("x-powered-by");

function requestIdFromHeader(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    typeof candidate === "string" &&
    candidate.length >= 8 &&
    candidate.length <= 100 &&
    /^[A-Za-z0-9._:-]+$/.test(candidate)
  ) {
    return candidate;
  }
  return crypto.randomUUID();
}

app.use((req, res, next) => {
  const requestId = requestIdFromHeader(req.headers["x-request-id"]);
  const startedAt = Date.now();
  (req as any).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  res.on("finish", () => {
    console.log(JSON.stringify({
      type: "http_request",
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });
  next();
});

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();
const sensitiveRateBuckets = new Map<string, RateBucket>();

function getClientIp(req: express.Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === "/api/health") return next();

  const windowMs = Number.isFinite(ENV.RATE_LIMIT_WINDOW_MS)
    ? Math.max(1_000, ENV.RATE_LIMIT_WINDOW_MS)
    : 60_000;
  const maxRequests = Number.isFinite(ENV.RATE_LIMIT_MAX_REQUESTS)
    ? Math.max(10, ENV.RATE_LIMIT_MAX_REQUESTS)
    : 180;
  const now = Date.now();
  const key = getClientIp(req);
  const current = rateBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  current.count += 1;
  if (current.count > maxRequests) {
    res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
    res.status(429).json({ error: "RATE_LIMITED" });
    return;
  }

  next();
}

function sensitiveRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (ENV.NODE_ENV === "test") return next();
  const protectedPaths = new Set([
    "/api/auth/register",
    "/api/noa/community/auth/register",
    "/api/noa/community/auth/login",
    "/api/noa/community/auth/google",
    "/api/auth/login",
    "/api/auth/google",
    "/api/auth/apple/challenge",
    "/api/auth/apple",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/entitlements/grant",
    "/api/course/robot-lab/session",
    "/api/course/robot-lab/checkout",
  ]);
  if (!protectedPaths.has(req.path)) return next();
  const now = Date.now();
  const key = `${getClientIp(req)}:${req.path}`;
  const current = sensitiveRateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    sensitiveRateBuckets.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return next();
  }
  current.count += 1;
  if (current.count > 12) {
    res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1_000));
    return res.status(429).json({ error: "AUTH_RATE_LIMITED" });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  for (const [key, bucket] of sensitiveRateBuckets) {
    if (bucket.resetAt <= now) sensitiveRateBuckets.delete(key);
  }
}, 60_000).unref();

/* =========================
   CORS allowlist
========================= */
app.use(
  cors({
    credentials: true,
    origin: (origin: any, callback: any) => {
      // Permite requests sin origin (curl/healthchecks)
      if (!origin) return callback(null, true);

      if (ENV.ALLOWED_ORIGINS.includes(String(origin)) || (process.env.NOA_COMMUNITY_ENABLED === "true" && ["https://newmersive.es", "https://www.newmersive.es"].includes(String(origin)))) {
        return callback(null, true);
      }

      return callback(new Error("CORS_NOT_ALLOWED"));
    },
  })
);

app.set("trust proxy", 1);
app.use(rateLimit);
app.use(sensitiveRateLimit);
const allwainCardImageDir = path.resolve(
  process.cwd(),
  "assets/allwain-card-images",
);
fs.mkdirSync(path.resolve(ENV.ALLWAIN_PUBLICATION_IMAGE_DIR), {
  recursive: true,
  mode: 0o750,
});
const allwainImageStaticOptions: ServeStaticOptions = {
  dotfiles: "deny",
  index: false,
  maxAge: "30d",
  immutable: true,
  setHeaders: (res) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
  },
};
app.use(
  "/api/allwain/media/card-images",
  express.static(allwainCardImageDir, allwainImageStaticOptions),
);
app.use(express.json({
  limit: ENV.JSON_BODY_LIMIT,
  verify: (req, _res, buffer) => {
    const originalUrl = String((req as any).originalUrl || "");
    if (
       originalUrl.startsWith("/api/course/robot-lab/stripe/webhook") ||
       originalUrl.startsWith("/api/allwain/payments/webhook") ||
       originalUrl.startsWith("/api/allwain/shipping/webhook")
    ) {
      (req as any).rawBody = Buffer.from(buffer);
    }
  },
}));

app.use("/api", apiRouter);

// Global error handler
app.use((err: any, req: any, res: any, _next: any) => {
  const invalidJson = err?.type === "entity.parse.failed";
  const payloadTooLarge = err?.type === "entity.too.large";
  const corsRejected = err?.message === "CORS_NOT_ALLOWED";
  const status =
    corsRejected
      ? 403
      : invalidJson
        ? 400
      : payloadTooLarge
        ? 413
        : 500;

  if (status >= 500) {
    console.error("UNHANDLED_EXPRESS_ERROR", {
      requestId: req?.requestId,
      method: req?.method,
      path: req?.path,
      error: err,
    });
  }

  res.status(status).json({
    error: corsRejected
      ? "CORS_NOT_ALLOWED"
      : invalidJson
      ? "INVALID_JSON"
      : payloadTooLarge
        ? "PAYLOAD_TOO_LARGE"
        : "INTERNAL_ERROR",
    detail: ENV.NODE_ENV === "development" ? String(err?.message || err) : undefined,
  });
});

const server =
  ENV.NODE_ENV !== "test"
    ? app.listen(ENV.PORT, ENV.HOST, () =>
        console.log(`API OK on ${ENV.HOST}:${ENV.PORT}`),
      )
    : null;

const paymentMaintenanceTimer = server
  ? setInterval(() => {
      void runAllwainPaymentMaintenance().catch((error) =>
        console.error("ALLWAIN_PAYMENT_MAINTENANCE_ERROR", error),
      );
      void flushQueuedAllwainEmails().catch((error) =>
        console.error("ALLWAIN_EMAIL_MAINTENANCE_ERROR", error),
      );
    }, ENV.ALLWAIN_MAINTENANCE_INTERVAL_MS)
  : null;
paymentMaintenanceTimer?.unref();
const reconciliationTimer = server
  ? setInterval(() => {
      void runScheduledAllwainReconciliation().catch((error) =>
        console.error("ALLWAIN_RECONCILIATION_MAINTENANCE_ERROR", error),
      );
    }, Math.max(60 * 60 * 1_000, ENV.ALLWAIN_RECONCILIATION_INTERVAL_MS))
  : null;
reconciliationTimer?.unref();
const supportInboxTimer = server
  ? setInterval(() => {
      void syncAllwainSupportInbox().catch((error) =>
        console.error("ALLWAIN_SUPPORT_INBOX_MAINTENANCE_ERROR", error),
      );
    }, Math.max(60_000, ENV.ALLWAIN_SUPPORT_POLL_INTERVAL_MS))
  : null;
supportInboxTimer?.unref();
if (server) {
  void runAllwainPaymentMaintenance().catch((error) =>
    console.error("ALLWAIN_PAYMENT_MAINTENANCE_START_ERROR", error),
  );
  void flushQueuedAllwainEmails().catch((error) =>
    console.error("ALLWAIN_EMAIL_MAINTENANCE_START_ERROR", error),
  );
  void runScheduledAllwainReconciliation().catch((error) =>
    console.error("ALLWAIN_RECONCILIATION_START_ERROR", error),
  );
  void syncAllwainSupportInbox().catch((error) =>
    console.error("ALLWAIN_SUPPORT_INBOX_START_ERROR", error),
  );
}

async function shutdown(signal: string) {
  console.log(`Shutting down (${signal})...`);
  if (paymentMaintenanceTimer) clearInterval(paymentMaintenanceTimer);
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  if (supportInboxTimer) clearInterval(supportInboxTimer);
  try {
    await closePrisma();
  } catch (e) {
    console.error("closePrisma error:", e);
  }

  if (server) server.close(() => process.exit(0));
  else process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
