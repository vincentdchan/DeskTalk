import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { simpleGit } from 'simple-git';

const REDO_STACK_FILE = '.dt-redo-stack.json';
const GIT_IGNORE_FILE = '.gitignore';
const GIT_IGNORE_CONTENT = ['.DS_Store', REDO_STACK_FILE, ''].join('\n');

interface RedoStackState {
  commits: string[];
}

export type ManagedPathResolver = (inputPath: string) => string;

const repoLocks = new Map<string, Promise<void>>();
let gitAvailabilityPromise: Promise<void> | null = null;

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

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

function getLiveAppRoot(filePath: string): string | null {
  const absolutePath = resolve(filePath);
  const normalizedPath = normalizeSlashes(absolutePath);
  const markerIndex = normalizedPath.indexOf('/.data/liveapps/');
  if (markerIndex === -1) {
    return null;
  }

  const liveAppsPrefix = markerIndex + '/.data/liveapps/'.length;
  const afterPrefix = normalizedPath.slice(liveAppsPrefix);
  const [liveAppId] = afterPrefix.split('/');
  if (!liveAppId) {
    return null;
  }

  const prefixPath = absolutePath.slice(0, markerIndex);
  return join(prefixPath, '.data', 'liveapps', liveAppId);
}

function getRedoStackPath(repoRoot: string): string {
  return join(repoRoot, REDO_STACK_FILE);
}

function readRedoStack(repoRoot: string): RedoStackState {
  const redoStackPath = getRedoStackPath(repoRoot);
  if (!existsSync(redoStackPath)) {
    return { commits: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(redoStackPath, 'utf-8')) as Partial<RedoStackState>;
    if (
      Array.isArray(parsed.commits) &&
      parsed.commits.every((commit) => typeof commit === 'string')
    ) {
      return { commits: parsed.commits };
    }
  } catch {
    return { commits: [] };
  }

  return { commits: [] };
}

function writeRedoStack(repoRoot: string, state: RedoStackState): void {
  writeFileSync(getRedoStackPath(repoRoot), JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function clearRedoStack(repoRoot: string): void {
  writeRedoStack(repoRoot, { commits: [] });
}

async function ensureGitAvailable(): Promise<void> {
  gitAvailabilityPromise ??= simpleGit()
    .version()
    .then(() => undefined)
    .catch((error) => {
      throw new Error(`Git is required for LiveApp version history: ${(error as Error).message}`);
    });
  await gitAvailabilityPromise;
}

async function withRepoLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const previous = repoLocks.get(repoRoot) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  repoLocks.set(
    repoRoot,
    previous.then(() => current),
  );

  await previous;

  try {
    return await fn();
  } finally {
    release();
    if (repoLocks.get(repoRoot) === current) {
      repoLocks.delete(repoRoot);
    }
  }
}

async function ensureRepoInitialized(repoRoot: string): Promise<void> {
  const git = simpleGit(repoRoot);
  let repoWasCreated = false;
  if (!existsSync(join(repoRoot, '.git'))) {
    await git.init();
    await git.addConfig('user.name', 'DeskTalk', false, 'local');
    await git.addConfig('user.email', 'desktalk@local', false, 'local');
    repoWasCreated = true;
  }

  const gitIgnorePath = join(repoRoot, GIT_IGNORE_FILE);
  if (!existsSync(gitIgnorePath)) {
    writeFileSync(gitIgnorePath, GIT_IGNORE_CONTENT, 'utf-8');
  }

  const hasHead = await git.revparse(['--verify', 'HEAD']).then(
    () => true,
    () => false,
  );
  if (repoWasCreated || !hasHead) {
    await git.add('.');
    await git.commit('Initial LiveApp snapshot');
  }
}

async function readFileContent(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, 'utf-8');
}

export class EditHistory {
  constructor(private readonly resolvePath: ManagedPathResolver) {}

  resolveManagedPath(inputPath: string): string {
    return this.resolvePath(inputPath);
  }

  async recordEdit(filePath: string, previousContent: string, nextContent: string): Promise<void> {
    const absolutePath = this.resolvePath(filePath);
    const repoRoot = getLiveAppRoot(absolutePath);
    if (!repoRoot || previousContent === nextContent) {
      return;
    }

    await ensureGitAvailable();

    await withRepoLock(repoRoot, async () => {
      await ensureRepoInitialized(repoRoot);

      const git = simpleGit(repoRoot);
      const relativePath = normalizeSlashes(relative(repoRoot, absolutePath));
      if (readFileSync(absolutePath, 'utf-8') !== nextContent) {
        writeFileSync(absolutePath, nextContent, 'utf-8');
      }
      clearRedoStack(repoRoot);
      await git.add([relativePath, '.gitignore']);
      await git.commit(`Edit ${basename(absolutePath)}`);
    });
  }

  async undo(filePath: string): Promise<string | null> {
    const absolutePath = this.resolvePath(filePath);
    const repoRoot = getLiveAppRoot(absolutePath);
    if (!repoRoot || !existsSync(join(repoRoot, '.git'))) {
      return null;
    }

    await ensureGitAvailable();

    return withRepoLock(repoRoot, async () => {
      const git = simpleGit(repoRoot);
      const commitCount = Number.parseInt(
        (await git.raw(['rev-list', '--count', 'HEAD'])).trim(),
        10,
      );
      if (!Number.isFinite(commitCount) || commitCount <= 1) {
        return null;
      }

      const headSha = (await git.revparse(['HEAD'])).trim();
      const redoStack = readRedoStack(repoRoot);
      redoStack.commits.push(headSha);
      writeRedoStack(repoRoot, redoStack);

      const relativePath = normalizeSlashes(relative(repoRoot, absolutePath));
      await git.raw(['reset', '--soft', 'HEAD~1']);
      await git.raw(['checkout', 'HEAD', '--', relativePath]);

      return readFileContent(absolutePath);
    });
  }

  async redo(filePath: string): Promise<string | null> {
    const absolutePath = this.resolvePath(filePath);
    const repoRoot = getLiveAppRoot(absolutePath);
    if (!repoRoot || !existsSync(join(repoRoot, '.git'))) {
      return null;
    }

    await ensureGitAvailable();

    return withRepoLock(repoRoot, async () => {
      const redoStack = readRedoStack(repoRoot);
      const commitSha = redoStack.commits.pop();
      if (!commitSha) {
        return null;
      }

      writeRedoStack(repoRoot, redoStack);

      const git = simpleGit(repoRoot);
      await git.raw(['cherry-pick', commitSha]);

      return readFileContent(absolutePath);
    });
  }
}
