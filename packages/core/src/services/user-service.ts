import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type Role = 'admin' | 'normal';

export interface User {
  id: number;
  username: string;
  role: Role;
  onboarded: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredUser extends User {
  password: string; // bcrypt hash
}

export interface Session {
  id: string;
  userId: number;
  createdAt: string;
  expiresAt: string;
}

interface UserStoreFile {
  users: StoredUser[];
  sessions: Session[];
  nextId: number;
}

function emptyStore(): UserStoreFile {
  return { users: [], sessions: [], nextId: 1 };
}

export class UserService {
  private store: UserStoreFile;

  constructor(private readonly filePath: string) {
    this.store = this.load();
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private load(): UserStoreFile {
    if (!existsSync(this.filePath)) {
      return emptyStore();
    }
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf-8')) as UserStoreFile;
    } catch {
      return emptyStore();
    }
  }

  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────

  /** True when no users exist yet (first-run setup). */
  isSetupMode(): boolean {
    return this.store.users.length === 0;
  }

  // ── User CRUD ────────────────────────────────────────────────────────────

  async createUser(username: string, password: string, role?: Role): Promise<User> {
    if (this.store.users.some((u) => u.username === username)) {
      throw new Error('Username already exists');
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const now = new Date().toISOString();
    const user: StoredUser = {
      id: this.store.nextId++,
      username,
      password: hash,
      role: role ?? (this.store.users.length === 0 ? 'admin' : 'normal'),
      onboarded: false,
      createdAt: now,
      updatedAt: now,
    };

    this.store.users.push(user);
    this.save();
    return toPublicUser(user);
  }

  listUsers(): User[] {
    return this.store.users.map(toPublicUser);
  }

  getUser(id: number): User | undefined {
    const u = this.store.users.find((u) => u.id === id);
    return u ? toPublicUser(u) : undefined;
  }

  async deleteUser(id: number): Promise<void> {
    const idx = this.store.users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('User not found');
    this.store.users.splice(idx, 1);
    // Remove associated sessions
    this.store.sessions = this.store.sessions.filter((s) => s.userId !== id);
    this.save();
  }

  async updateUser(id: number, updates: { password?: string; onboarded?: boolean }): Promise<User> {
    const user = this.store.users.find((u) => u.id === id);
    if (!user) throw new Error('User not found');

    if (updates.password !== undefined) {
      user.password = await bcrypt.hash(updates.password, BCRYPT_COST);
    }
    if (updates.onboarded !== undefined) {
      user.onboarded = updates.onboarded;
    }
    user.updatedAt = new Date().toISOString();
    this.save();
    return toPublicUser(user);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<{ user: User; session: Session }> {
    const user = this.store.users.find((u) => u.username === username);
    if (!user) throw new Error('Invalid username or password');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new Error('Invalid username or password');

    const session = this.createSession(user.id);
    return { user: toPublicUser(user), session };
  }

  logout(sessionId: string): void {
    this.store.sessions = this.store.sessions.filter((s) => s.id !== sessionId);
    this.save();
  }

  validateSession(sessionId: string): User | null {
    const session = this.store.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      // Expired — clean up
      this.store.sessions = this.store.sessions.filter((s) => s.id !== sessionId);
      this.save();
      return null;
    }

    const user = this.store.users.find((u) => u.id === session.userId);
    return user ? toPublicUser(user) : null;
  }

  // ── Onboard ──────────────────────────────────────────────────────────────

  markOnboarded(userId: number): void {
    const user = this.store.users.find((u) => u.id === userId);
    if (!user) throw new Error('User not found');
    user.onboarded = true;
    user.updatedAt = new Date().toISOString();
    this.save();
  }

  // ── Dev helpers ──────────────────────────────────────────────────────────

  /**
   * Inject a default admin user for development mode.
   * Returns the existing admin session or creates one.
   */
  async ensureDevAdmin(): Promise<{ user: User; session: Session }> {
    const DEV_USERNAME = 'admin';
    const DEV_PASSWORD = 'admin';

    let storedUser = this.store.users.find((u) => u.username === DEV_USERNAME);
    if (!storedUser) {
      await this.createUser(DEV_USERNAME, DEV_PASSWORD, 'admin');
      storedUser = this.store.users.find((u) => u.username === DEV_USERNAME);
      if (!storedUser) {
        throw new Error('Failed to create dev admin user');
      }
      // Mark the dev admin as already onboarded
      storedUser.onboarded = true;
      this.save();
    }

    // Reuse or create a session
    const userId = storedUser.id;
    const existing = this.store.sessions.find(
      (s) => s.userId === userId && new Date(s.expiresAt).getTime() > Date.now(),
    );
    if (existing) {
      return { user: toPublicUser(storedUser), session: existing };
    }

    const session = this.createSession(storedUser.id);
    return { user: toPublicUser(storedUser), session };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private createSession(userId: number): Session {
    const now = new Date();
    const session: Session = {
      id: randomUUID(),
      userId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    };
    this.store.sessions.push(session);
    this.save();
    return session;
  }
}

function toPublicUser(u: StoredUser): User {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    onboarded: u.onboarded,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}
