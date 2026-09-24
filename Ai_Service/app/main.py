"""Main FastAPI Application Entrypoint for Nuzio AI News Service."""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import clusters, ingestion, news
from app.config import settings
from app.database.connection import get_db_connection
from app.database.repository import initialize_database

# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("NuzioAIService")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler to ensure database schema is initialized on startup."""
    logger.info("Initializing Nuzio AI News Intelligence Service...")
    try:
        initialize_database()
        logger.info("Database schema verification completed.")
    except Exception as exc:
        logger.warning(f"Database initialization warning on startup: {exc}")
    yield
    logger.info("Shutting down Nuzio AI News Intelligence Service.")


app = FastAPI(
    title="Nuzio AI - News Intelligence Service",
    description="Automated RSS ingestion, full-text extraction, deduplication, TF-IDF topic clustering, and timeline API.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json"
)

# Configure CORS Middleware
origins = settings.cors_origins
logger.info(f"Configuring CORS with allowed origins: {origins}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Sub-Routers
app.include_router(clusters.router)
app.include_router(news.router)
app.include_router(ingestion.router)


@app.get("/", tags=["System"], summary="Service root status")
def root():
    """Service status and identification."""
    return {
        "status": "ok",
        "service": "nuzio-ai-news-service",
        "version": "1.0.0",
        "documentation": "/docs"
    }


@app.get("/health", tags=["System"], summary="System health check")
def health_check():
    """Verify service health and database connectivity."""
    db_status = "disconnected"
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
        conn.close()
        db_status = "connected"
    except Exception as exc:
        logger.error(f"Database health check failed: {exc}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "degraded",
                "service": "nuzio-ai-news-service",
                "database": "error",
                "message": "Database connectivity check failed"
            }
        )

    return {
        "status": "ok",
        "service": "nuzio-ai-news-service",
        "database": db_status
    }


from fastapi.exceptions import RequestValidationError


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Clean HTTP 400 response for invalid query or path parameters."""
    logger.warning(f"Validation error processing {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Invalid request parameter", "errors": exc.errors()}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all unhandled exception handler to prevent stack traces leaking."""
    logger.error(f"Unhandled error processing {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."}
    )



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.API_HOST, port=settings.API_PORT, reload=True)
