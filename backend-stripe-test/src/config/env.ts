import dotenv from "dotenv";
dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";

function secret(name: string, developmentFallback: string): string {
  const value = process.env[name]?.trim();
  if (value && value.length >= 32) return value;
  if (nodeEnv === "production") {
    throw new Error(`${name}_MISSING_OR_WEAK`);
  }
  return value || developmentFallback;
}

function port(): number {
  const value = Number(process.env.PORT || 4_000);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("PORT_INVALID");
  }
  return value;
}

const jwtSecret = secret(
  "JWT_SECRET",
  "local-jwt-secret-not-for-production-0001",
);
const serviceToken = secret(
  "SERVICE_TOKEN",
  "local-service-token-not-for-production-01",
);
const auditHmacSecret = secret(
  "ALLWAIN_AUDIT_HMAC_SECRET",
  "local-audit-secret-not-for-production-001",
);
const courseIpHashSecret = secret(
  "COURSE_IP_HASH_SECRET",
  "local-ip-hash-secret-not-for-production-01",
);

if (nodeEnv === "production") {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_MISSING");
  if ((process.env.STORAGE_DRIVER || "postgres") !== "postgres") {
    throw new Error("PRODUCTION_STORAGE_MUST_BE_POSTGRES");
  }
  if (auditHmacSecret === jwtSecret || courseIpHashSecret === jwtSecret) {
    throw new Error("PRODUCTION_SECRETS_MUST_BE_INDEPENDENT");
  }
}

function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) {
    return [
      "http://localhost:3000",
      "http://localhost:19006",
      "http://localhost:19007",
      "http://localhost:19000",
    ];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCsv(value?: string): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function allwainLegalReleaseScope() {
  const value = String(process.env.ALLWAIN_LEGAL_RELEASE_SCOPE || "none")
    .trim()
    .toLowerCase();
  if (!new Set(["none", "test", "live"]).has(value)) {
    throw new Error("ALLWAIN_LEGAL_RELEASE_SCOPE_INVALID");
  }
  return value as "none" | "test" | "live";
}

function allwainStripeTestCheckoutRequested() {
  const raw = process.env.ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED?.trim().toLowerCase();
  if (raw) {
    if (!new Set(["true", "false"]).has(raw)) {
      throw new Error("ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED_INVALID");
    }
    return raw === "true";
  }

  // This release was explicitly requested to expose Stripe's TEST checkout on
  // the official hosted app. Existing production environments do not yet have
  // the new flag in their root-owned env file, so this exact public topology is
  // the narrow, reversible default. Any explicit `false` disables it, and LIVE
  // can never enter this branch.
  try {
    const appUrl = new URL(
      process.env.ALLWAIN_APP_URL || "https://allwain.es",
    );
    const apiUrl = new URL(
      process.env.ALLWAIN_API_URL || "https://api.allwain.es",
    );
    const allowedOrigins = new Set(parseAllowedOrigins());
    return (
      nodeEnv === "production" &&
      process.env.ALLWAIN_STRIPE_LIVEMODE !== "true" &&
      appUrl.origin === "https://allwain.es" &&
      ["", "/"].includes(appUrl.pathname) &&
      apiUrl.protocol === "https:" &&
      apiUrl.hostname === "api.allwain.es" &&
      ["", "/", "/api", "/api/"].includes(apiUrl.pathname) &&
      allowedOrigins.has("https://allwain.es") &&
      allowedOrigins.has("https://www.allwain.es")
    );
  } catch {
    return false;
  }
}

function allwainEmailDeliveryMode() {
  const value = String(process.env.ALLWAIN_EMAIL_DELIVERY_MODE || "disabled")
    .trim()
    .toLowerCase();
  if (!new Set(["disabled", "test", "live"]).has(value)) {
    throw new Error("ALLWAIN_EMAIL_DELIVERY_MODE_INVALID");
  }
  return value as "disabled" | "test" | "live";
}

function allwainSupportAutomationMode() {
  const value = String(
    process.env.ALLWAIN_SUPPORT_AUTOMATION_MODE || "assist",
  )
    .trim()
    .toLowerCase();
  if (!new Set(["disabled", "assist", "safe_auto"]).has(value)) {
    throw new Error("ALLWAIN_SUPPORT_AUTOMATION_MODE_INVALID");
  }
  return value as "disabled" | "assist" | "safe_auto";
}

function optionalIsoTimestamp(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error(`${name}_INVALID`);
  }
  return timestamp.toISOString();
}

function courseMalwareScanMode() {
  const value = process.env.COURSE_MALWARE_SCAN_MODE || (nodeEnv === "production" ? "required" : "disabled");
  if (!new Set(["required", "best_effort", "disabled"]).has(value)) {
    throw new Error("COURSE_MALWARE_SCAN_MODE_INVALID");
  }
  return value as "required" | "best_effort" | "disabled";
}

export const ENV = {
  PORT: port(),
  HOST: process.env.HOST || "127.0.0.1",
  JWT_SECRET: jwtSecret,
  SERVICE_TOKEN: serviceToken,
  NODE_ENV: nodeEnv,
  DEMO_MODE: process.env.DEMO_MODE === "true",
  DATA_FILE: process.env.DATA_FILE,
  SCAN_PROVIDER: process.env.SCAN_PROVIDER || "mock",
  ALLWAIN_IMAGE_MAX_BYTES: Number(process.env.ALLWAIN_IMAGE_MAX_BYTES || 6_000_000),
  ALLWAIN_IMAGE_MAX_PIXELS: Number(process.env.ALLWAIN_IMAGE_MAX_PIXELS || 24_000_000),
  ALLWAIN_IMAGE_MAX_DIMENSION: Number(process.env.ALLWAIN_IMAGE_MAX_DIMENSION || 8_192),
  ALLWAIN_SCAN_MAX_TEXT_CHARS: Number(process.env.ALLWAIN_SCAN_MAX_TEXT_CHARS || 24_000),
  GOOGLE_CLOUD_VISION_API_KEY: process.env.GOOGLE_CLOUD_VISION_API_KEY,
  GOOGLE_CLOUD_VISION_ENDPOINT:
    process.env.GOOGLE_CLOUD_VISION_ENDPOINT || "https://vision.googleapis.com/v1/images:annotate",
  GOOGLE_AUTH_CLIENT_IDS: parseCsv(
    process.env.GOOGLE_AUTH_CLIENT_IDS ||
      [
        process.env.GOOGLE_AUTH_WEB_CLIENT_ID,
        process.env.GOOGLE_AUTH_ANDROID_CLIENT_ID,
        process.env.GOOGLE_AUTH_IOS_CLIENT_ID,
      ]
        .filter(Boolean)
        .join(","),
  ),
  APPLE_AUTH_ALLWAIN_CLIENT_ID:
    process.env.APPLE_AUTH_ALLWAIN_CLIENT_ID || "es.allwain.app",
  APPLE_AUTH_TRUEQIA_CLIENT_ID:
    process.env.APPLE_AUTH_TRUEQIA_CLIENT_ID || "es.trueqia.app",
  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT || "16mb",
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  RATE_LIMIT_MAX_REQUESTS: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 180),
  ALLWAIN_AI_RATE_LIMIT_WINDOW_MS: Number(
    process.env.ALLWAIN_AI_RATE_LIMIT_WINDOW_MS || 3_600_000,
  ),
  ALLWAIN_AI_RATE_LIMIT_MAX_REQUESTS: Number(
    process.env.ALLWAIN_AI_RATE_LIMIT_MAX_REQUESTS || 120,
  ),
  ALLWAIN_OCR_RATE_LIMIT_WINDOW_MS: Number(
    process.env.ALLWAIN_OCR_RATE_LIMIT_WINDOW_MS || 3_600_000,
  ),
  ALLWAIN_OCR_RATE_LIMIT_MAX_REQUESTS: Number(
    process.env.ALLWAIN_OCR_RATE_LIMIT_MAX_REQUESTS || 180,
  ),
  TRUEQIA_AI_RATE_LIMIT_WINDOW_MS: Number(
    process.env.TRUEQIA_AI_RATE_LIMIT_WINDOW_MS || 3_600_000,
  ),
  TRUEQIA_AI_RATE_LIMIT_MAX_REQUESTS: Number(
    process.env.TRUEQIA_AI_RATE_LIMIT_MAX_REQUESTS || 120,
  ),
  DEMO_AI_RATE_LIMIT_WINDOW_MS: Number(
    process.env.DEMO_AI_RATE_LIMIT_WINDOW_MS || 3_600_000,
  ),
  DEMO_AI_RATE_LIMIT_MAX_REQUESTS: Number(
    process.env.DEMO_AI_RATE_LIMIT_MAX_REQUESTS || 120,
  ),
  AI_REQUEST_TIMEOUT_MS: Number(process.env.AI_REQUEST_TIMEOUT_MS || 30_000),
  AI_RESPONSE_MAX_BYTES: Number(process.env.AI_RESPONSE_MAX_BYTES || 1_000_000),
  GOOGLE_VISION_REQUEST_TIMEOUT_MS: Number(
    process.env.GOOGLE_VISION_REQUEST_TIMEOUT_MS || 20_000,
  ),
  GOOGLE_VISION_RESPONSE_MAX_BYTES: Number(
    process.env.GOOGLE_VISION_RESPONSE_MAX_BYTES || 5_000_000,
  ),
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || "https://newmersive.es",

  // Prisma / Postgres
  DATABASE_URL: process.env.DATABASE_URL,
  STORAGE_DRIVER: (process.env.STORAGE_DRIVER || "postgres") as "json" | "postgres",

  // Newmersive Robot Lab
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  COURSE_OPENAI_MODEL:
    process.env.COURSE_OPENAI_MODEL ||
    process.env.OPENAI_CHAT_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PRICE_STARTER: process.env.STRIPE_PRICE_STARTER,
  STRIPE_PRICE_PROFESSIONAL: process.env.STRIPE_PRICE_PROFESSIONAL,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_CONNECT_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  STRIPE_CONNECT_THIN_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_THIN_WEBHOOK_SECRET,
  STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET:
    process.env.STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET,
  ALLWAIN_PAYMENTS_ENABLED: process.env.ALLWAIN_PAYMENTS_ENABLED === "true",
  ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED:
    allwainStripeTestCheckoutRequested(),
  ALLWAIN_STRIPE_LIVEMODE:
    process.env.ALLWAIN_STRIPE_LIVEMODE === "true",
  // Explicit test override. Live payments also enforce this policy through
  // allwainPublicationCardRequired().
  ALLWAIN_PUBLICATION_CARD_REQUIRED:
    process.env.ALLWAIN_PUBLICATION_CARD_REQUIRED === "true",
  ALLWAIN_LEGAL_RELEASE_APPROVED:
    process.env.ALLWAIN_LEGAL_RELEASE_APPROVED === "true",
  ALLWAIN_LEGAL_APPROVAL_REFERENCE:
    process.env.ALLWAIN_LEGAL_APPROVAL_REFERENCE,
  ALLWAIN_LEGAL_RELEASE_SCOPE: allwainLegalReleaseScope(),
  ALLWAIN_PLATFORM_FEE_BPS: Number(process.env.ALLWAIN_PLATFORM_FEE_BPS || 1_000),
  ALLWAIN_PLATFORM_SELLER_EMAILS: parseCsv(
    process.env.ALLWAIN_PLATFORM_SELLER_EMAILS || "newmersive@gmail.com",
  ).map((email) => email.toLowerCase()),
  // Share of Allwain's platform fee assigned to a connector (200 bps = 2% of the fee).
  // Keep the old variable as a compatibility fallback while deployments migrate names.
  ALLWAIN_CONNECTOR_PLATFORM_SHARE_BPS: Number(
    process.env.ALLWAIN_CONNECTOR_PLATFORM_SHARE_BPS ||
      process.env.ALLWAIN_CONNECTOR_FEE_BPS ||
      200,
  ),
  ALLWAIN_CONNECTOR_FEE_BPS: Number(
    process.env.ALLWAIN_CONNECTOR_PLATFORM_SHARE_BPS ||
      process.env.ALLWAIN_CONNECTOR_FEE_BPS ||
      200,
  ),
  ALLWAIN_LOCAL_DELIVERY_FEE_AMOUNT: Number(
    process.env.ALLWAIN_LOCAL_DELIVERY_FEE_AMOUNT || 200,
  ),
  ALLWAIN_CARRIER_PROVIDER: process.env.ALLWAIN_CARRIER_PROVIDER || "sendcloud",
  SENDCLOUD_API_BASE_URL:
    process.env.SENDCLOUD_API_BASE_URL || "https://panel.sendcloud.sc/api/v3",
  SENDCLOUD_PUBLIC_KEY: process.env.SENDCLOUD_PUBLIC_KEY,
  SENDCLOUD_SECRET_KEY: process.env.SENDCLOUD_SECRET_KEY,
  SENDCLOUD_WEBHOOK_SECRET: process.env.SENDCLOUD_WEBHOOK_SECRET,
  SENDCLOUD_QUOTE_TTL_SECONDS: Number(process.env.SENDCLOUD_QUOTE_TTL_SECONDS || 900),
  SENDCLOUD_REQUEST_TIMEOUT_MS: Number(
    process.env.SENDCLOUD_REQUEST_TIMEOUT_MS || 10_000,
  ),
  ALLWAIN_CURRENCY: (process.env.ALLWAIN_CURRENCY || "eur").toLowerCase(),
  ALLWAIN_APP_URL: process.env.ALLWAIN_APP_URL || "https://allwain.es",
  ALLWAIN_API_URL: process.env.ALLWAIN_API_URL || "https://api.allwain.es",
  ALLWAIN_PUBLICATION_IMAGE_DIR:
    process.env.ALLWAIN_PUBLICATION_IMAGE_DIR ||
    (nodeEnv === "production"
      ? "/var/lib/newmersive/course-uploads/allwain-publication-images"
      : "data/allwain-publication-images"),
  ALLWAIN_EVIDENCE_DIR:
    process.env.ALLWAIN_EVIDENCE_DIR ||
    (nodeEnv === "production"
      ? "/var/lib/newmersive/private/allwain-evidence"
      : "data/allwain-evidence"),
  ALLWAIN_NATIVE_SCHEME: process.env.ALLWAIN_NATIVE_SCHEME || "allwain",
  ALLWAIN_VIDEO_CALLS_ENABLED:
    process.env.ALLWAIN_VIDEO_CALLS_ENABLED === "true",
  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  ALLWAIN_RESERVATION_TTL_MINUTES: Number(
    process.env.ALLWAIN_RESERVATION_TTL_MINUTES || 1_440,
  ),
  ALLWAIN_PREORDER_MAX_DAYS: Number(
    process.env.ALLWAIN_PREORDER_MAX_DAYS || 180,
  ),
  ALLWAIN_PREORDER_MANDATE_VERSION:
    process.env.ALLWAIN_PREORDER_MANDATE_VERSION ||
    "allwain-preorder-mandate-v1-2026-09-03",
  ALLWAIN_BUYER_PAYMENT_CONSENT_VERSION:
    process.env.ALLWAIN_BUYER_PAYMENT_CONSENT_VERSION ||
    "allwain-buyer-payment-method-v1-2026-09-03",
  ALLWAIN_RECURRING_MANDATE_VERSION:
    process.env.ALLWAIN_RECURRING_MANDATE_VERSION ||
    "allwain-recurring-order-v1-2026-09-03",
  ALLWAIN_MAINTENANCE_INTERVAL_MS: Number(
    process.env.ALLWAIN_MAINTENANCE_INTERVAL_MS || 300_000,
  ),
  ALLWAIN_RECONCILIATION_INTERVAL_MS: Number(
    process.env.ALLWAIN_RECONCILIATION_INTERVAL_MS || 86_400_000,
  ),
  ALLWAIN_AUDIT_HMAC_SECRET:
    auditHmacSecret,
  ALLWAIN_FISCAL_ATTESTATION_VERSION:
    process.env.ALLWAIN_FISCAL_ATTESTATION_VERSION || "allwain-fiscal-attestation-v1",
  ALLWAIN_COMMERCIAL_TERMS_VERSION:
    process.env.ALLWAIN_COMMERCIAL_TERMS_VERSION ||
    "allwain-marketplace-v3-2026-09-05",
  ALLWAIN_DOCUMENT_MANDATE_VERSION:
    process.env.ALLWAIN_DOCUMENT_MANDATE_VERSION ||
    "allwain-document-mandate-v1-2026-09-03",
  ALLWAIN_TAX_AUTOMATION_ENABLED:
    process.env.ALLWAIN_TAX_AUTOMATION_ENABLED === "true",
  ALLWAIN_SELLER_TRANSFER_TRIGGER:
    (process.env.ALLWAIN_SELLER_TRANSFER_TRIGGER || "completed") as
      | "completed",
  ALLWAIN_LEGAL_NAME: process.env.ALLWAIN_LEGAL_NAME,
  ALLWAIN_LEGAL_TAX_ID: process.env.ALLWAIN_LEGAL_TAX_ID,
  ALLWAIN_LEGAL_ADDRESS: process.env.ALLWAIN_LEGAL_ADDRESS,
  COURSE_UPLOAD_DIR: process.env.COURSE_UPLOAD_DIR || "/var/lib/newmersive/course-uploads",
  COURSE_MAX_UPLOAD_BYTES: Number(process.env.COURSE_MAX_UPLOAD_BYTES || 5_242_880),
  COURSE_ARCHIVE_MAX_FILES: Number(process.env.COURSE_ARCHIVE_MAX_FILES || 256),
  COURSE_ARCHIVE_MAX_UNCOMPRESSED_BYTES: Number(
    process.env.COURSE_ARCHIVE_MAX_UNCOMPRESSED_BYTES || 52_428_800,
  ),
  COURSE_ARCHIVE_MAX_RATIO: Number(process.env.COURSE_ARCHIVE_MAX_RATIO || 100),
  COURSE_MALWARE_SCAN_MODE: courseMalwareScanMode(),
  COURSE_MALWARE_SCANNER_PATH:
    process.env.COURSE_MALWARE_SCANNER_PATH || "/usr/bin/clamdscan",
  COURSE_MALWARE_SCAN_TIMEOUT_MS: Number(
    process.env.COURSE_MALWARE_SCAN_TIMEOUT_MS || 30_000,
  ),
  COURSE_AI_DAILY_LIMIT: Number(process.env.COURSE_AI_DAILY_LIMIT || 60),
  COURSE_REQUIRED_LEGAL_VERSION: process.env.COURSE_REQUIRED_LEGAL_VERSION || "2026-08-27",
  COURSE_IP_HASH_SECRET: courseIpHashSecret,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  ALLWAIN_EMAIL_FROM:
    process.env.ALLWAIN_EMAIL_FROM || "Allwain <notificaciones@allwain.es>",
  ALLWAIN_SUPPORT_EMAIL:
    process.env.ALLWAIN_SUPPORT_EMAIL || "soporte@allwain.es",
  ALLWAIN_EMAIL_DELIVERY_MODE: allwainEmailDeliveryMode(),
  ALLWAIN_EMAIL_TEST_RECIPIENTS: parseCsv(
    process.env.ALLWAIN_EMAIL_TEST_RECIPIENTS,
  ).map((email) => email.toLowerCase()),
  ALLWAIN_EMAIL_TEST_STARTED_AT: optionalIsoTimestamp(
    "ALLWAIN_EMAIL_TEST_STARTED_AT",
  ),
  ALLWAIN_SUPPORT_INBOX_ENABLED:
    process.env.ALLWAIN_SUPPORT_INBOX_ENABLED === "true",
  ALLWAIN_SUPPORT_IMAP_HOST:
    process.env.ALLWAIN_SUPPORT_IMAP_HOST || "imap.ionos.es",
  ALLWAIN_SUPPORT_IMAP_PORT: Number(
    process.env.ALLWAIN_SUPPORT_IMAP_PORT || 993,
  ),
  ALLWAIN_SUPPORT_IMAP_SECURE:
    process.env.ALLWAIN_SUPPORT_IMAP_SECURE !== "false",
  ALLWAIN_SUPPORT_IMAP_USER:
    process.env.ALLWAIN_SUPPORT_IMAP_USER || process.env.SMTP_USER,
  ALLWAIN_SUPPORT_IMAP_PASS:
    process.env.ALLWAIN_SUPPORT_IMAP_PASS || process.env.SMTP_PASS,
  ALLWAIN_SUPPORT_AUTOMATION_MODE: allwainSupportAutomationMode(),
  ALLWAIN_SUPPORT_EXTERNAL_AI_ENABLED:
    process.env.ALLWAIN_SUPPORT_EXTERNAL_AI_ENABLED === "true",
  ALLWAIN_SUPPORT_AI_MODEL:
    process.env.ALLWAIN_SUPPORT_AI_MODEL ||
    process.env.OPENAI_CHAT_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini",
  ALLWAIN_SUPPORT_POLL_INTERVAL_MS: Number(
    process.env.ALLWAIN_SUPPORT_POLL_INTERVAL_MS || 300_000,
  ),
  ALLWAIN_SUPPORT_MAX_MESSAGE_BYTES: Number(
    process.env.ALLWAIN_SUPPORT_MAX_MESSAGE_BYTES || 262_144,
  ),
  ALLWAIN_CHAT_TRANSLATION_ENABLED:
    process.env.ALLWAIN_CHAT_TRANSLATION_ENABLED === "true",
  ALLWAIN_CHAT_TRANSLATION_MODEL:
    process.env.ALLWAIN_CHAT_TRANSLATION_MODEL ||
    process.env.OPENAI_CHAT_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini",
  COURSE_EMAIL_FROM: process.env.COURSE_EMAIL_FROM || "Newmersive Robot Lab <campus@newmersive.es>",
  COURSE_ADMIN_EMAIL: process.env.COURSE_ADMIN_EMAIL || "admisiones@newmersive.es",
  COURSE_LEGAL_NAME: process.env.COURSE_LEGAL_NAME,
  COURSE_LEGAL_TAX_ID: process.env.COURSE_LEGAL_TAX_ID,
  COURSE_LEGAL_ADDRESS: process.env.COURSE_LEGAL_ADDRESS,
  COURSE_BACKUP_REMOTE: process.env.COURSE_BACKUP_REMOTE,

  // CORS allowlist
  ALLOWED_ORIGINS: parseAllowedOrigins(),
};

if (
  ENV.ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED &&
  ENV.ALLWAIN_STRIPE_LIVEMODE
) {
  throw new Error("ALLWAIN_STRIPE_TEST_CHECKOUT_FORBIDS_LIVE_MODE");
}
if (
  ENV.ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED &&
  /^(?:sk|rk)_live_/.test(String(ENV.STRIPE_SECRET_KEY || ""))
) {
  throw new Error("ALLWAIN_STRIPE_TEST_CHECKOUT_FORBIDS_LIVE_KEY");
}

export function allwainPublicationCardRequired() {
  return (
    ENV.ALLWAIN_PUBLICATION_CARD_REQUIRED ||
    (ENV.ALLWAIN_PAYMENTS_ENABLED && ENV.ALLWAIN_STRIPE_LIVEMODE)
  );
}
