"""Test suite for Phase 5: FastAPI REST API Layer.

Verifies:
- System Endpoints: GET /, GET /health
- Clusters Endpoints: GET /clusters, GET /clusters/{valid_id}, GET /clusters/{invalid_id}
- Timeline Endpoints: GET /timeline, query parameters (source, cluster_id, from, to, limit)
- Ingestion Endpoints: POST /ingest/trigger, GET /ingest/status/{job_id}, 404 on unknown job
- Error handling (400 on invalid query params, 404 on missing resources)
- CORS headers & OpenAPI documentation (/docs, /openapi.json)
- Database safety check (existing nuzio_ai."NewsArticle" table remains intact)
"""

import logging
import sys
import time
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.ingestion import job_registry
from app.config import settings
from app.database.connection import get_db_cursor
from app.database.models import NewsArticle
from app.database.repository import (
    clear_all_clusters,
    create_cluster,
    delete_article_by_id,
    delete_cluster_by_id,
    initialize_database,
    insert_article,
    update_article_cluster,
)
from app.main import app
from app.pipeline import PipelineResult
from app.processing.deduplicator import generate_content_hash

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("Phase5Test")

client = TestClient(app)


def main():
    print("=" * 70)
    print("NUZIO AI - PHASE 5: FASTAPI REST API LAYER TEST")
    print("=" * 70)

    # -------------------------------------------------------------
    # Setup: Initialize schema & insert controlled test fixtures
    # -------------------------------------------------------------
    print("\n0. Initializing schema and setting up test fixtures...")
    initialize_database()

    # Get baseline count of existing backend table for safety check
    with get_db_cursor(commit=False) as cur:
        cur.execute('SELECT COUNT(*) AS count FROM nuzio_ai."NewsArticle";')
        initial_backend_articles = cur.fetchone()["count"]

    # Create synthetic test cluster
    test_cluster = create_cluster(label="Artificial Intelligence Advances")
    assert test_cluster.id is not None, "Failed to create test cluster"

    # Create synthetic test articles
    test_article1 = NewsArticle(
        title="OpenAI Unveils Cutting Edge AI Model",
        description="OpenAI releases new frontier multimodal AI model for researchers.",
        content="Full text regarding OpenAI artificial intelligence frontier model release.",
        cleaned_content="openai releases new frontier multimodal ai model researchers",
        url="https://test-phase5.ai/openai-model",
        source="TechPulse",
        published_at=datetime(2026, 9, 24, 10, 0, 0, tzinfo=timezone.utc),
        content_hash=generate_content_hash("OpenAI Unveils Cutting Edge AI Model", "openai releases frontier model"),
        cluster_id=test_cluster.id
    )
    test_article2 = NewsArticle(
        title="Global Markets Rally on Tech Sector Growth",
        description="Equities rise across European and Asian trading sessions.",
        content="Global equities experience substantial rally led by technology indices.",
        cleaned_content="global equities experience substantial rally technology indices",
        url="https://test-phase5.ai/market-rally",
        source="FinancialTimes",
        published_at=datetime(2026, 9, 24, 8, 30, 0, tzinfo=timezone.utc),
        content_hash=generate_content_hash("Global Markets Rally on Tech Sector Growth", "equities rise trading sessions"),
        cluster_id=None
    )

    art1 = insert_article(test_article1)
    art2 = insert_article(test_article2)
    assert art1 and art1.id, "Failed to insert test article 1"
    assert art2 and art2.id, "Failed to insert test article 2"

    update_article_cluster(art1.id, test_cluster.id)
    print(f" -> Created test cluster #{test_cluster.id} and articles (IDs: {art1.id}, {art2.id})")

    try:
        # -------------------------------------------------------------
        # 1. System Endpoints (GET / and GET /health)
        # -------------------------------------------------------------
        print("\n1. Testing System Endpoints (GET / and GET /health)...")
        res_root = client.get("/")
        assert res_root.status_code == 200, f"Root returned {res_root.status_code}"
        root_data = res_root.json()
        assert root_data.get("status") == "ok", f"Root status not ok: {root_data}"
        print(f" -> GET / passed: {root_data}")

        res_health = client.get("/health")
        assert res_health.status_code == 200, f"Health returned {res_health.status_code}"
        health_data = res_health.json()
        assert health_data.get("status") == "ok", f"Health status not ok: {health_data}"
        assert health_data.get("database") == "connected", f"Database not connected: {health_data}"
        print(f" -> GET /health passed: {health_data}")

        # -------------------------------------------------------------
        # 2. Clusters Endpoints (GET /clusters, GET /clusters/{id})
        # -------------------------------------------------------------
        print("\n2. Testing Clusters Endpoints (GET /clusters, GET /clusters/{id})...")
        res_clusters = client.get("/clusters")
        assert res_clusters.status_code == 200, f"GET /clusters returned {res_clusters.status_code}"
        clusters_data = res_clusters.json()
        assert "clusters" in clusters_data, "Missing 'clusters' key in response"
        assert "count" in clusters_data, "Missing 'count' key in response"
        assert clusters_data["count"] >= 1, "Expected at least 1 cluster"
        
        # Verify cluster summary item fields
        found_cluster = next((c for c in clusters_data["clusters"] if c["id"] == test_cluster.id), None)
        assert found_cluster is not None, f"Cluster #{test_cluster.id} not found in /clusters response"
        assert found_cluster["label"] == "Artificial Intelligence Advances"
        assert found_cluster["article_count"] >= 1
        assert "latest_published_at" in found_cluster
        print(f" -> GET /clusters passed (Found {clusters_data['count']} clusters, verified cluster #{test_cluster.id})")

        # GET /clusters/{valid_id}
        res_cluster_detail = client.get(f"/clusters/{test_cluster.id}")
        assert res_cluster_detail.status_code == 200, f"GET /clusters/{test_cluster.id} returned {res_cluster_detail.status_code}"
        detail_data = res_cluster_detail.json()
        assert detail_data["id"] == test_cluster.id
        assert detail_data["label"] == test_cluster.label
        assert "articles" in detail_data and len(detail_data["articles"]) >= 1
        art_item = detail_data["articles"][0]
        assert art_item["id"] == art1.id
        assert art_item["title"] == art1.title
        assert art_item["url"] == art1.url
        assert art_item["source"] == art1.source
        assert "published_at" in art_item
        print(f" -> GET /clusters/{test_cluster.id} detail passed (Contains article '{art_item['title']}')")

        # GET /clusters/{invalid_id} -> 404
        res_invalid_cluster = client.get("/clusters/99999999")
        assert res_invalid_cluster.status_code == 404, f"Expected 404 for invalid cluster ID, got {res_invalid_cluster.status_code}"
        print(" -> GET /clusters/99999999 correctly returned HTTP 404 Not Found")

        # -------------------------------------------------------------
        # 3. Timeline Endpoints (GET /timeline + Query Parameters)
        # -------------------------------------------------------------
        print("\n3. Testing Timeline Endpoints (GET /timeline + Filters)...")
        res_timeline = client.get("/timeline")
        assert res_timeline.status_code == 200, f"GET /timeline returned {res_timeline.status_code}"
        timeline_data = res_timeline.json()
        assert "articles" in timeline_data and "count" in timeline_data
        assert timeline_data["count"] >= 2, f"Expected at least 2 timeline articles, got {timeline_data['count']}"

        # Verify descending order by published_at
        articles = timeline_data["articles"]
        for i in range(len(articles) - 1):
            t_curr = datetime.fromisoformat(articles[i]["published_at"].replace("Z", "+00:00"))
            t_next = datetime.fromisoformat(articles[i + 1]["published_at"].replace("Z", "+00:00"))
            assert t_curr >= t_next, f"Timeline articles not in descending order at index {i}"
        print(" -> GET /timeline passed: articles correctly ordered chronologically descending (published_at DESC)")

        # Filter by source
        res_src = client.get("/timeline?source=TechPulse")
        assert res_src.status_code == 200
        src_articles = res_src.json()["articles"]
        assert len(src_articles) >= 1
        assert all("TechPulse" in a["source"] for a in src_articles)
        print(f" -> GET /timeline?source=TechPulse passed: filtered {len(src_articles)} article(s)")

        # Filter by cluster_id
        res_cl = client.get(f"/timeline?cluster_id={test_cluster.id}")
        assert res_cl.status_code == 200
        cl_articles = res_cl.json()["articles"]
        assert len(cl_articles) >= 1
        assert all(a["cluster_id"] == test_cluster.id for a in cl_articles)
        assert cl_articles[0]["cluster_label"] == test_cluster.label
        print(f" -> GET /timeline?cluster_id={test_cluster.id} passed: attached cluster label '{cl_articles[0]['cluster_label']}'")

        # Filter by date range (from / to)
        res_date = client.get("/timeline?from=2026-09-24T09:00:00Z&to=2026-09-24T11:00:00Z")
        assert res_date.status_code == 200
        date_articles = res_date.json()["articles"]
        assert any(a["id"] == art1.id for a in date_articles)
        assert not any(a["id"] == art2.id for a in date_articles)
        print(f" -> GET /timeline?from=...&to=... passed: filtered {len(date_articles)} article(s) in date range")

        # Limit parameter
        res_limit = client.get("/timeline?limit=1")
        assert res_limit.status_code == 200
        assert len(res_limit.json()["articles"]) == 1
        print(" -> GET /timeline?limit=1 passed: pagination limit correctly respected")

        # -------------------------------------------------------------
        # 4. Query Parameter Validation & Error Handling (400 Bad Request)
        # -------------------------------------------------------------
        print("\n4. Testing Error Handling & Query Parameter Validation...")
        # Invalid date format
        res_bad_date = client.get("/timeline?from=not-a-valid-date")
        assert res_bad_date.status_code == 400, f"Expected 400 for invalid date, got {res_bad_date.status_code}"
        print(" -> GET /timeline?from=not-a-valid-date correctly returned HTTP 400 Bad Request")

        # Invalid numeric limit
        res_bad_limit = client.get("/timeline?limit=-5")
        assert res_bad_limit.status_code == 400, f"Expected 400 for negative limit, got {res_bad_limit.status_code}"
        print(" -> GET /timeline?limit=-5 correctly returned HTTP 400 Bad Request")

        # Invalid cluster ID type
        res_bad_cl_type = client.get("/clusters/abc_not_an_id")
        assert res_bad_cl_type.status_code == 400, f"Expected 400 for non-int cluster ID, got {res_bad_cl_type.status_code}"
        print(" -> GET /clusters/abc_not_an_id correctly returned HTTP 400 Bad Request")

        # -------------------------------------------------------------
        # 5. Ingestion & Background Job Execution
        # -------------------------------------------------------------
        print("\n5. Testing Ingestion & Background Job Endpoints...")
        job_registry.clear()

        # Mock run_full_ingestion so unit test is deterministic, fast, and does not crawl external RSS
        mock_result = PipelineResult(
            articles_fetched=20,
            articles_inserted=12,
            articles_skipped=8,
            clusters_created=4,
            error=None
        )

        with patch("app.api.ingestion.run_full_ingestion", return_value=mock_result) as mock_ingest:
            # POST /ingest/trigger
            res_trigger = client.post("/ingest/trigger")
            assert res_trigger.status_code in (200, 202), f"POST /ingest/trigger returned {res_trigger.status_code}"
            trigger_data = res_trigger.json()
            assert "job_id" in trigger_data, "Missing job_id in trigger response"
            assert trigger_data["status"] == "QUEUED", f"Expected status 'QUEUED', got {trigger_data['status']}"
            job_id = trigger_data["job_id"]
            print(f" -> POST /ingest/trigger returned immediately with job_id='{job_id}', status='QUEUED'")

            # Wait briefly for background thread to transition and complete
            for _ in range(20):
                time.sleep(0.05)
                status_res = client.get(f"/ingest/status/{job_id}")
                if status_res.status_code == 200 and status_res.json()["status"] in ("COMPLETED", "FAILED"):
                    break

            # GET /ingest/status/{job_id}
            res_status = client.get(f"/ingest/status/{job_id}")
            assert res_status.status_code == 200, f"GET /ingest/status/{job_id} returned {res_status.status_code}"
            status_data = res_status.json()
            assert status_data["job_id"] == job_id
            assert status_data["status"] == "COMPLETED"
            assert status_data["articles_fetched"] == 20
            assert status_data["articles_inserted"] == 12
            assert status_data["articles_skipped"] == 8
            assert status_data["clusters_created"] == 4
            assert status_data["completed_at"] is not None
            assert status_data["error"] is None
            print(f" -> GET /ingest/status/{job_id} passed: {status_data}")

        # GET /ingest/status/invalid-job -> 404
        res_unknown_job = client.get("/ingest/status/non-existent-job-xyz")
        assert res_unknown_job.status_code == 404, f"Expected 404 for unknown job, got {res_unknown_job.status_code}"
        print(" -> GET /ingest/status/non-existent-job-xyz correctly returned HTTP 404 Not Found")

        # -------------------------------------------------------------
        # 6. OpenAPI Documentation & CORS Headers
        # -------------------------------------------------------------
        print("\n6. Testing OpenAPI Documentation & CORS Headers...")
        res_docs = client.get("/docs")
        assert res_docs.status_code == 200, f"GET /docs returned {res_docs.status_code}"
        print(" -> Swagger UI available at /docs")

        res_openapi = client.get("/openapi.json")
        assert res_openapi.status_code == 200, f"GET /openapi.json returned {res_openapi.status_code}"
        openapi_data = res_openapi.json()
        assert "paths" in openapi_data
        expected_paths = ["/clusters", "/clusters/{cluster_id}", "/timeline", "/ingest/trigger", "/ingest/status/{job_id}", "/health"]
        for p in expected_paths:
            assert p in openapi_data["paths"], f"Expected OpenAPI path '{p}' missing from openapi.json"
        print(" -> OpenAPI schema /openapi.json verified with all required paths and tags")

        # CORS header verification
        res_cors = client.get("/clusters", headers={"Origin": "http://localhost:5173"})
        assert res_cors.status_code == 200
        assert res_cors.headers.get("access-control-allow-origin") in ("http://localhost:5173", "*")
        print(" -> CORS headers successfully validated for allowed frontend origin (http://localhost:5173)")

    finally:
        # -------------------------------------------------------------
        # Cleanup: Remove synthetic test data
        # -------------------------------------------------------------
        print("\n7. Cleaning up test data & verifying database integrity...")
        if art1 and art1.id:
            delete_article_by_id(art1.id)
        if art2 and art2.id:
            delete_article_by_id(art2.id)
        if test_cluster and test_cluster.id:
            delete_cluster_by_id(test_cluster.id)

        # Safety verification: ensure nuzio_ai."NewsArticle" table remains intact
        with get_db_cursor(commit=False) as cur:
            cur.execute('SELECT COUNT(*) AS count FROM nuzio_ai."NewsArticle";')
            final_backend_articles = cur.fetchone()["count"]

        assert final_backend_articles == initial_backend_articles, (
            f"Existing nuzio_ai.\"NewsArticle\" table was modified! Initial: {initial_backend_articles}, Final: {final_backend_articles}"
        )
        print(f" -> Verified existing nuzio_ai.\"NewsArticle\" table is safely preserved with {final_backend_articles} rows.")

    print("\n" + "=" * 70)
    print("Phase 5 verification completed successfully!")
    print("=" * 70)


if __name__ == "__main__":
    main()
