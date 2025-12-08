export interface TrueqiaOfferOwner {
  id: string;
  name?: string;
  avatar?: string;
}

export interface TrueqiaOffer {
  id: string;
  title: string;
  description?: string;
  tokens?: number;
  owner?: TrueqiaOfferOwner;
}

export interface TrueqiaTrade {
  id: string;
  title: string;
  status?: string; // e.g. "pending" | "accepted" | "rejected"
  participants?: string[];
  tokens?: number;
  offerId?: string;
  ownerId?: string;
}

export interface TrueqiaContract {
  id: string;
  tradeId: string;
  summary: string;
  createdAt: string;
}

export interface TrueqiaDomainState {
  offers: TrueqiaOffer[];
  trades: TrueqiaTrade[];
  contracts: TrueqiaContract[];
}
