import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useTrackQueue — Manages the track discovery queue.
 *
 * Fetches tracks from /api/random-track?seen=<comma-separated IDs>,
 * maintains the seenIds list, and exposes skip/like actions.
 *
 * Returns:
 *   currentTrack  {object|null}  — track object currently shown
 *   isLoading     {boolean}      — true while fetching next track
 *   isExhausted   {boolean}      — true when API returns { exhausted: true }
 *   skipTrack     {function}     — mark current as seen, fetch next
 *   likeTrack     {function}     — mark current as seen (liked), fetch next
 */
export function useTrackQueue() {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [seenIds, setSeenIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExhausted, setIsExhausted] = useState(false);

  // Ref to track the latest seenIds without stale-closure issues
  const seenIdsRef = useRef(seenIds);
  useEffect(() => { seenIdsRef.current = seenIds; }, [seenIds]);

  const fetchNext = useCallback(async (ids) => {
    setIsLoading(true);
    try {
      const query = ids.length > 0 ? `?seen=${ids.join(',')}` : '';
      const res = await fetch(`/api/random-track${query}`);
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

  // Fetch on mount
  useEffect(() => {
    fetchNext([]);
  }, [fetchNext]);

  const advanceQueue = useCallback((trackId) => {
    const next = [...seenIdsRef.current, trackId];
    setSeenIds(next);
    fetchNext(next);
  }, [fetchNext]);

  const skipTrack = useCallback(() => {
    if (!currentTrack) return;
    advanceQueue(currentTrack.id);
  }, [currentTrack, advanceQueue]);

  const likeTrack = useCallback(() => {
    if (!currentTrack) return;
    // Future: persist liked track to backend/library
    advanceQueue(currentTrack.id);
  }, [currentTrack, advanceQueue]);

  return {
    currentTrack,
    isLoading,
    isExhausted,
    skipTrack,
    likeTrack,
  };
}
