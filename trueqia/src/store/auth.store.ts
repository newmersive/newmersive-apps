import { create } from "zustand";

type User = {
  name: string;
  email: string;
  location: string;
};

interface AuthState {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const MOCK_LOCATION = "Valencia, España";

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  login: async (email) => {
    await new Promise((resolve) => setTimeout(resolve, 600));

    set({
      token: "mock-token",
      user: {
        name: "Usuario TRUEQIA",
        email,
        location: MOCK_LOCATION,
      },
    });
  },
  register: async (email) => {
    await new Promise((resolve) => setTimeout(resolve, 600));

    set({
      token: "mock-token",
      user: {
        name: "Nueva cuenta TRUEQIA",
        email,
        location: MOCK_LOCATION,
      },
    });
  },
  logout: () => set({ token: null, user: null }),
}));
