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

// ============================================
// Comic Project Tables and Types
// ============================================

export type ComicStatus = 'draft' | 'chatting' | 'analyzing' | 'generating' | 'completed';
export type PanelStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface ComicProject {
  id: string;
  user_id: string;
  title: string;
  status: ComicStatus;
  style: string;
  character_desc: string | null;
  life_summary: string | null;
  created_at: number;
  updated_at: number;
}

export interface ComicConversation {
  id: string;
  project_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

export interface ComicPanel {
  id: string;
  project_id: string;
  panel_order: number;
  title: string;
  scene_desc: string;
  prompt: string | null;
  image_base64: string | null;
  status: PanelStatus;
  created_at: number;
}

// Initialize comic tables
export function initComicTables(): void {
  const database = getDb();

  // Comic projects table
  database.exec(`
    CREATE TABLE IF NOT EXISTS comic_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      style TEXT DEFAULT 'chinese',
      character_desc TEXT,
      life_summary TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Comic conversations table
  database.exec(`
    CREATE TABLE IF NOT EXISTS comic_conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (project_id) REFERENCES comic_projects(id) ON DELETE CASCADE
    )
  `);

  // Comic panels table
  database.exec(`
    CREATE TABLE IF NOT EXISTS comic_panels (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      panel_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      scene_desc TEXT NOT NULL,
      prompt TEXT,
      image_base64 TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (project_id) REFERENCES comic_projects(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_comic_projects_user_id ON comic_projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_comic_conversations_project_id ON comic_conversations(project_id);
    CREATE INDEX IF NOT EXISTS idx_comic_panels_project_id ON comic_panels(project_id);
  `);
}

// Initialize comic tables on module load
initComicTables();

// ============================================
// Comic Project Operations
// ============================================

export function createComicProject(
  userId: string,
  title: string,
  style: string = 'chinese'
): ComicProject | undefined {
  const database = getDb();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO comic_projects (id, user_id, title, style)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, title, style);

  return getComicProject(id);
}

export function getComicProject(id: string): ComicProject | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM comic_projects WHERE id = ?').get(id) as ComicProject | undefined;
}

export function getComicProjectsByUserId(userId: string): ComicProject[] {
  const database = getDb();
  return database.prepare('SELECT * FROM comic_projects WHERE user_id = ? ORDER BY created_at DESC').all(userId) as ComicProject[];
}

export function updateComicProject(
  id: string,
  updates: Partial<Pick<ComicProject, 'title' | 'status' | 'style' | 'character_desc' | 'life_summary'>>
): void {
  const database = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.style !== undefined) {
    fields.push('style = ?');
    values.push(updates.style);
  }
  if (updates.character_desc !== undefined) {
    fields.push('character_desc = ?');
    values.push(updates.character_desc);
  }
  if (updates.life_summary !== undefined) {
    fields.push('life_summary = ?');
    values.push(updates.life_summary);
  }

  if (fields.length > 0) {
    fields.push('updated_at = strftime(\'%s\', \'now\')');
    values.push(id);
    database.prepare(`UPDATE comic_projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
}

export function deleteComicProject(id: string): void {
  const database = getDb();
  database.prepare('DELETE FROM comic_projects WHERE id = ?').run(id);
}

// ============================================
// Comic Conversation Operations
// ============================================

export function addConversation(
  projectId: string,
  role: 'user' | 'assistant',
  content: string
): ComicConversation | undefined {
  const database = getDb();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO comic_conversations (id, project_id, role, content)
    VALUES (?, ?, ?, ?)
  `).run(id, projectId, role, content);

  return database.prepare('SELECT * FROM comic_conversations WHERE id = ?').get(id) as ComicConversation | undefined;
}

export function getConversations(projectId: string): ComicConversation[] {
  const database = getDb();
  return database.prepare('SELECT * FROM comic_conversations WHERE project_id = ? ORDER BY created_at ASC').all(projectId) as ComicConversation[];
}

export function clearConversations(projectId: string): void {
  const database = getDb();
  database.prepare('DELETE FROM comic_conversations WHERE project_id = ?').run(projectId);
}

// ============================================
// Comic Panel Operations
// ============================================

export function createPanels(
  projectId: string,
  panels: Array<{ title: string; scene_desc: string }>
): ComicPanel[] {
  const database = getDb();
  const insertStmt = database.prepare(`
    INSERT INTO comic_panels (id, project_id, panel_order, title, scene_desc)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Delete existing panels first
  database.prepare('DELETE FROM comic_panels WHERE project_id = ?').run(projectId);

  // Insert new panels
  for (let i = 0; i < panels.length; i++) {
    const id = crypto.randomUUID();
    insertStmt.run(id, projectId, i + 1, panels[i].title, panels[i].scene_desc);
  }

  return getPanels(projectId);
}

export function getPanels(projectId: string): ComicPanel[] {
  const database = getDb();
  return database.prepare('SELECT * FROM comic_panels WHERE project_id = ? ORDER BY panel_order ASC').all(projectId) as ComicPanel[];
}

export function getPanel(id: string): ComicPanel | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM comic_panels WHERE id = ?').get(id) as ComicPanel | undefined;
}

export function updatePanel(
  id: string,
  updates: Partial<Pick<ComicPanel, 'prompt' | 'image_base64' | 'status'>>
): void {
  const database = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.image_base64 !== undefined) {
    fields.push('image_base64 = ?');
    values.push(updates.image_base64);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length > 0) {
    values.push(id);
    database.prepare(`UPDATE comic_panels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
}
