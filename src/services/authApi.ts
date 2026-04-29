const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

const TOKEN_KEY = 'biometric_api_token';
const USER_KEY = 'biometric_staff_user';

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

  const response = await fetch(`${API_BASE}/admin/login`, {
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
}

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredStaffUser(): string | null {
  return window.localStorage.getItem(USER_KEY);
}

export function logoutStaff(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
