import axios from 'axios';

// Get base URL from environment or default to local backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor to attach Bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('nuzio_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: unwrap the backend's { success, message, data }
// envelope so callers work with the payload directly, and inspect errors.
api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
      response.data = body.data;
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // If unauthorized token expired
      console.warn('Session expired or unauthorized request');
    }
    return Promise.reject(error);
  }
);

// --- Shape adapters between the backend's data model and the UI's model ---

const normalizeUser = (u) => {
  if (!u) return null;

  const hasPreferences = Boolean(
    u.profession || u.preferredVoice || u.briefingLength || (u.interests && u.interests.length)
  );

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatarUrl || u.avatar || '',
    preferences: hasPreferences
      ? {
          profession: u.profession || '',
          interests: u.interests || [],
          voice: u.preferredVoice || 'Aria',
          briefingLength: u.briefingLength ? `${u.briefingLength} min` : '10 min',
          language: u.language || 'en',
        }
      : null,
    // Language is available even before onboarding completes (it has a
    // server-side default), independent of whether profession/etc. are set.
    language: u.language || 'en',
  };
};

const formatDuration = (totalSeconds) => {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const formatRelativeTime = (isoDate) => {
  if (!isoDate) return 'Just now';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const normalizeArticle = (a) => ({
  id: a.id,
  title: a.title,
  source: a.source,
  category: a.category,
  language: a.language || 'en',
  duration: formatDuration(a.duration),
  durationSeconds: a.duration || 0,
  relativeTime: formatRelativeTime(a.publishedAt),
  publishedAt: a.publishedAt,
  listened: Boolean(a.completed),
  progress: a.progress || 0,
  // Prefer the AI-generated (heuristic) briefing script over the raw
  // description - it's already trimmed to a sensible length.
  summary: a.summary || a.description || '',
  description: a.description || '',
  whyItMatters: a.whyItMatters || '',
  sourceCount: a.sourceCount || 1,
  audioUrl: a.audioUrl || '',
  url: a.url,
  imageUrl: a.imageUrl,
  // Real Breaking/Trending/Personalized/Important badges from the backend's
  // scoring signals - absent (not []) on endpoints that don't personalize.
  labels: a.labels || [],
});

// Auth Endpoints
export const authAPI = {
  register: async ({ name, email, password }) => {
    const response = await api.post('/auth/register', { name, email, password });
    const { token, user } = response.data;
    return { token, user: normalizeUser(user) };
  },

  login: async ({ email, password }) => {
    const response = await api.post('/auth/login', { email, password });
    const { token, user } = response.data;
    return { token, user: normalizeUser(user) };
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Stateless JWT - client-side logout proceeds regardless
    }
  },
};

// User Endpoints
export const userAPI = {
  getMe: async () => {
    try {
      const response = await api.get('/users/me');
      return { user: normalizeUser(response.data) };
    } catch (err) {
      if (!err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED')) {
        const storedUser = localStorage.getItem('nuzio_user');
        if (storedUser) {
          return { user: JSON.parse(storedUser) };
        }
      }
      throw err;
    }
  },

  updatePreferences: async (preferences) => {
    try {
      const briefingLengthMinutes = parseInt(preferences.briefingLength, 10) || 10;
      const response = await api.put('/users/preferences', {
        language: preferences.language,
        profession: preferences.profession,
        interests: preferences.interests,
        preferredVoice: preferences.voice,
        briefingLength: briefingLengthMinutes,
      });
      return { success: true, preferences: response.data };
    } catch (err) {
      if (!err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED')) {
        console.warn('Backend not reached, updating local cache.');
        return { success: true, preferences };
      }
      throw err;
    }
  },

  updateLanguage: async (language) => {
    try {
      const response = await api.put('/users/preferences', { language });
      return { success: true, preferences: response.data };
    } catch (err) {
      if (!err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED')) {
        console.warn('Backend not reached, updating local cache.');
        return { success: true, preferences: { language } };
      }
      throw err;
    }
  },
};

// News Endpoints
export const newsAPI = {
  getNews: async (language = 'en', category = 'All', limit = 20, page = 1, search = '') => {
    const params = {
      language,
      category: category === 'All' ? undefined : category,
      limit,
      page,
      search: search || undefined,
    };
    const response = await api.get('/news', { params });
    const data = response.data || {};
    return {
      language: data.language || language,
      category: data.category || category,
      search: data.search ?? search,
      articles: (data.articles || []).map(normalizeArticle),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
      fetchedAt: data.fetchedAt || null,
    };
  },

  getPersonalized: async (category = '', language) => {
    const params = {};
    if (category && category !== 'All') params.category = category;
    if (language) params.language = language;
    const response = await api.get('/news/personalized', { params });
    const list = Array.isArray(response.data) ? response.data.map(normalizeArticle) : [];
    return { news: list };
  },

  getById: async (id) => {
    const response = await api.get(`/news/${id}`);
    return normalizeArticle(response.data);
  },

  markListened: async (id, { progress, completed, skipped } = {}) => {
    try {
      const response = await api.post(`/news/${id}/listen`, { progress, completed, skipped });
      return { success: true, data: response.data };
    } catch (err) {
      // Non-critical telemetry call
      return { success: true };
    }
  },

  getSaved: async ({ search, sort } = {}) => {
    const params = {};
    if (search) params.search = search;
    if (sort) params.sort = sort;
    const response = await api.get('/news/saved', { params });
    const list = Array.isArray(response.data) ? response.data.map(normalizeArticle) : [];
    return { news: list };
  },

  hideArticle: async (id) => {
    const response = await api.post(`/news/${id}/hide`);
    return { success: true, data: response.data };
  },

  unhideArticle: async (id) => {
    const response = await api.delete(`/news/${id}/hide`);
    return { success: true, data: response.data };
  },

  getRelated: async (id) => {
    const response = await api.get(`/news/${id}/related`);
    return { news: (response.data || []).map(normalizeArticle) };
  },

  getWhyRecommended: async (id) => {
    const response = await api.get(`/news/${id}/why`);
    return response.data?.explanation || '';
  },

  getMostListened: async (language) => {
    const response = await api.get('/news/most-listened', { params: language ? { language } : {} });
    return { news: (response.data || []).map(normalizeArticle) };
  },

  getSearchHistory: async () => {
    const response = await api.get('/news/search/history');
    return response.data || [];
  },

  clearSearchHistory: async () => {
    await api.delete('/news/search/history');
    return { success: true };
  },

  getSearchSuggestions: async () => {
    const response = await api.get('/news/search/suggestions');
    return response.data || [];
  },

  save: async (id) => {
    const response = await api.post(`/news/${id}/save`);
    return { success: true, data: response.data };
  },

  unsave: async (id) => {
    const response = await api.delete(`/news/${id}/save`);
    return { success: true, data: response.data };
  },

  getBriefing: async ({ forceRefresh = false } = {}) => {
    const response = await api.get('/news/briefing', { params: forceRefresh ? { forceRefresh: 'true' } : {} });
    const b = response.data;
    return {
      briefingLength: b.briefingLength,
      storyCount: b.storyCount,
      estimatedMinutes: b.estimatedMinutes,
      generatedAt: b.generatedAt || null,
      stories: (b.stories || []).map(normalizeArticle),
    };
  },

  search: async (query, { language, category, source, time, sort, limit = 20, page = 1 } = {}) => {
    const params = {
      q: query,
      language,
      category: category === 'All' ? undefined : category,
      source: source || undefined,
      time: time || undefined,
      sort: sort || undefined,
      limit,
      page,
    };
    const response = await api.get('/news/search', { params });
    const data = response.data || {};
    return {
      query: data.query ?? query,
      language: data.language || language,
      category: data.category || category,
      news: (data.articles || []).map(normalizeArticle),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
    };
  },

  getTrending: async () => {
    const response = await api.get('/news/trending');
    return { news: (response.data || []).map(normalizeArticle) };
  },

  getDiscover: async (language) => {
    const response = await api.get('/news/discover', { params: language ? { language } : {} });
    const d = response.data || {};
    const section = (key) => (d[key] || []).map(normalizeArticle);
    return {
      trendingNow: section('trendingNow'),
      topStories: section('topStories'),
      forYou: section('forYou'),
      latest: section('latest'),
      mostListened: section('mostListened'),
      topInIndia: section('topInIndia'),
    };
  },

  getHistory: async () => {
    const response = await api.get('/news/history');
    return { news: (response.data || []).map(normalizeArticle) };
  },

  getContinueListening: async () => {
    const response = await api.get('/news/continue');
    return { news: (response.data || []).map(normalizeArticle) };
  },

  generateAudio: async (id, language, voice) => {
    try {
      const response = await api.post(`/news/${id}/audio`, { language, voice });
      return response.data; // { audioUrl, duration, cached }
    } catch (err) {
      return { audioUrl: null, duration: null, cached: false };
    }
  },
};

// --- News Pulse (topic clusters, timeline, ingestion) ---
// Served by the Node backend's /api/news-pulse gateway. The frontend only ever
// talks to Node - never to the Python AI service directly. The gateway forwards
// the AI service's raw JSON (snake_case, no { success, data } envelope).

const normalizePulseArticle = (a) => ({
  id: a.id,
  title: a.title || '',
  description: a.description || '',
  url: a.url || '',
  source: a.source || '',
  publishedAt: a.published_at || null,
  clusterId: a.cluster_id ?? null,
  clusterLabel: a.cluster_label || '',
});

const normalizePulseJob = (j) => ({
  jobId: j.job_id,
  status: j.status,
  startedAt: j.started_at || null,
  completedAt: j.completed_at || null,
  articlesFetched: j.articles_fetched || 0,
  articlesInserted: j.articles_inserted || 0,
  articlesSkipped: j.articles_skipped || 0,
  clustersCreated: j.clusters_created || 0,
  error: j.error || null,
});

export const newsPulseAPI = {
  // The service returns only the newest 100 clusters unless a larger `limit`
  // (max 500) is requested.
  getClusters: async ({ limit } = {}, { signal } = {}) => {
    const response = await api.get('/news-pulse/clusters', { params: { limit: limit || undefined }, signal });
    const data = response.data || {};
    return (data.clusters || []).map((c) => ({
      id: c.id,
      label: c.label || '',
      articleCount: c.article_count || 0,
      latestPublishedAt: c.latest_published_at || null,
    }));
  },

  getCluster: async (id, { signal } = {}) => {
    const response = await api.get(`/news-pulse/clusters/${encodeURIComponent(id)}`, { signal });
    const data = response.data || {};
    return {
      id: data.id,
      label: data.label || '',
      articles: (data.articles || []).map(normalizePulseArticle),
    };
  },

  // Filters map to the gateway's supported query parameters:
  // source, cluster_id, from, to, limit. Empty values are omitted.
  getTimeline: async ({ source, clusterId, from, to, limit } = {}, { signal } = {}) => {
    const params = {
      source: source || undefined,
      cluster_id: clusterId || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: limit || undefined,
    };
    const response = await api.get('/news-pulse/timeline', { params, signal });
    const data = response.data || {};
    return (data.articles || []).map(normalizePulseArticle);
  },

  // Enqueues a background ingestion job; resolves right away with its id.
  triggerIngestion: async () => {
    const response = await api.post('/news-pulse/ingest/trigger');
    const data = response.data || {};
    return { jobId: data.job_id, status: data.status };
  },

  getIngestionStatus: async (jobId, { signal } = {}) => {
    const response = await api.get(`/news-pulse/ingest/status/${encodeURIComponent(jobId)}`, { signal });
    return normalizePulseJob(response.data || {});
  },

  // Narration audio for one article ("Listen"), generated on the server when
  // first asked for and cached afterwards. Resolves { audioUrl, duration,
  // cached }. Unlike newsAPI.generateAudio this rejects on failure, so the
  // Listen button can show an error and offer a retry. Text-to-speech can take
  // several seconds, so it gets a longer timeout than the default 10s.
  getAudio: async ({ articleId, title, source, content, voice }, { signal } = {}) => {
    const response = await api.post(
      '/news-pulse/audio',
      { articleId, title, source, content, voice },
      { signal, timeout: 40000 }
    );
    const data = response.data || {};
    if (typeof data.audioUrl !== 'string' || !data.audioUrl) {
      throw new Error('News Pulse audio response had no audioUrl');
    }
    return { audioUrl: data.audioUrl, duration: data.duration ?? null, cached: Boolean(data.cached) };
  },
};

export default api;
