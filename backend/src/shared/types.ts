export type UserRole = "user" | "buyer" | "company" | "admin";

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
  avatarUrl?: string;
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

export type LeadStatus = "new" | "contacted" | "closed";

export interface Lead {
  id: string;
  userId: string;
  offerId: string;
  createdAt: string;
  status: LeadStatus;
}

export type ContractApp = "trueqia" | "allwain";
export type ContractType = "trade" | "purchase";
export type ContractStatus = "draft" | "active" | "closed" | "conflict";

export interface Contract {
  id: string;
  app: ContractApp;
  type: ContractType;
  status: ContractStatus;
  basePdfId?: string;
  generatedText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoContractInput {
  offerTitle: string;
  requesterName: string;
  providerName: string;
  tokens: number;
}
