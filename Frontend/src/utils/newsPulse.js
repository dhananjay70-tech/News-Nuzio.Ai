// Pure helpers for the News Pulse page. Article fields come from third-party
// RSS feeds via the AI service, so text and links are treated as untrusted.

const localeFor = (language) => (language === 'hi' ? 'hi-IN' : 'en-IN');

const toDate = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Feed descriptions occasionally carry HTML markup/entities. DOMParser builds
// an inert document (no scripts run, no resources load) and textContent
// yields plain text.
export const stripHtml = (value) => {
  if (!value) return '';
  let text = value;
  if (/[<&]/.test(value)) {
    const doc = new DOMParser().parseFromString(value, 'text/html');
    // textContent would include the source text of these, which isn't prose
    doc.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
    text = doc.body.textContent || '';
  }
  return text.replace(/\s+/g, ' ').trim();
};

// Shortens to at most `max` characters, cutting at a word boundary.
export const truncate = (text, max = 220) => {
  if (!text || text.length <= max) return text || '';
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
};

// Plain-text preview of an article description, or '' when there isn't one.
export const previewText = (description, max = 220) => truncate(stripHtml(description), max);

// Only http(s) links are opened; anything else (javascript:, data:, ...) from
// a feed is dropped rather than rendered as an href.
export const safeExternalUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
};

export const formatTime = (iso, language) => {
  const date = toDate(iso);
  return date ? date.toLocaleTimeString(localeFor(language), { hour: '2-digit', minute: '2-digit' }) : '';
};

export const formatDateTime = (iso, language) => {
  const date = toDate(iso);
  return date
    ? date.toLocaleString(localeFor(language), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
};

// "2 hours ago" / "3 days ago", localized. Falls back to '' for bad input.
export const formatRelative = (iso, language) => {
  const date = toDate(iso);
  if (!date) return '';
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(localeFor(language), { numeric: 'auto' });
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return formatter.format(0, 'second');
  if (abs < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return formatter.format(Math.round(diffSeconds / 3600), 'hour');
  return formatter.format(Math.round(diffSeconds / 86400), 'day');
};

// "m:ss" / "h:mm:ss" for the running-refresh timer.
export const formatElapsed = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Human label for a calendar day: Today / Yesterday / "Wednesday, 23 Sep".
export const formatDayLabel = (date, language, t) => {
  const now = new Date();
  if (dayKey(date) === dayKey(now)) return t('today');
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return t('yesterday');
  const options = { weekday: 'long', day: 'numeric', month: 'short' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString(localeFor(language), options);
};

// Sorts newest-first by published_at (undated articles last) and groups the
// result by local calendar day: [{ key, date, articles }].
export const groupByDay = (articles) => {
  const dated = [];
  const undated = [];
  for (const article of articles) {
    const date = toDate(article.publishedAt);
    (date ? dated : undated).push({ article, date });
  }
  dated.sort((a, b) => b.date - a.date);

  const groups = [];
  for (const { article, date } of dated) {
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.articles.push(article);
    else groups.push({ key, date, articles: [article] });
  }
  if (undated.length > 0) {
    groups.push({ key: 'undated', date: null, articles: undated.map((entry) => entry.article) });
  }
  return groups;
};

// Newest-first copy, for flat lists (cluster detail).
export const sortNewestFirst = (articles) =>
  [...articles].sort((a, b) => (toDate(b.publishedAt)?.getTime() ?? 0) - (toDate(a.publishedAt)?.getTime() ?? 0));

// Classifies a failed API call so the UI can pick a specific message without
// depending on (unstable) translation-function identity: 'rateLimited',
// 'unavailable' (no reply / 502 / 503 / 504), 'notFound', or 'api'.
export const classifyPulseError = (err) => {
  const status = err?.response?.status;
  if (status === 429) return 'rateLimited';
  if (status === 404) return 'notFound';
  if (!err?.response || status === 502 || status === 503 || status === 504) return 'unavailable';
  return 'api';
};

// User-facing text for a classifyPulseError() kind. Generic transport/service
// problems read as "unavailable"; nothing from the backend is echoed verbatim.
export const pulseErrorMessage = (errorKind, t) => {
  if (errorKind === 'rateLimited') return t('tooManyRequests');
  if (errorKind === 'api' || errorKind === 'notFound') return t('pulseApiError');
  return t('pulseServiceUnavailable');
};

// Classifies a failed Listen (audio) request so the card can say something
// useful: 'noText' (400 - nothing to read), 'unavailable' (503 - server audio
// isn't configured, is out of quota or is throttled, so retrying right away
// won't help), or 'failed' (timeout, provider error, network...).
export const classifyListenError = (err) => {
  const status = err?.response?.status;
  if (status === 400) return 'noText';
  if (status === 503) return 'unavailable';
  return 'failed';
};

// True when the backend says server-side text-to-speech is out of credits
// (503 TTS_QUOTA_EXCEEDED) - the one Listen failure with a browser-speech fallback.
export const isTtsQuotaError = (err) =>
  err?.response?.status === 503 && err.response.data?.code === 'TTS_QUOTA_EXCEEDED';

export const isCanceledRequest = (err) => err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError';
