import { LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

export const MOBILE_MAX_PIXEL_RATIO = 0.9;
export const DESKTOP_MAX_PIXEL_RATIO = 2;

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

function resolveMaxPixelRatio() {
  if (typeof window === 'undefined') return 1;
  const cap = mobile ? MOBILE_MAX_PIXEL_RATIO : DESKTOP_MAX_PIXEL_RATIO;
  return Math.min(window.devicePixelRatio, cap);
}

export function applyCanvasTextureSampling(texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

export const GRAPHICS = {
  mobile,
  antialias: !mobile,
  maxPixelRatio: resolveMaxPixelRatio(),
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
