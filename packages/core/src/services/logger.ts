import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Logger } from '@desktalk/sdk';

/**
 * Creates a logger scoped to a MiniApp.
 * Logs are written to the given log file path.
 */
export function createLogger(logPath: string, prefix: string): Logger {
  // Ensure log directory exists
  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  // Create log file if it doesn't exist
  if (!existsSync(logPath)) {
    writeFileSync(logPath, '', 'utf-8');
  }

  function write(level: string, message: string, args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const argStr = args.length > 0 ? ' ' + args.map((a) => JSON.stringify(a)).join(' ') : '';
    const line = `[${timestamp}] [${level}] [${prefix}] ${message}${argStr}\n`;
    appendFileSync(logPath, line, 'utf-8');
  }

  return {
    info(message: string, ...args: unknown[]): void {
      write('INFO', message, args);
    },
    warn(message: string, ...args: unknown[]): void {
      write('WARN', message, args);
    },
    error(message: string, ...args: unknown[]): void {
      write('ERROR', message, args);
    },
    debug(message: string, ...args: unknown[]): void {
      write('DEBUG', message, args);
    },
  };
}
