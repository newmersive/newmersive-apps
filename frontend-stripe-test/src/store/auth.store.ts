import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiAuthPatch, apiAuthPost, apiPost } from "../config/api";
import type { AllwainParticipation, AuthResponse } from "../config/api";
import {
  detectAppLocale,
  normalizeAppLocale,
  type AppLocale,
} from "../i18n";
import { normalizeAllwainParticipation } from "../utils/allwainParticipation";
import { loadSession, removeSession, saveSession } from "../utils/sessionStorage";
import { registerAuthSessionBridge } from "./authSessionBridge";
import { webAuthCoordination } from "../utils/webAuthCoordination";
import { trackAnalyticsEvent } from "../analytics";

type User = {
  id: string;
  email: string;
  role: string;
  name?: string;
  preferredLocale?: string | null;
  analyticsConsent?: boolean | null;
  analyticsConsentVersion?: string | null;
  analyticsConsentUpdatedAt?: string | null;
  sponsorCode?: string;
  referredByCode?: string;
  tokens?: number;
  participation?: AllwainParticipation;
};

export type AllwainAppMode = "buy" | "sell" | "connector";

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  appMode: AllwainAppMode;
  locale: AppLocale;
  hydrated: boolean;
  sessionMessage: string | null;
  setAuth: (data: {
    token: string;
    refreshToken?: string;
    user: User;
  }) => Promise<void>;
  clearAuth: (message?: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string, sponsorCode?: string) => Promise<void>;
  createAppleLoginChallenge: () => Promise<string>;
  loginWithApple: (
    idToken: string,
    nonce: string,
    displayName?: string,
    sponsorCode?: string,
  ) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    sponsorCode?: string,
    role?: string,
  ) => Promise<void>;
  clearSessionMessage: () => void;
  setAppMode: (mode: AllwainAppMode) => Promise<void>;
  setParticipation: (participation: AllwainParticipation) => Promise<void>;
  setLocale: (locale: AppLocale) => Promise<void>;
  setAnalyticsConsent: (granted: boolean) => Promise<void>;
};

const STORAGE_KEY = "allwain_auth";
const LOCALE_STORAGE_KEY = "allwain:locale:v1";
const LOCALE_SYNC_PENDING_KEY = "allwain:locale:pending:v1";
let restoreSessionPromise: Promise<void> | null = null;
let authRevision = 0;
let sessionGeneration = 0;
let authTransition = false;
let refreshRevision = 0;
let participationRevision = 0;
let localeRevision = 0;
let analyticsRevision = 0;
let authStorageTail: Promise<unknown> = Promise.resolve();
type IsCurrentAuth = () => boolean;

function currentAuthGeneration(): IsCurrentAuth {
  const revision = authRevision;
  const epochCurrent = webAuthCoordination.capture();
  return () => epochCurrent() && revision === authRevision;
}

function beginAuthGeneration(): IsCurrentAuth {
  authRevision++;
  sessionGeneration++;
  authTransition = false;
  refreshRevision++;
  return currentAuthGeneration();
}

async function runIdentityTransition<T>(work: (current: IsCurrentAuth) => Promise<T>): Promise<T> {
  webAuthCoordination.announce();
  const current = beginAuthGeneration();
  if (!current()) throw new Error("SESSION_CHANGED");
  authTransition = true;
  try { return await work(current); }
  finally { if (current()) authTransition = false; }
}

function serializeAuthStorage<T>(current: IsCurrentAuth, operation: () => Promise<T>): Promise<T | undefined> {
  const pending = authStorageTail.catch(() => undefined).then(() => webAuthCoordination.withProfileLock(async () => {
    if (!current()) return undefined;
    const value = await operation();
    return current() ? value : undefined;
  }));
  // An in-flight native write cannot be canceled. Finish it before the next
  // identity's save/remove, and skip superseded work that has not started yet.
  authStorageTail = pending.catch(() => undefined);
  return pending;
}

async function loadStoredLocale() {
  const [stored, pending] = await Promise.all([
    AsyncStorage.getItem(LOCALE_STORAGE_KEY),
    AsyncStorage.getItem(LOCALE_SYNC_PENDING_KEY),
  ]);
  return {
    locale: normalizeAppLocale(stored),
    pending: normalizeAppLocale(pending),
  };
}

async function storeLocale(locale: AppLocale, pending: boolean, current: IsCurrentAuth) {
  await serializeAuthStorage(current, async () => {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
    if (pending) await AsyncStorage.setItem(LOCALE_SYNC_PENDING_KEY, locale);
    else await AsyncStorage.removeItem(LOCALE_SYNC_PENDING_KEY);
  });
}

function defaultAppMode(user?: User | null): AllwainAppMode {
  return "buy";
}

function normalizeUser(user: User): User {
  return {
    ...user,
    participation: normalizeAllwainParticipation(user.participation),
  };
}

async function persistAuth(data: {
  refreshToken?: string | null;
  user: User;
  appMode?: AllwainAppMode;
}, current: IsCurrentAuth, publish: () => void) {
  const { refreshToken, ...profile } = data;
  await serializeAuthStorage(current, async () => {
    await saveSession(STORAGE_KEY, refreshToken ?? null, profile);
    // Publish before releasing the queue: the next profile write must see the
    // credential that was just persisted, never the previous rotated token.
    if (current()) publish();
  });
  return current();
}

async function persistCurrentAuthProfile(current: IsCurrentAuth, get: () => AuthState) {
  await serializeAuthStorage(current, async () => {
    const { refreshToken, user, appMode } = get();
    if (user) await saveSession(STORAGE_KEY, refreshToken, { user, appMode });
  });
  return current();
}

async function clearPersistedAuth(current: IsCurrentAuth) {
  if (!current()) return;
  const remoteCurrent = webAuthCoordination.captureRemote();
  // Once queued, revocation remains a barrier even if the next identity starts.
  // Its later save follows this removal; a failed later save cannot retain A.
  await serializeAuthStorage(remoteCurrent, () => removeSession(STORAGE_KEY));
}

async function commitAuth(data: { token: string; refreshToken?: string | null; user: User }, current: IsCurrentAuth,
  set: (value: Partial<AuthState>) => void, get: () => AuthState) {
  if (!current()) return false;
  const user = normalizeUser(data.user);
  const appMode = defaultAppMode(user);
  return persistAuth({ refreshToken: data.refreshToken ?? null, user, appMode }, current, () => {
    // A request may have captured A while B's login/save was pending. End that
    // transport generation at publication without invalidating B's own guards.
    sessionGeneration++;
    authTransition = false;
    set({ token: data.token, refreshToken: data.refreshToken ?? null, user, appMode,
      locale: normalizeAppLocale(user.preferredLocale) || get().locale, sessionMessage: null, hydrated: true });
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  appMode: "buy",
  locale: detectAppLocale(),
  hydrated: false,
  sessionMessage: null,

  setAuth: async (data) => {
    await runIdentityTransition(current => commitAuth(data, current, set, get));
  },

  clearAuth: async (message) => {
    const revision = authRevision;
    const ownsIdentity = () => revision === authRevision && Boolean(get().token || authTransition);
    try { if (!webAuthCoordination.announce(ownsIdentity)) return; }
    catch {
      // Without the durable marker, do not mutate a cookie/profile shared with
      // a peer that cannot observe us. Local clearing remains available.
      beginAuthGeneration();
      set({ token: null, refreshToken: null, user: null, appMode: "buy", hydrated: true,
        sessionMessage: "La sesion local esta cerrada, pero no se ha podido confirmar el cierre en el servidor. Comprueba el almacenamiento del navegador." });
      return;
    }
    const current = beginAuthGeneration();
    if (!current()) return;
    // Capture the authenticated request before clearing its bridge token. Local
    // revocation and queued storage removal do not wait for the network.
    const logout = get().token ? apiAuthPost("/auth/logout", {}).catch(() => undefined) : Promise.resolve();
    const removal = clearPersistedAuth(current);
    set({ token: null, refreshToken: null, user: null, appMode: "buy", hydrated: true, sessionMessage: message ?? null });
    await Promise.all([logout, removal]);
  },

  restoreSession: async () => {
    if (get().hydrated) return;
    if (restoreSessionPromise) {
      await restoreSessionPromise;
      return;
    }
    // An explicit login already owns hydration; a later automatic restore must
    // not compete with it using the previous device's refresh credential.
    if (authTransition) return;

    const current = beginAuthGeneration();
    authTransition = true;
    const pending = (async () => {
      let storedLocale: AppLocale | null = null;
      let pendingLocale: AppLocale | null = null;
      try {
        const [session, localeState] = await Promise.all([
          serializeAuthStorage(current, () => loadSession<{
            user: User;
            appMode?: AllwainAppMode;
          }>(STORAGE_KEY)),
          loadStoredLocale(),
        ]);
        if (!current()) return;
        storedLocale = localeState.locale;
        pendingLocale = localeState.pending;
        const appMode: AllwainAppMode =
          session?.data?.appMode === "buy" ||
          session?.data?.appMode === "sell" ||
          session?.data?.appMode === "connector"
            ? session.data.appMode
            : defaultAppMode(session?.data?.user);
        const response = await apiPost<AuthResponse>("/auth/refresh", {
          refreshToken: session?.refreshToken || undefined,
          sourceApp: "allwain",
        });
        if (!current()) return;
        const refreshToken =
          response.refreshToken ?? session?.refreshToken ?? null;
        const user = normalizeUser(response.user);
        const locale =
          pendingLocale ||
          normalizeAppLocale(user.preferredLocale) ||
          storedLocale ||
          get().locale;
        if (!await persistAuth({ refreshToken, user, appMode }, current, () => {
          sessionGeneration++;
          authTransition = false;
          set({ token: response.token, refreshToken, user, appMode, locale, sessionMessage: null });
        })) return;
        await storeLocale(locale, Boolean(pendingLocale), current);
        if (current() && pendingLocale) void get().setLocale(pendingLocale);
      } catch {
        if (!current()) return;
        await clearPersistedAuth(current);
        if (!current()) return;
        if (!storedLocale) {
          storedLocale = (await loadStoredLocale()).locale;
        }
        if (!current()) return;
        set({
          token: null,
          refreshToken: null,
          user: null,
          appMode: "buy",
          locale: storedLocale || get().locale,
        });
      } finally {
        if (current()) { authTransition = false; set({ hydrated: true }); }
      }
    })();

    restoreSessionPromise = pending;
    try {
      await pending;
    } finally {
      if (restoreSessionPromise === pending) restoreSessionPromise = null;
    }
  },

  refreshAccessToken: async () => {
    if (authTransition) return null;
    const generation = currentAuthGeneration();
    const request = ++refreshRevision;
    const ownerId = get().user?.id;
    const accessToken = get().token;
    const currentRefreshToken = get().refreshToken;
    const profileRevisions = { participationRevision, localeRevision, analyticsRevision };
    if (!ownerId || !accessToken) return null;
    const current = () => generation() && request === refreshRevision && get().user?.id === ownerId && get().token === accessToken;
    try {
      const response = await apiPost<AuthResponse>("/auth/refresh", {
        refreshToken: currentRefreshToken || undefined,
        sourceApp: "allwain",
      });
      if (!current() || response.user.id !== ownerId) return null;
      const refreshToken = response.refreshToken ?? currentRefreshToken;
      const refreshedUser = () => {
        const user = normalizeUser(response.user);
        const latest = get().user;
        // A refresh response cannot undo explicit profile changes made while
        // its request or native save was pending. Other server fields stay fresh.
        if (latest && participationRevision !== profileRevisions.participationRevision) user.participation = latest.participation;
        if (latest && localeRevision !== profileRevisions.localeRevision) user.preferredLocale = latest.preferredLocale;
        if (latest && analyticsRevision !== profileRevisions.analyticsRevision) {
          user.analyticsConsent = latest.analyticsConsent;
          user.analyticsConsentVersion = latest.analyticsConsentVersion;
          user.analyticsConsentUpdatedAt = latest.analyticsConsentUpdatedAt;
        }
        return user;
      };
      const accepted = await serializeAuthStorage(generation, async () => {
        if (!current()) return null;
        await saveSession(STORAGE_KEY, refreshToken, { user: refreshedUser(), appMode: get().appMode });
        if (!current()) return null;
        const user = refreshedUser();
        set({ token: response.token, refreshToken, user,
          locale: normalizeAppLocale(user.preferredLocale) || get().locale });
        return response.token;
      });
      return accepted ?? null;
    } catch {
      return null;
    }
  },

  login: async (email, password) => runIdentityTransition(async current => {
    const res = await apiPost<AuthResponse>("/auth/login", {
      email: email.trim().toLowerCase(),
      password,
      sourceApp: "allwain",
      locale: get().locale,
    });

    if (await commitAuth(res, current, set, get)) void trackAnalyticsEvent("login", { method: "password" });
  }),

  register: async (name, email, password, sponsorCode, role) => runIdentityTransition(async current => {
    const res = await apiPost<AuthResponse>("/auth/register", {
      name,
      email: email.trim().toLowerCase(),
      password,
      sponsorCode: sponsorCode?.trim() || undefined,
      ...(role ? { role } : {}),
      sourceApp: "allwain",
      locale: get().locale,
    });

    if (await commitAuth(res, current, set, get)) void trackAnalyticsEvent("sign_up", { method: "password" });
  }),

  loginWithGoogle: async (idToken, sponsorCode) => runIdentityTransition(async current => {
    const res = await apiPost<AuthResponse>("/auth/google", {
      idToken,
      sponsorCode: sponsorCode?.trim() || undefined,
      sourceApp: "allwain",
      locale: get().locale,
    });
    if (await commitAuth(res, current, set, get)) void trackAnalyticsEvent("login", { method: "google" });
  }),

  createAppleLoginChallenge: async () => {
    const res = await apiPost<{ nonce: string; expiresAt: string }>(
      "/auth/apple/challenge",
      { sourceApp: "allwain" },
    );
    if (!res.nonce) throw new Error("APPLE_CHALLENGE_MISSING");
    return res.nonce;
  },

  loginWithApple: async (idToken, nonce, displayName, sponsorCode) => runIdentityTransition(async current => {
    const res = await apiPost<AuthResponse>("/auth/apple", {
      idToken,
      nonce,
      displayName: displayName?.trim() || undefined,
      sponsorCode: sponsorCode?.trim() || undefined,
      sourceApp: "allwain",
      locale: get().locale,
    });
    if (await commitAuth(res, current, set, get)) void trackAnalyticsEvent("login", { method: "apple" });
  }),

  clearSessionMessage: () => set({ sessionMessage: null }),

  setAppMode: async (mode) => {
    const current = currentAuthGeneration();
    const { user } = get();
    const appMode: AllwainAppMode = mode;
    set({ appMode });
    if (user) {
      await persistCurrentAuthProfile(current, get);
    }
    void trackAnalyticsEvent("app_mode_changed", { app_mode: mode });
  },

  setParticipation: async (participation) => {
    const current = currentAuthGeneration();
    const { token, user } = get();
    if (!token || !user) return;
    participationRevision++;
    const nextUser = {
      ...user,
      participation: normalizeAllwainParticipation(participation),
    };
    set({ user: nextUser });
    await persistCurrentAuthProfile(current, get);
  },

  setLocale: async (locale) => {
    const current = currentAuthGeneration();
    const { token, user } = get();
    const localUser = user ? { ...user, preferredLocale: locale } : null;
    localeRevision++;
    set({ locale, ...(localUser ? { user: localUser } : {}) });
    await storeLocale(locale, Boolean(token && localUser), current);

    if (!current() || !token || !user) {
      return;
    }
    if (!await persistCurrentAuthProfile(current, get)) return;

    try {
      const response = await apiAuthPatch<{ user: User }>("/auth/preferences", {
        locale,
      });
      if (!current() || get().user?.id !== user.id || response.user.id !== user.id) return;
      const nextUser = normalizeUser({
        ...response.user,
        preferredLocale: locale,
      });
      set({ locale, user: nextUser });
      await Promise.all([
        persistCurrentAuthProfile(current, get),
        storeLocale(locale, false, current),
      ]);
    } catch {
      // The selected language remains usable offline and is retried next time
      // the authenticated session is restored.
    }
  },

  setAnalyticsConsent: async (granted) => {
    const current = currentAuthGeneration();
    const { token, user } = get();
    if (!token || !user) return;
    const response = await apiAuthPatch<{ user: User }>("/auth/preferences", {
      analyticsConsent: granted,
    });
    if (!current() || get().user?.id !== user.id || get().token !== token || response.user.id !== user.id) return;
    analyticsRevision++;
    const nextUser = normalizeUser(response.user);
    set({ user: nextUser });
    await persistCurrentAuthProfile(current, get);
  },
}));

registerAuthSessionBridge({
  getGeneration: () => { webAuthCoordination.reconcile(); return sessionGeneration; },
  getIsTransitioning: () => { webAuthCoordination.reconcile(); return authTransition; },
  getToken: () => { webAuthCoordination.reconcile(); return useAuthStore.getState().token; },
  refreshToken: () => useAuthStore.getState().refreshAccessToken(),
  expireSession: async (message) => {
    const current = beginAuthGeneration();
    const removal = clearPersistedAuth(current);
    useAuthStore.setState({
      token: null,
      refreshToken: null,
      user: null,
      appMode: "buy",
      hydrated: true,
      sessionMessage: message,
    });
    await removal;
  },
});

webAuthCoordination.subscribe(() => {
  // A peer changed the shared cookie. Retire only this tab's memory; deleting
  // the shared profile or calling logout here could destroy its new identity.
  beginAuthGeneration();
  useAuthStore.setState({ token: null, refreshToken: null, user: null, appMode: "buy", hydrated: true,
    sessionMessage: "La sesion ha cambiado en otra pestana. Vuelve a iniciar sesion." });
});
