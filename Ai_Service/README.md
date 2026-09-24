# Nuzio AI - AI News Intelligence Service

A Python microservice responsible for automated RSS ingestion, full-text extraction, NLP cleaning, deterministic deduplication, TF-IDF topic clustering, and timeline delivery for Nuzio AI.

---

## Architecture Overview

```text
RSS Feeds (BBC, NPR, Guardian, TechCrunch, Al Jazeera)
      ↓
RSS Parser (app/feeds/parser.py)
      ↓
Data Normalization (UTC timestamps, structured NewsItem)
      ↓
Deduplication & Content Hashing (app/processing/deduplicator.py)
      ↓
Article Full-Text Extraction (app/extraction/article_extractor.py - Trafilatura)
      ↓
NLP Text Cleaning (app/processing/cleaner.py)
      ↓
PostgreSQL Storage (nuzio_ai schema)
      ↓
TF-IDF Vectorization (app/clustering/tfidf.py)
      ↓
Pairwise Cosine Similarity (app/clustering/similarity.py)
      ↓
Connected-Components Topic Clustering (app/clustering/cluster.py)
      ↓
Cluster Label Generation (app/clustering/cluster.py)
      ↓
FastAPI Endpoints (Phase 5 & 6)
```

---

## Grouping & Clustering Methodology

1. **Text Construction**:
   - For each article, combines `headline + description + cleaned_content`.
   - Headlines and descriptions are given prime representation.
2. **TF-IDF Vectorization**:
   - `scikit-learn`'s `TfidfVectorizer` with `ngram_range=(1, 2)`, sublinear term frequency scaling (`sublinear_tf=True`), and English stopword elimination.
3. **Pairwise Cosine Similarity**:
   - Computes $N \times N$ document cosine similarity matrix.
   - Pairs with $\text{similarity} \ge \text{threshold}$ form edges in a document similarity graph.
4. **Connected-Components Topic Clustering**:
   - Uses graph breadth-first traversal to group transitively related stories into cohesive clusters ($A \leftrightarrow B \leftrightarrow C$).
   - Naturally accommodates multi-article stories as well as single-article breaking developments.
5. **Cluster Label Generation**:
   - Fits a cluster-level TF-IDF model on member articles to extract top 2–4 high-significance n-grams (e.g. *"OpenAI AI Model"*, *"Monsoon Flooding Mumbai"*).
   - If vocabulary is sparse, falls back to the representative article's headline (the medoid article closest to the cluster centroid).

---

## Configuration & Parameters

- `CLUSTER_SIMILARITY_THRESHOLD`: `0.30` *(Configurable similarity cutoff for forming topic edges)*
- `TFIDF_NGRAM_MIN`: `1`
- `TFIDF_NGRAM_MAX`: `2`
- `TFIDF_MAX_DF`: `0.90`
- `MAX_ARTICLES_PER_FEED`: `30`
- `MIN_ARTICLE_CONTENT_LENGTH`: `200`
- `HTTP_TIMEOUT`: `15`

---

## Known Limitations

- **Lexical Overlap Dependency**: Because TF-IDF relies on lexical terms and n-gram overlap, two articles discussing the identical real-world event with completely disjoint vocabularies (e.g., *"GOP lawmakers introduce tax legislation"* vs *"Conservative politicians present fiscal reform package"*) may not cross the cosine similarity threshold without semantic embedding models.

---

## Database Architecture (`nuzio_ai` Schema)

The AI service shares the PostgreSQL database with the Nuzio backend while strictly scoping its tables inside the **`nuzio_ai`** schema.

### Tables

1. **`nuzio_ai.news_clusters`**:
   - `id` (SERIAL PRIMARY KEY)
   - `label` (VARCHAR(255) NOT NULL)
   - `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
   - `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

2. **`nuzio_ai.news_articles`**:
   - `id` (SERIAL PRIMARY KEY)
   - `title` (TEXT NOT NULL)
   - `description` (TEXT)
   - `content` (TEXT)
   - `cleaned_content` (TEXT)
   - `url` (TEXT UNIQUE NOT NULL)
   - `source` (VARCHAR(100) NOT NULL)
   - `published_at` (TIMESTAMPTZ NOT NULL)
   - `content_hash` (VARCHAR(64) UNIQUE NOT NULL)
   - `cluster_id` (INTEGER REFERENCES nuzio_ai.news_clusters(id) ON DELETE SET NULL)
   - `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
   - `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

---

## Phase 5: FastAPI REST API Layer

The AI service exposes all functionality via a high-performance REST API built with FastAPI, Uvicorn, and Pydantic models.

### API Endpoints

```text
GET  /clusters
GET  /clusters/{id}
GET  /timeline
POST /ingest/trigger
GET  /ingest/status/{jobId}
GET  /health
GET  /
```

Interactive OpenAPI documentation is automatically served at:
- Swagger UI: `http://localhost:8000/docs`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

---

### Endpoint Reference

#### 1. `GET /clusters`
Retrieve all current topic clusters along with member article count and latest article publication date.

**Example Request:**
```http
GET /clusters HTTP/1.1
Host: localhost:8000
```

**Example Response (200 OK):**
```json
{
  "clusters": [
    {
      "id": 1,
      "label": "OpenAI AI Model",
      "article_count": 4,
      "latest_published_at": "2026-09-24T10:30:00Z"
    },
    {
      "id": 2,
      "label": "India Heavy Rain",
      "article_count": 3,
      "latest_published_at": "2026-09-24T09:45:00Z"
    }
  ],
  "count": 2
}
```

---

#### 2. `GET /clusters/{id}`
Retrieve details for a specific topic cluster including all member articles ordered chronologically. Returns HTTP 404 when the cluster ID is not found.

**Example Request:**
```http
GET /clusters/1 HTTP/1.1
Host: localhost:8000
```

**Example Response (200 OK):**
```json
{
  "id": 1,
  "label": "OpenAI AI Model",
  "articles": [
    {
      "id": 10,
      "title": "OpenAI releases new model",
      "description": "OpenAI introduces frontier reasoning model.",
      "url": "https://techcrunch.com/2026/09/24/openai-new-model",
      "source": "TechCrunch",
      "published_at": "2026-09-24T09:00:00Z"
    }
  ]
}
```

---

#### 3. `GET /timeline`
Retrieve articles formatted and ordered chronologically descending (`published_at DESC`) for the frontend timeline visualization.

**Supported Query Parameters:**
- `source` *(string, optional)*: Filter by publisher name (e.g. `BBC News`)
- `cluster_id` *(int, optional)*: Filter by cluster ID
- `from` *(ISO string, optional)*: Lower bound published date
- `to` *(ISO string, optional)*: Upper bound published date
- `limit` *(int, optional, default: 50)*: Number of articles to return
- `offset` *(int, optional, default: 0)*: Pagination offset

**Example Request:**
```http
GET /timeline?source=BBC%20News&limit=2 HTTP/1.1
Host: localhost:8000
```

**Example Response (200 OK):**
```json
{
  "articles": [
    {
      "id": 1,
      "title": "AI superpower ambitions take centre stage as Trump and Xi meet",
      "description": "The US and China are vying for AI supremacy.",
      "url": "https://www.bbc.co.uk/news/articles/c6gqdgg8w59xo",
      "source": "BBC News",
      "published_at": "2026-09-24T10:20:00Z",
      "cluster_id": 3,
      "cluster_label": "Global Markets"
    }
  ],
  "count": 1
}
```

---

#### 4. `POST /ingest/trigger`
Start a new RSS ingestion, extraction, deduplication, and clustering job asynchronously in the background. Returns immediately with a unique job ID without blocking the HTTP request.

**Example Request:**
```http
POST /ingest/trigger HTTP/1.1
Host: localhost:8000
```

**Example Response (200 OK):**
```json
{
  "job_id": "abc123",
  "status": "QUEUED"
}
```

---

#### 5. `GET /ingest/status/{jobId}`
Poll current execution status, timestamps, and processed article metrics for a specific background ingestion job. Returns HTTP 404 for an unknown job ID.

**Example Request:**
```http
GET /ingest/status/abc123 HTTP/1.1
Host: localhost:8000
```

**Example Response (200 OK):**
```json
{
  "job_id": "abc123",
  "status": "RUNNING",
  "started_at": "2026-09-24T10:00:00Z",
  "completed_at": null,
  "articles_fetched": 25,
  "articles_inserted": 18,
  "articles_skipped": 7,
  "clusters_created": 6,
  "error": null
}
```

**Possible Job Statuses:**
- `QUEUED`: Job is registered in-memory and awaiting worker thread pickup.
- `RUNNING`: Worker thread is executing the multi-stage ingestion pipeline.
- `COMPLETED`: Pipeline finished successfully and cluster assignments are persisted.
- `FAILED`: Pipeline encountered an unrecoverable exception; details are available in `error`.

---

#### 6. `GET /health`
System health check and live PostgreSQL database connectivity probe.

**Example Response (200 OK):**
```json
{
  "status": "ok",
  "service": "nuzio-ai-news-service",
  "database": "connected"
}
```

---

### Ingestion Job Lifecycle

```text
POST /ingest/trigger
       ↓
    QUEUED (Job registered in thread-safe InMemoryJobRegistry)
       ↓
    RUNNING (Daemon worker thread started)
       ↓
  1. RSS Ingestion (Fetch feeds from BBC, NPR, Guardian, TechCrunch, Al Jazeera)
       ↓
  2. Data Normalization (NewsItem standard format)
       ↓
  3. Deduplication (Canonical URL & SHA-256 content hashing)
       ↓
  4. Webpage Extraction (Trafilatura full-text with RSS fallback)
       ↓
  5. Text Cleaning (Boilerplate removal, lowercase normalization)
       ↓
  6. Database Storage (Insert new articles into nuzio_ai.news_articles)
       ↓
  7. TF-IDF Clustering (Connected components cosine similarity >= 0.30)
       ↓
  8. Cluster Label Generation (N-gram key term extraction)
       ↓
  9. Persist Assignments (Save to nuzio_ai.news_clusters & update articles)
       ↓
   COMPLETED
```

---

## Starting the FastAPI Service

To launch the service locally with Uvicorn:

```powershell
cd C:\Users\niran\Desktop\Nuzio.Ai\Ai_Service
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Running Test Suites

```powershell
cd c:\Users\niran\Desktop\Nuzio.Ai\Ai_Service
.\venv\Scripts\Activate.ps1

# Phase 5: FastAPI REST API Layer (Full API suite & background jobs)
python test_phase5.py

# Phase 4: TF-IDF, Cosine Similarity & Clustering
python test_phase4.py

# Phase 3: PostgreSQL Schema, Repository & Deduplication
python test_phase3.py

# Phase 2: Article Extraction & Trafilatura Fallback
python test_phase2.py

# Phase 1: RSS Ingestion & Normalization
python test_phase1.py
```

