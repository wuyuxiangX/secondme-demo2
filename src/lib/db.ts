import { Pool, PoolClient } from 'pg';

// Connection pool with lazy initialization
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
    });
  }
  return pool;
}

// Initialize database tables
let initialized = false;

export async function initDatabase(): Promise<void> {
  if (initialized) return;

  const client = await getPool().connect();
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        secondme_user_id TEXT UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at BIGINT,
        user_info TEXT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);

    // Create sessions table for OAuth state management
    await client.query(`
      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        expires_at BIGINT
      )
    `);

    // Comic projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS comic_projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        style TEXT DEFAULT 'chinese',
        character_desc TEXT,
        life_summary TEXT,
        chat_session_id TEXT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Add chat_session_id column if it doesn't exist (migration for existing tables)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'comic_projects' AND column_name = 'chat_session_id'
        ) THEN
          ALTER TABLE comic_projects ADD COLUMN chat_session_id TEXT;
        END IF;
      END $$;
    `);

    // Comic conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS comic_conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        FOREIGN KEY (project_id) REFERENCES comic_projects(id) ON DELETE CASCADE
      )
    `);

    // Comic panels table
    await client.query(`
      CREATE TABLE IF NOT EXISTS comic_panels (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        panel_order INTEGER NOT NULL,
        title TEXT NOT NULL,
        scene_desc TEXT NOT NULL,
        prompt TEXT,
        image_base64 TEXT,
        status TEXT DEFAULT 'pending',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        FOREIGN KEY (project_id) REFERENCES comic_projects(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_comic_projects_user_id ON comic_projects(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_comic_conversations_project_id ON comic_conversations(project_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_comic_panels_project_id ON comic_panels(project_id)
    `);

    initialized = true;
  } finally {
    client.release();
  }
}

// Ensure database is initialized before any operation
async function ensureInit(): Promise<void> {
  await initDatabase();
}

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
export async function createOrUpdateUser(
  secondmeUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  userInfo: Record<string, unknown>
): Promise<User | undefined> {
  await ensureInit();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const userId = secondmeUserId;

  await getPool().query(
    `
    INSERT INTO users (id, secondme_user_id, access_token, refresh_token, token_expires_at, user_info, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW())::BIGINT)
    ON CONFLICT(secondme_user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      user_info = EXCLUDED.user_info,
      updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    `,
    [userId, secondmeUserId, accessToken, refreshToken, expiresAt, JSON.stringify(userInfo)]
  );

  return getUserBySecondmeId(secondmeUserId);
}

export async function getUserBySecondmeId(secondmeUserId: string): Promise<User | undefined> {
  await ensureInit();
  const result = await getPool().query('SELECT * FROM users WHERE secondme_user_id = $1', [secondmeUserId]);
  return result.rows[0] as User | undefined;
}

export async function getUserById(id: string): Promise<User | undefined> {
  await ensureInit();
  const result = await getPool().query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] as User | undefined;
}

export async function updateUserTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  await ensureInit();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  await getPool().query(
    `
    UPDATE users SET
      access_token = $1,
      refresh_token = $2,
      token_expires_at = $3,
      updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = $4
    `,
    [accessToken, refreshToken, expiresAt, userId]
  );
}

// OAuth state operations
export async function createOAuthState(state: string): Promise<void> {
  await ensureInit();
  const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes
  await getPool().query('INSERT INTO oauth_states (state, expires_at) VALUES ($1, $2)', [state, expiresAt]);
}

export async function validateAndDeleteOAuthState(state: string): Promise<boolean> {
  await ensureInit();
  const now = Math.floor(Date.now() / 1000);

  const result = await getPool().query(
    'SELECT * FROM oauth_states WHERE state = $1 AND expires_at > $2',
    [state, now]
  );

  if (result.rows.length > 0) {
    await getPool().query('DELETE FROM oauth_states WHERE state = $1', [state]);
    return true;
  }
  return false;
}

export async function cleanupExpiredStates(): Promise<void> {
  await ensureInit();
  const now = Math.floor(Date.now() / 1000);
  await getPool().query('DELETE FROM oauth_states WHERE expires_at < $1', [now]);
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
  chat_session_id: string | null;
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

// ============================================
// Comic Project Operations
// ============================================

export async function createComicProject(
  userId: string,
  title: string,
  style: string = 'chinese'
): Promise<ComicProject | undefined> {
  await ensureInit();
  const id = crypto.randomUUID();

  await getPool().query(
    `
    INSERT INTO comic_projects (id, user_id, title, style)
    VALUES ($1, $2, $3, $4)
    `,
    [id, userId, title, style]
  );

  return getComicProject(id);
}

export async function getComicProject(id: string): Promise<ComicProject | undefined> {
  await ensureInit();
  const result = await getPool().query('SELECT * FROM comic_projects WHERE id = $1', [id]);
  return result.rows[0] as ComicProject | undefined;
}

export async function getComicProjectsByUserId(userId: string): Promise<ComicProject[]> {
  await ensureInit();
  const result = await getPool().query(
    'SELECT * FROM comic_projects WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows as ComicProject[];
}

export async function updateComicProject(
  id: string,
  updates: Partial<Pick<ComicProject, 'title' | 'status' | 'style' | 'character_desc' | 'life_summary' | 'chat_session_id'>>
): Promise<void> {
  await ensureInit();
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    values.push(updates.title);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.style !== undefined) {
    fields.push(`style = $${paramIndex++}`);
    values.push(updates.style);
  }
  if (updates.character_desc !== undefined) {
    fields.push(`character_desc = $${paramIndex++}`);
    values.push(updates.character_desc);
  }
  if (updates.life_summary !== undefined) {
    fields.push(`life_summary = $${paramIndex++}`);
    values.push(updates.life_summary);
  }
  if (updates.chat_session_id !== undefined) {
    fields.push(`chat_session_id = $${paramIndex++}`);
    values.push(updates.chat_session_id);
  }

  if (fields.length > 0) {
    fields.push(`updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT`);
    values.push(id);
    await getPool().query(
      `UPDATE comic_projects SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }
}

export async function deleteComicProject(id: string): Promise<void> {
  await ensureInit();
  await getPool().query('DELETE FROM comic_projects WHERE id = $1', [id]);
}

// ============================================
// Comic Conversation Operations
// ============================================

export async function addConversation(
  projectId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ComicConversation | undefined> {
  await ensureInit();
  const id = crypto.randomUUID();

  await getPool().query(
    `
    INSERT INTO comic_conversations (id, project_id, role, content)
    VALUES ($1, $2, $3, $4)
    `,
    [id, projectId, role, content]
  );

  const result = await getPool().query('SELECT * FROM comic_conversations WHERE id = $1', [id]);
  return result.rows[0] as ComicConversation | undefined;
}

export async function getConversations(projectId: string): Promise<ComicConversation[]> {
  await ensureInit();
  const result = await getPool().query(
    'SELECT * FROM comic_conversations WHERE project_id = $1 ORDER BY created_at ASC',
    [projectId]
  );
  return result.rows as ComicConversation[];
}

export async function clearConversations(projectId: string): Promise<void> {
  await ensureInit();
  await getPool().query('DELETE FROM comic_conversations WHERE project_id = $1', [projectId]);
}

// ============================================
// Comic Panel Operations
// ============================================

export async function createPanels(
  projectId: string,
  panels: Array<{ title: string; scene_desc: string }>
): Promise<ComicPanel[]> {
  await ensureInit();

  // Delete existing panels first
  await getPool().query('DELETE FROM comic_panels WHERE project_id = $1', [projectId]);

  // Insert new panels
  for (let i = 0; i < panels.length; i++) {
    const id = crypto.randomUUID();
    await getPool().query(
      `
      INSERT INTO comic_panels (id, project_id, panel_order, title, scene_desc)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [id, projectId, i + 1, panels[i].title, panels[i].scene_desc]
    );
  }

  return getPanels(projectId);
}

export async function getPanels(projectId: string): Promise<ComicPanel[]> {
  await ensureInit();
  const result = await getPool().query(
    'SELECT * FROM comic_panels WHERE project_id = $1 ORDER BY panel_order ASC',
    [projectId]
  );
  return result.rows as ComicPanel[];
}

export async function getPanel(id: string): Promise<ComicPanel | undefined> {
  await ensureInit();
  const result = await getPool().query('SELECT * FROM comic_panels WHERE id = $1', [id]);
  return result.rows[0] as ComicPanel | undefined;
}

export async function updatePanel(
  id: string,
  updates: Partial<Pick<ComicPanel, 'prompt' | 'image_base64' | 'status'>>
): Promise<void> {
  await ensureInit();
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.prompt !== undefined) {
    fields.push(`prompt = $${paramIndex++}`);
    values.push(updates.prompt);
  }
  if (updates.image_base64 !== undefined) {
    fields.push(`image_base64 = $${paramIndex++}`);
    values.push(updates.image_base64);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }

  if (fields.length > 0) {
    values.push(id);
    await getPool().query(
      `UPDATE comic_panels SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }
}
