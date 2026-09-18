import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { Search, TrendingUp, Compass, SlidersHorizontal, X, Flame, Star, Clock3, Headphones, Landmark } from 'lucide-react';

const CATEGORIES = ['All', 'Tech', 'AI', 'Student', 'India', 'World', 'Business', 'Startups', 'Sports', 'Science'];
const TIME_OPTIONS = ['', 'today', 'week', 'month'];
const SORT_OPTIONS = ['', 'relevance', 'trending', 'latest'];

const SECTIONS = [
  { key: 'trendingNow', titleKey: 'sectionTrendingNow', icon: Flame, color: '#F87171' },
  { key: 'topStories', titleKey: 'sectionTopStories', icon: Star, color: '#FBBF24' },
  { key: 'forYou', titleKey: 'sectionForYou', icon: Compass, color: '#8B6CFF' },
  { key: 'latest', titleKey: 'sectionLatest', icon: Clock3, color: '#35D39A' },
  { key: 'mostListened', titleKey: 'sectionMostListened', icon: Headphones, color: '#A994FF' },
  { key: 'topInIndia', titleKey: 'sectionTopInIndia', icon: Landmark, color: '#38BDF8' },
];

const sectionStyle = { marginBottom: '32px', position: 'relative', zIndex: 1 };
const headingStyle = { fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' };

const Discover = () => {
  const { setQueue } = usePlayer();
  const { t, language } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const debouncedQuery = useDebouncedValue(query, 350);
  const [category, setCategory] = useState(searchParams.get('category') || 'All');
  const [time, setTime] = useState(searchParams.get('time') || '');
  const [source, setSource] = useState(searchParams.get('source') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [history, setHistory] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  const [discover, setDiscover] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const searchBoxRef = useRef(null);

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await newsAPI.getDiscover(language);
      setDiscover(data);
    } catch (err) {
      console.error('Error loading discover feed:', err);
      setError(getErrorMessage(err, 'discoverUnavailable', t));
    } finally {
      setLoading(false);
    }
  }, [t, language]);

  useEffect(() => {
    loadDiscover();
  }, [loadDiscover]);

  useEffect(() => {
    newsAPI.getSearchHistory().then(setHistory).catch(() => {});
    newsAPI.getSearchSuggestions().then(setSuggestions).catch(() => {});
  }, []);

  // Close the history/suggestions dropdown on outside click
  useEffect(() => {
    if (!showHistory) return;
    const handleOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setShowHistory(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showHistory]);

  const runSearch = useCallback(async (q, filters) => {
    if (!q.trim()) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const { news } = await newsAPI.search(q.trim(), { language, ...filters });
      setSearchResults(news);
      setQueue(news);
      newsAPI.getSearchHistory().then(setHistory).catch(() => {});
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
      setSearchError(getErrorMessage(err, 'searchFailed', t));
    } finally {
      setSearching(false);
    }
  }, [language, setQueue, t]);

  // Debounced search on query/filter change
  useEffect(() => {
    runSearch(debouncedQuery, { category, time, source, sort });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, category, time, source, sort]);

  // Sync to URL (omit empty/default values to keep it clean)
  useEffect(() => {
    const params = {};
    if (query.trim()) params.q = query.trim();
    if (category !== 'All') params.category = category;
    if (time) params.time = time;
    if (source) params.source = source;
    if (sort) params.sort = sort;
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, time, source, sort]);

  const handleHideFromSearch = (id) => {
    setSearchResults((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
  };

  const handleHideFromSection = (sectionKey, id) => {
    setDiscover((prev) => (prev ? { ...prev, [sectionKey]: prev[sectionKey].filter((s) => s.id !== id) } : prev));
  };

  const handleClearHistory = async () => {
    try {
      await newsAPI.clearSearchHistory();
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear search history:', err);
    }
  };

  const hasDiscoverContent = discover && SECTIONS.some(({ key }) => (discover[key] || []).length > 0);
  const isSearchMode = query.trim().length > 0;

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

          <div ref={searchBoxRef} style={{ position: 'relative', maxWidth: '560px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={17} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setShowHistory(true)}
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
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', padding: '4px' }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowFilters((v) => !v)}
                title={t('filters')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 16px',
                  borderRadius: '14px',
                  background: showFilters ? 'rgba(124, 92, 255, 0.14)' : 'var(--bg-card)',
                  border: showFilters ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)',
                  color: showFilters ? '#A994FF' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <SlidersHorizontal size={15} />
              </button>
            </div>

            {/* Search history / suggestions dropdown */}
            {showHistory && !isSearchMode && (history.length > 0 || suggestions.length > 0) && (
              <div
                className="card-glass"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  borderRadius: '16px',
                  background: 'var(--bg-card-elevated)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-card)',
                  padding: '14px',
                }}
              >
                {history.length > 0 && (
                  <div style={{ marginBottom: suggestions.length > 0 ? '14px' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {t('recentSearches')}
                      </span>
                      <button onClick={handleClearHistory} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {t('clearAll')}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {history.map((q) => (
                        <button
                          key={q}
                          onClick={() => { setQuery(q); setShowHistory(false); }}
                          style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {suggestions.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                      {t('suggestedSearches')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => { setQuery(s); setShowHistory(false); }}
                          style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '999px', background: 'rgba(124,92,255,0.1)', color: '#A994FF' }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {showFilters && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px', maxWidth: '760px' }}>
              <FilterSelect label={t('filterCategory')} value={category} onChange={setCategory} options={CATEGORIES.map((c) => [c, categoryLabel(c, t)])} />
              <FilterSelect label={t('filterTime')} value={time} onChange={setTime} options={TIME_OPTIONS.map((v) => [v, v ? t(timeLabelKey(v)) : t('anyTime')])} />
              <FilterSelect label={t('filterSort')} value={sort} onChange={setSort} options={SORT_OPTIONS.map((v) => [v, sortLabel(v, t)])} />
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  {t('filterSource')}
                </label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder={t('sourcePlaceholder')}
                  style={{ padding: '8px 12px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', fontSize: '12px', width: '140px' }}
                />
              </div>
            </div>
          )}
        </section>

        {isSearchMode ? (
          <section style={sectionStyle}>
            <div style={headingStyle}>
              <Search size={18} color="#8B6CFF" />
              {t('resultsFor')} "{query}"
            </div>
            {searching ? (
              <SkeletonList count={3} />
            ) : searchError ? (
              <ErrorState message={searchError} onRetry={() => runSearch(query, { category, time, source, sort })} maxWidth="760px" />
            ) : searchResults && searchResults.length === 0 ? (
              <EmptyState title={`${t('noResultsFor')} "${query}"`} maxWidth="760px" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
                {(searchResults || []).map((story) => (
                  <NewsCard key={story.id} story={story} onHide={handleHideFromSearch} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {loading && <SkeletonList count={3} />}

            {!loading && error && <ErrorState message={error} onRetry={loadDiscover} maxWidth="760px" />}

            {!loading && !error && !hasDiscoverContent && (
              <EmptyState icon={Compass} title={t('noStoriesTitle')} description={t('noStoriesDesc')} maxWidth="760px" />
            )}

            {!loading && !error && hasDiscoverContent && SECTIONS.map(({ key, titleKey, icon: Icon, color }) => {
              const items = discover[key] || [];
              if (items.length === 0) return null;
              return (
                <section key={key} style={sectionStyle}>
                  <div style={headingStyle}>
                    <Icon size={18} color={color} />
                    {t(titleKey)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
                    {items.map((story) => (
                      <NewsCard key={story.id} story={story} onHide={(id) => handleHideFromSection(key, id)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
};

const categoryLabel = (cat, t) => (cat === 'All' ? t('allCategory') : t(`category_${cat}`));
const timeLabelKey = (v) => (v === 'today' ? 'today' : v === 'week' ? 'thisWeek' : 'thisMonth');
const sortLabel = (v, t) =>
  v === 'relevance' ? t('sortRelevance') : v === 'trending' ? t('trending') : v === 'latest' ? t('sectionLatest') : t('filterSort');

const FilterSelect = ({ label, value, onChange, options }) => (
  <div>
    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '8px 12px',
        borderRadius: '10px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-main)',
        fontSize: '12px',
        fontFamily: 'inherit',
      }}
    >
      {options.map(([val, lbl]) => (
        <option key={val} value={val}>{lbl}</option>
      ))}
    </select>
  </div>
);

export default Discover;
