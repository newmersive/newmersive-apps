import { create } from "zustand";
import type { AuthResponse } from "../config/api";

interface AuthState {
  token: string | null;
  user: AuthResponse["user"] | null;
  setAuth: (payload: AuthResponse) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: (payload) =>
    set({
      token: payload.token,
      user: payload.user,
    }),
  clearAuth: () => set({ token: null, user: null }),
}));
