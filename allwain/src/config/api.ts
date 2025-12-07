export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000/api";

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

import { useAuthStore } from "../store/auth.store";

async function parseResponse(res: Response) {
  try {
    return await res.json();
  } catch (err) {
    return null;
  }
}

function handleAuthError(status: number) {
  if (status === 401) {
    useAuthStore
      .getState()
      .logout("Sesión expirada, vuelve a iniciar sesión.");
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

  const data = await parseResponse(res);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `API_ERROR_${res.status}`);
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
    handleAuthError(res.status);
    throw new Error(data?.message || data?.error || `API_ERROR_${res.status}`);
  }

  return data as T;
}
