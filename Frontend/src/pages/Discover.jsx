import React, { useState, useEffect, useCallback } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import { newsAPI } from '../api/api';
import Navbar from '../components/Navbar';
import NewsCard from '../components/NewsCard';
import { Search, TrendingUp, AlertCircle, Compass } from 'lucide-react';

const Discover = () => {
  const { setQueue } = usePlayer();
  const { t, language } = usePreferences();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [discover, setDiscover] = useState({ trending: [], byCategory: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await newsAPI.getDiscover(language);
      setDiscover(data);
    } catch (err) {
      console.error('Error loading discover feed:', err);
      setError(err.response?.data?.message || t('briefingUnavailable'));
    } finally {
      setLoading(false);
    }
  }, [t, language]);

  useEffect(() => {
    loadDiscover();
  }, [loadDiscover]);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const { articles } = await newsAPI.getNews(language, 'All', 20, 1, query.trim());
      setSearchResults(articles);
      setQueue(articles);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
      setSearchError(err.response?.data?.message || t('briefingUnavailable'));
    } finally {
      setSearching(false);
    }
  };

  const hasDiscoverContent =
    discover.trending.length > 0 || Object.values(discover.byCategory).some((stories) => stories.length > 0);

  const sectionStyle = { marginBottom: '32px', position: 'relative', zIndex: 1 };
  const headingStyle = { fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <Navbar />

      <main className="site-container">
        <section style={sectionStyle}>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
            {t('discover')}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            {t('discoverSubtitle')}
          </p>

          <form onSubmit={handleSearch} style={{ position: 'relative', maxWidth: '480px' }}>
            <Search size={17} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              style={{
                width: '100%',
                padding: '13px 16px 13px 44px',
                borderRadius: '14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </form>
        </section>

        {searchResults !== null ? (
          <section style={sectionStyle}>
            <div style={headingStyle}>
              <Search size={18} color="#8B6CFF" />
              {t('resultsFor')} "{query}"
            </div>
            {searching ? (
              <div className="skeleton" style={{ height: '116px', borderRadius: '18px' }} />
            ) : searchError ? (
              <div className="card-glass" style={{ padding: '32px', textAlign: 'center', borderRadius: '20px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
                <AlertCircle size={28} color="#F87171" style={{ margin: '0 auto 10px' }} />
                <p style={{ color: '#FCA5A5', fontSize: '14px', marginBottom: '16px' }}>{searchError}</p>
                <button
                  onClick={() => handleSearch()}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    background: '#7657FF',
                    padding: '10px 20px',
                    borderRadius: '12px',
                    boxShadow: '0 4px 14px rgba(124, 92, 255, 0.4)',
                  }}
                >
                  {t('retryBriefing')}
                </button>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="card-glass" style={{ padding: '32px', textAlign: 'center', borderRadius: '20px', color: 'var(--text-secondary)' }}>
                {t('noResultsFor')} "{query}".
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
                {searchResults.map((story) => (
                  <NewsCard key={story.id} story={story} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
                {[1, 2, 3].map((n) => (
                  <div key={n} className="skeleton" style={{ height: '116px', borderRadius: '18px' }} />
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="card-glass" style={{ padding: '32px', textAlign: 'center', borderRadius: '20px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
                <AlertCircle size={28} color="#F87171" style={{ margin: '0 auto 10px' }} />
                <p style={{ color: '#FCA5A5', fontSize: '14px', marginBottom: '16px' }}>{error}</p>
                <button
                  onClick={loadDiscover}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    background: '#7657FF',
                    padding: '10px 20px',
                    borderRadius: '12px',
                    boxShadow: '0 4px 14px rgba(124, 92, 255, 0.4)',
                  }}
                >
                  {t('retryBriefing')}
                </button>
              </div>
            )}

            {!loading && !error && !hasDiscoverContent && (
              <div className="card-glass" style={{ padding: '48px 20px', textAlign: 'center', borderRadius: '20px', color: '#8C90A0', maxWidth: '760px' }}>
                <Compass size={40} color="#5E6272" style={{ margin: '0 auto 14px' }} />
                <h4 style={{ color: '#FFFFFF', fontSize: '16px', marginBottom: '6px' }}>{t('noStoriesTitle')}</h4>
                <p style={{ fontSize: '14px', maxWidth: '300px', margin: '0 auto' }}>{t('noStoriesDesc')}</p>
              </div>
            )}

            {!loading && !error && hasDiscoverContent && (
              <>
                {discover.trending.length > 0 && (
                  <section style={sectionStyle}>
                    <div style={headingStyle}>
                      <TrendingUp size={18} color="#35D39A" />
                      {t('trending')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
                      {discover.trending.map((story) => (
                        <NewsCard key={story.id} story={story} />
                      ))}
                    </div>
                  </section>
                )}

                {Object.entries(discover.byCategory).map(([category, stories]) => (
                  stories.length > 0 && (
                    <section key={category} style={sectionStyle}>
                      <div style={headingStyle}>
                        <Compass size={18} color="#8B6CFF" />
                        {category}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
                        {stories.map((story) => (
                          <NewsCard key={story.id} story={story} />
                        ))}
                      </div>
                    </section>
                  )
                ))}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Discover;
