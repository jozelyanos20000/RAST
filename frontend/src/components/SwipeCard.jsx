import { useRef, useState, useEffect, useCallback } from 'react';
import WaveformSvg from './WaveformSvg.jsx';

/** Accent color palette indexed by track.id % 6 */
const ACCENT_COLORS = [
  '#7C3AED', // 0 — Purple
  '#0D9488', // 1 — Teal
  '#D97706', // 2 — Amber
  '#E11D48', // 3 — Rose
  '#2563EB', // 4 — Blue
  '#EA580C', // 5 — Orange
];

/** Strip file extension from a filename string */
function stripExtension(filename) {
  return filename ? filename.replace(/\.[^/.]+$/, '') : '';
}

/** Parse comma-separated tags string into a trimmed array, or [] */
function parseTags(tagsStr) {
  if (!tagsStr) return [];
  return tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
}

/**
 * SwipeCard — Full-height track card with waveform background,
 * audio playback, progress bar, and bottom track info.
 *
 * Props:
 *   track    {object}   — { id, filename, original_name }
 *   exitDir  {string}   — 'left' | 'right' | null  (triggers exit animation)
 *   onExited {function} — called when exit animation completes
 */
export default function SwipeCard({ track, exitDir = null, onExited }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1

  const accentColor = ACCENT_COLORS[track.id % 6];
  const tags = parseTags(track.tags);
  const trackName = track.title || stripExtension(track.original_name);
  const artworkUrl = track.artwork ? `/static/artwork/${track.artwork}` : null;

  /* ── Audio setup ── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress(audio.currentTime / audio.duration);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setProgress(0); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    // Auto-play on load (muted fallback handled by browser policy)
    audio.play().catch(() => { /* autoplay blocked — user must interact */ });

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, [track.filename]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  /* ── Exit animation end handler ── */
  const handleTransitionEnd = useCallback(() => {
    if (exitDir && onExited) onExited();
  }, [exitDir, onExited]);

  /* ── Exit transform ── */
  const exitStyle = exitDir === 'left'
    ? { transform: 'translateX(-160%) rotate(-22deg)', opacity: 0 }
    : exitDir === 'right'
    ? { transform: 'translateX(160%) rotate(22deg)', opacity: 0 }
    : { transform: 'translateX(0) rotate(0deg)', opacity: 1 };

  return (
    <div
      style={{
        flex: 1,
        borderRadius: '20px',
        overflow: 'hidden',
        position: 'relative',
        background: '#000',
        minHeight: 0,
        boxShadow: `0 0 0 1px #1e1e1e, 0 0 40px ${accentColor}26`,
        transition: exitDir ? 'transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease' : 'none',
        ...exitStyle,
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* ── Hidden audio element ── */}
      <audio
        ref={audioRef}
        src={`/static/uploads/${track.filename}`}
        preload="auto"
      />

      {/* ── Card background: artwork or waveform fallback (clickable to toggle play) ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: artworkUrl ? 'none' : '#000',
          paddingBottom: artworkUrl ? 0 : '80px',
          cursor: 'pointer',
          ...(artworkUrl && {
            backgroundImage: `url(${artworkUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }),
        }}
        onClick={togglePlay}
        role="button"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && togglePlay()}
      >
        {!artworkUrl && <WaveformSvg accentColor={accentColor} isPlaying={isPlaying} />}
      </div>

      {/* ── Progress bar (top, 16px from edges) ── */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          right: '16px',
          zIndex: 20,
        }}
      >
        <div style={{
          height: '4px',
          background: 'rgba(255,255,255,0.15)',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress * 100}%`,
            borderRadius: '9999px',
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)`,
            boxShadow: `0 0 8px ${accentColor}cc`,
            transition: 'width 0.25s linear',
          }} />
        </div>
      </div>

      {/* ── Gradient overlay (bottom-up) ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.75) 28%, rgba(0,0,0,0.3) 48%, transparent 62%)',
        pointerEvents: 'none',
        zIndex: 5,
      }} />

      {/* ── Bottom content: name row + tags ── */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: '0 20px 24px',
        zIndex: 10,
      }}>

        {/* Name row */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}>
          <div style={{
            fontSize: '38px',
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1.05,
            letterSpacing: '-0.5px',
            flex: 1,
            paddingRight: '12px',
            textShadow: '0 2px 16px rgba(0,0,0,0.8)',
          }}>
            {trackName}
          </div>

          {/* Upward arrow — stems purchase placeholder */}
          <button
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: 'pointer',
              marginBottom: '2px',
              padding: 0,
            }}
            aria-label="Purchase stems"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5,12 12,5 19,12"/>
            </svg>
          </button>
        </div>

        {/* Vibe tags */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: 'rgba(255,255,255,0.13)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                padding: '5px 14px',
                borderRadius: '9999px',
                whiteSpace: 'nowrap',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
