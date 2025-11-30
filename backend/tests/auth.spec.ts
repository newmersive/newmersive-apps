import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

before(async () => {
  await client.start();
});

after(async () => {
  await client.stop();
});

describe("Auth routes", () => {
  const email = `user+${Date.now()}@test.local`;
  const password = "password123";

  it("should register a new user and return a token", async () => {
    const res = await client.post("/auth/register", {
      name: "Test User",
      email,
      password
    });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.token, "string");
    assert.equal(res.body.user.email, email.toLowerCase());
  });

  it("should log in an existing user and return a token", async () => {
    const res = await client.post("/auth/login", { email, password });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, "string");
    assert.equal(res.body.user.email, email.toLowerCase());
  });
});

describe("auth middleware", () => {
  const memberEmail = `member+${Date.now()}@test.local`;
  const memberPassword = "memberPass123";
  let memberToken: string;
  let adminToken: string;

  before(async () => {
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

  it("should reject missing tokens", async () => {
    const res = await client.get("/admin/dashboard");

    assert.equal(res.status, 401);
    assert.equal(res.body.error, "UNAUTHORIZED");
  });

  it("should reject invalid tokens", async () => {
    const res = await client.get("/admin/dashboard", {
      Authorization: "Bearer invalid.token.here"
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.error, "INVALID_TOKEN");
  });

  it("should block non-admin users", async () => {
    const res = await client.get("/admin/dashboard", {
      Authorization: `Bearer ${memberToken}`
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error, "FORBIDDEN");
  });

  it("should allow admin users", async () => {
    const res = await client.get("/admin/dashboard", {
      Authorization: `Bearer ${adminToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.admin, true);
  });
});
