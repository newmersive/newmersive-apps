export type UserRole = "user" | "buyer" | "company" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  // Sistema de referidos / balances
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
}

export interface Product {
  id: string;
  name: string;
  ean?: string;
  category?: string;
  brand?: string;
}

expor
