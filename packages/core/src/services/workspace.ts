import envPaths from 'env-paths';
import { mkdirSync, existsSync } from 'node:fs';
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
  ensureDir(join(workspacePaths.data, 'data'));
  ensureDir(join(workspacePaths.data, 'storage'));
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
 * Resolve platform paths for a specific MiniApp.
 */
export function resolveMiniAppPaths(miniAppId: string): MiniAppPaths {
  const ws = getWorkspacePaths();
  const paths: MiniAppPaths = {
    data: join(ws.data, 'data', miniAppId),
    storage: join(ws.data, 'storage', `${miniAppId}.json`),
    log: join(ws.log, `${miniAppId}.log`),
    cache: join(ws.cache, miniAppId),
  };

  // Ensure MiniApp-specific directories exist
  ensureDir(paths.data);
  ensureDir(paths.cache);

  return paths;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
