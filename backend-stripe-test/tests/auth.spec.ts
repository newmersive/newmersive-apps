import assert from "node:assert";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { app } from "../src/server";
import { requestPasswordReset } from "../src/services/auth.service";
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
  const password = "Password123!";

  it("should register a new user and return a token", async () => {
    const res = await client.post("/auth/register", {
      name: "Test User",
      email,
      password
    });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.token, "string");
    assert.equal(typeof res.body.refreshToken, "string");
    assert.equal(res.body.user.email, email.toLowerCase());

    const decoded = jwt.decode(res.body.token, { complete: true }) as any;
    assert.equal(decoded?.header?.alg, "HS512");
    assert.equal(decoded?.payload?.iss, "newmersive-auth");
    assert.equal(decoded?.payload?.aud, "newmersive-api");
    assert.equal(decoded?.payload?.tokenUse, "access");
    assert.ok(decoded.payload.exp - decoded.payload.iat >= 895);
    assert.ok(decoded.payload.exp - decoded.payload.iat <= 905);
  });

  it("should log in an existing user and return a token", async () => {
    const res = await client.post("/auth/login", { email, password });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, "string");
    assert.equal(typeof res.body.refreshToken, "string");
    assert.equal(res.body.user.email, email.toLowerCase());
  });

  it("progressively locks repeated password guesses without exposing account state", async () => {
    const lockedEmail = `locked+${Date.now()}@test.local`;
    const oldPassword = "LockoutPassword123!";
    const newPassword = "RecoveredPassword456!";
    const registration = await client.post("/auth/register", {
      name: "Lockout Test User",
      email: lockedEmail,
      password: oldPassword,
    });
    assert.equal(registration.status, 201);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await client.post("/auth/login", {
        email: lockedEmail,
        password: `WrongPassword-${attempt}!`,
      });
      assert.equal(failed.status, 401);
      assert.equal(failed.body.error, "INVALID_CREDENTIALS");
    }

    const correctWhileLocked = await client.post("/auth/login", {
      email: lockedEmail,
      password: oldPassword,
    });
    assert.equal(correctWhileLocked.status, 401);
    assert.equal(correctWhileLocked.body.error, "INVALID_CREDENTIALS");

    const resetToken = await requestPasswordReset(lockedEmail);
    assert.equal(typeof resetToken, "string");
    const reset = await client.post("/auth/reset-password", {
      token: resetToken,
      newPassword,
    });
    assert.equal(reset.status, 200);

    const recovered = await client.post("/auth/login", {
      email: lockedEmail,
      password: newPassword,
    });
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.user.failedLoginCount, undefined);
    assert.equal(recovered.body.user.lockedUntil, undefined);
    assert.equal(recovered.body.user.tokenVersion, undefined);
  });

  it("keeps the browser refresh credential in an HttpOnly cookie", async () => {
    const browserEmail = `browser-cookie+${Date.now()}@test.local`;
    const response = await client.post(
      "/auth/register",
      {
        name: "Browser Cookie Test",
        email: browserEmail,
        password: "BrowserCookiePassword123!",
        sourceApp: "allwain",
      },
      { Origin: "http://localhost:19006" },
    );

    assert.equal(response.status, 201);
    assert.equal(response.body.refreshToken, undefined);
    assert.match(response.headers["set-cookie"], /newmersive_refresh=/);
    assert.match(response.headers["set-cookie"], /HttpOnly/i);
    assert.match(response.headers["set-cookie"], /SameSite=Strict/i);
    assert.match(response.headers["set-cookie"], /Path=\//i);
    assert.equal(response.headers["access-control-allow-credentials"], "true");
    assert.match(response.headers["cache-control"], /no-store/i);
  });

  it("rotates refresh tokens and revokes the family when an old token is replayed", async () => {
    const rotationEmail = `rotation+${Date.now()}@test.local`;
    const registration = await client.post("/auth/register", {
      name: "Rotation Test User",
      email: rotationEmail,
      password: "RotationPassword123!",
      sourceApp: "allwain",
    });
    assert.equal(registration.status, 201);

    const firstAccessToken = registration.body.token;
    const firstRefreshToken = registration.body.refreshToken;
    const rotated = await client.post("/auth/refresh", {
      refreshToken: firstRefreshToken,
      sourceApp: "allwain",
    });
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.body.token, firstAccessToken);
    assert.notEqual(rotated.body.refreshToken, firstRefreshToken);

    const previousAccess = await client.get("/auth/me", {
      Authorization: `Bearer ${firstAccessToken}`,
    });
    assert.equal(previousAccess.status, 401);

    const replay = await client.post("/auth/refresh", {
      refreshToken: firstRefreshToken,
    });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error, "REFRESH_TOKEN_REUSED");

    const familyRevoked = await client.post("/auth/refresh", {
      refreshToken: rotated.body.refreshToken,
    });
    assert.equal(familyRevoked.status, 401);
    assert.equal(familyRevoked.body.error, "REFRESH_TOKEN_REVOKED");
  });

  it("revokes both access and refresh credentials on logout", async () => {
    const logoutEmail = `logout+${Date.now()}@test.local`;
    const registration = await client.post("/auth/register", {
      name: "Logout Test User",
      email: logoutEmail,
      password: "LogoutPassword123!",
      sourceApp: "trueqia",
    });
    const headers = { Authorization: `Bearer ${registration.body.token}` };

    const logout = await client.post("/auth/logout", {}, headers);
    assert.equal(logout.status, 200);

    const accessAfterLogout = await client.get("/auth/me", headers);
    assert.equal(accessAfterLogout.status, 401);
    const refreshAfterLogout = await client.post("/auth/refresh", {
      refreshToken: registration.body.refreshToken,
    });
    assert.equal(refreshAfterLogout.status, 401);
    assert.equal(refreshAfterLogout.body.error, "REFRESH_TOKEN_REVOKED");
  });

  it("does not let one user inspect or revoke another user's session", async () => {
    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    const first = await client.post("/auth/register", {
      name: "Session Owner",
      email: `session-owner+${suffix}@test.local`,
      password: "SessionOwnerPassword123!",
    });
    const second = await client.post("/auth/register", {
      name: "Other Session User",
      email: `other-session+${suffix}@test.local`,
      password: "OtherSessionPassword123!",
    });
    const firstHeaders = { Authorization: `Bearer ${first.body.token}` };
    const secondHeaders = { Authorization: `Bearer ${second.body.token}` };

    const sessions = await client.get("/auth/sessions", firstHeaders);
    assert.equal(sessions.status, 200);
    assert.equal(sessions.body.items.length, 1);
    assert.equal(sessions.body.items[0].current, true);

    const foreignRevoke = await client.delete(
      `/auth/sessions/${sessions.body.items[0].id}`,
      secondHeaders,
    );
    assert.equal(foreignRevoke.status, 404);

    const stillActive = await client.get("/auth/me", firstHeaders);
    assert.equal(stillActive.status, 200);
  });

  it("persists a supported interface locale on the single user account", async () => {
    const localeEmail = `locale+${Date.now()}@test.local`;
    const registration = await client.post("/auth/register", {
      name: "Locale Test User",
      email: localeEmail,
      password: "LocalePassword123!",
      sourceApp: "allwain",
      locale: "en-GB",
    });
    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.preferredLocale, "en");
    const headers = { Authorization: `Bearer ${registration.body.token}` };

    const changed = await client.patch(
      "/auth/preferences",
      { locale: "es-ES" },
      headers,
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.body.user.preferredLocale, "es");

    for (const supportedLocale of ["fr-FR", "it-IT", "zh-CN", "ar-SA"]) {
      const supported = await client.patch(
        "/auth/preferences",
        { locale: supportedLocale },
        headers,
      );
      assert.equal(supported.status, 200);
      assert.equal(
        supported.body.user.preferredLocale,
        supportedLocale.slice(0, 2).toLowerCase(),
      );
    }

    const analyticsGranted = await client.patch(
      "/auth/preferences",
      { analyticsConsent: true },
      headers,
    );
    assert.equal(analyticsGranted.status, 200);
    assert.equal(analyticsGranted.body.user.analyticsConsent, true);
    assert.equal(
      analyticsGranted.body.user.analyticsConsentVersion,
      "allwain-analytics-v1-2026-09-06",
    );
    assert.ok(analyticsGranted.body.user.analyticsConsentUpdatedAt);

    const analyticsWithdrawn = await client.patch(
      "/auth/preferences",
      { analyticsConsent: false },
      headers,
    );
    assert.equal(analyticsWithdrawn.status, 200);
    assert.equal(analyticsWithdrawn.body.user.analyticsConsent, false);

    const unsupported = await client.patch(
      "/auth/preferences",
      { locale: "xx" },
      headers,
    );
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.body.error, "UNSUPPORTED_LOCALE");

    const invalidConsent = await client.patch(
      "/auth/preferences",
      { analyticsConsent: "yes" },
      headers,
    );
    assert.equal(invalidConsent.status, 400);
    assert.equal(invalidConsent.body.error, "INVALID_ANALYTICS_CONSENT");
  });

  it("resets a password once and invalidates both the old password and token", async () => {
    const resetEmail = `reset+${Date.now()}@test.local`;
    const oldPassword = "ResetPassword123!";
    const newPassword = "NewResetPassword456!";
    const registration = await client.post("/auth/register", {
      name: "Reset Test User",
      email: resetEmail,
      password: oldPassword,
      sourceApp: "allwain",
    });
    assert.equal(registration.status, 201);

    const token = await requestPasswordReset(resetEmail);
    assert.equal(typeof token, "string");
    const reset = await client.post("/auth/reset-password", {
      token,
      newPassword,
    });
    assert.equal(reset.status, 200);

    const previousAccess = await client.get("/auth/me", {
      Authorization: `Bearer ${registration.body.token}`,
    });
    assert.equal(previousAccess.status, 401);

    const oldLogin = await client.post("/auth/login", {
      email: resetEmail,
      password: oldPassword,
    });
    assert.equal(oldLogin.status, 401);
    const newLogin = await client.post("/auth/login", {
      email: resetEmail,
      password: newPassword,
    });
    assert.equal(newLogin.status, 200);

    const replay = await client.post("/auth/reset-password", {
      token,
      newPassword: "AnotherPassword789!",
    });
    assert.equal(replay.status, 400);
    assert.equal(replay.body.error, "INVALID_TOKEN");
  });

  it("does not reveal whether a password-reset email exists", async () => {
    const response = await client.post("/auth/forgot-password", {
      email: `unknown+${Date.now()}@test.local`,
      sourceApp: "allwain",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true });
  });

  it("does not allow public registration to self-assign the admin role", async () => {
    const res = await client.post("/auth/register", {
      name: "Public Admin Attempt",
      email: `admin-attempt+${Date.now()}@test.local`,
      password,
      role: "admin",
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, "user");
  });

  it("rejects weak passwords before creating an identity", async () => {
    const res = await client.post("/auth/register", {
      name: "Weak Password",
      email: `weak+${Date.now()}@test.local`,
      password: "short",
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "WEAK_PASSWORD");
  });

  it("rejects malformed identity fields", async () => {
    const invalidEmail = await client.post("/auth/register", {
      name: "Valid Name",
      email: "not-an-email",
      password,
    });
    const invalidName = await client.post("/auth/register", {
      name: " ",
      email: `invalid-name+${Date.now()}@test.local`,
      password,
    });

    assert.equal(invalidEmail.status, 400);
    assert.equal(invalidEmail.body.error, "INVALID_EMAIL");
    assert.equal(invalidName.status, 400);
    assert.equal(invalidName.body.error, "INVALID_NAME");
  });

  it("catches common email-domain typos before creating the account", async () => {
    const response = await client.post("/auth/register", {
      name: "Email Typo Test",
      email: `email-typo-${Date.now()}@gmail.con`,
      password,
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "EMAIL_DOMAIN_TYPO");
    assert.match(response.body.suggestedEmail, /@gmail\.com$/);
  });

  it("reports malformed JSON as a client error", async () => {
    const res = await client.postRawJson<{ error: string }>("/auth/login", "{not-json}");

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "INVALID_JSON");
  });

  it("does not reflect unsafe request identifiers into response headers", async () => {
    const unsafe = "attacker forged-log-entry";
    const response = await client.get("/health", { "x-request-id": unsafe });

    assert.equal(response.status, 200);
    assert.notEqual(response.headers["x-request-id"], unsafe);
    assert.match(response.headers["x-request-id"], /^[0-9a-f-]{36}$/i);
  });

  it("uses a one-time challenge and a verified Apple identity token", async () => {
    const challenge = await client.post("/auth/apple/challenge", {
      sourceApp: "allwain",
    });
    assert.equal(challenge.status, 201);
    assert.equal(typeof challenge.body.nonce, "string");

    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const keyId = "apple-test-key";
    const jwk = publicKey.export({ format: "jwk" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      if (String(input) === "https://appleid.apple.com/auth/keys") {
        return new Response(
          JSON.stringify({
            keys: [{ ...jwk, kid: keyId, use: "sig", alg: "RS256" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const appleEmail = `apple+${Date.now()}@privaterelay.appleid.com`;
      const idToken = jwt.sign(
        {
          sub: `apple-subject-${Date.now()}`,
          email: appleEmail,
          email_verified: "true",
          is_private_email: "true",
          nonce: challenge.body.nonce,
        },
        privateKey,
        {
          algorithm: "RS256",
          keyid: keyId,
          issuer: "https://appleid.apple.com",
          audience: "es.allwain.app",
          expiresIn: "5m",
        },
      );

      const login = await client.post("/auth/apple", {
        idToken,
        nonce: challenge.body.nonce,
        displayName: "Apple Tester",
        sourceApp: "allwain",
      });
      assert.equal(login.status, 200);
      assert.equal(login.body.user.email, appleEmail);
      assert.equal(login.body.user.role, "buyer");
      assert.equal(typeof login.body.token, "string");

      const replay = await client.post("/auth/apple", {
        idToken,
        nonce: challenge.body.nonce,
        sourceApp: "allwain",
      });
      assert.equal(replay.status, 401);
      assert.equal(replay.body.error, "INVALID_APPLE_CHALLENGE");
    } finally {
      globalThis.fetch = originalFetch;
    }
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
      password: "HighAssuranceTestOnly!2026"
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

  it("should block non-admin users from global lead data", async () => {
    const res = await client.get("/leads/global", {
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
