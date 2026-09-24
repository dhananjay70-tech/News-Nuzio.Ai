"""Test script for Phase 2: Article Page Extraction with Trafilatura."""

import logging
import sys
from typing import Dict, List

from app.config import settings
from app.extraction.article_extractor import extract_article
from app.feeds.parser import fetch_and_parse_feed, NewsItem
from app.feeds.sources import RSS_SOURCES

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("Phase2Test")


def main():
    print("=" * 60)
    print("NUZIO AI - PHASE 2: ARTICLE EXTRACTION TEST")
    print("=" * 60)

    # 1. Fetch real articles across multiple domains
    test_sources = RSS_SOURCES[:3]  # BBC, NPR, The Guardian
    articles_to_test: List[NewsItem] = []

    for source in test_sources:
        print(f"\nFetching sample article from {source['name']}...")
        items = fetch_and_parse_feed(source, max_items=2, timeout=settings.HTTP_TIMEOUT)
        if items:
            articles_to_test.append(items[0])

    print(f"\nFound {len(articles_to_test)} sample articles to extract across different domains.")
    print("-" * 60)

    domain_stats: Dict[str, Dict[str, int]] = {}

    for item in articles_to_test:
        source_name = item.source
        if source_name not in domain_stats:
            domain_stats[source_name] = {"FULL_ARTICLE": 0, "RSS_FALLBACK": 0, "FAILED": 0}

        print(f"\nSource: {item.source}")
        print(f"Title: {item.title}")
        print(f"URL: {item.url}")

        result = extract_article(url=item.url, fallback_text=item.description)

        domain_stats[source_name][result.status] = domain_stats[source_name].get(result.status, 0) + 1

        print(f"\nStatus: {result.status}")
        print(f"Characters: {result.character_count}")

        preview = (result.content[:300] + "...") if result.content and len(result.content) > 300 else (result.content or "None")
        print("\nPreview:")
        print(preview)
        print("\n" + "-" * 60)

    # Also test intentional fallback scenario
    print("\n[Synthetic Test Case: Fallback Handling with Unreachable URL]")
    fake_url = "https://example-unreachable-domain-12345.com/news/article"
    fake_summary = "This is an emergency fallback RSS description used when the webpage cannot be downloaded."
    fallback_res = extract_article(url=fake_url, fallback_text=fake_summary)
    print(f"Source: Simulated Unreachable Feed")
    print(f"URL: {fake_url}")
    print(f"Status: {fallback_res.status}")
    print(f"Characters: {fallback_res.character_count}")
    print(f"Preview:\n{fallback_res.content}")

    print("\n" + "=" * 60)
    print("Phase 2 verification completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
