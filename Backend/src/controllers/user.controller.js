import { eq } from 'drizzle-orm';
import db from '../config/database.js';
import { users, userInterests } from '../db/schema.js';
import { successResponse, notFound } from '../utils/response.js';

export class UserController {
  /**
   * GET /api/users/me
   * Get current user profile
   */
  async getMe(req, res, next) {
    try {
      const userId = req.user.userId;

      let user;
      if (db) {
        user = await db.query.users.findFirst({
          where: eq(users.id, userId),
          with: { interests: true },
        });
      }

      if (!user) {
        return notFound(res, 'User not found');
      }

      return successResponse(res, {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        profession: user.profession,
        preferredVoice: user.preferredVoice,
        briefingLength: user.briefingLength,
        language: user.language,
        interests: user.interests.map((i) => i.category),
      }, 'User profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/preferences
   * Get current user preferences
   */
  async getPreferences(req, res, next) {
    try {
      const userId = req.user.userId;

      let user;
      if (db) {
        user = await db.query.users.findFirst({
          where: eq(users.id, userId),
          with: { interests: true },
        });
      }

      if (!user) {
        return notFound(res, 'User not found');
      }

      return successResponse(res, {
        language: user.language,
        profession: user.profession,
        preferredVoice: user.preferredVoice,
        briefingLength: user.briefingLength,
        interests: user.interests.map((i) => i.category),
      }, 'Preferences retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/users/preferences
   * Update user preferences
   */
  async updatePreferences(req, res, next) {
    try {
      const userId = req.user.userId;
      const { language, profession, interests, preferredVoice, briefingLength } = req.body;

      if (!db) {
        // Mock mode - return success without database update
        return successResponse(res, {
          language: language || 'en',
          profession: profession || '',
          preferredVoice: preferredVoice || 'Aria',
          briefingLength: briefingLength || 10,
          interests: interests || [],
        }, 'Preferences updated successfully (mock mode)');
      }

      // Update user preferences
      const updates = {
        updatedAt: new Date(),
        language: language || undefined,
        profession: profession || undefined,
        preferredVoice: preferredVoice || undefined,
        briefingLength: briefingLength !== undefined ? briefingLength : undefined,
      };
      const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();

      if (!updated) {
        return notFound(res, 'User not found');
      }

      // Handle interests - delete existing and create new ones
      if (interests && Array.isArray(interests)) {
        // Delete existing interests
        await db.delete(userInterests).where(eq(userInterests.userId, userId));

        // Create new interests
        if (interests.length > 0) {
          await db.insert(userInterests).values(interests.map((category) => ({ userId, category })));
        }
      }

      // Fetch updated user with interests
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
        with: { interests: true },
      });

      return successResponse(res, {
        language: updatedUser.language,
        profession: updatedUser.profession,
        preferredVoice: updatedUser.preferredVoice,
        briefingLength: updatedUser.briefingLength,
        interests: updatedUser.interests.map((i) => i.category),
      }, 'Preferences updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();
