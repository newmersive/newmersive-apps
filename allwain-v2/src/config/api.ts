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
  };
}

type ApiError = Error & { status?: number; body?: unknown };

function buildUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch (err) {
    console.error("No se pudo parsear la respuesta JSON", err);
    return null;
  }
}

function buildApiError(res: Response, body: any): ApiError {
  const message = body?.message || body?.error || `API_ERROR_${res.status}`;
  const error = new Error(message) as ApiError;
  error.status = res.status;
  error.body = body;
  return error;
}

function authHeaders() {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = buildUrl(path);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await parseJson(res);
    if (!res.ok) {
      console.error(`POST ${url} fallo`, res.status, data);
      throw buildApiError(res, data);
    }

    return data as T;
  } catch (err) {
    console.error(`POST ${url} error`, err);
    throw err;
  }
}

export async function apiAuthGet<T>(path: string): Promise<T> {
  const url = buildUrl(path);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
    });

    const data = await parseJson(res);

    if (!res.ok) {
      if (res.status === 401) {
        useAuthStore.getState().clearAuth();
      }
      console.error(`GET ${url} fallo`, res.status, data);
      throw buildApiError(res, data);
    }

    return data as T;
  } catch (err) {
    console.error(`GET ${url} error`, err);
    throw err;
  }
}
