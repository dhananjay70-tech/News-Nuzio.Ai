import express from 'express';
import authController from '../controllers/auth.controller.js';
import { validateRegister, validateLogin } from '../middleware/validate.middleware.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Create a new account with name, email and password
 */
router.post('/register', validateRegister, authController.register);

/**
 * POST /api/auth/login
 * Log in with email and password
 */
router.post('/login', validateLogin, authController.login);

/**
 * POST /api/auth/logout
 * Logout (client-side handles JWT invalidation)
 */
router.post('/logout', authController.logout);

export default router;
