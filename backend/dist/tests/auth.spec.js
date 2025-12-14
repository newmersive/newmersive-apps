"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_test_1 = require("node:test");
const server_1 = require("../src/server");
const test_client_1 = require("./helpers/test-client");
const client = new test_client_1.TestClient(server_1.app);
(0, node_test_1.before)(async () => {
    await client.start();
});
(0, node_test_1.after)(async () => {
    await client.stop();
});
(0, node_test_1.describe)("Auth routes", () => {
    const email = `user+${Date.now()}@test.local`;
    const password = "password123";
    (0, node_test_1.it)("should register a new user and return a token", async () => {
        const res = await client.post("/auth/register", {
            name: "Test User",
            email,
            password
        });
        node_assert_1.default.equal(res.status, 201);
        node_assert_1.default.equal(typeof res.body.token, "string");
        node_assert_1.default.equal(res.body.user.email, email.toLowerCase());
    });
    (0, node_test_1.it)("should log in an existing user and return a token", async () => {
        const res = await client.post("/auth/login", { email, password });
        node_assert_1.default.equal(res.status, 200);
        node_assert_1.default.equal(typeof res.body.token, "string");
        node_assert_1.default.equal(res.body.user.email, email.toLowerCase());
    });
});
(0, node_test_1.describe)("auth middleware", () => {
    const memberEmail = `member+${Date.now()}@test.local`;
    const memberPassword = "memberPass123";
    let memberToken;
    let adminToken;
    (0, node_test_1.before)(async () => {
        const registerRes = await client.post("/auth/register", {
            name: "Member",
            email: memberEmail,
            password: memberPassword
        });
        memberToken = registerRes.body.token;
        const adminLogin = await client.post("/auth/login", {
            email: "admin@newmersive.local",
            password: "admin123"
        });
        adminToken = adminLogin.body.token;
    });
    (0, node_test_1.it)("should reject missing tokens", async () => {
        const res = await client.get("/admin/dashboard");
        node_assert_1.default.equal(res.status, 401);
        node_assert_1.default.equal(res.body.error, "UNAUTHORIZED");
    });
    (0, node_test_1.it)("should reject invalid tokens", async () => {
        const res = await client.get("/admin/dashboard", {
            Authorization: "Bearer invalid.token.here"
        });
        node_assert_1.default.equal(res.status, 401);
        node_assert_1.default.equal(res.body.error, "INVALID_TOKEN");
    });
    (0, node_test_1.it)("should block non-admin users", async () => {
        const res = await client.get("/admin/dashboard", {
            Authorization: `Bearer ${memberToken}`
        });
        node_assert_1.default.equal(res.status, 403);
        node_assert_1.default.equal(res.body.error, "FORBIDDEN");
    });
    (0, node_test_1.it)("should allow admin users", async () => {
        const res = await client.get("/admin/dashboard", {
            Authorization: `Bearer ${adminToken}`
        });
        node_assert_1.default.equal(res.status, 200);
        node_assert_1.default.equal(res.body.admin, true);
    });
});
