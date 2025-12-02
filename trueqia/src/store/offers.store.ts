import { create } from "zustand";
import { apiAuthGet } from "../config/api";

export interface TrueqiaOffer {
  id: string;
  title: string;
  description?: string;
  tokens?: number;
  owner?: string;
}

interface OffersState {
  items: TrueqiaOffer[];
  loading: boolean;
  error: string | null;
  loadOffers: () => Promise<void>;
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
      set({ error: err?.message || "ERROR_LOADING_OFFERS", loading: false });
    }
  },
}));
