import { eq, inArray, count } from 'drizzle-orm';
import db from '../config/database.js';
import { users, userListenHistory, newsSources } from '../db/schema.js';
import newsService from './news.service.js';

// Which categories are most relevant to a given profession. Used as a
// ranking signal, not a hard filter - a Finance user still sees AI stories
// if they picked "AI & Tech" as an interest, just weighted less than Markets.
const PROFESSION_TOPICS = {
  'Technology': ['AI & Tech', 'Startups', 'Business'],
  'Founder / Builder': ['Startups', 'AI & Tech', 'Markets', 'Business'],
  'Student': ['AI & Tech', 'Science', 'India'],
  'Finance': ['Markets', 'Business', 'AI & Tech'],
  'Marketing': ['Business', 'Startups', 'AI & Tech'],
  'Healthcare': ['Science', 'India'],
  'Engineering': ['AI & Tech', 'Science', 'Business'],
};

const RELATED_CATEGORIES = {
  'AI & Tech': ['Startups', 'Science'],
  'Markets': ['Business'],
  'Startups': ['Business', 'AI & Tech'],
  'Science': ['AI & Tech'],
  'Geopolitics': ['Business', 'Markets', 'India'],
  'Business': ['Markets', 'Startups'],
  'India': ['Geopolitics', 'Business'],
  'Sports': [],
};

export class PersonalizationService {
  /**
   * Score, sort, and return a merged (English + Hindi) news pool for a
   * user, optionally scoped to one category.
   */
  async getPersonalizedNews(userId, category) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { interests: true },
    });

    const interestCategories = user?.interests.map((i) => i.category) || [];

    const [enNews, hiNews] = await Promise.all([
      category && category !== 'All'
        ? newsService.fetchNewsByCategory(category, 'en')
        : newsService.fetchLatestNews('en'),
      category && category !== 'All'
        ? newsService.fetchNewsByCategory(category, 'hi')
        : newsService.fetchLatestNews('hi'),
    ]);
    const candidateNews = [...enNews, ...hiNews];

    if (interestCategories.length === 0 && !user?.profession) {
      return candidateNews.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    }

    return await this.scoreAndSort(candidateNews, user);
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
    const [enNews, hiNews] = await Promise.all([
      newsService.fetchLatestNews('en'),
      newsService.fetchLatestNews('hi'),
    ]);
    const candidateNews = [...enNews, ...hiNews];

    const ranked = user?.interests.length || user?.profession
      ? await this.scoreAndSort(candidateNews, user)
      : candidateNews.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

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

    const scored = candidateNews.map((article) => ({
      ...article,
      score: this.calculateArticleScore(article, {
        interestCategories,
        professionTopics,
        listenedArticleIds,
        skippedArticleIds,
        categoryListenCounts,
        categorySkipCounts,
        sourceCount: sourceCounts.get(article.id) || 0,
      }),
    }));

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
