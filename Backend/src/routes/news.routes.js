import express from 'express';
import newsController from '../controllers/news.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateListenHistory } from '../middleware/validate.middleware.js';

const router = express.Router();

// Static/collection routes first, so they aren't swallowed by "/:id"

/**
 * GET /api/news
 * Get news with language and category filters
 */
router.get('/', requireAuth, newsController.getNews);

/**
 * GET /api/news/personalized
 * Get personalized news for authenticated user
 */
router.get('/personalized', requireAuth, newsController.getPersonalizedNews);

/**
 * GET /api/news/briefing
 * Generate the user's full daily briefing
 */
router.get('/briefing', requireAuth, newsController.getBriefing);

/**
 * GET /api/news/search?q=
 */
router.get('/search', requireAuth, newsController.searchNews);

/**
 * GET /api/news/search/history
 * DELETE /api/news/search/history
 */
router.get('/search/history', requireAuth, newsController.getSearchHistory);
router.delete('/search/history', requireAuth, newsController.clearSearchHistory);

/**
 * GET /api/news/search/suggestions
 */
router.get('/search/suggestions', requireAuth, newsController.getSearchSuggestions);

/**
 * GET /api/news/trending
 */
router.get('/trending', requireAuth, newsController.getTrending);

/**
 * GET /api/news/discover
 */
router.get('/discover', requireAuth, newsController.getDiscover);

/**
 * GET /api/news/history
 */
router.get('/history', requireAuth, newsController.getHistory);

/**
 * GET /api/news/continue
 */
router.get('/continue', requireAuth, newsController.getContinueListening);

/**
 * GET /api/news/saved
 * Get all saved articles for the user
 */
router.get('/saved', requireAuth, newsController.getSavedArticles);

/**
 * GET /api/news/most-listened
 */
router.get('/most-listened', requireAuth, newsController.getMostListened);

/**
 * GET /api/news/:id
 * Get a specific article by ID
 */
router.get('/:id', requireAuth, newsController.getArticleById);

/**
 * GET /api/news/:id/related
 */
router.get('/:id/related', requireAuth, newsController.getRelatedArticles);

/**
 * GET /api/news/:id/why
 */
router.get('/:id/why', requireAuth, newsController.getWhyRecommended);

/**
 * POST /api/news/:id/hide
 * DELETE /api/news/:id/hide
 */
router.post('/:id/hide', requireAuth, newsController.hideArticle);
router.delete('/:id/hide', requireAuth, newsController.unhideArticle);

/**
 * POST /api/news/:id/listen
 * Update or create listen history for an article
 */
router.post('/:id/listen', requireAuth, validateListenHistory, newsController.updateListenHistory);

/**
 * POST /api/news/:id/save
 * Save an article for later
 */
router.post('/:id/save', requireAuth, newsController.saveArticle);

/**
 * DELETE /api/news/:id/save
 * Remove a saved article
 */
router.delete('/:id/save', requireAuth, newsController.unsaveArticle);

/**
 * POST /api/news/:id/audio
 * Generate (or fetch cached) audio for an article
 */
router.post('/:id/audio', requireAuth, newsController.generateArticleAudio);

/**
 * GET /api/news/:id/audio
 * Look up cached audio without generating
 */
router.get('/:id/audio', requireAuth, newsController.getArticleAudioAsset);

export default router;
