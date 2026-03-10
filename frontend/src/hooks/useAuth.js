import { useState, useEffect, useCallback, useRef } from 'react';

/** Access tokens live for 15 min; proactively refresh every 14 min */
const REFRESH_INTERVAL_MS = 14 * 60 * 1000;

export function useAuth() {
  const [accessToken, setAccessToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef(null);

  // ── Proactive refresh scheduler ──────────────────────────────────────────
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const { access_token } = await res.json();
          setAccessToken(access_token);
          scheduleRefresh(); // schedule next cycle
        } else {
          setAccessToken(null); // refresh token expired → force re-login
        }
      } catch {
        scheduleRefresh(); // network error → retry at next interval
      }
    }, REFRESH_INTERVAL_MS);
  }, []);

  // ── Restore session on mount ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const { access_token } = await res.json();
          setAccessToken(access_token);
          scheduleRefresh();
        }
      } finally {
        setIsLoading(false);
      }
    })();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh]);

  // ── Auth actions ─────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setAccessToken(data.access_token);
    scheduleRefresh();
  }, [scheduleRefresh]);

  const register = useCallback(async (username, email, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setAccessToken(data.access_token);
    scheduleRefresh();
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setAccessToken(null);
  }, []);

  return { accessToken, isLoading, login, register, logout };
}
