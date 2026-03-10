import { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';

/** Render the crop to a canvas and return a JPEG Blob */
async function getCroppedImg(imageSrc, pixelCrop) {
  const img = new Image();
  img.src = imageSrc;
  await new Promise((resolve) => { img.onload = resolve; });
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  canvas.getContext('2d').drawImage(
    img,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height,
  );
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
}

const KEY_OPTIONS = [
  'None', 'C', 'Cm', 'C#', 'C#m', 'D', 'Dm', 'D#', 'D#m',
  'E', 'Em', 'F', 'Fm', 'F#', 'F#m', 'G', 'Gm', 'G#', 'G#m',
  'A', 'Am', 'A#', 'A#m', 'B', 'Bm',
];
const GENRE_OPTIONS = [
  'None', 'Hip Hop', 'Trap', 'R&B', 'Pop', 'Electronic',
  'Drill', 'Afrobeats', 'Lo-fi', 'Jazz', 'Soul', 'Other',
];

export default function UploadScreen({ onBack, accessToken }) {
  const [audioFile, setAudioFile] = useState(null);
  const [artwork, setArtwork] = useState(null);
  const [artworkPreview, setArtworkPreview] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bpm, setBpm] = useState('');
  const [key, setKey] = useState('None');
  const [genre, setGenre] = useState('None');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Crop modal state
  const [cropSrc, setCropSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedAreaPixelsRef = useRef(null);

  const audioInputRef = useRef(null);
  const artworkInputRef = useRef(null);

  const handleAudioChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setError('');
  }, []);

  const handleArtworkChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropSrc(ev.target.result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  }, []);

  const onCropComplete = useCallback((_, pixels) => {
    croppedAreaPixelsRef.current = pixels;
  }, []);

  const handleCropConfirm = useCallback(async () => {
    const blob = await getCroppedImg(cropSrc, croppedAreaPixelsRef.current);
    setArtwork(new File([blob], 'artwork.jpg', { type: 'image/jpeg' }));
    setArtworkPreview(URL.createObjectURL(blob));
    setCropSrc(null);
  }, [cropSrc]);

  const handleCropCancel = useCallback(() => {
    setCropSrc(null);
    if (artworkInputRef.current) artworkInputRef.current.value = '';
  }, []);

  const handleTagKeyDown = useCallback((e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const val = tagInput.trim().replace(/,/g, '');
      if (val && tags.length < 3 && !tags.includes(val)) {
        setTags(prev => [...prev, val]);
      }
      setTagInput('');
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(prev => prev.slice(0, -1));
    }
  }, [tagInput, tags]);

  const removeTag = useCallback((idx) => {
    setTags(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!audioFile) { setError('Please select an audio file.'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('audio', audioFile);
      if (artwork) fd.append('artwork', artwork);
      fd.append('title', title);
      fd.append('description', description);
      fd.append('bpm', bpm);
      fd.append('key', key === 'None' ? '' : key);
      fd.append('genre', genre === 'None' ? '' : genre);
      fd.append('tags', tags.join(','));

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Upload failed.');
      onBack();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [audioFile, artwork, title, description, bpm, key, genre, tags, onBack]);

  // ── Shared styles ──
  const cardStyle = {
    background: '#0d0d0f',
    borderRadius: '20px',
    padding: '20px',
    marginBottom: '12px',
  };

  const labelStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#9ca3af',
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '6px',
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

  const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundColorValue: '#1a1a1c',
    paddingRight: '36px',
    cursor: 'pointer',
    height: '44px',
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#000',
      overflowY: 'auto',
    }}>

      {/* ── Artwork crop modal ── */}
      {cropSrc && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Modal header */}
          <div style={{
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderBottom: '1px solid #1a1a1a',
            position: 'relative',
          }}>
            <span style={{ color: '#fff', fontSize: '17px', fontWeight: 700 }}>
              Crop Artwork
            </span>
          </div>

          {/* Cropper area */}
          <div style={{ position: 'relative', flex: 1 }}>
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={9 / 16}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          {/* Modal footer */}
          <div style={{
            height: '88px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            borderTop: '1px solid #1a1a1a',
            padding: '0 24px',
          }}>
            <button
              onClick={handleCropCancel}
              style={{
                flex: 1,
                height: '48px',
                borderRadius: '14px',
                background: '#1c1c1e',
                border: '1px solid #2a2a2e',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCropConfirm}
              style={{
                flex: 1,
                height: '48px',
                borderRadius: '14px',
                background: '#7C3AED',
                border: 'none',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(124,58,237,0.4)',
                fontFamily: 'inherit',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        height: '56px',
        padding: '0 16px',
        flexShrink: 0,
        borderBottom: '1px solid #1a1a1a',
        background: '#000',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '9px',
            margin: '-9px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12,5 5,12 12,19"/>
          </svg>
        </button>
        <span style={{ color: '#fff', fontSize: '17px', fontWeight: 700, flex: 1 }}>
          Upload Track
        </span>
      </div>

      {/* ── Scrollable form body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 32px' }}>

        {/* Error banner */}
        {error && (
          <div style={{
            background: '#2d0a0a',
            border: '1px solid #E11D48',
            borderRadius: '10px',
            color: '#f87171',
            fontSize: '13px',
            padding: '12px 16px',
            marginBottom: '12px',
          }}>
            {error}
          </div>
        )}

        {/* ── Audio Upload Zone ── */}
        <div style={cardStyle}>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>
            Audio File
          </div>
          <div
            onClick={() => audioInputRef.current?.click()}
            style={{
              border: `2px dashed ${audioFile ? '#0D9488' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '14px',
              height: '88px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              cursor: 'pointer',
              background: audioFile ? 'rgba(13,148,136,0.06)' : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            {audioFile ? (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                     stroke="#0D9488" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span style={{
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 500,
                  maxWidth: '280px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {audioFile.name}
                </span>
                <span style={{ color: '#6b7280', fontSize: '11px' }}>Tap to change</span>
              </>
            ) : (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                     stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"/>
                  <circle cx="6" cy="18" r="3"/>
                  <circle cx="18" cy="16" r="3"/>
                </svg>
                <span style={{ color: '#fff', fontSize: '14px' }}>
                  Drop your audio file here or{' '}
                  <span style={{ color: '#7C3AED' }}>browse</span>
                </span>
                <span style={{ color: '#6b7280', fontSize: '12px' }}>MP3 · WAV · Max 64 MB</span>
              </>
            )}
          </div>
          <input
            ref={audioInputRef}
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav"
            style={{ display: 'none' }}
            onChange={handleAudioChange}
          />
        </div>

        {/* ── Basic Info ── */}
        <div style={cardStyle}>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>
            Basic Info
          </div>

          {/* Artwork + Title row */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
            {/* Artwork thumbnail */}
            <div
              onClick={() => artworkInputRef.current?.click()}
              style={{
                width: '88px',
                height: '88px',
                flexShrink: 0,
                borderRadius: '10px',
                background: '#1a1a1c',
                border: '1px solid rgba(255,255,255,0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {artworkPreview ? (
                <img
                  src={artworkPreview}
                  alt="Artwork preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                     stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
            </div>
            <input
              ref={artworkInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleArtworkChange}
            />

            {/* Title field */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={labelStyle}>
                <span>Title</span>
                <span style={{ color: '#6b7280', fontSize: '12px' }}>{title.length}/60</span>
              </div>
              <input
                type="text"
                maxLength={60}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Track name"
                style={{ ...inputStyle, height: '44px', padding: '0 14px' }}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <div style={labelStyle}>
              <span>Description</span>
              <span style={{ color: '#6b7280', fontSize: '12px' }}>{description.length}/500</span>
            </div>
            <textarea
              maxLength={500}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's the vibe? Share the inspiration behind this loop."
              rows={3}
              style={{ ...inputStyle, resize: 'none', lineHeight: '1.5' }}
            />
          </div>
        </div>

        {/* ── Metadata ── */}
        <div style={cardStyle}>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>
            Metadata
          </div>

          {/* Key + BPM row */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 3 }}>
              <div style={labelStyle}><span>Key</span></div>
              <select
                value={key}
                onChange={e => setKey(e.target.value)}
                style={selectStyle}
              >
                {KEY_OPTIONS.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <div style={labelStyle}><span>BPM</span></div>
              <input
                type="number"
                min={1}
                max={999}
                value={bpm}
                onChange={e => setBpm(e.target.value)}
                placeholder="120"
                style={{ ...inputStyle, height: '44px', padding: '0 14px' }}
              />
            </div>
          </div>

          {/* Genre */}
          <div style={{ marginBottom: '16px' }}>
            <div style={labelStyle}><span>Genre</span></div>
            <select
              value={genre}
              onChange={e => setGenre(e.target.value)}
              style={selectStyle}
            >
              {GENRE_OPTIONS.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <div style={labelStyle}>
              <span>Tags</span>
              <span style={{ color: '#6b7280', fontSize: '12px' }}>{tags.length}/3</span>
            </div>
            <div
              style={{
                ...inputStyle,
                padding: '8px',
                minHeight: '44px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                alignItems: 'center',
                cursor: 'text',
                height: 'auto',
              }}
              onClick={() => document.getElementById('rast-tag-input')?.focus()}
            >
              {tags.map((tag, i) => (
                <span
                  key={tag}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: '#2a2a2e',
                    color: '#fff',
                    fontSize: '13px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                  }}
                >
                  {tag}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeTag(i); }}
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
              {tags.length < 3 && (
                <input
                  id="rast-tag-input"
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder={tags.length === 0 ? 'Type a vibe tag and press Enter' : 'Add another…'}
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
        </div>

        {/* ── Submit button ── */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            width: '100%',
            height: '54px',
            borderRadius: '20px',
            background: isSubmitting ? '#4c1d95' : '#7C3AED',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 700,
            border: 'none',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            boxShadow: '0 0 20px rgba(124,58,237,0.4)',
            transition: 'background 0.2s',
            fontFamily: 'inherit',
          }}
        >
          {isSubmitting ? 'Uploading…' : 'Upload Track'}
        </button>

      </div>
    </div>
  );
}
