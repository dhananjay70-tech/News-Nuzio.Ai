import React from 'react';
import { useLocation } from 'react-router-dom';
import { Play, Pause, Maximize2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';

// Condensed sticky bar shown globally whenever a story is active, on every
// page except Home (which already surfaces the full AudioPlayer inline).
const MiniPlayer = () => {
  const { pathname } = useLocation();
  const { currentStory, isPlaying, pauseStory, resumeStory, currentTime, duration, setIsExpanded } = usePlayer();
  const { t } = usePreferences();

  if (!currentStory || pathname === '/home') return null;

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className="mini-player">
      <div
        onClick={() => setIsExpanded(true)}
        className="card-glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          background: 'var(--bg-glass-nav)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--border-subtle)',
          borderRadius: 0,
          cursor: 'pointer',
          maxWidth: '1280px',
          margin: '0 auto',
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isPlaying) pauseStory();
            else resumeStory();
          }}
          title={isPlaying ? t('pause') : t('play')}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'var(--primary)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isPlaying ? <Pause size={16} fill="#FFFFFF" /> : <Play size={16} fill="#FFFFFF" style={{ marginLeft: '2px' }} />}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentStory.title}
          </div>
          <div style={{ height: '3px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', marginTop: '6px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #7657FF 0%, #35D39A 100%)' }} />
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(true);
          }}
          title={t('expandPlayer')}
          style={{ color: 'var(--text-secondary)', padding: '6px', flexShrink: 0 }}
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
};

export default MiniPlayer;
