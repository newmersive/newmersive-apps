export type UserRole = "user" | "buyer" | "company" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  avatarUrl?: string;
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
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  tokens: number;
  owner: "trueqia" | "allwain";
  category: string;
}

export interface Trade {
  id: string;
  title: string;
  status: string;
  participants: string[];
  tokens: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  brand: string;
  priceTokens: number;
  category?: string;
  imageUrl?: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  source: string;
  message?: string;
  status: "new" | "contacted" | "qualified" | "closed";
  createdAt: string;
}

export interface Contract {
  id: string;
  title: string;
  status: string;
  counterparties: string[];
  valueTokens: number;
  createdAt: string;
  notes?: string;
}
