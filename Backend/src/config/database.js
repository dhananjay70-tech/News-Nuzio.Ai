import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

let db;
let client;

try {
  // `prepare: false` is required for Supabase's pgbouncer transaction-mode
  // pooler (in DATABASE_URL) - prepared statements can't be reused across
  // pooled connections in that mode.
  client = postgres(process.env.DATABASE_URL, { prepare: false });
  db = drizzle(client, { schema });
} catch (error) {
  console.warn('⚠️  Drizzle client initialization failed:', error.message);
  console.log('⚠️  Server will run in mock mode without database');
  db = null;
}

export const connectDatabase = async () => {
  try {
    if (db) {
      await client`select 1`;
      console.log('✅ Database connected successfully');
    } else {
      console.log('⚠️  Running in mock mode (database client not available)');
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.log('⚠️  Server will start in mock mode');
  }
};

export { sql };
export default db;
