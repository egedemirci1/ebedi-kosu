import { describe, it, expect } from 'vitest';
import { GRAPHICS, MOBILE_MAX_PIXEL_RATIO } from '../../src/graphicsProfile.js';

describe('graphicsProfile', () => {
  it('exports a graphics profile object', () => {
    expect(typeof GRAPHICS.mobile).toBe('boolean');
    expect(typeof GRAPHICS.antialias).toBe('boolean');
    expect(typeof GRAPHICS.shadows).toBe('boolean');
    expect(GRAPHICS.maxPixelRatio).toBeGreaterThan(0);
  });

  it('uses lighter settings on mobile profile', () => {
    if (!GRAPHICS.mobile) return;
    expect(GRAPHICS.antialias).toBe(false);
    expect(GRAPHICS.shadows).toBe(false);
    expect(GRAPHICS.maxPixelRatio).toBeLessThanOrEqual(MOBILE_MAX_PIXEL_RATIO);
    expect(GRAPHICS.useLambert).toBe(true);
    expect(GRAPHICS.starCount).toBe(320);
  });
});
