import express from 'express';
import userController from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateUserPreferences } from '../middleware/validate.middleware.js';

const router = express.Router();

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get('/me', requireAuth, userController.getMe);

/**
 * GET /api/users/preferences
 * Get current user preferences
 */
router.get('/preferences', requireAuth, userController.getPreferences);

/**
 * PUT /api/users/preferences
 * Update user preferences
 */
router.put('/preferences', requireAuth, validateUserPreferences, userController.updatePreferences);

export default router;
