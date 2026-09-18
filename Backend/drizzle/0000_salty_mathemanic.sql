CREATE SCHEMA "nuzio_ai";
--> statement-breakpoint
CREATE TABLE "nuzio_ai"."AudioAsset" (
	"id" text PRIMARY KEY NOT NULL,
	"articleId" text NOT NULL,
	"language" text NOT NULL,
	"voice" text NOT NULL,
	"audioUrl" text NOT NULL,
	"duration" integer,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nuzio_ai"."HiddenArticle" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"articleId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nuzio_ai"."NewsArticle" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" text,
	"url" text,
	"source" text NOT NULL,
	"imageUrl" text,
	"category" text NOT NULL,
	"publishedAt" timestamp (3) DEFAULT now() NOT NULL,
	"audioUrl" text,
	"duration" integer DEFAULT 180,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"summary" text,
	"whyItMatters" text,
	CONSTRAINT "NewsArticle_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "nuzio_ai"."NewsSource" (
	"id" text PRIMARY KEY NOT NULL,
	"articleId" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"publishedAt" timestamp (3) DEFAULT now() NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nuzio_ai"."SavedArticle" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"articleId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nuzio_ai"."SearchHistory" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"query" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nuzio_ai"."UserInterest" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"category" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nuzio_ai"."UserListenHistory" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"articleId" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"listenedAt" timestamp (3) DEFAULT now() NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"startedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nuzio_ai"."User" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatarUrl" text,
	"profession" text,
	"preferredVoice" text,
	"briefingLength" integer DEFAULT 10,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"passwordHash" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "nuzio_ai"."AudioAsset" ADD CONSTRAINT "AudioAsset_articleId_NewsArticle_id_fk" FOREIGN KEY ("articleId") REFERENCES "nuzio_ai"."NewsArticle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nuzio_ai"."HiddenArticle" ADD CONSTRAINT "HiddenArticle_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "nuzio_ai"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nuzio_ai"."HiddenArticle" ADD CONSTRAINT "HiddenArticle_articleId_NewsArticle_id_fk" FOREIGN KEY ("articleId") REFERENCES "nuzio_ai"."NewsArticle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nuzio_ai"."NewsSource" ADD CONSTRAINT "NewsSource_articleId_NewsArticle_id_fk" FOREIGN KEY ("articleId") REFERENCES "nuzio_ai"."NewsArticle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nuzio_ai"."SavedArticle" ADD CONSTRAINT "SavedArticle_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "nuzio_ai"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nuzio_ai"."SavedArticle" ADD CONSTRAINT "SavedArticle_articleId_NewsArticle_id_fk" FOREIGN KEY ("articleId") REFERENCES "nuzio_ai"."NewsArticle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nuzio_ai"."SearchHistory" ADD CONSTRAINT "SearchHistory_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "nuzio_ai"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nuzio_ai"."UserInterest" ADD CONSTRAINT "UserInterest_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "nuzio_ai"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nuzio_ai"."UserListenHistory" ADD CONSTRAINT "UserListenHistory_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "nuzio_ai"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nuzio_ai"."UserListenHistory" ADD CONSTRAINT "UserListenHistory_articleId_NewsArticle_id_fk" FOREIGN KEY ("articleId") REFERENCES "nuzio_ai"."NewsArticle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "AudioAsset_articleId_language_voice_key" ON "nuzio_ai"."AudioAsset" USING btree ("articleId","language","voice");--> statement-breakpoint
CREATE INDEX "AudioAsset_articleId_idx" ON "nuzio_ai"."AudioAsset" USING btree ("articleId");--> statement-breakpoint
CREATE UNIQUE INDEX "HiddenArticle_userId_articleId_key" ON "nuzio_ai"."HiddenArticle" USING btree ("userId","articleId");--> statement-breakpoint
CREATE INDEX "HiddenArticle_userId_idx" ON "nuzio_ai"."HiddenArticle" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "NewsArticle_category_idx" ON "nuzio_ai"."NewsArticle" USING btree ("category");--> statement-breakpoint
CREATE INDEX "NewsArticle_publishedAt_idx" ON "nuzio_ai"."NewsArticle" USING btree ("publishedAt");--> statement-breakpoint
CREATE INDEX "NewsArticle_language_idx" ON "nuzio_ai"."NewsArticle" USING btree ("language");--> statement-breakpoint
CREATE INDEX "NewsSource_articleId_idx" ON "nuzio_ai"."NewsSource" USING btree ("articleId");--> statement-breakpoint
CREATE UNIQUE INDEX "SavedArticle_userId_articleId_key" ON "nuzio_ai"."SavedArticle" USING btree ("userId","articleId");--> statement-breakpoint
CREATE INDEX "SavedArticle_userId_idx" ON "nuzio_ai"."SavedArticle" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "SearchHistory_userId_idx" ON "nuzio_ai"."SearchHistory" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "SearchHistory_userId_createdAt_idx" ON "nuzio_ai"."SearchHistory" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "UserInterest_userId_category_key" ON "nuzio_ai"."UserInterest" USING btree ("userId","category");--> statement-breakpoint
CREATE INDEX "UserInterest_userId_idx" ON "nuzio_ai"."UserInterest" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "UserListenHistory_userId_articleId_key" ON "nuzio_ai"."UserListenHistory" USING btree ("userId","articleId");--> statement-breakpoint
CREATE INDEX "UserListenHistory_userId_idx" ON "nuzio_ai"."UserListenHistory" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "UserListenHistory_articleId_idx" ON "nuzio_ai"."UserListenHistory" USING btree ("articleId");--> statement-breakpoint
CREATE INDEX "User_email_idx" ON "nuzio_ai"."User" USING btree ("email");