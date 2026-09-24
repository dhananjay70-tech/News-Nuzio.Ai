"""Test script for Phase 3: PostgreSQL, Repository, Text Cleaning, and Deduplication."""

import logging
import sys
from datetime import datetime, timezone

from app.database.connection import get_db_connection, get_db_cursor
from app.database.models import NewsArticle, NewsCluster
from app.database.repository import (
    article_exists,
    create_cluster,
    delete_article_by_id,
    delete_cluster_by_id,
    get_article_by_hash,
    get_article_by_url,
    get_cluster_articles,
    get_cluster_by_id,
    initialize_database,
    insert_article,
    update_article_cluster,
)
from app.processing.cleaner import clean_text, prepare_article_text
from app.processing.deduplicator import canonicalize_url, generate_content_hash

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("Phase3Test")


def main():
    print("=" * 65)
    print("NUZIO AI - PHASE 3: DATABASE & DEDUPLICATION TEST")
    print("=" * 65)

    # 1. Database connection
    print("\n1. Testing PostgreSQL Database Connection...")
    conn = get_db_connection()
    assert conn is not None, "Failed to obtain DB connection"
    conn.close()
    print(" -> Connection successful.")

    # 2. Database initialization
    print("\n2. Initializing Database Schema (nuzio_ai)...")
    initialize_database()
    print(" -> initialize_database() executed.")

    # 3 & 4. Verify tables exist in nuzio_ai
    print("\n3 & 4. Verifying new tables exist in nuzio_ai schema...")
    with get_db_cursor(commit=False) as cursor:
        cursor.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'nuzio_ai' AND table_name IN ('news_clusters', 'news_articles');
        """)
        tables = [row["table_name"] for row in cursor.fetchall()]
        print(f" -> Found tables in nuzio_ai: {tables}")
        assert "news_clusters" in tables, "nuzio_ai.news_clusters table missing"
        assert "news_articles" in tables, "nuzio_ai.news_articles table missing"

    # Text cleaning & hashing test
    raw_title = "  Breaking:   <b>OpenAI</b> Releases GPT-5 with Enhanced Reasoning!   "
    raw_desc = "OpenAI has officially launched its newest model..."
    raw_content = "<p>Today in San Francisco, OpenAI revealed GPT-5...</p>"
    cleaned = prepare_article_text(raw_title, raw_desc, raw_content)
    test_url = "https://example.com/news/openai-gpt5?utm_source=twitter&utm_medium=social"
    canonical_url = canonicalize_url(test_url)
    content_hash = generate_content_hash(raw_title, cleaned, canonical_url)

    print(f"\nText Cleaning & Hashing verification:")
    print(f" -> Canonical URL: {canonical_url}")
    print(f" -> Cleaned Text preview: {cleaned[:100]}...")
    print(f" -> Deterministic Content Hash: {content_hash}")

    # 5. Insert test article
    print("\n5. Inserting test article...")
    test_article = NewsArticle(
        title="Breaking: OpenAI Releases GPT-5 with Enhanced Reasoning!",
        description=raw_desc,
        content=raw_content,
        cleaned_content=cleaned,
        url=canonical_url,
        source="TechNews",
        published_at=datetime.now(timezone.utc),
        content_hash=content_hash,
    )
    inserted = insert_article(test_article)
    assert inserted is not None, "Failed to insert test article"
    assert inserted.id is not None, "Inserted article missing ID"
    print(f" -> Inserted article ID: {inserted.id}")

    # 6. Retrieve by URL
    print("\n6. Retrieving article by URL...")
    by_url = get_article_by_url(canonical_url)
    assert by_url is not None, "Could not find article by URL"
    assert by_url.id == inserted.id, "ID mismatch on retrieval by URL"
    print(f" -> Retrieved article: '{by_url.title}' (ID: {by_url.id})")

    # 7. Retrieve by Content Hash
    print("\n7. Retrieving article by Content Hash...")
    by_hash = get_article_by_hash(content_hash)
    assert by_hash is not None, "Could not find article by content hash"
    assert by_hash.id == inserted.id, "ID mismatch on retrieval by hash"
    print(f" -> Retrieved article: '{by_hash.title}' (ID: {by_hash.id})")

    # 8. Verify duplicate URL is rejected/ignored
    print("\n8. Testing duplicate URL rejection...")
    dup_url_article = NewsArticle(
        title="Different Title Same URL",
        description="Some summary",
        content="Different content",
        cleaned_content="Different content",
        url=canonical_url,  # Same URL
        source="TechNews",
        published_at=datetime.now(timezone.utc),
        content_hash="different_hash_1234567890abcdef",
    )
    res_dup_url = insert_article(dup_url_article)
    assert res_dup_url is None, "Duplicate URL was not ignored!"
    print(" -> Duplicate URL correctly rejected (returns None without exception).")

    # 9. Verify duplicate content hash is rejected/ignored
    print("\n9. Testing duplicate Content Hash rejection...")
    dup_hash_article = NewsArticle(
        title="Same Content Different URL",
        description="Some summary",
        content="Different content",
        cleaned_content="Different content",
        url="https://example.com/another-url-entirely",  # Different URL
        source="TechNews",
        published_at=datetime.now(timezone.utc),
        content_hash=content_hash,  # Same content hash
    )
    res_dup_hash = insert_article(dup_hash_article)
    assert res_dup_hash is None, "Duplicate content hash was not ignored!"
    print(" -> Duplicate content hash correctly rejected (returns None without exception).")

    # 10. Create a test cluster
    print("\n10. Creating a test cluster...")
    cluster = create_cluster(label="OpenAI GPT Models")
    assert cluster is not None and cluster.id is not None, "Failed to create cluster"
    print(f" -> Created cluster ID: {cluster.id} (Label: '{cluster.label}')")

    # 11. Assign article to cluster
    print("\n11. Assigning article to cluster...")
    updated = update_article_cluster(inserted.id, cluster.id)
    assert updated is True, "Failed to update article cluster_id"
    print(f" -> Article {inserted.id} successfully assigned to cluster {cluster.id}")

    # 12. Retrieve cluster and its articles
    print("\n12. Retrieving cluster articles...")
    cluster_articles = get_cluster_articles(cluster.id)
    assert len(cluster_articles) == 1, f"Expected 1 article in cluster, got {len(cluster_articles)}"
    assert cluster_articles[0].id == inserted.id, "Cluster article ID mismatch"
    print(f" -> Cluster contains article: '{cluster_articles[0].title}'")

    # 13. Clean up test records
    print("\n13. Cleaning up test records...")
    del_art = delete_article_by_id(inserted.id)
    del_cls = delete_cluster_by_id(cluster.id)
    assert del_art is True, "Failed to delete test article"
    assert del_cls is True, "Failed to delete test cluster"
    print(" -> Test records cleaned up successfully.")

    # 14. Verify existing nuzio_ai."NewsArticle" table remains untouched
    print("\n14. Verifying existing nuzio_ai.\"NewsArticle\" table is intact...")
    with get_db_cursor(commit=False) as cursor:
        cursor.execute('SELECT COUNT(*) as count FROM nuzio_ai."NewsArticle";')
        row = cursor.fetchone()
        count = row["count"]
        print(f" -> Existing nuzio_ai.\"NewsArticle\" table is intact with {count} rows.")

    print("\n" + "=" * 65)
    print("Phase 3 verification completed successfully!")
    print("=" * 65)


if __name__ == "__main__":
    main()
