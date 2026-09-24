"""Centralized registry of verified public RSS sources."""

from typing import Dict, List

RSS_SOURCES: List[Dict[str, str]] = [
    {
        "name": "BBC News",
        "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "category": "World"
    },
    {
        "name": "NPR News",
        "url": "https://feeds.npr.org/1001/rss.xml",
        "category": "General"
    },
    {
        "name": "The Guardian",
        "url": "https://www.theguardian.com/world/rss",
        "category": "World"
    },
    {
        "name": "TechCrunch",
        "url": "https://techcrunch.com/feed/",
        "category": "Technology"
    },
    {
        "name": "Al Jazeera",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "category": "World"
    }
]
