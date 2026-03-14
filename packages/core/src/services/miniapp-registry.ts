import type { MiniAppManifest, MiniAppBackendActivation } from '@desktalk/sdk';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveMiniAppPaths } from './workspace.js';
import { getStoredPreference } from './preferences.js';
import { processManager } from './backend-process-manager.js';

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
}

/**
 * Registry that manages MiniApp discovery, activation, and deactivation.
 *
 * Activation now spawns an isolated child process per MiniApp via the
 * BackendProcessManager. The main process never runs backend code directly.
 */
class MiniAppRegistry {
  private entries = new Map<string, MiniAppEntry>();

  /**
   * Register a MiniApp module (built-in or third-party).
   */
  register(manifest: MiniAppManifest, packageRoot: string, backendPath: string): void {
    if (this.entries.has(manifest.id)) {
      throw new Error(`MiniApp already registered: ${manifest.id}`);
    }
    this.entries.set(manifest.id, {
      manifest,
      packageRoot,
      backendPath,
    });
  }

  /**
   * Activate a MiniApp — spawns an isolated child process.
   */
  async activate(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`MiniApp not found: ${id}`);
    }
    if (processManager.isRunning(id)) {
      return;
    }

    const paths = resolveMiniAppPaths(id);
    const locale = String(getStoredPreference('general.language') ?? 'en');

    await processManager.spawn(
      id,
      entry.backendPath,
      entry.packageRoot,
      paths,
      locale,
    );
  }

  /**
   * Deactivate a MiniApp — stops its child process.
   */
  async deactivate(id: string): Promise<void> {
    await processManager.kill(id);
  }

  /**
   * Check if a MiniApp is activated (child process running).
   */
  isActivated(id: string): boolean {
    return processManager.isRunning(id);
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
export async function registerBuiltinMiniApps(): Promise<void> {
  // Built-in MiniApps are imported dynamically from their backend sub-path.
  // During development, these resolve via pnpm workspace links.
  const builtins = [
    '@desktalk/miniapp-note/backend',
    '@desktalk/miniapp-todo/backend',
    '@desktalk/miniapp-file-explorer/backend',
    '@desktalk/miniapp-preference/backend',
  ];

  for (const specifier of builtins) {
    try {
      const mod = (await import(specifier)) as MiniAppBackendModule;
      const backendFile = fileURLToPath(import.meta.resolve(specifier));
      const packageRoot = join(dirname(backendFile), '..');
      registry.register(mod.manifest, packageRoot, specifier);
    } catch (err) {
      // Built-in MiniApp not available yet — skip during early development
      console.warn(
        `[registry] Could not load built-in MiniApp "${specifier}":`,
        (err as Error).message,
      );
    }
  }
}
