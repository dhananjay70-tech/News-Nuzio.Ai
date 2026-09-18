import { eq } from 'drizzle-orm';
import { verifyToken } from '../utils/jwt.js';
import { unauthorized } from '../utils/response.js';
import db from '../config/database.js';
import { users } from '../db/schema.js';

/**
 * JWT authentication middleware.
 * Reads Authorization header, validates Bearer token,
 * verifies JWT, attaches userId to req.user.
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'Missing or invalid authorization token');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return unauthorized(res, 'Token not provided');
    }

    const decoded = verifyToken(token);

    // Verify the user still exists in the database
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (!user) {
      return unauthorized(res, 'User account no longer exists');
    }

    req.user = { userId: decoded.userId };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return unauthorized(res, 'Invalid authentication token');
    }
    if (err.name === 'TokenExpiredError') {
      return unauthorized(res, 'Authentication token has expired');
    }
    return unauthorized(res, 'Authentication failed');
  }
};
