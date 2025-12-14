"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicUsers = getPublicUsers;
exports.registerUser = registerUser;
exports.loginUser = loginUser;
exports.getUserProfile = getUserProfile;
exports.requestPasswordReset = requestPasswordReset;
exports.resetPassword = resetPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
// JSON driver
const data_store_1 = require("./data.store");
// Postgres driver
const data_store_pg_1 = require("./data.store.pg");
const ALLOWED_ROLES = ["user", "buyer", "company", "admin"];
/* =========================
   HELPERS
========================= */
function toAuthUser(user) {
    const { passwordHash, ...rest } = user;
    return rest;
}
async function getNextUserId() {
    if (env_1.ENV.STORAGE_DRIVER === "postgres") {
        const users = await (0, data_store_pg_1.getUsersPg)();
        const max = users.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
        return String(max + 1);
    }
    const users = (0, data_store_1.getDatabase)().users;
    const max = users.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
    return String(max + 1);
}
function generateSponsorCode() {
    const random = crypto_1.default.randomBytes(3).toString("hex").toUpperCase();
    return `SPN-${random}`;
}
async function validateSponsorCode(code) {
    if (!code)
        return undefined;
    const normalized = code.trim();
    if (env_1.ENV.STORAGE_DRIVER === "postgres") {
        const users = await (0, data_store_pg_1.getUsersPg)();
        return users.find((u) => u.sponsorCode === normalized) ? normalized : undefined;
    }
    const user = (0, data_store_1.getDatabase)().users.find(u => u.sponsorCode === normalized);
    return user ? normalized : undefined;
}
function createAuthTokenResponse(user) {
    const token = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, role: user.role }, env_1.ENV.JWT_SECRET, { expiresIn: "7d" });
    return { token, user: toAuthUser(user) };
}
/* =========================
   PUBLIC USERS (ADMIN)
========================= */
async function getPublicUsers() {
    if (env_1.ENV.STORAGE_DRIVER === "postgres") {
        const users = await (0, data_store_pg_1.getUsersPg)();
        return users.map((u) => toAuthUser(u));
    }
    return (0, data_store_1.getDatabase)().users.map((u) => toAuthUser(u));
}
/* =========================
   REGISTER
========================= */
async function registerUser(name, email, password, role = "user", sponsorCode, sourceApp) {
    const normalizedEmail = email.toLowerCase();
    const existing = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getUserByEmailPg)(normalizedEmail)
        : (0, data_store_1.getUserByEmail)(normalizedEmail);
    if (existing)
        throw new Error("EMAIL_ALREADY_EXISTS");
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const newSponsorCode = generateSponsorCode();
    const referredByCode = await validateSponsorCode(sponsorCode);
    const id = await getNextUserId();
    const user = {
        id,
        name,
        email: normalizedEmail,
        passwordHash,
        role: ALLOWED_ROLES.includes(role) ? role : "user",
        createdAt: new Date().toISOString(),
        sponsorCode: newSponsorCode,
        referredByCode,
        tokens: sourceApp === "trueqia" ? 100 : 0,
        allwainBalance: 0,
    };
    if (env_1.ENV.STORAGE_DRIVER === "postgres")
        await (0, data_store_pg_1.upsertUserPg)(user);
    else
        (0, data_store_1.upsertUser)(user);
    return createAuthTokenResponse(user);
}
/* =========================
   LOGIN
========================= */
async function loginUser(email, password) {
    const normalizedEmail = email.toLowerCase();
    const user = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getUserByEmailPg)(normalizedEmail)
        : (0, data_store_1.getUserByEmail)(normalizedEmail);
    if (!user)
        throw new Error("INVALID_CREDENTIALS");
    if (!user.passwordHash)
        throw new Error("INVALID_CREDENTIALS");
    const match = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!match)
        throw new Error("INVALID_CREDENTIALS");
    return createAuthTokenResponse(user);
}
/* =========================
   PROFILE
========================= */
async function getUserProfile(userId) {
    const user = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getUserByIdPg)(userId)
        : (0, data_store_1.getUserById)(userId);
    return user ? toAuthUser(user) : null;
}
/* =========================
   PASSWORD RESET
========================= */
async function requestPasswordReset(email) {
    const normalized = email.toLowerCase();
    const user = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getUserByEmailPg)(normalized)
        : (0, data_store_1.getUserByEmail)(normalized);
    if (!user)
        return;
    const token = crypto_1.default.randomBytes(20).toString("hex");
    const expiresAt = Date.now() + 60 * 60 * 1000;
    if (env_1.ENV.STORAGE_DRIVER === "postgres") {
        await (0, data_store_pg_1.savePasswordResetTokenPg)(token, user.id, expiresAt);
    }
    else {
        (0, data_store_1.savePasswordResetToken)(token, user.id, expiresAt);
    }
    return token;
}
async function resetPassword(token, newPassword) {
    const record = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getPasswordResetTokenPg)(token)
        : (0, data_store_1.getPasswordResetToken)(token);
    if (!record)
        throw new Error("INVALID_TOKEN");
    const user = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getUserByIdPg)(record.userId)
        : (0, data_store_1.getUserById)(record.userId);
    if (!user)
        throw new Error("USER_NOT_FOUND");
    user.passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    if (env_1.ENV.STORAGE_DRIVER === "postgres") {
        await (0, data_store_pg_1.upsertUserPg)(user);
        await (0, data_store_pg_1.deletePasswordResetTokenPg)(token);
    }
    else {
        (0, data_store_1.upsertUser)(user);
        (0, data_store_1.deletePasswordResetToken)(token);
    }
}
