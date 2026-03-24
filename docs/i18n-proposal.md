# DeskTalk i18n Proposal

## Goal

DeskTalk should support localization across the core shell and every MiniApp without introducing a central monolithic translation file. Each package owns its own locale resources, while the runtime presents them as one application-level i18n system.

This proposal standardizes:

- one translation API for core and MiniApps
- package-local translation files
- scoped lookup rules
- default English source text in code
- parameterized messages
- `desktalk-build` support for extracting and bundling locale assets
- runtime fallback and locale loading behavior

## Design Principles

1. **Package ownership**: `@desktalk/core` and each MiniApp keep their own i18n files.
2. **One runtime**: the shell merges package catalogs into a single runtime registry.
3. **Stable keys**: every message has an explicit key, even when code also carries default English text.
4. **English in code**: developers always provide default English text at the call site, and that text is the final fallback at runtime.
5. **Localized files only when needed**: English does not need to exist in locale files in v1.
6. **Build-assisted validation**: developers should not maintain a global catalog manually.
7. **Works in frontend and backend**: the same localization contract is available in React UI, actions, and backend-generated user-facing strings.

## Terminology

- **Locale**: language tag such as `en`, `en-US`, `zh-CN`
- **Scope**: translation namespace owned by one package or sub-area
- **Message key**: stable lookup key inside a scope, such as `close`
- **Default text**: English fallback text embedded in source code and used when no localized string exists

## API

The user-facing API is a tagged template exported from `@desktalk/sdk`:

```ts
const close = $localize`@core/close:Close`;
const close2 = $localize`close:Close`; // uses current default scope
```

### Tagged Template Format

The canonical format is:

```ts
$localize`@<scope>/<key>:<default english text>`;
```

Scope is optional:

```ts
$localize`close:Close`;
```

Semantics:

- `@<scope>/` sets an explicit scope
- `<key>` is the stable translation key
- `:` separates the key from the default English text
- if scope is omitted, the current default scope is used

Examples:

```ts
$localize`@core/close:Close`;
$localize`@file-explorer/editor.empty:No file selected`;
$localize`save:Save`;
$localize`emptyState.title:No files yet`;
```

## Parameters

The same syntax supports interpolation inside the default English text:

```ts
$localize`notifications.count:You have ${count} notifications`;
$localize`invite.message:${name} invited you to ${workspace}`;
$localize`@core/windowCount:${count} windows open`;
```

The extractor converts interpolations to named placeholders in catalogs.

Example:

```ts
$localize`notifications.count:You have ${count} notifications`;
```

becomes conceptually:

```ts
__dtLocalize({
  scope: __dtScope,
  key: 'notifications.count',
  defaultText: 'You have {count} notifications',
  params: { count },
});
```

## Scope Model

Scope should be predictable and package-owned.

### Top-level package scopes

Each package gets one default scope equal to its app id:

| Package                           | Default scope   |
| --------------------------------- | --------------- |
| `@desktalk/core`                  | `core`          |
| `@desktalk/miniapp-file-explorer` | `file-explorer` |
| `@desktalk/miniapp-preference`    | `preference`    |
| `@desktalk/miniapp-preview`       | `preview`       |
| `@desktalk/miniapp-terminal`      | `terminal`      |
| `@desktalk/miniapp-text-edit`     | `text-edit`     |

Examples:

- inside core shell components, `$localize`close:Close``resolves to scope`core`
- inside file explorer MiniApp components, `$localize`close:Close``resolves to scope`file-explorer`

### Optional explicit scopes

A package may reference another package's scope explicitly when needed:

```ts
$localize`@core/close:Close`;
$localize`@core/window.maximize:Maximize`;
```

This should be used sparingly. Most package code should rely on its default scope.

### Default scope sources

The default scope comes from runtime context:

- core frontend: `I18nScopeProvider scope="core"`
- MiniApp frontend: the core wraps each MiniApp root with its manifest `id`
- backend activation context: `ctx.i18n` is pre-bound to the MiniApp id
- shared helpers may accept an explicit localizer when they do not belong to one scope

## Resource File Layout

Each package owns locale files in its own source tree.

### Core

```text
packages/core/
  src/
    i18n/
      zh-CN.json
```

### MiniApp

```text
packages/miniapp-file-explorer/
  src/
    i18n/
      zh-CN.json
```

### File shape

Each locale file contains only that package's default scope payload.

```json
{
  "close": "Close",
  "window.maximize": "Maximize",
  "editor.empty": "No file selected",
  "notifications.count": "You have {count} notifications"
}
```

Notes:

- Keys are package-local; the package scope is added by the build/runtime layer.
- Values are the translated strings for that locale.
- English does not need a locale file in v1.
- Default English text comes from code and is used as the runtime fallback.
- Translators edit package-local files only.

## Message Format

Use ICU-style named placeholders in catalogs:

```json
{
  "notifications.count": "You have {count} notifications",
  "invite.message": "{name} invited you to {workspace}"
}
```

Why:

- named placeholders are readable for translators
- they work for reordering in other languages
- they create a clean path to plural support later

### Recommended v1 scope

V1 should support:

- keyed lookup with default English text
- named parameter replacement
- locale fallback

V1 does not need to ship full ICU plural/select parsing yet. If needed later, the same storage format can grow into `IntlMessageFormat` or a similar formatter without changing the authoring syntax.

## Build Tool Responsibilities

`desktalk-build` should gain first-class i18n support for MiniApps, and the core build should follow the same rules.

### 1. Discover package locale files

For every package build:

- read `src/i18n/*.json`
- validate that file names are valid locale tags
- validate that values are strings
- validate placeholder consistency across locales

### 2. Extract messages from code

The build step scans frontend and backend entry graphs for `$localize` usages.

It extracts:

- `$localize`close:Close``-> scope = default scope, key =`close`, default text = `Close`
- `$localize`@core/close:Close``-> scope =`core`, key = `close`, default text = `Close`
- `$localize`notifications.count:You have ${count} notifications``-> key =`notifications.count`, default text = `You have {count} notifications`, params = `count`

### 3. Rewrite tagged templates

The build transforms tagged templates into runtime calls.

Conceptually:

```ts
$localize`close:Close`;
```

becomes:

```ts
__dtLocalize({
  scope: __dtScope,
  key: 'close',
  defaultText: 'Close',
});
```

and:

```ts
$localize`@core/windowCount:${count} windows open`;
```

becomes:

```ts
__dtLocalize({
  scope: 'core',
  key: 'windowCount',
  defaultText: '{count} windows open',
  params: { count },
});
```

### 4. Validate localized locale files

The build should validate localized files such as `zh-CN.json` against extracted keys and placeholders.

English source coverage does not require `en.json` in v1, because code already carries the default English text.

### 5. Emit a package locale manifest

Each build emits locale assets into `dist/i18n/`.

Example:

```text
dist/
  backend.js
  frontend.js
  i18n/
    manifest.json
    zh-CN.json
```

`manifest.json` includes:

- package name
- package scope
- available locales
- extracted keys with normalized default English text

### 6. Fail on invalid usage

The build should error when:

- a `$localize` string does not match the required grammar
- an interpolated message uses unsupported expressions that cannot produce stable param names
- locale files have mismatched placeholders
- two package files attempt to declare the same explicit scope by mistake

## Interpolation Rules

To keep extraction deterministic, v1 should support only simple identifier expressions in interpolated messages.

Allowed:

```ts
$localize`notifications.count:You have ${count} notifications`;
$localize`invite.message:${name} invited you`;
```

Not allowed in v1:

```ts
$localize`notifications.count:You have ${items.length} notifications`;
$localize`hello:Hello ${user.name}`;
$localize`total:Total ${formatPrice(total)}`;
```

Instead:

```ts
const notificationCount = items.length;
const userName = user.name;
const formattedTotal = formatPrice(total);
```

```ts
$localize`notifications.count:You have ${notificationCount} notifications`;
$localize`hello:Hello ${userName}`;
$localize`total:Total ${formattedTotal}`;
```

This restriction keeps the extractor simple and the catalog stable.

## Runtime Model

The core runtime is responsible for loading, merging, and serving translations.

### Registry

The core maintains a registry shaped conceptually like:

```ts
type TranslationRegistry = Record<Locale, Record<Scope, Record<string, string>>>;
```

At startup it loads:

- core locale assets
- built-in MiniApp locale assets
- installed third-party MiniApp locale assets

### Resolution order

For `localize(scope, key, defaultText, params)`:

1. exact locale + exact scope + key
2. base locale + exact scope + key
3. `defaultText` from code

Examples:

- requested `zh-HK` falls back to `zh`
- missing `file-explorer:close` returns English `Close`
- missing `notifications.count` returns the code default text with params applied

### Locale switching

- the current UI locale lives in core preferences, for example `general.language`
- core broadcasts `config:changed` when language changes
- frontend i18n context rerenders with the new locale
- MiniApps do not manage their own language state

## Core and MiniApp Integration

### Frontend

The SDK should expose:

- `$localize`
- `I18nProvider`
- `I18nScopeProvider`
- optional `useLocalize()` for imperative cases

The core shell mounts one app-wide `I18nProvider`, then wraps each MiniApp window in a scope provider derived from `manifest.id`.

### Backend

`MiniAppContext` should include a bound localizer:

```ts
interface MiniAppContext {
  i18n: {
    t(key: string, defaultText: string, params?: Record<string, string | number>): string;
    locale(): string;
  };
}
```

For MiniApps, `ctx.i18n.t('close', 'Close')` resolves under that MiniApp's default scope.

Core services may use an equivalent scoped localizer with scope `core`.

## Authoring Workflow

### Developer flow

1. write UI code with `$localize`
2. run `desktalk-build`
3. build extracts and validates all messages
4. translated locale files are updated by package owners as needed

### Recommended localization workflow

To reduce friction, the build may optionally generate a translation template file from extracted keys during a dedicated command such as:

```bash
desktalk-build --sync-i18n
```

This command can create or update non-English locale templates from the extracted key list and default English text.

Regular `desktalk-build` should remain strict about syntax, placeholder consistency, and locale-file validity, while allowing untranslated keys to fall back to code-provided English.

## Example

### Text Edit MiniApp code

```tsx
const title = $localize`title:Text Edit`;
const close = $localize`@core/close:Close`;
const notifications = $localize`notifications.count:You have ${count} notifications`;
```

### `packages/miniapp-text-edit/src/i18n/zh-CN.json`

```json
{
  "title": "文本编辑",
  "notifications.count": "你有 {count} 条通知"
}
```

## Proposed SDK and Build Changes

### `@desktalk/sdk`

- export `$localize` and runtime helpers
- export React i18n providers/hooks
- export types for locale catalogs and manifests
- export types for extracted message metadata and optional translation templates

### `desktalk-build`

- parse and rewrite `$localize` tagged templates
- validate `src/i18n/*.json`
- emit `dist/i18n/*`
- emit extracted message metadata with default English text
- optionally sync translation templates

### Core loader

- discover `dist/i18n/manifest.json` from core and each MiniApp
- merge catalogs into one registry keyed by locale and scope
- provide locale + scope context to frontend and backend

## Open Questions

These can be decided during implementation, but they do not block the overall design:

1. whether v1 should use a tiny custom formatter or adopt `IntlMessageFormat` immediately
2. whether `desktalk-build --sync-i18n` should modify locale files automatically or write template files only
3. whether explicit cross-package scope references like `@core/...` should be linted to avoid over-coupling

## Recommendation

Adopt this proposal with:

- package-owned `src/i18n/<locale>.json`
- default scope equal to package id
- `$localize` with the format `@<scope>/<key>:<default english text>`
- optional scope omission for same-package lookups
- code-provided English as the runtime fallback
- build-time extraction and validation in `desktalk-build`
- runtime merge in the core loader

This keeps i18n decentralized for package authors, while making localization feel like one coherent platform feature across the entire DeskTalk app.
