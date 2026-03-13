import type {
  MiniAppManifest,
  MiniAppActivation,
  MiniAppContext,
  Disposable,
} from '@desktalk/sdk';
import { resolveMiniAppPaths } from './workspace.js';
import { createStorageHook } from './storage.js';
import { createFileSystemHook } from './filesystem.js';
import { createMessagingHook } from './messaging.js';
import { createLogger } from './logger.js';
import { join } from 'node:path';
import { getWorkspacePaths } from './workspace.js';

/**
 * MiniApp module — what a MiniApp npm package exports.
 */
export interface MiniAppModule {
  manifest: MiniAppManifest;
  activate(ctx: MiniAppContext): MiniAppActivation;
  deactivate(): void;
}

/**
 * Runtime entry for a registered MiniApp.
 */
export interface MiniAppEntry {
  manifest: MiniAppManifest;
  module: MiniAppModule;
  activation: MiniAppActivation | null;
  context: MiniAppContext | null;
}

/**
 * Registry that manages MiniApp discovery, activation, and deactivation.
 */
class MiniAppRegistry {
  private entries = new Map<string, MiniAppEntry>();

  /**
   * Register a MiniApp module (built-in or third-party).
   */
  register(mod: MiniAppModule): void {
    const { manifest } = mod;
    if (this.entries.has(manifest.id)) {
      throw new Error(`MiniApp already registered: ${manifest.id}`);
    }
    this.entries.set(manifest.id, {
      manifest,
      module: mod,
      activation: null,
      context: null,
    });
  }

  /**
   * Activate a MiniApp — creates its context and calls activate().
   */
  activate(id: string): MiniAppActivation {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`MiniApp not found: ${id}`);
    }
    if (entry.activation) {
      return entry.activation;
    }

    const paths = resolveMiniAppPaths(id);
    const context: MiniAppContext = {
      paths,
      storage: createStorageHook(paths.storage),
      fs: createFileSystemHook(paths.data),
      messaging: createMessagingHook(id),
      subscriptions: [],
      logger: createLogger(paths.log, id),
    };

    entry.context = context;
    entry.activation = entry.module.activate(context);
    context.logger.info('MiniApp activated');
    return entry.activation;
  }

  /**
   * Deactivate a MiniApp — calls deactivate() and cleans up.
   */
  deactivate(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || !entry.activation) {
      return;
    }

    // Dispose all subscriptions
    if (entry.context) {
      for (const sub of entry.context.subscriptions) {
        sub.dispose();
      }
      entry.context.logger.info('MiniApp deactivated');
    }

    entry.module.deactivate();
    entry.activation = null;
    entry.context = null;
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
   * Check if a MiniApp is activated.
   */
  isActivated(id: string): boolean {
    const entry = this.entries.get(id);
    return entry?.activation != null;
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
 * Register built-in MiniApps from their npm packages.
 */
export async function registerBuiltinMiniApps(): Promise<void> {
  // Built-in MiniApps are imported dynamically.
  // During development, these resolve via pnpm workspace links.
  const builtins = [
    '@desktalk/miniapp-note',
    '@desktalk/miniapp-todo',
    '@desktalk/miniapp-file-explorer',
    '@desktalk/miniapp-preference',
  ];

  for (const pkgName of builtins) {
    try {
      const mod = (await import(pkgName)) as MiniAppModule;
      registry.register(mod);
    } catch (err) {
      // Built-in MiniApp not available yet — skip during early development
      console.warn(`[registry] Could not load built-in MiniApp "${pkgName}":`, (err as Error).message);
    }
  }
}
