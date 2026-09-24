import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { newsAPI } from '../api/api';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';

const PlayerContext = createContext(null);

// How long a browser-speech utterance may go without starting (or reporting an
// error) before it is treated as failed.
const SPEECH_START_TIMEOUT_MS = 6000;

export const PlayerProvider = ({ children }) => {
  const { user } = useAuth();
  const { autoAdvance, defaultSpeed } = useSettings();
  const [currentStory, setCurrentStory] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(defaultSpeed || 1);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  // Set when browser speech fails for a story ({ storyId, reason }), so the UI
  // can say so instead of sitting on "loading"; cleared when playback moves on.
  const [playbackError, setPlaybackError] = useState(null);
  const [savedStoryIds, setSavedStoryIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('nuzio_saved_stories') || '[]');
    } catch {
      return [];
    }
  });

  const audioElementRef = useRef(new Audio());
  const speechUtteranceRef = useRef(null);
  const speechIntervalRef = useRef(null);
  const speechStartTimerRef = useRef(null);
  const playbackModeRef = useRef('speech'); // 'audio' or 'speech'
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const currentStoryIdRef = useRef(null);
  // Story progress (0-100) to resume from once the audio's duration is
  // known - consumed once per playStory call, in handleLoadedMetadata below.
  const resumeProgressRef = useRef(0);
  // True while playing through an "AI Briefing" queue (playBriefing) - forces
  // sequential auto-advance regardless of the user's autoAdvance setting.
  // Cleared whenever a story is explicitly selected with its own queue
  // (NewsCard, Continue Listening, etc.), left untouched by nextStory/
  // previousStory's internal playStory(story) calls (no queue argument) so
  // it survives normal briefing playback.
  const briefingModeRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Report how far a story got played, so "Continue listening" and the
  // skip/listened personalization signals reflect real playback rather
  // than a single fire-and-forget ping at start. Skipped for `isExternal`
  // stories (News Pulse): they aren't Nuzio articles, so there is no
  // listen history to update.
  const reportProgress = useCallback((story, completedOverride) => {
    if (!story?.id || story.isExternal) return;
    const dur = durationRef.current;
    const cur = currentTimeRef.current;
    const progress = dur > 0 ? Math.min(100, Math.round((cur / dur) * 100)) : 0;
    const completed = completedOverride !== undefined ? completedOverride : progress >= 90;
    newsAPI.markListened(story.id, { progress, completed });
  }, []);

  // Persist saved stories locally as a cache
  useEffect(() => {
    localStorage.setItem('nuzio_saved_stories', JSON.stringify(savedStoryIds));
  }, [savedStoryIds]);

  // Reconcile with the backend's saved-articles list (source of truth) once
  // the user is authenticated, since localStorage can go stale across
  // devices/sessions.
  useEffect(() => {
    if (!user) return;
    newsAPI
      .getSaved()
      .then((res) => setSavedStoryIds((res.news || []).map((story) => story.id)))
      .catch((err) => console.error('Failed to sync saved stories:', err));
  }, [user]);

  const toggleBookmark = (id) => {
    const wasSaved = savedStoryIds.includes(id);

    // Optimistic local update
    setSavedStoryIds((prev) =>
      wasSaved ? prev.filter((item) => item !== id) : [...prev, id]
    );

    const request = wasSaved ? newsAPI.unsave(id) : newsAPI.save(id);
    request.catch((err) => {
      console.error('Failed to sync bookmark with server:', err);
      // Revert on failure
      setSavedStoryIds((prev) =>
        wasSaved ? [...prev, id] : prev.filter((item) => item !== id)
      );
    });
  };

  // Helper to resolve preferred speech synthesis voice
  const language = user?.preferences?.language || user?.language || 'en';

  const getPreferredVoice = useCallback((lang = language) => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();

    // Hindi articles need a Hindi voice regardless of which narrator
    // persona is selected, since the persona names (Aria/Kai/Meera) are
    // just accents within a language, not language switches themselves.
    if (lang === 'hi') {
      // Try to find Hindi voice first, then fallback to any available voice
      const hindiVoice = voices.find((v) => v.lang === 'hi-IN' || v.lang.startsWith('hi'));
      if (hindiVoice) {
        console.log('Using Hindi voice:', hindiVoice.name, hindiVoice.lang);
        return hindiVoice;
      }
      
      // Fallback to English if no Hindi voice available
      console.warn('No Hindi voice available, falling back to English');
      return voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
    }

    const preferredVoiceName = user?.preferences?.voice || 'Aria';

    if (preferredVoiceName.includes('British') || preferredVoiceName.includes('Aria')) {
      return voices.find((v) => v.lang === 'en-GB' || v.name.includes('British') || v.name.includes('George') || v.name.includes('Oliver') || v.name.includes('Hazel')) || voices.find(v => v.lang.startsWith('en'));
    }
    if (preferredVoiceName.includes('Indian') || preferredVoiceName.includes('Meera')) {
      return voices.find((v) => v.lang === 'en-IN' || v.name.includes('India')) || voices.find(v => v.lang.startsWith('en'));
    }
    if (preferredVoiceName.includes('American') || preferredVoiceName.includes('Kai')) {
      return voices.find((v) => (v.lang === 'en-US' && (v.name.includes('David') || v.name.includes('Guy') || v.name.includes('Natural')))) || voices.find(v => v.lang === 'en-US');
    }
    return voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
  }, [user, language]);

  // Reload voices when language changes
  useEffect(() => {
    const handleLanguageChange = () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        // Force voice reload with delay to ensure voices are available
        setTimeout(() => {
          window.speechSynthesis.getVoices();
        }, 200);
      }
    };

    window.addEventListener('languageChanged', handleLanguageChange);
    return () => {
      window.removeEventListener('languageChanged', handleLanguageChange);
    };
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    const audio = audioElementRef.current;
    return () => {
      audio.pause();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
      }
      clearTimeout(speechStartTimerRef.current);
    };
  }, []);

  // Set up HTML5 Audio Event Listeners
  useEffect(() => {
    const audio = audioElementRef.current;

    const handleTimeUpdate = () => {
      if (playbackModeRef.current === 'audio') {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      if (playbackModeRef.current === 'audio') {
        const dur = audio.duration || 0;
        setDuration(dur);
        setIsLoadingAudio(false);

        // Resume from saved progress (once) - a story past 95% is treated
        // as finished, not worth "resuming" right at the end.
        const resumeProgress = resumeProgressRef.current;
        resumeProgressRef.current = 0;
        if (resumeProgress > 0 && resumeProgress < 95 && dur > 0) {
          const target = (resumeProgress / 100) * dur;
          audio.currentTime = target;
          currentTimeRef.current = target;
          setCurrentTime(target);
        }
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      // Report completion explicitly - covers the last-item-in-queue case,
      // where nextStory() just pauses instead of switching (and switching
      // would have reported it via playStory's own outgoing-story report).
      reportProgress(currentStory, true);
      if (autoAdvance || briefingModeRef.current) nextStory();
    };

    const handleError = () => {
      console.warn('Audio playback error, falling back to speech synthesis');
      if (currentStory) {
        startSpeechPlayback(currentStory);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [currentStory, reportProgress, autoAdvance]);

  // Stops any browser speech, and its progress/start timers. The utterance is
  // detached first: a cancelled utterance reports "interrupted" (or "canceled")
  // asynchronously, and by then its handlers must not touch the state of
  // whatever started next - see startSpeechPlayback.
  const cancelSpeech = useCallback(() => {
    speechUtteranceRef.current = null;
    clearInterval(speechIntervalRef.current);
    clearTimeout(speechStartTimerRef.current);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Speech Synthesis fallback playback
  const startSpeechPlayback = useCallback((story) => {
    if (!('speechSynthesis' in window)) {
      console.error('Speech synthesis not supported in this browser.');
      setIsPlaying(false);
      setIsLoadingAudio(false);
      setPlaybackError({ storyId: story.id, reason: 'unsupported' });
      return;
    }

    // One utterance at a time: whatever is speaking stops before this starts
    cancelSpeech();
    // Chrome keeps a paused engine paused across cancel(), and a paused
    // engine queues new speech without ever speaking it.
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    playbackModeRef.current = 'speech';
    setPlaybackError(null);
    const textToSpeak = `${story.title}. From ${story.source}. ${story.summary || ''}`;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // Approximate duration in seconds (average speaking rate ~ 140 words per min)
    const wordCount = textToSpeak.split(/\s+/).length;
    const estDuration = Math.max(15, Math.round((wordCount / 140) * 60 / playbackRate));
    setDuration(estDuration);
    setCurrentTime(0);

    // Article text/audio follows the user's selected language (the backend
    // already fetches Hindi articles for Hindi-preference users), so the
    // browser TTS fallback must speak with a matching voice/lang too - unless
    // the story says what language it is in (News Pulse articles are English
    // whatever language the UI is shown in).
    const speechLanguage = story.language || language;
    utterance.lang = speechLanguage === 'hi' ? 'hi-IN' : 'en-US';
    const voice = getPreferredVoice(speechLanguage);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = playbackRate;

    // Only the utterance that currently owns the player may change its state.
    // A cancelled one (switching stories, restarting at a new speed, StrictMode
    // running an effect twice) can still report late, and must not flip the
    // new playback to "stopped" or clear its progress timer.
    const isCurrent = () => speechUtteranceRef.current === utterance;

    utterance.onstart = () => {
      if (!isCurrent()) return;
      clearTimeout(speechStartTimerRef.current);
      setIsLoadingAudio(false);
      // The user may have paused between speak() and the engine actually
      // starting; don't report "playing" (or run the progress timer) then.
      if (window.speechSynthesis.paused) return;
      setIsPlaying(true);

      const startTime = Date.now();
      speechIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000 * playbackRate;
        if (elapsed >= estDuration) {
          clearInterval(speechIntervalRef.current);
        } else {
          setCurrentTime(elapsed);
        }
      }, 250);
    };

    utterance.onend = () => {
      if (!isCurrent()) return;
      clearTimeout(speechStartTimerRef.current);
      setIsPlaying(false);
      if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
      currentTimeRef.current = estDuration;
      setCurrentTime(estDuration);
      reportProgress(story, true);
      if (autoAdvance || briefingModeRef.current) nextStory();
    };

    utterance.onerror = (e) => {
      if (!isCurrent()) return;
      // cancel() - which this player calls whenever playback changes - is
      // reported as 'interrupted' (or 'canceled'): expected, not a failure.
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.error('Speech synthesis error:', e);
      clearTimeout(speechStartTimerRef.current);
      if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
      setIsPlaying(false);
      setIsLoadingAudio(false);
      setPlaybackError({ storyId: story.id, reason: e.error || 'error' });
    };

    speechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);

    // Some browsers accept speak() and then never start or report anything
    // (no voices, no speech service): treat that as a failure, not "loading" forever.
    speechStartTimerRef.current = setTimeout(() => {
      if (!isCurrent()) return;
      console.error(`Speech synthesis did not start within ${SPEECH_START_TIMEOUT_MS / 1000}s`);
      cancelSpeech();
      setIsPlaying(false);
      setIsLoadingAudio(false);
      setPlaybackError({ storyId: story.id, reason: 'no-start' });
    }, SPEECH_START_TIMEOUT_MS);
  }, [playbackRate, getPreferredVoice, language, reportProgress, autoAdvance, cancelSpeech]);

  // Play a real audio URL via the HTML5 <audio> element
  const playAudioUrl = useCallback((story, url) => {
    cancelSpeech();

    playbackModeRef.current = 'audio';
    const audio = audioElementRef.current;
    audio.src = url;
    audio.playbackRate = playbackRate;
    audio.play()
      .then(() => {
        setIsPlaying(true);
        setIsLoadingAudio(false);
      })
      .catch((err) => {
        console.warn('Audio URL playback failed, falling back to speech synthesis:', err);
        startSpeechPlayback(story);
      });
  }, [playbackRate, startSpeechPlayback, cancelSpeech]);

  // Play a specific story. `newQueue`, when provided, replaces the queue -
  // an explicit user selection (NewsCard, Continue Listening, etc.), which
  // also exits "AI Briefing" mode unless `isBriefing` is passed (used only
  // by playBriefing below). nextStory/previousStory call this without a
  // queue argument, so briefing mode survives normal queue navigation.
  const playStory = useCallback((story, newQueue, isBriefing = false) => {
    if (!story) return;

    // Record where we left off on the outgoing story before switching -
    // this is the real "listened"/"skipped" signal, not just a play-start ping.
    if (currentStory && currentStory.id !== story.id) {
      reportProgress(currentStory);
    }

    if (newQueue && Array.isArray(newQueue)) {
      setQueue(newQueue);
      briefingModeRef.current = isBriefing;
    }

    setCurrentStory(story);
    currentStoryIdRef.current = story.id;
    setIsLoadingAudio(true);
    setPlaybackError(null);
    currentTimeRef.current = 0;
    durationRef.current = 0;
    resumeProgressRef.current = story.progress || 0;

    // Notify backend that this story has started
    if (story.id && !story.isExternal) {
      newsAPI.markListened(story.id, { progress: 0, completed: false });
    }

    if (story.audioUrl) {
      playAudioUrl(story, story.audioUrl);
    } else if (story.id && !story.isExternal) {
      // Ask the backend for real TTS audio (cached if already generated for
      // this article/language/voice combination). If no provider is
      // configured or generation fails, it resolves with a null audioUrl
      // and we fall back to the browser's SpeechSynthesis below.
      const voiceName = user?.preferences?.voice || 'Aria';
      newsAPI.generateAudio(story.id, language, voiceName)
        .then((result) => {
          // The user may have already switched to a different story while
          // this request was in flight - don't play a stale response.
          if (currentStoryIdRef.current !== story.id) return;
          if (result?.audioUrl) {
            playAudioUrl(story, result.audioUrl);
          } else {
            startSpeechPlayback(story);
          }
        })
        .catch(() => {
          if (currentStoryIdRef.current === story.id) startSpeechPlayback(story);
        });
    } else {
      // Fallback to speech synthesis
      const audio = audioElementRef.current;
      audio.pause();
      startSpeechPlayback(story);
    }
  }, [playAudioUrl, startSpeechPlayback, currentStory, reportProgress, user, language]);

  // "AI Briefing" mode: fetch the day's briefing and play through it
  // sequentially, regardless of the user's autoAdvance setting.
  const playBriefing = useCallback(async () => {
    const { stories } = await newsAPI.getBriefing();
    if (stories && stories.length > 0) {
      playStory(stories[0], stories, true);
    }
    return stories || [];
  }, [playStory]);

  // Stop playback entirely and clear the now-playing story (as opposed to
  // pauseStory, which keeps currentStory so playback can resume). Used when
  // switching language, since a queued story is in the old language and
  // resuming it would speak/play the wrong language.
  const stopStory = useCallback(() => {
    audioElementRef.current.pause();
    cancelSpeech();
    currentStoryIdRef.current = null;
    briefingModeRef.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setCurrentStory(null);
    setPlaybackError(null);
  }, [cancelSpeech]);

  // Pause playback
  const pauseStory = useCallback(() => {
    if (playbackModeRef.current === 'audio') {
      audioElementRef.current.pause();
    } else if ('speechSynthesis' in window) {
      // Only pause an utterance that is actually being spoken. Pausing an idle
      // engine (e.g. nextStory() at the end of a finished story) would leave it
      // paused, and it would then swallow the next speak().
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
      }
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
      }
    }
    setIsPlaying(false);
  }, []);

  // Resume playback
  const resumeStory = useCallback(() => {
    if (!currentStory) return;

    if (playbackModeRef.current === 'audio') {
      audioElementRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    } else if ('speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPlaying(true);
      } else {
        startSpeechPlayback(currentStory);
      }
    }
  }, [currentStory, startSpeechPlayback]);

  // Next Story
  const nextStory = useCallback(() => {
    if (!currentStory || queue.length === 0) return;
    const currentIndex = queue.findIndex((item) => item.id === currentStory.id);
    if (currentIndex !== -1 && currentIndex < queue.length - 1) {
      playStory(queue[currentIndex + 1]);
    } else if (queue.length > 0) {
      // Loop back to start or pause
      pauseStory();
    }
  }, [currentStory, queue, playStory, pauseStory]);

  // Previous Story
  const previousStory = useCallback(() => {
    if (!currentStory || queue.length === 0) return;
    
    // If more than 3 seconds in, restart current track
    if (currentTime > 3) {
      seek(0);
      return;
    }

    const currentIndex = queue.findIndex((item) => item.id === currentStory.id);
    if (currentIndex > 0) {
      playStory(queue[currentIndex - 1]);
    } else {
      seek(0);
    }
  }, [currentStory, queue, currentTime, playStory]);

  // Seek
  const seek = useCallback((timeInSeconds) => {
    const target = Math.max(0, Math.min(timeInSeconds, duration));
    setCurrentTime(target);

    if (playbackModeRef.current === 'audio') {
      audioElementRef.current.currentTime = target;
    }
    // Note: browser SpeechSynthesis has no seek API, so in speech mode this
    // only updates the displayed position, not the actual narration point.
  }, [duration]);

  // Relative seek (10s rewind/forward)
  const seekRelative = useCallback((deltaSeconds) => {
    seek(currentTimeRef.current + deltaSeconds);
  }, [seek]);

  // Volume (HTML5 Audio only - SpeechSynthesis has no per-utterance volume
  // control worth exposing here)
  const [volume, setVolumeState] = useState(1);
  const setVolume = useCallback((value) => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolumeState(clamped);
    audioElementRef.current.volume = clamped;
  }, []);

  // Set Playback Speed (1x, 1.5x, 2x)
  const setPlaybackRate = useCallback((rate) => {
    setPlaybackRateState(rate);
    if (playbackModeRef.current === 'audio') {
      audioElementRef.current.playbackRate = rate;
    } else if (isPlaying && currentStory) {
      // Restart utterance with new speed rate
      startSpeechPlayback(currentStory);
    }
  }, [isPlaying, currentStory, startSpeechPlayback]);

  const value = {
    currentStory,
    queue,
    setQueue,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isLoadingAudio,
    playbackError,
    savedStoryIds,
    toggleBookmark,
    playStory,
    playBriefing,
    pauseStory,
    stopStory,
    resumeStory,
    nextStory,
    previousStory,
    seek,
    seekRelative,
    setPlaybackRate,
    volume,
    setVolume,
    isExpanded,
    setIsExpanded,
    isBriefingMode: briefingModeRef.current,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};
