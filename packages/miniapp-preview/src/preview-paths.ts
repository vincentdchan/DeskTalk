export function normalizePreviewPath(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  return path.replace(/\\/g, '/');
}

export interface BuildDtfsUrlOptions {
  streamId?: string;
  token?: string;
  accentColor?: string;
  theme?: 'light' | 'dark';
  cacheBust?: string;
}

export function buildDtfsUrl(path: string, options?: BuildDtfsUrlOptions): string {
  const normalized = normalizePreviewPath(path) ?? path;
  const encodedPath = normalized
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const params = new URLSearchParams();

  if (options?.streamId) params.set('streamId', options.streamId);
  if (options?.token) params.set('token', options.token);
  if (options?.accentColor) params.set('accent', options.accentColor);
  if (options?.theme) params.set('theme', options.theme);
  if (options?.cacheBust) params.set('t', options.cacheBust);

  const query = params.toString();
  return query ? `/@dtfs/${encodedPath}?${query}` : `/@dtfs/${encodedPath}`;
}

export function isLiveAppPath(path: string | null | undefined): boolean {
  const normalizedPath = normalizePreviewPath(path);
  if (!normalizedPath) {
    return false;
  }

  return normalizedPath === '.data/liveapps' || normalizedPath.startsWith('.data/liveapps/');
}

export function matchesPreviewFilePath(
  changedPath: string,
  currentPath: string | null | undefined,
): boolean {
  const normalizedChangedPath = normalizePreviewPath(changedPath);
  const normalizedCurrentPath = normalizePreviewPath(currentPath);

  if (!normalizedChangedPath || !normalizedCurrentPath) {
    return false;
  }

  return (
    normalizedChangedPath === normalizedCurrentPath ||
    normalizedChangedPath.endsWith(`/${normalizedCurrentPath}`)
  );
}
