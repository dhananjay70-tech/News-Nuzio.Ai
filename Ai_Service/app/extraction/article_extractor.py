"""Webpage Article Content Extractor using Trafilatura.

Downloads article HTML from a given URL, extracts the primary body text,
and falls back to RSS summaries if full webpage extraction fails or produces
insufficient content.
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

import trafilatura

from app.config import settings

logger = logging.getLogger(__name__)

STATUS_FULL_ARTICLE = "FULL_ARTICLE"
STATUS_RSS_FALLBACK = "RSS_FALLBACK"
STATUS_FAILED = "FAILED"


@dataclass
class ExtractionResult:
    """Represents the outcome of extracting article content."""
    success: bool
    content: Optional[str]
    status: str  # FULL_ARTICLE | RSS_FALLBACK | FAILED
    character_count: int = 0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to a dictionary."""
        return {
            "success": self.success,
            "status": self.status,
            "character_count": self.character_count,
            "content_preview": (self.content[:300] + "...") if self.content and len(self.content) > 300 else self.content,
            "error": self.error,
        }


def extract_article(
    url: str,
    fallback_text: Optional[str] = None,
    min_length: Optional[int] = None
) -> ExtractionResult:
    """Download and extract main article body text from URL.

    Falls back to `fallback_text` (e.g. RSS description) if webpage extraction fails
    or extracted text is shorter than `min_length`.

    Args:
        url: Canonical URL of the news article.
        fallback_text: Optional fallback summary (usually RSS description).
        min_length: Minimum character threshold for a valid full article.

    Returns:
        ExtractionResult indicating status, text, and diagnostics.
    """
    if min_length is None:
        min_length = settings.MIN_ARTICLE_CONTENT_LENGTH

    cleaned_fallback = fallback_text.strip() if fallback_text and fallback_text.strip() else None

    if not url or not isinstance(url, str):
        err = "Invalid or missing URL provided for extraction."
        logger.warning(err)
        if cleaned_fallback:
            return ExtractionResult(
                success=True,
                content=cleaned_fallback,
                status=STATUS_RSS_FALLBACK,
                character_count=len(cleaned_fallback),
                error=err
            )
        return ExtractionResult(
            success=False,
            content=None,
            status=STATUS_FAILED,
            character_count=0,
            error=err
        )

    logger.debug(f"Attempting full page extraction for: {url}")

    try:
        # Download webpage content with trafilatura
        downloaded = trafilatura.fetch_url(url)

        if not downloaded:
            err_msg = f"Failed to fetch HTML content from {url} (empty or unreachable response)"
            logger.info(err_msg)
            if cleaned_fallback:
                return ExtractionResult(
                    success=True,
                    content=cleaned_fallback,
                    status=STATUS_RSS_FALLBACK,
                    character_count=len(cleaned_fallback),
                    error=err_msg
                )
            return ExtractionResult(
                success=False,
                content=None,
                status=STATUS_FAILED,
                character_count=0,
                error=err_msg
            )

        # Extract main text from downloaded HTML
        extracted_text = trafilatura.extract(
            downloaded,
            url=url,
            include_comments=False,
            include_tables=False,
            no_fallback=False
        )

        if extracted_text and len(extracted_text.strip()) >= min_length:
            final_text = extracted_text.strip()
            logger.debug(f"Successfully extracted {len(final_text)} chars from {url}")
            return ExtractionResult(
                success=True,
                content=final_text,
                status=STATUS_FULL_ARTICLE,
                character_count=len(final_text),
                error=None
            )

        # Extracted content was empty or shorter than minimum required length
        short_err = (
            f"Extracted content length ({len(extracted_text.strip()) if extracted_text else 0} chars) "
            f"below minimum threshold of {min_length} chars."
        )
        logger.info(f"{short_err} Falling back to RSS description for {url}")

        if cleaned_fallback:
            return ExtractionResult(
                success=True,
                content=cleaned_fallback,
                status=STATUS_RSS_FALLBACK,
                character_count=len(cleaned_fallback),
                error=short_err
            )

        return ExtractionResult(
            success=False,
            content=None,
            status=STATUS_FAILED,
            character_count=0,
            error=short_err
        )

    except Exception as exc:
        exc_msg = f"Exception during article extraction for {url}: {exc}"
        logger.error(exc_msg)
        if cleaned_fallback:
            return ExtractionResult(
                success=True,
                content=cleaned_fallback,
                status=STATUS_RSS_FALLBACK,
                character_count=len(cleaned_fallback),
                error=exc_msg
            )
        return ExtractionResult(
            success=False,
            content=None,
            status=STATUS_FAILED,
            character_count=0,
            error=exc_msg
        )
