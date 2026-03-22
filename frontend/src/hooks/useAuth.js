import { useState, useEffect, useCallback, useRef } from 'react';

/** Access tokens live for 15 min; proactively refresh every 14 min */
const REFRESH_INTERVAL_MS = 14 * 60 * 1000;

export function useAuth() {
  const [accessToken, setAccessToken] = useState(null);
  const [credits, setCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef(null);
  const accessTokenRef = useRef(null);

  // ── Credit helpers ─────────────────────────────────────────────────────
  const refreshCredits = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) return;
    try {
      const res = await fetch('/api/credits', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchCreditsWithToken = useCallback(async (token) => {
    try {
      const res = await fetch('/api/credits', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits);
      }
    } catch { /* ignore */ }
  }, []);

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
          accessTokenRef.current = access_token;
          scheduleRefresh(); // schedule next cycle
        } else {
          setAccessToken(null); // refresh token expired → force re-login
          accessTokenRef.current = null;
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
          accessTokenRef.current = access_token;
          scheduleRefresh();
          fetchCreditsWithToken(access_token);
        }
      } finally {
        setIsLoading(false);
      }
    })();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh, fetchCreditsWithToken]);

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
    accessTokenRef.current = data.access_token;
    scheduleRefresh();
    fetchCreditsWithToken(data.access_token);
  }, [scheduleRefresh, fetchCreditsWithToken]);

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
    accessTokenRef.current = data.access_token;
    scheduleRefresh();
    fetchCreditsWithToken(data.access_token);
  }, [scheduleRefresh, fetchCreditsWithToken]);

  const logout = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setAccessToken(null);
    accessTokenRef.current = null;
    setCredits(0);
  }, []);

  return { accessToken, credits, isLoading, login, register, logout, refreshCredits };
}
