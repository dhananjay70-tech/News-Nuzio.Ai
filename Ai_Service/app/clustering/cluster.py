"""Topic Clustering and Cluster Label Generation.

Groups articles into coherent topic clusters using TF-IDF vectorization, pairwise
cosine similarity, and graph connected components. Automatically extracts human-readable
topic labels from significant cluster terms or representative headlines.
"""

import logging
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer

from app.config import settings
from app.clustering.similarity import compute_similarity_matrix, find_similar_pairs
from app.clustering.tfidf import build_corpus, vectorize_articles
from app.database.models import NewsArticle, NewsCluster
from app.database.repository import (
    batch_update_article_clusters,
    clear_all_clusters,
    clear_clusters_for_articles,
    create_cluster,
    get_articles,
    get_articles_by_ids,
)

logger = logging.getLogger(__name__)


def find_connected_components(
    n_nodes: int,
    pairs: List[Tuple[int, int, float]]
) -> List[List[int]]:
    """Group nodes into connected components based on similarity edges (graph BFS/DFS).

    Args:
        n_nodes: Total number of articles/nodes.
        pairs: List of (node_i, node_j, score) where similarity >= threshold.

    Returns:
        List of connected components (each component is a list of node indices).
    """
    adjacency: Dict[int, Set[int]] = defaultdict(set)
    for i, j, _ in pairs:
        adjacency[i].add(j)
        adjacency[j].add(i)

    visited: Set[int] = set()
    components: List[List[int]] = []

    for node in range(n_nodes):
        if node not in visited:
            component = []
            queue = [node]
            visited.add(node)

            while queue:
                current = queue.pop(0)
                component.append(current)

                for neighbor in adjacency[current]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)

            components.append(sorted(component))

    return components


def find_representative_article_index(
    cluster_indices: List[int],
    similarity_matrix: np.ndarray
) -> int:
    """Find the index of the article closest to the centroid/medoid of the cluster."""
    if len(cluster_indices) <= 1:
        return cluster_indices[0]

    best_idx = cluster_indices[0]
    best_avg_sim = -1.0

    sub_matrix = similarity_matrix[np.ix_(cluster_indices, cluster_indices)]
    avg_similarities = sub_matrix.mean(axis=1)

    max_pos = int(np.argmax(avg_similarities))
    return cluster_indices[max_pos]


def extract_cluster_label(
    cluster_articles: List[NewsArticle],
    representative_article: NewsArticle
) -> str:
    """Generate a concise, human-readable topic label for a cluster.

    Uses cluster-level TF-IDF term importance, falling back to representative headline.
    """
    if not cluster_articles:
        return "General News"

    # Combine headlines and summaries of the cluster articles
    cluster_texts = [
        f"{art.title} {art.description or ''}" for art in cluster_articles
    ]

    try:
        label_vectorizer = TfidfVectorizer(
            lowercase=True,
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
            max_df=1.0,
            token_pattern=r"(?u)\b[a-zA-Z]{3,}\b"
        )
        tfidf_mat = label_vectorizer.fit_transform(cluster_texts)
        feature_names = label_vectorizer.get_feature_names_out()

        # Sum TF-IDF weights across all documents in cluster
        scores = np.asarray(tfidf_mat.sum(axis=0)).flatten()
        top_indices = scores.argsort()[::-1]

        # Extract top meaningful terms
        selected_terms: List[str] = []
        seen_words: Set[str] = set()

        for idx in top_indices:
            term = str(feature_names[idx])
            words = term.split()

            # Skip if words already covered by existing selected ngrams
            if any(w in seen_words for w in words):
                continue

            selected_terms.append(term)
            seen_words.update(words)

            if len(selected_terms) >= 3:
                break

        if selected_terms:
            # Capitalize terms nicely into title
            raw_label = " ".join(selected_terms)
            clean_label = " ".join([w.capitalize() for w in raw_label.split()])
            if len(clean_label.split()) >= 2:
                return clean_label

    except Exception as exc:
        logger.debug(f"TF-IDF label generation fallback triggered: {exc}")

    # Fallback to cleaned representative headline
    fallback_title = re.sub(r"[^\w\s-]", "", representative_article.title).strip()
    words = fallback_title.split()
    if len(words) > 6:
        fallback_title = " ".join(words[:6]) + "..."
    return fallback_title or "General News Update"


def cluster_articles(
    articles: List[NewsArticle],
    threshold: Optional[float] = None
) -> List[Dict[str, Any]]:
    """Cluster a list of articles into topic groups using TF-IDF and Cosine Similarity.

    Args:
        articles: List of NewsArticle models.
        threshold: Cosine similarity threshold (defaults to settings.CLUSTER_SIMILARITY_THRESHOLD).

    Returns:
        List of cluster dictionaries containing labels, article IDs, and representative metadata.
    """
    if not articles:
        return []

    if threshold is None:
        threshold = settings.CLUSTER_SIMILARITY_THRESHOLD

    corpus = build_corpus(articles)
    tfidf_matrix, vectorizer = vectorize_articles(corpus)

    if tfidf_matrix is None:
        # Fallback: place each article into its own individual cluster
        return [
            {
                "label": art.title[:60],
                "article_ids": [art.id] if art.id else [],
                "articles": [art],
                "representative_article": art,
                "size": 1
            }
            for art in articles
        ]

    sim_matrix = compute_similarity_matrix(tfidf_matrix)
    similar_pairs = find_similar_pairs(sim_matrix, threshold=threshold)
    components = find_connected_components(len(articles), similar_pairs)

    clusters: List[Dict[str, Any]] = []

    for comp_indices in components:
        cluster_articles_list = [articles[i] for i in comp_indices]
        rep_idx = find_representative_article_index(comp_indices, sim_matrix)
        representative_art = articles[rep_idx]

        label = extract_cluster_label(cluster_articles_list, representative_art)

        clusters.append({
            "label": label,
            "article_indices": comp_indices,
            "article_ids": [art.id for art in cluster_articles_list if art.id is not None],
            "articles": cluster_articles_list,
            "representative_article": representative_art,
            "size": len(cluster_articles_list)
        })

    logger.info(f"Clustered {len(articles)} articles into {len(clusters)} topic clusters.")
    return clusters


def recluster_and_persist(
    threshold: Optional[float] = None,
    source: Optional[str] = None,
    limit: int = 500,
    article_ids: Optional[List[int]] = None
) -> List[NewsCluster]:
    """Load articles from database, compute clusters, and persist cluster assignments.

    Safely replaces previous cluster assignments in a clean transaction.

    By default this reclusters the whole article table and replaces every existing
    cluster. If `article_ids` is given, only those articles are clustered and only
    their previous clusters are replaced; all other articles and clusters are left
    untouched (`source` and `limit` are ignored). An empty list clusters nothing.
    """
    scoped = article_ids is not None
    if scoped:
        articles = get_articles_by_ids(article_ids)
    else:
        articles = get_articles(source=source, limit=limit)
    if not articles:
        logger.info("No articles found to cluster in database.")
        return []

    clustered_groups = cluster_articles(articles, threshold=threshold)

    # Clean existing cluster assignments
    if scoped:
        clear_clusters_for_articles([art.id for art in articles if art.id is not None])
    else:
        clear_all_clusters()

    persisted_clusters: List[NewsCluster] = []
    assignments: List[Tuple[int, int]] = []

    for group in clustered_groups:
        cluster_record = create_cluster(label=group["label"])
        persisted_clusters.append(cluster_record)

        for art in group["articles"]:
            if art.id is not None:
                assignments.append((cluster_record.id, art.id))

    if assignments:
        batch_update_article_clusters(assignments)

    logger.info(
        f"Persisted {len(persisted_clusters)} clusters across {len(assignments)} articles in nuzio_ai."
    )
    return persisted_clusters
