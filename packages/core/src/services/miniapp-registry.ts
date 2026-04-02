import type { MiniAppManifest, MiniAppBackendActivation } from '@desktalk/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import type pino from 'pino';
import { resolveMiniAppPaths } from './workspace';
import { getStoredPreference } from './preferences';
import { processManager } from './backend-process-manager';
import { buildMiniAppIconUrl } from './miniapp-icon';

/**
 * MiniApp backend module — what a MiniApp's backend entry exports.
 * Only manifest is used in the main process; the full module runs in a child.
 */
export interface MiniAppBackendModule {
  manifest: MiniAppManifest;
  activate(ctx: unknown): MiniAppBackendActivation;
  deactivate(): void;
}

/**
 * Runtime entry for a registered MiniApp.
 */
export interface MiniAppEntry {
  manifest: MiniAppManifest;
  packageRoot: string;
  /** Resolved import specifier the child process can use to load the module. */
  backendPath: string;
  iconFilePath?: string;
}

interface MiniAppBuildMetadata {
  iconFile?: string;
}

function resolveMetadataIconPath(packageRoot: string, iconFile: string): string | undefined {
  const normalized = normalize(iconFile);
  const relative = normalized.replace(/\\/g, '/');
  if (relative === '..' || relative.startsWith('../')) {
    return undefined;
  }

  const resolved = join(packageRoot, normalized);
  return existsSync(resolved) ? resolved : undefined;
}

function readMiniAppMetadata(packageRoot: string): MiniAppBuildMetadata {
  const metadataPath = join(packageRoot, 'dist', 'meta.json');
  if (!existsSync(metadataPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(metadataPath, 'utf8')) as MiniAppBuildMetadata;
  } catch {
    return {};
  }
}

/**
 * Registry that manages MiniApp discovery, activation, and deactivation.
 *
 * Activation now spawns an isolated child process per MiniApp via the
 * BackendProcessManager. The main process never runs backend code directly.
 */
class MiniAppRegistry {
  private entries = new Map<string, MiniAppEntry>();

  private normalizeLaunchArgs(
    launchArgs?: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    return Array.isArray(launchArgs) ? launchArgs : [];
  }

  /**
   * Register a MiniApp module (built-in or third-party).
   */
  register(manifest: MiniAppManifest, packageRoot: string, backendPath: string): void {
    if (this.entries.has(manifest.id)) {
      throw new Error(`MiniApp already registered: ${manifest.id}`);
    }
    const metadata = readMiniAppMetadata(packageRoot);
    const iconFilePath =
      typeof metadata.iconFile === 'string'
        ? resolveMetadataIconPath(packageRoot, metadata.iconFile)
        : undefined;
    this.entries.set(manifest.id, {
      manifest: {
        ...manifest,
        ...(iconFilePath ? { iconPng: buildMiniAppIconUrl(manifest.id) } : {}),
      },
      packageRoot,
      backendPath,
      iconFilePath,
    });
  }

  /**
   * Activate a MiniApp for a specific user — spawns an isolated child process.
   * The process is keyed by `miniAppId:username` so each user gets their own
   * backend instance with isolated data paths.
   */
  async activate(
    id: string,
    username: string,
    options?: { launchArgs?: Array<Record<string, unknown>> },
  ): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`MiniApp not found: ${id}`);
    }

    const processKey = `${id}:${username}`;
    if (processManager.isRunning(processKey)) {
      return;
    }

    const paths = resolveMiniAppPaths(id, username);
    const locale = String(getStoredPreference('general.language') ?? 'en');

    await processManager.spawn(
      processKey,
      entry.backendPath,
      entry.packageRoot,
      paths,
      locale,
      id,
      this.normalizeLaunchArgs(options?.launchArgs),
      entry.manifest.httpRoutes === true,
    );
  }

  /**
   * Deactivate a MiniApp for a specific user — stops its child process.
   */
  async deactivate(id: string, username: string): Promise<void> {
    const processKey = `${id}:${username}`;
    await processManager.kill(processKey);
  }

  /**
   * Check if a MiniApp is activated for a specific user.
   */
  isActivated(id: string, username: string): boolean {
    const processKey = `${id}:${username}`;
    return processManager.isRunning(processKey);
  }

  /**
   * Get all registered manifests (for the Dock).
   */
  getManifests(): MiniAppManifest[] {
    return Array.from(this.entries.values()).map((e) => e.manifest);
  }

  /**
   * Get a specific entry.
   */
  getEntry(id: string): MiniAppEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get all registered IDs.
   */
  getIds(): string[] {
    return Array.from(this.entries.keys());
  }
}

/**
 * Singleton registry instance.
 */
export const registry = new MiniAppRegistry();

/**
 * Register built-in MiniApps from their backend entries.
 */
export async function registerBuiltinMiniApps(logger?: pino.Logger): Promise<void> {
  // Built-in MiniApps are imported dynamically from their backend sub-path.
  // During development, these resolve via pnpm workspace links.
  const builtins = [
    '@desktalk/miniapp-note/backend',
    '@desktalk/miniapp-file-explorer/backend',
    '@desktalk/miniapp-preference/backend',
    '@desktalk/miniapp-preview/backend',
    '@desktalk/miniapp-player/backend',
    '@desktalk/miniapp-terminal/backend',
    '@desktalk/miniapp-text-edit/backend',
  ];

  for (const specifier of builtins) {
    try {
      const mod = (await import(specifier)) as MiniAppBackendModule;
      const backendFile = fileURLToPath(import.meta.resolve(specifier));
      const packageRoot = join(dirname(backendFile), '..');
      registry.register(mod.manifest, packageRoot, specifier);
    } catch (err) {
      // Built-in MiniApp not available yet — skip during early development
      logger?.warn({ specifier, err: (err as Error).message }, 'could not load built-in MiniApp');
    }
  }
}
