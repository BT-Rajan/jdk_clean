import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Backend origin, e.g. "https://api.yourcompany.com". Read from
 * EXPO_PUBLIC_API_BASE_URL (see .env.example) -- Expo/Metro's
 * equivalent of the web app's VITE_API_BASE_URL, inlined into the
 * bundle at build time for web *and* native alike. Falls back to a
 * placeholder so a missing .env fails loudly (every request 404s/DNS-
 * errors against "your-api-domain.com") instead of silently.
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://your-api-domain.com';

const ACCESS_TOKEN_KEY = 'qq_access_token';
const REFRESH_TOKEN_KEY = 'qq_refresh_token';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export async function loadStoredTokens(): Promise<boolean> {
  const [stored_access, stored_refresh] = await Promise.all([
    AsyncStorage.getItem(ACCESS_TOKEN_KEY),
    AsyncStorage.getItem(REFRESH_TOKEN_KEY),
  ]);
  accessToken = stored_access;
  refreshToken = stored_refresh;
  return Boolean(accessToken);
}

export async function setTokens(tokens: { access_token: string; refresh_token: string }) {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, tokens.access_token],
    [REFRESH_TOKEN_KEY, tokens.refresh_token],
  ]);
}

export async function clearTokens() {
  accessToken = null;
  refreshToken = null;
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean; // default true
}

/** One retry via /api/auth/refresh on a 401, mirroring the web app's
 * axios interceptor (see frontend/src/lib -- refresh once, then bail
 * to logout if that also fails). */
export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  async function doFetch(token: string | null): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  let res = await doFetch(accessToken);

  if (res.status === 401 && auth && refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(accessToken);
    }
  }

  if (res.status === 401) {
    await clearTokens();
    onUnauthorized?.();
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // non-JSON body, leave data null
    }
  }

  if (!res.ok) {
    // The backend's own AppError handler (see backend/app/core/exceptions.py)
    // returns {"error": "[CODE] message"} for virtually every rejected
    // request -- `detail`/`message` are only a fallback for the rare
    // plain HTTPException that doesn't go through that handler. Reading
    // only detail/message (as this used to) meant every real backend
    // rejection -- a 409 conflict, a 422 validation message, anything --
    // silently fell through to the generic "Request failed (N)" instead
    // of the actual, often actionable, reason.
    const message =
      (data && (data.error || data.detail || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), res.status);
  }

  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const tokens = await res.json();
    await setTokens(tokens);
    return true;
  } catch {
    return false;
  }
}
