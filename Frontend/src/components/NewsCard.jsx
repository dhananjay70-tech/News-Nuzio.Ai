import React from 'react';
import { Play, Pause, Bookmark, CheckCircle2, Clock } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';

const NewsCard = ({ story, onSelect }) => {
  const { currentStory, isPlaying, playStory, pauseStory, savedStoryIds, toggleBookmark } = usePlayer();
  const { t } = usePreferences();

  const isCurrent = currentStory?.id === story.id;
  const isCardPlaying = isCurrent && isPlaying;
  const isSaved = savedStoryIds.includes(story.id);

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    if (isCardPlaying) {
      pauseStory();
    } else {
      if (onSelect) {
        onSelect(story);
      } else {
        playStory(story);
      }
    }
  };

  const handleBookmarkToggle = (e) => {
    e.stopPropagation();
    toggleBookmark(story.id);
  };

  return (
    <div
      onClick={() => {
        if (onSelect) onSelect(story);
        else playStory(story);
      }}
      className="news-card card-glass"
      style={{
        padding: '16px',
        borderRadius: '18px',
        background: isCurrent ? 'rgba(118, 87, 255, 0.08)' : 'var(--bg-card)',
        border: isCurrent
          ? '1px solid var(--border-active)'
          : '1px solid var(--border-subtle)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'border-color 0.2s ease, background 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
      onMouseEnter={(e) => {
        if (!isCurrent) {
          e.currentTarget.style.borderColor = 'var(--border-light)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isCurrent) {
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
        }
      }}
    >
      {/* Top Metadata Row: Category & Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: isCurrent ? '#A994FF' : '#7657FF',
            }}
          >
            {story.category}
          </span>
          {story.language === 'hi' && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                background: 'rgba(255, 255, 255, 0.06)',
                padding: '1px 6px',
                borderRadius: '6px',
              }}
            >
              हिन्दी
            </span>
          )}
          {story.listened && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                color: '#35D39A',
                fontSize: '11px',
                fontWeight: 600,
              }}
              title={t('listened')}
            >
              <CheckCircle2 size={12} />
              {t('listened')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6F7383' }}>
          <Clock size={12} />
          <span>{story.relativeTime || t('justNow')}</span>
        </div>
      </div>

      {/* Main Title */}
      <h4
        style={{
          fontSize: '14px',
          fontWeight: 600,
          lineHeight: 1.4,
          color: isCurrent ? '#FFFFFF' : '#E2E4EC',
          margin: 0,
          letterSpacing: '-0.01em',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {story.title}
      </h4>

      {/* Bottom Row: Source, Duration, and Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '2px',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            color: '#8C90A0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontWeight: 600, color: '#C0C2CE' }}>{story.source}</span>
          <span>•</span>
          <span>{story.duration || '03:00'}</span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleBookmarkToggle}
            title={isSaved ? t('removeFromSaved') : t('saveStory')}
            style={{
              color: isSaved ? '#7657FF' : '#6F7383',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s',
            }}
          >
            <Bookmark size={15} fill={isSaved ? '#7657FF' : 'none'} />
          </button>

          <button
            onClick={handlePlayToggle}
            title={isCardPlaying ? t('pause') : t('play')}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: isCardPlaying ? 'var(--primary)' : 'rgba(255, 255, 255, 0.08)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isCardPlaying) {
                e.currentTarget.style.background = 'rgba(124, 92, 255, 0.3)';
                e.currentTarget.style.color = '#FFFFFF';
              }
            }}
            onMouseLeave={(e) => {
              if (!isCardPlaying) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }
            }}
          >
            {isCardPlaying ? (
              <Pause size={14} fill="#FFFFFF" />
            ) : (
              <Play size={14} fill="#FFFFFF" style={{ marginLeft: '1px' }} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewsCard;
