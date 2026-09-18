import { eq, and, ne, inArray, count, desc } from 'drizzle-orm';
import db from '../config/database.js';
import { users, userListenHistory, newsSources, newsArticles, hiddenArticles } from '../db/schema.js';
import newsService from './news.service.js';

// Which categories are most relevant to a given profession. Used as a
// ranking signal, not a hard filter - a Finance user still sees AI stories
// if they picked "AI" or "Tech" as an interest, just weighted less than
// Business. Category values must match the canonical set produced by
// news.service.js#categorizeArticle (Tech, AI, Student, India, World,
// Business, Startups, Sports, Science) - otherwise these bonuses never fire.
const PROFESSION_TOPICS = {
  'Technology': ['Tech', 'AI', 'Startups', 'Business'],
  'Founder / Builder': ['Startups', 'Tech', 'AI', 'Business'],
  'Student': ['Student', 'Tech', 'AI', 'Science', 'India'],
  'Finance': ['Business', 'Tech', 'AI'],
  'Marketing': ['Business', 'Startups', 'Tech', 'AI'],
  'Healthcare': ['Science', 'India'],
  'Engineering': ['Tech', 'AI', 'Science', 'Business'],
};

const RELATED_CATEGORIES = {
  'Tech': ['AI', 'Startups', 'Science'],
  'AI': ['Tech', 'Startups', 'Science'],
  'Student': ['AI', 'Tech', 'Science'],
  'India': ['World', 'Business'],
  'World': ['Business', 'India'],
  'Business': ['Startups', 'World'],
  'Startups': ['Business', 'Tech', 'AI'],
  'Sports': [],
  'Science': ['AI', 'Tech'],
};

export class PersonalizationService {
  /**
   * Score, sort, and return a news pool for a user, optionally scoped to
   * one category. When `language` is given, only that language's pool is
   * fetched (so category + language + personalization apply together in
   * one pass); omitted, both English and Hindi are merged as before.
   */
  async getPersonalizedNews(userId, category, language) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { interests: true },
    });

    const interestCategories = user?.interests.map((i) => i.category) || [];

    let candidateNews;
    if (language) {
      candidateNews =
        category && category !== 'All'
          ? await newsService.fetchNewsByCategory(category, language)
          : await newsService.fetchLatestNews(language);
    } else {
      const [enNews, hiNews] = await Promise.all([
        category && category !== 'All'
          ? newsService.fetchNewsByCategory(category, 'en')
          : newsService.fetchLatestNews('en'),
        category && category !== 'All'
          ? newsService.fetchNewsByCategory(category, 'hi')
          : newsService.fetchLatestNews('hi'),
      ]);
      candidateNews = [...enNews, ...hiNews];
    }

    const hiddenIds = await this.getHiddenIds(userId);
    candidateNews = candidateNews.filter((a) => !hiddenIds.has(a.id));

    if (interestCategories.length === 0 && !user?.profession) {
      return candidateNews
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .map((article) => ({ ...article, labels: [] }));
    }

    return await this.scoreAndSort(candidateNews, user);
  }

  /**
   * Article ids a user has explicitly hidden ("Not interested"), so they
   * can be filtered out of personalized/briefing results.
   */
  async getHiddenIds(userId) {
    const rows = await db.query.hiddenArticles.findMany({
      where: eq(hiddenArticles.userId, userId),
      columns: { articleId: true },
    });
    return new Set(rows.map((r) => r.articleId));
  }

  /**
   * Generate a full "daily briefing": a scored/sorted, deduplicated set of
   * stories sized to the user's briefing length (by estimated narration
   * time, not just story count), across both languages.
   */
  async generatePersonalizedBriefing(userId) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { interests: true },
    });

    const briefingLength = user?.briefingLength || 10;
    const [enNews, hiNews, hiddenIds] = await Promise.all([
      newsService.fetchLatestNews('en'),
      newsService.fetchLatestNews('hi'),
      this.getHiddenIds(userId),
    ]);
    const candidateNews = [...enNews, ...hiNews].filter((a) => !hiddenIds.has(a.id));

    const ranked = user?.interests.length || user?.profession
      ? await this.scoreAndSort(candidateNews, user)
      : candidateNews
          .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
          .map((article) => ({ ...article, labels: [] }));

    const stories = this.selectStoriesForDuration(ranked, briefingLength);
    const estimatedSeconds = stories.reduce((sum, s) => sum + (s.duration || 180), 0);

    return {
      briefingLength,
      storyCount: stories.length,
      estimatedMinutes: Math.max(1, Math.round(estimatedSeconds / 60)),
      stories,
    };
  }

  /**
   * Pick as many top-ranked stories as fit the user's briefing length,
   * using each story's estimated narration duration rather than a flat
   * count - a 5-minute briefing of long stories gets fewer of them than a
   * 5-minute briefing of short ones.
   */
  selectStoriesForDuration(rankedArticles, briefingLength) {
    const targetSeconds = briefingLength * 60;
    // Hard ceiling so a run of unusually long articles can't blow the
    // briefing wildly past what was asked for just to hit the story-count
    // floor - a slightly shorter briefing beats a "10-minute" one that
    // actually runs 25.
    const overshootCeiling = targetSeconds * 1.8;
    const [minCount, maxCount] = briefingLength <= 5 ? [4, 6] : briefingLength <= 10 ? [7, 10] : [10, 15];

    const selected = [];
    let totalSeconds = 0;

    for (const article of rankedArticles) {
      if (selected.length >= maxCount) break;
      if (selected.length >= minCount && totalSeconds >= targetSeconds) break;
      const duration = article.duration || 180;
      if (selected.length > 0 && totalSeconds + duration > overshootCeiling) break;
      selected.push(article);
      totalSeconds += duration;
    }

    return selected;
  }

  /**
   * Apply the full scoring formula, factoring in interests, profession,
   * India relevance, freshness, multi-source ("trending") coverage, and the
   * user's own listening behavior - then break up same-category clustering
   * so the result doesn't read as 10 AI stories in a row.
   */
  async scoreAndSort(candidateNews, user) {
    const interestCategories = user?.interests.map((i) => i.category) || [];
    const professionTopics = PROFESSION_TOPICS[user?.profession] || [];

    const [history, sourceCounts] = await Promise.all([
      db.query.userListenHistory.findMany({
        where: eq(userListenHistory.userId, user.id),
        with: { article: { columns: { category: true } } },
      }),
      this.getSourceCounts(candidateNews.map((a) => a.id)),
    ]);

    const listenedArticleIds = new Set(history.map((h) => h.articleId));
    const skippedArticleIds = new Set(history.filter((h) => h.skipped).map((h) => h.articleId));

    const categoryListenCounts = {};
    const categorySkipCounts = {};
    for (const h of history) {
      const cat = h.article?.category;
      if (!cat) continue;
      if (h.skipped) categorySkipCounts[cat] = (categorySkipCounts[cat] || 0) + 1;
      else categoryListenCounts[cat] = (categoryListenCounts[cat] || 0) + 1;
    }

    const scored = candidateNews.map((article) => {
      const ctx = {
        interestCategories,
        professionTopics,
        listenedArticleIds,
        skippedArticleIds,
        categoryListenCounts,
        categorySkipCounts,
        sourceCount: sourceCounts.get(article.id) || 0,
      };
      return {
        ...article,
        score: this.calculateArticleScore(article, ctx),
        labels: this.deriveLabels(article, ctx),
      };
    });

    scored.sort((a, b) => b.score - a.score);

    // Duplicate-topic penalty: escalating cost for each additional story in
    // the same category so the final order doesn't cluster on one topic.
    const seenCategories = new Map();
    for (const item of scored) {
      const count = seenCategories.get(item.category) || 0;
      if (count > 0) item.score -= 5 * count;
      seenCategories.set(item.category, count + 1);
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map(({ score, ...article }) => article);
  }

  /**
   * Simple scoring algorithm:
   * +10 exact interest match
   * +6  profession relevance
   * +5  India relevance
   * +5  freshness (published in the last 6h), +2 if within 24h
   * +3  trending (covered by more than one source)
   * -3  already listened to this exact article
   * -2  already skipped this exact article
   * plus a soft category-affinity adjustment from listening behavior
   */
  calculateArticleScore(article, ctx) {
    let score = 0;

    if (ctx.interestCategories.includes(article.category)) {
      score += 10;
    } else if (this.getRelatedCategories(article.category).some((c) => ctx.interestCategories.includes(c))) {
      score += 4; // related-interest match, softer than an exact hit
    }

    if (ctx.professionTopics.includes(article.category)) {
      score += 6;
    }

    if (article.category === 'India') {
      score += 5;
    }

    const hoursSincePublish = (Date.now() - new Date(article.publishedAt)) / (1000 * 60 * 60);
    if (hoursSincePublish < 6) score += 5;
    else if (hoursSincePublish < 24) score += 2;

    if (ctx.sourceCount > 1) {
      score += 3; // multiple outlets covering the same story - trending
    }

    if (ctx.listenedArticleIds.has(article.id)) score -= 3;
    if (ctx.skippedArticleIds.has(article.id)) score -= 2;

    // Behavioral category affinity: repeatedly listening to a category
    // nudges it up; repeatedly skipping nudges it down. Capped so it can
    // never outweigh an explicit interest selection.
    const listens = ctx.categoryListenCounts[article.category] || 0;
    const skips = ctx.categorySkipCounts[article.category] || 0;
    if (listens >= 2) score += Math.min(4, listens);
    if (skips >= 2) score -= Math.min(4, skips);

    return score;
  }

  /**
   * Real, non-arbitrary badges derived from the same signals
   * calculateArticleScore uses - no invented scores, per spec.
   */
  deriveLabels(article, ctx) {
    const labels = [];
    const hoursSincePublish = (Date.now() - new Date(article.publishedAt)) / (1000 * 60 * 60);

    if (hoursSincePublish < 1) labels.push('Breaking');
    if (ctx.sourceCount > 1) labels.push('Trending');
    if (ctx.interestCategories.includes(article.category)) labels.push('Personalized');
    if (ctx.professionTopics.includes(article.category) || article.category === 'India') labels.push('Important');

    return labels;
  }

  /**
   * Human-readable reason a story was recommended, built from the same
   * signals as calculateArticleScore - powers "Why am I seeing this?".
   */
  async explainRecommendation(userId, article) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { interests: true },
    });
    if (!user) return 'Selected for your daily feed.';

    const interestCategories = user.interests.map((i) => i.category);
    const professionTopics = PROFESSION_TOPICS[user.profession] || [];
    const sourceCounts = await this.getSourceCounts([article.id]);
    const sourceCount = sourceCounts.get(article.id) || 0;
    const hoursSincePublish = (Date.now() - new Date(article.publishedAt)) / (1000 * 60 * 60);

    if (interestCategories.includes(article.category)) {
      return `Recommended because you follow ${article.category}.`;
    }
    if (this.getRelatedCategories(article.category).some((c) => interestCategories.includes(c))) {
      return `Recommended because it's related to topics you follow.`;
    }
    if (professionTopics.includes(article.category)) {
      return `Recommended based on your profession (${user.profession}).`;
    }
    if (article.category === 'India') {
      return 'Recommended because it covers India.';
    }
    if (sourceCount > 1) {
      return `Recommended because it's trending, covered by ${sourceCount + 1} sources.`;
    }
    if (hoursSincePublish < 6) {
      return 'Recommended because it just broke.';
    }
    return 'Recommended to help you discover stories outside your usual interests.';
  }

  /**
   * Other stories in the same category/language, most recent first.
   */
  async getRelatedArticles(articleId, limit = 5) {
    const article = await db.query.newsArticles.findFirst({ where: eq(newsArticles.id, articleId) });
    if (!article) return [];

    return await db.query.newsArticles.findMany({
      where: and(
        eq(newsArticles.category, article.category),
        eq(newsArticles.language, article.language),
        ne(newsArticles.id, articleId)
      ),
      orderBy: [desc(newsArticles.publishedAt)],
      limit,
    });
  }

  /**
   * Most-listened articles (by listen-history row count) in a language.
   */
  async getMostListenedArticles(language, limit = 10) {
    const listens = count();
    const rows = await db
      .select({ articleId: userListenHistory.articleId, listens })
      .from(userListenHistory)
      .groupBy(userListenHistory.articleId)
      .orderBy(desc(listens))
      .limit(limit * 3); // overfetch - the final language filter happens after the join below

    if (rows.length === 0) return [];

    const listenCounts = new Map(rows.map((r) => [r.articleId, r.listens]));
    const articles = await db.query.newsArticles.findMany({
      where: and(inArray(newsArticles.id, [...listenCounts.keys()]), eq(newsArticles.language, language)),
    });

    return articles
      .map((a) => ({ ...a, listenCount: listenCounts.get(a.id) || 0 }))
      .sort((a, b) => b.listenCount - a.listenCount)
      .slice(0, limit);
  }

  /**
   * Count how many NewsSource rows (other outlets covering the same story)
   * each article has, in one batched query.
   */
  async getSourceCounts(articleIds) {
    if (articleIds.length === 0) return new Map();
    const counts = await db
      .select({ articleId: newsSources.articleId, count: count() })
      .from(newsSources)
      .where(inArray(newsSources.articleId, articleIds))
      .groupBy(newsSources.articleId);
    return new Map(counts.map((c) => [c.articleId, c.count]));
  }

  /**
   * Get related categories for a given category (softer, secondary match).
   */
  getRelatedCategories(category) {
    return RELATED_CATEGORIES[category] || [];
  }
}

export default new PersonalizationService();
