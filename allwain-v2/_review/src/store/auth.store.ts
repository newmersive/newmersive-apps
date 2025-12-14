import { create } from "zustand";

type User = {
  id: string;
  email: string;
  role: string;
};

type AuthState = {
  token: string | null;
  user: User | null;
  setAuth: (data: { token: string; user: User }) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,

  setAuth: (data) =>
    set({
      token: data.token,
      user: data.user,
    }),

  clearAuth: () =>
    set({
      token: null,
      user: null,
    }),
}));
