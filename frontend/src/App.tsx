import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './lib/api.js';
import LoginPage from './pages/LoginPage.js';
import HomePage from './pages/HomePage.js';
import ContactsListPage from './pages/ContactsListPage.js';
import ContactPage from './pages/ContactPage.js';
import FindGiftPage from './pages/FindGiftPage.js';
import SetupPage from './pages/SetupPage.js';
import ApproveRequestPage from './pages/ApproveRequestPage.js';
import ProfilePage from './pages/ProfilePage.js';
import MyGiftsPage from './pages/MyGiftsPage.js';
import CalendarPage from './pages/CalendarPage.js';
import GroupsPage from './pages/GroupsPage.js';
import GroupDetailPage from './pages/GroupDetailPage.js';
import JoinPage from './pages/JoinPage.js';
import AppShellLayout from './components/AppShellLayout.js';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">טוען...</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function SetupGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<'checking' | 'has-profile' | 'no-profile' | 'error'>('checking');

  useEffect(() => {
    if (!user) return;
    setStatus('checking');
    api.userProfile.me()
      .then(() => setStatus('has-profile'))
      .catch(err => setStatus(err instanceof ApiError && err.status === 404 ? 'no-profile' : 'error'));
  }, [user]);

  if (loading) return <div className="loading">טוען...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (status === 'checking') return <div className="loading">טוען...</div>;
  if (status === 'error') {
    return (
      <div className="loading">
        <p>לא הצלחנו להתחבר לשרת. בדוק את החיבור ונסה שוב.</p>
        <button type="button" onClick={() => window.location.reload()}>נסה שוב</button>
      </div>
    );
  }
  if (status === 'no-profile') return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

// Mounted once for every route that lives inside the app shell, so the shell
// (bottom nav, top bar, avatar fetch) persists across navigation instead of
// remounting fresh per page — that's what lets the bottom-nav active-tab
// animation actually transition, and avoids refetching the avatar on every click.
function Shell() {
  return (
    <AppShellLayout>
      <Outlet />
    </AppShellLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<ProtectedRoute><SetupPage /></ProtectedRoute>} />
        <Route path="/approve-request" element={<ApproveRequestPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<SetupGuard><HomePage /></SetupGuard>} />
          <Route path="/contacts" element={<SetupGuard><ContactsListPage /></SetupGuard>} />
          <Route path="/contact/:id" element={<SetupGuard><ContactPage /></SetupGuard>} />
          <Route path="/contact/:id/find-gift" element={<SetupGuard><FindGiftPage /></SetupGuard>} />
          <Route path="/profile" element={<SetupGuard><ProfilePage /></SetupGuard>} />
          <Route path="/my-gifts" element={<SetupGuard><MyGiftsPage /></SetupGuard>} />
          <Route path="/calendar" element={<SetupGuard><CalendarPage /></SetupGuard>} />
          <Route path="/groups" element={<SetupGuard><GroupsPage /></SetupGuard>} />
          <Route path="/groups/:id" element={<SetupGuard><GroupDetailPage /></SetupGuard>} />
          <Route path="/join/:token" element={<SetupGuard><JoinPage /></SetupGuard>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
