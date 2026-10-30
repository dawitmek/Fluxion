import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl);
  return { db: drizzle(sql, { schema }), close: () => sql.end() };
}

export type Db = ReturnType<typeof createDb>['db'];

// Drizzle wraps driver errors, so check the cause as well.
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}
