import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../config';

const ACCENT_COLORS = ['#7C3AED', '#0D9488', '#D97706', '#E11D48', '#2563EB', '#EA580C'];
const DIM_BAR = '#2e3d50';

const accent = (id) => ACCENT_COLORS[id % ACCENT_COLORS.length];

/** Deterministic waveform bar heights seeded by track ID. */
function barHeights(trackId, count = 22) {
  return Array.from({ length: count }, (_, i) => {
    const x = Math.sin(trackId * 127.1 + i * 311.7) * 43758.5453123;
    const r = x - Math.floor(x);
    return 6 + Math.round(r * 32); // 6–38 (viewBox height: 46)
  });
}

/**
 * MiniWaveform — 22-bar SVG waveform with progress fill and play/pause overlay.
 * Uses SVG clipPath to split bars into played (accent) and remaining (dim) regions.
 */
function MiniWaveform({ track, progress, isActive, isPlaying, onToggle }) {
  const bars = barHeights(track.id);
  const color = accent(track.id);
  const playheadX = progress * 88;
  const playedId = `played-${track.id}`;
  const remainId = `remain-${track.id}`;

  return (
    <div
      onClick={onToggle}
      style={{ width: '88px', height: '46px', cursor: 'pointer', flexShrink: 0 }}
    >
      <svg viewBox="0 0 88 46" width="88" height="46" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id={playedId}>
            <rect x="0" y="0" width={playheadX} height="46" />
          </clipPath>
          <clipPath id={remainId}>
            <rect x={playheadX} y="0" width={88 - playheadX} height="46" />
          </clipPath>
        </defs>

        {isActive ? (
          <>
            {/* Played bars — accent color */}
            <g clipPath={`url(#${playedId})`}>
              {bars.map((h, i) => (
                <rect key={i} x={1 + i * 4} y={(46 - h) / 2} width="2" height={h} rx="1" fill={color} />
              ))}
            </g>
            {/* Remaining bars — dim tint of accent */}
            <g clipPath={`url(#${remainId})`}>
              {bars.map((h, i) => (
                <rect key={i} x={1 + i * 4} y={(46 - h) / 2} width="2" height={h} rx="1" fill={`${color}28`} />
              ))}
            </g>
            {/* Playhead line */}
            {progress > 0 && progress < 1 && (
              <line x1={playheadX} y1="5" x2={playheadX} y2="41" stroke={color} strokeWidth="1.5" opacity="0.85" />
            )}
            {/* Play / pause icon centered */}
            {isPlaying ? (
              <>
                <rect x="36" y="17" width="4" height="12" rx="1.5" fill={color} />
                <rect x="44" y="17" width="4" height="12" rx="1.5" fill={color} />
              </>
            ) : (
              <polygon points="37,17 37,29 49,23" fill={color} />
            )}
          </>
        ) : (
          <>
            {/* All bars dim */}
            {bars.map((h, i) => (
              <rect key={i} x={1 + i * 4} y={(46 - h) / 2} width="2" height={h} rx="1" fill={DIM_BAR} />
            ))}
            {/* Idle play icon */}
            <polygon points="37,17 37,29 49,23" fill="#6B7280" />
          </>
        )}
      </svg>
    </div>
  );
}

function TrackRow({ track, isActive, isPlaying, progress, onToggle, actionSlot }) {
  const color = accent(track.id);
  const tags = track.tags ? track.tags.split(',').filter(Boolean) : [];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '10px 16px',
      gap: '10px',
      borderBottom: '1px solid #111',
    }}>
      {/* Artwork */}
      <div style={{
        width: '46px',
        height: '46px',
        borderRadius: '6px',
        background: track.artwork ? 'transparent' : color,
        flexShrink: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        fontWeight: 900,
        color: 'rgba(255,255,255,0.85)',
      }}>
        {track.artwork
          ? <img src={track.artwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (track.title || track.original_name || '?')[0].toUpperCase()
        }
      </div>

      {/* Title + tags */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 600,
          color: isActive ? color : '#fff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: '1.3',
          transition: 'color 0.15s',
        }}>
          {track.title || track.original_name}
        </div>
        <div style={{
          fontSize: '11px',
          color: '#4B5563',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginTop: '2px',
          lineHeight: '1.3',
        }}>
          {tags.length > 0 ? tags.join(' · ') : '\u00a0'}
        </div>
      </div>

      {/* Waveform */}
      <MiniWaveform
        track={track}
        progress={progress}
        isActive={isActive}
        isPlaying={isPlaying}
        onToggle={onToggle}
      />

      {/* Key / BPM stacked */}
      <div style={{
        width: '40px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
      }}>
        <div style={{ fontSize: '10px', color: '#6B7280', fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '40px' }}>
          {track.key || '—'}
        </div>
        <div style={{ fontSize: '11px', color: '#4B5563', fontWeight: 500, textAlign: 'center' }}>
          {track.bpm || '—'}
        </div>
      </div>

      {/* Action slot — download button (Liked) or like count (Uploaded) */}
      {actionSlot}
    </div>
  );
}

/**
 * LibraryScreen — Liked / Uploaded tab view with audio playback and download.
 *
 * Props:
 *   accessToken {string} — JWT access token for Bearer auth
 */
export default function LibraryScreen({ accessToken }) {
  const [activeTab, setActiveTab] = useState('liked');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [likes, setLikes] = useState([]);
  const [likesLoading, setLikesLoading] = useState(true);
  const [likesError, setLikesError] = useState(null);

  const [uploads, setUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [uploadsError, setUploadsError] = useState(null);

  // Audio state
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const searchInputRef = useRef(null);

  // ── Fetch liked tracks ──────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'liked') return;
    let cancelled = false;
    fetch(`${API_BASE}/api/likes`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setLikes(data);
          setLikesError(null);
        } else {
          setLikesError(data.error || 'Failed to load liked tracks');
        }
        setLikesLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setLikesError(err.message);
          setLikesLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [activeTab, accessToken]);

  // ── Fetch uploaded tracks ───────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'uploaded') return;
    let cancelled = false;
    fetch(`${API_BASE}/api/my-uploads`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setUploads(data);
          setUploadsError(null);
        } else {
          setUploadsError(data.error || 'Failed to load uploaded tracks');
        }
        setUploadsLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setUploadsError(err.message);
          setUploadsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [activeTab, accessToken]);

  // ── Focus search input on open ──────────────────────────────────────────
  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  // ── Cleanup audio on unmount ────────────────────────────────────────────
  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  }, []);

  // ── Audio playback ──────────────────────────────────────────────────────
  const handleWaveformToggle = useCallback((track) => {
    // Toggle pause/resume on the same track
    if (playingId === track.id) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
        setPaused(false);
      } else {
        audioRef.current.pause();
        setPaused(true);
      }
      return;
    }

    // Stop current track
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    const audio = new Audio(track.filename);
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    });
    audio.addEventListener('ended', () => {
      setPlayingId(null);
      setPaused(false);
      setProgress(0);
    });

    audioRef.current = audio;
    setPlayingId(track.id);
    setPaused(false);
    setProgress(0);
    audio.play().catch(() => {});
  }, [playingId]);

  // ── Download ────────────────────────────────────────────────────────────
  const handleDownload = useCallback((track) => {
    const a = document.createElement('a');
    a.href = track.filename;
    a.download = track.original_name || track.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const matchesSearch = useCallback((t) =>
    !searchQuery || (t.title || t.original_name || '').toLowerCase().includes(searchQuery.toLowerCase()),
  [searchQuery]);

  const filteredLikes = likes.filter(matchesSearch);
  const filteredUploads = uploads.filter(matchesSearch);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#000' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 16px 0',
        flexShrink: 0,
      }}>
        {searchOpen ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tracks…"
              style={{
                flex: 1,
                background: '#111',
                border: '1px solid #1e1e1e',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                padding: '8px 12px',
                outline: 'none',
                fontFamily: 'inherit',
                WebkitAppearance: 'none',
              }}
            />
            <button
              onClick={closeSearch}
              style={{
                background: 'none',
                border: 'none',
                color: '#6B7280',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: '4px 0',
                flexShrink: 0,
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            {/* Spacer to balance the search icon on the right */}
            <div style={{ width: '29px' }} />
            <h1 style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.5px', color: '#fff', lineHeight: 1, flex: 1, textAlign: 'center' }}>
              Library
            </h1>
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '0 16px',
        marginTop: '10px',
        borderBottom: '1px solid #161616',
        flexShrink: 0,
      }}>
        {[['liked', 'Liked'], ['uploaded', 'Uploaded']].map(([id, label], idx) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '10px 0 9px',
              marginRight: idx === 0 ? '28px' : 0,
              position: 'relative',
            }}
          >
            <span style={{
              fontSize: '15px',
              fontWeight: 700,
              color: activeTab === id ? '#fff' : '#4B5563',
              letterSpacing: '0.01em',
              transition: 'color 0.15s',
            }}>
              {label}
            </span>
            {activeTab === id && (
              <div style={{
                position: 'absolute',
                bottom: '-1px',
                left: 0,
                right: 0,
                height: '2px',
                background: '#fff',
                borderRadius: '1px',
              }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {activeTab === 'liked' && (
          likesLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '220px' }}>
              <div style={{ color: '#374151', fontSize: '14px' }}>Loading…</div>
            </div>
          ) : likesError ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '220px' }}>
              <div style={{ color: '#E11D48', fontSize: '14px', textAlign: 'center', padding: '0 32px' }}>{likesError}</div>
            </div>
          ) : filteredLikes.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', gap: '10px' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <div style={{ fontSize: '14px', color: '#374151', textAlign: 'center', lineHeight: 1.5, maxWidth: '200px' }}>
                {searchQuery ? 'No tracks match your search.' : 'Tracks you like will appear here.'}
              </div>
            </div>
          ) : (
            filteredLikes.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                isActive={playingId === track.id}
                isPlaying={playingId === track.id && !paused}
                progress={playingId === track.id ? progress : 0}
                onToggle={() => handleWaveformToggle(track)}
                actionSlot={
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(track); }}
                    aria-label="Download"
                    style={{
                      width: '30px', height: '30px', flexShrink: 0,
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#6B7280', padding: 0, borderRadius: '50%',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7,10 12,15 17,10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                }
              />
            ))
          )
        )}

        {activeTab === 'uploaded' && (
          uploadsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '220px' }}>
              <div style={{ color: '#374151', fontSize: '14px' }}>Loading…</div>
            </div>
          ) : uploadsError ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '220px' }}>
              <div style={{ color: '#E11D48', fontSize: '14px', textAlign: 'center', padding: '0 32px' }}>{uploadsError}</div>
            </div>
          ) : filteredUploads.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', gap: '10px' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="8" />
                <polyline points="8,12 12,8 16,12" />
              </svg>
              <div style={{ fontSize: '14px', color: '#374151', textAlign: 'center', lineHeight: 1.5, maxWidth: '200px' }}>
                {searchQuery ? 'No tracks match your search.' : 'Tracks you upload will appear here.'}
              </div>
            </div>
          ) : (
            filteredUploads.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                isActive={playingId === track.id}
                isPlaying={playingId === track.id && !paused}
                progress={playingId === track.id ? progress : 0}
                onToggle={() => handleWaveformToggle(track)}
                actionSlot={
                  <div style={{
                    width: '30px', flexShrink: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: '2px',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#E11D48" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500, lineHeight: 1 }}>
                      {track.like_count}
                    </span>
                  </div>
                }
              />
            ))
          )
        )}

      </div>
    </div>
  );
}
