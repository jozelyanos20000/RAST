/**
 * NavBar — Bottom tab navigation with 5 tabs.
 * All icons are inline SVG — no external icon library.
 *
 * Props:
 *   activeTab {string} — 'discover' | 'upload' | 'library' | 'chat' | 'profile'
 */

const TABS = [
  {
    id: 'discover',
    label: 'Discover',
    icon: (color) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
           stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        {/* Compass needle diamond */}
        <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill={color} stroke="none"/>
      </svg>
    ),
  },
  {
    id: 'upload',
    label: 'Upload',
    icon: (color) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
           stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="8"/>
        <polyline points="8,12 12,8 16,12"/>
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Library',
    icon: (color) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
           stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4"  width="18" height="4" rx="1"/>
        <rect x="3" y="10" width="18" height="4" rx="1"/>
        <rect x="3" y="16" width="18" height="4" rx="1"/>
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (color) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
           stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (color) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
           stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

export default function NavBar({ activeTab = 'discover', onTabChange }) {
  return (
    <div style={{
      height: '60px',
      display: 'flex',
      alignItems: 'stretch',
      background: '#000',
      borderTop: '1px solid #161616',
      flexShrink: 0,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const iconColor = isActive ? '#ffffff' : '#6B7280';

        return (
          <button
            key={tab.id}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onTabChange?.(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              gap: '3px',
              padding: 0,
            }}
          >
            {tab.icon(iconColor)}
            {isActive && (
              <div style={{
                width: '4px',
                height: '4px',
                borderRadius: '50%',
                background: '#7C3AED',
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
