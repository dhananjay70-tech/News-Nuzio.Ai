import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import AudioPlayer from './AudioPlayer';
import QueuePanel from './QueuePanel';

// Full-screen overlay driven by PlayerContext.isExpanded - reuses AudioPlayer
// for the transport/content so listen/read mode and controls aren't
// duplicated, and adds the queue alongside it.
const FullScreenPlayer = () => {
  const { currentStory, isExpanded, setIsExpanded } = usePlayer();
  const { t } = usePreferences();

  useEffect(() => {
    if (!isExpanded) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isExpanded, setIsExpanded]);

  if (!isExpanded || !currentStory) return null;

  return (
    <div
      onClick={() => setIsExpanded(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(6, 6, 10, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '20px',
        }}
        className="fullscreen-player-grid"
      >
        <button
          onClick={() => setIsExpanded(false)}
          title={t('closePlayer')}
          style={{
            justifySelf: 'end',
            color: '#FFFFFF',
            background: 'rgba(255,255,255,0.08)',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }} className="fullscreen-player-inner">
          <AudioPlayer />
          <div
            className="card-glass"
            style={{ padding: '16px', borderRadius: '20px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
          >
            <QueuePanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FullScreenPlayer;
