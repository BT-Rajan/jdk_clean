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

// 'manager'/'staff' are legacy values, kept for backward compatibility
// with existing rows -- new users get 'department_head'/'team_member'
// instead (see backend/app/models/user.py's role enum comment).
export type UserRole = 'admin' | 'manager' | 'staff' | 'department_head' | 'team_member';

export interface MeOut {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  department_code: string | null;
  department_name: string | null;
}

export function getMe() {
  return api<MeOut>('/api/auth/me');
}

// Mirrors backend/app/services/audit_service.get_my_history's return
// shape (same rows the /{id}/history endpoints return, minus
// changed_by/changed_by_name -- every row here is already known to be
// this user's own).
export interface MyHistoryEntry {
  table_name: string;
  record_id: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

// month: "YYYY-MM"; omitted defaults to the current calendar month
// (see the backend's own default) -- this screen only ever shows one
// month, so there's no "load more" pagination to build.
export function getMyHistory(month?: string) {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  return api<MyHistoryEntry[]>(`/api/auth/me/history${query}`);
}
