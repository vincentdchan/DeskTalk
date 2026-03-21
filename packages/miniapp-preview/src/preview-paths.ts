export function normalizePreviewPath(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  return path.replace(/\\/g, '/');
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
