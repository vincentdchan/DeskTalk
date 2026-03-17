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

Onboarding flow:
  Welcome ──► Create Admin ──► AI Config ──► Voice Config ──► Done
                                (skip?)        (skip?)
```

## Who Is It For?

Onboarding is **only for the admin user**. It is the mechanism by which the system's first administrator account is created.

Regular users are created later by the admin through user management. They log in with the credentials the admin provides and go directly to the Desktop — they never see the onboarding flow.

## What the Admin Fills In

The onboarding form collects three required fields to create the admin account, plus two optional configuration steps:

### Required — Admin Account

| Field            | Description                               | Constraints              |
| ---------------- | ----------------------------------------- | ------------------------ |
| **Username**     | The admin's login identifier.             | Required, must be unique |
| **Display Name** | The name shown in the UI (e.g., taskbar). | Required                 |
| **Password**     | The admin's password.                     | Minimum 8 characters     |

### Optional — AI Configuration (skippable)

| Field        | Description                           | Constraints                |
| ------------ | ------------------------------------- | -------------------------- |
| **Provider** | AI provider to use (e.g., OpenAI).    | Dropdown selection         |
| **API Key**  | API key for the selected provider.    | Required if not skipping   |
| **Model**    | Model identifier (e.g., `gpt-4o`).    | Optional, provider default |
| **Base URL** | Custom endpoint URL for the provider. | Optional                   |

### Optional — Voice / STT Configuration (skippable)

| Field            | Description                                       | Constraints              |
| ---------------- | ------------------------------------------------- | ------------------------ |
| **STT Provider** | Speech-to-text provider (e.g., Deepgram, OpenAI). | Dropdown selection       |
| **API Key**      | API key for the selected STT provider.            | Required if not skipping |

### Onboarding Steps

1. **Welcome** — Brief introduction to DeskTalk.
2. **Create Admin Account** — The admin fills in username, display name, and password.
3. **AI Configuration** _(skippable)_ — Configure a default AI provider. The admin can select a provider (e.g., OpenAI), enter an API key, optionally set a base URL, and choose a model. This is equivalent to the AI category in the [Preference MiniApp](./miniapps/preference.md#configurable-settings) (`ai.providers.*` and `ai.defaultProvider` settings) but is surfaced here so the system is ready to use immediately.
4. **Voice Configuration** _(skippable)_ — Configure an STT (speech-to-text) provider for voice input. The admin can select a provider (e.g., Deepgram, OpenAI) and enter the required API key. This is equivalent to configuring STT provider settings via the [Preference MiniApp](./miniapps/preference.md) but is presented during onboarding for convenience.
5. **Done** — The system creates `users.db`, inserts the admin record, persists any provider configuration to `config.toml`, starts a session, and redirects to the Desktop.

> **Skippable steps.** Steps 3 and 4 can be skipped without providing any input. If skipped, the corresponding settings remain at their defaults (unconfigured). The admin can configure them later at any time through the Preference MiniApp.

## What Happens on Completion

When the admin completes (or skips through) the onboarding flow, the backend:

1. Creates the `users.db` SQLite database (with `users` and `sessions` tables).
2. Inserts the admin user record with:
   - The chosen username, display name, and bcrypt-hashed password.
   - `role = 'admin'`
   - `onboarded = 1`
3. If the admin configured an AI provider (step 3), writes the provider settings to `config.toml` (e.g., `ai.defaultProvider`, `ai.providers.<name>.apiKey`, `ai.providers.<name>.model`, `ai.providers.<name>.baseUrl`).
4. If the admin configured an STT provider (step 4), writes the STT provider settings to `config.toml`.
5. Creates a session and sets the session cookie.
6. Redirects to the Desktop.

From this point forward, the system is fully initialized. The login page is shown on all subsequent visits.

## Comparison with the Previous Approach

The original design in [user-management.md](./user-management.md) seeded a default admin account (`admin` / `desktalk`) on first launch and used a per-user `onboarded` flag to show a setup wizard on first login. The revised approach here is simpler and more secure:

| Aspect               | Previous design                                | Current design                                     |
| -------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Admin creation       | Auto-seeded with default credentials           | Admin chooses credentials during onboard           |
| Default password     | `desktalk` (must be changed on first login)    | None — admin sets password immediately             |
| Onboard trigger      | Per-user `onboarded` flag on every first login | System-level: no `users.db` / no admin             |
| Onboard audience     | Every new user on first login                  | Admin only, once                                   |
| Per-user preferences | Collected during onboard wizard                | Managed later via Preference MiniApp               |
| Provider setup       | Not included                                   | AI & STT config offered during onboard (skippable) |

## Implementation Notes

- The onboarding page is rendered by the core frontend — it is **not** a MiniApp.
- The backend exposes a dedicated endpoint (e.g., `POST /api/setup`) that only succeeds when the system has no existing admin. This prevents the endpoint from being abused after initial setup.
- No default credentials are ever stored in the database. The admin account only exists after the human completes onboarding.
