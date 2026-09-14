import { api, setTokens } from './client';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export async function login(username: string, password: string) {
  const tokens = await api<TokenResponse>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
    auth: false,
  });
  await setTokens(tokens);
  return tokens;
}

export interface MeOut {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  role: string;
  department_name: string | null;
}

export function getMe() {
  return api<MeOut>('/api/auth/me');
}
