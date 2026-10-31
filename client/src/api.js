// Centralized API Client with JWT access & refresh tokens
import { showToast } from './components/ui.js';

let accessToken = localStorage.getItem('xyz_access_token') || null;
let refreshToken = localStorage.getItem('xyz_refresh_token') || null;

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('xyz_access_token', access);
  else localStorage.removeItem('xyz_access_token');
  if (refresh) localStorage.setItem('xyz_refresh_token', refresh);
  else localStorage.removeItem('xyz_refresh_token');
}

export function clearAuth() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('xyz_access_token');
  localStorage.removeItem('xyz_refresh_token');
  localStorage.removeItem('xyz_user');
}

export async function apiRequest(endpoint, options = {}) {
  const headers = options.headers || {};

  if (accessToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let res = await fetch(endpoint, { ...options, headers });

  // Token expired - attempt automatic refresh
  if (res.status === 401 && refreshToken && !endpoint.includes('/api/auth/')) {
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setTokens(data.accessToken, data.refreshToken);
        headers['Authorization'] = `Bearer ${data.accessToken}`;
        res = await fetch(endpoint, { ...options, headers });
      } else {
        clearAuth();
        window.location.hash = '#login';
      }
    } catch (err) {
      clearAuth();
      window.location.hash = '#login';
    }
  }

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorJson.error || 'API Request Failed');
  }

  if (res.status === 204) return null;
  return res.json();
}
