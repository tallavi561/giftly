import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Avatar from './Avatar.js';

interface NavItem { path: string; icon: string; label: string; }
const NAV_ITEMS: NavItem[] = [
  { path: '/',          icon: 'contacts',      label: 'אנשי קשר' },
  { path: '/calendar',  icon: 'calendar_today', label: 'לוח שנה' },
  { path: '/my-gifts',  icon: 'auto_awesome',  label: 'הצעות בשבילי' },
];

interface Props {
  children: ReactNode;
  headerExtra?: ReactNode;
  /** Removes the main-content padding so a page can render edge-to-edge (e.g. a full-screen feed). */
  fullBleed?: boolean;
}

export default function AppShellLayout({ children, headerExtra, fullBleed }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const [me, setMe] = useState<{ display_name: string; gender: string | null; birth_date: string | null; avatar_mode: 'illustrated' | 'silhouette' | 'photo'; avatar_url: string | null } | null>(null);

  useEffect(() => {
    api.userProfile.me().then(p => setMe({ display_name: p.display_name, gender: p.gender, birth_date: p.birth_date, avatar_mode: p.avatar_mode, avatar_url: p.avatar_url })).catch(() => {});
  }, []);

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
          <div className="top-bar-actions">
            {headerExtra}
            <button className="icon-btn" title="התראות">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="icon-btn" onClick={signOut} title="יציאה">
              <span className="material-symbols-outlined">logout</span>
            </button>
          </div>
          <div className="top-bar-brand">
            <h1 className="top-bar-wordmark">Giftly</h1>
            <button className="top-bar-avatar-btn" onClick={() => navigate('/profile')} title="הפרופיל שלי">
              <Avatar
                name={me?.display_name ?? '?'}
                gender={me?.gender}
                birthDate={me?.birth_date}
                avatarMode={me?.avatar_mode}
                avatarUrl={me?.avatar_url}
                size={40}
                className="top-bar-avatar"
              />
            </button>
          </div>
        </div>
      </header>

      <div className="app-body">
        {/* Side Nav (desktop) */}
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
        <main className={`main-content${fullBleed ? ' full-bleed' : ''}`}>
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
      </nav>
    </div>
  );
}
