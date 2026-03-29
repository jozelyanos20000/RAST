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
 *   track    {object}   — { id, filename, original_name, title, tags, artwork, ... }
 *   exitDir  {string}   — 'left' | 'right' | null  (triggers exit animation)
 *   onExited {function} — called when exit animation completes
 *   onSkip   {function} — called when X button pressed
 *   onLike   {function} — called when heart button pressed
 *   disabled {boolean}  — disables action buttons during loading/transition
 */
export default function SwipeCard({ track, exitDir = null, onExited, onSkip, onLike, disabled = false }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1

  const accentColor = ACCENT_COLORS[track.id % 6];
  const tags = parseTags(track.tags);
  const trackName = track.title || stripExtension(track.original_name);
  const artworkUrl = track.artwork || null;

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
        src={track.filename}
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

      {/* ── Progress bar (between filter button and credit badge) ── */}
      <div
        style={{
          position: 'absolute',
          top: '18px',
          left: '48px',
          right: '76px',
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

      {/* ── Bottom content: name row + tags + action buttons ── */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: '0 20px 24px',
        zIndex: 10,
      }}>

        {/* Name row */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{
            fontSize: '38px',
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1.05,
            letterSpacing: '-0.5px',
            textShadow: '0 2px 16px rgba(0,0,0,0.8)',
          }}>
            {trackName}
          </div>
        </div>

        {/* Description */}
        {track.description && (
          <div style={{
            fontSize: '12px',
            color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.45,
            marginBottom: '8px',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {track.description}
          </div>
        )}

        {/* Vibe tags */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: 'rgba(255,255,255,0.13)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff',
                fontSize: '9px',
                fontWeight: 500,
                padding: '3.5px 10px',
                borderRadius: '9999px',
                whiteSpace: 'nowrap',
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '26px',
        }}>
          {/* Skip (X) button */}
          <button
            onClick={onSkip}
            disabled={disabled}
            aria-label="Skip track"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: '#1c1c1e',
              border: '1.5px solid #2a2a2e',
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.4 : 1,
              transition: 'transform 0.1s ease, opacity 0.2s ease',
              padding: 0,
            }}
            onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = 'scale(0.93)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="#E11D48" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* Like (Heart) button */}
          <button
            onClick={onLike}
            disabled={disabled}
            aria-label="Like track"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#ffffff',
              border: 'none',
              boxShadow: '0 0 24px rgba(225,29,72,0.4), 0 6px 18px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.4 : 1,
              transition: 'transform 0.1s ease, opacity 0.2s ease',
              padding: 0,
            }}
            onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = 'scale(0.93)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24"
                 fill="#E11D48" stroke="#E11D48" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
