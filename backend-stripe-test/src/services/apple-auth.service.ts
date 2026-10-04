import crypto from "crypto";
import jwt, { JwtPayload } from "jsonwebtoken";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { fetchBoundedJson } from "../security/external-http";

export type AppleSourceApp = "allwain" | "trueqia";

type AppleJwk = crypto.JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

export type VerifiedAppleIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
  audience: string;
};

type MemoryChallenge = {
  sourceApp: AppleSourceApp;
  expiresAt: number;
  consumedAt?: number;
};

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = `${APPLE_ISSUER}/auth/keys`;
const CHALLENGE_TTL_MS = 5 * 60_000;
const JWKS_CACHE_TTL_MS = 60 * 60_000;
const memoryChallenges = new Map<string, MemoryChallenge>();

let keyCache = new Map<string, crypto.KeyObject>();
let keyCacheFetchedAt = 0;

function appleClientId(sourceApp: AppleSourceApp) {
  return sourceApp === "trueqia"
    ? ENV.APPLE_AUTH_TRUEQIA_CLIENT_ID
    : ENV.APPLE_AUTH_ALLWAIN_CLIENT_ID;
}

function challengeHash(nonce: string) {
  return crypto.createHash("sha256").update(nonce).digest("hex");
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function booleanClaim(value: unknown) {
  return value === true || String(value).toLowerCase() === "true";
}

async function refreshAppleKeys() {
  let response: Response;
  let body: { keys?: AppleJwk[] } | null;
  try {
    ({ response, data: body } = await fetchBoundedJson<{ keys?: AppleJwk[] }>(
      APPLE_JWKS_URL,
      { headers: { Accept: "application/json" } },
      { service: "APPLE_JWKS", timeoutMs: 5_000, maxResponseBytes: 512_000 },
    ));
  } catch {
    throw new Error("APPLE_KEYS_UNAVAILABLE");
  }
  if (!response.ok) throw new Error("APPLE_KEYS_UNAVAILABLE");

  const next = new Map<string, crypto.KeyObject>();
  for (const jwk of body?.keys || []) {
    if (!jwk.kid || jwk.kty !== "RSA") continue;
    if (jwk.alg && jwk.alg !== "RS256") continue;
    try {
      next.set(
        jwk.kid,
        crypto.createPublicKey({ key: jwk, format: "jwk" }),
      );
    } catch {
      // Ignore malformed keys and reject if no matching valid key remains.
    }
  }
  if (!next.size) throw new Error("APPLE_KEYS_UNAVAILABLE");
  keyCache = next;
  keyCacheFetchedAt = Date.now();
}

async function getApplePublicKey(kid: string) {
  const cacheFresh = Date.now() - keyCacheFetchedAt < JWKS_CACHE_TTL_MS;
  if (!cacheFresh || !keyCache.has(kid)) await refreshAppleKeys();
  const key = keyCache.get(kid);
  if (!key) throw new Error("INVALID_APPLE_TOKEN");
  return key;
}

async function consumeChallenge(
  nonce: string,
  sourceApp: AppleSourceApp,
) {
  const hash = challengeHash(nonce);
  const now = Date.now();

  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    const result = await prisma.authLoginChallenge.updateMany({
      where: {
        provider: "apple",
        challengeHash: hash,
        sourceApp,
        consumedAt: null,
        expiresAt: { gt: new Date(now) },
      },
      data: { consumedAt: new Date(now) },
    });
    if (result.count !== 1) throw new Error("INVALID_APPLE_CHALLENGE");
    return;
  }

  const challenge = memoryChallenges.get(hash);
  if (
    !challenge ||
    challenge.sourceApp !== sourceApp ||
    challenge.consumedAt ||
    challenge.expiresAt <= now
  ) {
    throw new Error("INVALID_APPLE_CHALLENGE");
  }
  challenge.consumedAt = now;
}

export async function createAppleLoginChallenge(sourceApp: AppleSourceApp) {
  if (!appleClientId(sourceApp)) throw new Error("APPLE_AUTH_NOT_CONFIGURED");

  const nonce = crypto.randomBytes(32).toString("base64url");
  const hash = challengeHash(nonce);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  if (ENV.STORAGE_DRIVER === "postgres") {
    const prisma = getPrisma() as any;
    await prisma.authLoginChallenge.create({
      data: {
        provider: "apple",
        challengeHash: hash,
        sourceApp,
        expiresAt,
      },
    });
    await prisma.authLoginChallenge.deleteMany({
      where: {
        expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) },
      },
    });
  } else {
    memoryChallenges.set(hash, {
      sourceApp,
      expiresAt: expiresAt.getTime(),
    });
    for (const [storedHash, challenge] of memoryChallenges) {
      if (challenge.expiresAt < Date.now() - 60_000) {
        memoryChallenges.delete(storedHash);
      }
    }
  }

  return { nonce, expiresAt: expiresAt.toISOString() };
}

export async function verifyAppleIdentity(input: {
  idToken: string;
  nonce: string;
  sourceApp: AppleSourceApp;
}): Promise<VerifiedAppleIdentity> {
  const expectedAudience = appleClientId(input.sourceApp);
  if (!expectedAudience) throw new Error("APPLE_AUTH_NOT_CONFIGURED");
  if (!input.idToken || !input.nonce) throw new Error("INVALID_APPLE_TOKEN");

  const decoded = jwt.decode(input.idToken, { complete: true });
  if (
    !decoded ||
    typeof decoded === "string" ||
    decoded.header.alg !== "RS256" ||
    typeof decoded.header.kid !== "string"
  ) {
    throw new Error("INVALID_APPLE_TOKEN");
  }

  const publicKey = await getApplePublicKey(decoded.header.kid);
  let payload: JwtPayload;
  try {
    payload = jwt.verify(input.idToken, publicKey, {
      algorithms: ["RS256"],
      issuer: APPLE_ISSUER,
      audience: expectedAudience,
    }) as JwtPayload;
  } catch {
    throw new Error("INVALID_APPLE_TOKEN");
  }

  const subject = String(payload.sub || "");
  const tokenNonce = String(payload.nonce || "");
  if (!subject || !tokenNonce || !secureEqual(tokenNonce, input.nonce)) {
    throw new Error("INVALID_APPLE_TOKEN");
  }

  await consumeChallenge(input.nonce, input.sourceApp);

  return {
    subject,
    email: String(payload.email || "").trim().toLowerCase(),
    emailVerified: booleanClaim(payload.email_verified),
    isPrivateEmail: booleanClaim(payload.is_private_email),
    audience: expectedAudience,
  };
}
