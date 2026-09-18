import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Sparkles, Play, Headphones } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import { newsAPI } from '../api/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import ErrorState from './ErrorState';

const formatRelativeTime = (isoDate) => {
  if (!isoDate) return '';
  const minutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

// "AI Daily Briefing" section (§1A): estimated listening time, story count,
// top 3 stories, personalized-relevance indicator, generated timestamp,
// Refresh/Regenerate actions, and a one-tap "Play briefing" (sequential
// AI Briefing mode via PlayerContext.playBriefing).
const BriefingHeader = () => {
  const { playStory, playBriefing } = usePlayer();
  const { t, tf, preferences } = usePreferences();
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRegenerating(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await newsAPI.getBriefing({ forceRefresh });
      setBriefing(data);
    } catch (err) {
      setError(getErrorMessage(err, 'newsUnavailable', t));
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, [t]);

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPersonalized = Boolean(preferences?.profession || (preferences?.interests || []).length > 0);

  return (
    <section
      className="card-glass"
      style={{
        marginBottom: '28px',
        padding: '20px',
        borderRadius: '22px',
        background: 'var(--bg-card-elevated)',
        border: '1px solid var(--border-subtle)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Sparkles size={16} color="#8B6CFF" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
              {briefing ? tf('yourMinBriefing', { min: briefing.estimatedMinutes }) : t('yourBriefing')}
            </h2>
            {isPersonalized && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#A994FF',
                  background: 'rgba(124, 92, 255, 0.14)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                {t('personalizedBriefing')}
              </span>
            )}
          </div>
          {briefing && (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{tf('storiesSelectedForYou', { count: briefing.storyCount })}</span>
              {briefing.generatedAt && (
                <>
                  <span style={{ color: '#5E6272' }}>•</span>
                  <span>{tf('generatedAgo', { time: formatRelativeTime(briefing.generatedAt) })}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {briefing?.stories?.length > 0 && (
            <button
              onClick={() => playBriefing()}
              title={t('aiBriefingMode')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#FFFFFF',
                background: 'var(--primary)',
                padding: '8px 14px',
                borderRadius: '12px',
                boxShadow: '0 4px 14px rgba(124, 92, 255, 0.35)',
              }}
            >
              <Headphones size={14} />
              {t('aiBriefingMode')}
            </button>
          )}
          <button
            onClick={() => load(false)}
            title={t('refreshBriefing')}
            style={{
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              padding: '8px 12px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => load(true)}
            title={t('regenerate')}
            disabled={regenerating}
            style={{
              color: '#A994FF',
              fontSize: '13px',
              fontWeight: 600,
              padding: '8px 12px',
              borderRadius: '12px',
              background: 'rgba(124, 92, 255, 0.1)',
              border: '1px solid rgba(124, 92, 255, 0.25)',
            }}
          >
            {regenerating ? t('generating') : t('regenerate')}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: '16px' }}>
          <ErrorState message={error} onRetry={() => load(false)} />
        </div>
      )}

      {!error && briefing?.stories?.length > 0 && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {briefing.stories.slice(0, 3).map((story, i) => (
            <button
              key={story.id}
              onClick={() => playStory(story, briefing.stories)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '10px',
                textAlign: 'left',
                background: 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#5E6272', width: '14px' }}>{i + 1}</span>
              <Play size={12} color="#8B6CFF" style={{ flexShrink: 0 }} />
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-main)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {story.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default BriefingHeader;
