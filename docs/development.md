# DeskTalk - Development Guide

## Workspace Basics

- DeskTalk uses a pnpm workspace monorepo.
- All publishable packages live under `packages/` and use the `@desktalk/*` npm scope.
- Use Node.js `>=20.0.0` and pnpm `>=9.0.0`.

## Common Commands

Run these from the repository root:

```bash
pnpm install
pnpm build
pnpm lint
pnpm unit:test
```

Useful package-level commands:

```bash
pnpm --filter @desktalk/core dev
pnpm --filter @desktalk/core build
pnpm --filter @desktalk/core unit:test
pnpm --filter @desktalk/ui storybook
```

## Development Workflow

1. Install dependencies with `pnpm install`.
2. Build shared dependencies when needed with `pnpm build`.
3. Start the core app in development with `pnpm --filter @desktalk/core dev`.
4. Run `pnpm lint` and `pnpm unit:test` before opening a PR.

## Version Management

DeskTalk uses a synchronized version across the root package and all workspace packages.

Check versions:

```bash
pnpm version:check
```

Set a new version for every package:

```bash
pnpm version:set 0.1.0-alpha.1
```

The CLI version for `desktalk` is read from `packages/core/package.json`, so it stays in sync automatically.

## Publishing to npm

DeskTalk publishes scoped packages to the public npm registry.

### One-time setup

Log in to npm:

```bash
npm login --registry https://registry.npmjs.org/
```

Confirm the active registry and authenticated user:

```bash
npm config get registry
npm whoami --registry https://registry.npmjs.org/
```

### Pre-publish checks

Run the full verification flow before publishing:

```bash
pnpm build
pnpm lint
pnpm unit:test
pnpm -r --filter "./packages/*" publish --dry-run --tag alpha --no-git-checks --registry https://registry.npmjs.org/
```

### Manual alpha publish

Set the release version first:

```bash
pnpm version:set 0.1.0-alpha.1
pnpm version:check
```

Publish all packages with the `alpha` dist-tag:

```bash
pnpm -r --filter "./packages/*" publish --tag alpha --no-git-checks --registry https://registry.npmjs.org/
```

Using the `alpha` dist-tag keeps prereleases off `latest`.

### Recommended release flow

```bash
pnpm version:set 0.1.0-alpha.1
pnpm version:check
pnpm build
pnpm lint
pnpm unit:test
pnpm -r --filter "./packages/*" publish --dry-run --tag alpha --no-git-checks --registry https://registry.npmjs.org/
pnpm -r --filter "./packages/*" publish --tag alpha --no-git-checks --registry https://registry.npmjs.org/
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

## CI Publish Workflow

- GitHub Actions publish automation lives in `.github/workflows/publish.yml`.
- The workflow triggers on pushed tags matching `v*`.
- Dist-tags are selected from the version string:
  - `*-alpha.*` -> `alpha`
  - `*-beta.*` -> `beta`
  - `*-rc.*` -> `next`
  - no prerelease suffix -> `latest`
- Set the repository secret `NPM_TOKEN` before relying on CI publishing.

## Packaging Notes

- Packages use `prepack` to rebuild before publish.
- Published package contents are controlled with each package's `files` field.
- MiniApp packages include `dist/` and `icons/` because icon metadata is resolved from package assets at runtime.
