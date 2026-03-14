#!/usr/bin/env node

import { Command } from 'commander';
import { initWorkspace } from '../services/workspace.js';
import { registerBuiltinMiniApps } from '../services/miniapp-registry.js';
import { createServer } from '../server/index.js';
import { processManager } from '../services/backend-process-manager.js';

const program = new Command();

program
  .name('desktalk')
  .description('DeskTalk — Browser-based OS-like desktop environment with AI assistant')
  .version('0.1.0');

program
  .command('start')
  .description('Start the DeskTalk server')
  .option('-H, --host <host>', 'Host to bind to', 'localhost')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .action(async (opts: { host: string; port: string }) => {
    const host = opts.host;
    const port = parseInt(opts.port, 10);

    console.log('Initializing workspace...');
    const paths = initWorkspace();
    console.log(`  Config: ${paths.config}`);
    console.log(`  Data:   ${paths.data}`);
    console.log(`  Logs:   ${paths.log}`);
    console.log(`  Cache:  ${paths.cache}`);

    console.log('\nRegistering built-in MiniApps...');
    await registerBuiltinMiniApps();

    console.log(`\nStarting DeskTalk on http://${host}:${port}`);
    await createServer({ host, port });
    console.log(`DeskTalk is running at http://${host}:${port}`);

    // Graceful shutdown — kill all backend child processes
    async function shutdown() {
      console.log('\nShutting down backend processes...');
      await processManager.killAll();
      process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program
  .command('list')
  .description('List installed MiniApps')
  .action(async () => {
    initWorkspace();
    await registerBuiltinMiniApps();

    const { registry } = await import('../services/miniapp-registry.js');
    const manifests = registry.getManifests();

    if (manifests.length === 0) {
      console.log('No MiniApps installed.');
      return;
    }

    console.log('Installed MiniApps:');
    for (const m of manifests) {
      console.log(`  ${m.id} (${m.name}) v${m.version}${m.description ? ' — ' + m.description : ''}`);
    }
  });

program.parse();
