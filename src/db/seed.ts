/**
 * src/db/seed.ts
 * Seeds the embedded SQLite database with 10 users.
 * Run with: npm run db:init
 */
import Database from 'better-sqlite3';
import * as fs   from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_PATH = process.env.DB_PATH ?? './data/users.db';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    export_status TEXT    NOT NULL CHECK(export_status IN ('US_PERSON','NON_US_PERSON')),
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    team_name     TEXT
  );
`);

// Add team_name column if it doesn't exist (for existing DBs)
try {
  db.exec('ALTER TABLE users ADD COLUMN team_name TEXT');
  console.log('Added team_name column to existing DB');
} catch {
  // Column already exists — no action needed
}

const users = [
  // ── 6 US_PERSON — randomly assigned PBE or DPS ────────────────────────────
  { name: 'Captain America', export_status: 'US_PERSON',     username: 'captain.america', password_hash: 'Avengers2025!',  team_name: 'PBE' },
  { name: 'Iron Man',        export_status: 'US_PERSON',     username: 'iron.man',        password_hash: 'Stark2025!',     team_name: 'DPS' },
  { name: 'Spider-Man',      export_status: 'US_PERSON',     username: 'spider.man',      password_hash: 'Parker2025!',    team_name: 'PBE' },
  { name: 'Black Widow',     export_status: 'US_PERSON',     username: 'black.widow',     password_hash: 'Romanoff2025!',  team_name: 'DPS' },
  { name: 'Hawkeye',         export_status: 'US_PERSON',     username: 'hawkeye',         password_hash: 'Barton2025!',    team_name: 'PBE' },
  { name: 'War Machine',     export_status: 'US_PERSON',     username: 'war.machine',     password_hash: 'Rhodes2025!',    team_name: 'DPS' },
  // ── 4 NON_US_PERSON — team_name left empty ───────────────────────────────
  { name: 'Green Goblin',    export_status: 'NON_US_PERSON', username: 'green.goblin',    password_hash: 'OsCorp2025!',    team_name: null  },
  { name: 'Doctor Doom',     export_status: 'NON_US_PERSON', username: 'doctor.doom',     password_hash: 'Latveria2025!',  team_name: null  },
  { name: 'Red Skull',       export_status: 'NON_US_PERSON', username: 'red.skull',       password_hash: 'Hydra2025!',     team_name: null  },
  { name: 'Loki',            export_status: 'NON_US_PERSON', username: 'loki',            password_hash: 'Asgard2025!',    team_name: null  },
];

const insert = db.prepare(`
  INSERT INTO users (name, export_status, username, password_hash, team_name)
  VALUES (@name, @export_status, @username, @password_hash, @team_name)
  ON CONFLICT(username) DO UPDATE SET team_name = excluded.team_name
`);

db.transaction((rows: typeof users) => { for (const row of rows) insert.run(row); })(users);

const rows = db.prepare('SELECT id, name, export_status, username, team_name FROM users').all();
console.log('\n✅  Database seeded!\n');
console.table(rows);
db.close();
