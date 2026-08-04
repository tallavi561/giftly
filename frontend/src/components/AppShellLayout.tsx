import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

interface NavItem { path: string; icon: string; label: string; }
const NAV_ITEMS: NavItem[] = [
  { path: '/',          icon: 'contacts',      label: 'אנשי קשר' },
  { path: '/my-gifts',  icon: 'favorite',      label: 'המתנות שלי' },
  { path: '/calendar',  icon: 'calendar_today', label: 'לוח שנה' },
];

interface Props {
  children: ReactNode;
  headerExtra?: ReactNode;
}

export default function AppShellLayout({ children, headerExtra }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  function isActive(path: string | null) {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <div className="app-shell">
      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="top-bar-brand">
            <img src="/logo.png" alt="Giftly" />
          </div>
          <div className="top-bar-actions">
            {headerExtra}
            <button className="icon-btn" onClick={() => navigate('/profile')} title="הפרופיל שלי">
              <span className="material-symbols-outlined">account_circle</span>
            </button>
            <button className="btn-signout" onClick={signOut}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, marginLeft: 4 }}>logout</span>
              יציאה
            </button>
          </div>
        </div>
      </header>

      <div className="app-body">
        {/* Side Nav */}
        <nav className="side-nav">
          {NAV_ITEMS.map(item => (
            <div
              key={item.label}
              className={`side-nav-item${isActive(item.path) ? ' active' : ''}`}
              onClick={() => navigate(item.path)}
              style={{ cursor: 'pointer' }}
            >
              <span className={`material-symbols-outlined${isActive(item.path) ? ' icon-fill' : ''}`}>
                {item.icon}
              </span>
              {item.label}
            </div>
          ))}
        </nav>

        {/* Page content */}
        <main className="main-content">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav">
        {NAV_ITEMS.map(item => (
          <div
            key={item.label}
            className={`mobile-nav-item${isActive(item.path) ? ' active' : ''}`}
            onClick={() => item.path && navigate(item.path)}
          >
            <span className={`material-symbols-outlined${isActive(item.path) ? ' icon-fill' : ''}`}>
              {item.icon}
            </span>
            {item.label}
          </div>
        ))}
        <div className="mobile-nav-item" onClick={() => navigate('/profile')}>
          <span className="material-symbols-outlined">account_circle</span>
          פרופיל
        </div>
      </nav>
    </div>
  );
}
