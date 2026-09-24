"""Database verification script as per pai4.txt requirements."""

import json
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def verify_database():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not set in environment.")
        return

    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()

        # 1. current_database()
        cursor.execute("SELECT current_database();")
        current_db = cursor.fetchone()[0]

        # 2. current_user
        cursor.execute("SELECT current_user;")
        curr_user = cursor.fetchone()[0]

        # 3. current_schema()
        cursor.execute("SELECT current_schema();")
        curr_schema = cursor.fetchone()[0]

        # 4. SHOW search_path
        cursor.execute("SHOW search_path;")
        search_path = cursor.fetchone()[0]

        # 5. whether nuzio_ai schema exists
        cursor.execute(
            "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'nuzio_ai');"
        )
        nuzio_ai_schema_exists = cursor.fetchone()[0]

        # 6. whether existing Nuzio NewsArticle table exists
        cursor.execute(
            """
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_name IN ('NewsArticle', 'newsarticle');
            """
        )
        news_article_tables = cursor.fetchall()

        # 7. whether news_articles already exists
        cursor.execute(
            """
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_name = 'news_articles';
            """
        )
        news_articles_tables = cursor.fetchall()

        # 8. whether news_clusters already exists
        cursor.execute(
            """
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_name = 'news_clusters';
            """
        )
        news_clusters_tables = cursor.fetchall()

        # List all schemas in the database
        cursor.execute("SELECT schema_name FROM information_schema.schemata;")
        all_schemas = [row[0] for row in cursor.fetchall()]

        cursor.close()
        conn.close()

        result = {
            "current_database": current_db,
            "current_user": curr_user,
            "current_schema": curr_schema,
            "search_path": search_path,
            "nuzio_ai_schema_exists": nuzio_ai_schema_exists,
            "existing_NewsArticle_table": [f"{s}.{t}" for s, t in news_article_tables],
            "news_articles_exists": [f"{s}.{t}" for s, t in news_articles_tables],
            "news_clusters_exists": [f"{s}.{t}" for s, t in news_clusters_tables],
            "all_schemas": all_schemas
        }

        print(json.dumps(result, indent=2))

    except Exception as e:
        print(f"Connection/Query Error: {e}")


if __name__ == "__main__":
    verify_database()
