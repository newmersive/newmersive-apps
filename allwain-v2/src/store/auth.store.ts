import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { apiPost, AuthResponse } from "../config/api";

type User = {
  id: string;
  email: string;
  role: string;
  name?: string;
  sponsorCode?: string;
  referredByCode?: string;
  tokens?: number;
};

type AuthState = {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  sessionMessage: string | null;
  setAuth: (data: { token: string; user: User }) => Promise<void>;
  clearAuth: () => Promise<void>;
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    sponsorCode?: string,
    role?: string,
  ) => Promise<void>;
  clearSessionMessage: () => void;
};

const STORAGE_KEY = "allwain_auth";

async function persistAuth(data: { token: string; user: User }) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function clearPersistedAuth() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  sessionMessage: null,

  setAuth: async (data) => {
    await persistAuth(data);
    set({
      token: data.token,
      user: data.user,
      sessionMessage: null,
    });
  },

  clearAuth: async () => {
    await clearPersistedAuth();
    set({ token: null, user: null });
  },

  restoreSession: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.token && parsed?.user) {
        set({ token: parsed.token, user: parsed.user });
      }
    } catch {
      await clearPersistedAuth();
    } finally {
      set({ hydrated: true });
    }
  },

  login: async (email, password) => {
    const res = await apiPost<AuthResponse>("/auth/login", {
      email: email.trim().toLowerCase(),
      password: password.trim(),
    });

    await persistAuth(res);
    set({ token: res.token, user: res.user, sessionMessage: null });
  },

  register: async (name, email, password, sponsorCode, role) => {
    const res = await apiPost<AuthResponse>("/auth/register", {
      name,
      email: email.trim().toLowerCase(),
      password: password.trim(),
      sponsorCode: sponsorCode?.trim() || undefined,
      ...(role ? { role } : {}),
      app: "allwain",
    });

    await persistAuth(res);
    set({ token: res.token, user: res.user, sessionMessage: null });
  },

  clearSessionMessage: () => set({ sessionMessage: null }),
}));
