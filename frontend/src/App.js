import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Matches from './pages/Matches';
import Preferences from './pages/Preferences';
import Profile from './pages/Profile';
import Applications from './pages/Applications';
import Analytics from './pages/Analytics';
import Layout from './components/Layout';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthCallback() {
  const navigate = useNavigate();
  const processed = React.useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash;
    const sessionId = new URLSearchParams(hash.replace('#', '?')).get('session_id');
    if (!sessionId) {
      navigate('/');
      return;
    }

    api.exchangeSession(sessionId)
      .then((user) => {
        navigate('/dashboard', { state: { user } });
      })
      .catch(() => {
        navigate('/');
      });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" state={{ from: location }} replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();

  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/matches" element={<ProtectedRoute><Layout><Matches /></Layout></ProtectedRoute>} />
      <Route path="/preferences" element={<ProtectedRoute><Layout><Preferences /></Layout></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute><Layout><Applications /></Layout></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
    </Routes>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    try {
      const u = await api.getMe();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const logout = async () => {
    await api.logout();
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout }}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;
