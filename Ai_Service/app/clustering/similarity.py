"""Pairwise Cosine Similarity Computation for News Clustering.

Computes cosine similarity matrices between TF-IDF document vectors and identifies
strongly correlated article pairs according to configurable similarity thresholds.
"""

import logging
from typing import List, Optional, Tuple

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import cosine_similarity

from app.config import settings

logger = logging.getLogger(__name__)


def compute_similarity_matrix(tfidf_matrix: csr_matrix) -> np.ndarray:
    """Compute NxN pairwise cosine similarity matrix from a TF-IDF sparse matrix."""
    if tfidf_matrix is None or tfidf_matrix.shape[0] == 0:
        return np.zeros((0, 0), dtype=float)

    similarity_matrix = cosine_similarity(tfidf_matrix, tfidf_matrix)
    # Ensure diagonal is exactly 1.0
    np.fill_diagonal(similarity_matrix, 1.0)
    return similarity_matrix


def find_similar_pairs(
    similarity_matrix: np.ndarray,
    threshold: Optional[float] = None
) -> List[Tuple[int, int, float]]:
    """Identify all unique document pairs (i, j) where cosine similarity exceeds the threshold.

    Args:
        similarity_matrix: NxN pairwise similarity matrix.
        threshold: Minimum similarity threshold (defaults to settings.CLUSTER_SIMILARITY_THRESHOLD).

    Returns:
        List of tuples: (index_i, index_j, similarity_score) with i < j.
    """
    if threshold is None:
        threshold = settings.CLUSTER_SIMILARITY_THRESHOLD

    n_docs = similarity_matrix.shape[0]
    pairs = []

    for i in range(n_docs):
        for j in range(i + 1, n_docs):
            score = float(similarity_matrix[i, j])
            if score >= threshold:
                pairs.append((i, j, score))

    logger.debug(f"Found {len(pairs)} pairs with similarity >= {threshold} among {n_docs} documents.")
    return pairs
