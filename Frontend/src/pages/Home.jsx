import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import { newsAPI } from '../api/api';
import Navbar from '../components/Navbar';
import CategoryPill from '../components/CategoryPill';
import AudioPlayer from '../components/AudioPlayer';
import NewsCard from '../components/NewsCard';
import { RefreshCw, AlertCircle, Sparkles, Inbox, History, Play } from 'lucide-react';

const CATEGORIES = ['All', 'Tech', 'AI', 'Student', 'India', 'World', 'Business', 'Startups', 'Sports', 'Science'];

// Category filter *values* (sent to the backend, used for `selectedCategory`
// state) always stay these English keys - only the displayed label is
// translated, via `categoryLabel` below.
const categoryLabel = (cat, t) => (cat === 'All' ? t('allCategory') : t(`category_${cat}`));

const Home = () => {
  const { user } = useAuth();
  const { currentStory, playStory, setQueue, stopStory } = usePlayer();
  const { t } = usePreferences();

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLanguage, setSelectedLanguage] = useState(user?.language || 'en');
  const [stories, setStories] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [newsError, setNewsError] = useState(null);
  const [continueListening, setContinueListening] = useState([]);

  // Time-aware greeting (recomputed each render - trivial cost, and must
  // stay in sync with the current language)
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('greetingMorning') : hour < 18 ? t('greetingAfternoon') : t('greetingEvening');

  const firstName = user?.name ? user.name.split(' ')[0] : 'there';

  const fetchNews = async (cat = selectedCategory, lang = selectedLanguage) => {
    setLoadingNews(true);
    setNewsError(null);
    try {
      const data = await newsAPI.getNews(lang, cat, 20, 1);
      const list = data?.articles || [];
      setStories(list);

      // If no story is currently queued, set queue and prime first story
      if (list.length > 0) {
        setQueue(list);
        if (!currentStory) {
          playStory(list[0], list);
        }
      }
    } catch (err) {
      console.error('Error fetching news:', err);
      setNewsError(err.response?.data?.message || t('briefingUnavailable'));
    } finally {
      setLoadingNews(false);
    }
  };

  useEffect(() => {
    setSelectedLanguage(user?.language || 'en');
  }, [user]);

  // Listen for language changes from navbar
  useEffect(() => {
    const handleLanguageChange = (event) => {
      const newLanguage = event.detail.language;
      setSelectedLanguage(newLanguage);
      // Stop current playback and clear the queue when language changes -
      // they're in the old language, and playStory's language-tagged TTS
      // request would otherwise keep speaking/playing them.
      stopStory();
      setQueue([]);
    };

    window.addEventListener('languageChanged', handleLanguageChange);
    return () => {
      window.removeEventListener('languageChanged', handleLanguageChange);
    };
  }, [stopStory, setQueue]);

  useEffect(() => {
    fetchNews(selectedCategory, selectedLanguage);
  }, [selectedCategory, selectedLanguage]);

  useEffect(() => {
    newsAPI.getContinueListening()
      .then((res) => setContinueListening(res.news || []))
      .catch((err) => console.error('Failed to load continue-listening:', err));
  }, []);

  const handleCategoryClick = (cat) => {
    setSelectedCategory(cat);
    fetchNews(cat, selectedLanguage);
  };

  const handleStorySelect = (story) => {
    playStory(story, stories);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      {/* Top Navbar */}
      <Navbar />

      {/* Main Content Area with Responsive Site Container */}
      <main className="site-container">
        {/* Greeting & Briefing Metadata */}
        <section style={{ marginBottom: '24px', position: 'relative', zIndex: 1 }}>
          <h1
            style={{
              fontSize: 'clamp(26px, 4vw, 36px)',
              fontWeight: 800,
              lineHeight: 1.2,
              color: '#FFFFFF',
              letterSpacing: '-0.025em',
              margin: '0 0 8px',
            }}
          >
            {greeting}, {firstName}
          </h1>
          <div
            style={{
              fontSize: '14px',
              color: '#9EA2B0',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={15} color="#8B6CFF" />
              {t('personalizedBriefing')}
            </span>
            <span style={{ color: '#5E6272' }}>•</span>
            <span style={{ color: '#8B6CFF', fontWeight: 600 }}>
              {selectedLanguage === 'hi' ? 'हिन्दी' : 'English'}
            </span>
            <span style={{ color: '#5E6272' }}>•</span>
            <span style={{ color: '#35D39A', fontWeight: 600 }}>
              {categoryLabel(selectedCategory, t)}
            </span>
            {user?.preferences?.profession && (
              <>
                <span style={{ color: '#5E6272' }}>•</span>
                <span style={{ color: '#8B6CFF', fontWeight: 600 }}>
                  {user.preferences.profession}
                </span>
              </>
            )}
          </div>
        </section>

        {/* Category Filter Pills (Responsive Horizontal Scroller) */}
        <section
          style={{
            marginBottom: '32px',
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            paddingBottom: '6px',
            scrollbarWidth: 'none',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {CATEGORIES.map((cat) => (
            <CategoryPill
              key={cat}
              label={categoryLabel(cat, t)}
              active={selectedCategory === cat}
              onClick={() => handleCategoryClick(cat)}
            />
          ))}
        </section>

        {/* Continue Listening */}
        {continueListening.length > 0 && (
          <section style={{ marginBottom: '28px', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <History size={16} color="#8B6CFF" />
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                {t('continueListening')}
              </h2>
            </div>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
              {continueListening.map((story) => (
                <button
                  key={story.id}
                  onClick={() => playStory(story, continueListening)}
                  className="card-glass"
                  style={{
                    flex: '0 0 240px',
                    padding: '14px',
                    borderRadius: '16px',
                    textAlign: 'left',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#7657FF', textTransform: 'uppercase' }}>
                      {story.category}
                    </span>
                    <Play size={14} color="var(--text-secondary)" />
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    marginBottom: '10px',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {story.title}
                  </div>
                  <div style={{ height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${story.progress || 0}%`, background: 'var(--primary-bright)' }} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 2-Column Responsive Layout on Desktop: Left = Player, Right = Briefing list */}
        <div className="home-layout-grid" style={{ position: 'relative', zIndex: 1 }}>
          {/* Column 1: Audio Player */}
          <div className="home-player-col">
            <AudioPlayer />
          </div>

          {/* Column 2: News Feed ("Your briefing") */}
          <div className="home-briefing-col" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2
                  style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    letterSpacing: '-0.02em',
                    margin: 0,
                  }}
                >
                  {t('yourBriefing')}
                </h2>
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
                  {stories.length} {t('stories')}
                </span>
              </div>

              <button
                onClick={() => fetchNews(selectedCategory, selectedLanguage)}
                title={t('refresh')}
                style={{
                  color: '#9EA2B0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#FFFFFF';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#9EA2B0';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                }}
              >
                <RefreshCw size={14} className={loadingNews ? 'animate-spin' : ''} />
                <span>{t('refresh')}</span>
              </button>
            </div>

            {/* Skeleton Loading State */}
            {loadingNews && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="skeleton"
                    style={{
                      height: '116px',
                      borderRadius: '18px',
                      width: '100%',
                    }}
                  />
                ))}
              </div>
            )}

            {/* Error State */}
            {!loadingNews && newsError && (
              <div
                className="card-glass"
                style={{
                  padding: '32px 20px',
                  textAlign: 'center',
                  borderRadius: '20px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                <AlertCircle size={32} color="#F87171" style={{ margin: '0 auto 12px' }} />
                <p style={{ color: '#FCA5A5', fontSize: '14px', marginBottom: '16px' }}>
                  {newsError}
                </p>
                <button
                  onClick={() => fetchNews(selectedCategory, selectedLanguage)}
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

            {/* Empty State */}
            {!loadingNews && !newsError && stories.length === 0 && (
              <div
                className="card-glass"
                style={{
                  padding: '48px 20px',
                  textAlign: 'center',
                  borderRadius: '20px',
                  color: '#8C90A0',
                }}
              >
                <Inbox size={40} color="#5E6272" style={{ margin: '0 auto 14px' }} />
                <h4 style={{ color: '#FFFFFF', fontSize: '16px', marginBottom: '6px' }}>
                  {t('noStoriesTitle')}
                </h4>
                <p style={{ fontSize: '14px', maxWidth: '300px', margin: '0 auto' }}>
                  {t('noStoriesDesc')}
                </p>
              </div>
            )}

            {/* List of News Cards */}
            {!loadingNews && !newsError && stories.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {stories.map((story) => (
                  <NewsCard
                    key={story.id}
                    story={story}
                    onSelect={handleStorySelect}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
