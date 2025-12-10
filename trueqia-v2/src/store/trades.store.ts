import { create } from "zustand";
import { apiAuthGet, apiAuthPost } from "../config/api";

export type Trade = {
  id: string;
  title: string;
  status?: string;
  participants?: string[];
  tokens?: number;
  offerId?: string;
  ownerId?: string;
  offerOwnerId?: string;
  createdAt?: string;
};

interface TradesState {
  items: Trade[];
  loading: boolean;
  error: string | null;
  loadTrades: () => Promise<void>;
  proposeTrade: (payload: {
    offerId: string;
    toUserId: string;
    tokens?: number;
  }) => Promise<Trade | null>;
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
  proposeTrade: async (payload) => {
    try {
      const res = await apiAuthPost<Trade>("/trueqia/trades", {
        ...payload,
        tokens: typeof payload.tokens === "number" ? payload.tokens : undefined,
      });
      set((state) => ({ items: [res, ...state.items] }));
      return res;
    } catch (err: any) {
      set({ error: err?.message || "ERROR_CREATING_TRADE" });
      return null;
    }
  },
}));
