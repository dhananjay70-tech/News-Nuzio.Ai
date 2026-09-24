"""RSS Feed Parser and Normalizer.

Fetches RSS/Atom feeds, extracts standard fields, normalizes publication
timestamps to UTC, and produces typed NewsItem objects.
"""

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import feedparser
from bs4 import BeautifulSoup
from dateutil import parser as dateutil_parser

logger = logging.getLogger(__name__)


@dataclass
class NewsItem:
    """Normalized internal representation of an ingested news item."""
    title: str
    description: str
    url: str
    source: str
    published_at: datetime
    category: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert NewsItem to a JSON-serializable dictionary."""
        return {
            "title": self.title,
            "description": self.description,
            "url": self.url,
            "source": self.source,
            "published_at": self.published_at.isoformat(),
            "category": self.category,
        }


def _clean_html_text(raw_html: Optional[str]) -> str:
    """Remove HTML tags and extra whitespaces from text."""
    if not raw_html:
        return ""
    try:
        soup = BeautifulSoup(raw_html, "html.parser")
        text = soup.get_text(separator=" ", strip=True)
        return " ".join(text.split())
    except Exception:
        return " ".join(raw_html.split())


def _parse_published_date(entry: Any) -> datetime:
    """Parse various RSS date formats into a UTC-aware datetime object."""
    # 1. Try feedparser's parsed struct_time (published_parsed or updated_parsed)
    struct_time = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if struct_time:
        try:
            timestamp = time.mktime(struct_time)
            return datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except Exception:
            pass

    # 2. Try raw string fields (published, pubDate, updated, created)
    for field in ["published", "pubDate", "updated", "created", "dc:date"]:
        date_str = getattr(entry, field, None) or (entry.get(field) if isinstance(entry, dict) else None)
        if date_str:
            try:
                parsed_dt = dateutil_parser.parse(date_str)
                if parsed_dt.tzinfo is None:
                    parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
                else:
                    parsed_dt = parsed_dt.astimezone(timezone.utc)
                return parsed_dt
            except Exception:
                continue

    # Fallback to current UTC time if date cannot be resolved
    logger.debug("Publication date not found or malformed in RSS entry. Falling back to UTC now.")
    return datetime.now(timezone.utc)


def _extract_url(entry: Any) -> Optional[str]:
    """Extract canonical article URL from RSS entry."""
    # Try direct link
    url = getattr(entry, "link", None) or (entry.get("link") if isinstance(entry, dict) else None)
    if not url:
        # Check links list
        links = getattr(entry, "links", []) or (entry.get("links", []) if isinstance(entry, dict) else [])
        for link_obj in links:
            if isinstance(link_obj, dict) and link_obj.get("rel") == "alternate":
                url = link_obj.get("href")
                break
            elif isinstance(link_obj, dict) and link_obj.get("href"):
                url = link_obj.get("href")
                break

    if not url or not isinstance(url, str):
        return None

    url = url.strip()
    # Basic URL validation
    parsed = urlparse(url)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return url
    return None


def _extract_description(entry: Any) -> str:
    """Extract and sanitize description or summary from RSS entry."""
    raw_desc = (
        getattr(entry, "summary", None)
        or getattr(entry, "description", None)
        or (entry.get("summary") if isinstance(entry, dict) else None)
        or (entry.get("description") if isinstance(entry, dict) else None)
    )

    # If description is a dictionary / object (e.g. content array in Atom)
    if not raw_desc and hasattr(entry, "content"):
        content_list = getattr(entry, "content", [])
        if content_list and isinstance(content_list, list) and len(content_list) > 0:
            first_c = content_list[0]
            if isinstance(first_c, dict):
                raw_desc = first_c.get("value", "")

    return _clean_html_text(raw_desc)


def parse_feed_entry(entry: Any, source_name: str, default_category: Optional[str] = None) -> Optional[NewsItem]:
    """Parse a single feed entry into a normalized NewsItem.

    Returns None if the entry is invalid or missing critical fields.
    """
    raw_title = getattr(entry, "title", None) or (entry.get("title") if isinstance(entry, dict) else None)
    title = _clean_html_text(raw_title)
    if not title:
        return None

    url = _extract_url(entry)
    if not url:
        return None

    description = _extract_description(entry)
    published_at = _parse_published_date(entry)

    # Category fallback
    category = None
    if hasattr(entry, "tags") and entry.tags:
        tags = [t.term for t in entry.tags if hasattr(t, "term") and t.term]
        if tags:
            category = tags[0]
    if not category:
        category = default_category

    return NewsItem(
        title=title,
        description=description,
        url=url,
        source=source_name,
        published_at=published_at,
        category=category,
    )


def fetch_and_parse_feed(
    source_info: Dict[str, str],
    max_items: int = 30,
    timeout: int = 15
) -> List[NewsItem]:
    """Fetch and parse an RSS feed from source metadata.

    Handles feed failures and malformed entries gracefully.
    """
    source_name = source_info.get("name", "Unknown")
    feed_url = source_info.get("url")
    category = source_info.get("category")

    if not feed_url:
        logger.warning(f"Skipping source '{source_name}' due to missing URL.")
        return []

    logger.info(f"Fetching RSS feed for '{source_name}' from: {feed_url}")
    try:
        parsed_feed = feedparser.parse(
            feed_url,
            agent="Mozilla/5.0 (compatible; NuzioAI-NewsService/1.0)",
            request_headers={"User-Agent": "Mozilla/5.0 (compatible; NuzioAI-NewsService/1.0)"}
        )

        if parsed_feed.bozo and not parsed_feed.entries:
            logger.warning(
                f"Feed '{source_name}' encountered parsing error: {parsed_feed.bozo_exception}"
            )
            return []

        entries = parsed_feed.entries[:max_items]
        logger.info(f"Found {len(parsed_feed.entries)} entries from '{source_name}', parsing up to {len(entries)} items.")

        items: List[NewsItem] = []
        for entry in entries:
            try:
                item = parse_feed_entry(entry, source_name=source_name, default_category=category)
                if item:
                    items.append(item)
            except Exception as item_err:
                logger.debug(f"Failed to parse an entry from '{source_name}': {item_err}")
                continue

        logger.info(f"Successfully extracted {len(items)} normalized articles from '{source_name}'.")
        return items

    except Exception as exc:
        logger.error(f"Error fetching RSS feed '{source_name}' ({feed_url}): {exc}", exc_info=True)
        return []


def fetch_all_feeds(
    sources: List[Dict[str, str]],
    max_items_per_feed: int = 30,
    timeout: int = 15
) -> List[NewsItem]:
    """Fetch and normalize articles from all configured RSS sources."""
    all_items: List[NewsItem] = []
    for source in sources:
        items = fetch_and_parse_feed(source, max_items=max_items_per_feed, timeout=timeout)
        all_items.extend(items)
    return all_items
