import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { apiPost, AuthResponse } from "../config/api";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  sponsorCode?: string;
  qrCode?: string;
  referredByCode?: string;
  avatarUrl?: string;
  tokens?: number;
  tokensFromInvites?: number;
  invitedUsers?: Array<{
    id: string;
    name: string;
    email?: string;
    avatarUrl?: string;
    tokensEarned?: number;
    tokensAwarded?: number;
  }>;
};

interface AuthState {
  token: string | null;
  user: User | null;
  sessionMessage: string | null;
  hydrated: boolean;
  setAuth: (payload: AuthResponse) => void;
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    sponsorCode?: string,
  ) => Promise<void>;
  logout: (message?: string) => Promise<void>;
  clearSessionMessage: () => void;
}

const STORAGE_KEY = "trueqia_auth";

async function persistAuth(token: string, user: User) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

async function clearPersistedAuth() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  sessionMessage: null,
  hydrated: false,
  setAuth: ({ token, user }) => set({ token, user }),
  restoreSession: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.token && parsed?.user) {
        set({ token: parsed.token, user: parsed.user });
      }
    } catch (err) {
      await clearPersistedAuth();
    } finally {
      set({ hydrated: true });
    }
  },
  login: async (email, password) => {
    const res = await apiPost<AuthResponse>("/auth/login", { email, password });
    await persistAuth(res.token, res.user);
    set({ token: res.token, user: res.user, sessionMessage: null });
  },
  register: async (name, email, password, sponsorCode) => {
    const res = await apiPost<AuthResponse>("/auth/register", {
      name,
      email,
      password,
      ...(sponsorCode ? { sponsorCode } : {}),
    });
    await persistAuth(res.token, res.user);
    set({ token: res.token, user: res.user, sessionMessage: null });
  },
  logout: async (message) => {
    await clearPersistedAuth();
    set({ token: null, user: null, sessionMessage: message ?? null });
  },
  clearSessionMessage: () => set({ sessionMessage: null }),
}));
