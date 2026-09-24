"""FastAPI Router and Background Job Manager for Ingestion."""

import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.pipeline import run_full_ingestion

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

STATUS_QUEUED = "QUEUED"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"


class JobStatus(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    job_id: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    articles_fetched: int = 0
    articles_inserted: int = 0
    articles_skipped: int = 0
    clusters_created: int = 0
    error: Optional[str] = None


class TriggerResponse(BaseModel):
    job_id: str
    status: str


# Type aliases matching Phase 5 specifications
IngestionJob = JobStatus
IngestionTriggerResponse = TriggerResponse


class InMemoryJobRegistry:
    """Thread-safe in-memory registry of background ingestion tasks."""

    def __init__(self):
        self._jobs: Dict[str, dict] = {}
        self._lock = threading.Lock()

    def create_job(self) -> str:
        job_id = uuid.uuid4().hex[:12]
        with self._lock:
            self._jobs[job_id] = {
                "job_id": job_id,
                "status": STATUS_QUEUED,
                "started_at": datetime.now(timezone.utc),
                "completed_at": None,
                "articles_fetched": 0,
                "articles_inserted": 0,
                "articles_skipped": 0,
                "clusters_created": 0,
                "error": None,
            }
        return job_id

    def update_job(self, job_id: str, **kwargs) -> None:
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(kwargs)

    def get_job(self, job_id: str) -> Optional[JobStatus]:
        with self._lock:
            data = self._jobs.get(job_id)
            if data:
                return JobStatus(**data)
            return None

    def clear(self) -> None:
        """Clear all registered jobs (useful for testing)."""
        with self._lock:
            self._jobs.clear()


job_registry = InMemoryJobRegistry()


def _execute_ingestion_worker(job_id: str, max_items: Optional[int] = None) -> None:
    """Worker task executed asynchronously in the background."""
    logger.info(f"Starting background ingestion job {job_id}")
    job_registry.update_job(job_id, status=STATUS_RUNNING)

    try:
        result = run_full_ingestion(max_items_per_feed=max_items)

        if result.error:
            job_registry.update_job(
                job_id,
                status=STATUS_FAILED,
                completed_at=datetime.now(timezone.utc),
                articles_fetched=result.articles_fetched,
                articles_inserted=result.articles_inserted,
                articles_skipped=result.articles_skipped,
                clusters_created=result.clusters_created,
                error=result.error
            )
            logger.error(f"Ingestion job {job_id} failed: {result.error}")
        else:
            job_registry.update_job(
                job_id,
                status=STATUS_COMPLETED,
                completed_at=datetime.now(timezone.utc),
                articles_fetched=result.articles_fetched,
                articles_inserted=result.articles_inserted,
                articles_skipped=result.articles_skipped,
                clusters_created=result.clusters_created,
                error=None
            )
            logger.info(f"Ingestion job {job_id} completed successfully.")

    except Exception as exc:
        err = str(exc)
        logger.error(f"Unexpected error in worker for job {job_id}: {err}", exc_info=True)
        job_registry.update_job(
            job_id,
            status=STATUS_FAILED,
            completed_at=datetime.now(timezone.utc),
            error=err
        )


@router.post("/trigger", response_model=TriggerResponse, status_code=status.HTTP_200_OK, summary="Trigger background ingestion job")
def trigger_ingestion():
    """Trigger a full RSS ingestion, extraction, deduplication, and topic clustering job in the background."""
    job_id = job_registry.create_job()
    thread = threading.Thread(target=_execute_ingestion_worker, args=(job_id,), daemon=True)
    thread.start()
    return TriggerResponse(job_id=job_id, status=STATUS_QUEUED)


@router.get("/status/{job_id}", response_model=JobStatus, summary="Check status of an ingestion job")
def get_ingestion_status(job_id: str):
    """Check current status, execution timestamps, and article metrics for an ingestion job."""
    job = job_registry.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ingestion job '{job_id}' not found"
        )
    return job

