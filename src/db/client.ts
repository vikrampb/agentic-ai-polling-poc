/**
 * src/db/client.ts
 * Shared database accessor used by the agent and tests.
 */
import Database from 'better-sqlite3';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_PATH = process.env.DB_PATH ?? './data/users.db';

export interface User {
  id: number;
  name: string;
  export_status: 'US_PERSON' | 'NON_US_PERSON';
  username: string;
  password_hash: string;
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) _db = new Database(DB_PATH, { readonly: true });
  return _db;
}

export function findUserByCredentials(username: string, password: string): User | null {
  const db = getDb();
  const user = db
    .prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?')
    .get(username, password) as User | undefined;
  return user ?? null;
}

export function getAllUsers(): User[] {
  return getDb().prepare('SELECT * FROM users').all() as User[];
}
