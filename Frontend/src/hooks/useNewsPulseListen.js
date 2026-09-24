import { useCallback, useEffect, useRef, useState } from 'react';
import { newsPulseAPI } from '../api/api';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import { isCanceledRequest, safeExternalUrl, stripHtml } from '../utils/newsPulse';

// Pulse articles are numbered by the AI service; the prefix keeps their player
// ids from ever being mistaken for (or colliding with) a Nuzio article id.
export const pulseStoryId = (articleId) => `pulse-${articleId}`;

// "Listen" for News Pulse articles. Audio is fetched from the backend only when
// the user clicks Listen (never on load), then handed to the app's one global
// player (PlayerContext -> MiniPlayer / FullScreenPlayer) as an external story.
//
// Returns { stateFor(articleId), start(article) }. stateFor gives what a Listen
// button should show: 'idle' | 'loading' | 'playing' | 'error'. One instance is
// shared by the timeline and the topic drawer, so the same article looks the
// same in both.
const useNewsPulseListen = () => {
  const { t, voice } = usePreferences();
  const { currentStory, isPlaying, isLoadingAudio, playStory, pauseStory, resumeStory } = usePlayer();

  // The article whose audio is being fetched ('loading'), or whose fetch just
  // failed ('error'). Only ever one: a newer click replaces (and aborts) it.
  const [request, setRequest] = useState(null);
  const controllerRef = useRef(null);

  // `start` reads the latest player state through a ref so it keeps a stable
  // identity, and so an in-flight request hands its audio to the player as it
  // is *now*, not as it was at click time.
  const latestRef = useRef(null);
  useEffect(() => {
    latestRef.current = { currentStory, isPlaying, playStory, pauseStory, resumeStory, voice, category: t('newsPulse') };
  });

  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(async (article) => {
    const player = latestRef.current;
    const storyId = pulseStoryId(article.id);

    // Already in the player: Listen toggles it rather than fetching again.
    if (player.currentStory?.id === storyId) {
      if (player.isPlaying) player.pauseStory();
      else player.resumeStory();
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRequest({ articleId: article.id, status: 'loading' });

    try {
      const description = stripHtml(article.description);
      const audio = await newsPulseAPI.getAudio(
        { articleId: article.id, title: article.title, source: article.source, content: description, voice: player.voice },
        { signal: controller.signal }
      );
      // A newer click (or leaving the page) superseded this one.
      if (controller.signal.aborted) return;

      const story = {
        id: storyId,
        title: article.title,
        source: article.source,
        // Also what the player speaks if the audio file itself fails to load
        summary: description,
        url: safeExternalUrl(article.url) || undefined,
        category: latestRef.current.category,
        audioUrl: audio.audioUrl,
        durationSeconds: audio.duration || undefined,
        // Not a Nuzio article: the player skips listen-history/save/lookups for it
        isExternal: true,
      };
      setRequest(null);
      // A one-story queue, so finishing doesn't auto-advance into unrelated stories
      latestRef.current.playStory(story, [story]);
    } catch (err) {
      if (isCanceledRequest(err) || controller.signal.aborted) return;
      console.error('[NewsPulse] failed to prepare audio:', err);
      setRequest({ articleId: article.id, status: 'error' });
    }
  }, []);

  const stateFor = (articleId) => {
    if (request?.articleId === articleId && request.status === 'loading') return 'loading';
    if (currentStory?.id === pulseStoryId(articleId)) {
      if (isPlaying) return 'playing';
      // Audio fetched; the player is still opening it (no gap where the button
      // would briefly read "Listen" again before "Playing").
      if (isLoadingAudio) return 'loading';
    }
    if (request?.articleId === articleId && request.status === 'error') return 'error';
    return 'idle';
  };

  return { stateFor, start };
};

export default useNewsPulseListen;
