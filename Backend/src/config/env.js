import dotenv from 'dotenv';
dotenv.config();

const port = parseInt(process.env.PORT || '5000', 10);

export const config = {
  PORT: port,
  NODE_ENV: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',

  // Base URL this server is reachable at - used to build absolute URLs for
  // generated audio files (the frontend runs on a different origin/port,
  // so a relative "/audio/x.mp3" path would resolve against the wrong host).
  BACKEND_URL: process.env.BACKEND_URL || `http://localhost:${port}`,

  // Database
  DATABASE_URL: process.env.DATABASE_URL,

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'default_dev_secret_change_me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // News API (generic, NewsAPI.org-shaped)
  NEWS_API_URL: process.env.NEWS_API_URL || '',
  NEWS_API_KEY: process.env.NEWS_API_KEY || '',

  // GNews (preferred live provider when configured - https://gnews.io)
  GNEWS_API_URL: process.env.GNEWS_API_URL || 'https://gnews.io/api/v4',
  GNEWS_API_KEY: process.env.GNEWS_API_KEY || '',

  // TTS (provider left empty by default - browser SpeechSynthesis fallback
  // is used instead; set both to enable real audio generation)
  TTS_PROVIDER: process.env.TTS_PROVIDER || '', // 'elevenlabs' | 'google' | 'azure'
  TTS_API_KEY: process.env.TTS_API_KEY || '',

  // CORS
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};

export default config;
