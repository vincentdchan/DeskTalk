# DeskTalk - Engineering Guidelines

- **Monorepo**: Use pnpm workspaces. All packages live under `packages/` and are published under the `@desktalk` npm scope.
- **Dependencies**: `@desktalk/core` references built-in MiniApps via `dependencies` (e.g., `"@desktalk/miniapp-note": "workspace:*"`).
- **TypeScript**: All packages should use TypeScript.
- **Linting/Formatting**: Shared ESLint and Prettier configs at the repo root.
- **Testing**: Each package includes its own tests. Use a shared test runner (e.g., Vitest).
