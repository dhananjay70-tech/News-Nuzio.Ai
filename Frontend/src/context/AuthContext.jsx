import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, userAPI } from '../api/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('nuzio_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('nuzio_token'));
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('nuzio_token');
      if (storedToken) {
        try {
          const res = await userAPI.getMe();
          if (res && res.user) {
            setUser(res.user);
            localStorage.setItem('nuzio_user', JSON.stringify(res.user));
          }
        } catch (err) {
          console.error('Failed to validate session:', err);
          // If token was invalid, clean up
          if (err.response?.status === 401) {
            logout();
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const register = async ({ name, email, password }) => {
    setLoading(true);
    setAuthError(null);
    try {
      const result = await authAPI.register({ name, email, password });
      setToken(result.token);
      setUser(result.user);
      localStorage.setItem('nuzio_token', result.token);
      localStorage.setItem('nuzio_user', JSON.stringify(result.user));
      return result.user;
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Registration failed';
      setAuthError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const login = async ({ email, password }) => {
    setLoading(true);
    setAuthError(null);
    try {
      const result = await authAPI.login({ email, password });
      setToken(result.token);
      setUser(result.user);
      localStorage.setItem('nuzio_token', result.token);
      localStorage.setItem('nuzio_user', JSON.stringify(result.user));
      return result.user;
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Invalid email or password';
      setAuthError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (preferences) => {
    try {
      await userAPI.updatePreferences(preferences);
      const updatedUser = {
        ...user,
        // `language` also lives top-level on `user` (available pre-onboarding,
        // independent of the rest of `preferences`) - keep both in sync.
        ...(preferences.language !== undefined ? { language: preferences.language } : null),
        preferences: { ...user?.preferences, ...preferences },
      };
      setUser(updatedUser);
      localStorage.setItem('nuzio_user', JSON.stringify(updatedUser));
      return updatedUser;
    } catch (err) {
      console.error('Failed to update preferences:', err);
      throw err;
    }
  };

  const logout = () => {
    authAPI.logout();
    setToken(null);
    setUser(null);
    setAuthError(null);
    localStorage.removeItem('nuzio_token');
    localStorage.removeItem('nuzio_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        authError,
        isAuthenticated: !!token && !!user,
        register,
        login,
        logout,
        updatePreferences,
        setAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
