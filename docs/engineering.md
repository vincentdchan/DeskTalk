# DeskTalk - Engineering Guidelines

- **Monorepo**: Use pnpm workspaces. All packages live under `packages/` and are published under the `@desktalk` npm scope.
- **Dependencies**: `@desktalk/core` references built-in MiniApps via `dependencies` (e.g., `"@desktalk/miniapp-note": "workspace:*"`).
- **TypeScript**: All packages should use TypeScript.
- **Linting/Formatting**: Shared ESLint and Prettier configs at the repo root.
- **Testing**: Each package owns its own unit tests and Vitest config. Do not use a root Vitest config.
- **Unit test script**: Packages with unit tests should expose `unit:test` in their own `package.json`.
- **Workspace test command**: Run all package unit tests from the repo root with `pnpm unit:test`, which delegates to `pnpm -r --if-present run unit:test`.
- **Test locations**: Keep test files alongside source under `src/**/*.test.ts` or `src/**/*.test.tsx`.
- **Build isolation**: Package build tsconfig files should exclude test files so production builds do not compile test code.
- **CI**: GitHub Actions should run `pnpm unit:test` on both `push` and `pull_request`.
