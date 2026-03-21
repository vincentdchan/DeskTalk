const LIVEAPP_ICON_SIZES = [32, 64, 128, 256, 1024] as const;

const DEFAULT_LIVEAPP_ICON_SIZE = 128;

const LIVEAPP_ICON_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

type LiveAppIconSize = (typeof LIVEAPP_ICON_SIZES)[number];

function isLiveAppIconSize(size: number): size is LiveAppIconSize {
  return (LIVEAPP_ICON_SIZES as readonly number[]).includes(size);
}

function parseLiveAppIconSize(value: unknown): LiveAppIconSize | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || !isLiveAppIconSize(parsed)) {
    return undefined;
  }

  return parsed;
}

function buildLiveAppIconUrl(
  id: string,
  version?: number,
  size: LiveAppIconSize = DEFAULT_LIVEAPP_ICON_SIZE,
): string {
  const params = new URLSearchParams({ size: String(size) });
  if (typeof version === 'number' && Number.isFinite(version)) {
    params.set('v', String(version));
  }
  return `/api/liveapps/${encodeURIComponent(id)}/icon?${params.toString()}`;
}

export {
  DEFAULT_LIVEAPP_ICON_SIZE,
  LIVEAPP_ICON_CACHE_CONTROL,
  LIVEAPP_ICON_SIZES,
  buildLiveAppIconUrl,
  parseLiveAppIconSize,
};

export type { LiveAppIconSize };
