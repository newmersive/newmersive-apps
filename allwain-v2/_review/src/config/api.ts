import { useAuthStore } from "../store/auth.store";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000/api";

export interface AllwainOffer {
  id: string;
  title: string;
  description?: string;
  price?: number;
  meta?: {
    distanceKm?: number;
    [key: string]: unknown;
  };
}

export interface ScanDemoResponse {
  product?: {
    id: string;
    name: string;
    description?: string;
    brand?: string;
    ean?: string;
  };
  offers?: AllwainOffer[];
  message?: string;
}

async function parseResponse(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function handleUnauthorized(status: number) {
  if (status === 401) {
    useAuthStore.getState().clearAuth();
    throw new Error("SESSION_EXPIRED");
  }
}

function extractErrorMessage(data: any, status: number) {
  return String(data?.error || data?.message || `API_ERROR_${status}`);
}

/** PUBLIC (sin token) */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    const msg = extractErrorMessage(data, res.status);
    throw new Error(msg);
  }

  return data as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    const msg = extractErrorMessage(data, res.status);
    throw new Error(msg);
  }

  return data as T;
}

/** AUTH (con token) */
export async function apiAuthGet<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().token;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    handleUnauthorized(res.status);
    const msg = extractErrorMessage(data, res.status);
    throw new Error(msg);
  }

  return data as T;
}

export async function apiAuthPost<T>(path: string, body: unknown): Promise<T> {
  const token = useAuthStore.getState().token;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    handleUnauthorized(res.status);
    const msg = extractErrorMessage(data, res.status);
    throw new Error(msg);
  }

  return data as T;
}
