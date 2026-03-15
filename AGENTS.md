# AGENTS

## Repo Conventions

- Keep component styles next to the component that owns them. Use colocated `*.module.scss` files instead of a shared frontend styles folder for component-specific modules.
- In source files, do not include the `.js` suffix in local import/export paths.
- Use `pnpm` for workspace commands.

## Verify Changes

- Lint: `pnpm lint`
- Unit tests: `pnpm unit:test`
- Build all packages: `pnpm build`

## Useful Package Commands

- Core build: `pnpm --filter @desktalk/core build`
- Core tests: `pnpm --filter @desktalk/core unit:test`
- Core dev: `pnpm --filter @desktalk/core dev`
