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
  maxPixelRatio: mobile ? 1 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2),
  shadows: !mobile,
  useLambert: mobile,
  instancedFrustumCulled: true,
  starCount: mobile ? 320 : 900,
};

export function applyRendererProfile(renderer) {
  renderer.setPixelRatio(GRAPHICS.maxPixelRatio);
  renderer.shadowMap.enabled = GRAPHICS.shadows;
}
