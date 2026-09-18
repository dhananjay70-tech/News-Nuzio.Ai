import path from 'node:path';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import newsRoutes from './routes/news.routes.js';

const app = express();

// CORS configuration - in development, accept any localhost port (Vite's
// dev port can drift from FRONTEND_URL, e.g. 5173 default vs. a
// differently-configured .env value); production still enforces a single
// exact FRONTEND_URL match.
const isLocalhostOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // non-browser requests (curl, server-to-server)
    if (origin === config.FRONTEND_URL) return callback(null, true);
    if (config.isDev && isLocalhostOrigin(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is healthy' });
});

// Generated TTS audio files (served as static files rather than stored in
// the database - the database only holds the resulting URL)
app.use('/audio', express.static(path.resolve(process.cwd(), 'public', 'audio')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/news', newsRoutes);

// 404 handler for undefined routes
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
