import type { NextFunction, Response } from "express";

import { ENV } from "../config/env";
import type { AuthRequest } from "./auth.middleware";

type RateBucket = {
  count: number;
  resetAt: number;
};

type OperationRateLimitOptions = {
  scope: string;
  maxRequests: number;
  windowMs: number;
  errorCode: string;
  ipMultiplier?: number;
};

const buckets = new Map<string, RateBucket>();

function positiveInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function consumeOperationQuota(
  key: string,
  maxRequests: number,
  windowMs: number,
  now = Date.now(),
) {
  const limit = positiveInteger(maxRequests, 1);
  const duration = positiveInteger(windowMs, 60_000);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + duration };
    buckets.set(key, bucket);
    return { allowed: true, remaining: limit - 1, resetAt: bucket.resetAt };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

export function clearOperationRateLimitsForTests() {
  if (ENV.NODE_ENV === "test") buckets.clear();
}

export function createOperationRateLimit(options: OperationRateLimitOptions) {
  const maxRequests = positiveInteger(options.maxRequests, 60);
  const windowMs = positiveInteger(options.windowMs, 60 * 60_000);
  const ipLimit = maxRequests * positiveInteger(options.ipMultiplier || 5, 5);

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const now = Date.now();
    const userQuota = consumeOperationQuota(
      `${options.scope}:user:${userId}`,
      maxRequests,
      windowMs,
      now,
    );
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const ipQuota = consumeOperationQuota(
      `${options.scope}:ip:${ip}`,
      ipLimit,
      windowMs,
      now,
    );
    const resetAt = Math.max(userQuota.resetAt, ipQuota.resetAt);

    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader(
      "RateLimit-Remaining",
      String(Math.min(userQuota.remaining, ipQuota.remaining)),
    );
    res.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1_000)));

    if (!userQuota.allowed || !ipQuota.allowed) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt - now) / 1_000))));
      return res.status(429).json({ error: options.errorCode });
    }
    return next();
  };
}

export const allwainAiRateLimit = createOperationRateLimit({
  scope: "allwain-ai",
  maxRequests: ENV.ALLWAIN_AI_RATE_LIMIT_MAX_REQUESTS,
  windowMs: ENV.ALLWAIN_AI_RATE_LIMIT_WINDOW_MS,
  errorCode: "ALLWAIN_AI_RATE_LIMITED",
});

export const allwainOcrRateLimit = createOperationRateLimit({
  scope: "allwain-ocr",
  maxRequests: ENV.ALLWAIN_OCR_RATE_LIMIT_MAX_REQUESTS,
  windowMs: ENV.ALLWAIN_OCR_RATE_LIMIT_WINDOW_MS,
  errorCode: "ALLWAIN_OCR_RATE_LIMITED",
});

export const trueqiaAiRateLimit = createOperationRateLimit({
  scope: "trueqia-ai",
  maxRequests: ENV.TRUEQIA_AI_RATE_LIMIT_MAX_REQUESTS,
  windowMs: ENV.TRUEQIA_AI_RATE_LIMIT_WINDOW_MS,
  errorCode: "TRUEQIA_AI_RATE_LIMITED",
});

export const demoAiRateLimit = createOperationRateLimit({
  scope: "demo-ai",
  maxRequests: ENV.DEMO_AI_RATE_LIMIT_MAX_REQUESTS,
  windowMs: ENV.DEMO_AI_RATE_LIMIT_WINDOW_MS,
  errorCode: "DEMO_AI_RATE_LIMITED",
});

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();
