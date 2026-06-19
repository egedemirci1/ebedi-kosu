import { describe, it, expect } from 'vitest';
import { GRAPHICS } from '../../src/graphicsProfile.js';

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
    expect(GRAPHICS.maxPixelRatio).toBe(1);
    expect(GRAPHICS.useLambert).toBe(true);
    expect(GRAPHICS.starCount).toBe(320);
  });
});
