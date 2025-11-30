import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { AddressInfo } from "node:net";
import { app } from "../src/server";

let baseUrl: string;
let server: ReturnType<typeof app.listen>;

before(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
});

async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  return { status: response.status, body: await response.json() };
}

describe("Auth routes", () => {
  const email = `user+${Date.now()}@test.local`;
  const password = "password123";

  it("should register a new user and return a token", async () => {
    const res = await post("/auth/register", { name: "Test User", email, password });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.token, "string");
    assert.equal(res.body.user.email, email.toLowerCase());
  });

  it("should log in an existing user and return a token", async () => {
    const res = await post("/auth/login", { email, password });

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
    const registerRes = await post("/auth/register", { name: "Member", email: memberEmail, password: memberPassword });
    memberToken = registerRes.body.token;

    const adminLogin = await post("/auth/login", { email: "admin@newmersive.local", password: "admin123" });
    adminToken = adminLogin.body.token;
  });

  it("should reject missing tokens", async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard`);
    const body: any = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.error, "UNAUTHORIZED");
  });

  it("should reject invalid tokens", async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard`, {
      headers: { Authorization: "Bearer invalid.token.here" }
    });
    const body: any = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.error, "INVALID_TOKEN");
  });

  it("should block non-admin users", async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    const body: any = await res.json();

    assert.equal(res.status, 403);
    assert.equal(body.error, "FORBIDDEN");
  });

  it("should allow admin users", async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const body: any = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.admin, true);
  });
});
