import React, { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import { newsAPI } from '../api/api';
import Navbar from '../components/Navbar';
import NewsCard from '../components/NewsCard';
import { RefreshCw, AlertCircle, Bookmark } from 'lucide-react';

const Saved = () => {
  const { setQueue } = usePlayer();
  const { t } = usePreferences();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSaved = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await newsAPI.getSaved();
      const list = data?.news || [];
      setStories(list);
      if (list.length > 0) setQueue(list);
    } catch (err) {
      console.error('Error fetching saved stories:', err);
      setError(err.response?.data?.message || t('briefingUnavailable'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <Navbar />

      <main className="site-container">
        <section style={{ marginBottom: '24px', position: 'relative', zIndex: 1 }}>
          <h1
            style={{
              fontSize: 'clamp(26px, 4vw, 36px)',
              fontWeight: 800,
              lineHeight: 1.2,
              color: 'var(--text-main)',
              letterSpacing: '-0.025em',
              margin: '0 0 8px',
            }}
          >
            {t('savedStories')}
          </h1>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bookmark size={15} color="#8B6CFF" />
            {t('savedStoriesDesc')}
          </div>
        </section>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '760px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#8B6CFF',
                background: 'rgba(124, 92, 255, 0.14)',
                padding: '2px 10px',
                borderRadius: '999px',
                border: '1px solid rgba(124, 92, 255, 0.25)',
              }}
            >
              {stories.length} {t('saved')}
            </span>

            <button
              onClick={fetchSaved}
              title={t('refresh')}
              style={{
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                padding: '6px 12px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>{t('refresh')}</span>
            </button>
          </div>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[1, 2, 3].map((n) => (
                <div key={n} className="skeleton" style={{ height: '116px', borderRadius: '18px', width: '100%' }} />
              ))}
            </div>
          )}

          {!loading && error && (
            <div
              className="card-glass"
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                borderRadius: '20px',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
              }}
            >
              <AlertCircle size={32} color="#F87171" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: '#FCA5A5', fontSize: '14px', marginBottom: '16px' }}>{error}</p>
              <button
                onClick={fetchSaved}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: 'var(--primary)',
                  padding: '10px 20px',
                  borderRadius: '12px',
                }}
              >
                {t('retry')}
              </button>
            </div>
          )}

          {!loading && !error && stories.length === 0 && (
            <div
              className="card-glass"
              style={{
                padding: '48px 20px',
                textAlign: 'center',
                borderRadius: '20px',
                color: 'var(--text-secondary)',
              }}
            >
              <Bookmark size={40} color="#5E6272" style={{ margin: '0 auto 14px' }} />
              <h4 style={{ color: 'var(--text-main)', fontSize: '16px', marginBottom: '6px' }}>
                {t('noSavedTitle')}
              </h4>
              <p style={{ fontSize: '14px', maxWidth: '320px', margin: '0 auto' }}>
                {t('noSavedDesc')}
              </p>
            </div>
          )}

          {!loading && !error && stories.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {stories.map((story) => (
                <NewsCard key={story.id} story={story} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Saved;
