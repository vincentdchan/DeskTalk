/**
 * Fastify plugin that registers all authentication-related routes.
 *
 * Public routes (no session required):
 *   POST /api/auth/login
 *
 * Authenticated routes:
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *   PUT  /api/auth/me/password
 *   PUT  /api/auth/me/onboard
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import '@fastify/cookie';
import {
  verifyPassword,
  createSession,
  deleteSession,
  updateUserPassword,
  completeOnboarding,
  type PublicUser,
} from '../services/user-db';

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

    const token = createSession(username);
    reply.setCookie(COOKIE_NAME, token, cookieOptions(isSecure));
    return {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      onboarded: user.onboarded,
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

  // ─── GET /api/auth/me ───────────────────────────────────────────────
  app.get('/api/auth/me', async (req, reply) => {
    const user = (req as FastifyRequest & { user?: PublicUser }).user;
    if (!user) {
      reply.code(401);
      return { error: 'Not authenticated.' };
    }
    return {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      onboarded: user.onboarded,
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

  // ─── PUT /api/auth/me/onboard ──────────────────────────────────────
  app.put<{
    Body: {
      displayName?: string;
      newPassword?: string;
    };
  }>('/api/auth/me/onboard', async (req, reply) => {
    const user = (req as FastifyRequest & { user?: PublicUser }).user;
    if (!user) {
      reply.code(401);
      return { error: 'Not authenticated.' };
    }

    if (user.onboarded) {
      reply.code(409);
      return { error: 'User has already completed onboarding.' };
    }

    const { displayName, newPassword } = req.body ?? {};

    // If a new password is provided, update it
    if (newPassword) {
      if (newPassword.length < 8) {
        reply.code(400);
        return { error: 'Password must be at least 8 characters.' };
      }
      updateUserPassword(user.username, newPassword);
    }

    completeOnboarding(user.username, displayName);
    return { ok: true };
  });
}

export { COOKIE_NAME };
