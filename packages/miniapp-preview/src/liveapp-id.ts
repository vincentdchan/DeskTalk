export function sanitizeTitleSegment(title: string): string {
  const normalized = title.trim().toLowerCase().replace(/\s+/g, '-');
  const safe = normalized.replace(/[^a-z0-9._-]/g, '');
  return safe || 'preview';
}

export function getStreamedDirectoryName(streamId: string, title: string): string {
  return `${sanitizeTitleSegment(title)}_${streamId}`;
}
