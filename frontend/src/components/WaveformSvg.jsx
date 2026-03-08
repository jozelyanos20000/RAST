/**
 * WaveformSvg — EKG-style waveform with centered play button circle.
 * Renders flat baselines left/right, vertical bar spikes in center,
 * and a play circle overlay at the midpoint.
 *
 * Props:
 *   accentColor {string} — hex color applied to all waveform elements
 *   isPlaying   {boolean} — when true renders a pause icon, else play
 */
export default function WaveformSvg({ accentColor, isPlaying = false }) {
  return (
    <svg
      viewBox="0 0 320 140"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '90%', maxWidth: '340px' }}
      aria-label={isPlaying ? 'Pause track' : 'Play track'}
    >
      {/* ── Flat left baseline ── */}
      <line x1="0"   y1="70" x2="72"  y2="70" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>

      {/* ── Left spike cluster (ascending then descending height) ── */}
      <line x1="79"  y1="56" x2="79"  y2="84"  stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="87"  y1="50" x2="87"  y2="90"  stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="95"  y1="32" x2="95"  y2="108" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="103" y1="14" x2="103" y2="126" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="111" y1="26" x2="111" y2="114" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="119" y1="42" x2="119" y2="98"  stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>

      {/* ── Play / pause circle (center x=160, y=70, r=28) ── */}
      <circle
        cx="160" cy="70" r="28"
        stroke={accentColor}
        strokeWidth="2.5"
        fill={`${accentColor}14`}
      />

      {isPlaying ? (
        /* Pause icon: two vertical bars */
        <>
          <rect x="150" y="58" width="6" height="24" rx="2" fill={accentColor}/>
          <rect x="164" y="58" width="6" height="24" rx="2" fill={accentColor}/>
        </>
      ) : (
        /* Play triangle */
        <polygon points="153,58 153,82 176,70" fill={accentColor}/>
      )}

      {/* ── Right spike cluster (mirror of left) ── */}
      <line x1="201" y1="42" x2="201" y2="98"  stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="209" y1="26" x2="209" y2="114" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="217" y1="14" x2="217" y2="126" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="225" y1="32" x2="225" y2="108" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="233" y1="50" x2="233" y2="90"  stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="241" y1="56" x2="241" y2="84"  stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>

      {/* ── Flat right baseline ── */}
      <line x1="248" y1="70" x2="320" y2="70" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
