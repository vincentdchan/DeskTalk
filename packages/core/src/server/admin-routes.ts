/**
 * Fastify plugin that registers admin-only user management routes.
 *
 * All routes require an authenticated user with role === 'admin'.
 *
 *   GET    /api/admin/users
 *   POST   /api/admin/users
 *   DELETE /api/admin/users/:username
 *   PUT    /api/admin/users/:username/role
 *   PUT    /api/admin/users/:username/password
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  listUsers,
  findUser,
  createUser,
  deleteUser,
  updateUserRole,
  updateUserPassword,
  deleteUserSessions,
  type PublicUser,
  type UserRole,
} from '../services/user-db';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { getWorkspacePaths, ensureUserHome } from '../services/workspace';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Admin guard — applied to all routes in this plugin
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as FastifyRequest & { user?: PublicUser }).user;
    if (!user || user.role !== 'admin') {
      reply.code(403);
      reply.send({ error: 'Admin access required.' });
    }
  });

  // ─── GET /api/admin/users ───────────────────────────────────────────
  app.get('/api/admin/users', async () => {
    return listUsers();
  });

  // ─── POST /api/admin/users ──────────────────────────────────────────
  app.post<{
    Body: { username: string; password: string; role?: UserRole; displayName?: string };
  }>('/api/admin/users', async (req, reply) => {
    const { username, password, role, displayName } = req.body ?? {};

    if (!username || !password) {
      reply.code(400);
      return { error: 'Username and password are required.' };
    }

    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(username)) {
      reply.code(400);
      return { error: 'Username must be 1-32 alphanumeric characters, hyphens, or underscores.' };
    }

    if (password.length < 8) {
      reply.code(400);
      return { error: 'Password must be at least 8 characters.' };
    }

    if (role && role !== 'admin' && role !== 'user') {
      reply.code(400);
      return { error: 'Role must be "admin" or "user".' };
    }

    if (findUser(username)) {
      reply.code(409);
      return { error: `User "${username}" already exists.` };
    }

    const user = createUser(username, password, role ?? 'user', displayName);
    ensureUserHome(username);
    return user;
  });

  // ─── DELETE /api/admin/users/:username ──────────────────────────────
  app.delete<{
    Params: { username: string };
  }>('/api/admin/users/:username', async (req, reply) => {
    const { username } = req.params;
    const currentUser = (req as FastifyRequest & { user?: PublicUser }).user!;

    if (username === currentUser.username) {
      reply.code(400);
      return { error: 'Cannot delete your own account.' };
    }

    const target = findUser(username);
    if (!target) {
      reply.code(404);
      return { error: `User "${username}" not found.` };
    }

    // Delete sessions, then user, then home directory
    deleteUserSessions(username);
    deleteUser(username);

    // Remove the user's home directory
    const ws = getWorkspacePaths();
    const homeDir = join(ws.data, 'home', username);
    try {
      rmSync(homeDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }

    return { ok: true, deleted: username };
  });

  // ─── PUT /api/admin/users/:username/role ────────────────────────────
  app.put<{
    Params: { username: string };
    Body: { role: UserRole };
  }>('/api/admin/users/:username/role', async (req, reply) => {
    const { username } = req.params;
    const { role } = req.body ?? {};

    if (!role || (role !== 'admin' && role !== 'user')) {
      reply.code(400);
      return { error: 'Role must be "admin" or "user".' };
    }

    const target = findUser(username);
    if (!target) {
      reply.code(404);
      return { error: `User "${username}" not found.` };
    }

    updateUserRole(username, role);
    return { ok: true, username, role };
  });

  // ─── PUT /api/admin/users/:username/password ────────────────────────
  app.put<{
    Params: { username: string };
    Body: { newPassword: string };
  }>('/api/admin/users/:username/password', async (req, reply) => {
    const { username } = req.params;
    const { newPassword } = req.body ?? {};

    if (!newPassword || newPassword.length < 8) {
      reply.code(400);
      return { error: 'Password must be at least 8 characters.' };
    }

    const target = findUser(username);
    if (!target) {
      reply.code(404);
      return { error: `User "${username}" not found.` };
    }

    updateUserPassword(username, newPassword);
    // Invalidate all existing sessions for the target user
    deleteUserSessions(username);
    return { ok: true, username };
  });
}
