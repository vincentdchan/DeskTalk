import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';
import type { Note, NoteMeta, TagCount } from './types';
import { parseFrontMatter, serializeFrontMatter } from './lib/frontmatter';
import { slugify, preview } from './lib/helpers';

// ─── Manifest ────────────────────────────────────────────────────────────────

export const manifest: MiniAppManifest = {
  id: 'note',
  name: 'Note',
  icon: '\uD83D\uDDD2\uFE0F',
  version: '0.1.0',
  description: 'Markdown note-taking with tags and YAML front matter',
};

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Note MiniApp activated');

  /**
   * Recursively collect all .md files under the given directory.
   * Returns relative paths (e.g. "work/meeting.md", "readme.md").
   */
  async function walkMarkdown(dir: string): Promise<string[]> {
    const exists = await ctx.fs.exists(dir);
    if (!exists) return [];

    const entries = await ctx.fs.readDir(dir);
    const paths: string[] = [];
    for (const entry of entries) {
      if (entry.type === 'directory') {
        paths.push(...(await walkMarkdown(entry.path)));
      } else if (entry.type === 'file' && entry.name.endsWith('.md')) {
        paths.push(entry.path);
      }
    }
    return paths;
  }

  /**
   * Derive a note ID from a relative .md path.
   * The ID is the path with the .md extension stripped.
   * Example: "work/meeting.md" → "work/meeting"
   */
  function pathToId(relPath: string): string {
    return relPath.replace(/\.md$/, '');
  }

  /**
   * Read all .md files recursively and build metadata from front matter + stat.
   * The filesystem is the single source of truth — no separate index.
   * Note IDs are relative paths without the .md extension (e.g. "work/meeting").
   */
  async function scanNotes(tagFilter?: string): Promise<NoteMeta[]> {
    const dirExists = await ctx.fs.exists('.');
    if (!dirExists) {
      await ctx.fs.mkdir('.');
      return [];
    }

    const mdPaths = await walkMarkdown('.');
    const metas: NoteMeta[] = [];

    for (const relPath of mdPaths) {
      try {
        const raw = await ctx.fs.readFile(relPath);
        const stat = await ctx.fs.stat(relPath);
        const fm = parseFrontMatter(raw);

        if (tagFilter && !fm.tags.includes(tagFilter)) continue;

        metas.push({
          id: pathToId(relPath),
          title: fm.title,
          tags: fm.tags,
          createdAt: fm.created ?? stat.createdAt,
          updatedAt: stat.modifiedAt,
          preview: preview(fm.body),
        });
      } catch {
        // Corrupted file — skip
      }
    }

    metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return metas;
  }

  // ─── notes.list ──────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ tag?: string }, NoteMeta[]>('notes.list', async (req) =>
    scanNotes(req?.tag),
  );

  // ─── notes.get ───────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ id: string }, Note>('notes.get', async (req) => {
    const filename = `${req.id}.md`;
    const raw = await ctx.fs.readFile(filename);
    const stat = await ctx.fs.stat(filename);
    const fm = parseFrontMatter(raw);
    return {
      id: req.id,
      title: fm.title,
      tags: fm.tags,
      content: raw,
      createdAt: fm.created ?? stat.createdAt,
      updatedAt: stat.modifiedAt,
    };
  });

  // ─── notes.create ────────────────────────────────────────────────────────

  ctx.messaging.onCommand<
    { title?: string; content?: string; tags?: string[]; path?: string },
    Note
  >('notes.create', async (req) => {
    const title = req?.title || 'Untitled';
    const tags = req?.tags || [];
    const body = req?.content || '';
    const now = new Date().toISOString();

    // Use explicit path if provided, otherwise fall back to slug + timestamp.
    const id = req?.path || slugify(title) + '-' + Date.now().toString(36);
    const filename = `${id}.md`;

    const content = serializeFrontMatter(title, tags, now, body);
    await ctx.fs.writeFile(filename, content);

    const stat = await ctx.fs.stat(filename);
    ctx.logger.info(`Created note: ${id}`);
    return { id, title, tags, content, createdAt: now, updatedAt: stat.modifiedAt };
  });

  // ─── notes.update ────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ id: string; content?: string; tags?: string[] }, Note>(
    'notes.update',
    async (req) => {
      const filename = `${req.id}.md`;
      const existing = await ctx.fs.readFile(filename);
      const oldFm = parseFrontMatter(existing);
      const stat = await ctx.fs.stat(filename);

      let title: string;
      let tags: string[];
      let body: string;

      if (req.content !== undefined) {
        // Full content provided — parse its front matter
        const newFm = parseFrontMatter(req.content);
        title = newFm.title;
        tags = req.tags ?? newFm.tags;
        body = newFm.body;
      } else {
        // Only tags changed
        title = oldFm.title;
        tags = req.tags ?? oldFm.tags;
        body = oldFm.body;
      }

      const created = oldFm.created ?? stat.createdAt;
      const content = serializeFrontMatter(title, tags, created, body);
      await ctx.fs.writeFile(filename, content);

      const newStat = await ctx.fs.stat(filename);
      ctx.logger.info(`Updated note: ${req.id}`);
      return {
        id: req.id,
        title,
        tags,
        content,
        createdAt: created,
        updatedAt: newStat.modifiedAt,
      };
    },
  );

  // ─── notes.delete ────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ id: string }, void>('notes.delete', async (req) => {
    await ctx.fs.deleteFile(`${req.id}.md`);
    ctx.logger.info(`Deleted note: ${req.id}`);
  });

  // ─── notes.search ────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ query: string }, NoteMeta[]>('notes.search', async (req) => {
    const q = (req.query || '').toLowerCase();
    if (!q) return scanNotes();

    const mdPaths = await walkMarkdown('.');
    const results: NoteMeta[] = [];

    for (const relPath of mdPaths) {
      try {
        const raw = await ctx.fs.readFile(relPath);
        if (!raw.toLowerCase().includes(q)) continue;

        const stat = await ctx.fs.stat(relPath);
        const fm = parseFrontMatter(raw);
        results.push({
          id: pathToId(relPath),
          title: fm.title,
          tags: fm.tags,
          createdAt: fm.created ?? stat.createdAt,
          updatedAt: stat.modifiedAt,
          preview: preview(fm.body),
        });
      } catch {
        // skip unreadable files
      }
    }

    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return results;
  });

  // ─── notes.tags ──────────────────────────────────────────────────────────

  ctx.messaging.onCommand<void, TagCount[]>('notes.tags', async () => {
    const all = await scanNotes();
    const counts = new Map<string, number>();
    for (const m of all) {
      for (const tag of m.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  });

  return {};
}

export function deactivate(): void {
  // cleanup
}
