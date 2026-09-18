import authService from '../services/auth.service.js';
import { successResponse } from '../utils/response.js';

export class AuthController {
  /**
   * POST /api/auth/register
   * Create a new account with name, email and password
   */
  async register(req, res, next) {
    try {
      const result = await authService.register(req.validatedBody);
      return successResponse(res, result, 'Account created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * Log in with email and password
   */
  async login(req, res, next) {
    try {
      const result = await authService.login(req.validatedBody);
      return successResponse(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   * Logout (client-side handles JWT invalidation)
   */
  async logout(req, res) {
    // For stateless JWT, logout is handled client-side
    // This endpoint exists for clean API semantics
    return successResponse(res, null, 'Logout successful');
  }
}

export default new AuthController();
