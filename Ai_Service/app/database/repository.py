"""PostgreSQL Repository for AI News Service Entities.

Executes strongly-typed SQL operations explicitly qualified within the `nuzio_ai`
schema.
"""

import logging
from typing import List, Optional

from app.database.connection import get_db_cursor
from app.database.models import NewsArticle, NewsCluster

logger = logging.getLogger(__name__)


def initialize_database() -> None:
    """Create nuzio_ai schema, news_clusters, and news_articles tables and indexes if they do not exist."""
    ddl_statements = [
        # Ensure nuzio_ai schema exists
        "CREATE SCHEMA IF NOT EXISTS nuzio_ai;",
        # 1. news_clusters table
        """
        CREATE TABLE IF NOT EXISTS nuzio_ai.news_clusters (
            id SERIAL PRIMARY KEY,
            label VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
        # 2. news_articles table
        """
        CREATE TABLE IF NOT EXISTS nuzio_ai.news_articles (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            content TEXT,
            cleaned_content TEXT,
            url TEXT UNIQUE NOT NULL,
            source VARCHAR(100) NOT NULL,
            published_at TIMESTAMPTZ NOT NULL,
            content_hash VARCHAR(64) UNIQUE NOT NULL,
            cluster_id INTEGER REFERENCES nuzio_ai.news_clusters(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
        # Indexes
        "CREATE INDEX IF NOT EXISTS idx_news_articles_url ON nuzio_ai.news_articles(url);",
        "CREATE INDEX IF NOT EXISTS idx_news_articles_content_hash ON nuzio_ai.news_articles(content_hash);",
        "CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON nuzio_ai.news_articles(published_at);",
        "CREATE INDEX IF NOT EXISTS idx_news_articles_source ON nuzio_ai.news_articles(source);",
        "CREATE INDEX IF NOT EXISTS idx_news_articles_cluster_id ON nuzio_ai.news_articles(cluster_id);",
    ]

    with get_db_cursor(commit=True) as cursor:
        for stmt in ddl_statements:
            cursor.execute(stmt)

    logger.info("Database schema and tables initialized in nuzio_ai successfully.")


def article_exists(url: str, content_hash: Optional[str] = None) -> bool:
    """Check if an article already exists by URL or content hash."""
    query = """
        SELECT 1 FROM nuzio_ai.news_articles
        WHERE url = %s OR (%s IS NOT NULL AND content_hash = %s)
        LIMIT 1;
    """
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, (url, content_hash, content_hash))
        return cursor.fetchone() is not None


def insert_article(article: NewsArticle) -> Optional[NewsArticle]:
    """Insert a new article into nuzio_ai.news_articles.

    If an article with the same URL or content_hash exists, returns None (skips insertion).
    """
    query = """
        INSERT INTO nuzio_ai.news_articles (
            title, description, content, cleaned_content, url, source,
            published_at, content_hash, cluster_id, created_at, updated_at
        ) VALUES (
            %(title)s, %(description)s, %(content)s, %(cleaned_content)s, %(url)s, %(source)s,
            %(published_at)s, %(content_hash)s, %(cluster_id)s, NOW(), NOW()
        )
        ON CONFLICT (url) DO NOTHING
        RETURNING *;
    """
    params = {
        "title": article.title,
        "description": article.description,
        "content": article.content,
        "cleaned_content": article.cleaned_content,
        "url": article.url,
        "source": article.source,
        "published_at": article.published_at,
        "content_hash": article.content_hash,
        "cluster_id": article.cluster_id,
    }

    try:
        with get_db_cursor(commit=True) as cursor:
            # Check content_hash conflict before insert to handle multi-column uniqueness gracefully
            cursor.execute(
                "SELECT 1 FROM nuzio_ai.news_articles WHERE content_hash = %s LIMIT 1;",
                (article.content_hash,)
            )
            if cursor.fetchone():
                logger.debug(f"Skipping duplicate article by content hash: {article.title}")
                return None

            cursor.execute(query, params)
            row = cursor.fetchone()
            if row:
                return NewsArticle.from_row(row)
            return None
    except Exception as exc:
        logger.error(f"Error inserting article '{article.title}': {exc}")
        return None


def get_article_by_url(url: str) -> Optional[NewsArticle]:
    """Retrieve an article by its unique canonical URL."""
    query = "SELECT * FROM nuzio_ai.news_articles WHERE url = %s LIMIT 1;"
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, (url,))
        row = cursor.fetchone()
        return NewsArticle.from_row(row) if row else None


def get_article_by_hash(content_hash: str) -> Optional[NewsArticle]:
    """Retrieve an article by its deterministic content SHA-256 hash."""
    query = "SELECT * FROM nuzio_ai.news_articles WHERE content_hash = %s LIMIT 1;"
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, (content_hash,))
        row = cursor.fetchone()
        return NewsArticle.from_row(row) if row else None


def get_article_by_id(article_id: int) -> Optional[NewsArticle]:
    """Retrieve a single article by its primary key ID."""
    query = "SELECT * FROM nuzio_ai.news_articles WHERE id = %s LIMIT 1;"
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, (article_id,))
        row = cursor.fetchone()
        return NewsArticle.from_row(row) if row else None


def get_articles(
    source: Optional[str] = None,
    cluster_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0
) -> List[NewsArticle]:
    """Retrieve news articles with optional source filtering and pagination."""
    conditions = []
    params = []

    if source:
        conditions.append("source ILIKE %s")
        params.append(f"%{source}%")
    if cluster_id is not None:
        conditions.append("cluster_id = %s")
        params.append(cluster_id)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"""
        SELECT * FROM nuzio_ai.news_articles
        {where_clause}
        ORDER BY published_at DESC
        LIMIT %s OFFSET %s;
    """
    params.extend([limit, offset])

    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        return [NewsArticle.from_row(r) for r in rows]


def get_articles_by_ids(article_ids: List[int]) -> List[NewsArticle]:
    """Retrieve the articles with the given IDs (missing IDs are skipped), newest first."""
    if not article_ids:
        return []
    query = """
        SELECT * FROM nuzio_ai.news_articles
        WHERE id = ANY(%s)
        ORDER BY published_at DESC, id ASC;
    """
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, (list(article_ids),))
        rows = cursor.fetchall()
        return [NewsArticle.from_row(r) for r in rows]


def create_cluster(label: str) -> NewsCluster:
    """Create a new topic cluster."""
    query = """
        INSERT INTO nuzio_ai.news_clusters (label, created_at, updated_at)
        VALUES (%s, NOW(), NOW())
        RETURNING *;
    """
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(query, (label,))
        row = cursor.fetchone()
        return NewsCluster.from_row(row)


def update_article_cluster(article_id: int, cluster_id: Optional[int]) -> bool:
    """Assign or remove an article from a topic cluster."""
    query = """
        UPDATE nuzio_ai.news_articles
        SET cluster_id = %s, updated_at = NOW()
        WHERE id = %s;
    """
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(query, (cluster_id, article_id))
        return cursor.rowcount > 0


def get_clusters(limit: int = 100, offset: int = 0) -> List[NewsCluster]:
    """Retrieve all topic clusters ordered by latest update."""
    query = """
        SELECT * FROM nuzio_ai.news_clusters
        ORDER BY updated_at DESC
        LIMIT %s OFFSET %s;
    """
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, (limit, offset))
        rows = cursor.fetchall()
        return [NewsCluster.from_row(r) for r in rows]


def get_cluster_by_id(cluster_id: int) -> Optional[NewsCluster]:
    """Retrieve a topic cluster by ID."""
    query = "SELECT * FROM nuzio_ai.news_clusters WHERE id = %s LIMIT 1;"
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, (cluster_id,))
        row = cursor.fetchone()
        return NewsCluster.from_row(row) if row else None


def get_cluster_articles(cluster_id: int) -> List[NewsArticle]:
    """Retrieve all articles associated with a specific cluster ordered chronologically."""
    query = """
        SELECT * FROM nuzio_ai.news_articles
        WHERE cluster_id = %s
        ORDER BY published_at ASC;
    """
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, (cluster_id,))
        rows = cursor.fetchall()
        return [NewsArticle.from_row(r) for r in rows]


def delete_article_by_id(article_id: int) -> bool:
    """Delete an article by ID (used for test cleanup)."""
    query = "DELETE FROM nuzio_ai.news_articles WHERE id = %s;"
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(query, (article_id,))
        return cursor.rowcount > 0


def delete_cluster_by_id(cluster_id: int) -> bool:
    """Delete a cluster by ID (used for test cleanup)."""
    query = "DELETE FROM nuzio_ai.news_clusters WHERE id = %s;"
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(query, (cluster_id,))
        return cursor.rowcount > 0


def clear_all_clusters() -> None:
    """Reset cluster_id on all articles and delete all existing clusters in nuzio_ai."""
    with get_db_cursor(commit=True) as cursor:
        cursor.execute("UPDATE nuzio_ai.news_articles SET cluster_id = NULL;")
        cursor.execute("DELETE FROM nuzio_ai.news_clusters;")


def clear_clusters_for_articles(article_ids: List[int]) -> None:
    """Scoped counterpart of clear_all_clusters(): detach only the given articles from
    their clusters, then delete the clusters left with no articles.

    Articles and clusters outside this scope are never modified; a cluster that still
    has other member articles is kept. Runs in a single transaction.
    """
    if not article_ids:
        return
    ids = list(article_ids)
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "SELECT DISTINCT cluster_id FROM nuzio_ai.news_articles "
            "WHERE id = ANY(%s) AND cluster_id IS NOT NULL;",
            (ids,),
        )
        old_cluster_ids = [row["cluster_id"] for row in cursor.fetchall()]
        if not old_cluster_ids:
            return

        cursor.execute(
            "UPDATE nuzio_ai.news_articles SET cluster_id = NULL, updated_at = NOW() "
            "WHERE id = ANY(%s);",
            (ids,),
        )
        cursor.execute(
            """
            DELETE FROM nuzio_ai.news_clusters c
            WHERE c.id = ANY(%s)
              AND NOT EXISTS (
                  SELECT 1 FROM nuzio_ai.news_articles a WHERE a.cluster_id = c.id
              );
            """,
            (old_cluster_ids,),
        )


def batch_update_article_clusters(assignments: List[tuple]) -> int:
    """Batch update cluster_id on multiple articles.

    Args:
        assignments: List of (cluster_id, article_id) tuples.
    """
    if not assignments:
        return 0
    query = """
        UPDATE nuzio_ai.news_articles
        SET cluster_id = %s, updated_at = NOW()
        WHERE id = %s;
    """
    with get_db_cursor(commit=True) as cursor:
        cursor.executemany(query, assignments)
        return cursor.rowcount


def get_clusters_summary(limit: int = 100, offset: int = 0) -> List[dict]:
    """Retrieve all topic clusters with calculated article count and latest article publication date."""
    query = """
        SELECT 
            c.id, 
            c.label, 
            COUNT(a.id)::int AS article_count, 
            MAX(a.published_at) AS latest_published_at
        FROM nuzio_ai.news_clusters c
        LEFT JOIN nuzio_ai.news_articles a ON c.id = a.cluster_id
        GROUP BY c.id, c.label
        ORDER BY latest_published_at DESC NULLS LAST, c.updated_at DESC
        LIMIT %s OFFSET %s;
    """
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, (limit, offset))
        return [dict(r) for r in cursor.fetchall()]


def get_timeline_articles(
    source: Optional[str] = None,
    cluster_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> List[dict]:
    """Retrieve timeline articles joined with cluster metadata ordered chronologically descending."""
    conditions = []
    params = []

    if source:
        conditions.append("a.source ILIKE %s")
        params.append(f"%{source}%")
    if cluster_id is not None:
        conditions.append("a.cluster_id = %s")
        params.append(cluster_id)
    if from_date:
        conditions.append("a.published_at >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("a.published_at <= %s")
        params.append(to_date)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"""
        SELECT 
            a.id,
            a.title,
            a.description,
            a.url,
            a.source,
            a.published_at,
            a.cluster_id,
            c.label AS cluster_label
        FROM nuzio_ai.news_articles a
        LEFT JOIN nuzio_ai.news_clusters c ON a.cluster_id = c.id
        {where_clause}
        ORDER BY a.published_at DESC
        LIMIT %s OFFSET %s;
    """
    params.extend([limit, offset])

    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, tuple(params))
        return [dict(r) for r in cursor.fetchall()]


