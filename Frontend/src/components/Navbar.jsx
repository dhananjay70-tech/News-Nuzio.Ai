import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import Logo from './Logo';
import { Home, Compass, Bookmark, SlidersHorizontal, Settings, LogOut, Globe, ChevronDown } from 'lucide-react';

const Navbar = () => {
  const { user, logout, updatePreferences } = useAuth();
  const { savedStoryIds } = usePlayer();
  const { t } = usePreferences();
  const navigate = useNavigate();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const languageMenuRef = useRef(null);

  // Close language menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target)) {
        setShowLanguageMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleLanguageChange = async (language) => {
    try {
      await updatePreferences({ language });
      setShowLanguageMenu(false);

      // Dispatch custom event to notify Home page of language change
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));
    } catch (err) {
      console.error('Failed to update language:', err);
    }
  };

  const firstName = user?.name ? user.name.split(' ')[0] : 'User';
  const currentLanguage = user?.preferences?.language || user?.language || 'en';

  return (
    <header className="app-nav">
      <div className="app-nav-inner">
        {/* Left: Brand Logo */}
        <NavLink to="/home" style={{ textDecoration: 'none' }}>
          <Logo size="medium" />
        </NavLink>

        {/* Center: Desktop Navigation Links */}
        <nav className="nav-links" style={{ display: 'none' }}>
          {/* Will show via CSS on tablet / desktop */}
        </nav>

        {/* Responsive Desktop Nav (visible at >= 768px) */}
        <div
          className="desktop-nav-menu"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div className="desktop-links" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <NavLink
              to="/home"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Home size={16} />
              <span>{t('home')}</span>
            </NavLink>

            <NavLink
              to="/discover"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Compass size={16} />
              <span>{t('discover')}</span>
            </NavLink>

            <NavLink
              to="/saved"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              title={`${savedStoryIds.length} stories bookmarked`}
            >
              <Bookmark size={16} fill={savedStoryIds.length > 0 ? '#7657FF' : 'none'} />
              <span>{t('saved')}</span>
              {savedStoryIds.length > 0 && (
                <span
                  style={{
                    background: '#7657FF',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '999px',
                  }}
                >
                  {savedStoryIds.length}
                </span>
              )}
            </NavLink>
          </div>

          {/* Right: User Profile & Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginLeft: '16px',
              paddingLeft: '16px',
              borderLeft: '1px solid var(--border-subtle)',
            }}
          >
            {/* Language Switcher */}
            <div style={{ position: 'relative' }} ref={languageMenuRef}>
              <button
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                <Globe size={16} />
                <span>{currentLanguage === 'hi' ? 'हिन्दी' : 'English'}</span>
                <ChevronDown size={14} />
              </button>

              {showLanguageMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '8px',
                    minWidth: '140px',
                    zIndex: 1000,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <button
                    onClick={() => handleLanguageChange('en')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: currentLanguage === 'en' ? 'rgba(118, 87, 255, 0.14)' : 'transparent',
                      border: currentLanguage === 'en' ? '1px solid var(--border-active)' : 'none',
                      color: currentLanguage === 'en' ? '#FFFFFF' : 'var(--text-secondary)',
                      fontSize: '13px',
                      fontWeight: currentLanguage === 'en' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span>English 🇬🇧</span>
                  </button>
                  <button
                    onClick={() => handleLanguageChange('hi')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: currentLanguage === 'hi' ? 'rgba(118, 87, 255, 0.14)' : 'transparent',
                      border: currentLanguage === 'hi' ? '1px solid var(--border-active)' : 'none',
                      color: currentLanguage === 'hi' ? '#FFFFFF' : 'var(--text-secondary)',
                      fontSize: '13px',
                      fontWeight: currentLanguage === 'hi' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span>हिन्दी 🇮🇳</span>
                  </button>
                </div>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name || 'User'}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    border: '2px solid rgba(124, 92, 255, 0.5)',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7657FF 0%, #35D39A 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '14px',
                  }}
                >
                  {firstName.charAt(0)}
                </div>
              )}

              <div className="user-text-info" style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>
                  {user?.name || 'User'}
                </span>
                <span style={{ fontSize: '11px', color: '#8C90A0', lineHeight: 1.2 }}>
                  {user?.preferences?.profession || t('member')}
                </span>
              </div>
            </div>

            <NavLink
              to="/settings"
              title={t('settings')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              <Settings size={16} />
            </NavLink>

            <button
              onClick={handleLogout}
              title={t('signOut')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: '10px',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: '#F87171',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--danger-bg)')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
