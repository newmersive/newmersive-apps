export type UserRole = "user" | "buyer" | "company" | "admin";

/* =========================
   USER & AUTH
========================= */

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  createdAt: string;
  sponsorCode?: string | null;
  referredByCode?: string | null;
  avatarUrl?: string | null;
  tokens?: number | null;
  allwainBalance?: number | null;
}

export type AuthUser = Omit<User, "passwordHash">;

export interface AuthTokenResponse {
  token: string;
  user: AuthUser;
}

/* =========================
   OFFERS
========================= */

export type OfferOwner = "trueqia" | "allwain";

export interface Offer {
  id: string;
  title: string;
  description: string;
  owner: OfferOwner;
  ownerUserId: string;

  tokens?: number | null; // TrueQIA
  price?: number | null;  // Allwain
  productId?: string | null;

  meta?: Record<string, unknown> | null;

  /**
   * Si true => oferta única (solo 1 trade puede acabar aceptado).
   * Si false => oferta para muchos (pueden aceptarse múltiples trades).
   */
  isUnique?: boolean;

  createdAt?: string;
}

/* =========================
   TRADES
========================= */

export type TradeStatus = "pending" | "accepted" | "rejected";

export interface Trade {
  id: string;
  offerId: string;
  fromUserId: string;
  toUserId: string;
  tokens: number;
  status: TradeStatus;
  createdAt: string;
  resolvedAt?: string | null;
}

/* =========================
   PRODUCTS (ALLWAIN)
========================= */

export interface Product {
  id: string;
  name: string;
  ean?: string | null;
  category?: string | null;
  brand?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  priceTokens?: number | null;
}

/* =========================
   ORDER GROUPS (ALLWAIN)
========================= */

export interface OrderGroupParticipant {
  userId: string;
  units: number;
}

export interface OrderGroup {
  id: string;
  productId: string;
  totalUnits: number;
  minUnitsPerClient: number;
  status: "open" | "closed";
  participants: OrderGroupParticipant[];
}

/* =========================
   SAVINGS + REFERRALS (ALLWAIN)
========================= */

export interface AllwainSavingTransaction {
  id: string;
  userId: string;
  amount: number;
  createdAt: string;
}

export interface ReferralStat {
  id: string;
  userId: string; // sponsor user id
  invitedUserId: string;
  totalSavedByInvited: number;
  commissionEarned: number;
  monthlyHistory: any[];
}

/* =========================
   LEADS
========================= */

export type LeadGlobalSourceApp = "trueqia" | "allwain" | "web";
export type LeadGlobalStatus = "new" | "contacted" | "qualified" | "lost" | "won";

export interface Lead {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
  message?: string | null;
  offerId?: string | null;
  userId?: string | null;
  status: string;
  createdAt?: string;
  notes?: string | null;
}

export interface LeadGlobal {
  id: string;
  createdAt: string;
  channel: "whatsapp" | "web" | "app";
  sourceApp: LeadGlobalSourceApp;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  message: string;
  status: LeadGlobalStatus;
  meta?: Record<string, unknown> | null;
}

/* =========================
   CONTRACTS
========================= */

export interface Contract {
  id: string;
  app: "trueqia" | "allwain";
  type: string;
  status: string;
  basePdfId?: string | null;
  generatedText?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoContractInput {
  offerTitle: string;
  requesterName: string;
  providerName: string;
  tokens: number;
}
