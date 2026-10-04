import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

describe("Newmersive ID shared auth", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = "sharedPass123";
  const trueqiaEmail = `trueqia-shared+${suffix}@test.local`;
  const allwainEmail = `allwain-shared+${suffix}@test.local`;

  before(async () => {
    await client.start();
  });

  after(async () => {
    await client.stop();
  });

  it("registers TrueQIA users with token balance and shared backend access", async () => {
    const registerRes = await client.post("/auth/register", {
      name: "TrueQIA Shared",
      email: trueqiaEmail,
      password,
      sourceApp: "trueqia",
    });

    assert.equal(registerRes.status, 201);
    assert.equal(registerRes.body.user.email, trueqiaEmail);
    assert.equal(registerRes.body.user.tokens, 100);
    assert.equal(registerRes.body.user.allwainBalance, 0);

    const loginRes = await client.post("/auth/login", {
      email: trueqiaEmail.toUpperCase(),
      password,
    });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.user.id, registerRes.body.user.id);

    const token = loginRes.body.token;

    const trueqiaOffers = await client.get("/trueqia/offers", {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(trueqiaOffers.status, 200);
    assert.ok(Array.isArray(trueqiaOffers.body.items));

    const allwainOffers = await client.get("/allwain/offers", {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(allwainOffers.status, 200);
    assert.ok(Array.isArray(allwainOffers.body.items));
  });

  it("registers Allwain users without TrueQIA starter tokens and can scan", async () => {
    const registerRes = await client.post("/auth/register", {
      name: "Allwain Shared",
      email: allwainEmail,
      password,
      sourceApp: "allwain",
    });

    assert.equal(registerRes.status, 201);
    assert.equal(registerRes.body.user.email, allwainEmail);
    assert.equal(registerRes.body.user.tokens, 0);
    assert.equal(registerRes.body.user.allwainBalance, 0);

    const loginRes = await client.post("/auth/login", {
      email: allwainEmail,
      password,
    });

    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token;

    const scanRes = await client.get("/allwain/scan-demo", {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(scanRes.status, 200);
    assert.ok("product" in scanRes.body);
    assert.ok(Array.isArray(scanRes.body.offers));

    const trueqiaOffers = await client.get("/trueqia/offers", {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(trueqiaOffers.status, 200);
    assert.ok(Array.isArray(trueqiaOffers.body.items));
  });
});
