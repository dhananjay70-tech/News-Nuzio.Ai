# Nuzio AI - Backend API

Personalized audio news application backend built with Node.js, Express, PostgreSQL, and Prisma.

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **Prisma ORM** - Database ORM
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Zod** - Request validation
- **CORS** - Cross-origin resource sharing
- **Axios** - HTTP client for external APIs

## Features

1. **User Authentication** - Email/password registration and login with JWT tokens
2. **User Personalization** - Customizable preferences (profession, interests, voice, briefing length)
3. **Personalized News** - News articles ranked by user interests using a scoring algorithm
4. **Audio Support** - Audio URL abstraction for TTS providers (frontend uses SpeechSynthesis fallback)
5. **Listening History** - Track progress and completion of articles
6. **Save Articles** - Bookmark articles for later

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── env.js           # Environment configuration
│   │   └── database.js      # Database connection
│   ├── controllers/
│   │   ├── auth.controller.js    # Authentication endpoints
│   │   ├── user.controller.js    # User preferences endpoints
│   │   └── news.controller.js    # News endpoints
│   ├── middleware/
│   │   ├── auth.middleware.js    # JWT authentication
│   │   ├── error.middleware.js   # Error handling
│   │   └── validate.middleware.js # Zod validation
│   ├── routes/
│   │   ├── auth.routes.js    # Auth routes
│   │   ├── user.routes.js    # User routes
│   │   └── news.routes.js    # News routes
│   ├── services/
│   │   ├── auth.service.js           # Password hashing & JWT logic
│   │   ├── news.service.js           # News fetching & categorization
│   │   ├── personalization.service.js # Personalization scoring
│   │   └── audio.service.js          # TTS abstraction
│   ├── utils/
│   │   ├── jwt.js            # JWT token generation
│   │   └── response.js       # Response formatting
│   ├── app.js                # Express app configuration
│   └── server.js             # Server entry point
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── seed.js               # Seed data
├── .env                      # Environment variables (not committed)
├── .env.example              # Environment variables template
├── package.json              # Dependencies
└── README.md                 # This file
```

## Database Schema

### User
- id, name, email, passwordHash, avatarUrl
- profession, preferredVoice, briefingLength
- Relations: interests, listenHistory, savedArticles

### UserInterest
- id, userId, category
- Links users to their news interests

### NewsArticle
- id, title, description, content, url, source, imageUrl
- category, publishedAt, audioUrl, duration
- Relations: listenHistory, savedBy

### UserListenHistory
- id, userId, articleId, progress, completed, listenedAt
- Tracks user listening progress

### SavedArticle
- id, userId, articleId, createdAt
- Bookmarked articles

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (installed and running)
- npm or yarn

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Update the following variables in `.env`:

```env
PORT=5000
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/nuzio_ai?schema=public"
DIRECT_URL=

# JWT
JWT_SECRET=your_secure_random_string_here

# GNews (optional - falls back to seed data if not configured)
GNEWS_API_KEY=your_gnews_api_key
```

### 3. Setup PostgreSQL Database

Create a PostgreSQL database:

```sql
CREATE DATABASE nuzio_ai;
```

### 4. Generate Prisma Client

```bash
npx prisma generate
```

### 5. Run Database Migrations

```bash
npx prisma migrate dev --name init
```

### 6. Seed Database

```bash
npm run seed
```

This will populate the database with sample news articles across categories:
- AI & Tech
- Markets
- Startups
- Science
- Geopolitics
- Business
- Sports

### 7. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication

#### POST /api/auth/register
Create a new account with name, email and password

**Request:**
```json
{
  "name": "Dhananjay",
  "email": "dhananjay@example.com",
  "password": "StrongPassword123!"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "token": "jwt_token_here",
    "user": {
      "id": "user_id",
      "name": "Dhananjay",
      "email": "dhananjay@example.com",
      "avatarUrl": null,
      "profession": null,
      "preferredVoice": null,
      "briefingLength": 10,
      "interests": []
    }
  }
}
```

Returns `409 Conflict` if the email is already registered.

#### POST /api/auth/login
Log in with email and password

**Request:**
```json
{
  "email": "dhananjay@example.com",
  "password": "StrongPassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "jwt_token_here",
    "user": {
      "id": "user_id",
      "name": "Dhananjay",
      "email": "dhananjay@example.com",
      "avatarUrl": null,
      "profession": "Technology",
      "preferredVoice": "Aria",
      "briefingLength": 5,
      "interests": ["AI & Tech", "Startups"]
    }
  }
}
```

Returns `401 Unauthorized` if the email or password is incorrect.

#### POST /api/auth/logout
Logout (client-side handles JWT invalidation)

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### User

#### GET /api/users/me
Get current user profile (requires authentication)

**Headers:**
```
Authorization: Bearer <JWT>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "avatarUrl": "https://...",
    "profession": "Technology",
    "preferredVoice": "Aria",
    "briefingLength": 5,
    "language": "en",
    "interests": ["AI & Tech", "Startups", "Science"]
  }
}
```

#### PUT /api/users/preferences
Update user preferences (requires authentication)

**Request:**
```json
{
  "language": "hi",
  "profession": "Technology",
  "interests": ["AI & Tech", "Startups", "Science"],
  "preferredVoice": "Meera",
  "briefingLength": 5
}
```

`language` must be `"en"` or `"hi"` (rejected with `400` otherwise). All fields are optional - only send what you want to update.

**Response:**
```json
{
  "success": true,
  "data": {
    "language": "hi",
    "profession": "Technology",
    "preferredVoice": "Meera",
    "briefingLength": 5,
    "interests": ["AI & Tech", "Startups", "Science"]
  }
}
```

### News

#### GET /api/news/personalized
Get personalized news for authenticated user (requires authentication)

Articles are fetched in the user's selected `language` ("en" or "hi") - a
Hindi-preference user gets real Hindi-language articles from GNews, not
English articles with translated UI labels. Optional `?category=` query
param narrows to one category (matching the frontend's category pills).

**Headers:**
```
Authorization: Bearer <JWT>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "article_id",
      "title": "Anthropic ships Claude 4.5...",
      "description": "...",
      "source": "The Verge",
      "category": "AI & Tech",
      "publishedAt": "2026-09-17T...",
      "audioUrl": null,
      "duration": 227
    }
  ]
}
```

#### GET /api/news/:id
Get a specific article by ID (requires authentication)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "article_id",
    "title": "...",
    "description": "...",
    "content": "...",
    "url": "...",
    "source": "...",
    "imageUrl": "...",
    "category": "...",
    "publishedAt": "...",
    "audioUrl": null,
    "duration": 180
  }
}
```

#### POST /api/news/:id/listen
Update listen history for an article (requires authentication)

**Request:**
```json
{
  "progress": 45,
  "completed": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "history_id",
    "userId": "user_id",
    "articleId": "article_id",
    "progress": 45,
    "completed": false,
    "listenedAt": "2026-09-17T..."
  }
}
```

#### POST /api/news/:id/save
Save an article for later (requires authentication)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "saved_id",
    "userId": "user_id",
    "articleId": "article_id",
    "createdAt": "2026-09-17T..."
  }
}
```

#### DELETE /api/news/:id/save
Remove a saved article (requires authentication)

**Response:**
```json
{
  "success": true,
  "message": "Article removed from saved"
}
```

#### GET /api/news/saved
Get all saved articles for the user (requires authentication)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "article_id",
      "title": "...",
      "savedAt": "2026-09-17T..."
    }
  ]
}
```

## News Pulse (AI news intelligence gateway)

News Pulse (topic clusters, timeline, RSS ingestion) is computed by a separate
Python FastAPI service in [`../Ai_Service`](../Ai_Service/README.md). This backend
is the **API gateway** in front of it - the React app only ever talks to Node:

```
React
 ↓
Node API            (this backend, /api/news-pulse/*)
 ↓
Python AI Service   (FastAPI, Ai_Service)
 ↓
PostgreSQL
```

The Node side is a thin proxy (`services/newsPulse.service.js` →
`controllers/newsPulse.controller.js` → `routes/newsPulse.routes.js`). It reuses
this app's CORS and rate-limit configuration and does not touch the database.
The one exception is the article audio endpoint ("Listen", below), which needs a
signed-in user and uses the existing TTS setup.

### Configuration

```env
AI_SERVICE_URL=http://localhost:8000   # deployed FastAPI URL in production
AI_SERVICE_TIMEOUT_MS=10000            # optional, default 10000
AI_SERVICE_TRIGGER_TIMEOUT_MS=5000     # optional, default 5000 (ingest trigger only)
```

### Endpoints

Responses are the FastAPI JSON bodies forwarded unchanged. These routes are
not behind `requireAuth` (`POST /api/news-pulse/audio`, below, is).

| Node endpoint | Forwards to (FastAPI) |
| --- | --- |
| `GET /api/news-pulse/clusters?limit=` | `GET /clusters` (same `limit`) |
| `GET /api/news-pulse/clusters/:id` | `GET /clusters/{id}` |
| `GET /api/news-pulse/timeline?source=&cluster_id=&from=&to=&limit=` | `GET /timeline` (same query parameters) |
| `POST /api/news-pulse/ingest/trigger` | `POST /ingest/trigger` |
| `GET /api/news-pulse/ingest/status/:jobId` | `GET /ingest/status/{jobId}` |

`ingest/trigger` returns immediately with `{ "job_id": "...", "status": "QUEUED" }`;
ingestion runs in the background in Python, so poll `ingest/status/:jobId` until
`status` is `COMPLETED` (or `FAILED`; `error` then holds the reason). A full
ingestion (5 feeds, ~100 articles) took about 4.5 minutes in testing, and the
`/api/` rate limit is 100 requests per 15 minutes per IP (shared with every
other API call), so poll every 10 seconds or so, not every second or two.

`clusters` returns the newest 100 clusters by default; pass `limit` (up to 500, which
covers every cluster) to get more. `:id` must be a positive integer and `:jobId` up to 64 letters, digits, `-` or
`_`; anything else is rejected with `400` without calling Python. Only the
parameters listed above are forwarded (values are URL-encoded; unknown or
empty ones are dropped, and FastAPI's 400 is returned for bad `limit`/dates).

### Listen (article audio)

`POST /api/news-pulse/audio` (requires `Authorization: Bearer <token>`) returns
narration audio for one article. The frontend calls it **only when the user clicks
Listen** - nothing is generated during ingestion or page load.

```json
{ "articleId": 230, "title": "...", "source": "TechCrunch", "content": "description text", "voice": "Aria" }
```

`articleId` and `title` are required; `voice` is a narrator persona (`Aria`, `Kai`
or `Meera`; anything else means `Aria`). The response is
`{ "audioUrl": "...", "duration": 15, "cached": false }`, and the player plays
`audioUrl` like any other Nuzio audio.

It reuses the TTS provider, voices, `TTS_PROVIDER`/`TTS_API_KEY` settings and
`public/audio` directory behind `POST /api/news/:id/audio` (`AudioService`). It
needs its own route only because that endpoint looks the article up in the
`NewsArticle` table, while Pulse articles live in the AI service's database.
For the same reason results can't go in `AudioAsset` (its `articleId` references
`NewsArticle`), so audio is cached on disk as `public/audio/pulse-<hash>.mp3`,
where the hash covers the article id, voice and narration text: the same article
in the same voice is synthesized once, across requests and restarts, with no
schema change. Simultaneous requests share one provider call.

Environment variables (server-side only; see `.env.example`): `TTS_PROVIDER=elevenlabs`,
`TTS_API_KEY`, and in production `BACKEND_URL` - this server's public https URL,
used to build the audio file URLs the browser plays (`RENDER_EXTERNAL_URL` is used
automatically on Render). Without `BACKEND_URL` in production the URLs point at
localhost and playback fails even though generation works; the server logs a
warning at startup if so.

The narration is the headline, "From `<source>`.", then `content`, with markup
stripped and capped at 1200 characters (TTS is billed per character: about one
ElevenLabs credit per character, once per article). A missing description is fine
(the headline and source are read); an article with nothing to read is a `400`.

Every failure has its own status and `code` instead of one blanket error, nothing
is cached on failure, and the provider's own message (which can include account
details) goes to the server log only, e.g.
`[NewsPulse] audio for article 230 failed (quota_exceeded): elevenlabs HTTP 401: ... You have 70 credits remaining, while 248 credits are required`:

| Status | `code` | Meaning |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Invalid body, or no article text to read aloud |
| `401` | `UNAUTHORIZED` | Missing/invalid bearer token |
| `503` | `TTS_NOT_CONFIGURED` | `TTS_PROVIDER`/`TTS_API_KEY` missing, unknown provider, or provider not implemented (the log says which) |
| `503` | `TTS_QUOTA_EXCEEDED` | The provider account is out of credits / over its plan limit (ElevenLabs reports this as a `401` with `quota_exceeded`) |
| `503` | `TTS_AUTH_FAILED` | The provider rejected the API key or its permissions |
| `503` | `TTS_RATE_LIMITED` | The provider is throttling requests |
| `502` | `TTS_UPSTREAM_ERROR` | Provider `5xx`, rejected request (e.g. bad voice), unreachable, or a reply that isn't audio |
| `504` | `TTS_TIMEOUT` | The provider didn't answer within 30 seconds |
| `500` | `TTS_STORAGE_ERROR` | Audio was generated but couldn't be written to `public/audio` |

Server audio is the primary path. The frontend reacts to the codes like this:

- `TTS_QUOTA_EXCEEDED` (out of credits): the article is read aloud by the
  browser's own SpeechSynthesis through the same global player (title, source
  and description). It logs one warning, then skips the server for 10 minutes -
  no retry loop - and tries the server again after that (or after a page
  reload).
- Any other failure: a short message on the card ("Audio is temporarily
  unavailable", "Couldn't prepare the audio", ...) with a "Try again" button,
  and the `code` in the browser console. There is deliberately no browser-speech
  fallback for these, so a misconfigured server isn't hidden.

### Errors

Failures return `{ "success": false, "error": "...", "message": "...", "code": "..." }`
(`error` and `message` carry the same text). Python details, stack traces,
file paths and connection strings are never returned - they are logged server-side.

| Situation | Status | `error` |
| --- | --- | --- |
| Python unreachable / connection refused or reset | `503` | News intelligence service unavailable |
| No reply within the timeout | `504` | News intelligence service timed out |
| Python `404` | `404` | Cluster not found / Ingestion job not found |
| Python `400` (e.g. bad date) | `400` | Python's client-facing detail |
| Invalid `:id` / `:jobId` / repeated query param | `400` | Invalid cluster id / Invalid job id / Invalid query parameter: `<name>` |
| Python `5xx`, or a non-JSON reply | `502` | News intelligence service error / returned an invalid response |
| Audio request missing/invalid `articleId` or `title`, or nothing to read | `400` | Invalid audio request / There is no article text to read aloud |
| Audio: TTS not configured / out of quota / bad credentials / throttled | `503` | see the table under "Listen" |
| Audio: provider error / timeout / storage failure | `502` / `504` / `500` | see the table under "Listen" |

### Running both services locally

```powershell
# 1. Python AI service (http://localhost:8000)
cd Ai_Service
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Node backend (http://localhost:5000) - in a second terminal
cd Backend
npm run dev
```

Then, for example:

```powershell
curl http://localhost:5000/api/news-pulse/clusters
curl "http://localhost:5000/api/news-pulse/timeline?source=BBC%20News&limit=20"
curl -X POST http://localhost:5000/api/news-pulse/ingest/trigger
curl http://localhost:5000/api/news-pulse/ingest/status/<job_id>
```

### Tests

```bash
npm test
```

Uses Node's built-in test runner (no extra dependency). A fake FastAPI server is
started in-process, so the tests need neither the Python service, the database,
nor live RSS access. The audio tests (`tests/newsPulse.audio.test.js`) run in a
temp directory with the ElevenLabs call faked, so they never use a real TTS key or
write to the real `public/audio`.

## Personalization Algorithm

The backend uses a simple transparent scoring algorithm:

- **+5** for exact category match
- **+3** for related interest match
- **+2** for recent articles (within 24 hours)

Articles are sorted by score in descending order.

Example:
- User interest: "AI & Tech"
- Article category: "AI & Tech"
- Score: 5 (exact match)

## Security

- JWT authentication for all protected endpoints
- Input validation using Zod
- CORS configured for frontend origin
- Environment-based secrets
- Parameterized database queries via Prisma
- Rate limiting on API endpoints
- No secret logging or API key exposure

## Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm start            # Start production server
npm run seed         # Seed database with sample data
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run database migrations
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Prisma Studio
npm run setup        # Full setup (install, generate, migrate, seed)
```

## Frontend Integration

The frontend should:

1. Register via `POST /api/auth/register` or log in via `POST /api/auth/login`
2. Store the received JWT token
3. Include `Authorization: Bearer <JWT>` header in all subsequent requests
4. Use `audioUrl` from articles (if provided) or fallback to browser SpeechSynthesis

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Verify DATABASE_URL in `.env` is correct
- Check database exists: `CREATE DATABASE nuzio_ai;`

### Authentication Issues
- Registration returns `409` if the email is already registered
- Login returns `401` if the email or password is incorrect
- Verify JWT_SECRET is set in `.env`

### Prisma Issues
- Run `npx prisma generate` after schema changes
- Run `npx prisma migrate dev` to apply migrations
- Use `npx prisma db push` for development (without migration history)

## License

MIT
