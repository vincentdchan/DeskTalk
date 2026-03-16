import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserService } from './user-service';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = join(tmpdir(), 'desktalk-user-service-test');
const TEST_FILE = join(TEST_DIR, 'users.json');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
});

afterEach(() => {
  if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
});

describe('UserService', () => {
  describe('setup mode', () => {
    it('reports setup mode when no users exist', () => {
      const svc = new UserService(TEST_FILE);
      expect(svc.isSetupMode()).toBe(true);
    });

    it('exits setup mode after creating a user', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      expect(svc.isSetupMode()).toBe(false);
    });
  });

  describe('createUser', () => {
    it('creates first user as admin by default', async () => {
      const svc = new UserService(TEST_FILE);
      const user = await svc.createUser('admin', 'password123');
      expect(user.role).toBe('admin');
      expect(user.username).toBe('admin');
      expect(user.onboarded).toBe(false);
      expect(user.id).toBe(1);
    });

    it('creates second user as normal by default', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      const user = await svc.createUser('alice', 'password456');
      expect(user.role).toBe('normal');
    });

    it('rejects duplicate usernames', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      await expect(svc.createUser('admin', 'other')).rejects.toThrow('Username already exists');
    });

    it('does not expose password in returned user', async () => {
      const svc = new UserService(TEST_FILE);
      const user = await svc.createUser('admin', 'password123');
      expect((user as unknown as Record<string, unknown>).password).toBeUndefined();
    });
  });

  describe('login / logout', () => {
    it('logs in with correct credentials', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      const { user, session } = await svc.login('admin', 'password123');
      expect(user.username).toBe('admin');
      expect(session.id).toBeTruthy();
    });

    it('rejects wrong password', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      await expect(svc.login('admin', 'wrong')).rejects.toThrow('Invalid username or password');
    });

    it('rejects unknown username', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      await expect(svc.login('nobody', 'password123')).rejects.toThrow(
        'Invalid username or password',
      );
    });

    it('logout invalidates session', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      const { session } = await svc.login('admin', 'password123');
      expect(svc.validateSession(session.id)).not.toBeNull();
      svc.logout(session.id);
      expect(svc.validateSession(session.id)).toBeNull();
    });
  });

  describe('validateSession', () => {
    it('validates an active session', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      const { session } = await svc.login('admin', 'password123');
      const user = svc.validateSession(session.id);
      expect(user).not.toBeNull();
      expect(user!.username).toBe('admin');
    });

    it('returns null for unknown session id', () => {
      const svc = new UserService(TEST_FILE);
      expect(svc.validateSession('nonexistent')).toBeNull();
    });
  });

  describe('onboarding', () => {
    it('marks user as onboarded', async () => {
      const svc = new UserService(TEST_FILE);
      const user = await svc.createUser('admin', 'password123');
      expect(user.onboarded).toBe(false);
      svc.markOnboarded(user.id);
      const updated = svc.getUser(user.id);
      expect(updated!.onboarded).toBe(true);
    });
  });

  describe('user CRUD', () => {
    it('lists all users', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      await svc.createUser('alice', 'password456');
      const users = svc.listUsers();
      expect(users).toHaveLength(2);
    });

    it('deletes a user and its sessions', async () => {
      const svc = new UserService(TEST_FILE);
      await svc.createUser('admin', 'password123');
      const alice = await svc.createUser('alice', 'password456');
      const { session } = await svc.login('alice', 'password456');
      await svc.deleteUser(alice.id);
      expect(svc.listUsers()).toHaveLength(1);
      expect(svc.validateSession(session.id)).toBeNull();
    });

    it('updates user password', async () => {
      const svc = new UserService(TEST_FILE);
      const user = await svc.createUser('admin', 'password123');
      await svc.updateUser(user.id, { password: 'newpassword' });
      // Old password should fail
      await expect(svc.login('admin', 'password123')).rejects.toThrow();
      // New password should work
      const { user: loggedIn } = await svc.login('admin', 'newpassword');
      expect(loggedIn.username).toBe('admin');
    });
  });

  describe('ensureDevAdmin', () => {
    it('creates admin user marked as onboarded', async () => {
      const svc = new UserService(TEST_FILE);
      const { user, session } = await svc.ensureDevAdmin();
      expect(user.username).toBe('admin');
      expect(user.role).toBe('admin');
      expect(user.onboarded).toBe(true);
      expect(session.id).toBeTruthy();
    });

    it('reuses existing admin on subsequent calls', async () => {
      const svc = new UserService(TEST_FILE);
      const first = await svc.ensureDevAdmin();
      const second = await svc.ensureDevAdmin();
      expect(first.user.id).toBe(second.user.id);
      expect(first.session.id).toBe(second.session.id);
    });
  });

  describe('persistence', () => {
    it('survives service restart', async () => {
      const svc1 = new UserService(TEST_FILE);
      await svc1.createUser('admin', 'password123');
      const { session } = await svc1.login('admin', 'password123');

      // Create a new instance (simulates restart)
      const svc2 = new UserService(TEST_FILE);
      expect(svc2.isSetupMode()).toBe(false);
      const user = svc2.validateSession(session.id);
      expect(user).not.toBeNull();
      expect(user!.username).toBe('admin');
    });
  });
});
