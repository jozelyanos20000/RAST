import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../config';

/**
 * useTrackQueue — Manages the track discovery queue.
 *
 * Fetches tracks from /api/random-track?seen=<comma-separated IDs>,
 * maintains the seenIds list, and exposes skip/like actions.
 *
 * Props:
 *   accessToken {string|null} — JWT access token for Bearer auth
 *
 * Returns:
 *   currentTrack  {object|null}  — track object currently shown
 *   isLoading     {boolean}      — true while fetching next track
 *   isExhausted   {boolean}      — true when API returns { exhausted: true }
 *   skipTrack     {function}     — mark current as seen, fetch next
 *   likeTrack     {function}     — mark current as seen (liked), fetch next
 */
export function useTrackQueue(accessToken, { onCreditChange } = {}) {
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

  const fetchNext = useCallback(async (ids) => {
    if (!accessTokenRef.current) return;
    setIsLoading(true);
    try {
      const query = ids.length > 0 ? `?seen=${ids.join(',')}` : '';
      const res = await fetch(`${API_BASE}/api/random-track${query}`, {
        headers: { Authorization: `Bearer ${accessTokenRef.current}` },
      });
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

  // Reset all state when the user logs out (accessToken → null).
  // This ensures a subsequent login starts with a clean queue.
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (!accessToken) {
      setSeenIds([]);
      seenIdsRef.current = [];
      setCurrentTrack(null);
      setIsExhausted(false);
      setIsLoading(true);
      initialFetchDone.current = false;
    }
  }, [accessToken]);

  // Seed seenIds with liked track IDs, then fetch the first track.
  // Runs once per session (guarded by initialFetchDone ref, reset on logout).
  const _seedAndFetch = useCallback(() => {
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

  useEffect(() => {
    if (accessToken && !initialFetchDone.current) {
      initialFetchDone.current = true;
      _seedAndFetch();
    }
  }, [_seedAndFetch, accessToken]);

  // Public reset: clear seen history and re-fetch a fresh feed.
  // Called when navigating back to Discover or when the feed is exhausted.
  const resetQueue = useCallback(() => {
    if (!accessTokenRef.current) return;
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
    fetch(`${API_BASE}/api/skips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessTokenRef.current}`,
      },
      body: JSON.stringify({ track_id: currentTrack.id }),
    }).catch(err => console.error('[useTrackQueue] skip failed:', err));
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
