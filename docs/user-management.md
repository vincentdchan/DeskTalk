# User Management & Data Layout Proposal

## Motivation

DeskTalk currently has no concept of users — a single anonymous session owns all data. This proposal introduces a multi-user system with an admin account, normal accounts, cookie-based authentication, and a first-login onboarding flow. It also redesigns the data directory layout to give each user an isolated home directory, and proposes where MiniApp packages should be installed.

## Page Routing

With user management, the frontend has three top-level pages. The core router decides which one to render based on system and session state.

| Page        | When shown                                                          |
| ----------- | ------------------------------------------------------------------- |
| **Onboard** | No `users.db` or no admin account exists (first-time system setup). |
| **Login**   | System is initialized, but no valid session cookie.                 |
| **Desktop** | Valid session.                                                      |

### Flow

```
Browser request
  │
  ├─ No users.db / no admin ─────────────► Onboard page (admin setup)
  │
  ├─ No session cookie ──────────────────► Login page
  │
  ├─ Cookie present, invalid/expired ────► Login page
  │
  └─ Cookie valid ───────────────────────► Desktop
```

The Onboard page is shown only once — on the very first launch — to create the admin account. See [onboarding.md](./onboarding.md) for full details. The Login page is a standalone form (username + password). After successful authentication the server sets an HTTP-only session cookie and redirects to the Desktop.

## Authentication

### Cookie-Based Sessions

- On successful login the server returns an **HTTP-only, Secure, SameSite=Strict** cookie containing a signed session token.
- The session token is a random opaque string (e.g., 32-byte hex via `crypto.randomBytes`). It maps to a server-side session record that stores the username and expiration.
- Session records are stored in the same SQLite database as users (`<data>/users.db`, `sessions` table). This avoids introducing a second persistence mechanism — SQLite already handles atomic writes and concurrent access for the user store, so sessions belong there too.
- Every Fastify request validates the cookie by looking up the token in the `sessions` table. If missing, invalid, or expired, API routes return `401` and the frontend redirects to Login.
- Expired sessions are pruned periodically (e.g., on each login or via a scheduled cleanup query).
- Logout deletes the session row and clears the cookie.

### Password Storage

The backend **never** stores plaintext passwords. The chosen scheme is **bcrypt** (via the `bcryptjs` npm package, which is a pure-JS implementation with no native addon compilation):

| Aspect         | Detail                                                                   |
| -------------- | ------------------------------------------------------------------------ |
| Algorithm      | bcrypt (`$2b$` prefix)                                                   |
| Cost factor    | 12 rounds (≈250ms per hash on modern hardware, balances security/UX)     |
| Salt           | Automatically generated per-hash by bcrypt (embedded in the hash string) |
| Storage format | The full bcrypt hash string, e.g. `$2b$12$...` (60 chars)                |
| Verification   | `bcrypt.compare(inputPassword, storedHash)` — constant-time comparison   |

### User Store

User records are stored in a **SQLite** database at `<data>/users.db`. SQLite is chosen over a JSON file because:

- Atomic reads/writes without file-locking concerns.
- Easy to query and index as the user count grows.
- The `better-sqlite3` npm package is widely used, synchronous (simpler code), and fast.

#### Schema

```sql
CREATE TABLE users (
  username     TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  password     TEXT NOT NULL,          -- bcrypt hash
  role         TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  created_at   TEXT NOT NULL,          -- ISO 8601
  updated_at   TEXT NOT NULL           -- ISO 8601
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,          -- 32-byte random hex
  username   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,             -- ISO 8601
  created_at TEXT NOT NULL              -- ISO 8601
);

CREATE INDEX idx_sessions_username ON sessions(username);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

#### Admin Account Creation

The admin account is **not** auto-seeded. On first launch, if `users.db` does not exist (or contains no admin), the system shows the onboarding page, which lets the administrator choose their own username, display name, and password. See [onboarding.md](./onboarding.md) for the full onboarding flow.

#### Roles

| Role    | Capabilities                                                                          |
| ------- | ------------------------------------------------------------------------------------- |
| `admin` | Create/delete users, reset passwords, access all admin settings, full desktop access. |
| `user`  | Standard desktop access. Can change own password and preferences.                     |

Only one admin account exists initially. The admin can promote other users to admin via the Preference MiniApp (or a future User Management MiniApp).

## Data Directory Redesign

### Design Principles

1. **User isolation** — Each user gets a private home directory. One user cannot access another's files.
2. **Shared system data** — MiniApp packages, global config, and the user database are system-wide, not per-user.
3. **Backward-compatible structure** — The existing `<config>`, `<data>`, `<logs>`, `<cache>` platform paths are still used, but the internal layout changes.

### New Directory Layout

Using `<data>` as the resolved platform data path (same as current spec):

```
<config>/
  config.toml                        # Global app configuration (unchanged)

<data>/
  users.db                           # SQLite database (users + sessions)

  home/                              # Per-user home directories
    admin/                           # Admin's home
      .data/
        file-explorer/               # MiniApp private data (ctx.paths.data)
        preview/
        preference/
        <third-party-id>/
      .storage/
        file-explorer.json           # MiniApp key-value stores (ctx.storage)
        preview.json
        preference.json
        <third-party-id>.json
      .cache/
        ...

    alice/                           # Normal user "alice"
      .data/
        file-explorer/
        preview/
        ...
      .storage/
        ...
      .cache/
        ...

  miniapps/                          # Installed third-party MiniApp packages (system-wide)
    <package-name>/
      ...

  ai-sessions/                       # AI session data (system-wide, or per-user — see note below)

<logs>/
  core.log
  admin/
    file-explorer.log
    preview.log
    ...
  alice/
    file-explorer.log
    ...

<cache>/
  ...                                # System-wide temporary/regenerable data
```

### Key Changes from Current Spec

| Aspect                   | Current (spec.md)           | Proposed                                     |
| ------------------------ | --------------------------- | -------------------------------------------- |
| MiniApp data             | `<data>/data/<miniapp-id>/` | `<data>/home/<username>/.data/<miniapp-id>/` |
| MiniApp storage          | `<data>/storage/<id>.json`  | `<data>/home/<username>/.storage/<id>.json`  |
| MiniApp logs             | `<logs>/<id>.log`           | `<logs>/<username>/<id>.log`                 |
| MiniApp cache            | `<cache>/<id>/`             | `<data>/home/<username>/.cache/<id>/`        |
| User database            | _(none)_                    | `<data>/users.db` (users + sessions tables)  |
| Third-party MiniApp pkgs | `<data>/miniapps/`          | `<data>/miniapps/` (unchanged — system-wide) |

### MiniAppPaths Update

The `MiniAppPaths` interface in the SDK remains the same — the core simply resolves paths differently based on the authenticated user:

```ts
// Before (single user)
ctx.paths.data = '<data>/data/file-explorer/';
ctx.paths.storage = '<data>/storage/file-explorer.json';

// After (multi-user, user "alice" using file-explorer MiniApp)
ctx.paths.data = '<data>/home/alice/.data/file-explorer/';
ctx.paths.storage = '<data>/home/alice/.storage/file-explorer.json';
```

MiniApps are completely unaware of other users — they still receive opaque absolute paths from the core. `ctx.fs` is rooted at `<data>/home/<username>/`, while `ctx.paths.data` continues to point at the MiniApp-private directory inside that home. This is a core-only change.

### AI Sessions

AI sessions can be either system-wide or per-user. Recommended: **per-user**, stored under `<data>/home/<username>/.ai-sessions/`. This keeps conversation history private and avoids context leakage between users.

## MiniApp Package Location

Third-party MiniApp packages remain **system-wide** at `<data>/miniapps/`. This is analogous to how VSCode extensions are installed globally, not per-workspace.

**Rationale:**

- MiniApps are code (npm packages), not user data. Installing per-user would waste disk and complicate updates.
- All users share the same set of available MiniApps. Admin controls which MiniApps are installed.
- User isolation is achieved at the data layer (home directories), not the code layer.
- Built-in MiniApps continue to ship bundled with `@desktalk/core` as dependencies.

### MiniApp-Specific Data Within the Home Directory

Each MiniApp gets its own subdirectory under the user's home:

```
<data>/home/<username>/
  .data/<miniapp-id>/       # MiniApp-private files (ctx.paths.data)
  .storage/<miniapp-id>.json  # Key-value store (ctx.storage)
  .cache/<miniapp-id>/      # Cache (if needed)
```

This is the same structure as before, just nested under the user's home with dot-prefixed directory names. The dot prefix hides these core-managed directories from the File Explorer MiniApp, keeping the user's home clean. The File Explorer MiniApp's `~` root resolves to `<data>/home/<username>/` (the home directory itself, not a MiniApp-specific subfolder), and all `ctx.fs` paths are resolved relative to that home root.

## Onboard Page

The onboarding flow is documented in [onboarding.md](./onboarding.md). In summary: it triggers on first launch when no admin account exists, collects the admin's username, display name, and password, and bootstraps the system. It is shown only once and only to the admin.

The onboard page is a simple multi-step wizard rendered by the core frontend — it is not a MiniApp.

## API Endpoints

New Fastify routes for authentication and user management:

### Public (no auth required)

| Method | Path                | Description                                                                                                                  |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`   | Authenticate and set session cookie. Body: `{ username, password }`.                                                         |
| GET    | `/api/setup/status` | Check if the system needs onboarding (no admin exists).                                                                      |
| POST   | `/api/setup`        | Create the admin account during onboarding. Body: `{ username, displayName, password }`. Only succeeds when no admin exists. |

### Authenticated

| Method | Path                    | Description                                                |
| ------ | ----------------------- | ---------------------------------------------------------- |
| POST   | `/api/auth/logout`      | Clear session cookie and delete session.                   |
| GET    | `/api/auth/me`          | Return current user info (username, role).                 |
| PUT    | `/api/auth/me/password` | Change own password. Body: `{ oldPassword, newPassword }`. |

### Admin only

| Method | Path                                  | Description                                              |
| ------ | ------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/admin/users`                    | List all users.                                          |
| POST   | `/api/admin/users`                    | Create a new user. Body: `{ username, password, role }`. |
| DELETE | `/api/admin/users/:username`          | Delete a user and their home directory.                  |
| PUT    | `/api/admin/users/:username/role`     | Change a user's role.                                    |
| PUT    | `/api/admin/users/:username/password` | Reset a user's password.                                 |

## Security Considerations

- **Session cookies** are HTTP-only, Secure, SameSite=Strict to prevent XSS and CSRF.
- **bcrypt** with cost factor 12 makes brute-force attacks impractical.
- **Rate limiting** on `/api/auth/login` (e.g., 5 attempts per minute per IP) to prevent brute-force.
- **Password requirements** — minimum 8 characters. Additional complexity rules are optional.
- **Home directory isolation** — the core enforces that authenticated requests can only access their own `<data>/home/<username>/` subtree. This is enforced at the path-resolution layer, not by convention.
- **Admin operations** — all `/api/admin/*` routes check `role === 'admin'` before processing.
- **No default credentials** — the admin sets their own password during onboarding. There is no hardcoded default password in the system.
- **Setup endpoint protection** — `POST /api/setup` only succeeds when no admin account exists, preventing abuse after initial setup.

## Dependencies

| Package          | Purpose                              |
| ---------------- | ------------------------------------ |
| `better-sqlite3` | SQLite database for user records.    |
| `bcryptjs`       | Pure-JS bcrypt for password hashing. |

Both are well-maintained, widely-used packages with no additional native compilation requirements beyond what `better-sqlite3` already provides (prebuild binaries are available for all major platforms).

## Migration Path

For existing single-user deployments:

1. On first launch after upgrade, the core detects that `<data>/users.db` does not exist.
2. It shows the onboarding page so the admin can create their account with a username and password of their choice.
3. On completion, it moves existing data from `<data>/data/` and `<data>/storage/` into `<data>/home/<admin-username>/.data/` and `<data>/home/<admin-username>/.storage/`, preserving all existing MiniApp data.

This is a one-time, non-destructive migration.
