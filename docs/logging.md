# Logging System

## Problem

The current logging setup has two issues:

1. **Core has no logger.** The core uses raw `console.*` calls (~34 occurrences across CLI, server, voice, process manager, registry). These are unstructured, have no levels, and are invisible in log files.
2. **MiniApp logger is minimal.** The custom `createLogger` in `core/src/services/logger.ts` writes to files with `appendFileSync`. No log levels, no stdout in development, no rotation, no structured output.

We need a unified system where core and MiniApps use the same logging library, with behavior that changes based on environment:

| Mode        | Target                | Format                       |
| ----------- | --------------------- | ---------------------------- |
| Development | stdout (pretty print) | Colorized, human-readable    |
| Production  | File                  | JSON (structured, parseable) |

## Library Choice: pino

[pino](https://github.com/pinojs/pino) — already a transitive dependency via Fastify.

### Why pino

- **Already in the dependency tree.** Fastify bundles pino. Adding it as a direct dependency costs zero additional `node_modules` weight.
- **Fastest Node.js logger.** Benchmarks consistently show pino at 5-10x faster than winston/bunyan due to its async, low-overhead design.
- **JSON by default.** Structured logs out of the box — ideal for production log ingestion.
- **pino-pretty for dev.** The companion `pino-pretty` package provides colorized, human-readable output piped through stdout. It is a dev-only dependency.
- **Child loggers.** `logger.child({ miniAppId: "note" })` creates scoped loggers with zero-copy overhead — exactly what MiniApps need.
- **Level filtering.** Built-in level support (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) with runtime level changes.
- **Transport system.** pino v7+ transports (file, rotating file, custom) run in a worker thread — non-blocking I/O without `appendFileSync`.
- **Fastify integration.** We can pass the same pino instance to `Fastify({ logger: pinoInstance })` to unify HTTP request logging with app logging.

### Alternatives Considered

| Library  | Verdict                                                                                  |
| -------- | ---------------------------------------------------------------------------------------- |
| winston  | Heavier, slower, not already in dep tree. Feature-rich but overkill for our needs.       |
| bunyan   | Unmaintained. JSON-focused but no transport worker threads.                              |
| consola  | Nice DX but no native file transports, weaker structured logging, not in dep tree.       |
| roarr    | JSON-only, no pretty-print mode, small community.                                        |
| loglevel | Browser-focused, no file writing, no structured output.                                  |
| Custom   | Current approach. No levels, sync I/O, no stdout mode, no rotation. Not worth extending. |

## Architecture

```
                      ┌──────────────────────────────────┐
                      │         Root pino Logger          │
                      │  (created once at startup in CLI) │
                      └──────┬───────────────┬───────────┘
                             │               │
                    .child()  │               │  .child()
                             │               │
              ┌──────────────▼──┐    ┌───────▼──────────────┐
              │  Core Logger    │    │  MiniApp Loggers      │
              │  { scope:"core"}│    │  { scope:"note" }     │
              │                 │    │  { scope:"todo" }     │
              │  Used by:       │    │  { scope:"file-exp" } │
              │  - CLI          │    │  { scope:"pref" }     │
              │  - Server       │    │                       │
              │  - ProcessMgr   │    │  Injected as          │
              │  - Registry     │    │  ctx.logger in        │
              │  - Voice        │    │  MiniAppContext        │
              └─────────────────┘    └───────────────────────┘
```

### Root Logger

Created once in the CLI `start` command. Configuration depends on environment:

```ts
import pino from 'pino';

function createRootLogger(opts: { dev: boolean; logDir: string }): pino.Logger {
  if (opts.dev) {
    // Dev: pretty-print to stdout
    return pino({
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  // Prod: structured JSON to file
  return pino(
    { level: 'info' },
    pino.destination({
      dest: join(opts.logDir, 'desktalk.log'),
      mkdir: true,
      sync: false,
    }),
  );
}
```

### Child Loggers for Core Subsystems

Each core subsystem gets a child logger for scoped context:

```ts
const rootLogger = createRootLogger({ dev, logDir: paths.log });

const serverLogger = rootLogger.child({ scope: 'server' });
const registryLogger = rootLogger.child({ scope: 'registry' });
const processLogger = rootLogger.child({ scope: 'process-mgr' });
const voiceLogger = rootLogger.child({ scope: 'voice' });
```

### Child Loggers for MiniApps

Each MiniApp gets a child logger scoped by its ID, injected via `MiniAppContext`:

```ts
// In backend-host.ts
const miniAppLogger = rootLogger.child({ scope: msg.miniAppId });

const context: MiniAppContext = {
  // ...
  logger: miniAppLogger,
  // ...
};
```

### Passing the Logger to Child Processes

MiniApp backends run in forked child processes. pino instances are not serializable over IPC, so the child recreates its own pino instance from config.

The main process sends logger config (level, dev flag, logDir) to the child via the `activate` IPC message. The child creates its own pino instance with the same config. In dev mode it writes to stdout (which is inherited from the parent process by default with `child_process.fork()`). In prod mode it writes to the same log file (`pino.destination` is append-safe across processes).

```ts
// In backend-host.ts (child process)
function createChildLogger(config: LoggerConfig, miniAppId: string): pino.Logger {
  const base = { scope: miniAppId };

  if (config.dev) {
    return pino({
      level: config.level,
      base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(
    { level: config.level, base },
    pino.destination({
      dest: join(config.logDir, 'desktalk.log'),
      mkdir: true,
      sync: false,
    }),
  );
}
```

### Updating the IPC Protocol

Add logger config to the `ActivateMessage`:

```ts
interface ActivateMessage {
  type: 'activate';
  miniAppId: string;
  backendPath: string;
  paths: MiniAppPaths;
  packageRoot: string;
  locale: string;
  // New fields:
  loggerConfig: {
    dev: boolean;
    level: string;
    logDir: string;
  };
}
```

### SDK Logger Interface

The existing `Logger` interface in `@desktalk/sdk` stays unchanged — it is already a subset of pino's API:

```ts
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}
```

pino's logger satisfies this interface. MiniApps depend only on `@desktalk/sdk` — they never import pino directly. The concrete pino instance is an implementation detail of the core.

### Fastify Integration

Pass the root logger (or a child) to Fastify so HTTP request logs go through the same pipeline:

```ts
const app = Fastify({
  logger: rootLogger.child({ scope: 'http' }),
});
```

This replaces the current `{ logger: false }` and gives us structured HTTP access logs for free.

## Dev/Prod Mode Detection

Add a `--dev` flag to the CLI:

```bash
desktalk start              # production mode (file logging)
desktalk start --dev        # development mode (stdout pretty logging)
```

Alternatively, read `NODE_ENV`:

```ts
const dev = process.env.NODE_ENV !== 'production';
```

The `--dev` flag takes precedence if both are set.

## Dependencies

| Package       | Where                            | Purpose                           |
| ------------- | -------------------------------- | --------------------------------- |
| `pino`        | `@desktalk/core`                 | Core logging (already transitive) |
| `pino-pretty` | `@desktalk/core` devDependencies | Pretty stdout in dev mode         |

MiniApps and `@desktalk/sdk` do **not** add pino as a dependency. They consume the `Logger` interface only.

## Migration

### What changes

| File / Area                                    | Change                                             |
| ---------------------------------------------- | -------------------------------------------------- |
| `core/src/services/logger.ts`                  | Replace custom impl with pino root + child factory |
| `core/src/cli/index.ts`                        | Create root logger, replace `console.log` calls    |
| `core/src/server/index.ts`                     | Pass logger to Fastify, replace `console.*` calls  |
| `core/src/services/backend-process-manager.ts` | Accept logger param, replace `console.*`           |
| `core/src/services/miniapp-registry.ts`        | Accept logger param, replace `console.*`           |
| `core/src/services/backend-host.ts`            | Create pino child from config sent via IPC         |
| `core/src/services/voice/voice-session.ts`     | Accept logger param, replace `console.*`           |
| `core/src/services/backend-ipc.ts`             | Add `loggerConfig` to `ActivateMessage`            |
| `sdk/src/types/context.ts`                     | No change — `Logger` interface already compatible  |
| MiniApp backends (`activate(ctx)`)             | No change — `ctx.logger` works as before           |

### What stays the same

- The `Logger` interface in `@desktalk/sdk` is unchanged.
- All MiniApp code (`ctx.logger.info(...)`) works without modification.
- Log file paths (`<logs>/<id>.log`) remain the same in production.

## Log Output Examples

### Development (stdout via pino-pretty)

```
14:23:01.442 INFO  [core]: Initializing workspace...
14:23:01.445 INFO  [core]:   Config: ~/Library/Application Support/DeskTalk
14:23:01.501 INFO  [registry]: Registered built-in MiniApp: note
14:23:01.502 INFO  [registry]: Registered built-in MiniApp: todo
14:23:01.510 INFO  [http]: Server listening on http://localhost:3000
14:23:02.100 INFO  [note]: MiniApp activated
14:23:05.300 INFO  [note]: Created note "Shopping List"
14:23:08.200 DEBUG [voice]: Session abc123 started (pcm_s16le, 16000Hz, 1ch)
```

### Production (JSON to file)

```json
{"level":30,"time":1710400981442,"scope":"core","msg":"Initializing workspace..."}
{"level":30,"time":1710400981501,"scope":"registry","msg":"Registered built-in MiniApp: note"}
{"level":30,"time":1710400981510,"scope":"http","msg":"Server listening on http://localhost:3000"}
{"level":30,"time":1710400982100,"scope":"note","msg":"MiniApp activated"}
```
