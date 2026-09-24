"""FastAPI Router for News and Timeline delivery."""

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.database.repository import get_timeline_articles

logger = logging.getLogger(__name__)

router = APIRouter(tags=["News"])


class TimelineArticleItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    url: Optional[str] = None
    source: str
    published_at: datetime
    cluster_id: Optional[int] = None
    cluster_label: Optional[str] = None


TimelineArticle = TimelineArticleItem


class TimelineResponse(BaseModel):
    articles: List[TimelineArticleItem]
    count: int


def _validate_iso_date(value: Optional[str], param_name: str) -> Optional[str]:
    """Validate that a date string is in valid ISO 8601 format."""
    if not value:
        return None
    try:
        # Handles 2026-09-24, 2026-09-24T10:00:00, 2026-09-24T10:00:00Z, 2026-09-24T10:00:00+00:00
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format for '{param_name}'. Expected ISO 8601 string (e.g. 2026-09-24T10:00:00Z)."
        )


@router.get("/timeline", response_model=TimelineResponse, summary="Get chronologically ordered news timeline")
def get_timeline(
    source: Optional[str] = Query(default=None, description="Filter articles by news publisher source"),
    cluster_id: Optional[int] = Query(default=None, ge=1, description="Filter by topic cluster ID"),
    from_date: Optional[str] = Query(default=None, alias="from", description="ISO start date filter"),
    to_date: Optional[str] = Query(default=None, alias="to", description="ISO end date filter"),
    limit: int = Query(default=50, ge=1, le=500, description="Max timeline articles to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset")
):
    """Retrieve articles formatted and sorted for timeline visualization."""
    # Validate date parameters
    _validate_iso_date(from_date, "from")
    _validate_iso_date(to_date, "to")

    try:
        raw_articles = get_timeline_articles(
            source=source,
            cluster_id=cluster_id,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            offset=offset
        )

        articles = [
            TimelineArticleItem(
                id=row["id"],
                title=row["title"],
                description=row.get("description"),
                url=row.get("url"),
                source=row["source"],
                published_at=row["published_at"],
                cluster_id=row.get("cluster_id"),
                cluster_label=row.get("cluster_label")
            )
            for row in raw_articles
        ]

        return TimelineResponse(articles=articles, count=len(articles))

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error generating timeline: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate news timeline"
        )

