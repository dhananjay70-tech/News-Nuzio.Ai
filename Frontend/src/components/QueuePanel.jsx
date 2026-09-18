import React from 'react';
import { Play, Pause, X, ListMusic } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';

// Renders the current playback queue, highlights the now-playing story,
// supports click-to-jump and remove-from-queue. Used inside FullScreenPlayer.
const QueuePanel = () => {
  const { queue, setQueue, currentStory, isPlaying, playStory, pauseStory, resumeStory } = usePlayer();
  const { t } = usePreferences();

  const handleRemove = (e, id) => {
    e.stopPropagation();
    setQueue(queue.filter((item) => item.id !== id));
  };

  const handleItemClick = (story) => {
    if (currentStory?.id === story.id) {
      if (isPlaying) pauseStory();
      else resumeStory();
    } else {
      playStory(story);
    }
  };

  if (queue.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
        <ListMusic size={28} color="#5E6272" style={{ margin: '0 auto 10px' }} />
        {t('queue')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px 4px' }}>
        {t('upNext')} · {queue.length}
      </div>
      {queue.map((story) => {
        const isCurrent = currentStory?.id === story.id;
        return (
          <div
            key={story.id}
            onClick={() => handleItemClick(story)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px',
              borderRadius: '12px',
              cursor: 'pointer',
              background: isCurrent ? 'rgba(118, 87, 255, 0.1)' : 'transparent',
              border: isCurrent ? '1px solid var(--border-active)' : '1px solid transparent',
              transition: 'background 0.15s ease',
            }}
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isCurrent ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                color: '#FFFFFF',
              }}
            >
              {isCurrent && isPlaying ? <Pause size={13} fill="#FFFFFF" /> : <Play size={13} fill="#FFFFFF" style={{ marginLeft: '1px' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isCurrent ? '#FFFFFF' : 'var(--text-main)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {story.title}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{story.source}</div>
            </div>
            <button
              onClick={(e) => handleRemove(e, story.id)}
              title={t('hide')}
              style={{ color: 'var(--text-muted)', padding: '4px', flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default QueuePanel;
