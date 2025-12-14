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
(0, node_test_1.describe)("Offers routes", () => {
    let token;
    (0, node_test_1.before)(async () => {
        await client.start();
        const login = await client.post("/auth/login", {
            email: "admin@newmersive.local",
            password: "admin123",
        });
        token = login.body.token;
    });
    (0, node_test_1.after)(async () => {
        await client.stop();
    });
    (0, node_test_1.describe)("GET /trueqia/offers", () => {
        (0, node_test_1.it)("returns only TrueQIA offers when token is valid", async () => {
            const res = await client.get("/trueqia/offers", {
                Authorization: `Bearer ${token}`,
            });
            node_assert_1.default.equal(res.status, 200);
            node_assert_1.default.ok(Array.isArray(res.body.items));
            node_assert_1.default.ok(res.body.items.length > 0, "should return demo trueques");
            res.body.items.forEach((offer) => {
                node_assert_1.default.ok(offer.owner);
                node_assert_1.default.ok(typeof offer.owner.id === "string");
            });
        });
    });
    (0, node_test_1.describe)("GET /allwain/offers", () => {
        (0, node_test_1.it)("returns 200 with a valid token and only Allwain offers", async () => {
            const res = await client.get("/allwain/offers", {
                Authorization: `Bearer ${token}`,
            });
            node_assert_1.default.equal(res.status, 200);
            node_assert_1.default.ok(Array.isArray(res.body.items));
            node_assert_1.default.ok(res.body.items.length > 0, "should return demo compras/comisiones");
            res.body.items.forEach((offer) => {
                node_assert_1.default.equal(offer.owner, "allwain");
            });
        });
        (0, node_test_1.it)("rejects requests without a token", async () => {
            const res = await client.get("/allwain/offers");
            node_assert_1.default.equal(res.status, 401);
            node_assert_1.default.equal(res.body.error, "UNAUTHORIZED");
        });
    });
});
