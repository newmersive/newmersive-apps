"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_service_1 = require("../services/auth.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
function errorDetail(err) {
    if (env_1.ENV.NODE_ENV === "development") {
        if (err instanceof Error)
            return err.message;
        try {
            return JSON.stringify(err);
        }
        catch {
            return String(err);
        }
    }
    return undefined;
}
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, role, sponsorCode, sourceApp } = req.body;
        if (!name || !email || !password) {
            res.status(400).json({ error: "MISSING_FIELDS" });
            return;
        }
        const result = await (0, auth_service_1.registerUser)(name, email, password, role, sponsorCode, sourceApp);
        res.status(201).json(result);
    }
    catch (err) {
        console.error("AUTH_REGISTER_ERROR", err);
        if (err instanceof Error && err.message === "EMAIL_ALREADY_EXISTS") {
            res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
            return;
        }
        res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
    }
});
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await (0, auth_service_1.loginUser)(email, password);
        res.json(result);
    }
    catch (err) {
        console.error("AUTH_LOGIN_ERROR", err);
        res.status(401).json({ error: "INVALID_CREDENTIALS", detail: errorDetail(err) });
    }
});
router.get("/me", auth_middleware_1.authRequired, async (req, res) => {
    try {
        const userId = req.user?.id;
        const user = await (0, auth_service_1.getUserProfile)(userId);
        res.json(user);
    }
    catch (err) {
        console.error("AUTH_ME_ERROR", err);
        res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
    }
});
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        const token = await (0, auth_service_1.requestPasswordReset)(email);
        res.json({ token }); // demo mode
    }
    catch (err) {
        console.error("AUTH_FORGOT_PASSWORD_ERROR", err);
        res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
    }
});
router.post("/reset-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        await (0, auth_service_1.resetPassword)(token, newPassword);
        res.json({ ok: true });
    }
    catch (err) {
        console.error("AUTH_RESET_PASSWORD_ERROR", err);
        res.status(400).json({ error: "INVALID_TOKEN", detail: errorDetail(err) });
    }
});
exports.default = router;
