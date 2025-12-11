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
    qrCode?: string;
    referredByCode?: string;
    avatarUrl?: string;
    tokens?: number;
    tokensFromInvites?: number;
    invitedUsers?: Array<{
      id: string;
      name: string;
      email?: string;
      avatarUrl?: string;
      tokensEarned?: number;
      tokensAwarded?: number;
    }>;
  };
}

// Import lazily to avoid require cycles with the auth store
const getAuthStore = () =>
  require("../store/auth.store").useAuthStore as typeof import("../store/auth.store").useAuthStore;

function handleUnauthorized(status: number, message?: string) {
  if (status === 401) {
    getAuthStore()
      .getState()
      .logout(message || "Sesión expirada, vuelve a iniciar sesión.");
    throw new Error("SESSION_EXPIRED");
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    handleUnauthorized(res.status, data?.message || data?.error);
    throw new Error(data?.message || data?.error || `API_ERROR_${res.status}`);
  }

  return data as T;
}

export async function apiAuthGet<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = getAuthStore().getState().token;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    handleUnauthorized(res.status, data?.message || data?.error);
    throw new Error(data?.message || data?.error || `API_ERROR_${res.status}`);
  }

  return data as T;
}

export async function apiAuthPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = getAuthStore().getState().token;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    handleUnauthorized(res.status, data?.message || data?.error);
    throw new Error(data?.message || data?.error || `API_ERROR_${res.status}`);
  }

  return data as T;
}
