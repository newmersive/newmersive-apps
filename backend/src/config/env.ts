import dotenv from "dotenv";
dotenv.config();

function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) {
    return ["http://localhost:3000", "http://localhost:19006", "http://localhost:19000"];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const ENV = {
  PORT: process.env.PORT || "4000",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
  NODE_ENV: process.env.NODE_ENV || "development",
  DEMO_MODE: process.env.DEMO_MODE === "true",
  DATA_FILE: process.env.DATA_FILE,
  SCAN_PROVIDER: process.env.SCAN_PROVIDER || "mock",

  // Prisma / Postgres
  DATABASE_URL: process.env.DATABASE_URL,
  STORAGE_DRIVER: (process.env.STORAGE_DRIVER || "postgres") as "json" | "postgres",

  // CORS allowlist
  ALLOWED_ORIGINS: parseAllowedOrigins(),
};
