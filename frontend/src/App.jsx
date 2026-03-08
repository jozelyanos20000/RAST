import { useState, useCallback, useRef } from 'react';
import SwipeCard from './components/SwipeCard.jsx';
import NavBar from './components/NavBar.jsx';
import UploadScreen from './components/UploadScreen.jsx';
import { useTrackQueue } from './hooks/useTrackQueue.js';

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
function ExhaustedCard() {
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
    </div>
  );
}

/**
 * App — Root component.
 *
 * Layout (mobile-first, max-w 430px centered):
 *   ┌─────────────────┐
 *   │  card area      │  flex-1
 *   ├─────────────────┤
 *   │  action bar     │  100px
 *   ├─────────────────┤
 *   │  nav bar        │  60px
 *   └─────────────────┘
 *
 * Swipe flow:
 *   1. User presses Skip or Like
 *   2. exitDir is set → triggers SwipeCard CSS exit animation
 *   3. SwipeCard fires onExited when transition ends
 *   4. pendingActionRef.current() advances the queue (skipTrack / likeTrack)
 *   5. exitDir resets to null; hook fetches next track; key change re-mounts card
 */
export default function App() {
  const [activeTab, setActiveTab] = useState('discover');
  const { currentTrack, isLoading, isExhausted, skipTrack, likeTrack } = useTrackQueue();

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
    pendingActionRef.current = likeTrack;
    setExitDir('right');
  }, [currentTrack, exitDir, likeTrack]);

  const handleExited = useCallback(() => {
    // Fire the queued action, then clear animation state
    if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
    setExitDir(null);
  }, []);

  const isActionDisabled = isLoading || isExhausted || !currentTrack || !!exitDir;

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
        <UploadScreen onBack={() => setActiveTab('discover')} />
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

      {/* Card container */}
      <div style={{
        flex: 1,
        padding: '12px 12px 12px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}>
        {isLoading && !currentTrack ? (
          <SkeletonCard />
        ) : isExhausted ? (
          <ExhaustedCard />
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

      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
