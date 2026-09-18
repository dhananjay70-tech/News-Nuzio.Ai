import { createId } from '@paralleldrive/cuid2';
import {
  pgSchema,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Table/column names match the existing Supabase schema exactly (created by
// Prisma, which always quotes identifiers) - table names are PascalCase,
// field names are camelCase, with no snake_case conversion anywhere.
//
// All tables live in the `nuzio_ai` Postgres schema (not `public`) - this is
// the same schema Prisma's DATABASE_URL `?schema=nuzio_ai` param pointed at.
// Tables are fully qualified via pgSchema rather than relying on the
// connection's search_path, since Supabase's pooled connection (pgbouncer
// transaction mode) can hand a query to a different backend session that
// wouldn't have picked up a session-level search_path.
export const nuzioAiSchema = pgSchema('nuzio_ai');

export const users = nuzioAiSchema.table(
  'User',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    avatarUrl: text('avatarUrl'),
    profession: text('profession'),
    preferredVoice: text('preferredVoice'),
    briefingLength: integer('briefingLength').default(10),
    createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).notNull().defaultNow(),
    // No DB-level default for updatedAt (matches the existing live schema) -
    // Prisma's @updatedAt was applied client-side on every write, so the app
    // must set it explicitly on every insert/update to this table.
    updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' }).notNull(),
    passwordHash: text('passwordHash').notNull(),
    language: text('language').notNull().default('en'),
  },
  (table) => [index('User_email_idx').on(table.email)]
);

export const userInterests = nuzioAiSchema.table(
  'UserInterest',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
  },
  (table) => [
    uniqueIndex('UserInterest_userId_category_key').on(table.userId, table.category),
    index('UserInterest_userId_idx').on(table.userId),
  ]
);

export const newsArticles = nuzioAiSchema.table(
  'NewsArticle',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    title: text('title').notNull(),
    description: text('description'),
    content: text('content'),
    url: text('url').unique(),
    source: text('source').notNull(),
    imageUrl: text('imageUrl'),
    category: text('category').notNull(),
    publishedAt: timestamp('publishedAt', { precision: 3, mode: 'date' }).notNull().defaultNow(),
    audioUrl: text('audioUrl'),
    duration: integer('duration').default(180),
    createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).notNull().defaultNow(),
    language: text('language').notNull().default('en'),
    summary: text('summary'),
    whyItMatters: text('whyItMatters'),
  },
  (table) => [
    index('NewsArticle_category_idx').on(table.category),
    index('NewsArticle_publishedAt_idx').on(table.publishedAt),
    index('NewsArticle_language_idx').on(table.language),
  ]
);

export const newsSources = nuzioAiSchema.table(
  'NewsSource',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    articleId: text('articleId').notNull().references(() => newsArticles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url'),
    publishedAt: timestamp('publishedAt', { precision: 3, mode: 'date' }).notNull().defaultNow(),
    createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('NewsSource_articleId_idx').on(table.articleId)]
);

export const audioAssets = nuzioAiSchema.table(
  'AudioAsset',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    articleId: text('articleId').notNull().references(() => newsArticles.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    voice: text('voice').notNull(),
    audioUrl: text('audioUrl').notNull(),
    duration: integer('duration'),
    createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('AudioAsset_articleId_language_voice_key').on(table.articleId, table.language, table.voice),
    index('AudioAsset_articleId_idx').on(table.articleId),
  ]
);

export const userListenHistory = nuzioAiSchema.table(
  'UserListenHistory',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    articleId: text('articleId').notNull().references(() => newsArticles.id, { onDelete: 'cascade' }),
    progress: integer('progress').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    listenedAt: timestamp('listenedAt', { precision: 3, mode: 'date' }).notNull().defaultNow(),
    skipped: boolean('skipped').notNull().default(false),
    startedAt: timestamp('startedAt', { precision: 3, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('UserListenHistory_userId_articleId_key').on(table.userId, table.articleId),
    index('UserListenHistory_userId_idx').on(table.userId),
    index('UserListenHistory_articleId_idx').on(table.articleId),
  ]
);

export const savedArticles = nuzioAiSchema.table(
  'SavedArticle',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    articleId: text('articleId').notNull().references(() => newsArticles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('SavedArticle_userId_articleId_key').on(table.userId, table.articleId),
    index('SavedArticle_userId_idx').on(table.userId),
  ]
);

// --- Relations (power the `db.query.*` relational API, Drizzle's
// equivalent of Prisma's `include`) ---

export const usersRelations = relations(users, ({ many }) => ({
  interests: many(userInterests),
  listenHistory: many(userListenHistory),
  savedArticles: many(savedArticles),
}));

export const userInterestsRelations = relations(userInterests, ({ one }) => ({
  user: one(users, { fields: [userInterests.userId], references: [users.id] }),
}));

export const newsArticlesRelations = relations(newsArticles, ({ many }) => ({
  audioAssets: many(audioAssets),
  sources: many(newsSources),
  savedBy: many(savedArticles),
  listenHistory: many(userListenHistory),
}));

export const newsSourcesRelations = relations(newsSources, ({ one }) => ({
  article: one(newsArticles, { fields: [newsSources.articleId], references: [newsArticles.id] }),
}));

export const audioAssetsRelations = relations(audioAssets, ({ one }) => ({
  article: one(newsArticles, { fields: [audioAssets.articleId], references: [newsArticles.id] }),
}));

export const userListenHistoryRelations = relations(userListenHistory, ({ one }) => ({
  user: one(users, { fields: [userListenHistory.userId], references: [users.id] }),
  article: one(newsArticles, { fields: [userListenHistory.articleId], references: [newsArticles.id] }),
}));

export const savedArticlesRelations = relations(savedArticles, ({ one }) => ({
  user: one(users, { fields: [savedArticles.userId], references: [users.id] }),
  article: one(newsArticles, { fields: [savedArticles.articleId], references: [newsArticles.id] }),
}));
