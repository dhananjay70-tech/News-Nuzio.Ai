import { eq, and, gt, desc } from 'drizzle-orm';
import db from '../config/database.js';
import { users, newsArticles, userListenHistory, audioAssets, savedArticles } from '../db/schema.js';
import personalizationService from '../services/personalization.service.js';
import newsService from '../services/news.service.js';
import audioService from '../services/audio.service.js';
import { successResponse, notFound, badRequest, errorResponse } from '../utils/response.js';

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

      // Fetch news: search query -> category filter -> latest/trending
      let articles;
      if (searchQuery && searchQuery.trim()) {
        articles = await newsService.searchNews(searchQuery.trim(), selectedLanguage);
        if (category && category !== 'All') {
          articles = articles.filter((article) => article.category === category);
        }
      } else if (category && category !== 'All') {
        articles = await newsService.fetchNewsByCategory(category, selectedLanguage);
      } else {
        articles = await newsService.fetchLatestNews(selectedLanguage);
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
        limit: parseInt(limit)
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
      const { category } = req.query;
      const personalizedNews = await personalizationService.getPersonalizedNews(userId, category);

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
   * GET /api/news/search?q=&language=&category=&limit=&page=
   * Search news by free-text query, optionally scoped to a language/category
   * and paginated - same query-param shape as GET /api/news.
   */
  async searchNews(req, res, next) {
    try {
      const { q, language: languageParam, category, limit = 20, page = 1 } = req.query;
      if (!q || !q.trim()) {
        return badRequest(res, 'A search query ("q") is required');
      }

      let selectedLanguage = languageParam || 'en';
      if (db) {
        const user = await db.query.users.findFirst({ where: eq(users.id, req.user.userId) });
        selectedLanguage = languageParam || user?.language || 'en';
      }

      let results = await newsService.searchNews(q.trim(), selectedLanguage);
      if (category && category !== 'All') {
        results = results.filter((article) => article.category === category);
      }

      const startIndex = (page - 1) * limit;
      const paginatedResults = results.slice(startIndex, startIndex + parseInt(limit));

      return successResponse(res, {
        query: q.trim(),
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
      const sourceCounts = await personalizationService.getSourceCounts(pool.map((a) => a.id));

      const trending = pool
        .map((article) => ({ ...article, sourceCount: (sourceCounts.get(article.id) || 0) + 1 }))
        .sort((a, b) => b.sourceCount - a.sourceCount || new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, 10);

      return successResponse(res, trending, 'Trending stories retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/news/discover?language=
   * Trending stories plus a few category buckets to browse
   */
  async getDiscover(req, res, next) {
    try {
      const { language: languageParam } = req.query;
      let language = languageParam || 'en';
      if (db) {
        const user = await db.query.users.findFirst({ where: eq(users.id, req.user.userId) });
        language = languageParam || user?.language || 'en';
      }
      const browseCategories = ['India', 'AI & Tech', 'Startups', 'Markets'];

      const [pool, ...categoryResults] = await Promise.all([
        newsService.fetchLatestNews(language),
        ...browseCategories.map((c) => newsService.fetchNewsByCategory(c, language)),
      ]);

      const sourceCounts = await personalizationService.getSourceCounts(pool.map((a) => a.id));
      const trending = pool
        .map((article) => ({ ...article, sourceCount: (sourceCounts.get(article.id) || 0) + 1 }))
        .sort((a, b) => b.sourceCount - a.sourceCount)
        .slice(0, 6);

      const byCategory = {};
      browseCategories.forEach((cat, i) => {
        byCategory[cat] = categoryResults[i].slice(0, 6);
      });

      return successResponse(res, { trending, byCategory }, 'Discover feed retrieved');
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
   * GET /api/news/saved
   * Get all saved articles for the user
   */
  async getSavedArticles(req, res, next) {
    try {
      const userId = req.user.userId;

      if (!db) {
        // Mock mode - return empty list
        return successResponse(res, [], 'Saved articles retrieved (mock mode)');
      }

      const savedRows = await db.query.savedArticles.findMany({
        where: eq(savedArticles.userId, userId),
        with: { article: true },
        orderBy: [desc(savedArticles.createdAt)],
      });

      const articles = savedRows.map((saved) => ({
        ...saved.article,
        savedAt: saved.createdAt,
      }));

      return successResponse(res, articles, 'Saved articles retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export default new NewsController();
