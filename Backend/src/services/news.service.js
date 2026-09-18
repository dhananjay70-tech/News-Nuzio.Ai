import axios from 'axios';
import { eq, and, or, ilike, desc, inArray } from 'drizzle-orm';
import db from '../config/database.js';
import { newsArticles, newsSources } from '../db/schema.js';
import { config } from '../config/env.js';
import aiService from './ai.service.js';

const SUPPORTED_LANGUAGES = ['en', 'hi'];
const DEFAULT_LANGUAGE = 'en';

export class NewsService {
  /**
   * Fetch latest news in the given language: GNews (if configured) ->
   * generic NewsAPI-shaped provider (if configured) -> database.
   */
  async fetchLatestNews(language = DEFAULT_LANGUAGE) {
    const lang = this.normalizeLanguage(language);

    if (config.GNEWS_API_KEY) {
      const articles = await this.fetchFromGNewsSafely('/top-headlines', {
        category: 'general',
        lang,
        max: 10,
      });
      if (articles) {
        return await this.persistArticles(this.transformGNewsArticles(articles, undefined, lang));
      }
    }

    if (config.NEWS_API_KEY && config.NEWS_API_URL) {
      const articles = await this.fetchFromNewsAPISafely('/top-headlines', {
        language: lang,
        pageSize: 50,
      });
      if (articles) {
        return await this.persistArticles(this.transformNewsAPIArticles(articles, undefined, lang));
      }
    }

    return await this.fetchNewsFromDatabase(lang);
  }

  /**
   * Fetch news for one category, in the given language: GNews -> generic
   * NewsAPI -> database.
   */
  async fetchNewsByCategory(category, language = DEFAULT_LANGUAGE) {
    const lang = this.normalizeLanguage(language);

    if (config.GNEWS_API_KEY) {
      const params = { category: this.mapCategoryToGNews(category), lang, max: 10 };
      // "India" isn't a GNews category - it's GNews's "nation" category
      // scoped to India via the country param, giving real India-specific
      // headlines instead of generic national news for whatever the
      // default country is.
      if (category === 'India') params.country = 'in';

      const articles = await this.fetchFromGNewsSafely('/top-headlines', params);
      if (articles) {
        return await this.persistArticles(this.transformGNewsArticles(articles, category, lang));
      }
    }

    if (config.NEWS_API_KEY && config.NEWS_API_URL) {
      const articles = await this.fetchFromNewsAPISafely('/top-headlines', {
        category: this.mapCategoryToNewsAPI(category),
        language: lang,
        pageSize: 20,
      });
      if (articles) {
        return await this.persistArticles(this.transformNewsAPIArticles(articles, category, lang));
      }
    }

    return await db.query.newsArticles.findMany({
      where: and(eq(newsArticles.category, category), eq(newsArticles.language, lang)),
      orderBy: [desc(newsArticles.publishedAt)],
      limit: 20,
    });
  }

  /**
   * Search news by free-text query: GNews -> generic NewsAPI -> database
   * (simple title/description contains-match as a last resort).
   */
  async searchNews(query, language = DEFAULT_LANGUAGE) {
    const lang = this.normalizeLanguage(language);

    if (config.GNEWS_API_KEY) {
      const articles = await this.fetchFromGNewsSafely('/search', {
        q: query,
        lang,
        max: 10,
      });
      if (articles) {
        return await this.persistArticles(this.transformGNewsArticles(articles, undefined, lang));
      }
    }

    if (config.NEWS_API_KEY && config.NEWS_API_URL) {
      const articles = await this.fetchFromNewsAPISafely('/everything', {
        q: query,
        language: lang,
        pageSize: 20,
      });
      if (articles) {
        return await this.persistArticles(this.transformNewsAPIArticles(articles, undefined, lang));
      }
    }

    return await db.query.newsArticles.findMany({
      where: and(
        eq(newsArticles.language, lang),
        or(ilike(newsArticles.title, `%${query}%`), ilike(newsArticles.description, `%${query}%`))
      ),
      orderBy: [desc(newsArticles.publishedAt)],
      limit: 20,
    });
  }

  /**
   * Fetch news from database, restricted to the requested language so a
   * Hindi-preference user never silently falls back to English-only rows.
   */
  async fetchNewsFromDatabase(language = DEFAULT_LANGUAGE) {
    return await db.query.newsArticles.findMany({
      where: eq(newsArticles.language, this.normalizeLanguage(language)),
      orderBy: [desc(newsArticles.publishedAt)],
      limit: 50,
    });
  }

  /**
   * Get article by ID
   */
  async getArticleById(articleId) {
    const article = await db.query.newsArticles.findFirst({
      where: eq(newsArticles.id, articleId),
      with: { sources: true },
    });

    if (!article) {
      const error = new Error('Article not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    return article;
  }

  /**
   * Only 'en' and 'hi' are supported; anything else falls back to English.
   */
  normalizeLanguage(language) {
    return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  }

  /**
   * GNews request, returning null (instead of throwing) on any failure so
   * callers can fall back to the next provider.
   */
  async fetchFromGNewsSafely(endpoint, params) {
    try {
      const response = await axios.get(`${config.GNEWS_API_URL}${endpoint}`, {
        params: { ...params, apikey: config.GNEWS_API_KEY },
      });
      return response.data?.articles?.length ? response.data.articles : null;
    } catch (error) {
      console.warn('Failed to fetch from GNews, falling back:', error.response?.data?.errors || error.message);
      return null;
    }
  }

  /**
   * Generic NewsAPI-shaped provider request, same fallback contract as above.
   */
  async fetchFromNewsAPISafely(endpoint, params) {
    try {
      const response = await axios.get(`${config.NEWS_API_URL}${endpoint}`, {
        params: { ...params, apiKey: config.NEWS_API_KEY },
      });
      return response.data?.articles?.length ? response.data.articles : null;
    } catch (error) {
      console.warn('Failed to fetch from news API, falling back:', error.message);
      return null;
    }
  }

  /**
   * Persist fetched articles as NewsArticle rows (upserted by URL) so they
   * have stable database ids - required for /news/:id, listen history, and
   * save-article to work on live-fetched articles, not just seed data.
   *
   * Before persisting: near-duplicate articles (same event, different
   * outlets) are grouped so only one NewsArticle is created per story, with
   * the others recorded as NewsSource rows ("Covered by N sources") instead
   * of showing up as 3 near-identical cards. Each primary also gets an
   * AI-generated (heuristic) summary/why-it-matters at ingestion time.
   */
  async persistArticles(articles) {
    const { primaries, sourcesByUrl } = this.deduplicateArticles(articles);
    const rows = [];

    for (const article of primaries) {
      const { summary, whyItMatters } = aiService.summarizeArticle(article, article.language, 10);

      const [row] = await db
        .insert(newsArticles)
        .values({ ...article, summary, whyItMatters })
        .onConflictDoUpdate({
          target: newsArticles.url,
          set: {
            title: article.title,
            description: article.description,
            content: article.content,
            summary,
            whyItMatters,
            source: article.source,
            imageUrl: article.imageUrl,
            category: article.category,
            language: article.language,
            publishedAt: article.publishedAt,
            duration: article.duration,
          },
        })
        .returning();
      rows.push(row);

      const relatedSources = sourcesByUrl.get(article.url) || [];
      for (const related of relatedSources) {
        const existing = await db.query.newsSources.findFirst({
          where: and(eq(newsSources.articleId, row.id), eq(newsSources.name, related.source)),
        });
        if (!existing) {
          await db.insert(newsSources).values({
            articleId: row.id,
            name: related.source,
            url: related.url,
            publishedAt: related.publishedAt,
          });
        }
      }
    }
    return rows;
  }

  /**
   * Group near-duplicate articles (same underlying story, different
   * outlets) using normalized-title word overlap within a time window.
   * Simple and explainable rather than NLP-heavy, per project scope.
   */
  deduplicateArticles(articles) {
    const normalize = (title) =>
      new Set(
        (title || '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, '')
          .split(/\s+/)
          .filter((w) => w.length > 2)
      );

    const jaccardSimilarity = (a, b) => {
      if (a.size === 0 || b.size === 0) return 0;
      let intersection = 0;
      for (const word of a) if (b.has(word)) intersection++;
      const union = a.size + b.size - intersection;
      return union === 0 ? 0 : intersection / union;
    };

    const primaries = [];
    const sourcesByUrl = new Map();
    const normalizedTitles = [];

    for (const article of articles) {
      const words = normalize(article.title);
      const hoursWindow = 48 * 60 * 60 * 1000;

      let matchIndex = -1;
      for (let i = 0; i < primaries.length; i++) {
        const sameWindow = Math.abs(new Date(article.publishedAt) - new Date(primaries[i].publishedAt)) < hoursWindow;
        if (sameWindow && jaccardSimilarity(words, normalizedTitles[i]) >= 0.5) {
          matchIndex = i;
          break;
        }
      }

      if (matchIndex === -1) {
        primaries.push(article);
        normalizedTitles.push(words);
      } else {
        const primaryUrl = primaries[matchIndex].url;
        if (!sourcesByUrl.has(primaryUrl)) sourcesByUrl.set(primaryUrl, []);
        sourcesByUrl.get(primaryUrl).push({
          source: article.source,
          url: article.url,
          publishedAt: article.publishedAt,
        });
      }
    }

    return { primaries, sourcesByUrl };
  }

  /**
   * Transform GNews articles to our format
   */
  transformGNewsArticles(articles, forcedCategory, language = DEFAULT_LANGUAGE) {
    return articles
      .filter((article) => article.title && article.url)
      .map((article) => ({
        title: article.title,
        description: article.description || null,
        content: article.content || article.description || null,
        url: article.url,
        source: article.source?.name || 'GNews',
        imageUrl: article.image || null,
        category: forcedCategory || this.categorizeArticle(article),
        language,
        publishedAt: article.publishedAt ? new Date(article.publishedAt) : new Date(),
        audioUrl: null, // Will be generated if TTS is configured
        duration: this.estimateDuration(article),
      }));
  }

  /**
   * Transform NewsAPI articles to our format
   */
  transformNewsAPIArticles(articles, forcedCategory, language = DEFAULT_LANGUAGE) {
    return articles
      .filter((article) => article.title && article.title !== '[Removed]' && article.url)
      .map((article) => ({
        title: article.title,
        description: article.description || null,
        content: article.content || article.description || null,
        url: article.url,
        source: article.source?.name || 'Unknown',
        imageUrl: article.urlToImage || null,
        category: forcedCategory || this.categorizeArticle(article),
        language,
        publishedAt: article.publishedAt ? new Date(article.publishedAt) : new Date(),
        audioUrl: null, // Will be generated if TTS is configured
        duration: this.estimateDuration(article),
      }));
  }

  /**
   * Estimate spoken duration (seconds) from article text, at an average
   * speaking rate of ~140 words/minute - matches the frontend's
   * SpeechSynthesis fallback estimate.
   */
  estimateDuration(article) {
    const text = `${article.title || ''} ${article.description || ''} ${article.content || ''}`;
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (!wordCount) return 180;
    return Math.max(60, Math.round((wordCount / 140) * 60));
  }

  /**
   * Categorize article based on content (simple heuristic).
   * Keyword-based, so it's most accurate for English content; Hindi
   * articles that don't match any keyword fall back to "Business" like any
   * other unmatched article.
   */
  categorizeArticle(article) {
    const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();

    const keywords = {
      'India': ['india', 'indian', 'delhi', 'mumbai', 'bengaluru', 'bharat', 'modi', 'rbi', 'sebi', 'rupee', 'isro', 'lok sabha'],
      'Tech': ['tech', 'technology', 'software', 'app', 'digital', 'robot', 'algorithm'],
      'AI': ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network'],
      'Student': ['student', 'education', 'career', 'college', 'university', 'exam', 'school', 'learning'],
      'World': ['world', 'international', 'global', 'foreign', 'abroad'],
      'Business': ['business', 'company', 'corporate', 'merger', 'acquisition', 'ceo', 'economy', 'financial'],
      'Startups': ['startup', 'entrepreneur', 'funding', 'venture', 'unicorn', 'ipo'],
      'Sports': ['sport', 'game', 'team', 'player', 'championship', 'olympic', 'cricket', 'football'],
      'Science': ['science', 'research', 'study', 'discovery', 'space', 'nasa', 'climate'],
    };

    // Whole-word matching - a plain substring check would match "ai" inside
    // words like "pair" or names like "Caicedo", miscategorizing unrelated
    // articles as "AI & Tech".
    for (const [category, words] of Object.entries(keywords)) {
      if (words.some((word) => new RegExp(`\\b${word}\\b`).test(text))) {
        return category;
      }
    }

    return 'Business'; // Default category
  }

  /**
   * Map our categories to GNews's fixed category set
   * (general, world, nation, business, technology, entertainment, sports, science, health)
   */
  mapCategoryToGNews(category) {
    const mapping = {
      'India': 'nation',
      'Tech': 'technology',
      'AI': 'technology',
      'Student': 'general',
      'World': 'world',
      'Business': 'business',
      'Startups': 'business',
      'Sports': 'sports',
      'Science': 'science',
    };

    return mapping[category] || 'general';
  }

  /**
   * Map our categories to NewsAPI categories
   */
  mapCategoryToNewsAPI(category) {
    const mapping = {
      'India': 'general',
      'Tech': 'technology',
      'AI': 'technology',
      'Student': 'general',
      'World': 'general',
      'Business': 'business',
      'Startups': 'business',
      'Sports': 'sports',
      'Science': 'science',
    };

    return mapping[category] || 'general';
  }
}

export default new NewsService();
