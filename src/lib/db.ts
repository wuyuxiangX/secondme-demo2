import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDatabase(): void {
  const database = getDb();

  // Create users table
  database.exec(`
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
  database.exec(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER
    )
  `);
}

// Initialize database on module load
initDatabase();

export interface User {
  id: string;
  secondme_user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  user_info: string;
  created_at: number;
  updated_at: number;
}

// User operations
export function createOrUpdateUser(
  secondmeUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  userInfo: Record<string, unknown>
): User | undefined {
  const database = getDb();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  const stmt = database.prepare(`
    INSERT INTO users (id, secondme_user_id, access_token, refresh_token, token_expires_at, user_info, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(secondme_user_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expires_at = excluded.token_expires_at,
      user_info = excluded.user_info,
      updated_at = strftime('%s', 'now')
  `);

  const userId = secondmeUserId;
  stmt.run(userId, secondmeUserId, accessToken, refreshToken, expiresAt, JSON.stringify(userInfo));

  return getUserBySecondmeId(secondmeUserId);
}

export function getUserBySecondmeId(secondmeUserId: string): User | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM users WHERE secondme_user_id = ?').get(secondmeUserId) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function updateUserTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): void {
  const database = getDb();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  database.prepare(`
    UPDATE users SET
      access_token = ?,
      refresh_token = ?,
      token_expires_at = ?,
      updated_at = strftime('%s', 'now')
    WHERE id = ?
  `).run(accessToken, refreshToken, expiresAt, userId);
}

// OAuth state operations
export function createOAuthState(state: string): void {
  const database = getDb();
  const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes
  database.prepare('INSERT INTO oauth_states (state, expires_at) VALUES (?, ?)').run(state, expiresAt);
}

export function validateAndDeleteOAuthState(state: string): boolean {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);

  const row = database.prepare('SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?').get(state, now);
  if (row) {
    database.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    return true;
  }
  return false;
}

export function cleanupExpiredStates(): void {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  database.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(now);
}
