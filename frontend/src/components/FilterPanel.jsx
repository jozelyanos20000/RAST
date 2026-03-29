import { useState, useRef, useCallback, useEffect } from 'react';

const GENRE_OPTIONS = [
  'Hip Hop', 'Trap', 'Rage', 'R&B', 'Pop', 'Electronic',
  'Drill', 'Afro', 'Lo-fi', 'Other',
];

const BPM_MIN = 1;
const BPM_MAX = 300;
const ACCENT = '#7C3AED';

export default function FilterPanel({ isOpen, currentFilters, onApply, onClose }) {
  const [genres, setGenres] = useState(new Set());
  const [keywords, setKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [bpmMin, setBpmMin] = useState(BPM_MIN);
  const [bpmMax, setBpmMax] = useState(BPM_MAX);

  // Sync draft state when panel opens
  useEffect(() => {
    if (isOpen) {
      setGenres(new Set(currentFilters.genres || []));
      setKeywords([...(currentFilters.keywords || [])]);
      setKeywordInput('');
      setBpmMin(currentFilters.bpmMin ?? BPM_MIN);
      setBpmMax(currentFilters.bpmMax ?? BPM_MAX);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGenre = useCallback((g) => {
    setGenres(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }, []);

  const handleKeywordKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && keywordInput.trim()) {
      e.preventDefault();
      const val = keywordInput.trim();
      setKeywords(prev => {
        if (prev.length >= 5 || prev.includes(val)) return prev;
        return [...prev, val];
      });
      setKeywordInput('');
    }
    if (e.key === 'Backspace' && !keywordInput) {
      setKeywords(prev => prev.slice(0, -1));
    }
  }, [keywordInput]);

  const removeKeyword = useCallback((idx) => {
    setKeywords(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleReset = useCallback(() => {
    setGenres(new Set());
    setKeywords([]);
    setKeywordInput('');
    setBpmMin(BPM_MIN);
    setBpmMax(BPM_MAX);
  }, []);

  const handleApply = useCallback(() => {
    onApply({
      genres: [...genres],
      keywords: [...keywords],
      bpmMin,
      bpmMax,
    });
  }, [onApply, genres, keywords, bpmMin, bpmMax]);

  // ── BPM Dual Range Slider ──────────────────────────────────────────────
  const trackRef = useRef(null);
  const draggingRef = useRef(null);
  const bpmMinRef = useRef(bpmMin);
  const bpmMaxRef = useRef(bpmMax);
  useEffect(() => { bpmMinRef.current = bpmMin; }, [bpmMin]);
  useEffect(() => { bpmMaxRef.current = bpmMax; }, [bpmMax]);

  const pctMin = ((bpmMin - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100;
  const pctMax = ((bpmMax - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100;

  const getValueFromX = useCallback((clientX) => {
    if (!trackRef.current) return BPM_MIN;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(BPM_MIN + pct * (BPM_MAX - BPM_MIN));
  }, []);

  const handleSliderStart = useCallback((thumb) => (e) => {
    e.preventDefault();
    draggingRef.current = thumb;

    const handleMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const val = getValueFromX(clientX);
      if (draggingRef.current === 'min') {
        setBpmMin(Math.min(val, bpmMaxRef.current));
      } else {
        setBpmMax(Math.max(val, bpmMinRef.current));
      }
    };

    const handleEnd = () => {
      draggingRef.current = null;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  }, [getValueFromX]);

  const handleTrackClick = useCallback((e) => {
    if (draggingRef.current) return;
    const val = getValueFromX(e.clientX);
    const distMin = Math.abs(val - bpmMinRef.current);
    const distMax = Math.abs(val - bpmMaxRef.current);
    if (distMin <= distMax) {
      setBpmMin(Math.min(val, bpmMaxRef.current));
    } else {
      setBpmMax(Math.max(val, bpmMinRef.current));
    }
  }, [getValueFromX]);

  // ── Styles ─────────────────────────────────────────────────────────────

  const sectionLabelStyle = {
    fontSize: '18px',
    fontWeight: 800,
    color: '#fff',
    marginBottom: '14px',
  };

  const inputStyle = {
    width: '100%',
    background: '#1a1a1c',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '14px',
    padding: '11px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      pointerEvents: isOpen ? 'auto' : 'none',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxWidth: '430px',
        margin: '0 auto',
        maxHeight: '88vh',
        background: '#000',
        borderTopLeftRadius: '20px',
        borderTopRightRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.5)',
      }}>
        <style>{`
          .rast-filter-scroll::-webkit-scrollbar { display: none; }
        `}</style>

        {/* Handle bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '10px 0 0',
          flexShrink: 0,
        }}>
          <div style={{
            width: '36px',
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(255,255,255,0.2)',
          }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px 12px',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: ACCENT,
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
              minWidth: '70px',
              textAlign: 'left',
            }}
          >
            Cancel
          </button>
          <span style={{
            fontSize: '17px',
            fontWeight: 700,
            color: '#fff',
          }}>
            Filter
          </span>
          <button
            onClick={handleReset}
            style={{
              background: 'none',
              border: 'none',
              color: ACCENT,
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
              minWidth: '70px',
              textAlign: 'right',
            }}
          >
            Reset all
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 20px 24px',
        }}>

          {/* ── Genres ── */}
          <div style={{ marginBottom: '28px' }}>
            <div style={sectionLabelStyle}>Genres</div>
            <div
              className="rast-filter-scroll"
              style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                paddingBottom: '4px',
              }}
            >
              {GENRE_OPTIONS.map(g => {
                const selected = genres.has(g);
                return (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    style={{
                      flexShrink: 0,
                      padding: '8px 18px',
                      borderRadius: '9999px',
                      border: selected ? `1px solid ${ACCENT}` : '1px solid rgba(255,255,255,0.15)',
                      background: selected ? ACCENT : 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 0.15s ease, border-color 0.15s ease',
                    }}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Keywords ── */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}>
              <span style={sectionLabelStyle}>Keywords</span>
              <span style={{ color: '#4B5563', fontSize: '12px', fontWeight: 500 }}>
                {keywords.length}/5
              </span>
            </div>
            <div style={{
              ...inputStyle,
              padding: '8px',
              minHeight: '44px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              alignItems: 'center',
              height: 'auto',
            }}>
              {keywords.map((kw, i) => (
                <span
                  key={kw}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(124,58,237,0.2)',
                    border: '1px solid rgba(124,58,237,0.4)',
                    color: '#fff',
                    fontSize: '13px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                  }}
                >
                  {kw}
                  <button
                    onClick={() => removeKeyword(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9ca3af',
                      cursor: 'pointer',
                      padding: '0 0 0 2px',
                      fontSize: '15px',
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {keywords.length < 5 && (
                <input
                  type="text"
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeywordKeyDown}
                  placeholder={keywords.length === 0 ? 'Type a keyword and press Enter' : 'Add another…'}
                  style={{
                    flex: 1,
                    minWidth: '120px',
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontSize: '14px',
                    outline: 'none',
                    padding: '4px 6px',
                    fontFamily: 'inherit',
                  }}
                />
              )}
            </div>
          </div>

          {/* ── BPM Range ── */}
          <div style={{ marginBottom: '16px' }}>
            <div style={sectionLabelStyle}>BPM Range</div>

            {/* Slider track */}
            <div
              ref={trackRef}
              onClick={handleTrackClick}
              style={{
                position: 'relative',
                height: '4px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '2px',
                cursor: 'pointer',
                margin: '18px 10px',
                touchAction: 'none',
              }}
            >
              {/* Active range */}
              <div style={{
                position: 'absolute',
                left: `${pctMin}%`,
                right: `${100 - pctMax}%`,
                top: 0,
                bottom: 0,
                background: ACCENT,
                borderRadius: '2px',
              }} />

              {/* Min thumb */}
              <div
                onMouseDown={handleSliderStart('min')}
                onTouchStart={handleSliderStart('min')}
                style={{
                  position: 'absolute',
                  left: `${pctMin}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: `0 0 0 3px rgba(124,58,237,0.25), 0 2px 8px rgba(0,0,0,0.5)`,
                  cursor: 'grab',
                  touchAction: 'none',
                  zIndex: 2,
                }}
              />

              {/* Max thumb */}
              <div
                onMouseDown={handleSliderStart('max')}
                onTouchStart={handleSliderStart('max')}
                style={{
                  position: 'absolute',
                  left: `${pctMax}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: `0 0 0 3px rgba(124,58,237,0.25), 0 2px 8px rgba(0,0,0,0.5)`,
                  cursor: 'grab',
                  touchAction: 'none',
                  zIndex: 2,
                }}
              />
            </div>

            {/* Values */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0 6px',
            }}>
              <span style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 600 }}>{bpmMin}</span>
              <span style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 600 }}>{bpmMax}</span>
            </div>
          </div>
        </div>

        {/* Apply button */}
        <div style={{
          padding: '12px 20px 28px',
          flexShrink: 0,
        }}>
          <button
            onClick={handleApply}
            style={{
              width: '100%',
              height: '54px',
              borderRadius: '16px',
              background: ACCENT,
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(124,58,237,0.4)',
              fontFamily: 'inherit',
            }}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
