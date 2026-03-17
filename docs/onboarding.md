# Onboarding

## Overview

Onboarding is the initial setup flow that runs when the DeskTalk system is used for the first time. It creates the admin account and bootstraps the system for use. This flow is **not** shown to every user — it is exclusively for the first administrator.

## When Does Onboarding Trigger?

Onboarding is shown when **both** of the following conditions are true:

1. **No `users.db` exists** — the system has never been initialized.
2. **No admin account exists** — there is no user with the `admin` role in the database.

In other words, onboarding runs exactly once: the very first time someone opens DeskTalk after installation. Once the admin account is created, the onboarding flow is never shown again — not even for new users added later.

```
First launch
  │
  ├─ users.db missing? ─── YES ──► Show Onboarding
  │
  └─ users.db exists?
       │
       ├─ Admin account exists? ─── YES ──► Show Login page
       │
       └─ Admin account missing? ── YES ──► Show Onboarding
```

## Who Is It For?

Onboarding is **only for the admin user**. It is the mechanism by which the system's first administrator account is created.

Regular users are created later by the admin through user management. They log in with the credentials the admin provides and go directly to the Desktop — they never see the onboarding flow.

## What the Admin Fills In

The onboarding form collects three required fields to create the admin account:

| Field            | Description                               | Constraints              |
| ---------------- | ----------------------------------------- | ------------------------ |
| **Username**     | The admin's login identifier.             | Required, must be unique |
| **Display Name** | The name shown in the UI (e.g., taskbar). | Required                 |
| **Password**     | The admin's password.                     | Minimum 8 characters     |

### Onboarding Steps

1. **Welcome** — Brief introduction to DeskTalk.
2. **Create Admin Account** — The admin fills in username, display name, and password.
3. **Done** — The system creates `users.db`, inserts the admin record, starts a session, and redirects to the Desktop.

## What Happens on Completion

When the admin submits the onboarding form, the backend:

1. Creates the `users.db` SQLite database (with `users` and `sessions` tables).
2. Inserts the admin user record with:
   - The chosen username, display name, and bcrypt-hashed password.
   - `role = 'admin'`
   - `onboarded = 1`
3. Creates a session and sets the session cookie.
4. Redirects to the Desktop.

From this point forward, the system is fully initialized. The login page is shown on all subsequent visits.

## Comparison with the Previous Approach

The original design in [user-management.md](./user-management.md) seeded a default admin account (`admin` / `desktalk`) on first launch and used a per-user `onboarded` flag to show a setup wizard on first login. The revised approach here is simpler and more secure:

| Aspect               | Previous design                                | Current design                           |
| -------------------- | ---------------------------------------------- | ---------------------------------------- |
| Admin creation       | Auto-seeded with default credentials           | Admin chooses credentials during onboard |
| Default password     | `desktalk` (must be changed on first login)    | None — admin sets password immediately   |
| Onboard trigger      | Per-user `onboarded` flag on every first login | System-level: no `users.db` / no admin   |
| Onboard audience     | Every new user on first login                  | Admin only, once                         |
| Per-user preferences | Collected during onboard wizard                | Managed later via Preference MiniApp     |

## Implementation Notes

- The onboarding page is rendered by the core frontend — it is **not** a MiniApp.
- The backend exposes a dedicated endpoint (e.g., `POST /api/setup`) that only succeeds when the system has no existing admin. This prevents the endpoint from being abused after initial setup.
- No default credentials are ever stored in the database. The admin account only exists after the human completes onboarding.
