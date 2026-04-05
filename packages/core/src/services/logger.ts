import pino from 'pino';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

/**
 * Serializable logger configuration passed to child processes via IPC.
 */
export interface LoggerConfig {
  dev: boolean;
  level: string;
  logDir: string;
}

/**
 * Creates the root pino logger.
 *
 * - Dev mode:  pretty-printed to stdout via pino-pretty (debug level).
 * - Prod mode: pretty-printed to stdout + structured JSON to <logDir>/desktalk.log (info level).
 */
export function createRootLogger(opts: { dev: boolean; logDir: string }): pino.Logger {
  if (opts.dev) {
    return pino({
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      },
    });
  }

  // Ensure log directory exists
  if (!existsSync(opts.logDir)) {
    mkdirSync(opts.logDir, { recursive: true });
  }

  return pino({
    level: 'info',
    transport: {
      targets: [
        {
          target: 'pino-pretty',
          level: 'info',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: true,
            destination: 1, // stdout
          },
        },
        {
          target: 'pino/file',
          level: 'info',
          options: {
            destination: join(opts.logDir, 'desktalk.log'),
            mkdir: true,
          },
        },
      ],
    },
  });
}

/**
 * Creates a pino logger in a child process from the serialized config.
 * Used by backend-host.ts — each MiniApp child recreates its own logger.
 */
export function createChildLogger(config: LoggerConfig, scope: string): pino.Logger {
  if (config.dev) {
    return pino({
      level: config.level,
      base: { scope },
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      },
    });
  }

  // Ensure log directory exists
  if (!existsSync(config.logDir)) {
    mkdirSync(config.logDir, { recursive: true });
  }

  return pino({
    level: config.level,
    base: { scope },
    transport: {
      targets: [
        {
          target: 'pino-pretty',
          level: 'info',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: true,
            destination: 1, // stdout
          },
        },
        {
          target: 'pino/file',
          level: config.level,
          options: {
            destination: join(config.logDir, 'desktalk.log'),
            mkdir: true,
          },
        },
      ],
    },
  });
}

/**
 * Extracts a serializable LoggerConfig from a root logger's setup.
 * Passed over IPC to child processes so they can recreate an equivalent logger.
 */
export function getLoggerConfig(opts: {
  dev: boolean;
  level: string;
  logDir: string;
}): LoggerConfig {
  return {
    dev: opts.dev,
    level: opts.level,
    logDir: opts.logDir,
  };
}
