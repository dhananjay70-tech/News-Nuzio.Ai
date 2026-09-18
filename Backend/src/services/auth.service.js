import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import db from '../config/database.js';
import { users } from '../db/schema.js';
import { generateToken } from '../utils/jwt.js';

const SALT_ROUNDS = 10;

export class AuthService {
  /**
   * Register a new user with name, email and password.
   */
  async register({ name, email, password }) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

    if (existing) {
      const error = new Error('An account with this email already exists');
      error.statusCode = 409;
      error.code = 'CONFLICT';
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [created] = await db.insert(users).values({ name, email, passwordHash, updatedAt: new Date() }).returning();
    const user = { ...created, interests: [] };

    const token = this.generateAuthToken(user);
    return { token, user: this.toPublicUser(user) };
  }

  /**
   * Log in with email and password.
   */
  async login({ email, password }) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
      with: { interests: true },
    });

    if (!user) {
      throw this.invalidCredentialsError();
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw this.invalidCredentialsError();
    }

    const token = this.generateAuthToken(user);
    return { token, user: this.toPublicUser(user) };
  }

  invalidCredentialsError() {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    return error;
  }

  /**
   * Generate JWT token for user
   */
  generateAuthToken(user) {
    return generateToken({ userId: user.id, email: user.email });
  }

  /**
   * Strip sensitive fields (passwordHash) before returning a user
   */
  toPublicUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      profession: user.profession,
      preferredVoice: user.preferredVoice,
      briefingLength: user.briefingLength,
      language: user.language,
      interests: user.interests.map((i) => i.category),
    };
  }
}

export default new AuthService();
