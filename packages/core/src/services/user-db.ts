/**
 * User database backed by SQLite (better-sqlite3).
 *
 * Manages the `users` and `sessions` tables in `<data>/users.db`.
 * Passwords are hashed with bcrypt (bcryptjs). Sessions are opaque
 * random tokens stored server-side.
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'user';

export interface UserRecord {
  username: string;
  display_name: string;
  password: string; // bcrypt hash
  role: UserRole;
  onboarded: number; // 0 | 1
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export interface SessionRecord {
  token: string;
  username: string;
  expires_at: string; // ISO 8601
  created_at: string; // ISO 8601
}

/** Public user info returned to clients (no password hash). */
export interface PublicUser {
  username: string;
  displayName: string;
  role: UserRole;
  onboarded: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const SESSION_TOKEN_BYTES = 32;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_ADMIN_PASSWORD = 'desktalk';

// ─── Database ────────────────────────────────────────────────────────────────

let db: Database.Database | null = null;

/**
 * Open (or create) the users database at `<dataDir>/users.db`.
 * Creates tables and seeds the default admin account if the users table
 * is empty.
 */
export function initUserDb(dataDir: string): void {
  const dbPath = join(dataDir, 'users.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username     TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      password     TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'user',
      onboarded    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      username   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  // Seed default admin account if the users table is empty
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number };
  if (count.cnt === 0) {
    const now = new Date().toISOString();
    const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS);
    db.prepare(
      `INSERT INTO users (username, display_name, password, role, onboarded, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('admin', 'Administrator', hash, 'admin', 0, now, now);
  }
}

/** Get the raw database instance. Throws if not initialized. */
function getDb(): Database.Database {
  if (!db) {
    throw new Error('User database not initialized. Call initUserDb() first.');
  }
  return db;
}

/** Close the database (for graceful shutdown). */
export function closeUserDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── User CRUD ───────────────────────────────────────────────────────────────

function toPublicUser(row: UserRecord): PublicUser {
  return {
    username: row.username,
    displayName: row.display_name,
    role: row.role as UserRole,
    onboarded: row.onboarded === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Find a user by username, or undefined if not found. */
export function findUser(username: string): PublicUser | undefined {
  const row = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | UserRecord
    | undefined;
  return row ? toPublicUser(row) : undefined;
}

/** List all users (public info only). */
export function listUsers(): PublicUser[] {
  const rows = getDb().prepare('SELECT * FROM users ORDER BY created_at ASC').all() as UserRecord[];
  return rows.map(toPublicUser);
}

/** Create a new user. Throws if username already exists. */
export function createUser(
  username: string,
  password: string,
  role: UserRole = 'user',
  displayName?: string,
): PublicUser {
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  getDb()
    .prepare(
      `INSERT INTO users (username, display_name, password, role, onboarded, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(username, displayName ?? username, hash, role, 0, now, now);
  return findUser(username)!;
}

/** Delete a user and all their sessions (CASCADE). */
export function deleteUser(username: string): boolean {
  const result = getDb().prepare('DELETE FROM users WHERE username = ?').run(username);
  return result.changes > 0;
}

/** Update a user's role. */
export function updateUserRole(username: string, role: UserRole): boolean {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare('UPDATE users SET role = ?, updated_at = ? WHERE username = ?')
    .run(role, now, username);
  return result.changes > 0;
}

/** Update a user's password (caller must verify the old password first). */
export function updateUserPassword(username: string, newPassword: string): boolean {
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  const result = getDb()
    .prepare('UPDATE users SET password = ?, updated_at = ? WHERE username = ?')
    .run(hash, now, username);
  return result.changes > 0;
}

/** Mark onboarding complete and update display name / preferences. */
export function completeOnboarding(username: string, displayName?: string): boolean {
  const now = new Date().toISOString();
  if (displayName) {
    const result = getDb()
      .prepare(
        'UPDATE users SET onboarded = 1, display_name = ?, updated_at = ? WHERE username = ?',
      )
      .run(displayName, now, username);
    return result.changes > 0;
  }
  const result = getDb()
    .prepare('UPDATE users SET onboarded = 1, updated_at = ? WHERE username = ?')
    .run(now, username);
  return result.changes > 0;
}

// ─── Password verification ──────────────────────────────────────────────────

/**
 * Verify a plaintext password against the stored bcrypt hash.
 * Returns the public user record on success, or undefined on failure.
 */
export function verifyPassword(username: string, password: string): PublicUser | undefined {
  const row = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | UserRecord
    | undefined;
  if (!row) return undefined;
  const valid = bcrypt.compareSync(password, row.password);
  return valid ? toPublicUser(row) : undefined;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** Create a new session for the given user. Returns the token. */
export function createSession(username: string): string {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  getDb()
    .prepare('INSERT INTO sessions (token, username, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, username, expiresAt.toISOString(), now.toISOString());

  // Prune expired sessions opportunistically
  pruneExpiredSessions();

  return token;
}

/** Validate a session token. Returns the username if valid, or undefined. */
export function validateSession(token: string): PublicUser | undefined {
  const row = getDb().prepare('SELECT * FROM sessions WHERE token = ?').get(token) as
    | SessionRecord
    | undefined;
  if (!row) return undefined;

  // Check expiration
  if (new Date(row.expires_at) <= new Date()) {
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return undefined;
  }

  return findUser(row.username);
}

/** Delete a session (logout). */
export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** Delete all sessions for a user. */
export function deleteUserSessions(username: string): void {
  getDb().prepare('DELETE FROM sessions WHERE username = ?').run(username);
}

/** Remove expired session rows. */
function pruneExpiredSessions(): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}
