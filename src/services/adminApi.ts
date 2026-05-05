import { getStoredToken } from './authApi';

const ADMIN_BASE = '/admin';
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface AdminStats {
  total_students: number;
  enrolled_students: number;
  unenrolled_students: number;
  active_enrollments: number;
  total_verifications: number;
  successful_verifications: number;
  verifications_today: number;
  success_rate: number;
  total_staff: number;
}

export function fetchAdminStats(): Promise<AdminStats> {
  return adminFetch(`${ADMIN_BASE}/stats`);
}

// ── Enrollments ───────────────────────────────────────────────────────────────

export interface EnrollmentItem {
  id: string;
  student_id: number;
  external_id: string;
  full_name: string;
  status: 'active' | 'rejected' | 'expired' | 'pending';
  created_at: string;
  updated_at: string;
  metadata_json: Record<string, unknown> | null;
}

export interface EnrollmentListResponse {
  total: number;
  items: EnrollmentItem[];
}

export function fetchEnrollments(params?: {
  skip?: number;
  limit?: number;
  search?: string;
  status_filter?: string;
}): Promise<EnrollmentListResponse> {
  const q = new URLSearchParams();
  if (params?.skip != null) q.set('skip', String(params.skip));
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.search) q.set('search', params.search);
  if (params?.status_filter) q.set('status_filter', params.status_filter);
  return adminFetch(`${ADMIN_BASE}/enrollments?${q}`);
}

export function updateEnrollmentStatus(id: string, status: string): Promise<{ success: boolean; status: string }> {
  return adminFetch(`${ADMIN_BASE}/enrollments/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function deleteEnrollment(id: string): Promise<void> {
  return adminFetch(`${ADMIN_BASE}/enrollments/${id}`, { method: 'DELETE' });
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface StaffUser {
  id: number;
  username: string;
  role: 'admin' | 'capture_staff' | 'verify_staff';
  is_active: boolean;
  created_at: string;
}

export function fetchStaffUsers(): Promise<StaffUser[]> {
  return adminFetch(`${ADMIN_BASE}/users`);
}

export function createStaffUser(payload: {
  username: string;
  password: string;
  role: 'capture_staff' | 'verify_staff';
  is_active: boolean;
}): Promise<StaffUser> {
  return adminFetch(`${API_BASE}/users/`, { method: 'POST', body: JSON.stringify(payload) });
}

export function toggleUserActive(id: number, is_active: boolean): Promise<{ success: boolean; is_active: boolean }> {
  return adminFetch(`${ADMIN_BASE}/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active }),
  });
}

export function deleteStaffUser(id: number): Promise<void> {
  return adminFetch(`${ADMIN_BASE}/users/${id}`, { method: 'DELETE' });
}

// ── Verification logs ─────────────────────────────────────────────────────────

export interface VerificationLogItem {
  id: string;
  student_id: number;
  full_name: string;
  external_id: string;
  match_score: number;
  is_successful: boolean;
  liveness_passed: boolean;
  matching_mode: string;
  timestamp: string;
}

export interface VerificationListResponse {
  total: number;
  items: VerificationLogItem[];
}

export function fetchVerificationLogs(params?: { skip?: number; limit?: number }): Promise<VerificationListResponse> {
  const q = new URLSearchParams();
  if (params?.skip != null) q.set('skip', String(params.skip));
  if (params?.limit != null) q.set('limit', String(params.limit));
  return adminFetch(`${ADMIN_BASE}/verifications?${q}`);
}

// ── System settings ───────────────────────────────────────────────────────────

export interface SystemSettings {
  id: number;
  matching_mode: string;
  similarity_threshold: number;
  liveness_enabled: boolean;
  max_attempts: number;
  updated_at: string;
}

export function fetchSystemSettings(): Promise<SystemSettings> {
  return adminFetch(`${ADMIN_BASE}/settings`);
}

export function updateSystemSettings(payload: Partial<Omit<SystemSettings, 'id' | 'updated_at'>>): Promise<SystemSettings> {
  return adminFetch(`${ADMIN_BASE}/settings`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function reloadIndex(): Promise<{ message: string }> {
  return adminFetch(`${ADMIN_BASE}/reload-index`, { method: 'POST' });
}
