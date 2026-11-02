import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => setUser(null);
    window.addEventListener('mduik:unauthorized', onUnauthorized);
    return () => window.removeEventListener('mduik:unauthorized', onUnauthorized);
  }, [refresh]);

  const login = useCallback(async (identifier, password, schoolId) => {
    const data = await api.post('/auth/login', { identifier, password, schoolId });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const switchSchool = useCallback(async (schoolId) => {
    const data = await api.post('/auth/context', { schoolId });
    setUser(data.user);
    return data.user;
  }, []);

  const patchUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, switchSchool, patchUser, setUser }),
    [user, loading, login, logout, refresh, switchSchool, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
