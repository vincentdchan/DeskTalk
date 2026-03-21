import { describe, expect, it } from 'vitest';
import { buildLiveAppIconUrl, parseLiveAppIconSize } from './liveapp-icon';

describe('liveapp icon helpers', () => {
  it('builds liveapp icon urls', () => {
    expect(buildLiveAppIconUrl('project-tracker')).toBe(
      '/api/liveapps/project-tracker/icon?size=128',
    );
  });

  it('includes version in liveapp icon urls', () => {
    expect(buildLiveAppIconUrl('project-tracker', 1234, 256)).toBe(
      '/api/liveapps/project-tracker/icon?size=256&v=1234',
    );
  });

  it('parses supported icon sizes', () => {
    expect(parseLiveAppIconSize('256')).toBe(256);
    expect(parseLiveAppIconSize('31')).toBeUndefined();
  });
});
