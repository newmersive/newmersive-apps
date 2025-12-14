import { create } from "zustand";
import { apiAuthGet, apiAuthPost } from "../config/api";
import { TrueqiaOffer } from "./offers.store";

export type Trade = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  tokens?: number;
  ownerId?: string;
  offerId?: string;
  participants?: string[];
  offer?: TrueqiaOffer;
};

type TradesState = {
  items: Trade[];
  loading: boolean;
  error: string | null;
  loadTrades: () => Promise<void>;
  fetchTradeById: (id: string) => Promise<Trade | null>;
  acceptTrade: (id: string) => Promise<Trade | null>;
  rejectTrade: (id: string) => Promise<Trade | null>;
  proposeTrade?: (payload: {
    offerId: string;
    toUserId?: string;
    tokens?: number;
  }) => Promise<Trade | null>;
};

function getMessage(err: any, fallback: string) {
  if (err?.message === "SESSION_EXPIRED") return "SESSION_EXPIRED";
  if (err?.message === "Network request failed") return "No se pudo conectar con el servidor";
  return err?.message || fallback;
}

export const useTradesStore = create<TradesState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  loadTrades: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiAuthGet<{ items?: Trade[] }>("/trueqia/trades");
      const items = Array.isArray(res?.items) ? res.items : [];
      set({ items, loading: false });
    } catch (err: any) {
      set({ error: getMessage(err, "No se pudieron cargar los trueques."), loading: false });
    }
  },

  fetchTradeById: async (id: string) => {
    try {
      const res = await apiAuthGet<{ trade?: Trade } | Trade>(`/trueqia/trades/${id}`);
      const trade = (res as any)?.trade ?? res;
      if (trade && typeof trade === "object") {
        const current = get().items;
        const exists = current.find((t) => t.id === trade.id);
        const updated = exists
          ? current.map((t) => (t.id === trade.id ? { ...t, ...trade } : t))
          : [...current, trade];
        set({ items: updated });
        return trade as Trade;
      }
    } catch (err: any) {
      set({ error: getMessage(err, "No se pudo cargar el trueque."), loading: false });
    }
    return null;
  },

  acceptTrade: async (id: string) => {
    try {
      const res = await apiAuthPost<Trade>(`/trueqia/trades/${id}/accept`, {});
      const updated = get().items.map((t) => (t.id === res.id ? { ...t, ...res } : t));
      set({ items: updated });
      return res;
    } catch (err: any) {
      set({ error: getMessage(err, "No se pudo aceptar el trueque."), loading: false });
      return null;
    }
  },

  rejectTrade: async (id: string) => {
    try {
      const res = await apiAuthPost<Trade>(`/trueqia/trades/${id}/reject`, {});
      const updated = get().items.map((t) => (t.id === res.id ? { ...t, ...res } : t));
      set({ items: updated });
      return res;
    } catch (err: any) {
      set({ error: getMessage(err, "No se pudo rechazar el trueque."), loading: false });
      return null;
    }
  },

  proposeTrade: async (payload) => {
    try {
      const res = await apiAuthPost<Trade>("/trueqia/trades", payload);
      set({ items: [...get().items, res] });
      return res;
    } catch (err: any) {
      set({ error: getMessage(err, "No se pudo crear el trueque."), loading: false });
      return null;
    }
  },
}));
