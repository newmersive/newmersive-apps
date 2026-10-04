import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { ENV } from "../../src/config/env";
import { getUserById, upsertUser } from "../../src/services/data.store";
import type { TestClient } from "./test-client";

// Privileged fixtures exist only in the explicitly isolated JSON file. They still
// authenticate through the real login/session implementation; no middleware is mocked.
export async function createSyntheticAdmin(client: TestClient, label: string) {
  const dataFile = path.resolve(process.env.DATA_FILE || "");
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(ENV.STORAGE_DRIVER, "json");
  assert.ok(dataFile.startsWith(path.resolve(os.tmpdir()) + path.sep), "Admin fixture requires an isolated temporary DATA_FILE");
  const password = "SyntheticAdminFixtureOnly!2026";
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const registration = await client.post("/auth/register", {
    name: `Synthetic ${label}`, email, password, sourceApp: "trueqia",
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.user.role, "user", "Public registration cannot grant admin privileges");
  const current = getUserById(registration.body.user.id);
  assert.ok(current);
  upsertUser({ ...current, role: "admin" });
  const login = await client.post("/auth/login", { email, password, sourceApp: "admin" });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, registration.body.user.id);
  assert.equal(login.body.user.role, "admin");
  assert.equal(typeof login.body.token, "string");
  return { token: login.body.token as string, user: login.body.user, password };
}
