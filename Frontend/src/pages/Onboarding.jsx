import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Button from '../components/Button';
import { ArrowRight, AlertCircle, Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', name: 'English 🇬🇧', description: 'Get news in English' },
  { code: 'hi', name: 'Hindi 🇮🇳', description: 'हिन्दी में समाचार प्राप्त करें' },
];

const Onboarding = () => {
  const { user, updatePreferences } = useAuth();
  const navigate = useNavigate();

  const [language, setLanguage] = useState(user?.preferences?.language || user?.language || 'en');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      // Save language preference to backend (also updates local user state)
      await updatePreferences({ language });

      // Notify any already-mounted pages (e.g. Home, once navigated to)
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));

      navigate('/home');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save language preference. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <Navbar />

      <main className="site-container">
        <div className="onboarding-container" style={{ maxWidth: '640px' }}>
          <div style={{ marginBottom: '36px' }}>
            <h1
              style={{
                fontSize: 'clamp(28px, 4vw, 36px)',
                fontWeight: 800,
                color: 'var(--text-main)',
                lineHeight: 1.2,
                marginBottom: '8px',
                letterSpacing: '-0.025em',
              }}
            >
              Choose Your Language
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Select your preferred language for news
            </p>
          </div>

          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#FCA5A5',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '24px',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '40px' }}>
            {LANGUAGES.map((lang) => {
              const isSelected = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '18px 20px',
                    borderRadius: '18px',
                    textAlign: 'left',
                    background: isSelected ? 'rgba(118, 87, 255, 0.14)' : 'var(--bg-card)',
                    border: isSelected
                      ? '1px solid var(--border-active)'
                      : '1px solid var(--border-subtle)',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        border: isSelected
                          ? '6px solid #7657FF'
                          : '2px solid rgba(255, 255, 255, 0.25)',
                        background: isSelected ? '#FFFFFF' : 'transparent',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                    />
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>
                        {lang.name}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {lang.description}
                      </div>
                    </div>
                  </div>
                  <Globe size={18} color={isSelected ? '#A994FF' : '#6F6A7C'} />
                </button>
              );
            })}
          </div>

          <Button
            variant="primary"
            size="lg"
            loading={isSubmitting}
            onClick={handleContinue}
            icon={ArrowRight}
            iconPosition="right"
            style={{ minWidth: '220px', height: '52px', borderRadius: '14px', fontSize: '15px' }}
          >
            Continue
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
