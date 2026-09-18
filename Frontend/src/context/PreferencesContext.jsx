import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { t as translate } from '../i18n';

const PreferencesContext = createContext(null);

// Thin derived view over AuthContext's user.preferences - a single source
// of truth, exposed as `usePreferences()` for components that only care
// about preferences (language, interests, etc.), not the whole auth state.
export const PreferencesProvider = ({ children }) => {
  const { user, updatePreferences } = useAuth();

  const language = user?.preferences?.language || user?.language || 'en';

  const value = {
    language,
    profession: user?.preferences?.profession || '',
    interests: user?.preferences?.interests || [],
    voice: user?.preferences?.voice || 'Aria',
    briefingLength: user?.preferences?.briefingLength || '10 min',
    preferences: user?.preferences || null,
    updatePreferences,
    t: (key) => translate(key, language),
  };

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};
