import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

describe("Offers routes", () => {
  let token: string;

  before(async () => {
    await client.start();
    const login = await client.post("/auth/login", {
      email: "admin@newmersive.local",
      password: "admin123",
    });
    token = login.body.token;
  });

  after(async () => {
    await client.stop();
  });

  describe("GET /trueqia/offers", () => {
    it("returns only TrueQIA offers when token is valid", async () => {
      const res = await client.get("/trueqia/offers", {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.length > 0, "should return demo trueques");
      res.body.items.forEach((offer: any) => {
        assert.equal(offer.owner, "trueqia");
      });
    });
  });

  describe("GET /allwain/offers", () => {
    it("returns 200 with a valid token and only Allwain offers", async () => {
      const res = await client.get("/allwain/offers", {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.length > 0, "should return demo compras/comisiones");
      res.body.items.forEach((offer: any) => {
        assert.equal(offer.owner, "allwain");
      });
    });

    it("rejects requests without a token", async () => {
      const res = await client.get("/allwain/offers");

      assert.equal(res.status, 401);
      assert.equal(res.body.error, "UNAUTHORIZED");
    });
  });
});
