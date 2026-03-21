import envPaths from 'env-paths';
import { mkdirSync, existsSync, renameSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { MiniAppPaths } from '@desktalk/sdk';

/**
 * Platform-resolved workspace paths for DeskTalk.
 * Uses env-paths to follow XDG on Linux, Application Support on macOS, %APPDATA% on Windows.
 */
export interface WorkspacePaths {
  config: string;
  data: string;
  log: string;
  cache: string;
}

let workspacePaths: WorkspacePaths | null = null;

/**
 * Initialize workspace directories. Creates them if they don't exist.
 * Called once at startup.
 */
export function initWorkspace(): WorkspacePaths {
  const paths = envPaths('desktalk', { suffix: '' });

  workspacePaths = {
    config: paths.config,
    data: paths.data,
    log: paths.log,
    cache: paths.cache,
  };

  // Create top-level directories
  ensureDir(workspacePaths.config);
  ensureDir(workspacePaths.data);
  ensureDir(workspacePaths.log);
  ensureDir(workspacePaths.cache);

  // Create data subdirectories
  ensureDir(join(workspacePaths.data, 'home'));
  ensureDir(join(workspacePaths.data, 'miniapps'));

  return workspacePaths;
}

/**
 * Get the current workspace paths. Throws if not initialized.
 */
export function getWorkspacePaths(): WorkspacePaths {
  if (!workspacePaths) {
    throw new Error('Workspace not initialized. Call initWorkspace() first.');
  }
  return workspacePaths;
}

/**
 * Get the home directory for a user.
 */
export function getUserHomeDir(username: string): string {
  const ws = getWorkspacePaths();
  return join(ws.data, 'home', username);
}

/**
 * Ensure a user's home directory and its dot-prefixed subdirectories exist.
 */
export function ensureUserHome(username: string): void {
  const home = getUserHomeDir(username);
  ensureDir(home);
  ensureDir(join(home, '.data'));
  ensureDir(join(home, '.storage'));
  ensureDir(join(home, '.cache'));
  ensureDir(join(home, '.ai-sessions'));
}

/**
 * Resolve platform paths for a specific MiniApp, scoped to a user's home directory.
 *
 * Before (single user):
 *   ctx.paths.data = '<data>/data/note/'
 *
 * After (multi-user):
 *   ctx.paths.data = '<data>/home/alice/.data/note/'
 */
export function resolveMiniAppPaths(miniAppId: string, username: string): MiniAppPaths {
  const ws = getWorkspacePaths();
  const home = join(ws.data, 'home', username);
  const paths: MiniAppPaths = {
    home,
    data: join(home, '.data', miniAppId),
    storage: join(home, '.storage', `${miniAppId}.json`),
    log: join(ws.log, username, `${miniAppId}.log`),
    cache: join(home, '.cache', miniAppId),
  };

  // Ensure MiniApp-specific directories exist
  ensureDir(paths.data);
  ensureDir(join(ws.log, username));
  ensureDir(paths.cache);

  return paths;
}

/**
 * Migrate existing single-user data to the admin user's home directory.
 *
 * Detects legacy layout (`<data>/data/`, `<data>/storage/`) and moves
 * everything into `<data>/home/admin/.data/` and `<data>/home/admin/.storage/`.
 * This is a one-time, non-destructive migration for installations that
 * previously used the hardcoded 'admin' account.
 *
 * New installations (that go through the onboarding flow) will never have
 * these legacy directories, so this function is a no-op for them.
 */
export function migrateToMultiUser(): void {
  const ws = getWorkspacePaths();
  const legacyDataDir = join(ws.data, 'data');
  const legacyStorageDir = join(ws.data, 'storage');

  // Only migrate if the legacy directories exist and have content
  const hasLegacyData = existsSync(legacyDataDir) && readdirSync(legacyDataDir).length > 0;
  const hasLegacyStorage = existsSync(legacyStorageDir) && readdirSync(legacyStorageDir).length > 0;

  if (!hasLegacyData && !hasLegacyStorage) {
    return;
  }

  const adminHome = join(ws.data, 'home', 'admin');
  ensureDir(adminHome);

  // Move legacy data/* → home/admin/.data/*
  if (hasLegacyData) {
    const targetDataDir = join(adminHome, '.data');
    ensureDir(targetDataDir);
    for (const entry of readdirSync(legacyDataDir)) {
      const src = join(legacyDataDir, entry);
      const dest = join(targetDataDir, entry);
      if (!existsSync(dest)) {
        renameSync(src, dest);
      }
    }
    // Remove the now-empty legacy directory
    try {
      if (readdirSync(legacyDataDir).length === 0) {
        rmSync(legacyDataDir, { recursive: true });
      }
    } catch {
      // best-effort
    }
  }

  // Move legacy storage/* → home/admin/.storage/*
  if (hasLegacyStorage) {
    const targetStorageDir = join(adminHome, '.storage');
    ensureDir(targetStorageDir);
    for (const entry of readdirSync(legacyStorageDir)) {
      const src = join(legacyStorageDir, entry);
      const dest = join(targetStorageDir, entry);
      if (!existsSync(dest)) {
        renameSync(src, dest);
      }
    }
  }

  // Ensure remaining admin home subdirs exist
  ensureDir(join(adminHome, '.cache'));
  ensureDir(join(adminHome, '.ai-sessions'));
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
