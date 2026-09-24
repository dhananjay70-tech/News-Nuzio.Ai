"""Orchestration Pipeline for News Ingestion and Topic Clustering.

Coordinates:
RSS Fetching -> Normalization -> Deduplication -> Page Extraction ->
Text Cleaning -> Database Storage -> TF-IDF Clustering -> Cluster Persistence.
"""

import logging
from dataclasses import dataclass
from typing import Callable, Optional

from app.clustering.cluster import recluster_and_persist
from app.config import settings
from app.database.models import NewsArticle
from app.database.repository import (
    article_exists,
    initialize_database,
    insert_article,
)
from app.extraction.article_extractor import extract_article
from app.feeds.parser import fetch_all_feeds
from app.feeds.sources import RSS_SOURCES
from app.processing.cleaner import prepare_article_text
from app.processing.deduplicator import canonicalize_url, generate_content_hash

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    """Execution summary metrics for an ingestion run."""
    articles_fetched: int
    articles_inserted: int
    articles_skipped: int
    clusters_created: int
    error: Optional[str] = None


def run_full_ingestion(
    max_items_per_feed: Optional[int] = None,
    progress_callback: Optional[Callable[[str], None]] = None
) -> PipelineResult:
    """Execute the end-to-end ingestion and clustering workflow.

    Args:
        max_items_per_feed: Maximum entries to pull per RSS feed.
        progress_callback: Optional callback for status notifications.

    Returns:
        PipelineResult summary of the execution.
    """
    if max_items_per_feed is None:
        max_items_per_feed = settings.MAX_ARTICLES_PER_FEED

    def notify(msg: str):
        logger.info(msg)
        if progress_callback:
            try:
                progress_callback(msg)
            except Exception as e:
                logger.debug(f"Progress callback error: {e}")

    try:
        # Step 0: Ensure database schema is ready
        notify("Initializing database schema if needed...")
        initialize_database()

        # Step 1 & 2: Fetch and normalize RSS items
        notify(f"Fetching RSS feeds from {len(RSS_SOURCES)} sources...")
        raw_items = fetch_all_feeds(
            sources=RSS_SOURCES,
            max_items_per_feed=max_items_per_feed,
            timeout=settings.HTTP_TIMEOUT
        )
        total_fetched = len(raw_items)
        notify(f"Fetched {total_fetched} normalized feed entries.")

        if total_fetched == 0:
            return PipelineResult(
                articles_fetched=0,
                articles_inserted=0,
                articles_skipped=0,
                clusters_created=0,
                error="No articles found in configured RSS feeds."
            )

        # Step 3 to 7: Extract, Clean, Deduplicate, and Store
        inserted_count = 0
        skipped_count = 0

        notify("Extracting webpage text and storing new articles...")
        for item in raw_items:
            canonical_url = canonicalize_url(item.url)

            # Quick check if URL already exists
            if article_exists(canonical_url):
                skipped_count += 1
                continue

            # Extract full webpage content with fallback
            extraction_res = extract_article(
                url=canonical_url,
                fallback_text=item.description,
                min_length=settings.MIN_ARTICLE_CONTENT_LENGTH
            )

            article_body = extraction_res.content or ""
            cleaned_text = prepare_article_text(
                title=item.title,
                description=item.description,
                content=article_body
            )

            content_hash = generate_content_hash(
                title=item.title,
                cleaned_content=cleaned_text,
                canonical_url=canonical_url
            )

            # Check if identical content hash exists
            if article_exists(canonical_url, content_hash=content_hash):
                skipped_count += 1
                continue

            article_model = NewsArticle(
                title=item.title,
                description=item.description,
                content=article_body,
                cleaned_content=cleaned_text,
                url=canonical_url,
                source=item.source,
                published_at=item.published_at,
                content_hash=content_hash,
            )

            stored = insert_article(article_model)
            if stored:
                inserted_count += 1
            else:
                skipped_count += 1

        notify(f"Storage complete. Inserted: {inserted_count}, Skipped: {skipped_count}.")

        # Step 8 & 9: Run clustering & persist assignments
        notify("Executing TF-IDF topic clustering and cluster labeling...")
        clusters = recluster_and_persist(threshold=settings.CLUSTER_SIMILARITY_THRESHOLD)
        clusters_count = len(clusters)
        notify(f"Clustering complete. Generated {clusters_count} topic clusters.")

        return PipelineResult(
            articles_fetched=total_fetched,
            articles_inserted=inserted_count,
            articles_skipped=skipped_count,
            clusters_created=clusters_count,
            error=None
        )

    except Exception as exc:
        err_msg = f"Ingestion pipeline failed: {exc}"
        logger.error(err_msg, exc_info=True)
        return PipelineResult(
            articles_fetched=0,
            articles_inserted=0,
            articles_skipped=0,
            clusters_created=0,
            error=err_msg
        )
