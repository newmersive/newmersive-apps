import { create } from "zustand";
import { apiAuthGet, apiAuthPost } from "../config/api";

export type TrueqiaOffer = {
  id: string;
  title: string;
  description?: string;
  tokens?: number;
  owner?: {
    id: string;
    name?: string;
  };
};

type OffersState = {
  items: TrueqiaOffer[];
  loading: boolean;
  error: string | null;
  loadOffers: () => Promise<void>;
  createOffer: (payload: {
    title: string;
    description: string;
    tokens?: number;
  }) => Promise<void>;
};

export const useOffersStore = create<OffersState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  loadOffers: async () => {
    set({ loading: true, error: null });

    try {
      const data = await apiAuthGet<{ items?: TrueqiaOffer[] }>("/trueqia/offers");
      const items = Array.isArray(data?.items) ? data.items : [];
      set({ items, loading: false });
    } catch (err: any) {
      const message =
        err?.message === "Network request failed"
          ? "No se pudo conectar con el servidor"
          : err?.message || "ERROR_LOADING_OFFERS";
      set({ error: message, loading: false, items: get().items });
    }
  },
  createOffer: async (payload) => {
    set({ loading: true, error: null });
    try {
      await apiAuthPost("/trueqia/offers", payload);
      const data = await apiAuthGet<{ items?: TrueqiaOffer[] }>("/trueqia/offers");
      const items = Array.isArray(data?.items) ? data.items : [];
      set({ items, loading: false });
    } catch (err: any) {
      const message = err?.message || "ERROR_CREATING_OFFER";
      set({ error: message, loading: false });
    }
  },
}));
