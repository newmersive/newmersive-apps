import { create } from "zustand";

export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const MOCK_DELAY = 700;

const buildUser = (email: string): User => ({
  id: 1,
  name: "Allwain User",
  email,
  role: "Comprador",
});

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  login: (email, _password) =>
    new Promise((resolve) => {
      setTimeout(() => {
        const mockUser = buildUser(email);
        set({ user: mockUser });
        resolve(mockUser);
      }, MOCK_DELAY);
    }),
  register: (email, _password) =>
    new Promise((resolve) => {
      setTimeout(() => {
        const mockUser = buildUser(email);
        set({ user: mockUser });
        resolve(mockUser);
      }, MOCK_DELAY);
    }),
  logout: () => set({ user: null }),
}));
