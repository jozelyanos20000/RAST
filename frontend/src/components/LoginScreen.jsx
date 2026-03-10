import { useState, useCallback } from 'react';

const inputStyle = {
  width: '100%',
  background: '#161618',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '16px',
  padding: '15px 16px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  WebkitAppearance: 'none',
  transition: 'border-color 0.15s ease',
};

export default function LoginScreen({ onLogin, onGoToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, onLogin]);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      background: '#000',
      padding: '18% 28px 0',
      boxSizing: 'border-box',
    }}>

      {/* Logo */}
      <div style={{ marginBottom: '52px', textAlign: 'center' }}>
        <div style={{
          fontSize: '56px',
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '-3px',
          lineHeight: 1,
          marginBottom: '10px',
          textShadow: '0 0 48px rgba(124,58,237,0.55)',
        }}>
          RAST
        </div>
        <div style={{ color: '#6B7280', fontSize: '15px', letterSpacing: '0.01em' }}>
          Welcome back
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '380px' }}>

        <div style={{ marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Email or Username"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            style={inputStyle}
            autoComplete="email"
            autoCapitalize="none"
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            style={inputStyle}
            autoComplete="current-password"
          />
        </div>

        {/* Error */}
        <div style={{
          minHeight: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '8px',
        }}>
          {error && (
            <span style={{ color: '#f87171', fontSize: '13px', textAlign: 'center' }}>
              {error}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: '100%',
            height: '52px',
            borderRadius: '14px',
            background: isSubmitting ? '#4c1d95' : '#7C3AED',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 700,
            border: 'none',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            boxShadow: '0 0 28px rgba(124,58,237,0.35)',
            transition: 'background 0.2s, box-shadow 0.2s',
            fontFamily: 'inherit',
            letterSpacing: '0.01em',
          }}
        >
          {isSubmitting ? 'Signing in…' : 'Log In'}
        </button>
      </form>

      {/* Divider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        margin: '28px 0',
        width: '100%',
        maxWidth: '380px',
      }}>
        <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
        <span style={{ color: '#3a3a3a', fontSize: '12px' }}>or</span>
        <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
      </div>

      {/* Register link */}
      <div style={{ color: '#6B7280', fontSize: '14px', textAlign: 'center' }}>
        Don&apos;t have an account?{' '}
        <button
          onClick={onGoToRegister}
          style={{
            background: 'none',
            border: 'none',
            color: '#7C3AED',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          Sign up
        </button>
      </div>

    </div>
  );
}
