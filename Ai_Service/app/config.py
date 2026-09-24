"""Configuration settings loaded from environment variables."""

import os
from dataclasses import dataclass
from dotenv import load_dotenv

# Load .env file from project root
load_dotenv()


@dataclass(frozen=True)
class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/nuzio_ai"
    )
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    CLUSTER_SIMILARITY_THRESHOLD: float = float(
        os.getenv("CLUSTER_SIMILARITY_THRESHOLD", "0.30")
    )
    TFIDF_NGRAM_MIN: int = int(os.getenv("TFIDF_NGRAM_MIN", "1"))
    TFIDF_NGRAM_MAX: int = int(os.getenv("TFIDF_NGRAM_MAX", "1"))
    TFIDF_MAX_DF: float = float(os.getenv("TFIDF_MAX_DF", "0.90"))
    MAX_ARTICLES_PER_FEED: int = int(os.getenv("MAX_ARTICLES_PER_FEED", "30"))
    MIN_ARTICLE_CONTENT_LENGTH: int = int(os.getenv("MIN_ARTICLE_CONTENT_LENGTH", "200"))
    HTTP_TIMEOUT: int = int(os.getenv("HTTP_TIMEOUT", "15"))
    USER_AGENT: str = os.getenv(
        "USER_AGENT",
        "Mozilla/5.0 (compatible; NuzioAI-NewsService/1.0; +https://nuzio.ai)"
    )
    FRONTEND_ORIGINS: str = os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://localhost:5000"
    )

    @property
    def cors_origins(self) -> list[str]:
        """Return list of allowed CORS origins."""
        return [origin.strip() for origin in self.FRONTEND_ORIGINS.split(",") if origin.strip()]


settings = Settings()
