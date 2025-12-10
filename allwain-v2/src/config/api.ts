import { useAuthStore } from "../store/auth.store";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000/api";

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    sponsorCode?: string;
    referredByCode?: string;
  };
}

export interface AllwainOffer {
  id: string;
  title: string;
  description: string;
  owner: "allwain";
  ownerUserId: string;
  price?: number;
  tokens?: number;
  productId?: string;
  meta?: Record<string, unknown>;
}

export interface ScanDemoResponse {
  product?: {
    id: string;
    name: string;
    description?: string;
    brand?: string;
  };
  offers?: AllwainOffer[];
  message?: string;
}

export interface SponsorSummaryResponse {
  invitedCount: number;
  totalSaved: number;
  totalCommission: number;
  balance: number;
  monthlyHistory: Array<{
    month: number;
    year: number;
    saved: number;
    commission: number;
  }>;
  referrals: Array<{
    id: string;
    invitedUserId: string;
    invitedName?: string;
    totalSavedByInvited: number;
    commissionEarned: number;
  }>;
}

function handleUnauthorized(status: number, message?: string) {
  if (status === 401) {
    useAuthStore.getState().clearAuth();
    throw new Error(message || "SESSION_EXPIRED");
  }
}

async function parseResponse(res: Response) {
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  return data;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await parseResponse(res);
  if (!res.ok) {
    handleUnauthorized(res.status, data?.message || data?.error);
    throw new Error(data?.error || `API_ERROR_${res.status}`);
  }

  return data as T;
}

export async function apiAuthGet<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = useAuthStore.getState().token;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await parseResponse(res);
  if (!res.ok) {
    handleUnauthorized(res.status, data?.message || data?.error);
    throw new Error(data?.error || `API_ERROR_${res.status}`);
  }

  return data as T;
}

export async function apiAuthPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = useAuthStore.getState().token;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await parseResponse(res);
  if (!res.ok) {
    handleUnauthorized(res.status, data?.message || data?.error);
    throw new Error(data?.error || `API_ERROR_${res.status}`);
  }

  return data as T;
}

export async function postAllwainSaving<T = unknown>(body: unknown): Promise<T> {
  return apiAuthPost<T>("/allwain/savings", body);
}
