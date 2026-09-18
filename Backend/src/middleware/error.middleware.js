import { config } from '../config/env.js';

/**
 * Centralized error handling middleware.
 * Never exposes stack traces in production.
 */
export const errorHandler = (err, req, res, _next) => {
  // Log error details server-side
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  if (config.isDev) {
    console.error(err.stack);
  }

  // Postgres known errors (raised by the driver, e.g. via postgres.js)
  if (err.code === '23505') {
    // unique_violation
    return res.status(409).json({
      success: false,
      message: 'A record with this data already exists',
      code: 'CONFLICT',
    });
  }

  // Default internal server error
  const statusCode = err.statusCode || 500;
  const message = config.isProd
    ? 'An internal server error occurred'
    : err.message || 'Internal server error';

  return res.status(statusCode).json({
    success: false,
    message,
    code: err.code || 'INTERNAL_ERROR',
  });
};

/**
 * 404 handler for undefined routes.
 */
export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });
};
