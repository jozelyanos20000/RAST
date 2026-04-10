import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../config';

/**
 * useTrackQueue — Manages the track discovery queue.
 *
 * Fetches tracks from /api/random-track with seen IDs and optional filters,
 * maintains the seenIds list, and exposes skip/like actions.
 *
 * Works for both authenticated users and guests. Guests fetch without
 * auth headers and skip locally (no POST to /api/skips).
 *
 * Props:
 *   accessToken {string|null} — JWT access token for Bearer auth
 *   filters     {object|null} — { genres: string[], keywords: string[], bpmMin: number, bpmMax: number }
 *
 * Returns:
 *   currentTrack  {object|null}  — track object currently shown
 *   isLoading     {boolean}      — true while fetching next track
 *   isExhausted   {boolean}      — true when API returns { exhausted: true }
 *   skipTrack     {function}     — mark current as seen, fetch next
 *   likeTrack     {function}     — mark current as seen (liked), fetch next
 *   resetQueue    {function}     — clear history and re-fetch
 */
export function useTrackQueue(accessToken, { onCreditChange, filters } = {}) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [seenIds, setSeenIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExhausted, setIsExhausted] = useState(false);

  // Ref to track the latest seenIds without stale-closure issues
  const seenIdsRef = useRef(seenIds);
  useEffect(() => { seenIdsRef.current = seenIds; }, [seenIds]);

  // Ref to track latest accessToken without re-creating fetchNext on each refresh
  const accessTokenRef = useRef(accessToken);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);

  // Ref to track latest filters for use in fetchNext
  const filtersRef = useRef(filters);

  const fetchNext = useCallback(async (ids) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (ids.length > 0) params.set('seen', ids.join(','));

      const f = filtersRef.current;
      if (f?.genres?.length) params.set('genres', f.genres.join(','));
      if (f?.keywords?.length) params.set('keywords', f.keywords.join(','));
      if (f?.bpmMin != null && f?.bpmMax != null
          && !(f.bpmMin <= 1 && f.bpmMax >= 300)) {
        params.set('bpm_min', String(f.bpmMin));
        params.set('bpm_max', String(f.bpmMax));
      }

      const query = params.toString() ? `?${params.toString()}` : '';
      const headers = {};
      if (accessTokenRef.current) {
        headers.Authorization = `Bearer ${accessTokenRef.current}`;
      }
      const res = await fetch(`${API_BASE}/api/random-track${query}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.exhausted) {
        setIsExhausted(true);
        setCurrentTrack(null);
      } else {
        setIsExhausted(false);
        setCurrentTrack(data);
      }
    } catch (err) {
      console.error('[useTrackQueue] fetch failed:', err);
      // Keep current state on error; do not mark exhausted
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Seed seenIds with liked track IDs (authenticated) or start fresh (guest),
  // then fetch the first track.
  const _seedAndFetch = useCallback(() => {
    if (!accessTokenRef.current) {
      fetchNext([]);
      return;
    }
    fetch(`${API_BASE}/api/likes`, {
      headers: { Authorization: `Bearer ${accessTokenRef.current}` },
    })
      .then(res => (res.ok ? res.json() : []))
      .then(likes => {
        const likedIds = likes.map(l => l.id);
        setSeenIds(likedIds);
        seenIdsRef.current = likedIds;
        fetchNext(likedIds);
      })
      .catch(() => fetchNext([]));
  }, [fetchNext]);

  // Reset and re-fetch whenever the auth state changes (login, logout, or
  // initial mount as guest). Each transition gets a clean queue.
  const prevTokenRef = useRef(undefined); // undefined = first run
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (prevTokenRef.current === undefined) {
      // Initial mount — kick off the first fetch
      prevTokenRef.current = accessToken;
      initialFetchDone.current = true;
      setSeenIds([]);
      seenIdsRef.current = [];
      setCurrentTrack(null);
      setIsExhausted(false);
      setIsLoading(true);
      _seedAndFetch();
    } else if (accessToken !== prevTokenRef.current) {
      // Token changed (login or logout) — reset queue
      prevTokenRef.current = accessToken;
      initialFetchDone.current = true;
      setSeenIds([]);
      seenIdsRef.current = [];
      setCurrentTrack(null);
      setIsExhausted(false);
      setIsLoading(true);
      _seedAndFetch();
    }
  }, [accessToken, _seedAndFetch]);

  // Detect filter changes and reset the queue
  const filtersKeyRef = useRef(JSON.stringify(filters || {}));
  useEffect(() => {
    filtersRef.current = filters;
    const key = JSON.stringify(filters || {});
    if (key !== filtersKeyRef.current) {
      filtersKeyRef.current = key;
      if (initialFetchDone.current) {
        setSeenIds([]);
        seenIdsRef.current = [];
        setCurrentTrack(null);
        setIsExhausted(false);
        setIsLoading(true);
        _seedAndFetch();
      }
    }
  }, [filters, _seedAndFetch]);

  // Public reset: clear seen history and re-fetch a fresh feed.
  // Called when navigating back to Discover or when the feed is exhausted.
  const resetQueue = useCallback(() => {
    setSeenIds([]);
    seenIdsRef.current = [];
    setCurrentTrack(null);
    setIsExhausted(false);
    setIsLoading(true);
    _seedAndFetch();
  }, [_seedAndFetch]);

  const advanceQueue = useCallback((trackId) => {
    const next = [...seenIdsRef.current, trackId];
    setSeenIds(next);
    fetchNext(next);
  }, [fetchNext]);

  const skipTrack = useCallback(() => {
    if (!currentTrack) return;
    if (accessTokenRef.current) {
      fetch(`${API_BASE}/api/skips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessTokenRef.current}`,
        },
        body: JSON.stringify({ track_id: currentTrack.id }),
      }).catch(err => console.error('[useTrackQueue] skip failed:', err));
    }
    advanceQueue(currentTrack.id);
  }, [currentTrack, advanceQueue]);

  const likeTrack = useCallback(() => {
    if (!currentTrack) return;
    fetch(`${API_BASE}/api/likes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessTokenRef.current}`,
      },
      body: JSON.stringify({ track_id: currentTrack.id }),
    })
      .then(res => {
        if (res.ok && onCreditChange) onCreditChange();
      })
      .catch(err => console.error('[useTrackQueue] like failed:', err));
    advanceQueue(currentTrack.id);
  }, [currentTrack, advanceQueue, onCreditChange]);

  return {
    currentTrack,
    isLoading,
    isExhausted,
    skipTrack,
    likeTrack,
    resetQueue,
  };
}
