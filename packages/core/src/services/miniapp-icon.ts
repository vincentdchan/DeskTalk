const MINIAPP_ICON_SIZES = [32, 64, 128, 256, 1025] as const;

const DEFAULT_MINIAPP_ICON_SIZE = 128;

const MINIAPP_ICON_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

type MiniAppIconSize = (typeof MINIAPP_ICON_SIZES)[number];

function isMiniAppIconSize(size: number): size is MiniAppIconSize {
  return (MINIAPP_ICON_SIZES as readonly number[]).includes(size);
}

function parseMiniAppIconSize(value: unknown): MiniAppIconSize | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || !isMiniAppIconSize(parsed)) {
    return undefined;
  }

  return parsed;
}

function buildMiniAppIconUrl(
  id: string,
  size: MiniAppIconSize = DEFAULT_MINIAPP_ICON_SIZE,
): string {
  const params = new URLSearchParams({ size: String(size) });
  return `/api/miniapps/${encodeURIComponent(id)}/icon?${params.toString()}`;
}

export {
  DEFAULT_MINIAPP_ICON_SIZE,
  MINIAPP_ICON_CACHE_CONTROL,
  MINIAPP_ICON_SIZES,
  buildMiniAppIconUrl,
  parseMiniAppIconSize,
};

export type { MiniAppIconSize };
