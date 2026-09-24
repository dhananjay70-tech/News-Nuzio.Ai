"""Test script for Phase 1: RSS Feeds Fetching and Normalization."""

import json
import logging
import sys

from app.config import settings
from app.feeds.sources import RSS_SOURCES
from app.feeds.parser import fetch_all_feeds

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("Phase1Test")


def main():
    print("=" * 70)
    print("NUZIO AI - PHASE 1: RSS INGESTION & NORMALIZATION TEST")
    print("=" * 70)

    print(f"\nConfigured RSS Sources count: {len(RSS_SOURCES)}")
    for s in RSS_SOURCES:
        print(f" - [{s.get('name')}] ({s.get('category')}): {s.get('url')}")

    print("\nFetching and normalizing articles...")
    items = fetch_all_feeds(RSS_SOURCES, max_items_per_feed=5, timeout=settings.HTTP_TIMEOUT)

    print(f"\nTotal normalized articles retrieved: {len(items)}")

    if not items:
        print("ERROR: No articles could be fetched or parsed!")
        sys.exit(1)

    print("\nSample Ingested Articles (Normalized Format):")
    print("-" * 70)
    for idx, item in enumerate(items[:3], 1):
        print(f"\nArticle #{idx}:")
        print(json.dumps(item.to_dict(), indent=2))

    print("\n" + "=" * 70)
    print("Phase 1 verification completed successfully!")
    print("=" * 70)


if __name__ == "__main__":
    main()
