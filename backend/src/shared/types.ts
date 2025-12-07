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
  tokens?: number;
  allwainBalance?: number;
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
  status: LeadStatus;
  createdAt: string;
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

