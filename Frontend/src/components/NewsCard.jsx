import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Bookmark, CheckCircle2, Clock, MoreVertical, Share2, EyeOff, HelpCircle, Link2, Loader2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import { newsAPI } from '../api/api';

const LABEL_STYLES = {
  Breaking: { color: '#F87171', background: 'rgba(248, 113, 113, 0.12)' },
  Trending: { color: '#35D39A', background: 'rgba(53, 211, 154, 0.12)' },
  Personalized: { color: '#A994FF', background: 'rgba(124, 92, 255, 0.14)' },
  Important: { color: '#FBBF24', background: 'rgba(251, 191, 36, 0.12)' },
};

// story: onHide(id) lets the parent list remove a hidden story from view.
const NewsCard = ({ story, onSelect, onHide }) => {
  const { currentStory, isPlaying, playStory, pauseStory, savedStoryIds, toggleBookmark } = usePlayer();
  const { t } = usePreferences();

  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // null | 'why' | 'related'
  const [whyText, setWhyText] = useState(null);
  const [whyLoading, setWhyLoading] = useState(false);
  const [related, setRelated] = useState(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(false);
  const menuRef = useRef(null);

  const isCurrent = currentStory?.id === story.id;
  const isCardPlaying = isCurrent && isPlaying;
  const isSaved = savedStoryIds.includes(story.id);
  const labels = story.labels || [];

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setPanel(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

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

  const handleShare = async (e) => {
    e.stopPropagation();
    const shareUrl = story.url || window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: story.title, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback(true);
        setTimeout(() => setShareFeedback(false), 1800);
      }
    } catch {
      // User cancelled the native share sheet - not an error
    }
    setMenuOpen(false);
  };

  const handleHide = async (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      await newsAPI.hideArticle(story.id);
      onHide?.(story.id);
    } catch (err) {
      console.error('Failed to hide story:', err);
    }
  };

  const togglePanel = async (e, key) => {
    e.stopPropagation();
    if (panel === key) {
      setPanel(null);
      return;
    }
    setPanel(key);

    if (key === 'why' && whyText === null) {
      setWhyLoading(true);
      try {
        const explanation = await newsAPI.getWhyRecommended(story.id);
        setWhyText(explanation);
      } catch {
        setWhyText(t('newsUnavailable'));
      } finally {
        setWhyLoading(false);
      }
    }

    if (key === 'related' && related === null) {
      setRelatedLoading(true);
      try {
        const { news } = await newsAPI.getRelated(story.id);
        setRelated(news);
      } catch {
        setRelated([]);
      } finally {
        setRelatedLoading(false);
      }
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
          {labels.map((label) => (
            <span
              key={label}
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.03em',
                color: LABEL_STYLES[label]?.color || 'var(--text-secondary)',
                background: LABEL_STYLES[label]?.background || 'rgba(255,255,255,0.06)',
                padding: '2px 7px',
                borderRadius: '6px',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </span>
          ))}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }} ref={menuRef}>
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
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            title={t('moreOptions')}
            style={{
              color: '#6F7383',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MoreVertical size={15} />
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

          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="card-glass"
              style={{
                position: 'absolute',
                top: '38px',
                right: 0,
                zIndex: 20,
                width: '200px',
                borderRadius: '14px',
                background: 'var(--bg-card-elevated)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-card)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <MenuItem icon={shareFeedback ? Link2 : Share2} label={shareFeedback ? t('linkCopied') : t('share')} onClick={handleShare} />
              <MenuItem icon={EyeOff} label={t('hide')} onClick={handleHide} />
              <MenuItem icon={HelpCircle} label={t('whyAmISeeing')} onClick={(e) => togglePanel(e, 'why')} active={panel === 'why'} />
              <MenuItem icon={Link2} label={t('relatedStories')} onClick={(e) => togglePanel(e, 'related')} active={panel === 'related'} />

              {panel === 'why' && (
                <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {whyLoading ? <Loader2 size={14} className="animate-spin" /> : whyText}
                </div>
              )}

              {panel === 'related' && (
                <div style={{ padding: '4px 4px 2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {relatedLoading ? (
                    <div style={{ padding: '8px 10px' }}><Loader2 size={14} className="animate-spin" /></div>
                  ) : related && related.length > 0 ? (
                    related.map((r) => (
                      <button
                        key={r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          setPanel(null);
                          playStory(r);
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: 'var(--text-main)',
                          lineHeight: 1.4,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {r.title}
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {t('noRelatedStories')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MenuItem = ({ icon: Icon, label, onClick, active }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '9px',
      padding: '8px 10px',
      borderRadius: '9px',
      fontSize: '12.5px',
      fontWeight: 600,
      color: active ? '#A994FF' : 'var(--text-main)',
      background: active ? 'rgba(124, 92, 255, 0.1)' : 'transparent',
      textAlign: 'left',
    }}
    onMouseEnter={(e) => {
      if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
    }}
    onMouseLeave={(e) => {
      if (!active) e.currentTarget.style.background = 'transparent';
    }}
  >
    <Icon size={14} />
    {label}
  </button>
);

export default NewsCard;
