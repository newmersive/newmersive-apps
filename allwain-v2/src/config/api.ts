import { useAuthStore } from "../store/auth.store";

const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
export const API_BASE_URL = rawBaseUrl
  ? rawBaseUrl.replace(/\/$/, "")
  : "http://localhost:4000/api";

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    sponsorCode?: string;
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

function handleUnauthorized(status: number, message?: string) {
  if (status === 401) {
    useAuthStore
      .getState()
      .logout(message || "Sesión expirada, vuelve a iniciar sesión.");
    throw new Error("SESSION_EXPIRED");
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

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
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const token = useAuthStore.getState().token;

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
