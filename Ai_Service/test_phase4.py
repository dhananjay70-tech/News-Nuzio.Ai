"""Test script for Phase 4: TF-IDF, Cosine Similarity, Clustering, and Label Generation.

The database steps are isolated from real data: they insert clearly marked synthetic
articles (see TEST_URL_PREFIX), cluster ONLY those articles by ID, and remove ONLY
those records afterwards. Real articles, real clusters and the Nuzio backend tables
are never modified, so the test is repeatable however much data the database holds.
"""

import logging
import sys
from datetime import datetime, timezone
from unittest.mock import patch

from app.clustering.cluster import (
    cluster_articles,
    extract_cluster_label,
    find_connected_components,
    find_representative_article_index,
    recluster_and_persist,
)
from app.clustering.similarity import compute_similarity_matrix, find_similar_pairs
from app.clustering.tfidf import build_corpus, vectorize_articles
from app.config import settings
from app.database.connection import get_db_cursor
from app.database.models import NewsArticle, NewsCluster
from app.database.repository import (
    clear_clusters_for_articles,
    delete_article_by_id,
    get_cluster_articles,
    get_cluster_by_id,
    initialize_database,
    insert_article,
)
from app.processing.deduplicator import generate_content_hash

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("Phase4Test")

# Every synthetic row this test writes has a URL under this prefix. `.invalid` is a
# reserved TLD (RFC 2606), so it can never collide with a real ingested article, and
# cleanup can target exactly these rows and nothing else.
TEST_URL_PREFIX = "https://phase4-test.invalid/"


def make_synthetic_article(slug, title, description, source):
    return NewsArticle(
        title=title,
        description=description,
        url=f"{TEST_URL_PREFIX}{slug}",
        source=f"Phase4Test-{source}",
        published_at=datetime.now(timezone.utc),
        # Title-only hash (no body/URL), prefixed so it can't match a real article's hash
        content_hash=generate_content_hash(f"phase4-test {slug}"),
    )


def remove_synthetic_records():
    """Delete ONLY rows carrying the test marker, plus the clusters left empty by that.

    Also heals leftovers from a previously crashed run. Returns the number of articles removed.
    """
    with get_db_cursor(commit=False) as cursor:
        cursor.execute("SELECT id FROM nuzio_ai.news_articles WHERE url LIKE %s;", (TEST_URL_PREFIX + "%",))
        ids = [row["id"] for row in cursor.fetchall()]
    clear_clusters_for_articles(ids)
    for article_id in ids:
        delete_article_by_id(article_id)
    return len(ids)


def snapshot_real_data(exclude_cluster_ids=()):
    """Row count + content fingerprint of everything the test must not disturb.

    Covers every non-synthetic article (id, cluster assignment, updated_at), every cluster
    except `exclude_cluster_ids` (the ones this test created), and the whole Nuzio backend
    nuzio_ai."NewsArticle" table. Two equal snapshots mean no real row changed.
    """
    fingerprint = "COUNT(*) AS n, MD5(COALESCE(string_agg({expr}, {sep} ORDER BY {order}), '')) AS fp"
    queries = {
        "articles": (
            "SELECT " + fingerprint.format(
                expr="id::text || ':' || COALESCE(cluster_id::text, '') || ':' || updated_at::text",
                sep="','", order="id",
            ) + " FROM nuzio_ai.news_articles WHERE url NOT LIKE %s;",
            (TEST_URL_PREFIX + "%",),
        ),
        "clusters": (
            "SELECT " + fingerprint.format(
                expr="id::text || ':' || label || ':' || updated_at::text",
                sep="','", order="id",
            ) + " FROM nuzio_ai.news_clusters WHERE id <> ALL(%s);",
            (list(exclude_cluster_ids),),
        ),
        "backend NewsArticle": (
            "SELECT " + fingerprint.format(expr="t::text", sep="'|'", order="t::text")
            + ' FROM nuzio_ai."NewsArticle" t;',
            (),
        ),
    }
    snapshot = {}
    with get_db_cursor(commit=False) as cursor:
        for name, (query, params) in queries.items():
            cursor.execute(query, params)
            row = cursor.fetchone()
            snapshot[name] = (row["n"], row["fp"])
    return snapshot


def count_clusters():
    with get_db_cursor(commit=False) as cursor:
        cursor.execute("SELECT COUNT(*) AS n FROM nuzio_ai.news_clusters;")
        return cursor.fetchone()["n"]


def main():
    print("=" * 70)
    print("NUZIO AI - PHASE 4: TF-IDF, SIMILARITY & CLUSTERING TEST")
    print("=" * 70)

    # -------------------------------------------------------------
    # 1. TF-IDF Vectorization Unit Tests
    # -------------------------------------------------------------
    print("\n1. Testing TF-IDF Vectorization...")
    sample_texts = [
        "OpenAI released a new artificial intelligence model for developers. OpenAI introduced a new AI model aimed at software developers.",
        "OpenAI introduced a new AI model aimed at software developers. Software developers test the new OpenAI artificial intelligence model.",
        "Heavy rain caused flooding across several Indian cities. Severe flooding and heavy rain impact several Indian cities.",
        "Several cities in India experienced severe flooding after heavy rainfall. Heavy rainfall triggers severe flooding in several cities across India.",
        "NASA announces new Artemis lunar mission schedule. Astronauts prepare for upcoming moon orbit mission.",
    ]

    tfidf_mat, vec = vectorize_articles(sample_texts)
    assert tfidf_mat is not None, "TF-IDF matrix is None"
    assert tfidf_mat.shape[0] == 5, f"Expected 5 rows, got {tfidf_mat.shape[0]}"
    assert tfidf_mat.shape[1] > 0, "No features extracted"
    print(f" -> Successfully vectorized 5 articles into shape: {tfidf_mat.shape}")

    # Test edge case: empty & short text
    edge_cases = ["", "   ", "!@#$%^", "the and is of in"]
    edge_mat, edge_vec = vectorize_articles(edge_cases)
    assert edge_mat is not None, "Edge case vectorization returned None"
    print(f" -> Edge case vectorization handled safely with shape: {edge_mat.shape}")

    # -------------------------------------------------------------
    # 2. Pairwise Cosine Similarity Tests
    # -------------------------------------------------------------
    print("\n2. Testing Cosine Similarity Matrix...")
    sim_matrix = compute_similarity_matrix(tfidf_mat)
    assert sim_matrix.shape == (5, 5), f"Unexpected shape {sim_matrix.shape}"
    for i in range(5):
        assert abs(sim_matrix[i, i] - 1.0) < 1e-5, f"Diagonal not 1.0 at index {i}"

    sim_ab = float(sim_matrix[0, 1])  # AI topic pair
    sim_cd = float(sim_matrix[2, 3])  # Flooding topic pair
    sim_ac = float(sim_matrix[0, 2])  # AI vs Flooding
    sim_nasa = float(sim_matrix[0, 4])  # AI vs NASA

    print(f" -> Sim(Article A 'OpenAI', Article B 'OpenAI'): {sim_ab:.4f}")
    print(f" -> Sim(Article C 'Floods', Article D 'Floods'): {sim_cd:.4f}")
    print(f" -> Sim(Article A 'OpenAI', Article C 'Floods'): {sim_ac:.4f}")
    print(f" -> Sim(Article A 'OpenAI', Article E 'NASA'):   {sim_nasa:.4f}")

    assert sim_ab > sim_ac, "OpenAI pair should be more similar than OpenAI-Floods"
    assert sim_cd > sim_ac, "Floods pair should be more similar than Floods-OpenAI"
    assert sim_ac < settings.CLUSTER_SIMILARITY_THRESHOLD, "Unrelated topics crossed threshold"

    # -------------------------------------------------------------
    # 3. Connected Components & Topic Clustering
    # -------------------------------------------------------------
    print("\n3. Testing Topic Clustering (Connected Components)...")
    # Topic 1: OpenAI (2), Topic 2: Indian flooding (2), Topic 3: unrelated NASA story (1)
    synthetic_articles = [
        make_synthetic_article(
            "openai-1",
            "OpenAI released a new artificial intelligence model for developers",
            "OpenAI introduced a new AI model aimed at software developers.",
            "TechNews",
        ),
        make_synthetic_article(
            "openai-2",
            "OpenAI introduced a new AI model aimed at software developers",
            "Software developers test the new OpenAI artificial intelligence model.",
            "DevDigest",
        ),
        make_synthetic_article(
            "flood-1",
            "Heavy rain caused flooding across several Indian cities",
            "Severe flooding and heavy rain impact several Indian cities.",
            "WorldNews",
        ),
        make_synthetic_article(
            "flood-2",
            "Several cities in India experienced severe flooding after heavy rainfall",
            "Heavy rainfall triggers severe flooding in several cities across India.",
            "DailyIndia",
        ),
        make_synthetic_article(
            "nasa-1",
            "NASA announces new Artemis lunar mission schedule",
            "Astronauts prepare for upcoming moon orbit mission.",
            "SpaceToday",
        ),
    ]

    clusters = cluster_articles(synthetic_articles, threshold=settings.CLUSTER_SIMILARITY_THRESHOLD)
    print(f" -> Created {len(clusters)} topic clusters from 5 articles:")

    for idx, cl in enumerate(clusters, 1):
        titles = [a.title for a in cl["articles"]]
        print(f"    Cluster #{idx}: '{cl['label']}' (Size: {cl['size']})")
        for t in titles:
            print(f"      - {t}")

    assert len(clusters) == 3, f"Expected 3 clusters (AI, Floods, NASA), got {len(clusters)}"
    # Verify AI articles are grouped together
    ai_cluster = next(c for c in clusters if any("OpenAI" in a.title for a in c["articles"]))
    assert len(ai_cluster["articles"]) == 2, f"Expected 2 articles in AI cluster, got {len(ai_cluster['articles'])}"

    # Verify Floods articles are grouped together
    flood_cluster = next(c for c in clusters if any("flooding" in a.title.lower() for a in c["articles"]))
    assert len(flood_cluster["articles"]) == 2, f"Expected 2 articles in Flood cluster, got {len(flood_cluster['articles'])}"

    # Verify NASA single-article cluster
    nasa_cluster = next(c for c in clusters if any("NASA" in a.title for a in c["articles"]))
    assert len(nasa_cluster["articles"]) == 1, f"Expected 1 article in NASA cluster, got {len(nasa_cluster['articles'])}"

    # -------------------------------------------------------------
    # 4. Cluster Label Generation Tests
    # -------------------------------------------------------------
    print("\n4. Testing Cluster Label Generation...")
    for cl in clusters:
        assert cl["label"], "Cluster label is empty"
        assert not cl["label"].startswith("Cluster"), "Label must not be generic 'Cluster X'"
        print(f" -> Verified descriptive label: '{cl['label']}'")

    # -------------------------------------------------------------
    # 5. Database Integration & Persistence Test (isolated)
    # -------------------------------------------------------------
    print("\n5. Testing Database Persistence & Idempotent Reclustering (synthetic articles only)...")
    initialize_database()

    # Heal leftovers from a crashed earlier run; touches only marker rows.
    leftovers = remove_synthetic_records()
    if leftovers:
        print(f" -> Removed {leftovers} leftover synthetic article(s) from a previous run.")

    baseline = snapshot_real_data()
    baseline_cluster_count = count_clusters()
    print(
        f" -> Real data baseline: {baseline['articles'][0]} articles, {baseline['clusters'][0]} clusters, "
        f"{baseline['backend NewsArticle'][0]} backend NewsArticle rows (must stay untouched)."
    )

    try:
        inserted_articles = []
        for art in synthetic_articles:
            inserted = insert_article(art)
            if inserted:
                inserted_articles.append(inserted)

        print(f" -> Inserted {len(inserted_articles)} synthetic articles into nuzio_ai.news_articles.")
        assert len(inserted_articles) == len(synthetic_articles), (
            f"Expected all {len(synthetic_articles)} synthetic articles to insert, got {len(inserted_articles)}"
        )
        synthetic_ids = [art.id for art in inserted_articles]

        # Recluster ONLY the synthetic articles; real articles/clusters are out of scope.
        persisted_run1 = recluster_and_persist(
            threshold=settings.CLUSTER_SIMILARITY_THRESHOLD, article_ids=synthetic_ids
        )
        print(f" -> Run 1: Persisted {len(persisted_run1)} clusters for the synthetic articles.")
        assert len(persisted_run1) == 3, f"Expected 3 persisted clusters, got {len(persisted_run1)}"

        # Verify article assignments: every member is synthetic and all 5 are assigned
        member_counts = []
        total_assigned_articles = 0
        for c in persisted_run1:
            arts = get_cluster_articles(c.id)
            assert all(a.url.startswith(TEST_URL_PREFIX) for a in arts), (
                f"Cluster {c.id} contains a non-synthetic article"
            )
            member_counts.append(len(arts))
            total_assigned_articles += len(arts)
            print(f"    DB Cluster #{c.id} ('{c.label}'): {len(arts)} articles")

        assert total_assigned_articles == 5, f"Expected 5 assigned articles, got {total_assigned_articles}"
        assert sorted(member_counts) == [1, 2, 2], f"Expected cluster sizes [1, 2, 2], got {sorted(member_counts)}"

        # Real articles and real clusters must be exactly as before
        assert snapshot_real_data(exclude_cluster_ids=[c.id for c in persisted_run1]) == baseline, (
            "Real articles/clusters changed during scoped reclustering"
        )
        assert count_clusters() == baseline_cluster_count + 3, "Scoped reclustering must add exactly 3 clusters"
        print(" -> Real articles and clusters untouched by scoped reclustering.")

        # Re-run clustering to verify idempotency (no duplicates created)
        print("\n -> Testing repeated clustering run (Idempotency)...")
        persisted_run2 = recluster_and_persist(
            threshold=settings.CLUSTER_SIMILARITY_THRESHOLD, article_ids=synthetic_ids
        )
        assert len(persisted_run2) == 3, f"Expected 3 clusters on re-run, got {len(persisted_run2)}"
        stale = [c.id for c in persisted_run1 if get_cluster_by_id(c.id) is not None]
        assert not stale, f"Run 1 clusters were not replaced on re-run: {stale}"
        assert count_clusters() == baseline_cluster_count + 3, "Re-run created duplicate clusters"
        assert snapshot_real_data(exclude_cluster_ids=[c.id for c in persisted_run2]) == baseline, (
            "Real articles/clusters changed during repeated scoped reclustering"
        )
        print(" -> Repeated clustering run successfully reconciled clusters without creating duplicates.")

        # Production (default) reclustering must still replace ALL clusters. Verified with
        # mocks so the real database is never asked to do a full reclustering here.
        print("\n -> Verifying default (full-table) reclustering behavior is unchanged...")
        with patch("app.clustering.cluster.get_articles", return_value=inserted_articles) as get_all, \
             patch("app.clustering.cluster.get_articles_by_ids") as get_by_ids, \
             patch("app.clustering.cluster.clear_all_clusters") as clear_all, \
             patch("app.clustering.cluster.clear_clusters_for_articles") as clear_scoped, \
             patch("app.clustering.cluster.create_cluster", side_effect=lambda label: NewsCluster(id=-1, label=label)), \
             patch("app.clustering.cluster.batch_update_article_clusters") as batch_update:
            full_run = recluster_and_persist(threshold=settings.CLUSTER_SIMILARITY_THRESHOLD)
            assert len(full_run) == 3
            get_all.assert_called_once()
            clear_all.assert_called_once()
            batch_update.assert_called_once()
            get_by_ids.assert_not_called()
            clear_scoped.assert_not_called()

        # An empty ID list must cluster nothing - never fall back to a full-table wipe
        with patch("app.clustering.cluster.get_articles") as get_all, \
             patch("app.clustering.cluster.clear_all_clusters") as clear_all:
            assert recluster_and_persist(article_ids=[]) == []
            get_all.assert_not_called()
            clear_all.assert_not_called()
        print(" -> Default reclustering still clears/replaces all clusters; empty article_ids is a no-op.")
    finally:
        removed = remove_synthetic_records()
        print(f"\n -> Removed {removed} synthetic article(s) and their clusters.")

    # -------------------------------------------------------------
    # 6. Safety Check: real data is exactly as it was before the test
    # -------------------------------------------------------------
    print("\n6. Verifying real data was preserved...")
    assert remove_synthetic_records() == 0, "Synthetic records remain after cleanup"
    assert snapshot_real_data() == baseline, "Real data differs from the pre-test baseline"
    assert count_clusters() == baseline_cluster_count, "Cluster count differs from the pre-test baseline"
    print(
        f" -> {baseline['articles'][0]} real articles and {baseline_cluster_count} real clusters unchanged; "
        f"existing nuzio_ai.\"NewsArticle\" table is intact with {baseline['backend NewsArticle'][0]} rows."
    )

    print("\n" + "=" * 70)
    print("Phase 4 verification completed successfully!")
    print("=" * 70)


if __name__ == "__main__":
    main()
