import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const SettingsContext = createContext(null);

const STORAGE_KEY = 'nuzio_settings';

const DEFAULTS = {
  theme: 'dark', // 'dark' | 'light'
  autoAdvance: true,
  offlineMode: false,
  pushNotifications: false,
  defaultSpeed: 1,
};

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

// Device-local settings (appearance, playback defaults, notification/offline
// toggles) - kept in localStorage rather than the backend, since these are
// per-browser preferences, not content-personalization data.
export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings]);

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Push notifications need explicit browser permission - only flip the
  // setting on if the user actually grants it.
  const setPushNotifications = useCallback(async (enabled) => {
    if (!enabled) {
      updateSetting('pushNotifications', false);
      return false;
    }
    if (!('Notification' in window)) return false;
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    updateSetting('pushNotifications', granted);
    return granted;
  }, [updateSetting]);

  // Fire a local notification (e.g. "your briefing is ready"). This is a
  // real, working browser Notification tied to actual app activity - not
  // true server push while the app is closed, which would need a service
  // worker + push server and is out of scope here.
  const notify = useCallback((title, options) => {
    if (!settings.pushNotifications) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(title, options);
    } catch {
      // Notification construction can throw in some contexts (e.g. some
      // mobile browsers require a service worker) - fail silently.
    }
  }, [settings.pushNotifications]);

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        setTheme: (theme) => updateSetting('theme', theme),
        setAutoAdvance: (v) => updateSetting('autoAdvance', v),
        setOfflineMode: (v) => updateSetting('offlineMode', v),
        setPushNotifications,
        setDefaultSpeed: (v) => updateSetting('defaultSpeed', v),
        notify,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
