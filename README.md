# News-Nuzio.Ai
Nuzio AI is an AI-powered personalized news platform that delivers intelligent news briefings with AI summaries, smart recommendations, multilingual English/Hindi narration, interactive audio, category-based discovery, saved stories, and a premium-ready experience.

## Architecture

```text
React (Frontend)
 ↓
Node API (Backend)          - auth, personalized news, and the News Pulse gateway
 ↓
Python AI Service (Ai_Service) - RSS ingestion, deduplication, TF-IDF topic clustering
 ↓
PostgreSQL
```

The React app only calls the Node backend. Node proxies News Pulse requests
(`/api/news-pulse/*`) to the Python FastAPI service, whose URL is configured
with `AI_SERVICE_URL` (default `http://localhost:8000`).

- Backend setup, `AI_SERVICE_URL`, and the News Pulse endpoints: [Backend/README.md](Backend/README.md#news-pulse-ai-news-intelligence-gateway)
- AI service details: [Ai_Service/README.md](Ai_Service/README.md)

## Running locally

Start the Python AI service and the Node backend in separate terminals:

```powershell
# Python AI service - http://localhost:8000
cd Ai_Service
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Node backend - http://localhost:5000
cd Backend
npm run dev

# React frontend - http://localhost:5173
cd Frontend
npm run dev
```

The frontend reads the Node API URL from `VITE_API_URL` (see `Frontend/.env.example`,
default `http://localhost:5000/api`); for a deployment, set it to the deployed Node
backend. Sign in and open **News Pulse** from the navigation bar (`/news-pulse`) to
see the topic clusters and timeline, and use **Refresh News** to ingest new articles.
