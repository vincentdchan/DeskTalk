import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

interface VersionEntry {
  v: number;
  ts: number;
  content: string;
}

interface ParsedHistory {
  versions: VersionEntry[];
  pointer: number;
}

export type ManagedPathResolver = (inputPath: string) => string;

export function isPathWithinRoot(rootDir: string, candidatePath: string): boolean {
  const normalizedRoot = resolve(rootDir);
  const normalizedCandidate = resolve(candidatePath);
  const rel = relative(normalizedRoot, normalizedCandidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function createManagedPathResolver(allowedRoots: string[]): ManagedPathResolver {
  const roots = allowedRoots.map((root) => resolve(root));

  if (roots.length === 0) {
    throw new Error('At least one allowed root is required.');
  }

  return (inputPath: string): string => {
    const trimmedPath = inputPath.trim();
    if (!trimmedPath) {
      throw new Error('Path is required.');
    }

    if (isAbsolute(trimmedPath)) {
      const absolutePath = resolve(trimmedPath);
      if (!roots.some((root) => isPathWithinRoot(root, absolutePath))) {
        throw new Error(`Path is outside managed directories: ${inputPath}`);
      }
      return absolutePath;
    }

    const absolutePath = resolve(roots[0], trimmedPath);
    if (!isPathWithinRoot(roots[0], absolutePath)) {
      throw new Error(`Path is outside managed directories: ${inputPath}`);
    }
    return absolutePath;
  };
}

export function getHistoryFilePath(filePath: string): string {
  return join(dirname(filePath), `.${basename(filePath)}.history.jsonl`);
}

function parseHistory(raw: string, historyPath: string): ParsedHistory {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const versions: VersionEntry[] = [];
  let pointer: number | null = null;

  for (const line of lines) {
    const parsed = JSON.parse(line) as {
      v?: number;
      ts?: number;
      content?: string;
      pointer?: number;
    };
    if (typeof parsed.pointer === 'number') {
      pointer = parsed.pointer;
      continue;
    }

    if (
      typeof parsed.v !== 'number' ||
      typeof parsed.ts !== 'number' ||
      typeof parsed.content !== 'string'
    ) {
      throw new Error(`Malformed edit history entry in ${historyPath}`);
    }

    versions.push({ v: parsed.v, ts: parsed.ts, content: parsed.content });
  }

  if (versions.length === 0) {
    throw new Error(`Edit history is empty: ${historyPath}`);
  }

  const resolvedPointer = pointer ?? versions[versions.length - 1].v;
  if (resolvedPointer < 1 || resolvedPointer > versions.length) {
    throw new Error(`Edit history pointer is invalid in ${historyPath}`);
  }

  return { versions, pointer: resolvedPointer };
}

function serializeHistory(history: ParsedHistory): string {
  const versionLines = history.versions.map((entry, index) =>
    JSON.stringify({ v: index + 1, ts: entry.ts, content: entry.content }),
  );
  return [...versionLines, JSON.stringify({ pointer: history.pointer })].join('\n') + '\n';
}

export class EditHistory {
  constructor(private readonly resolvePath: ManagedPathResolver) {}

  resolveManagedPath(inputPath: string): string {
    return this.resolvePath(inputPath);
  }

  recordEdit(filePath: string, previousContent: string, nextContent: string): void {
    const absolutePath = this.resolvePath(filePath);
    const history = this.loadOrCreateHistory(absolutePath, previousContent);
    const currentContent = history.versions[history.pointer - 1]?.content;

    history.versions = history.versions.slice(0, history.pointer);

    if (currentContent !== previousContent) {
      history.versions.push({
        v: history.versions.length + 1,
        ts: Date.now(),
        content: previousContent,
      });
      history.pointer = history.versions.length;
    }

    history.versions.push({
      v: history.versions.length + 1,
      ts: Date.now(),
      content: nextContent,
    });
    history.pointer = history.versions.length;

    this.writeHistory(absolutePath, history);
  }

  undo(filePath: string): string | null {
    const absolutePath = this.resolvePath(filePath);
    const history = this.loadHistory(absolutePath);
    if (!history || history.pointer <= 1) {
      return null;
    }

    history.pointer -= 1;
    this.writeHistory(absolutePath, history);
    return history.versions[history.pointer - 1]?.content ?? null;
  }

  redo(filePath: string): string | null {
    const absolutePath = this.resolvePath(filePath);
    const history = this.loadHistory(absolutePath);
    if (!history || history.pointer >= history.versions.length) {
      return null;
    }

    history.pointer += 1;
    this.writeHistory(absolutePath, history);
    return history.versions[history.pointer - 1]?.content ?? null;
  }

  private loadOrCreateHistory(filePath: string, initialContent: string): ParsedHistory {
    return (
      this.loadHistory(filePath) ?? {
        versions: [{ v: 1, ts: Date.now(), content: initialContent }],
        pointer: 1,
      }
    );
  }

  private loadHistory(filePath: string): ParsedHistory | null {
    const historyPath = getHistoryFilePath(filePath);
    if (!existsSync(historyPath)) {
      return null;
    }

    return parseHistory(readFileSync(historyPath, 'utf-8'), historyPath);
  }

  private writeHistory(filePath: string, history: ParsedHistory): void {
    const historyPath = getHistoryFilePath(filePath);
    mkdirSync(dirname(historyPath), { recursive: true });
    writeFileSync(historyPath, serializeHistory(history), 'utf-8');
  }
}
