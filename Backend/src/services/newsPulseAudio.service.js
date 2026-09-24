import audioService from './audio.service.js';

// Upper bound on what is spoken per article. TTS is billed per character, and
// a Pulse article is a headline plus a short feed description, so this is
// generous for real data while capping what any one request can spend.
const MAX_NARRATION_CHARS = 1200;

// Article text arrives from third-party RSS feeds (and through the client), so
// strip any markup and collapse whitespace before it is read aloud.
const clean = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const endSentence = (text) => (/[.!?…]$/.test(text) ? text : `${text}.`);

// Comparison form for "is the description just the headline again?"
const normalize = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Shortens to at most `max` characters, preferring the last sentence end and
// falling back to the last word boundary, so narration never stops mid-word.
const truncateAtBoundary = (text, max) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentenceEnd > max * 0.6) return cut.slice(0, sentenceEnd + 1);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, '');
  return `${trimmed}.`;
};

/**
 * Narration script for one article: headline, "From <source>.", then the
 * description/summary - the same shape the player's browser-speech fallback
 * uses for other Nuzio stories.
 */
export const buildNarration = ({ title, source, content }) => {
  const headline = clean(title);
  const outlet = clean(source);
  const body = clean(content);

  const parts = [endSentence(headline)];
  if (outlet) parts.push(`From ${outlet}.`);
  if (body && normalize(body) !== normalize(headline)) parts.push(body);

  return truncateAtBoundary(parts.join(' '), MAX_NARRATION_CHARS);
};

/**
 * Audio for one News Pulse article, generated only when asked for and cached
 * on disk afterwards (see AudioService.getOrGenerateCachedAudio). Resolves
 * { audioUrl, duration, cached }, or null when no TTS provider is configured
 * or generation failed.
 */
export const getPulseArticleAudio = ({ articleId, title, source, content, voice }) =>
  audioService.getOrGenerateCachedAudio({
    namespace: 'pulse',
    key: articleId,
    script: buildNarration({ title, source, content }),
    // Feeds are ingested in English, whatever language the UI is shown in.
    language: 'en',
    voice,
  });
