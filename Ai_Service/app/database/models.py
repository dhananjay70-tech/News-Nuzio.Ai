"""Data models representing database entities for the AI News Service."""

from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any, Dict, Optional


@dataclass
class NewsCluster:
    """Represents a topic cluster of news articles."""
    id: Optional[int]
    label: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert NewsCluster to a JSON-serializable dictionary."""
        return {
            "id": self.id,
            "label": self.label,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "NewsCluster":
        """Instantiate NewsCluster from a database row dictionary."""
        return cls(
            id=row["id"],
            label=row["label"],
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )


@dataclass
class NewsArticle:
    """Represents an ingested news article in the AI service database."""
    title: str
    url: str
    source: str
    published_at: datetime
    content_hash: str
    id: Optional[int] = None
    description: Optional[str] = None
    content: Optional[str] = None
    cleaned_content: Optional[str] = None
    cluster_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert NewsArticle to a JSON-serializable dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "content": self.content,
            "cleaned_content": self.cleaned_content,
            "url": self.url,
            "source": self.source,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "content_hash": self.content_hash,
            "cluster_id": self.cluster_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "NewsArticle":
        """Instantiate NewsArticle from a database row dictionary."""
        return cls(
            id=row["id"],
            title=row["title"],
            description=row.get("description"),
            content=row.get("content"),
            cleaned_content=row.get("cleaned_content"),
            url=row["url"],
            source=row["source"],
            published_at=row["published_at"],
            content_hash=row["content_hash"],
            cluster_id=row.get("cluster_id"),
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )
