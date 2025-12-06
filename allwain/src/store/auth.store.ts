import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { apiPost, AuthResponse } from "../config/api";

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  sessionMessage: string | null;
  setAuth: (payload: AuthResponse) => void;
  clearAuth: () => void;
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (name: string, email: string, password: string) => Promise<AuthResponse>;
  logout: (message?: string) => Promise<void>;
  clearSessionMessage: () => void;
}

const STORAGE_KEY = "allwain_auth";

async function persistAuth(token: string, user: User) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

async function clearPersistedAuth() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  sessionMessage: null,
  setAuth: ({ token, user }) => set({ token, user }),
  clearAuth: () => set({ token: null, user: null }),
  restoreSession: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.token && parsed?.user) {
        set({ token: parsed.token, user: parsed.user });
      }
    } finally {
      set({ hydrated: true });
    }
  },
  login: async (email, password) => {
    const result = await apiPost<AuthResponse>("/auth/login", { email, password });
    await persistAuth(result.token, result.user);
    set({ token: result.token, user: result.user, sessionMessage: null });
    return result;
  },
  register: async (name, email, password) => {
    const result = await apiPost<AuthResponse>("/auth/register", { name, email, password });
    await persistAuth(result.token, result.user);
    set({ token: result.token, user: result.user, sessionMessage: null });
    return result;
  },
  logout: async (message) => {
    await clearPersistedAuth();
    set({ token: null, user: null, sessionMessage: message ?? null });
  },
  clearSessionMessage: () => set({ sessionMessage: null }),
}));
