import { useCallback, useEffect, useRef, useState } from 'react';
import { newsPulseAPI } from '../api/api';
import { usePlayer } from '../context/PlayerContext';
import { usePreferences } from '../context/PreferencesContext';
import {
  classifyListenError,
  isCanceledRequest,
  isTtsQuotaError,
  safeExternalUrl,
  stripHtml,
  truncate,
} from '../utils/newsPulse';

// Pulse articles are numbered by the AI service; the prefix keeps their player
// ids from ever being mistaken for (or colliding with) a Nuzio article id.
export const pulseStoryId = (articleId) => `pulse-${articleId}`;

// When the server's text-to-speech is out of credits (TTS_QUOTA_EXCEEDED),
// asking again only fails again - one more request and one more server log
// line per click. So after the first quota error the browser's own speech is
// used directly for a while, then the server is tried again. Module-level so it
// outlives the page component (leaving News Pulse and coming back); a full
// page reload starts fresh and tries the server first.
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
let serverAudioBlockedUntil = 0;

// Only this much of a description is read by the browser voice
const MAX_SPOKEN_DESCRIPTION_CHARS = 1200;

// "Listen" for News Pulse articles. Server audio is the primary path: it is
// fetched from the backend only when the user clicks Listen (never on load) and
// handed to the app's one global player (PlayerContext -> MiniPlayer /
// FullScreenPlayer) as an external story. If the server reports it is out of
// quota, the same story goes to the same player without an audioUrl, which is
// the player's existing browser-speech path.
//
// Returns { stateFor(articleId), errorKindFor(articleId), start(article) }.
// stateFor gives what a Listen button should show: 'idle' | 'loading' |
// 'playing' | 'error'; errorKindFor says why it failed (see
// classifyListenError, or 'speech' when the browser couldn't speak). One
// instance is shared by the timeline and the topic drawer, so the same article
// looks the same in both.
const useNewsPulseListen = () => {
  const { t, voice } = usePreferences();
  const { currentStory, isPlaying, isLoadingAudio, playbackError, playStory, pauseStory, resumeStory } = usePlayer();

  // The article whose audio is being fetched ('loading'), or whose fetch just
  // failed ('error', with an errorKind). Only ever one: a newer click replaces
  // (and aborts) it.
  const [request, setRequest] = useState(null);
  const controllerRef = useRef(null);

  // `start` reads the latest player state through a ref so it keeps a stable
  // identity, and so an in-flight request hands its audio to the player as it
  // is *now*, not as it was at click time.
  const latestRef = useRef(null);
  useEffect(() => {
    latestRef.current = {
      currentStory,
      isPlaying,
      playbackError,
      playStory,
      pauseStory,
      resumeStory,
      voice,
      category: t('newsPulse'),
    };
  });

  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(async (article) => {
    const player = latestRef.current;
    const storyId = pulseStoryId(article.id);

    // Already in the player: Listen toggles it rather than starting it again -
    // one article never gets two voices. (After a failure it is a retry instead.)
    if (player.currentStory?.id === storyId && player.playbackError?.storyId !== storyId) {
      if (player.isPlaying) player.pauseStory();
      else player.resumeStory();
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const description = stripHtml(article.description);
    const story = {
      id: storyId,
      title: article.title,
      source: article.source,
      // Also what the player speaks (with the title) when it uses browser speech
      summary: truncate(description, MAX_SPOKEN_DESCRIPTION_CHARS),
      url: safeExternalUrl(article.url) || undefined,
      category: latestRef.current.category,
      // Feeds are English whatever language the UI is in; keeps browser speech
      // from picking a Hindi voice for English text
      language: 'en',
      // Not a Nuzio article: the player skips listen-history/save/lookups for it
      isExternal: true,
    };

    // No audioUrl -> the player speaks it with the browser's SpeechSynthesis.
    // Any speech already going is cancelled first, so only one utterance plays.
    const speakInBrowser = () => {
      setRequest(null);
      latestRef.current.playStory(story, [story]);
    };

    if (Date.now() < serverAudioBlockedUntil) {
      speakInBrowser();
      return;
    }

    setRequest({ articleId: article.id, status: 'loading' });

    try {
      const audio = await newsPulseAPI.getAudio(
        { articleId: article.id, title: article.title, source: article.source, content: description, voice: player.voice },
        { signal: controller.signal }
      );
      // A newer click (or leaving the page) superseded this one.
      if (controller.signal.aborted) return;

      setRequest(null);
      // A one-story queue, so finishing doesn't auto-advance into unrelated stories
      latestRef.current.playStory({ ...story, audioUrl: audio.audioUrl, durationSeconds: audio.duration || undefined }, [story]);
    } catch (err) {
      if (isCanceledRequest(err) || controller.signal.aborted) return;

      if (isTtsQuotaError(err)) {
        // Say so once (the network panel also shows this single 503), then stop asking for a while
        console.warn('[NewsPulse] Server audio is out of quota (TTS_QUOTA_EXCEEDED); using browser speech instead for the next 10 minutes.');
        serverAudioBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
        speakInBrowser();
        return;
      }

      // The backend names the exact reason (e.g. TTS_TIMEOUT) in `code`
      const code = err.response?.data?.code;
      console.error(`[NewsPulse] failed to prepare audio${code ? ` (${code})` : ''}:`, err.response?.data?.error || err);
      setRequest({ articleId: article.id, status: 'error', errorKind: classifyListenError(err) });
    }
  }, []);

  const stateFor = (articleId) => {
    const storyId = pulseStoryId(articleId);
    if (request?.articleId === articleId && request.status === 'loading') return 'loading';
    if (currentStory?.id === storyId) {
      // The browser couldn't speak it (see PlayerContext.playbackError)
      if (playbackError?.storyId === storyId) return 'error';
      if (isPlaying) return 'playing';
      // Audio fetched (or speech requested); the player is still starting it (no
      // gap where the button would briefly read "Listen" again before "Playing").
      if (isLoadingAudio) return 'loading';
    }
    if (request?.articleId === articleId && request.status === 'error') return 'error';
    return 'idle';
  };

  const errorKindFor = (articleId) => {
    const storyId = pulseStoryId(articleId);
    if (currentStory?.id === storyId && playbackError?.storyId === storyId) return 'speech';
    return request?.articleId === articleId && request.status === 'error' ? request.errorKind : null;
  };

  return { stateFor, errorKindFor, start };
};

export default useNewsPulseListen;
