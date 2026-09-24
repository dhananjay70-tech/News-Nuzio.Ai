"""Deduplication and Hashing Utilities for Ingested News Articles.

Provides URL canonicalization and deterministic SHA-256 hashing to prevent duplicate
article storage and processing across recurring ingestion pipelines.
"""

import hashlib
import logging
from typing import Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from app.processing.cleaner import clean_text

logger = logging.getLogger(__name__)

# Common tracking parameters to strip during URL canonicalization
TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "at_medium",
    "at_campaign",
    "at_custom1",
    "at_custom2",
    "at_custom3",
    "at_custom4",
    "fbclid",
    "gclid",
    "ref",
    "source",
}


def canonicalize_url(url: str) -> str:
    """Normalize and canonicalize an article URL by stripping tracking parameters."""
    if not url:
        return ""

    try:
        parsed = urlparse(url.strip())
        # Lowercase scheme and network location
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()

        # Remove standard default ports
        if ":" in netloc:
            host, port = netloc.split(":", 1)
            if (scheme == "http" and port == "80") or (scheme == "https" and port == "443"):
                netloc = host

        # Normalize path
        path = parsed.path
        if path.endswith("/") and len(path) > 1:
            path = path[:-1]

        # Filter out tracking query params
        query_params = parse_qs(parsed.query, keep_blank_values=False)
        filtered_params = {
            k: v for k, v in query_params.items() if k.lower() not in TRACKING_PARAMS
        }
        clean_query = urlencode(filtered_params, doseq=True)

        return urlunparse((scheme, netloc, path, parsed.params, clean_query, ""))
    except Exception as e:
        logger.debug(f"URL canonicalization failed for '{url}': {e}")
        return url.strip()


def generate_content_hash(
    title: str,
    cleaned_content: Optional[str] = None,
    canonical_url: Optional[str] = None
) -> str:
    """Generate a deterministic SHA-256 hash representing the unique article content.

    Combines canonical title and primary body text (or URL if content is minimal)
    to detect identical or re-published stories.
    """
    # Normalize title and content for stable hashing
    norm_title = clean_text(title).lower()
    norm_content = clean_text(cleaned_content or "").lower()

    if len(norm_content) >= 50:
        # Use title + primary text body for content hash
        hash_input = f"{norm_title}|{norm_content[:1000]}"
    elif canonical_url:
        # Fallback to title + canonical URL if body text is brief
        hash_input = f"{norm_title}|{canonicalize_url(canonical_url)}"
    else:
        hash_input = norm_title

    return hashlib.sha256(hash_input.encode("utf-8")).hexdigest()
