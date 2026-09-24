"""PostgreSQL Database Connection Manager using Psycopg2.

Provides safe connection pooling / context management and ensures credentials
are never logged or leaked.
"""

import logging
from contextlib import contextmanager
from typing import Any, Generator
from urllib.parse import urlparse

import psycopg2
from psycopg2.extensions import connection as PgConnection
from psycopg2.extras import RealDictCursor

from app.config import settings

logger = logging.getLogger(__name__)


def get_masked_db_url() -> str:
    """Return a masked representation of DATABASE_URL safe for logging."""
    try:
        parsed = urlparse(settings.DATABASE_URL)
        netloc_parts = parsed.netloc.split("@")
        if len(netloc_parts) == 2:
            user_part = netloc_parts[0].split(":")[0]
            host_part = netloc_parts[1]
            return f"{parsed.scheme}://{user_part}:***@{host_part}{parsed.path}"
        return f"{parsed.scheme}://***@{parsed.netloc}{parsed.path}"
    except Exception:
        return "postgresql://***:***@***"


def get_db_connection() -> PgConnection:
    """Establish and return a new PostgreSQL connection."""
    try:
        conn = psycopg2.connect(settings.DATABASE_URL)
        return conn
    except Exception as exc:
        masked = get_masked_db_url()
        logger.error(f"Failed to connect to PostgreSQL database ({masked}): {exc}")
        raise


@contextmanager
def get_db_cursor(commit: bool = True) -> Generator[Any, None, None]:
    """Context manager that yields a RealDictCursor and handles commit/rollback and closure."""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            yield cursor
        if commit:
            conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error(f"Database transaction error: {exc}")
        raise
    finally:
        conn.close()
