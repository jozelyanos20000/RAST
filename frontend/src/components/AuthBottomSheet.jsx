import { useState } from 'react';
import LoginScreen from './LoginScreen.jsx';
import RegisterScreen from './RegisterScreen.jsx';

/**
 * AuthBottomSheet — Slides up from the bottom prompting guests to sign up or log in.
 *
 * Renders three views: 'choose' (two buttons), 'login' (LoginScreen), 'register' (RegisterScreen).
 * Unmount to dismiss — view state resets on next mount.
 *
 * Props:
 *   onLogin    {function} — (email, password) => Promise — same as useAuth.login
 *   onRegister {function} — (username, email, password) => Promise — same as useAuth.register
 *   onClose    {function} — called when backdrop is tapped
 */
export default function AuthBottomSheet({ onLogin, onRegister, onClose }) {
  const [view, setView] = useState('choose');

  return (
    <>
      <style>{`
        @keyframes rast-sheet-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes rast-sheet-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 200,
          animation: 'rast-sheet-fade 0.2s ease-out',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxWidth: '430px',
        margin: '0 auto',
        background: '#111',
        borderRadius: '20px 20px 0 0',
        zIndex: 201,
        maxHeight: '92vh',
        overflow: 'auto',
        animation: 'rast-sheet-up 0.3s ease-out',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {/* Drag indicator */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          paddingTop: '12px',
          paddingBottom: view === 'choose' ? '0' : '0',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}>
          <div style={{
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: '#333',
          }} />
        </div>

        {view === 'choose' ? (
          <div style={{ padding: '20px 24px 36px' }}>
            <h2 style={{
              fontSize: '22px',
              fontWeight: 800,
              color: '#fff',
              margin: '0 0 8px',
              textAlign: 'center',
            }}>
              Join RAST to save this loop
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6B7280',
              margin: '0 0 28px',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              Create an account or log in to like loops, upload your own, and earn credits.
            </p>
            <button
              onClick={() => setView('register')}
              style={{
                width: '100%',
                height: '52px',
                borderRadius: '14px',
                border: 'none',
                background: '#7C3AED',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: '12px',
                boxShadow: '0 0 28px rgba(124,58,237,0.35)',
                fontFamily: 'inherit',
              }}
            >
              Sign Up
            </button>
            <button
              onClick={() => setView('login')}
              style={{
                width: '100%',
                height: '52px',
                borderRadius: '14px',
                border: '1px solid #2a2a2e',
                background: 'transparent',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Log In
            </button>
          </div>
        ) : view === 'login' ? (
          <LoginScreen
            onLogin={onLogin}
            onGoToRegister={() => setView('register')}
          />
        ) : (
          <RegisterScreen
            onRegister={onRegister}
            onGoToLogin={() => setView('login')}
          />
        )}
      </div>
    </>
  );
}
