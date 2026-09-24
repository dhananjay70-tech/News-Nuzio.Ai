"""FastAPI routers and API models for Nuzio AI."""

from app.api.clusters import (
    ClusterArticleItem,
    ClusterDetail,
    ClusterDetailResponse,
    ClustersListResponse,
    ClusterSummary,
    ClusterSummaryItem,
    router as clusters_router,
)
from app.api.ingestion import (
    InMemoryJobRegistry,
    IngestionJob,
    IngestionTriggerResponse,
    JobStatus,
    TriggerResponse,
    job_registry,
    router as ingestion_router,
)
from app.api.news import (
    TimelineArticle,
    TimelineArticleItem,
    TimelineResponse,
    router as news_router,
)

__all__ = [
    "clusters_router",
    "news_router",
    "ingestion_router",
    "ClusterSummaryItem",
    "ClustersListResponse",
    "ClusterArticleItem",
    "ClusterDetailResponse",
    "ClusterSummary",
    "ClusterDetail",
    "TimelineArticleItem",
    "TimelineArticle",
    "TimelineResponse",
    "JobStatus",
    "TriggerResponse",
    "IngestionJob",
    "IngestionTriggerResponse",
    "InMemoryJobRegistry",
    "job_registry",
]
