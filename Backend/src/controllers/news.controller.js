import { eq, and, gt, desc } from 'drizzle-orm';
import db from '../config/database.js';
import { users, newsArticles, userListenHistory, audioAssets, savedArticles, hiddenArticles, searchHistory } from '../db/schema.js';
import personalizationService from '../services/personalization.service.js';
import newsService from '../services/news.service.js';
import audioService from '../services/audio.service.js';
import { successResponse, notFound, badRequest, errorResponse } from '../utils/response.js';

const TIME_WINDOWS_MS = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Post-fetch filters for search results the providers don't natively
 * support (source, time window) and simple re-sorting (trending/latest -
 * "relevance" is left as the provider/DB's own ranked order).
 */
function applySearchFilters(articles, { source, time, sort }, sourceCounts = new Map()) {
  let results = articles;

  if (source) {
    const needle = source.toLowerCase();
    results = results.filter((a) => a.source?.toLowerCase().includes(needle));
  }

  if (time && TIME_WINDOWS_MS[time]) {
    const cutoff = Date.now() - TIME_WINDOWS_MS[time];
    results = results.filter((a) => new Date(a.publishedAt).getTime() >= cutoff);
  }

  if (sort === 'trending') {
    results = [...results].sort((a, b) => (sourceCounts.get(b.id) || 0) - (sourceCounts.get(a.id) || 0));
  } else if (sort === 'latest') {
    results = [...results].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  return results;
}

/**
 * Sort a pool of articles by outlet-coverage count (shared by
 * getTrending and getDiscover's "Trending Now" section). A plain
 * function, not a class method - route handlers are passed as bare
 * function references, so `this` isn't bound inside them.
 */
async function rankTrending(pool, limit) {
  const sourceCounts = await personalizationService.getSourceCounts(pool.map((a) => a.id));
  return pool
    .map((article) => ({ ...article, sourceCount: (sourceCounts.get(article.id) || 0) + 1 }))
    .sort((a, b) => b.sourceCount - a.sourceCount || new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, limit);
}

export class NewsController {
  /**
   * GET /api/news
   * Get news with language and category filters, or - when `search`/`q` is
   * given - matching news for that query (same endpoint, same pagination
   * shape, so callers don't need a separate search route).
   */
  async getNews(req, res, next) {
    try {
      const userId = req.user.userId;
      const { language, category, limit = 20, page = 1 } = req.query;
      const searchQuery = req.query.search || req.query.q;

      // Get user's language preference if not provided
      let selectedLanguage = language || 'en';
      if (db) {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        selectedLanguage = language || user?.language || 'en';
      }

      // Fetch news: search query -> category+language+personalization (combined) -> latest, personalized
      let articles;
      if (searchQuery && searchQuery.trim()) {
        articles = await newsService.searchNews(searchQuery.trim(), selectedLanguage);
        if (category && category !== 'All') {
          articles = articles.filter((article) => article.category === category);
        }
      } else {
        articles = await personalizationService.getPersonalizedNews(
          userId,
          category && category !== 'All' ? category : undefined,
          selectedLanguage
        );
      }

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const paginatedArticles = articles.slice(startIndex, startIndex + parseInt(limit));

      return successResponse(res, {
        language: selectedLanguage,
        category: category || 'All',
        search: searchQuery || '',
        articles: paginatedArticles,
        total: articles.length,
        page: parseInt(page),
        limit: parseInt(limit),
        fetchedAt: new Date().toISOString(),
      }, 'News retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/personalized
   * Get personalized news for authenticated user
   */
  async getPersonalizedNews(req, res, next) {
    try {
      const userId = req.user.userId;
      const { category, language } = req.query;
      const personalizedNews = await personalizationService.getPersonalizedNews(userId, category, language);

      return successResponse(res, personalizedNews, 'Personalized news retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/briefing
   * Generate the user's full daily briefing (greeting-ready story set,
   * sized to their briefing length by estimated narration time)
   */
  async getBriefing(req, res, next) {
    try {
      const userId = req.user.userId;
      const briefing = await personalizationService.generatePersonalizedBriefing(userId);
      return successResponse(res, briefing, 'Briefing generated');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/search?q=&language=&category=&source=&time=&sort=&limit=&page=
   * Search news by free-text query, optionally scoped to a
   * language/category/source/time-window and sorted - same base query-param
   * shape as GET /api/news, plus filters the providers don't support
   * natively. Logs the query to search history on success.
   */
  async searchNews(req, res, next) {
    try {
      const { q, language: languageParam, category, source, time, sort, limit = 20, page = 1 } = req.query;
      if (!q || !q.trim()) {
        return badRequest(res, 'A search query ("q") is required');
      }
      const trimmedQuery = q.trim();

      let selectedLanguage = languageParam || 'en';
      const userId = req.user.userId;
      if (db) {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        selectedLanguage = languageParam || user?.language || 'en';
      }

      let results = await newsService.searchNews(trimmedQuery, selectedLanguage);
      if (category && category !== 'All') {
        results = results.filter((article) => article.category === category);
      }

      const sourceCounts =
        sort === 'trending' ? await personalizationService.getSourceCounts(results.map((a) => a.id)) : new Map();
      results = applySearchFilters(results, { source, time, sort }, sourceCounts);

      if (db) {
        await db.insert(searchHistory).values({ userId, query: trimmedQuery });
      }

      const startIndex = (page - 1) * limit;
      const paginatedResults = results.slice(startIndex, startIndex + parseInt(limit));

      return successResponse(res, {
        query: trimmedQuery,
        language: selectedLanguage,
        category: category || 'All',
        articles: paginatedResults,
        total: results.length,
        page: parseInt(page),
        limit: parseInt(limit),
      }, 'Search results retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/search/history
   * The user's recent distinct search queries, most recent first.
   */
  async getSearchHistory(req, res, next) {
    try {
      const userId = req.user.userId;
      if (!db) return successResponse(res, [], 'Search history retrieved (mock mode)');

      const rows = await db.query.searchHistory.findMany({
        where: eq(searchHistory.userId, userId),
        orderBy: [desc(searchHistory.createdAt)],
        limit: 50,
      });

      const seen = new Set();
      const distinctQueries = [];
      for (const row of rows) {
        const key = row.query.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        distinctQueries.push(row.query);
        if (distinctQueries.length >= 10) break;
      }

      return successResponse(res, distinctQueries, 'Search history retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/news/search/history
   * Clear the user's search history.
   */
  async clearSearchHistory(req, res, next) {
    try {
      const userId = req.user.userId;
      if (!db) return successResponse(res, null, 'Search history cleared (mock mode)');

      await db.delete(searchHistory).where(eq(searchHistory.userId, userId));
      return successResponse(res, null, 'Search history cleared');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/search/suggestions
   * Lightweight suggestions from the user's own interests plus the
   * canonical category list - no ML, no new data source.
   */
  async getSearchSuggestions(req, res, next) {
    try {
      const userId = req.user.userId;
      const CANONICAL_CATEGORIES = ['Tech', 'AI', 'Student', 'India', 'World', 'Business', 'Startups', 'Sports', 'Science'];

      let interestCategories = [];
      if (db) {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId), with: { interests: true } });
        interestCategories = user?.interests.map((i) => i.category) || [];
      }

      const suggestions = [...new Set([...interestCategories, ...CANONICAL_CATEGORIES])].slice(0, 8);
      return successResponse(res, suggestions, 'Search suggestions retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/trending
   * Stories covered by more than one outlet, most recent first
   */
  async getTrending(req, res, next) {
    try {
      let language = 'en';
      if (db) {
        const user = await db.query.users.findFirst({ where: eq(users.id, req.user.userId) });
        language = user?.language || 'en';
      }

      const pool = await newsService.fetchLatestNews(language);
      const trending = await rankTrending(pool, 10);

      return successResponse(res, trending, 'Trending stories retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/discover?language=
   * Six named sections: Trending Now, Top Stories, For You, Latest,
   * Most Listened, Top in India.
   */
  async getDiscover(req, res, next) {
    try {
      const userId = req.user.userId;
      const { language: languageParam } = req.query;
      let language = languageParam || 'en';
      let interestCategories = [];
      if (db) {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId), with: { interests: true } });
        language = languageParam || user?.language || 'en';
        interestCategories = user?.interests.map((i) => i.category) || [];
      }

      const [latest, personalized, mostListened, topInIndia] = await Promise.all([
        newsService.fetchLatestNews(language),
        personalizationService.getPersonalizedNews(userId, undefined, language),
        personalizationService.getMostListenedArticles(language, 8),
        newsService.fetchNewsByCategory('India', language),
      ]);

      const trendingNow = await rankTrending(latest, 8);
      const topStories = personalized.slice(0, 8);
      const forYou = (
        interestCategories.length
          ? personalized.filter((a) => interestCategories.includes(a.category))
          : personalized
      ).slice(0, 8);

      return successResponse(res, {
        trendingNow,
        topStories,
        forYou,
        latest: latest.slice(0, 8),
        mostListened,
        topInIndia: topInIndia.slice(0, 8),
      }, 'Discover feed retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/:id
   * Get a specific article by ID
   */
  async getArticleById(req, res, next) {
    try {
      const { id } = req.params;
      const article = await newsService.getArticleById(id);

      // Get audio URL (may be null if TTS not configured)
      const audioUrl = await audioService.getArticleAudio(article);

      return successResponse(res, {
        ...article,
        audioUrl,
        sourceCount: (article.sources?.length || 0) + 1, // +1 for the article's own primary source
      }, 'Article retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/:id/related
   * Other stories in the same category/language.
   */
  async getRelatedArticles(req, res, next) {
    try {
      const { id } = req.params;
      const related = await personalizationService.getRelatedArticles(id, 5);
      return successResponse(res, related, 'Related stories retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/:id/why
   * "Why am I seeing this?" explanation for one article.
   */
  async getWhyRecommended(req, res, next) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;
      const article = await newsService.getArticleById(id);
      const explanation = await personalizationService.explainRecommendation(userId, article);
      return successResponse(res, { explanation }, 'Recommendation explanation retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/most-listened?language=
   */
  async getMostListened(req, res, next) {
    try {
      let language = req.query.language || 'en';
      if (db && !req.query.language) {
        const user = await db.query.users.findFirst({ where: eq(users.id, req.user.userId) });
        language = user?.language || 'en';
      }
      const articles = await personalizationService.getMostListenedArticles(language, 10);
      return successResponse(res, articles, 'Most-listened articles retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/news/:id/listen
   * Update or create listen history for an article
   */
  async updateListenHistory(req, res, next) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;
      const { progress, completed, skipped } = req.body;

      if (!db) {
        // Mock mode - return success without database update
        return successResponse(res, { progress, completed, skipped }, 'Listen history updated (mock mode)');
      }

      // Verify article exists
      const article = await db.query.newsArticles.findFirst({ where: eq(newsArticles.id, id) });

      if (!article) {
        return notFound(res, 'Article not found');
      }

      // Calculate completed status if progress >= 90
      const isCompleted = completed || (progress >= 90);
      // A story is "skipped" if playback ended early (low progress, never
      // completed) - either reported explicitly or inferred.
      const isSkipped = Boolean(skipped) || (progress > 0 && progress < 20 && !isCompleted);

      // Upsert listen history
      const [listenHistory] = await db
        .insert(userListenHistory)
        .values({
          userId,
          articleId: id,
          progress: progress || 0,
          completed: isCompleted,
          skipped: isSkipped,
        })
        .onConflictDoUpdate({
          target: [userListenHistory.userId, userListenHistory.articleId],
          set: {
            progress: progress || 0,
            completed: isCompleted,
            skipped: isSkipped,
            listenedAt: new Date(),
          },
        })
        .returning();

      return successResponse(res, listenHistory, 'Listen history updated');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/history
   * The user's full listening history, most recent first
   */
  async getHistory(req, res, next) {
    try {
      const userId = req.user.userId;

      if (!db) {
        // Mock mode - return empty history
        return successResponse(res, [], 'Listening history retrieved (mock mode)');
      }

      const history = await db.query.userListenHistory.findMany({
        where: eq(userListenHistory.userId, userId),
        with: { article: true },
        orderBy: [desc(userListenHistory.listenedAt)],
        limit: 50,
      });

      const results = history.map((h) => ({
        ...h.article,
        progress: h.progress,
        completed: h.completed,
        skipped: h.skipped,
        startedAt: h.startedAt,
        lastPlayedAt: h.listenedAt,
      }));

      return successResponse(res, results, 'Listening history retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/continue
   * Stories the user started but hasn't finished - "Continue listening"
   */
  async getContinueListening(req, res, next) {
    try {
      const userId = req.user.userId;

      if (!db) {
        // Mock mode - return empty list
        return successResponse(res, [], 'Continue-listening list retrieved (mock mode)');
      }

      const history = await db.query.userListenHistory.findMany({
        where: and(eq(userListenHistory.userId, userId), eq(userListenHistory.completed, false), gt(userListenHistory.progress, 0)),
        with: { article: true },
        orderBy: [desc(userListenHistory.listenedAt)],
        limit: 10,
      });

      const results = history.map((h) => ({
        ...h.article,
        progress: h.progress,
        lastPlayedAt: h.listenedAt,
      }));

      return successResponse(res, results, 'Continue-listening list retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/news/:id/audio
   * Generate (or return cached) audio for an article in a given
   * language/voice. Returns audioUrl: null when no TTS provider is
   * configured - the frontend falls back to browser SpeechSynthesis.
   */
  async generateArticleAudio(req, res, next) {
    try {
      const { id } = req.params;
      const { language, voice } = req.body;

      if (!db) {
        // Mock mode - return success without audio generation
        return successResponse(res, {
          audioUrl: null,
          duration: 180,
          cached: false,
        }, 'No TTS provider configured - use browser speech synthesis (mock mode)');
      }

      const article = await db.query.newsArticles.findFirst({ where: eq(newsArticles.id, id) });
      if (!article) {
        return notFound(res, 'Article not found');
      }

      const result = await audioService.getOrGenerateAudio(article, language || article.language, voice);

      return successResponse(res, {
        audioUrl: result?.audioUrl || null,
        duration: result?.duration || article.duration,
        cached: result?.cached || false,
      }, result ? 'Audio ready' : 'No TTS provider configured - use browser speech synthesis');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/:id/audio
   * Look up cached audio for an article/language/voice without generating
   */
  async getArticleAudioAsset(req, res, next) {
    try {
      const { id } = req.params;
      const language = req.query.language === 'hi' ? 'hi' : 'en';
      const voice = req.query.voice || 'default';

      if (!db) {
        // Mock mode - return success without database lookup
        return successResponse(res, {
          audioUrl: null,
          duration: null,
        }, 'No cached audio for this language/voice (mock mode)');
      }

      const asset = await db.query.audioAssets.findFirst({
        where: and(eq(audioAssets.articleId, id), eq(audioAssets.language, language), eq(audioAssets.voice, voice)),
      });

      return successResponse(res, {
        audioUrl: asset?.audioUrl || null,
        duration: asset?.duration || null,
      }, asset ? 'Cached audio found' : 'No cached audio for this language/voice');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/news/:id/save
   * Save an article for later
   */
  async saveArticle(req, res, next) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      if (!db) {
        // Mock mode - return success without database update
        return successResponse(res, { userId, articleId: id }, 'Article saved successfully (mock mode)');
      }

      // Verify article exists
      const article = await db.query.newsArticles.findFirst({ where: eq(newsArticles.id, id) });

      if (!article) {
        return notFound(res, 'Article not found');
      }

      // Check if already saved
      const existing = await db.query.savedArticles.findFirst({
        where: and(eq(savedArticles.userId, userId), eq(savedArticles.articleId, id)),
      });

      if (existing) {
        return errorResponse(res, 'Article already saved', 409, 'CONFLICT');
      }

      // Save article
      const [savedArticle] = await db.insert(savedArticles).values({ userId, articleId: id }).returning();

      return successResponse(res, savedArticle, 'Article saved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/news/:id/save
   * Remove a saved article
   */
  async unsaveArticle(req, res, next) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      if (!db) {
        // Mock mode - return success without database update
        return successResponse(res, null, 'Article removed from saved (mock mode)');
      }

      // Delete saved article
      await db.delete(savedArticles).where(and(eq(savedArticles.userId, userId), eq(savedArticles.articleId, id)));

      return successResponse(res, null, 'Article removed from saved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/saved?search=&sort=newest|relevance
   * Get all saved articles for the user, optionally searched/sorted.
   */
  async getSavedArticles(req, res, next) {
    try {
      const userId = req.user.userId;
      const { search, sort } = req.query;

      if (!db) {
        // Mock mode - return empty list
        return successResponse(res, [], 'Saved articles retrieved (mock mode)');
      }

      const savedRows = await db.query.savedArticles.findMany({
        where: eq(savedArticles.userId, userId),
        with: { article: true },
        orderBy: [desc(savedArticles.createdAt)],
      });

      let articles = savedRows.map((saved) => ({
        ...saved.article,
        savedAt: saved.createdAt,
      }));

      if (search && search.trim()) {
        const needle = search.trim().toLowerCase();
        articles = articles.filter(
          (a) => a.title?.toLowerCase().includes(needle) || a.description?.toLowerCase().includes(needle)
        );
      }

      if (sort === 'relevance') {
        const sourceCounts = await personalizationService.getSourceCounts(articles.map((a) => a.id));
        articles = [...articles].sort((a, b) => {
          const freshnessA = Date.now() - new Date(a.publishedAt).getTime();
          const freshnessB = Date.now() - new Date(b.publishedAt).getTime();
          const scoreA = (sourceCounts.get(a.id) || 0) * 10 - freshnessA / (1000 * 60 * 60);
          const scoreB = (sourceCounts.get(b.id) || 0) * 10 - freshnessB / (1000 * 60 * 60);
          return scoreB - scoreA;
        });
      }
      // sort === 'newest' (default): already ordered by savedAt desc from the query above.

      return successResponse(res, articles, 'Saved articles retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/news/:id/hide
   * Hide an article ("Not interested") so it's filtered out of
   * personalized/briefing results going forward.
   */
  async hideArticle(req, res, next) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      if (!db) {
        return successResponse(res, { userId, articleId: id }, 'Article hidden (mock mode)');
      }

      const article = await db.query.newsArticles.findFirst({ where: eq(newsArticles.id, id) });
      if (!article) {
        return notFound(res, 'Article not found');
      }

      const existing = await db.query.hiddenArticles.findFirst({
        where: and(eq(hiddenArticles.userId, userId), eq(hiddenArticles.articleId, id)),
      });
      if (existing) {
        return successResponse(res, existing, 'Article already hidden');
      }

      const [hidden] = await db.insert(hiddenArticles).values({ userId, articleId: id }).returning();
      return successResponse(res, hidden, 'Article hidden');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/news/:id/hide
   * Unhide a previously-hidden article.
   */
  async unhideArticle(req, res, next) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      if (!db) {
        return successResponse(res, null, 'Article unhidden (mock mode)');
      }

      await db.delete(hiddenArticles).where(and(eq(hiddenArticles.userId, userId), eq(hiddenArticles.articleId, id)));
      return successResponse(res, null, 'Article unhidden');
    } catch (error) {
      next(error);
    }
  }
}

export default new NewsController();
