import audioService from './audio.service.js';

// Upper bound on what is spoken per article. TTS is billed per character, and
// a Pulse article is a headline plus a short feed description, so this is
// generous for real data while capping what any one request can spend.
const MAX_NARRATION_CHARS = 1200;

// Article text arrives from third-party RSS feeds (and through the client), so
// strip any markup and collapse whitespace before it is read aloud.
const clean = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// Cleaned text, or '' if it has no letters or digits (leftover punctuation or
// markup isn't worth synthesizing).
const speakable = (value) => {
  const text = clean(value);
  return /[\p{L}\p{N}]/u.test(text) ? text : '';
};

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
 * uses for other Nuzio stories. Returns '' when there is nothing to read
 * aloud (no text, or only markup/punctuation) so the caller can reject the
 * request instead of paying to synthesize silence.
 */
export const buildNarration = ({ title, source, content }) => {
  const headline = speakable(title);
  const outlet = clean(source);
  const body = speakable(content);

  // The outlet name alone isn't an article, so it only rides along with text
  const parts = [];
  if (headline) parts.push(endSentence(headline));
  if (outlet && (headline || body)) parts.push(`From ${outlet}.`);
  if (body && normalize(body) !== normalize(headline)) parts.push(body);

  return parts.length > 0 ? truncateAtBoundary(parts.join(' '), MAX_NARRATION_CHARS) : '';
};

/**
 * Audio for one News Pulse article's narration script (see buildNarration),
 * generated only when asked for and cached on disk afterwards (see
 * AudioService.getOrGenerateCachedAudio). Resolves { audioUrl, duration,
 * cached }; throws a TtsError saying why when no audio could be produced.
 */
export const getPulseArticleAudio = ({ articleId, script, voice }) =>
  audioService.getOrGenerateCachedAudio({
    namespace: 'pulse',
    key: articleId,
    script,
    // Feeds are ingested in English, whatever language the UI is shown in.
    language: 'en',
    voice,
  });
