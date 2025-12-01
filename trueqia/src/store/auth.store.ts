import { create } from "zustand";
import { apiPost, AuthResponse } from "../config/api";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (payload: AuthResponse) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: ({ token, user }) => set({ token, user }),
  login: async (email, password) => {
    const res = await apiPost<AuthResponse>("/auth/login", { email, password });
    set({ token: res.token, user: res.user });
  },
  register: async (name, email, password) => {
    const res = await apiPost<AuthResponse>("/auth/register", { name, email, password });
    set({ token: res.token, user: res.user });
  },
  logout: () => set({ token: null, user: null }),
}));
