import React, { useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Bookmark, Sparkles, Volume2, Volume1, VolumeX, Loader2, RotateCcw, RotateCw, Headphones, BookOpen, ExternalLink } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import Waveform from './Waveform';

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const formatTime = (timeInSeconds) => {
  if (isNaN(timeInSeconds) || timeInSeconds < 0) return '00:00';
  const mins = Math.floor(timeInSeconds / 60);
  const secs = Math.floor(timeInSeconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const AudioPlayer = ({ className = '' }) => {
  const {
    currentStory,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isLoadingAudio,
    savedStoryIds,
    toggleBookmark,
    pauseStory,
    resumeStory,
    nextStory,
    previousStory,
    seek,
    seekRelative,
    setPlaybackRate,
    volume,
    setVolume,
  } = usePlayer();
  const { t } = usePreferences();
  const [viewMode, setViewMode] = useState('listen'); // 'listen' | 'read'

  const progressBarRef = useRef(null);

  if (!currentStory) {
    return (
      <div
        className={`card-glass ${className}`}
        style={{
          padding: '40px 24px',
          borderRadius: '24px',
          textAlign: 'center',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(124, 92, 255, 0.1)',
            color: '#8B6CFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <Volume2 size={28} />
        </div>
        <h4 style={{ color: '#FFFFFF', fontSize: '16px', marginBottom: '6px' }}>{t('readyToListen')}</h4>
        <p style={{ color: '#9EA2B0', fontSize: '14px' }}>
          {t('selectStoryPrompt')}
        </p>
      </div>
    );
  }

  const progress = duration > 0 ? currentTime / duration : 0;
  const isSaved = savedStoryIds.includes(currentStory.id);

  const handleProgressBarClick = (e) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickPos = (e.clientX - rect.left) / rect.width;
    const seekTime = Math.max(0, Math.min(clickPos * duration, duration));
    seek(seekTime);
  };

  const handleSpeedCycle = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
    const nextRate = PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length];
    setPlaybackRate(nextRate);
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className={`main-player-card card-glass ${className}`}
      style={{
        borderRadius: '24px',
        padding: '24px',
        background: 'var(--bg-card-elevated)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-card)',
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {/* Card Header: Category badge & bookmark */}
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
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '4px 12px',
            borderRadius: '999px',
            background: 'rgba(124, 92, 255, 0.14)',
            border: '1px solid rgba(124, 92, 255, 0.3)',
            color: '#A994FF',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#35D39A',
            }}
          />
          {currentStory.category || 'Featured Briefing'}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Listen / Read toggle */}
          <div
            style={{
              display: 'flex',
              padding: '3px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {[
              { key: 'listen', icon: Headphones },
              { key: 'read', icon: BookOpen },
            ].map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                title={key === 'listen' ? t('listen') : t('read')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '5px 9px',
                  borderRadius: '7px',
                  background: viewMode === key ? 'var(--primary)' : 'transparent',
                  color: viewMode === key ? '#FFFFFF' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>

          <button
            onClick={() => toggleBookmark(currentStory.id)}
            title={isSaved ? t('removeFromSaved') : t('saveStory')}
            style={{
              color: isSaved ? '#7657FF' : '#6F7383',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            <Bookmark size={20} fill={isSaved ? '#7657FF' : 'none'} />
          </button>
        </div>
      </div>

      {/* News Title */}
      <h3
        style={{
          fontSize: 'clamp(17px, 2vw, 21px)',
          fontWeight: 700,
          lineHeight: 1.35,
          color: '#FFFFFF',
          marginBottom: '10px',
          letterSpacing: '-0.02em',
        }}
      >
        {currentStory.title}
      </h3>

      {/* Source and Length Metadata */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          color: '#8C90A0',
          marginBottom: '16px',
        }}
      >
        <span style={{ fontWeight: 600, color: '#C5C7D0' }}>{currentStory.source}</span>
        <span>•</span>
        <span>{formatTime(duration || currentStory.durationSeconds || 180)}</span>
        {currentStory.sourceCount > 1 && (
          <>
            <span>•</span>
            <span>{t('coveredBy')} {currentStory.sourceCount} {t('sources')}</span>
          </>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', color: '#8B6CFF', fontSize: '12px', fontWeight: 600 }}>
          <Sparkles size={13} />
          {t('aiBriefing')}
        </span>
      </div>

      {viewMode === 'listen' ? (
        <>
          {/* Dynamic Waveform Visualizer */}
          <div style={{ marginBottom: '16px' }}>
            <Waveform isPlaying={isPlaying} progress={progress} height={42} barCount={36} />
          </div>

          {/* Interactive Progress Scrubber */}
          <div style={{ marginBottom: '18px' }}>
            <div
              ref={progressBarRef}
              onClick={handleProgressBarClick}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.1)',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                  background: 'linear-gradient(90deg, #7657FF 0%, #35D39A 100%)',
                  borderRadius: '999px',
                  transition: 'width 0.15s linear',
                }}
              />
            </div>

            {/* Timers */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px',
                color: '#6F7383',
                fontVariantNumeric: 'tabular-nums',
                marginTop: '8px',
              }}
            >
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </>
      ) : (
        /* Read mode: full summary + why it matters + source link */
        <div style={{ marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {currentStory.summary && (
            <p style={{ color: '#D2D4DE', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
              {currentStory.summary}
            </p>
          )}
          {currentStory.whyItMatters && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '14px',
                background: 'rgba(53, 211, 154, 0.08)',
                border: '1px solid var(--border-green)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#35D39A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                {t('whyItMatters')}
              </div>
              <p style={{ color: '#B9E8D4', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
                {currentStory.whyItMatters}
              </p>
            </div>
          )}
          {currentStory.url && (
            <a
              href={currentStory.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#A994FF', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
            >
              {t('readFullStoryAt')} {currentStory.source}
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}

      {/* Player Controls Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '6px',
        }}
      >
        {/* Playback Speed Pill */}
        <button
          onClick={handleSpeedCycle}
          title="Toggle playback speed"
          style={{
            padding: '6px 14px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700,
            color: '#A994FF',
            background: 'rgba(124, 92, 255, 0.12)',
            border: '1px solid rgba(124, 92, 255, 0.28)',
            cursor: 'pointer',
          }}
        >
          {playbackRate}x
        </button>

        {/* Central Transport Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          {/* Previous Button */}
          <button
            onClick={previousStory}
            title={t('previousStory')}
            style={{
              color: '#C5C7D0',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#FFFFFF';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#C5C7D0';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <SkipBack size={20} />
          </button>

          {/* 10s Rewind */}
          <button
            onClick={() => seekRelative(-10)}
            title={t('rewind10')}
            style={{
              color: '#C5C7D0',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#C5C7D0')}
          >
            <RotateCcw size={18} />
          </button>

          {/* Play / Pause Violet Gradient Button */}
          <button
            onClick={isPlaying ? pauseStory : resumeStory}
            disabled={isLoadingAudio}
            title={isPlaying ? t('pause') : t('play')}
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '50%',
              background: 'var(--primary)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px -4px var(--primary-glow)',
              border: 'none',
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.96)';
            }}
          >
            {isLoadingAudio ? (
              <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
            ) : isPlaying ? (
              <Pause size={26} fill="#FFFFFF" />
            ) : (
              <Play size={26} fill="#FFFFFF" style={{ marginLeft: '3px' }} />
            )}
          </button>

          {/* 10s Forward */}
          <button
            onClick={() => seekRelative(10)}
            title={t('forward10')}
            style={{
              color: '#C5C7D0',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#C5C7D0')}
          >
            <RotateCw size={18} />
          </button>

          {/* Next Button */}
          <button
            onClick={nextStory}
            title={t('nextStory')}
            style={{
              color: '#C5C7D0',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#FFFFFF';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#C5C7D0';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <SkipForward size={20} />
          </button>
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '90px', justifyContent: 'flex-end' }}>
          <VolumeIcon size={16} color="#8C90A0" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            title="Volume"
            style={{ width: '56px', accentColor: 'var(--primary)' }}
          />
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
