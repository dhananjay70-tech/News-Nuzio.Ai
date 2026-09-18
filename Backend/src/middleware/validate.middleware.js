import { z } from 'zod';
import { badRequest } from '../utils/response.js';

/**
 * Creates a Zod validation middleware.
 * @param {import('zod').ZodSchema} schema - Zod schema to validate req.body against.
 */
export const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      return badRequest(res, `Validation failed: ${errors.map((e) => e.message).join(', ')}`);
    }

    req.validatedBody = result.data;
    next();
  };
};

// Zod schemas
const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  email: z.string().trim().email('A valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

const loginSchema = z.object({
  email: z.string().trim().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const userPreferencesSchema = z.object({
  language: z.enum(['en', 'hi'], { errorMap: () => ({ message: 'Language must be "en" or "hi"' }) }).optional(),
  profession: z.string().optional(),
  interests: z.array(z.string()).optional(),
  preferredVoice: z.string().optional(),
  briefingLength: z.number().int().min(1).max(30).optional(),
});

const listenHistorySchema = z.object({
  progress: z.number().int().min(0).max(100).optional(),
  completed: z.boolean().optional(),
  skipped: z.boolean().optional(),
});

// Validation middleware functions
export const validateRegister = validate(registerSchema);
export const validateLogin = validate(loginSchema);
export const validateUserPreferences = validate(userPreferencesSchema);
export const validateListenHistory = validate(listenHistorySchema);
