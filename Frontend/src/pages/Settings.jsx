import React from 'react';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useSettings } from '../context/SettingsContext';
import Navbar from '../components/Navbar';
import {
  CreditCard, Moon, Sun, Download, SkipForward, Bell, Mic2, Gauge, ChevronRight,
} from 'lucide-react';

const VOICES = ['Aria', 'Kai', 'Meera'];
const VOICE_ACCENTS = { Aria: 'British, warm', Kai: 'American, focused', Meera: 'Indian, calm' };
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const LENGTHS = ['5 min', '10 min', '15 min'];

const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: '11px', fontWeight: 700, color: 'var(--primary-bright)', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '12px', marginTop: '28px',
  }}>
    {children}
  </div>
);

const ToggleRow = ({ icon: Icon, label, description, checked, onChange }) => (
  <div className="card-glass" style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px',
    borderRadius: '14px', marginBottom: '10px',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Icon size={18} color="var(--text-secondary)" />
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>{label}</div>
        {description && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{description}</div>}
      </div>
    </div>
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: '44px', height: '26px', borderRadius: '999px', position: 'relative',
        background: checked ? 'var(--accent-green)' : 'rgba(255,255,255,0.12)',
        transition: 'background 0.2s ease', flexShrink: 0,
      }}
      role="switch"
      aria-checked={checked}
    >
      <span style={{
        position: 'absolute', top: '3px', left: checked ? '22px' : '3px',
        width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF',
        transition: 'left 0.2s ease',
      }} />
    </button>
  </div>
);

const Settings = () => {
  const { user } = useAuth();
  const { t, briefingLength, voice, updatePreferences } = usePreferences();
  const {
    theme, setTheme, autoAdvance, setAutoAdvance, offlineMode, setOfflineMode,
    pushNotifications, setPushNotifications, defaultSpeed, setDefaultSpeed,
  } = useSettings();

  const handleLengthChange = (len) => updatePreferences({ ...user?.preferences, briefingLength: len });
  const handleVoiceCycle = () => {
    const current = VOICES.indexOf(voice) === -1 ? 0 : VOICES.indexOf(voice);
    const next = VOICES[(current + 1) % VOICES.length];
    updatePreferences({ ...user?.preferences, voice: next });
  };
  const handleSpeedCycle = () => {
    const current = SPEEDS.indexOf(defaultSpeed) === -1 ? 1 : SPEEDS.indexOf(defaultSpeed);
    setDefaultSpeed(SPEEDS[(current + 1) % SPEEDS.length]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <Navbar />

      <main className="site-container" style={{ maxWidth: '560px' }}>
        <h1 style={{ fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 800, color: 'var(--text-main)', marginBottom: '24px' }}>
          {t('settings')}
        </h1>

        {/* Plan & billing */}
        <div className="card-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CreditCard size={18} color="var(--text-secondary)" />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>{t('planBilling')}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {t('free')} — {t('upgradeForUnlimited')}
              </div>
            </div>
          </div>
          <span style={{
            fontSize: '11px', fontWeight: 700, color: 'var(--primary-bright)', background: 'rgba(118,87,255,0.14)',
            padding: '4px 10px', borderRadius: '999px',
          }}>
            {t('free')}
          </span>
        </div>

        {/* Appearance */}
        <SectionLabel>{t('appearance')}</SectionLabel>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          {[{ key: 'dark', label: t('dark'), icon: Moon }, { key: 'light', label: t('light'), icon: Sun }].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '14px', borderRadius: '14px', fontWeight: 600, fontSize: '14px',
                background: theme === key ? 'var(--primary)' : 'var(--bg-card)',
                color: theme === key ? '#FFFFFF' : 'var(--text-secondary)',
                border: theme === key ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        <ToggleRow icon={Download} label={t('offlineMode')} description={t('offlineModeDesc')} checked={offlineMode} onChange={setOfflineMode} />
        <ToggleRow icon={SkipForward} label={t('autoAdvance')} description={t('autoAdvanceDesc')} checked={autoAdvance} onChange={setAutoAdvance} />
        <ToggleRow icon={Bell} label={t('pushNotifications')} description={t('pushNotificationsDesc')} checked={pushNotifications} onChange={setPushNotifications} />

        {/* Brief length */}
        <SectionLabel>{t('briefLength')}</SectionLabel>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {LENGTHS.map((len) => {
            const isSelected = briefingLength === len;
            return (
              <button
                key={len}
                onClick={() => handleLengthChange(len)}
                style={{
                  padding: '12px 24px', borderRadius: '14px', fontWeight: 600, fontSize: '14px',
                  background: isSelected ? 'rgba(118,87,255,0.16)' : 'var(--bg-card)',
                  color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                  border: isSelected ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)',
                }}
              >
                {len}
              </button>
            );
          })}
        </div>

        {/* Playback */}
        <SectionLabel>{t('playback')}</SectionLabel>
        <button
          onClick={handleVoiceCycle}
          className="card-glass"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderRadius: '14px', marginBottom: '10px', textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Mic2 size={18} color="var(--text-secondary)" />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>{t('voice')}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {voice} — {VOICE_ACCENTS[voice] || ''}
              </div>
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-muted)" />
        </button>

        <button
          onClick={handleSpeedCycle}
          className="card-glass"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderRadius: '14px', marginBottom: '10px', textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Gauge size={18} color="var(--text-secondary)" />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>{t('defaultSpeed')}</div>
          </div>
          <span style={{
            fontSize: '13px', fontWeight: 700, color: 'var(--primary-bright)', background: 'rgba(118,87,255,0.14)',
            padding: '4px 10px', borderRadius: '999px',
          }}>
            {defaultSpeed}x
          </span>
        </button>
      </main>
    </div>
  );
};

export default Settings;
