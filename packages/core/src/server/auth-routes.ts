/**
 * Fastify plugin that registers authentication and setup routes.
 *
 * Public routes (no session required):
 *   POST /api/auth/login
 *   GET  /api/auth/me
 *   GET  /api/setup/status
 *   POST /api/setup
 *
 * Authenticated routes:
 *   POST /api/auth/logout
 *   PUT  /api/auth/me/password
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import '@fastify/cookie';
import {
  verifyPassword,
  createUser,
  createSession,
  deleteSession,
  updateUserPassword,
  hasAdmin,
  findUser,
  validateSession,
  type PublicUser,
} from '../services/user-db';
import { ensureUserHome } from '../services/workspace';

const COOKIE_NAME = 'desktalk_session';

/** Cookie options shared across set/clear. */
function cookieOptions(secure: boolean) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const isSecure = false; // TODO: derive from app config once HTTPS is supported

  // ─── POST /api/auth/login (public) ──────────────────────────────────
  app.post<{
    Body: { username: string; password: string };
  }>('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      reply.code(400);
      return { error: 'Username and password are required.' };
    }

    const user = verifyPassword(username, password);
    if (!user) {
      reply.code(401);
      return { error: 'Invalid username or password.' };
    }

    ensureUserHome(user.username);

    const token = createSession(username);
    reply.setCookie(COOKIE_NAME, token, cookieOptions(isSecure));
    return {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  });

  // ─── POST /api/auth/logout ──────────────────────────────────────────
  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE_NAME];
    if (token) {
      deleteSession(token);
    }
    reply.clearCookie(COOKIE_NAME, cookieOptions(isSecure));
    return { ok: true };
  });

  // ─── GET /api/auth/me (public) ───────────────────────────────────────
  // When authenticated: returns the current user info.
  // When unauthenticated: returns { authenticated: false, needsSetup }
  // so the frontend can decide between login vs onboard page.
  app.get('/api/auth/me', async (req) => {
    const requestUser = (req as FastifyRequest & { user?: PublicUser }).user;
    const token = req.cookies[COOKIE_NAME];
    const user = requestUser ?? (token ? validateSession(token) : undefined);

    if (!user) {
      return {
        authenticated: false,
        needsSetup: !hasAdmin(),
      };
    }

    ensureUserHome(user.username);

    return {
      authenticated: true,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  });

  // ─── PUT /api/auth/me/password ──────────────────────────────────────
  app.put<{
    Body: { oldPassword: string; newPassword: string };
  }>('/api/auth/me/password', async (req, reply) => {
    const user = (req as FastifyRequest & { user?: PublicUser }).user;
    if (!user) {
      reply.code(401);
      return { error: 'Not authenticated.' };
    }

    const { oldPassword, newPassword } = req.body ?? {};
    if (!oldPassword || !newPassword) {
      reply.code(400);
      return { error: 'Both oldPassword and newPassword are required.' };
    }

    if (newPassword.length < 8) {
      reply.code(400);
      return { error: 'Password must be at least 8 characters.' };
    }

    // Verify old password
    const verified = verifyPassword(user.username, oldPassword);
    if (!verified) {
      reply.code(403);
      return { error: 'Current password is incorrect.' };
    }

    updateUserPassword(user.username, newPassword);
    return { ok: true };
  });

  // ─── GET /api/setup/status (public) ─────────────────────────────────
  // Returns whether the system needs initial setup (no admin account).
  app.get('/api/setup/status', async () => {
    return { needsSetup: !hasAdmin() };
  });

  // ─── POST /api/setup (public) ───────────────────────────────────────
  // Creates the initial admin account during onboarding.
  // Only succeeds when no admin account exists yet.
  app.post<{
    Body: { username: string; displayName: string; password: string };
  }>('/api/setup', async (req, reply) => {
    // Guard: only allow setup when no admin exists
    if (hasAdmin()) {
      reply.code(403);
      return { error: 'System is already set up. An admin account exists.' };
    }

    const { username, displayName, password } = req.body ?? {};

    if (!username || !displayName || !password) {
      reply.code(400);
      return { error: 'Username, displayName, and password are required.' };
    }

    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(username)) {
      reply.code(400);
      return { error: 'Username must be 1-32 alphanumeric characters, hyphens, or underscores.' };
    }

    if (password.length < 8) {
      reply.code(400);
      return { error: 'Password must be at least 8 characters.' };
    }

    if (findUser(username)) {
      reply.code(409);
      return { error: `User "${username}" already exists.` };
    }

    // Create the admin account and their home directory
    const user = createUser(username, password, 'admin', displayName);
    ensureUserHome(username);

    // Automatically log the admin in
    const token = createSession(username);
    reply.setCookie(COOKIE_NAME, token, cookieOptions(isSecure));

    return {
      ok: true,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  });
}

export { COOKIE_NAME };
