"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function parseAllowedOrigins() {
    const raw = process.env.ALLOWED_ORIGINS;
    if (!raw) {
        return ["http://localhost:3000", "http://localhost:19006", "http://localhost:19000"];
    }
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
exports.ENV = {
    PORT: process.env.PORT || "4000",
    JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
    NODE_ENV: process.env.NODE_ENV || "development",
    DEMO_MODE: process.env.DEMO_MODE === "true",
    DATA_FILE: process.env.DATA_FILE,
    SCAN_PROVIDER: process.env.SCAN_PROVIDER || "mock",
    // Prisma / Postgres
    DATABASE_URL: process.env.DATABASE_URL,
    STORAGE_DRIVER: (process.env.STORAGE_DRIVER || "postgres"),
    // CORS allowlist
    ALLOWED_ORIGINS: parseAllowedOrigins(),
};
