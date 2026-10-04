import crypto from "node:crypto";
import { Secret, TOTP } from "otpauth";

export function mfaKey(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("ADMIN_MFA_NOT_CONFIGURED");
  return Buffer.from(value, "hex");
}

export function encryptMfaSecret(secret: string, userId: string, key: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", mfaKey(key), iv);
  cipher.setAAD(Buffer.from(`allwain:admin-mfa:v1:${userId}`));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMfaSecret(value: string, userId: string, key: string) {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra) throw new Error("ADMIN_MFA_SECRET_INVALID");
  const cipher = crypto.createDecipheriv("aes-256-gcm", mfaKey(key), Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(`allwain:admin-mfa:v1:${userId}`));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(encrypted, "base64url")), cipher.final()]).toString("utf8");
}

export function adminTotp(secret: string, label = "Administrador") {
  return new TOTP({ issuer: "Allwain", label, algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) });
}

export function newMfaSecret() { return new Secret({ size: 32 }).base32; }

export function validMfaStep(secret: string, code: unknown, lastUsedStep: number, now = Date.now()) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return null;
  const delta = adminTotp(secret).validate({ token: code, timestamp: now, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(now / 30_000) + delta;
  return step > lastUsedStep ? step : null;
}

export function recoveryHash(userId: string, code: string) {
  return crypto.createHash("sha256").update(`allwain:admin-recovery:v1:${userId}:${code}`).digest("hex");
}

export function newRecoveryCodes(userId: string) {
  const codes = Array.from({ length: 10 }, () => crypto.randomBytes(16).toString("hex"));
  return { codes, hashes: codes.map(code => recoveryHash(userId, code)) };
}
