import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initUserDb,
  closeUserDb,
  createUser,
  findUser,
  listUsers,
  deleteUser,
  updateUserRole,
  updateUserPassword,
  hasAdmin,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession,
  deleteUserSessions,
} from './user-db';

/** Create a fresh temp directory and initialize the DB before each test. */
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'desktalk-userdb-test-'));
  initUserDb(tempDir);
});

afterEach(() => {
  closeUserDb();
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Schema & Initialization ────────────────────────────────────────────────

describe('initUserDb', () => {
  it('creates an empty database with no users', () => {
    const users = listUsers();
    expect(users).toHaveLength(0);
  });

  it('reports no admin exists in a fresh database', () => {
    expect(hasAdmin()).toBe(false);
  });
});

// ─── User CRUD ──────────────────────────────────────────────────────────────

describe('createUser', () => {
  it('creates a user with default role "user"', () => {
    const user = createUser('alice', 'password123');
    expect(user.username).toBe('alice');
    expect(user.displayName).toBe('alice');
    expect(user.role).toBe('user');
    expect(user.createdAt).toBeTruthy();
    expect(user.updatedAt).toBeTruthy();
  });

  it('uses displayName when provided', () => {
    const user = createUser('bob', 'password123', 'user', 'Bob Smith');
    expect(user.displayName).toBe('Bob Smith');
  });

  it('creates an admin user', () => {
    const user = createUser('myadmin', 'password123', 'admin', 'Admin User');
    expect(user.role).toBe('admin');
  });

  it('throws on duplicate username', () => {
    createUser('alice', 'password123');
    expect(() => createUser('alice', 'password456')).toThrow();
  });
});

describe('findUser', () => {
  it('returns undefined for non-existent user', () => {
    expect(findUser('ghost')).toBeUndefined();
  });

  it('returns the user when found', () => {
    createUser('alice', 'password123', 'user', 'Alice');
    const user = findUser('alice');
    expect(user).toBeDefined();
    expect(user!.username).toBe('alice');
    expect(user!.displayName).toBe('Alice');
  });

  it('does not expose the password hash', () => {
    createUser('alice', 'password123');
    const user = findUser('alice');
    expect(user).toBeDefined();
    // PublicUser should not have a 'password' property
    expect('password' in user!).toBe(false);
  });
});

describe('listUsers', () => {
  it('returns all users sorted by created_at', () => {
    createUser('alice', 'password123');
    createUser('bob', 'password456');
    const users = listUsers();
    expect(users).toHaveLength(2);
    expect(users[0].username).toBe('alice');
    expect(users[1].username).toBe('bob');
  });
});

describe('deleteUser', () => {
  it('deletes an existing user and returns true', () => {
    createUser('alice', 'password123');
    expect(deleteUser('alice')).toBe(true);
    expect(findUser('alice')).toBeUndefined();
  });

  it('returns false for non-existent user', () => {
    expect(deleteUser('ghost')).toBe(false);
  });
});

describe('updateUserRole', () => {
  it('changes a user role from user to admin', () => {
    createUser('alice', 'password123');
    expect(updateUserRole('alice', 'admin')).toBe(true);
    expect(findUser('alice')!.role).toBe('admin');
  });

  it('returns false for non-existent user', () => {
    expect(updateUserRole('ghost', 'admin')).toBe(false);
  });
});

describe('updateUserPassword', () => {
  it('changes the password so old password no longer verifies', () => {
    createUser('alice', 'oldpass12');
    updateUserPassword('alice', 'newpass34');
    expect(verifyPassword('alice', 'oldpass12')).toBeUndefined();
    expect(verifyPassword('alice', 'newpass34')).toBeDefined();
  });

  it('returns false for non-existent user', () => {
    expect(updateUserPassword('ghost', 'newpass34')).toBe(false);
  });
});

// ─── hasAdmin ───────────────────────────────────────────────────────────────

describe('hasAdmin', () => {
  it('returns false when no users exist', () => {
    expect(hasAdmin()).toBe(false);
  });

  it('returns false when only non-admin users exist', () => {
    createUser('alice', 'password123', 'user');
    expect(hasAdmin()).toBe(false);
  });

  it('returns true when an admin user exists', () => {
    createUser('myadmin', 'password123', 'admin');
    expect(hasAdmin()).toBe(true);
  });

  it('returns true when multiple admins exist', () => {
    createUser('admin1', 'password123', 'admin');
    createUser('admin2', 'password456', 'admin');
    expect(hasAdmin()).toBe(true);
  });

  it('returns false after the only admin is deleted', () => {
    createUser('myadmin', 'password123', 'admin');
    deleteUser('myadmin');
    expect(hasAdmin()).toBe(false);
  });
});

// ─── Password verification ──────────────────────────────────────────────────

describe('verifyPassword', () => {
  it('returns the user on correct password', () => {
    createUser('alice', 'correcthorse');
    const user = verifyPassword('alice', 'correcthorse');
    expect(user).toBeDefined();
    expect(user!.username).toBe('alice');
  });

  it('returns undefined on wrong password', () => {
    createUser('alice', 'correcthorse');
    expect(verifyPassword('alice', 'wrongpassword')).toBeUndefined();
  });

  it('returns undefined for non-existent user', () => {
    expect(verifyPassword('ghost', 'password123')).toBeUndefined();
  });
});

// ─── Sessions ───────────────────────────────────────────────────────────────

describe('createSession', () => {
  it('returns a hex token string', () => {
    createUser('alice', 'password123');
    const token = createSession('alice');
    expect(typeof token).toBe('string');
    expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('creates unique tokens for successive calls', () => {
    createUser('alice', 'password123');
    const token1 = createSession('alice');
    const token2 = createSession('alice');
    expect(token1).not.toBe(token2);
  });
});

describe('validateSession', () => {
  it('returns the user for a valid session', () => {
    createUser('alice', 'password123', 'user', 'Alice');
    const token = createSession('alice');
    const user = validateSession(token);
    expect(user).toBeDefined();
    expect(user!.username).toBe('alice');
    expect(user!.displayName).toBe('Alice');
  });

  it('returns undefined for an unknown token', () => {
    expect(validateSession('nonexistenttoken')).toBeUndefined();
  });
});

describe('deleteSession', () => {
  it('invalidates a session so it can no longer be validated', () => {
    createUser('alice', 'password123');
    const token = createSession('alice');
    expect(validateSession(token)).toBeDefined();
    deleteSession(token);
    expect(validateSession(token)).toBeUndefined();
  });
});

describe('deleteUserSessions', () => {
  it('removes all sessions for a user', () => {
    createUser('alice', 'password123');
    const token1 = createSession('alice');
    const token2 = createSession('alice');
    deleteUserSessions('alice');
    expect(validateSession(token1)).toBeUndefined();
    expect(validateSession(token2)).toBeUndefined();
  });

  it('does not affect other users sessions', () => {
    createUser('alice', 'password123');
    createUser('bob', 'password456');
    const aliceToken = createSession('alice');
    const bobToken = createSession('bob');
    deleteUserSessions('alice');
    expect(validateSession(aliceToken)).toBeUndefined();
    expect(validateSession(bobToken)).toBeDefined();
  });
});

describe('session cascade on user delete', () => {
  it('deletes sessions when the user is deleted', () => {
    createUser('alice', 'password123');
    const token = createSession('alice');
    expect(validateSession(token)).toBeDefined();
    deleteUser('alice');
    expect(validateSession(token)).toBeUndefined();
  });
});
