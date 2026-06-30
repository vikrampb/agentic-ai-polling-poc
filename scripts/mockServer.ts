/**
 * scripts/mockServer.ts
 * Lightweight Express server simulating the login + users endpoints.
 *
 * GET /api/users                       → all users from SQLite (no passwords)
 * GET /api/login?username=u&password=p → export-control login check
 * GET /health                          → liveness probe
 */
import express, { Request, Response } from 'express';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

interface User {
  id:            number;
  name:          string;
  export_status: 'US_PERSON' | 'NON_US_PERSON';
  username:      string;
  password_hash: string;
}

interface PublicUser {
  id:            number;
  name:          string;
  export_status: 'US_PERSON' | 'NON_US_PERSON';
  username:      string;
}

const app     = express();
const PORT    = process.env.PORT ?? 3000;
const DB_PATH = path.join(__dirname, '..', process.env.DB_PATH ?? 'data/users.db');
const db      = new Database(DB_PATH, { readonly: true });

// ── GET /api/users ────────────────────────────────────────────────────────────
// Returns all users including password — POC only, never do this in production.
app.get('/api/users', (_req: Request, res: Response) => {
  const users = db
    .prepare('SELECT id, name, export_status, username, password_hash as password, team_name FROM users')
    .all();
  return res.json({ users });
});

// ── GET /api/login ────────────────────────────────────────────────────────────
app.get('/api/login', (req: Request, res: Response) => {
  const { username, password } = req.query as { username?: string; password?: string };

  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Missing credentials.' });

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?')
    .get(username, password) as User | undefined;

  if (!user)
    return res.status(200).json({ success: false, message: 'Invalid username or password.' });

  if (user.export_status === 'NON_US_PERSON')
    return res.status(200).json({
      success:      false,
      message:      'Only US Persons are allowed to watch this demo.',
      exportStatus: user.export_status,
    });

  return res.status(200).json({
    success:      true,
    message:      'Login successful. Welcome!',
    exportStatus: user.export_status,
  });
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

app.listen(Number(PORT), '0.0.0.0', () =>
  console.log(`✅  Mock server on http://0.0.0.0:${PORT}`)
);
