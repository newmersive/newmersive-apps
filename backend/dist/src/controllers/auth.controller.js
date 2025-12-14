"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postRegister = postRegister;
exports.postLogin = postLogin;
exports.getProfile = getProfile;
exports.postForgotPassword = postForgotPassword;
exports.postResetPassword = postResetPassword;
const auth_service_1 = require("../services/auth.service");
const allowedRoles = ["user", "company", "admin", "buyer"];
async function postRegister(req, res) {
    try {
        const { name, email, password, role, sponsorCode, appMode } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: "MISSING_FIELDS" });
        }
        const normalizedRole = role && allowedRoles.includes(role) ? role : "user";
        const result = await (0, auth_service_1.registerUser)(name, email, password, normalizedRole, sponsorCode, appMode);
        return res.status(201).json(result);
    }
    catch (err) {
        if (err instanceof Error && err.message === "EMAIL_ALREADY_EXISTS") {
            return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
        }
        return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
}
async function postLogin(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "MISSING_FIELDS" });
        }
        const result = await (0, auth_service_1.loginUser)(email, password);
        return res.status(200).json(result);
    }
    catch (err) {
        if (err instanceof Error && err.message === "INVALID_CREDENTIALS") {
            return res.status(401).json({ error: "INVALID_CREDENTIALS" });
        }
        return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
}
function getProfile(req, res) {
    if (!req.user)
        return res.status(401).json({ error: "UNAUTHORIZED" });
    const profile = (0, auth_service_1.getUserProfile)(req.user.id);
    if (!profile)
        return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ user: profile });
}
async function postForgotPassword(req, res) {
    const { email } = req.body;
    try {
        if (email) {
            await (0, auth_service_1.requestPasswordReset)(email);
        }
        return res.status(200).json({ ok: true });
    }
    catch {
        return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
}
async function postResetPassword(req, res) {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    try {
        await (0, auth_service_1.resetPassword)(token, password);
        return res.status(200).json({ ok: true });
    }
    catch (err) {
        if (err instanceof Error && err.message === "INVALID_TOKEN") {
            return res.status(400).json({ error: "INVALID_TOKEN" });
        }
        return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
}
