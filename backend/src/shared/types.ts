export type UserRole = "user" | "buyer" | "company" | "admin";

/* =========================
   USER & AUTH
========================= */

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  sponsorCode?: string;
  referredByCode?: string;
  avatarUrl?: string;
  appMode?: string[];
  tokens?: number;
  allwainBalance?: number;
}

export interface AuthTokenResponse {
  token: string;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  sponsorCode?: string;
  referredByCode?: string;
  avatarUrl?: string;
  appMode?: string[];
  tokens?: number;
  allwainBalance?: number;
}

/* =========================
   ALLWAIN SPONSORS
========================= */

export interface ReferralMonthlyHistory {
  month: number;
  year: number;
  saved: number;
  commission: number;
}

export interface ReferralStat {
  id: string;
  userId: string;
  invitedUserId: string;
  totalSavedByInvited: number;
  commissionEarned: number;
  monthlyHistory: ReferralMonthlyHistory[];
}

export interface AllwainSavingTransaction {
  id: string;
  userId: string;
  amount: number;
  createdAt: string;
}

/* =========================
   OFFERS & TRADES
========================= */

export interface Offer {
  id: string;
  title: string;
  description: string;
  owner: "trueqia" | "allwain";
  ownerUserId: string;
  tokens?: number;
  price?: number;
  productId?: string;
  meta?: Record<string, unknown>;
}

export type TradeStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface Trade {
  id: string;
  offerId: string;
  fromUserId: string;
  toUserId: string;
  tokens: number;
  status: TradeStatus;
  createdAt: string;
  resolvedAt?: string;
  contractId?: string;
}

/* =========================
   PRODUCTS
========================= */

export interface Product {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  ean?: string;
  priceTokens?: number;
  category?: string;
  imageUrl?: string;
}

/* =========================
   LEADS
========================= */

export type LeadStatus = "new" | "contacted" | "qualified" | "closed";

export interface Lead {
  id: string;
  name: string;
  email: string;
  source: string;
  message?: string;
  offerId?: string;
  userId?: string;
  status: LeadStatus;
  createdAt: string;
}

export type LeadGlobalChannel = "whatsapp" | "web" | "app";
export type LeadGlobalStatus = "new" | "contacted" | "closed";
export type LeadGlobalSourceApp = "trueqia" | "allwain";

export interface LeadGlobal {
  id: string;
  channel: LeadGlobalChannel;
  name?: string;
  phone?: string;
  email?: string;
  sourceApp: LeadGlobalSourceApp;
  message: string;
  createdAt: string;
  status: LeadGlobalStatus;
}

/* =========================
   ORDER GROUPS
========================= */

export type OrderGroupStatus = "open" | "closing" | "closed";

export interface OrderGroupParticipant {
  userId: string;
  units: number;
}

export interface OrderGroup {
  id: string;
  productId: string;
  totalUnits: number;
  minUnitsPerClient: number;
  status: OrderGroupStatus;
  participants: OrderGroupParticipant[];
}

/* =========================
   CONTRACTS
========================= */

export type ContractApp = "trueqia" | "allwain";
export type ContractType = "trade" | "purchase";
export type ContractStatus = "draft" | "active" | "closed" | "conflict";

export interface Contract {
  id: string;
  title: string;
  app?: ContractApp;
  type?: ContractType;
  status: ContractStatus;
  counterparties?: string[];
  valueTokens?: number;
  basePdfId?: string;
  generatedText?: string;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}

/* =========================
   DEMO
========================= */

export interface DemoContractInput {
  offerTitle: string;
  requesterName: string;
  providerName: string;
  tokens: number;
}

