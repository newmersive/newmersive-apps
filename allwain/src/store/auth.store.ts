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
  setAuth: (payload: AuthResponse) => void;
  clearAuth: () => void;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (name: string, email: string, password: string) => Promise<AuthResponse>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: ({ token, user }) => set({ token, user }),
  clearAuth: () => set({ token: null, user: null }),
  login: async (email, password) => {
    const result = await apiPost<AuthResponse>("/auth/login", { email, password });
    set({ token: result.token, user: result.user });
    return result;
  },
  register: async (name, email, password) => {
    const result = await apiPost<AuthResponse>("/auth/register", { name, email, password });
    set({ token: result.token, user: result.user });
    return result;
  },
  logout: () => set({ token: null, user: null }),
}));
