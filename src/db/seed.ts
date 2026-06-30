/**
 * src/db/seed.ts
 * Initialises the embedded SQLite database and seeds it with test users.
 * Run with:  npm run db:init
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
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
    password_hash TEXT    NOT NULL
  );
`);

const users = [
  // ── Original two ──────────────────────────────────────────
  { name: 'Captain America', export_status: 'US_PERSON',     username: 'captain.america', password_hash: 'Avengers2025!' },
  { name: 'Green Goblin',    export_status: 'NON_US_PERSON', username: 'green.goblin',    password_hash: 'OsCorp2025!' },

  // ── 5 new US_PERSON users ─────────────────────────────────
  { name: 'Iron Man',        export_status: 'US_PERSON',     username: 'iron.man',        password_hash: 'Stark2025!' },
  { name: 'Spider-Man',      export_status: 'US_PERSON',     username: 'spider.man',      password_hash: 'Parker2025!' },
  { name: 'Black Widow',     export_status: 'US_PERSON',     username: 'black.widow',     password_hash: 'Romanoff2025!' },
  { name: 'Hawkeye',         export_status: 'US_PERSON',     username: 'hawkeye',         password_hash: 'Barton2025!' },
  { name: 'War Machine',     export_status: 'US_PERSON',     username: 'war.machine',     password_hash: 'Rhodes2025!' },

  // ── 3 new NON_US_PERSON users ─────────────────────────────
  { name: 'Doctor Doom',     export_status: 'NON_US_PERSON', username: 'doctor.doom',     password_hash: 'Latveria2025!' },
  { name: 'Red Skull',       export_status: 'NON_US_PERSON', username: 'red.skull',       password_hash: 'Hydra2025!' },
  { name: 'Loki',            export_status: 'NON_US_PERSON', username: 'loki',            password_hash: 'Asgard2025!' },
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO users (name, export_status, username, password_hash)
  VALUES (@name, @export_status, @username, @password_hash)
`);

const insertMany = db.transaction((rows: typeof users) => {
  for (const row of rows) insert.run(row);
});

insertMany(users);

const rows = db.prepare('SELECT id, name, export_status, username FROM users').all();
console.log('\n✅  Database seeded successfully!\n');
console.table(rows);

db.close();
