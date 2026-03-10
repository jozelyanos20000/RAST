import { useEffect, useState } from 'react';

const ACCENT_COLORS = ['#7C3AED', '#0D9488', '#D97706', '#E11D48', '#2563EB', '#EA580C'];

export default function ProfileScreen({ accessToken, onLogout }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetch('/api/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setUser(data);
      })
      .catch((err) => setError(err.message));
  }, [accessToken]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await onLogout();
  };

  // Derive avatar color from username length (stable, no track ID available here)
  const avatarColor = user
    ? ACCENT_COLORS[user.username.length % ACCENT_COLORS.length]
    : '#7C3AED';

  const initial = user ? user.username[0].toUpperCase() : '';

  return (
    <div style={{
      height: '100%',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '60px 24px 40px',
      gap: '32px',
      overflowY: 'auto',
    }}>

      {/* Avatar */}
      <div style={{
        width: '96px',
        height: '96px',
        borderRadius: '50%',
        background: avatarColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '42px',
        fontWeight: 900,
        color: '#fff',
        flexShrink: 0,
        boxShadow: `0 0 32px ${avatarColor}55`,
      }}>
        {initial}
      </div>

      {error && (
        <div style={{ color: '#E11D48', fontSize: '14px', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {user && (
        <div style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          {/* Username row */}
          <div style={{
            background: '#0f0f0f',
            border: '1px solid #1e1e1e',
            borderRadius: '14px',
            padding: '16px 20px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Username
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
              {user.username}
            </div>
          </div>

          {/* Email row */}
          <div style={{
            background: '#0f0f0f',
            border: '1px solid #1e1e1e',
            borderRadius: '14px',
            padding: '16px 20px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Email
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
              {user.email}
            </div>
          </div>
        </div>
      )}

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        style={{
          marginTop: 'auto',
          width: '100%',
          padding: '16px',
          borderRadius: '14px',
          border: '1px solid #E11D48',
          background: 'transparent',
          color: '#E11D48',
          fontSize: '16px',
          fontWeight: 700,
          cursor: signingOut ? 'not-allowed' : 'pointer',
          opacity: signingOut ? 0.5 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {signingOut ? 'Signing out…' : 'Sign Out'}
      </button>

    </div>
  );
}
