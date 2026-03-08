/**
 * ActionBar — Skip (X) and Like (Heart) action buttons.
 *
 * Props:
 *   onSkip   {function} — called when X button pressed
 *   onLike   {function} — called when heart button pressed
 *   disabled {boolean}  — disables both buttons during loading
 */
export default function ActionBar({ onSkip, onLike, disabled = false }) {
  return (
    <div style={{
      height: '100px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '52px',
      background: '#000',
      flexShrink: 0,
    }}>

      {/* Skip (X) button */}
      <button
        onClick={onSkip}
        disabled={disabled}
        aria-label="Skip track"
        style={{
          width: '60px',
          height: '60px',
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
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
             stroke="#E11D48" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      {/* Like (Heart) button — center, larger, white bg */}
      <button
        onClick={onLike}
        disabled={disabled}
        aria-label="Like track"
        style={{
          width: '72px',
          height: '72px',
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
        <svg width="32" height="32" viewBox="0 0 24 24"
             fill="#E11D48" stroke="#E11D48" strokeWidth="1.5"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>

    </div>
  );
}
