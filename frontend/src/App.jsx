import { useState, useCallback, useRef, useEffect } from 'react';
import SwipeCard from './components/SwipeCard.jsx';
import NavBar from './components/NavBar.jsx';
import UploadScreen from './components/UploadScreen.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import RegisterScreen from './components/RegisterScreen.jsx';
import ProfileScreen from './components/ProfileScreen.jsx';
import LibraryScreen from './components/LibraryScreen.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import { useTrackQueue } from './hooks/useTrackQueue.js';
import { useAuth } from './hooks/useAuth.js';
import { API_BASE } from './config.js';

/**
 * SplashScreen — shown while the auth session check is in-flight.
 */
function SplashScreen() {
  return (
    <div style={{
      height: '100%',
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <style>{`
        @keyframes rast-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
      `}</style>
      <div style={{
        fontSize: '52px',
        fontWeight: 900,
        color: '#fff',
        letterSpacing: '-3px',
        animation: 'rast-pulse 1.8s ease-in-out infinite',
        textShadow: '0 0 40px rgba(124,58,237,0.5)',
      }}>
        RAST
      </div>
    </div>
  );
}

/**
 * SkeletonCard — placeholder shown while the first track loads.
 */
function SkeletonCard() {
  return (
    <div style={{
      flex: 1,
      borderRadius: '20px',
      background: '#0a0a0a',
      boxShadow: '0 0 0 1px #1e1e1e',
      minHeight: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <style>{`
        @keyframes jm-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .jm-skeleton { animation: jm-pulse 1.8s ease-in-out infinite; }
      `}</style>
      <div className="jm-skeleton">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
             stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/>
          <polygon points="10,8 10,16 16,12" fill="#2a2a2a" stroke="none"/>
        </svg>
      </div>
    </div>
  );
}

/**
 * ExhaustedCard — shown when the user has heard all available tracks.
 */
function ExhaustedCard({ onRefresh }) {
  return (
    <div style={{
      flex: 1,
      borderRadius: '20px',
      background: '#0a0a0a',
      boxShadow: '0 0 0 1px #1e1e1e',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '32px',
      textAlign: 'center',
    }}>
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
           stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9"  y1="9" x2="9.01"  y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
      <div style={{
        fontSize: '22px',
        fontWeight: 800,
        color: '#fff',
        lineHeight: 1.2,
      }}>
        You've heard everything!
      </div>
      <div style={{
        fontSize: '14px',
        color: '#6B7280',
        lineHeight: 1.5,
        maxWidth: '240px',
      }}>
        Upload your own loops to discover more from other producers.
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          style={{
            marginTop: '8px',
            padding: '10px 28px',
            borderRadius: '9999px',
            border: '1px solid rgba(124,58,237,0.5)',
            background: 'rgba(124,58,237,0.15)',
            color: '#A78BFA',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Refresh Feed
        </button>
      )}
    </div>
  );
}

/**
 * App — Root component.
 *
 * Auth flow:
 *   isLoading=true  → SplashScreen (session check in-flight)
 *   !accessToken    → LoginScreen / RegisterScreen
 *   accessToken     → full app (Discover / Upload)
 *
 * Swipe flow (Discover):
 *   1. User presses Skip or Like
 *   2. exitDir is set → triggers SwipeCard CSS exit animation
 *   3. SwipeCard fires onExited when transition ends
 *   4. pendingActionRef.current() advances the queue (skipTrack / likeTrack)
 *   5. exitDir resets to null; hook fetches next track; key change re-mounts card
 */
export default function App() {
  const { accessToken, credits, isLoading: authLoading, login, register, logout, refreshCredits } = useAuth();
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'
  const [activeTab, setActiveTab] = useState('discover');
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filters, setFilters] = useState({ genres: [], keywords: [], bpmMin: 1, bpmMax: 300 });
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeUserRef = useRef(null);

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    if (welcomeUserRef.current) {
      localStorage.setItem(`rast_welcome_seen_${welcomeUserRef.current}`, '1');
    }
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setActiveTab('discover');
    setFilters({ genres: [], keywords: [], bpmMin: 1, bpmMax: 300 });
    setShowWelcome(false);
    welcomeUserRef.current = null;
  }, [logout]);

  // ── Welcome banner: check if first-time user ──
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const [meRes, uploadsRes] = await Promise.all([
          fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${accessToken}` } }),
          fetch(`${API_BASE}/api/my-uploads`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        ]);
        if (cancelled || !meRes.ok || !uploadsRes.ok) return;
        const me = await meRes.json();
        const uploads = await uploadsRes.json();
        if (cancelled) return;
        welcomeUserRef.current = me.username;
        const seen = localStorage.getItem(`rast_welcome_seen_${me.username}`);
        if (!seen && uploads.length === 0 && me.credits === 5) {
          setShowWelcome(true);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [accessToken]);

  const { currentTrack, isLoading, isExhausted, skipTrack, likeTrack, resetQueue } =
    useTrackQueue(accessToken, { onCreditChange: refreshCredits, filters });

  const hasActiveFilters = filters.genres.length > 0 || filters.keywords.length > 0
    || filters.bpmMin > 1 || filters.bpmMax < 300;

  const handleApplyFilters = useCallback((newFilters) => {
    setFilters(newFilters);
    setShowFilterPanel(false);
  }, []);

  // Reset discover feed when navigating back to the Discover tab
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (activeTab === 'discover' && prevTabRef.current !== 'discover') {
      resetQueue();
    }
    // Auto-dismiss welcome banner when navigating to Upload
    if (activeTab === 'upload' && showWelcome) {
      dismissWelcome();
    }
    prevTabRef.current = activeTab;
  }, [activeTab, resetQueue, showWelcome, dismissWelcome]);

  // 'left' | 'right' | null — drives the card exit animation
  const [exitDir, setExitDir] = useState(null);

  // Stores the queue-advance function to call after the animation ends
  const pendingActionRef = useRef(null);

  const handleSkip = useCallback(() => {
    if (!currentTrack || exitDir) return;
    pendingActionRef.current = skipTrack;
    setExitDir('left');
  }, [currentTrack, exitDir, skipTrack]);

  const handleLike = useCallback(() => {
    if (!currentTrack || exitDir) return;
    if (credits < 1) {
      showToast("You're out of credits, upload a loop to earn more");
      return;
    }
    pendingActionRef.current = likeTrack;
    setExitDir('right');
  }, [currentTrack, exitDir, likeTrack, credits, showToast]);

  const handleExited = useCallback(() => {
    if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
    setExitDir(null);
  }, []);

  const isActionDisabled = isLoading || isExhausted || !currentTrack || !!exitDir;

  // ── Auth loading ──
  if (authLoading) {
    return <SplashScreen />;
  }

  // ── Unauthenticated ──
  if (!accessToken) {
    return (
      <div style={{ height: '100%', background: '#000' }}>
        {authView === 'register' ? (
          <RegisterScreen
            onRegister={register}
            onGoToLogin={() => setAuthView('login')}
          />
        ) : (
          <LoginScreen
            onLogin={login}
            onGoToRegister={() => setAuthView('register')}
          />
        )}
      </div>
    );
  }

  // ── Library screen ──
  if (activeTab === 'library') {
    return (
      <div style={{
        height: '100%',
        maxWidth: '430px',
        margin: '0 auto',
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <LibraryScreen accessToken={accessToken} />
        <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    );
  }

  // ── Chat screen ──
  if (activeTab === 'chat') {
    return (
      <div style={{
        height: '100%',
        maxWidth: '430px',
        margin: '0 auto',
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>Coming Soon :)</div>
          <div style={{ fontSize: '13px', color: '#4B5563', textAlign: 'center', maxWidth: '200px', lineHeight: 1.5 }}>
            Chat with other producers is on the way.
          </div>
        </div>
        <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    );
  }

  // ── Profile screen ──
  if (activeTab === 'profile') {
    return (
      <div style={{
        height: '100%',
        maxWidth: '430px',
        margin: '0 auto',
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <ProfileScreen accessToken={accessToken} onLogout={handleLogout} credits={credits} />
        <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    );
  }

  // ── Upload screen ──
  if (activeTab === 'upload') {
    return (
      <div style={{
        height: '100%',
        maxWidth: '430px',
        margin: '0 auto',
        background: '#000',
        overflow: 'hidden',
      }}>
        <UploadScreen
          onBack={() => setActiveTab('discover')}
          accessToken={accessToken}
          refreshCredits={refreshCredits}
        />
      </div>
    );
  }

  // ── Discover screen ──
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '430px',
      margin: '0 auto',
      background: '#000',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Filter button (top left) */}
      <button
        onClick={() => setShowFilterPanel(true)}
        aria-label="Filters"
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 30,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        {hasActiveFilters && (
          <div style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#7C3AED',
          }} />
        )}
      </button>

      {/* Credit badge (top right) */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        zIndex: 30,
        background: 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '9999px',
        padding: '4px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="#D97706" stroke="none">
          <circle cx="12" cy="12" r="10"/>
        </svg>
        <span style={{
          fontSize: '12px',
          fontWeight: 700,
          color: '#fff',
          lineHeight: 1,
        }}>{credits}</span>
      </div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'absolute',
          top: '56px',
          left: '20px',
          right: '20px',
          zIndex: 40,
          background: 'rgba(30,30,30,0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#fff',
          textAlign: 'center',
        }}>{toast}</div>
      )}

      {/* Welcome banner */}
      {showWelcome && (
        <>
          <style>{`
            @keyframes welcome-fadein {
              from { opacity: 0; transform: translateY(-8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <div style={{
            margin: '52px 12px 0',
            padding: '12px 14px',
            background: 'rgba(124,58,237,0.08)',
            border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            zIndex: 25,
            position: 'relative',
            animation: 'welcome-fadein 0.35s ease-out',
            boxShadow: '0 0 20px rgba(124,58,237,0.12)',
            flexShrink: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.4,
              }}>
                Welcome to RAST 🎛️
              </div>
              <div style={{
                fontSize: '12px',
                color: 'rgba(255,255,255,0.6)',
                lineHeight: 1.4,
                marginTop: '2px',
              }}>
                You have 5 loops on us. Upload your first loop and unlock 20 more.
              </div>
              <div style={{
                marginTop: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#A78BFA',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                     stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <polyline points="5,12 12,19 19,12"/>
                </svg>
                Tap Upload below
              </div>
            </div>
            <button
              onClick={dismissWelcome}
              aria-label="Dismiss welcome"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Card container */}
      <div style={{
        flex: 1,
        padding: showWelcome ? '6px 12px 12px' : '12px 12px 12px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}>
        {isLoading && !currentTrack ? (
          <SkeletonCard />
        ) : isExhausted ? (
          <ExhaustedCard onRefresh={resetQueue} />
        ) : currentTrack ? (
          <SwipeCard
            key={currentTrack.id}
            track={currentTrack}
            exitDir={exitDir}
            onExited={handleExited}
            onSkip={handleSkip}
            onLike={handleLike}
            disabled={isActionDisabled}
          />
        ) : (
          <SkeletonCard />
        )}
      </div>

      <NavBar activeTab={activeTab} onTabChange={setActiveTab} pulseUpload={showWelcome} />

      <FilterPanel
        isOpen={showFilterPanel}
        currentFilters={filters}
        onApply={handleApplyFilters}
        onClose={() => setShowFilterPanel(false)}
      />
    </div>
  );
}
