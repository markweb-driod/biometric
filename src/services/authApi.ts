const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

const TOKEN_KEY = 'biometric_api_token';
const USER_KEY  = 'biometric_staff_user';
const ROLE_KEY  = 'biometric_staff_role';

interface LoginResponse {
  access_token: string;
  token_type: string;
}

export async function loginStaff(username: string, password: string): Promise<void> {
  const user = username.trim();
  if (!user || !password) {
    throw new Error('Username and password are required.');
  }

  const body = new URLSearchParams();
  body.set('username', user);
  body.set('password', password);

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as LoginResponse | { detail?: string } | null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'detail' in payload && payload.detail) ||
      `Login failed (HTTP ${response.status})`;
    throw new Error(message);
  }

  if (!payload || !('access_token' in payload) || !payload.access_token) {
    throw new Error('Login response is invalid.');
  }

  window.localStorage.setItem(TOKEN_KEY, payload.access_token);
  window.localStorage.setItem(USER_KEY, user);

  // Fetch the user's role immediately after login.
  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${payload.access_token}` },
  });
  if (meRes.ok) {
    const me = await meRes.json().catch(() => null);
    if (me && typeof me.role === 'string') {
      window.localStorage.setItem(ROLE_KEY, me.role);
    }
  }
}

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredStaffUser(): string | null {
  return window.localStorage.getItem(USER_KEY);
}

export function getStoredStaffRole(): string | null {
  return window.localStorage.getItem(ROLE_KEY);
}

export function logoutStaff(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(ROLE_KEY);
}

export async function validateStoredSession(): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;

  const response = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    return false;
  }

  if (!response.ok) {
    return false;
  }

  const payload = (await response.json().catch(() => null)) as { username?: string; role?: string } | null;
  if (payload?.username) {
    window.localStorage.setItem(USER_KEY, payload.username);
  }
  if (payload?.role) {
    window.localStorage.setItem(ROLE_KEY, payload.role);
  }

  return true;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const token = getStoredToken();
  if (!token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const response = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });

  const payload = (await response.json().catch(() => null)) as { detail?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.detail ?? payload?.message ?? `Password update failed (HTTP ${response.status})`);
  }
}
