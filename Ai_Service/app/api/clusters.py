"""FastAPI Router for Topic Clusters."""

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict

from app.database.repository import (
    get_cluster_articles,
    get_cluster_by_id,
    get_clusters_summary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clusters", tags=["Clusters"])


class ClusterSummaryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    article_count: int
    latest_published_at: Optional[datetime] = None


class ClustersListResponse(BaseModel):
    clusters: List[ClusterSummaryItem]
    count: int


class ClusterArticleItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    url: str
    source: str
    published_at: datetime


class ClusterDetailResponse(BaseModel):
    id: int
    label: str
    articles: List[ClusterArticleItem]


# Type aliases matching Phase 5 specifications
ClusterSummary = ClusterSummaryItem
ClusterDetail = ClusterDetailResponse


@router.get("", response_model=ClustersListResponse, summary="List all topic clusters")
@router.get("/", response_model=ClustersListResponse, include_in_schema=False)
def list_clusters(
    limit: int = Query(default=100, ge=1, le=500, description="Max clusters to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination")
):
    """Retrieve all current topic clusters with article count and latest article publication date."""
    try:
        cluster_rows = get_clusters_summary(limit=limit, offset=offset)
        items = [
            ClusterSummaryItem(
                id=row["id"],
                label=row["label"],
                article_count=row["article_count"] or 0,
                latest_published_at=row["latest_published_at"]
            )
            for row in cluster_rows
        ]
        return ClustersListResponse(clusters=items, count=len(items))
    except Exception as exc:
        logger.error(f"Error fetching clusters: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve topic clusters"
        )


@router.get("/{cluster_id}", response_model=ClusterDetailResponse, summary="Get cluster details and articles")
def get_cluster(cluster_id: int):
    """Retrieve a topic cluster and all articles belonging to it."""
    try:
        cluster = get_cluster_by_id(cluster_id)
        if not cluster:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Topic cluster {cluster_id} not found"
            )

        article_models = get_cluster_articles(cluster_id)
        articles = [
            ClusterArticleItem(
                id=art.id,
                title=art.title,
                description=art.description,
                url=art.url,
                source=art.source,
                published_at=art.published_at
            )
            for art in article_models
            if art.id is not None
        ]

        return ClusterDetailResponse(
            id=cluster.id,
            label=cluster.label,
            articles=articles
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error fetching cluster {cluster_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve cluster details"
        )
