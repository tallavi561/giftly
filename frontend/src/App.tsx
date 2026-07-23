import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from './lib/api.js';
import LoginPage from './pages/LoginPage.js';
import DashboardPage from './pages/DashboardPage.js';
import ContactPage from './pages/ContactPage.js';
import SetupPage from './pages/SetupPage.js';
import ApproveRequestPage from './pages/ApproveRequestPage.js';
import ProfilePage from './pages/ProfilePage.js';
import MyGiftsPage from './pages/MyGiftsPage.js';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">טוען...</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function SetupGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [checked, setChecked] = useState(false);
  const [hasSelf, setHasSelf] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.userProfile.me().then(() => {
      setHasSelf(true);
      setChecked(true);
    }).catch(() => {
      setHasSelf(false);
      setChecked(true);
    });
  }, [user]);

  if (loading) return <div className="loading">טוען...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!checked) return <div className="loading">טוען...</div>;
  if (!hasSelf) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<ProtectedRoute><SetupPage /></ProtectedRoute>} />
        <Route path="/" element={<SetupGuard><DashboardPage /></SetupGuard>} />
        <Route path="/contact/:id" element={<SetupGuard><ContactPage /></SetupGuard>} />
        <Route path="/approve-request" element={<ApproveRequestPage />} />
        <Route path="/profile" element={<SetupGuard><ProfilePage /></SetupGuard>} />
        <Route path="/my-gifts" element={<SetupGuard><MyGiftsPage /></SetupGuard>} />
      </Routes>
    </AuthProvider>
  );
}
