import { create } from "zustand";
import { apiAuthGet } from "../config/api";

type Trade = {
  id: string;
  title: string;
  status?: string;
  participants?: string[];
  tokens?: number;
};

interface TradesState {
  items: Trade[];
  loading: boolean;
  error: string | null;
  loadTrades: () => Promise<void>;
}

export const useTradesStore = create<TradesState>((set) => ({
  items: [],
  loading: false,
  error: null,
  loadTrades: async () => {
    try {
      set({ loading: true, error: null });
      const res = await apiAuthGet<{ items?: Trade[] }>("/trueqia/trades");
      set({ items: res.items || [], loading: false });
    } catch (err: any) {
      set({
        error: err?.message || "ERROR_LOADING_TRADES",
        loading: false,
      });
    }
  },
}));
