/**
 * Hand-rolled YAML front matter parser and serializer.
 * Handles title, tags (inline [a,b] and block - item syntax), and created date.
 */

const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface FrontMatter {
  title: string;
  tags: string[];
  created: string | null;
  body: string;
}

export function parseFrontMatter(raw: string): FrontMatter {
  const match = raw.match(FM_REGEX);
  if (!match) {
    const heading = raw.match(/^#\s+(.+)$/m);
    return { title: heading ? heading[1].trim() : 'Untitled', tags: [], created: null, body: raw };
  }

  const yaml = match[1];
  const body = match[2];
  let title = 'Untitled';
  let tags: string[] = [];
  let created: string | null = null;
  let inTags = false;

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('title:')) {
      title = trimmed
        .slice(6)
        .trim()
        .replace(/^["']|["']$/g, '');
      inTags = false;
    } else if (trimmed.startsWith('created:')) {
      created = trimmed.slice(8).trim();
      inTags = false;
    } else if (trimmed.startsWith('tags:')) {
      inTags = true;
      const inline = trimmed.slice(5).trim();
      if (inline.startsWith('[') && inline.endsWith(']')) {
        tags = inline
          .slice(1, -1)
          .split(',')
          .map((t) => t.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        inTags = false;
      }
    } else if (inTags && trimmed.startsWith('- ')) {
      tags.push(
        trimmed
          .slice(2)
          .trim()
          .replace(/^["']|["']$/g, ''),
      );
    } else {
      inTags = false;
    }
  }

  return { title, tags, created, body };
}

export function serializeFrontMatter(
  title: string,
  tags: string[],
  created: string,
  body: string,
): string {
  const lines = ['---', `title: "${title.replace(/"/g, '\\"')}"`];
  if (tags.length > 0) {
    lines.push('tags:');
    for (const tag of tags) lines.push(`  - ${tag}`);
  }
  lines.push(`created: ${created}`, '---', '', body);
  return lines.join('\n');
}
