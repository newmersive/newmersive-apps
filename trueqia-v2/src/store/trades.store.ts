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
};

interface TradesState {
  items: Trade[];
  loading: boolean;
  error: string | null;
  loadTrades: () => Promise<void>;
  fetchTradeById: (id: string) => Promise<Trade | null>;
  acceptTrade: (id: string) => Promise<Trade | null>;
  rejectTrade: (id: string) => Promise<Trade | null>;
  proposeTrade: (payload: { offerId: string; toUserId: string }) => Promise<Trade | null>;
}

export const useTradesStore = create<TradesState>((set, get) => ({
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
  fetchTradeById: async (id) => {
    try {
      set({ loading: true, error: null });
      const trade = await apiAuthGet<Trade>(`/trueqia/trades/${id}`);
      set((state) => {
        const exists = state.items.some((item) => item.id === trade.id);
        return {
          loading: false,
          items: exists
            ? state.items.map((item) => (item.id === trade.id ? trade : item))
            : [trade, ...state.items],
        };
      });
      return trade;
    } catch (err: any) {
      set({ error: err?.message || "ERROR_LOADING_TRADE", loading: false });
      return null;
    }
  },
  acceptTrade: async (id) => {
    try {
      const res = await apiAuthPost<Trade>(`/trueqia/trades/${id}/accept`, {});
      await get().loadTrades();
      return res;
    } catch (err: any) {
      set({ error: err?.message || "ERROR_ACCEPTING_TRADE" });
      return null;
    }
  },
  rejectTrade: async (id) => {
    try {
      const res = await apiAuthPost<Trade>(`/trueqia/trades/${id}/reject`, {});
      await get().loadTrades();
      return res;
    } catch (err: any) {
      set({ error: err?.message || "ERROR_REJECTING_TRADE" });
      return null;
    }
  },
  proposeTrade: async (payload) => {
    try {
      const res = await apiAuthPost<Trade>("/trueqia/trades", payload);
      set((state) => ({ items: [res, ...state.items] }));
      return res;
    } catch (err: any) {
      set({ error: err?.message || "ERROR_CREATING_TRADE" });
      return null;
    }
  },
}));
