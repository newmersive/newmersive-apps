import { create } from "zustand";
import { apiAuthGet, apiAuthPost } from "../config/api";

export interface OfferOwner {
  id: string;
  name?: string;
  avatar?: string;
}

export interface TrueqiaOffer {
  id: string;
  title: string;
  description?: string;
  tokens?: number;
  owner?: OfferOwner;
}

interface OffersState {
  items: TrueqiaOffer[];
  loading: boolean;
  error: string | null;
  loadOffers: () => Promise<void>;
  createOffer: (payload: {
    title: string;
    description: string;
    tokens?: number;
  }) => Promise<void>;
}

export const useOffersStore = create<OffersState>((set) => ({
  items: [],
  loading: false,
  error: null,
  loadOffers: async () => {
    try {
      set({ loading: true, error: null });
      const data = await apiAuthGet<{ items: TrueqiaOffer[] }>("/trueqia/offers");
      set({ items: data.items || [], loading: false });
    } catch (err: any) {
      const message =
        err?.message === "Network request failed"
          ? "No se pudo conectar con el servidor"
          : err?.message || "ERROR_LOADING_OFFERS";
      set({ error: message, loading: false });
    }
  },
  createOffer: async (payload) => {
    set({ loading: true, error: null });
    try {
      await apiAuthPost("/trueqia/offers", payload);
      const data = await apiAuthGet<{ items: TrueqiaOffer[] }>("/trueqia/offers");
      set({ items: data.items || [], loading: false });
    } catch (err: any) {
      set({ error: err?.message || "ERROR_CREATING_OFFER", loading: false });
    }
  },
}));
