# DeskTalk User Management Proposal

## Goal

DeskTalk currently runs as a single-user local application with no authentication. This proposal introduces a multi-user management system with **admin** and **normal** account roles, cookie-based session authentication, and a secure password storage scheme. It also adds two new pages—**Login** and **Onboard**—to the existing desktop shell, creating three distinct application states:

1. **Login** — shown when no valid session cookie exists.
2. **Onboard** — shown on the user's first login (first-time setup).
3. **Desktop** — the existing shell, shown after authentication and onboarding.

## Design Principles

1. **Secure by default**: passwords are never stored in plain text; use bcrypt hashing with per-user salts.
2. **Cookie-based sessions**: authentication state is tracked with secure, HTTP-only cookies—no bearer tokens in JavaScript.
3. **Minimal footprint**: user data is stored in a single SQLite database file alongside existing JSON storage.
4. **Admin bootstrapping**: the first user created is always the admin; subsequent users are normal accounts.
5. **Backward compatible**: existing MiniApp APIs and WebSocket connections are unchanged; auth is enforced at the server layer.

## Terminology

| Term | Meaning |
| --- | --- |
| **Admin** | The first registered user. Can create, delete, and manage other accounts. |
| **Normal user** | A standard account created by the admin. Has access to the desktop and MiniApps. |
| **Session** | A server-side record linking a random session token (stored in a cookie) to a user. |
| **Onboarding** | A one-time setup flow shown on a user's first login (e.g., choose theme, set display name). |

## Page Flow

```
┌─────────────┐     cookie missing      ┌─────────────┐
│             │  ──────────────────────► │             │
│   Desktop   │                          │    Login    │
│             │  ◄────────────────────── │             │
└─────────────┘     login success        └─────────────┘
       │                                        │
       │  first login                           │
       ▼                                        │
┌─────────────┐                                 │
│             │  ◄──────────────────────────────┘
│   Onboard   │     first login redirect
│             │
└─────────────┘
       │
       │  onboard complete
       ▼
┌─────────────┐
│   Desktop   │
└─────────────┘
```

### Route Definitions

| Route | Component | When Shown |
| --- | --- | --- |
| `/login` | `<LoginPage />` | No valid session cookie present |
| `/onboard` | `<OnboardPage />` | Authenticated user whose `onboarded` flag is `false` |
| `/` | `<Shell />` | Authenticated + onboarded user |

The frontend checks an `/api/auth/me` endpoint on load. Based on the response, it renders the appropriate page.

## Password Security

### Why bcrypt

- **Adaptive cost factor**: bcrypt includes a configurable work factor (cost) that increases hashing time, making brute-force attacks more expensive as hardware improves.
- **Built-in salt**: each hash contains its own random salt, so identical passwords produce different hashes.
- **Battle-tested**: bcrypt is the industry standard recommendation for password hashing in Node.js applications.

### Hashing Flow

```
Registration / Password Change
───────────────────────────────
plain_password
  │
  ▼
bcrypt.hash(plain_password, costFactor=12)
  │
  ▼
hashed_password  ──►  stored in users table
```

```
Login Verification
──────────────────
plain_password + stored hashed_password
  │
  ▼
bcrypt.compare(plain_password, hashed_password)
  │
  ▼
true / false
```

### Library

Use the [`bcryptjs`](https://www.npmjs.com/package/bcryptjs) npm package (pure JavaScript implementation, portable with no native compilation required). The cost factor of **12** provides a good balance between security and performance (~250 ms per hash on modern hardware).

## Storage

### Why JSON File Storage

- A single `users.json` file stored alongside existing JSON data at `<data>/storage/users.json`.
- Consistent with the existing storage approach used throughout DeskTalk (preferences, window state, MiniApp storage all use JSON files).
- Zero-configuration: no external database server or native compilation required.
- Sufficient for a local desktop app with a small number of users.

### Schema

The JSON file stores users and sessions in a single structure:

```json
{
  "users": [
    {
      "id": 1,
      "username": "admin",
      "password": "$2a$12$...",
      "role": "admin",
      "onboarded": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "sessions": [
    {
      "id": "uuid-v4",
      "userId": 1,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2024-01-08T00:00:00.000Z"
    }
  ],
  "nextId": 2
}
```

### Data Location

```
<data>/storage/
  users.json            # User and session data (new)
  preference.json       # existing
  window-state.json     # existing
  ...
```

### Admin Bootstrap

On first startup, if the `users` table is empty, the server enters **setup mode**. The `/login` page shows a "Create Admin Account" form instead of a normal login form. The first account created is automatically assigned the `admin` role.

## Session & Cookie Design

### Session Lifecycle

1. **Login**: user submits username + password → server verifies with bcrypt → creates a session row → sets a cookie.
2. **Request**: every HTTP and WebSocket request includes the cookie → server validates the session → proceeds or rejects with 401.
3. **Logout**: server deletes the session row → clears the cookie.
4. **Expiry**: sessions have a configurable TTL (default: 7 days). Expired sessions are rejected and cleaned up periodically.

### Cookie Properties

```
Set-Cookie: desktalk_session=<session-id>;
            Path=/;
            HttpOnly;
            SameSite=Strict;
            Max-Age=604800
```

| Property | Value | Reason |
| --- | --- | --- |
| `HttpOnly` | `true` | Prevents JavaScript access (XSS mitigation) |
| `SameSite` | `Strict` | Prevents CSRF by blocking cross-origin requests |
| `Path` | `/` | Cookie sent for all routes |
| `Max-Age` | `604800` | 7 days in seconds |

> **Note**: `Secure` flag is omitted because DeskTalk typically runs over `http://localhost`. If deployed behind HTTPS, the flag should be added.

## API Design

### Auth Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | No | Authenticate with username + password |
| `POST` | `/api/auth/logout` | Yes | Destroy the current session |
| `GET` | `/api/auth/me` | Yes | Return current user info (id, username, role, onboarded) |
| `POST` | `/api/auth/onboard` | Yes | Mark the current user as onboarded |

### User Management Endpoints (Admin Only)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/users` | Admin | List all users |
| `POST` | `/api/users` | Admin | Create a new user |
| `DELETE` | `/api/users/:id` | Admin | Delete a user |
| `PATCH` | `/api/users/:id` | Admin | Update user (e.g., reset password) |

### Request / Response Examples

**POST /api/auth/login**

```json
// Request
{ "username": "alice", "password": "s3cret" }

// Response 200
{ "id": 1, "username": "alice", "role": "admin", "onboarded": true }

// Response 401
{ "error": "Invalid username or password" }
```

**GET /api/auth/me**

```json
// Response 200
{ "id": 1, "username": "alice", "role": "admin", "onboarded": false }

// Response 401  (no cookie or expired session)
{ "error": "Unauthorized" }
```

**POST /api/users** (Admin)

```json
// Request
{ "username": "bob", "password": "b0bpass" }

// Response 201
{ "id": 2, "username": "bob", "role": "normal", "onboarded": false }
```

### WebSocket Authentication

The existing `/ws` and `/ws/voice` endpoints must verify the session cookie during the WebSocket upgrade handshake. If the cookie is missing or the session is invalid, the server rejects the upgrade with a 401 status.

```typescript
// Fastify WebSocket hook
fastify.addHook('preValidation', async (request, reply) => {
  const session = await validateSessionCookie(request);
  if (!session) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
  request.user = session.user;
});
```

## Backend Changes

### New Service: `user-service.ts`

Located at `packages/core/src/services/user-service.ts`.

Responsibilities:
- Initialize SQLite database and create tables on first run.
- CRUD operations for users (create, list, delete, update).
- Password hashing and verification via bcrypt.
- Session creation, validation, and cleanup.
- Admin bootstrap detection (is the users table empty?).

```typescript
export class UserService {
  constructor(dbPath: string);

  // Auth
  login(username: string, password: string): Promise<Session>;
  logout(sessionId: string): Promise<void>;
  validateSession(sessionId: string): Promise<User | null>;

  // User CRUD (admin only)
  createUser(username: string, password: string, role?: Role): Promise<User>;
  listUsers(): Promise<User[]>;
  deleteUser(id: number): Promise<void>;
  updateUser(id: number, updates: Partial<UserUpdate>): Promise<User>;

  // Onboard
  markOnboarded(userId: number): Promise<void>;

  // Bootstrap
  isSetupMode(): boolean; // true if no users exist
}
```

### Server Middleware

A Fastify `preHandler` hook is added to all routes except `/api/auth/login` and static assets. The hook:

1. Reads the `desktalk_session` cookie from the request.
2. Calls `userService.validateSession(sessionId)`.
3. If valid, attaches `request.user` and continues.
4. If invalid, returns `401 Unauthorized`.

### Startup Sequence Update

```
1. Parse CLI arguments
2. initWorkspace()
3. Create root logger
4. Initialize UserService (open/create SQLite DB)   ← NEW
5. Initialize process manager
6. Register built-in MiniApps
7. Create Fastify server with auth middleware         ← UPDATED
8. Register auth + user API routes                    ← NEW
9. Listen on host:port
```

## Frontend Changes

### New Components

| Component | File | Description |
| --- | --- | --- |
| `<LoginPage />` | `packages/core/src/frontend/LoginPage.tsx` | Username/password form; shows "Create Admin" variant in setup mode |
| `<OnboardPage />` | `packages/core/src/frontend/OnboardPage.tsx` | Welcome screen with theme picker, display name, etc. |
| `<AuthGate />` | `packages/core/src/frontend/AuthGate.tsx` | Top-level component that checks `/api/auth/me` and renders the correct page |

### Auth Store (Zustand)

```typescript
// packages/core/src/frontend/stores/auth.ts
interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboard: () => Promise<void>;
}
```

### Routing Logic

The `<AuthGate />` component replaces the current top-level render:

```tsx
function AuthGate() {
  const { user, loading } = useAuthStore();

  if (loading) return <SplashScreen />;
  if (!user) return <LoginPage />;
  if (!user.onboarded) return <OnboardPage />;
  return <Shell />;
}
```

No external router library is needed—the three states are mutually exclusive and determined by the auth store.

## Dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `bcryptjs` | ^3.0.0 | Password hashing (pure JS, no native compilation) |
| `@fastify/cookie` | ^11.0.0 | Cookie parsing for Fastify |

These are added to `packages/core/package.json` as runtime dependencies. Session IDs are generated using Node.js built-in `crypto.randomUUID()` (available since Node.js 19; the project requires ≥ 20).

## Security Considerations

1. **Password hashing**: bcrypt with cost factor 12. Passwords are never logged, stored in plain text, or transmitted in responses.
2. **Session tokens**: cryptographically random UUIDs (128 bits of entropy via `crypto.randomUUID()`—built into Node.js ≥ 19, no external package needed).
3. **Cookie security**: `HttpOnly` prevents XSS token theft; `SameSite=Strict` prevents CSRF.
4. **Rate limiting**: login endpoint should enforce rate limiting (e.g., 5 attempts per minute per IP) to slow brute-force attacks. Can use `@fastify/rate-limit`.
5. **Session expiry**: sessions expire after 7 days. A background task cleans up expired rows periodically.
6. **Admin isolation**: only admin accounts can manage users. Role checks are enforced server-side, not just in the UI.
7. **Input validation**: usernames are validated (alphanumeric, 3–32 characters); passwords require a minimum length of 8 characters.

## Migration Path

Since DeskTalk has no existing user data, no migration is needed. On first startup after this feature lands:

1. The `UserService` creates `users.db` with the schema above.
2. The server enters **setup mode** (no users exist).
3. The frontend shows the "Create Admin Account" form.
4. After the admin account is created, the admin can create normal user accounts.
5. All subsequent requests require authentication.

## Dev Mode Auto-Login

When the server starts with the `--dev` flag (via `pnpm dev` or `desktalk start --dev`), the following happens automatically:

1. A default **admin** user is injected (username: `admin`, password: `admin`).
2. The admin user is marked as **onboarded** (skips the onboard page).
3. A valid session is created and its ID is exposed via `GET /api/auth/status`.
4. The frontend reads the session ID from the status endpoint and sets it as a cookie.
5. The developer lands directly on the **Desktop** without manual login.

This enables fast iteration during development while keeping the full auth system active for testing.

```
GET /api/auth/status → { setupMode: false, devMode: true, devSessionId: "<uuid>" }
```

## Open Questions

1. **Should the admin be able to change their own role?** Recommendation: no, to prevent accidental de-escalation.
2. **Should users be able to change their own passwords?** Recommendation: yes, via a profile page or the Preference MiniApp.
3. **Should sessions persist across server restarts?** Recommendation: yes, since they are stored in a JSON file they survive restarts automatically.
4. **Multi-admin support?** Recommendation: defer to a future proposal. For now, only the first user is admin.
