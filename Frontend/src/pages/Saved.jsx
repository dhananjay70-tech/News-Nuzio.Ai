import React, { useState, useEffect, useCallback } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import { newsAPI } from '../api/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import useDebouncedValue from '../hooks/useDebouncedValue';
import Navbar from '../components/Navbar';
import NewsCard from '../components/NewsCard';
import SkeletonList from '../components/SkeletonList';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { RefreshCw, Bookmark, Search, X } from 'lucide-react';

const Saved = () => {
  const { setQueue, savedStoryIds } = usePlayer();
  const { t } = usePreferences();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const debouncedQuery = useDebouncedValue(query, 300);

  const fetchSaved = useCallback(async (search = debouncedQuery, sortBy = sort) => {
    setLoading(true);
    setError(null);
    try {
      const data = await newsAPI.getSaved({ search: search || undefined, sort: sortBy });
      const list = data?.news || [];
      setStories(list);
      if (list.length > 0) setQueue(list);
    } catch (err) {
      console.error('Error fetching saved stories:', err);
      setError(getErrorMessage(err, 'savedUnavailable', t));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, sort, t]);

  useEffect(() => {
    fetchSaved(debouncedQuery, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, sort]);

  // Reacts to unsaves from anywhere in the app (NewsCard/AudioPlayer bookmark
  // toggles are optimistic in PlayerContext) so a story disappears
  // immediately without waiting on a refetch.
  const visibleStories = stories.filter((s) => savedStoryIds.includes(s.id));

  const handleHide = (id) => {
    setStories((prev) => prev.filter((s) => s.id !== id));
  };

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
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchSavedPlaceholder')}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  borderRadius: '12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              {query && (
                <button onClick={() => setQuery('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <X size={13} />
                </button>
              )}
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              title={t('sortBy')}
              style={{
                padding: '0 12px',
                borderRadius: '12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontFamily: 'inherit',
              }}
            >
              <option value="newest">{t('sortNewest')}</option>
              <option value="relevance">{t('sortRelevance')}</option>
            </select>
          </div>

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
              {visibleStories.length} {t('saved')}
            </span>

            <button
              onClick={() => fetchSaved()}
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

          {loading && <SkeletonList count={3} />}

          {!loading && error && <ErrorState message={error} onRetry={() => fetchSaved()} />}

          {!loading && !error && visibleStories.length === 0 && query && (
            <EmptyState icon={Search} title={`${t('noSavedMatchTitle')} "${query}"`} />
          )}

          {!loading && !error && visibleStories.length === 0 && !query && (
            <EmptyState icon={Bookmark} title={t('noSavedTitle')} description={t('noSavedDesc')} />
          )}

          {!loading && !error && visibleStories.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {visibleStories.map((story) => (
                <NewsCard key={story.id} story={story} onHide={handleHide} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Saved;
