import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
// Both have real .web.js builds (Metro resolves them automatically for
// the web bundle) -- static imports are fine, the Platform.OS branch
// below is what actually keeps the native-only code paths off web.
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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

// A bare fetch() has no timeout of its own -- on the kind of patchy
// connectivity a field sales rep actually deals with, a request can
// otherwise hang indefinitely with the calling screen's button spinner
// just spinning forever instead of ever failing. These give every
// request a hard ceiling instead, sized to what each kind of call
// actually needs: plain JSON calls should be quick, while uploads (id
// documents) and downloads (generated PDFs/docx, which the backend
// renders through LibreOffice before it can even start sending bytes)
// are naturally slower.
const DEFAULT_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 45_000;

/** fetch() with a hard timeout via AbortController -- turns a hung
 * request into a normal, retryable ApiError instead of a promise that
 * never settles. status 0 (never a real HTTP status) marks this case
 * so callers can tell it apart from a server-returned error if they
 * need to. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('Request timed out. Check your connection and try again.', 0);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean; // default true
  timeoutMs?: number; // default DEFAULT_TIMEOUT_MS
}

/** Shared auth/refresh plumbing behind both api() (JSON) and apiBlob()
 * (binary downloads) -- one retry via /api/auth/refresh on a 401,
 * mirroring the web app's axios interceptor (see frontend/src/lib --
 * refresh once, then bail to logout if that also fails). Returns the
 * raw Response so each caller parses the body its own way; still
 * throws on an unrecoverable 401 since neither caller has anything
 * useful to do with that response body. */
async function fetchWithAuth(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | FormData },
  auth: boolean,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  async function doFetch(token: string | null): Promise<Response> {
    const headers: Record<string, string> = { ...init.headers };
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    return fetchWithTimeout(`${API_BASE_URL}${path}`, { ...init, headers }, timeoutMs);
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

  return res;
}

/** Shared JSON-body parsing/error-extraction behind api() and
 * apiUpload() -- the backend's own AppError handler (see
 * backend/app/core/exceptions.py) returns {"error": "[CODE] message"}
 * for virtually every rejected request -- `detail`/`message` are only
 * a fallback for the rare plain HTTPException that doesn't go through
 * that handler. Reading only detail/message (as this used to) meant
 * every real backend rejection -- a 409 conflict, a 422 validation
 * message, anything -- silently fell through to the generic "Request
 * failed (N)" instead of the actual, often actionable, reason. */
async function parseJsonOrThrow<T>(res: Response): Promise<T> {
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
    const message =
      (data && (data.error || data.detail || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), res.status);
  }

  return data as T;
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const res = await fetchWithAuth(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined },
    auth,
    timeoutMs,
  );
  return parseJsonOrThrow<T>(res);
}

/** One file, picked via expo-document-picker's DocumentPickerAsset (its
 * `file` field is only set on web -- see uploadFile below). */
interface UploadAsset {
  uri: string;
  name: string;
  mimeType?: string | null;
  file?: File;
}

/** Multipart file upload (e.g. a customer's id document) -- same auth/
 * refresh handling as api(), deliberately without a Content-Type header
 * so fetch sets the multipart boundary itself (setting one manually, as
 * JSON requests do, breaks the boundary the same way it does for the
 * web app's axios client -- see api/customers.ts's uploadCustomerIdDocument
 * comment there). On web, FormData wants the real File object picked by
 * the browser's file input; on native there's no File, so the {uri,
 * name, type} shape is what React Native's fetch/FormData polyfill
 * expects instead. */
export async function uploadFile<T = any>(path: string, asset: UploadAsset): Promise<T> {
  const form = new FormData();
  if (Platform.OS === 'web' && asset.file) {
    form.append('file', asset.file);
  } else {
    form.append(
      'file',
      { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' } as unknown as Blob,
    );
  }
  const res = await fetchWithAuth(path, { method: 'POST', body: form }, true, UPLOAD_TIMEOUT_MS);
  return parseJsonOrThrow<T>(res);
}

/** Same auth/refresh handling as api(), for endpoints that return a
 * binary body (e.g. a PDF) instead of JSON. */
async function apiBlob(path: string): Promise<Blob> {
  const res = await fetchWithAuth(path, {}, true, DOWNLOAD_TIMEOUT_MS);

  if (!res.ok) {
    // Error responses from these endpoints are still the normal JSON
    // AppError shape, not binary -- try to read it for a real message,
    // falling back to a generic one if the body isn't JSON after all.
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.error || data.detail || data.message || message;
    } catch {
      // non-JSON error body, keep the generic message
    }
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), res.status);
  }

  return res.blob();
}

/** Downloads a binary file from the API and hands it to the user: on
 * web, triggers a normal browser "Save As" download; on native, saves
 * it to the app's cache dir and opens the OS share sheet (there's no
 * browser download tray to put it in, so sharing -- which includes
 * "Save to Files"/"Open in..." -- is the native equivalent). */
export async function downloadAndOpenFile(path: string, filename: string): Promise<void> {
  const blob = await apiBlob(path);

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  const base64 = await blobToBase64(blob);
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  if (await Sharing.isAvailableAsync()) {
    // blob.type is whatever Content-Type the backend actually served
    // (a PDF, or a JPEG/PNG/WEBP for an id document image) -- not
    // hardcoded, since this same helper backs both.
    await Sharing.shareAsync(fileUri, { mimeType: blob.type || 'application/octet-stream', dialogTitle: filename });
  }
}

/** "View" rather than "download": on web, opens the file inline in a
 * new tab (images/PDFs render directly, same as the web app's id
 * document viewer) instead of forcing a save-to-disk prompt; on native
 * there's no in-app viewer, so it falls back to the same save+share
 * flow as downloadAndOpenFile, which lets the user open it in Photos/
 * Files/a PDF app. */
export async function viewFile(path: string, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await apiBlob(path);
    const url = URL.createObjectURL(blob);
    // Deliberately not revoking this URL -- the new tab needs it to stay
    // valid after this function returns, and the browser reclaims it
    // when that tab is closed.
    window.open(url, '_blank');
    return;
  }
  return downloadAndOpenFile(path, filename);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      // reader.result is "data:<mime>;base64,<data>" -- FileSystem wants
      // just the <data> part.
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/api/auth/refresh`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
      DEFAULT_TIMEOUT_MS,
    );
    if (!res.ok) return false;
    const tokens = await res.json();
    await setTokens(tokens);
    return true;
  } catch {
    return false;
  }
}
