#!/usr/bin/env node

import { Command } from 'commander';
import { initWorkspace, migrateToMultiUser, ensureUserHome } from '../services/workspace';
import { registerBuiltinMiniApps } from '../services/miniapp-registry';
import { createServer } from '../server/index';
import { processManager } from '../services/backend-process-manager';
import { createRootLogger, getLoggerConfig } from '../services/logger';
import { initUserDb, closeUserDb } from '../services/user-db';

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
  .option('-d, --dev', 'Enable development mode (pretty stdout logging)', false)
  .action(async (opts: { host: string; port: string; dev: boolean }) => {
    const host = opts.host;
    const port = parseInt(opts.port, 10);
    const dev = opts.dev || process.env.NODE_ENV !== 'production';

    const paths = initWorkspace();

    const rootLogger = createRootLogger({ dev, logDir: paths.log });
    const log = rootLogger.child({ scope: 'core' });

    log.info(
      { config: paths.config, data: paths.data, logs: paths.log, cache: paths.cache },
      'workspace initialized',
    );

    // Initialize the user database, run data migration, and ensure admin home exists
    initUserDb(paths.data);
    migrateToMultiUser();
    ensureUserHome('admin');
    log.info('user database initialized');

    // Initialize the process manager with logger config so child processes can recreate it
    const loggerConfig = getLoggerConfig({ dev, level: rootLogger.level, logDir: paths.log });
    processManager.init(rootLogger.child({ scope: 'process-mgr' }), loggerConfig);

    log.info('registering built-in MiniApps');
    await registerBuiltinMiniApps(rootLogger.child({ scope: 'registry' }));

    log.info({ host, port, dev }, 'starting DeskTalk server');
    await createServer({ dev, host, port, logger: rootLogger });
    if (dev) {
      log.info(
        {
          apiUrl: `http://${host}:${port}`,
          frontendUrl: 'http://localhost:5173',
        },
        'DeskTalk dev mode is running',
      );
    } else {
      log.info({ url: `http://${host}:${port}` }, 'DeskTalk is running');
    }

    // Graceful shutdown — kill all backend child processes
    async function shutdown() {
      log.info('shutting down backend processes');
      await processManager.killAll();
      closeUserDb();
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

    const { registry } = await import('../services/miniapp-registry');
    const manifests = registry.getManifests();

    if (manifests.length === 0) {
      console.log('No MiniApps installed.');
      return;
    }

    console.log('Installed MiniApps:');
    for (const m of manifests) {
      console.log(
        `  ${m.id} (${m.name}) v${m.version}${m.description ? ' — ' + m.description : ''}`,
      );
    }
  });

program.parse();
