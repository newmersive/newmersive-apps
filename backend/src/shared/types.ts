export type UserRole = "user" | "buyer" | "company" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
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
