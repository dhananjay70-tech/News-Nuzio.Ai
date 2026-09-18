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
