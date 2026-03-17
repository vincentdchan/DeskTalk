import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MINIAPP_ICON_SIZE,
  MINIAPP_ICON_CACHE_CONTROL,
  MINIAPP_ICON_SIZES,
  buildMiniAppIconUrl,
  parseMiniAppIconSize,
} from './miniapp-icon';

describe('miniapp-icon helpers', () => {
  it('builds icon URLs with the default size', () => {
    expect(buildMiniAppIconUrl('note')).toBe(
      `/api/miniapps/note/icon?size=${DEFAULT_MINIAPP_ICON_SIZE}`,
    );
  });

  it('encodes icon URLs and supports custom sizes', () => {
    expect(buildMiniAppIconUrl('hello/world', 128)).toBe(
      '/api/miniapps/hello%2Fworld/icon?size=128',
    );
  });

  it('parses supported sizes', () => {
    for (const size of MINIAPP_ICON_SIZES) {
      expect(parseMiniAppIconSize(String(size))).toBe(size);
    }
  });

  it('rejects missing or unsupported sizes', () => {
    expect(parseMiniAppIconSize(undefined)).toBeUndefined();
    expect(parseMiniAppIconSize('')).toBeUndefined();
    expect(parseMiniAppIconSize('48')).toBeUndefined();
    expect(parseMiniAppIconSize('1024')).toBeUndefined();
    expect(parseMiniAppIconSize('invalid')).toBeUndefined();
  });

  it('exports a browser cache policy', () => {
    expect(MINIAPP_ICON_CACHE_CONTROL).toBe('public, max-age=86400, stale-while-revalidate=604800');
  });
});
