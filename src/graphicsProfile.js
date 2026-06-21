function isTouchDevice() {
  return (
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );
}

function isNarrowViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;
}

export function isMobileGraphics() {
  return isTouchDevice() || isNarrowViewport();
}

const mobile = isMobileGraphics();

export const GRAPHICS = {
  mobile,
  antialias: !mobile,
  maxPixelRatio: mobile ? 0.9 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2),
  shadows: !mobile,
  useLambert: mobile,
  instancedFrustumCulled: true,
  starCount: mobile ? 180 : 900,
  terrainPool: mobile ? 6 : 9,
  brightStarCount: mobile ? 4 : 8,
  auroraCount: mobile ? 1 : 3,
};

export function applyRendererProfile(renderer) {
  renderer.setPixelRatio(GRAPHICS.maxPixelRatio);
  renderer.shadowMap.enabled = GRAPHICS.shadows;
}
