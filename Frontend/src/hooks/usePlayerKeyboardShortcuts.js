import { useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';

// Global player keyboard shortcuts (§2): space to play/pause, arrows to
// seek/adjust volume, N/P for next/previous, M to mute. Mounted once in
// PlayerProvider. Ignores keystrokes while focus is in a text input, so
// typing in search/settings fields isn't hijacked.
export default function usePlayerKeyboardShortcuts() {
  const { currentStory, isPlaying, pauseStory, resumeStory, seekRelative, nextStory, previousStory, volume, setVolume } = usePlayer();
  const lastVolumeRef = useRef(1);

  useEffect(() => {
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const handleKeyDown = (e) => {
      if (!currentStory) return;
      if (isTypingTarget(document.activeElement)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (isPlaying) pauseStory();
          else resumeStory();
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekRelative(15);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekRelative(-15);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.1));
          break;
        case 'KeyN':
          nextStory();
          break;
        case 'KeyP':
          previousStory();
          break;
        case 'KeyM':
          if (volume > 0) {
            lastVolumeRef.current = volume;
            setVolume(0);
          } else {
            setVolume(lastVolumeRef.current || 1);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStory, isPlaying, pauseStory, resumeStory, seekRelative, nextStory, previousStory, volume, setVolume]);
}
