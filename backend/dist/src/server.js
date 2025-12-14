"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const routes_1 = __importDefault(require("./routes"));
const prisma_1 = require("./db/prisma");
exports.app = (0, express_1.default)();
/* =========================
   CORS allowlist
========================= */
exports.app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Permite requests sin origin (curl/healthchecks)
        if (!origin)
            return callback(null, true);
        if (env_1.ENV.ALLOWED_ORIGINS.includes(String(origin))) {
            return callback(null, true);
        }
        return callback(new Error("CORS_NOT_ALLOWED"));
    },
}));
exports.app.use(express_1.default.json());
exports.app.use("/api", routes_1.default);
// Global error handler
exports.app.use((err, _req, res, _next) => {
    console.error("UNHANDLED_EXPRESS_ERROR", err);
    const status = err?.message === "CORS_NOT_ALLOWED" ? 403 : 500;
    res.status(status).json({
        error: "INTERNAL_ERROR",
        detail: env_1.ENV.NODE_ENV === "development" ? String(err?.message || err) : undefined,
    });
});
const server = env_1.ENV.NODE_ENV !== "test"
    ? exports.app.listen(env_1.ENV.PORT, () => console.log(`API OK on port ${env_1.ENV.PORT}`))
    : null;
async function shutdown(signal) {
    console.log(`Shutting down (${signal})...`);
    try {
        await (0, prisma_1.closePrisma)();
    }
    catch (e) {
        console.error("closePrisma error:", e);
    }
    if (server)
        server.close(() => process.exit(0));
    else
        process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
exports.default = exports.app;
