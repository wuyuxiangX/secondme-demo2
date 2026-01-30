import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

let db;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDatabase() {
  const db = getDb();

  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      secondme_user_id TEXT UNIQUE,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at INTEGER,
      user_info TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create sessions table for OAuth state management
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER
    )
  `);

  console.log('Database initialized');
}

// User operations
export function createOrUpdateUser(secondmeUserId, accessToken, refreshToken, expiresIn, userInfo) {
  const db = getDb();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  const stmt = db.prepare(`
    INSERT INTO users (id, secondme_user_id, access_token, refresh_token, token_expires_at, user_info, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(secondme_user_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expires_at = excluded.token_expires_at,
      user_info = excluded.user_info,
      updated_at = strftime('%s', 'now')
  `);

  const userId = secondmeUserId; // Use SecondMe user ID as primary key
  stmt.run(userId, secondmeUserId, accessToken, refreshToken, expiresAt, JSON.stringify(userInfo));

  return getUserBySecondmeId(secondmeUserId);
}

export function getUserBySecondmeId(secondmeUserId) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE secondme_user_id = ?').get(secondmeUserId);
}

export function getUserById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUserTokens(userId, accessToken, refreshToken, expiresIn) {
  const db = getDb();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  db.prepare(`
    UPDATE users SET
      access_token = ?,
      refresh_token = ?,
      token_expires_at = ?,
      updated_at = strftime('%s', 'now')
    WHERE id = ?
  `).run(accessToken, refreshToken, expiresAt, userId);
}

// OAuth state operations
export function createOAuthState(state) {
  const db = getDb();
  const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes
  db.prepare('INSERT INTO oauth_states (state, expires_at) VALUES (?, ?)').run(state, expiresAt);
}

export function validateAndDeleteOAuthState(state) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const row = db.prepare('SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?').get(state, now);
  if (row) {
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    return true;
  }
  return false;
}

// Cleanup expired states
export function cleanupExpiredStates() {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(now);
}
