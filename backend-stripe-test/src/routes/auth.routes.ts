import { Router, Request, Response } from "express";
import {
  registerUser,
  loginUser,
  getUserProfile,
  requestPasswordReset,
  resetPassword,
  loginWithGoogle,
  loginWithApple,
  updateUserPreferences,
  suggestEmailCorrection,
  refreshAuthSession,
  logoutAuthSession,
  logoutAllAuthSessions,
  getAuthSessions,
  revokeAuthSession,
} from "../services/auth.service";
import { createAppleLoginChallenge } from "../services/apple-auth.service";
import { AuthRequest, authRequired } from "../middleware/auth.middleware";
import { ENV } from "../config/env";
import {NOA_ACCOUNT_CONSENT_VERSION} from "../services/noa-auth-policy";
import { sendPasswordResetEmail } from "../services/course-mailer.service";
import {
  AUTH_REFRESH_COOKIE,
  AUTH_REFRESH_MAX_AGE_MS,
  AuthSourceApp,
  normalizeAuthSourceApp,
} from "../services/auth-session.service";

const router = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});

function cookieValue(req: Request, name: string) {
  const prefix = `${name}=`;
  const value = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!value) return "";
  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return "";
  }
}

function sourceApp(req: Request): AuthSourceApp {
  return normalizeAuthSourceApp(req.body?.sourceApp || req.body?.app);
}

function sessionContext(req: Request, app = sourceApp(req)) {
  const noaAccountConsent=req.baseUrl==="/api/noa/community/auth"&&app==="newmersive"&&
    ["/register","/login","/google"].includes(req.path)&&req.body?.accountConsent===true&&req.body?.accountConsentVersion===NOA_ACCOUNT_CONSENT_VERSION
    ?{version:NOA_ACCOUNT_CONSENT_VERSION,locale:["es","en","fr","it","zh","ar","ja"].includes(req.body?.locale)?req.body.locale:"es"}:undefined;
  return {
    sourceApp: app,
    ip: req.ip || req.socket.remoteAddress || null,
    userAgent: req.get("user-agent") || null,
    ...(noaAccountConsent?{noaAccountConsent}:{}),
  };
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(AUTH_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: ENV.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: AUTH_REFRESH_MAX_AGE_MS,
  });
}

function authResponseBody(req: Request, result: any) {
  const browserRequest =
    Boolean(req.get("origin")) || req.get("x-newmersive-browser-proxy") === "1";
  if (!browserRequest) return result;
  const { refreshToken: _refreshToken, ...browserSafeResult } = result;
  return browserSafeResult;
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(AUTH_REFRESH_COOKIE, {
    httpOnly: true,
    secure: ENV.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

function errorDetail(err: unknown) {
  if (ENV.NODE_ENV === "development") {
    if (err instanceof Error) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return undefined;
}

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, sponsorCode } = req.body;
    const sourceApp = req.body?.sourceApp || req.body?.app;

    if (!name || !email || !password) {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const result = await registerUser(
      name,
      email,
      password,
      role,
      sponsorCode,
      sourceApp,
      req.body?.locale,
      sessionContext(req, normalizeAuthSourceApp(sourceApp)),
    );

    setRefreshCookie(res, result.refreshToken);
    res.status(201).json(authResponseBody(req, result));
  } catch (err: unknown) {
    if(err instanceof Error&&err.message==="NOA_ACCOUNT_CONSENT_UNAVAILABLE")return void res.status(503).json({error:err.message});
    if (err instanceof Error && err.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
      return;
    }

    if (err instanceof Error && err.message === "EMAIL_DOMAIN_TYPO") {
      res.status(400).json({
        error: "EMAIL_DOMAIN_TYPO",
        suggestedEmail: suggestEmailCorrection(req.body?.email),
      });
      return;
    }

    if (
      err instanceof Error &&
      [
        "INVALID_NAME",
        "INVALID_EMAIL",
        "WEAK_PASSWORD",
        "INVALID_SPONSOR_CODE",
        "REFERRAL_CONNECTOR_NOT_ACTIVE",
      ].includes(err.message)
    ) {
      res.status(400).json({ error: err.message });
      return;
    }

    console.error("AUTH_REGISTER_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password, sessionContext(req));
    setRefreshCookie(res, result.refreshToken);
    res.json(authResponseBody(req, result));
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if(code === "NOA_ACCOUNT_CONSENT_UNAVAILABLE")return void res.status(503).json({error:code});
    if (code === "INVALID_CREDENTIALS") {
      res.status(401).json({ error: "INVALID_CREDENTIALS" });
      return;
    }
    console.error("AUTH_LOGIN_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/google", async (req: Request, res: Response) => {
  try {
    const idToken = String(req.body?.idToken || "");
    if (!idToken) {
      res.status(400).json({ error: "MISSING_GOOGLE_TOKEN" });
      return;
    }
    const result = await loginWithGoogle(
      idToken,
      req.body?.sponsorCode,
      req.body?.sourceApp === "newmersive" ? "newmersive" : req.body?.sourceApp === "trueqia" ? "trueqia" : "allwain",
      req.body?.locale,
      sessionContext(req),
    );
    setRefreshCookie(res, result.refreshToken);
    res.json(authResponseBody(req, result));
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "INVALID_GOOGLE_TOKEN";
    if (code === "GOOGLE_AUTH_NOT_CONFIGURED" || code === "NOA_ACCOUNT_CONSENT_UNAVAILABLE") {
      res.status(503).json({ error: code });
      return;
    }
    if (code === "AUTH_IDENTITY_CONFLICT") {
      res.status(409).json({ error: code });
      return;
    }
    if (code === "INVALID_GOOGLE_TOKEN" || code === "UNVERIFIED_GOOGLE_EMAIL" || code === "INVALID_CREDENTIALS") {
      res.status(401).json({ error: code });
      return;
    }
    if (code === "INVALID_SPONSOR_CODE" || code === "REFERRAL_CONNECTOR_NOT_ACTIVE") {
      res.status(400).json({ error: code });
      return;
    }
    console.error("AUTH_GOOGLE_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/apple/challenge", async (req: Request, res: Response) => {
  try {
    const sourceApp = req.body?.sourceApp === "trueqia" ? "trueqia" : "allwain";
    const challenge = await createAppleLoginChallenge(sourceApp);
    res.status(201).json(challenge);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (code === "APPLE_AUTH_NOT_CONFIGURED") {
      res.status(503).json({ error: code });
      return;
    }
    console.error("AUTH_APPLE_CHALLENGE_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/apple", async (req: Request, res: Response) => {
  try {
    const idToken = String(req.body?.idToken || "");
    const nonce = String(req.body?.nonce || "");
    if (!idToken || !nonce) {
      res.status(400).json({ error: "MISSING_APPLE_CREDENTIALS" });
      return;
    }
    const result = await loginWithApple(
      idToken,
      nonce,
      req.body?.displayName,
      req.body?.sponsorCode,
      req.body?.sourceApp === "trueqia" ? "trueqia" : "allwain",
      req.body?.locale,
      sessionContext(req),
    );
    setRefreshCookie(res, result.refreshToken);
    res.json(authResponseBody(req, result));
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "INVALID_APPLE_TOKEN";
    if (code === "APPLE_AUTH_NOT_CONFIGURED" || code === "APPLE_KEYS_UNAVAILABLE") {
      res.status(503).json({ error: code });
      return;
    }
    if (code === "APPLE_EMAIL_REQUIRED") {
      res.status(422).json({ error: code });
      return;
    }
    if (code === "AUTH_IDENTITY_CONFLICT") {
      res.status(409).json({ error: code });
      return;
    }
    if (code === "INVALID_APPLE_TOKEN" || code === "INVALID_APPLE_CHALLENGE" || code === "INVALID_CREDENTIALS") {
      res.status(401).json({ error: code });
      return;
    }
    if (code === "INVALID_SPONSOR_CODE" || code === "REFERRAL_CONNECTOR_NOT_ACTIVE") {
      res.status(400).json({ error: code });
      return;
    }
    console.error("AUTH_APPLE_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const refreshToken = String(
      req.body?.refreshToken || cookieValue(req, AUTH_REFRESH_COOKIE) || "",
    );
    const result = await refreshAuthSession(refreshToken, sessionContext(req));
    setRefreshCookie(res, result.refreshToken);
    res.json(authResponseBody(req, result));
  } catch (err: unknown) {
    clearRefreshCookie(res);
    const code = err instanceof Error ? err.message : "INVALID_REFRESH_TOKEN";
    const known = [
      "INVALID_REFRESH_TOKEN",
      "REFRESH_TOKEN_REUSED",
      "REFRESH_TOKEN_REVOKED",
      "REFRESH_TOKEN_EXPIRED",
    ].includes(code);
    res.status(401).json({ error: known ? code : "INVALID_REFRESH_TOKEN" });
  }
});

router.get("/me", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const user = await getUserProfile(userId);
    res.json(user);
  } catch (err: unknown) {
    console.error("AUTH_ME_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/logout", authRequired, async (req: Request, res: Response) => {
  const current = (req as AuthRequest).user;
  if (current) await logoutAuthSession(current.id, current.sessionId);
  clearRefreshCookie(res);
  res.json({ ok: true });
});

router.post("/logout-all", authRequired, async (req: Request, res: Response) => {
  const current = (req as AuthRequest).user;
  if (current) await logoutAllAuthSessions(current.id);
  clearRefreshCookie(res);
  res.json({ ok: true });
});

router.get("/sessions", authRequired, async (req: Request, res: Response) => {
  const current = (req as AuthRequest).user;
  if (!current) return res.status(401).json({ error: "UNAUTHORIZED" });
  const items = await getAuthSessions(current.id, current.sessionId);
  return res.json({ items });
});

router.delete("/sessions/:sessionId", authRequired, async (req: Request, res: Response) => {
  try {
    const current = (req as AuthRequest).user;
    if (!current) return res.status(401).json({ error: "UNAUTHORIZED" });
    const result = await revokeAuthSession(
      current.id,
      current.sessionId,
      String(req.params.sessionId || ""),
    );
    if (result.currentRevoked) clearRefreshCookie(res);
    return res.json({ ok: true, ...result });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "SESSION_NOT_FOUND") {
      return res.status(404).json({ error: "SESSION_NOT_FOUND" });
    }
    throw err;
  }
});

router.patch("/preferences", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const user = await updateUserPreferences(userId, {
      locale: req.body?.locale,
      analyticsConsent: req.body?.analyticsConsent,
    });
    res.json({ user });
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (
      code === "UNSUPPORTED_LOCALE" ||
      code === "INVALID_ANALYTICS_CONSENT" ||
      code === "EMPTY_PREFERENCES"
    ) {
      res.status(400).json({ error: code });
      return;
    }
    if (code === "USER_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    console.error("AUTH_PREFERENCES_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email, sourceApp } = req.body;
    const token = typeof email === "string" && email.trim() ? await requestPasswordReset(email) : undefined;
    if (token && email) await sendPasswordResetEmail({
      email: String(email).trim().toLowerCase(),
      token,
      sourceApp: sourceApp === "allwain" ? "allwain" : undefined,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("AUTH_FORGOT_PASSWORD_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    await resetPassword(token, newPassword);
    res.json({ ok: true });
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (["INVALID_RESET", "INVALID_TOKEN", "USER_NOT_FOUND"].includes(code)) {
      res.status(400).json({ error: "INVALID_TOKEN" });
      return;
    }
    console.error("AUTH_RESET_PASSWORD_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR", detail: errorDetail(err) });
  }
});

export default router;
