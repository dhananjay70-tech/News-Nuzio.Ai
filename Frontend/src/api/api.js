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
    try {
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
      };
    } catch (err) {
      if (!err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED')) {
        console.warn('Backend news API unreachable, returning curated demo briefing.');
        const q = search.trim().toLowerCase();
        const filteredStories = DEFAULT_STORIES.filter((item) =>
          (!category || category === 'All' || item.category.toLowerCase() === category.toLowerCase()) &&
          (!q || item.title.toLowerCase().includes(q) || item.summary?.toLowerCase().includes(q))
        );
        return {
          language,
          category,
          search,
          articles: filteredStories.map(normalizeArticle),
          total: filteredStories.length,
          page,
          limit,
        };
      }
      throw err;
    }
  },

  getPersonalized: async (category = '') => {
    try {
      const params = category && category !== 'All' ? { category } : {};
      const response = await api.get('/news/personalized', { params });
      const list = Array.isArray(response.data) ? response.data.map(normalizeArticle) : [];
      return { news: list };
    } catch (err) {
      if (!err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED')) {
        console.warn('Backend news API unreachable, returning curated demo briefing.');
        return {
          news: DEFAULT_STORIES.filter(item =>
            !category || category === 'All' || item.category.toLowerCase() === category.toLowerCase()
          )
        };
      }
      throw err;
    }
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

  getSaved: async () => {
    try {
      const response = await api.get('/news/saved');
      const list = Array.isArray(response.data) ? response.data.map(normalizeArticle) : [];
      return { news: list };
    } catch (err) {
      if (!err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED')) {
        return { news: [] };
      }
      throw err;
    }
  },

  save: async (id) => {
    const response = await api.post(`/news/${id}/save`);
    return { success: true, data: response.data };
  },

  unsave: async (id) => {
    const response = await api.delete(`/news/${id}/save`);
    return { success: true, data: response.data };
  },

  getBriefing: async () => {
    const response = await api.get('/news/briefing');
    const b = response.data;
    return {
      briefingLength: b.briefingLength,
      storyCount: b.storyCount,
      estimatedMinutes: b.estimatedMinutes,
      stories: (b.stories || []).map(normalizeArticle),
    };
  },

  search: async (query, { language, category, limit = 20, page = 1 } = {}) => {
    const params = {
      q: query,
      language,
      category: category === 'All' ? undefined : category,
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
    const d = response.data || { trending: [], byCategory: {} };
    const byCategory = {};
    Object.entries(d.byCategory || {}).forEach(([cat, articles]) => {
      byCategory[cat] = articles.map(normalizeArticle);
    });
    return { trending: (d.trending || []).map(normalizeArticle), byCategory };
  },

  getHistory: async () => {
    const response = await api.get('/news/history');
    return { news: (response.data || []).map(normalizeArticle) };
  },

  getContinueListening: async () => {
    try {
      const response = await api.get('/news/continue');
      return { news: (response.data || []).map(normalizeArticle) };
    } catch (err) {
      if (!err.response) return { news: [] };
      throw err;
    }
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

// High-fidelity fallback stories matching Figma design
export const DEFAULT_STORIES = [
  {
    id: 'n1',
    title: 'Anthropic ships Claude 4.5 with 2M-token memory and native tools',
    source: 'The Verge',
    category: 'AI & Tech',
    duration: '03:47',
    durationSeconds: 227,
    relativeTime: '12m ago',
    listened: false,
    summary: 'Anthropic has officially announced Claude 4.5, boasting an unprecedented two million token context window, advanced multimodal vision analysis, and native system execution tool capabilities designed for autonomous workflows.',
    audioUrl: '', // Will automatically synthesize speech with selected voice
  },
  {
    id: 'n2',
    title: 'OpenAI unveils voice-first search companion integrated with live web index',
    source: 'TechCrunch',
    category: 'AI & Tech',
    duration: '02:15',
    durationSeconds: 135,
    relativeTime: '45m ago',
    listened: false,
    summary: 'OpenAI has expanded its real-time conversational search capabilities, allowing users to talk directly with an intelligent browsing agent that synthesizes breaking news and financial market reports on the fly.',
    audioUrl: '',
  },
  {
    id: 'n3',
    title: 'Global chip manufacturing index surges 14% amid next-gen wafer demand',
    source: 'Bloomberg',
    category: 'Markets',
    duration: '04:10',
    durationSeconds: 250,
    relativeTime: '2h ago',
    listened: true,
    summary: 'Semiconductor manufacturers report record order books as hyperscale datacenter expansion drives surging orders for three-nanometer and custom silicon designs across Asian and European fabrication facilities.',
    audioUrl: '',
  },
  {
    id: 'n4',
    title: 'Seed and Series A venture deal velocities reach highest level in eighteen months',
    source: 'PitchBook',
    category: 'Startups',
    duration: '02:50',
    durationSeconds: 170,
    relativeTime: '3h ago',
    listened: false,
    summary: 'Early-stage technology venture financing staged an aggressive comeback this quarter, with artificial intelligence, robotics, and energy infrastructure founders closing rounds in record turnaround time.',
    audioUrl: '',
  },
  {
    id: 'n5',
    title: 'James Webb Space Telescope detects organic prebiotic molecules in distant exoplanet',
    source: 'Nature',
    category: 'Science',
    duration: '05:04',
    durationSeconds: 304,
    relativeTime: '5h ago',
    listened: false,
    summary: 'Astronomers analyzing transmission spectra from the James Webb Space Telescope have identified unambiguous chemical biosignatures and hydrocarbon complexes in the temperate atmosphere of a habitable-zone super-Earth.',
    audioUrl: '',
  },
];

export default api;
