"""Text Cleaner for Natural Language Processing and Clustering.

Normalizes text, strips HTML residue, normalizes whitespace, and cleans punctuation
while preserving key news terminology and named entities.
"""

import html
import re
import unicodedata
from typing import Optional
from bs4 import BeautifulSoup


def clean_html(text: Optional[str]) -> str:
    """Strip HTML tags and unescape HTML entities."""
    if not text:
        return ""
    try:
        # Unescape HTML entities
        unescaped = html.unescape(text)
        # Parse and remove HTML markup
        soup = BeautifulSoup(unescaped, "html.parser")
        return soup.get_text(separator=" ", strip=True)
    except Exception:
        # Regex fallback if parser fails
        clean = re.sub(r"<[^>]+>", " ", text)
        return html.unescape(clean)


def normalize_unicode(text: str) -> str:
    """Normalize unicode characters (e.g. curly quotes, em-dashes, non-breaking spaces)."""
    if not text:
        return ""
    # NFKC normalizes characters to standard compatibility forms
    normalized = unicodedata.normalize("NFKC", text)
    # Replace stylized quotes and hyphens
    normalized = (
        normalized.replace("“", '"')
        .replace("”", '"')
        .replace("‘", "'")
        .replace("’", "'")
        .replace("—", " - ")
        .replace("–", " - ")
        .replace("…", " ")
        .replace("\xa0", " ")
    )
    return normalized


def clean_text(text: Optional[str]) -> str:
    """Clean and normalize a raw text string for NLP vectorization."""
    if not text or not isinstance(text, str):
        return ""

    # 1. Strip HTML tags and entities
    text = clean_html(text)

    # 2. Normalize unicode symbols and quotes
    text = normalize_unicode(text)

    # 3. Strip URLs if leftover in text
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)

    # 4. Remove uninformative symbols / control characters while keeping standard alphanumerics and punctuation
    text = re.sub(r"[^\w\s\.,!?'\"-]", " ", text)

    # 5. Normalize and collapse multiple whitespaces, tabs, newlines
    text = re.sub(r"\s+", " ", text).strip()

    return text


def prepare_article_text(
    title: str,
    description: Optional[str] = None,
    content: Optional[str] = None
) -> str:
    """Combine and clean headline, summary, and article body for NLP clustering.

    Gives extra weight to headline terms by placing the title prominently.
    """
    parts = []
    if title:
        parts.append(title.strip())
        parts.append(title.strip())
    if description:
        parts.append(description.strip())
    if content:
        parts.append(content.strip())

    combined = " \n ".join(parts)
    return clean_text(combined)
