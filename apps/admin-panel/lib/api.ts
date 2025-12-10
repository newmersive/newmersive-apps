export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || "";

if (!API_BASE_URL) {
  console.warn("NEXT_PUBLIC_API_BASE_URL/EXPO_PUBLIC_API_BASE_URL no está configurada");
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  sponsorCode?: string;
  referredByCode?: string;
  tokens?: number;
  allwainBalance?: number;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AdminUsersResponse {
  users: AuthUser[];
}

export interface ModerationEvent {
  id: string;
  userEmail: string;
  severity: string;
  reason: string;
  createdAt: string;
}

export interface AllwainSponsorStat {
  id: string;
  userId: string;
  invitedUserId: string;
  totalSavedByInvited: number;
  commissionEarned: number;
  sponsorName?: string;
  invitedName?: string;
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
}

export interface Trade {
  id: string;
  offerId: string;
  fromUserId: string;
  toUserId: string;
  tokens: number;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  createdAt: string;
  resolvedAt?: string;
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Error de servidor");
  }

  return (await res.json()) as T;
}

export async function login(email: string, password: string) {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchProfile(token: string) {
  return apiRequest<AuthUser>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchAdminUsers(token: string) {
  return apiRequest<AdminUsersResponse>("/admin/users", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchModerationEvents(token: string) {
  return apiRequest<{ events: ModerationEvent[] }>("/admin/ai/activity", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchSponsorStats(token: string) {
  return apiRequest<{ stats: AllwainSponsorStat[] }>("/admin/allwain/sponsors", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchOffers(owner: "trueqia" | "allwain", token: string) {
  return apiRequest<{ items: Offer[] }>(`/${owner}/offers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchTrades(token: string) {
  return apiRequest<{ items: Trade[] }>("/trueqia/trades", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
