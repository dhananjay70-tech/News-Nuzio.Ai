"""TF-IDF Vectorization for Ingested News Articles.

Transforms cleaned headline, summary, and article body text into sparse TF-IDF
vector representations using scikit-learn.
"""

import logging
from typing import Any, List, Optional, Sequence, Tuple, Union

from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer

from app.config import settings
from app.database.models import NewsArticle
from app.processing.cleaner import prepare_article_text

logger = logging.getLogger(__name__)


def build_article_text(article: Union[NewsArticle, dict]) -> str:
    """Combine headline, description, and content into a normalized string for vectorization."""
    if isinstance(article, NewsArticle):
        title = article.title or ""
        desc = article.description or ""
        content = article.cleaned_content or article.content or ""
    elif isinstance(article, dict):
        title = article.get("title") or ""
        desc = article.get("description") or ""
        content = article.get("cleaned_content") or article.get("content") or ""
    else:
        title = getattr(article, "title", "")
        desc = getattr(article, "description", "")
        content = getattr(article, "cleaned_content", None) or getattr(article, "content", "")

    return prepare_article_text(title, desc, content)


def build_corpus(articles: Sequence[Union[NewsArticle, dict]]) -> List[str]:
    """Build a list of normalized text strings from a sequence of articles."""
    return [build_article_text(art) for art in articles]


def create_vectorizer(
    ngram_range: Optional[Tuple[int, int]] = None,
    max_df: Optional[float] = None,
    min_df: int = 1
) -> TfidfVectorizer:
    """Create a configured TfidfVectorizer instance."""
    if ngram_range is None:
        ngram_range = (settings.TFIDF_NGRAM_MIN, settings.TFIDF_NGRAM_MAX)
    if max_df is None:
        max_df = settings.TFIDF_MAX_DF

    return TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        ngram_range=ngram_range,
        min_df=min_df,
        max_df=max_df if max_df > 0 else 1.0,
        sublinear_tf=True,
        token_pattern=r"(?u)\b[a-zA-Z0-9]{2,}\b"
    )


def vectorize_articles(
    texts: List[str],
    ngram_range: Optional[Tuple[int, int]] = None,
    max_df: Optional[float] = None
) -> Tuple[Optional[csr_matrix], Optional[TfidfVectorizer]]:
    """Vectorize a list of article texts into a TF-IDF sparse matrix.

    Handles edge cases like single-word documents, empty corpora, or stopword-only texts gracefully.

    Returns:
        Tuple of (tfidf_matrix, fitted_vectorizer). Returns (None, None) if corpus is empty.
    """
    if not texts:
        logger.warning("Empty text collection provided for vectorization.")
        return None, None

    # Replace completely empty strings with placeholder token to avoid empty vocabulary errors
    sanitized_texts = [t if t.strip() else "general news" for t in texts]

    # For very small corpora (< 10 documents), use max_df=1.0 so shared terms are not filtered out
    eff_max_df = 1.0 if len(sanitized_texts) < 10 else (max_df or settings.TFIDF_MAX_DF)

    vectorizer = create_vectorizer(ngram_range=ngram_range, max_df=eff_max_df)

    try:
        tfidf_matrix = vectorizer.fit_transform(sanitized_texts)
        logger.debug(
            f"Vectorized {len(texts)} documents into TF-IDF matrix with shape {tfidf_matrix.shape}"
        )
        return tfidf_matrix, vectorizer
    except ValueError as val_err:
        # Fallback if max_df filtering eliminated all terms (e.g. all 2 docs have same words)
        logger.debug(f"Retrying TF-IDF with relaxed max_df due to: {val_err}")
        fallback_vec = TfidfVectorizer(
            lowercase=True,
            stop_words="english",
            ngram_range=(1, 1),
            min_df=1,
            sublinear_tf=True
        )
        try:
            tfidf_matrix = fallback_vec.fit_transform(sanitized_texts)
            return tfidf_matrix, fallback_vec
        except Exception as exc:
            logger.error(f"Failed to vectorize corpus even with fallback: {exc}")
            return None, None
