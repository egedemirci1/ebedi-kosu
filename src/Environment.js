import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRAPHICS } from './graphicsProfile.js';
import { RECYCLE_AFTER_Z } from './Track.js';

function createSkyTexture(stops, horizonGlow) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  const positions = [0, 0.25, 0.5, 0.72, 0.88, 1];
  for (let i = 0; i < stops.length; i++) {
    grad.addColorStop(positions[i] ?? i / (stops.length - 1), stops[i]);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const [r, g, b, a] = horizonGlow;
  const horizon = ctx.createLinearGradient(0, 380, 0, 512);
  horizon.addColorStop(0, `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0)`);
  horizon.addColorStop(1, `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`);
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 380, 512, 132);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, canvas };
}

function createStarField(count = 900) {
  const positions = [];
  const phases = [];
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.85 + 0.05);
    const r = 70 + Math.random() * 15;
    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) + 5,
      r * Math.sin(phi) * Math.sin(theta)
    );
    phases.push(Math.random() * Math.PI * 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xddeeff,
    size: 0.35,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });
  return { points: new THREE.Points(geo, mat), phases, baseSize: 0.35 };
}

function createBrightStars() {
  const group = new THREE.Group();
  const stars = [];
  const count = GRAPHICS.brightStarCount;

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.6 + 0.15);
    const r = 72;
    const size = 0.18 + Math.random() * 0.22;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        fog: false,
      })
    );
    mesh.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) + 8,
      r * Math.sin(phi) * Math.sin(theta)
    );
    group.add(mesh);
    stars.push({ mesh, phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 2 });
  }

  return { group, stars };
}

// --- Terrain (single system: fixed slots, seeded variation, no overlap) ---

const PEAK_GEO = new THREE.ConeGeometry(1, 1, 4);
PEAK_GEO.rotateY(Math.PI / 4);

const ROCK_GEO = new THREE.BoxGeometry(1, 1, 1);
ROCK_GEO.rotateY(Math.PI / 4);

/** Strip başına farklı silüet + renk — seed ile seçilir */
const TERRAIN_PALETTES = [
  { near: 0x261a38, mid: 0x2e2248, far: 0x3a2e58 },
  { near: 0x2a1834, mid: 0x34204c, far: 0x423062 },
  { near: 0x1e2236, mid: 0x2a3050, far: 0x364068 },
  { near: 0x281830, mid: 0x322248, far: 0x403058 },
  { near: 0x222038, mid: 0x2c2850, far: 0x383860 },
  { near: 0x2c1a32, mid: 0x36244a, far: 0x44305a },
];

const _terrainMaterialCache = new Map();

function terrainMaterialsForSeed(seed) {
  const palette = TERRAIN_PALETTES[seed % TERRAIN_PALETTES.length];
  const key = `${palette.near}-${palette.mid}-${palette.far}`;
  if (_terrainMaterialCache.has(key)) return _terrainMaterialCache.get(key);

  const mats = {
    near: new THREE.MeshBasicMaterial({ color: palette.near, fog: true }),
    mid: new THREE.MeshBasicMaterial({ color: palette.mid, fog: true }),
    far: new THREE.MeshBasicMaterial({ color: palette.far, fog: true }),
  };
  _terrainMaterialCache.set(key, mats);
  return mats;
}

const STRIP_SPACING = 42;
const STRIP_BACKOFF = 6;
/** Foremost baked peak local Z (mid-layer) — strip recycles only after this passes the camera. */
const TERRAIN_LOCAL_Z_MIN = -20;
const TERRAIN_RECYCLE_Z = RECYCLE_AFTER_Z - TERRAIN_LOCAL_Z_MIN;
const TERRAIN_POOL = GRAPHICS.terrainPool;

/** Deterministic 0..1 — same seed → same silhouette, no per-frame randomness */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967295;
  };
}

const TEMP_QUAT = new THREE.Quaternion();
const TEMP_POS = new THREE.Vector3();
const TEMP_SCALE = new THREE.Vector3();
const TEMP_MATRIX = new THREE.Matrix4();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function addPeak(parts, side, x, z, baseW, baseH, rand, opts = {}) {
  const { groundY = -0.4, heightMul = 1, skipChance = 0 } = opts;
  if (skipChance > 0 && rand() < skipChance) return;

  const w = baseW * (0.82 + rand() * 0.32) * heightMul;
  const h = baseH * (0.86 + rand() * 0.28) * heightMul;
  const stretch = 0.9 + rand() * 0.2;
  const geo = PEAK_GEO.clone();
  geo.scale(w * stretch, h, w / stretch);

  TEMP_QUAT.setFromAxisAngle(Y_AXIS, (rand() - 0.5) * 0.45);
  TEMP_POS.set(side * x, groundY + h * 0.5, z);
  TEMP_SCALE.set(1, 1, 1);
  TEMP_MATRIX.compose(TEMP_POS, TEMP_QUAT, TEMP_SCALE);
  geo.applyMatrix4(TEMP_MATRIX);
  parts.push(geo);
}

/** Dağlar arası doldurucu: kaya bloğu, alçak tepe veya ince spire */
function addFiller(parts, side, x, z, kind, bw, bh, rand, opts = {}) {
  const { groundY = -0.55, depth = 1.2, skipChance = 0.2, heightMul = 1 } = opts;
  if (skipChance > 0 && rand() < skipChance) return;

  let geo;
  if (kind === 'rock') {
    geo = ROCK_GEO.clone();
    const sx = bw * (0.88 + rand() * 0.22);
    const sy = bh * (0.85 + rand() * 0.28) * heightMul;
    const sz = depth * (0.85 + rand() * 0.25);
    geo.scale(sx, sy, sz);
  } else if (kind === 'spire') {
    geo = PEAK_GEO.clone();
    const h = bh * (0.9 + rand() * 0.22) * heightMul;
    const r = 0.35 + rand() * 0.18;
    geo.scale(r, h, r);
  } else {
    geo = PEAK_GEO.clone();
    const stretch = 0.92 + rand() * 0.16;
    geo.scale(bw * stretch * heightMul, bh * (0.9 + rand() * 0.2), bw / stretch);
  }

  TEMP_QUAT.setFromAxisAngle(Y_AXIS, rand() * Math.PI * 0.5);
  const lift = kind === 'rock' ? bh * 0.5 : bh * 0.45;
  TEMP_POS.set(side * x, groundY + lift * heightMul, z);
  TEMP_SCALE.set(1, 1, 1);
  TEMP_MATRIX.compose(TEMP_POS, TEMP_QUAT, TEMP_SCALE);
  geo.applyMatrix4(TEMP_MATRIX);
  parts.push(geo);
}

function mergeParts(parts) {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

/** Güvenli z kayması — şeritler arası farklı ritim, çakışma yok */
function jitterZ(baseZ, rand, variant) {
  const shift = variant === 1 ? 2.5 : variant === 3 ? -2 : 0;
  return baseZ + shift + (rand() - 0.5) * 2.2;
}

function jitterX(baseX, rand) {
  return baseX + (rand() - 0.5) * 0.9;
}

function jitterXFiller(baseX, rand) {
  return baseX + (rand() - 0.5) * 0.55;
}

function jitterZFiller(baseZ, rand, variant) {
  const shift = variant === 1 ? 1.8 : variant === 3 ? -1.4 : 0;
  return baseZ + shift + (rand() - 0.5) * 1.3;
}

const PEAK_SLOTS = [
  { layer: 'near', side: -1, x: 11.5, z: -15, bw: 3.2, bh: 5.5 },
  { layer: 'near', side: -1, x: 12, z: 12, bw: 2.8, bh: 4.8, skip: 0.12 },
  { layer: 'near', side: 1, x: 11, z: -9, bw: 3, bh: 5.2 },
  { layer: 'near', side: 1, x: 11.8, z: 15, bw: 2.9, bh: 4.5, skip: 0.12 },
  { layer: 'mid', side: -1, x: 18.5, z: -19, bw: 4.5, bh: 9 },
  { layer: 'mid', side: -1, x: 17.5, z: -3, bw: 4, bh: 7.5, skip: 0.08 },
  { layer: 'mid', side: -1, x: 18, z: 14, bw: 4.2, bh: 8.2 },
  { layer: 'mid', side: 1, x: 18, z: -14, bw: 4.3, bh: 8.5 },
  { layer: 'mid', side: 1, x: 17.8, z: 2, bw: 3.8, bh: 7, skip: 0.08 },
  { layer: 'mid', side: 1, x: 18.2, z: 17, bw: 4.1, bh: 8.8 },
  { layer: 'far', side: -1, x: 28, z: -11, bw: 6, bh: 13, gy: -0.8 },
  { layer: 'far', side: -1, x: 29, z: 8, bw: 5.5, bh: 11.5, gy: -0.8, skip: 0.15 },
  { layer: 'far', side: 1, x: 28.5, z: -16, bw: 5.8, bh: 12, gy: -0.8 },
  { layer: 'far', side: 1, x: 29.5, z: 5, bw: 6.2, bh: 14, gy: -0.8 },
];

/** Dağ zirveleri arasındaki boşluklara yerleştirilir — x daha içerde, z iki tepe ortası */
const FILLER_SLOTS = [
  { layer: 'near', side: -1, x: 10, z: -2, kind: 'knoll', bw: 2.4, bh: 1.6 },
  { layer: 'near', side: -1, x: 10.4, z: 4, kind: 'rock', bw: 1.6, bh: 1.1, depth: 1.3 },
  { layer: 'near', side: 1, x: 9.8, z: 3, kind: 'knoll', bw: 2.1, bh: 1.4 },
  { layer: 'near', side: 1, x: 10.2, z: -12, kind: 'spire', bw: 0.5, bh: 3.2 },
  { layer: 'mid', side: -1, x: 16.8, z: -11, kind: 'rock', bw: 2.2, bh: 1.4, depth: 1.8 },
  { layer: 'mid', side: -1, x: 17.2, z: 5.5, kind: 'knoll', bw: 2.8, bh: 1.8 },
  { layer: 'mid', side: -1, x: 16.5, z: 18, kind: 'spire', bw: 0.5, bh: 4.5 },
  { layer: 'mid', side: 1, x: 16.6, z: -6, kind: 'knoll', bw: 2.5, bh: 1.7 },
  { layer: 'mid', side: 1, x: 17, z: 9, kind: 'rock', bw: 1.9, bh: 1.2, depth: 1.5 },
  { layer: 'mid', side: 1, x: 16.8, z: -17, kind: 'spire', bw: 0.45, bh: 3.8 },
  { layer: 'far', side: -1, x: 26.5, z: -2, kind: 'knoll', bw: 3.2, bh: 2, gy: -0.85 },
  { layer: 'far', side: -1, x: 27, z: 14, kind: 'rock', bw: 2.4, bh: 1.5, depth: 2, gy: -0.85 },
  { layer: 'far', side: 1, x: 27.2, z: -5, kind: 'spire', bw: 0.5, bh: 5, gy: -0.85 },
  { layer: 'far', side: 1, x: 26.8, z: 11, kind: 'knoll', bw: 3, bh: 2.1, gy: -0.85 },
  { layer: 'near', side: -1, x: 9.5, z: -11, kind: 'rock', bw: 1.4, bh: 0.9, depth: 1.1, skip: 0.28 },
  { layer: 'near', side: 1, x: 9.6, z: 11, kind: 'spire', bw: 0.4, bh: 2.6, skip: 0.28 },
];

function buildTerrainStripGeometries(seed) {
  const rand = seededRandom(seed);
  const variant = Math.floor(rand() * 4);
  const heightMul = variant === 0 ? 0.9 + rand() * 0.2 : variant === 2 ? 1.05 + rand() * 0.25 : 0.95 + rand() * 0.35;
  const near = [];
  const mid = [];
  const far = [];
  const buckets = { near, mid, far };

  for (const slot of PEAK_SLOTS) {
    const x = jitterX(slot.x, rand);
    const z = jitterZ(slot.z, rand, variant);
    addPeak(buckets[slot.layer], slot.side, x, z, slot.bw, slot.bh, rand, {
      groundY: slot.gy ?? -0.4,
      heightMul,
      skipChance: slot.skip ?? (variant === 2 && slot.layer === 'near' ? 0.18 : 0),
    });
  }

  const fillerSkip = variant === 3 ? 0.32 : 0.18;
  for (const slot of FILLER_SLOTS) {
    const x = jitterXFiller(slot.x, rand);
    const z = jitterZFiller(slot.z, rand, variant);
    addFiller(buckets[slot.layer], slot.side, x, z, slot.kind, slot.bw, slot.bh, rand, {
      groundY: slot.gy ?? -0.55,
      depth: slot.depth ?? 1.2,
      heightMul: heightMul * 0.92,
      skipChance: slot.skip ?? fillerSkip,
    });
  }

  if (variant === 1 || rand() > 0.55) {
    addPeak(far, rand() > 0.5 ? 1 : -1, jitterX(27, rand), jitterZ(rand() > 0.5 ? -5 : 10, rand, 0), 5, 10, rand, {
      groundY: -0.8,
      heightMul: heightMul * 1.08,
    });
  }

  return {
    near: mergeParts(near),
    mid: mergeParts(mid),
    far: mergeParts(far),
  };
}

function createTerrainStrip(stripSeed) {
  const group = new THREE.Group();
  const built = buildTerrainStripGeometries(stripSeed);
  const mats = terrainMaterialsForSeed(stripSeed);

  if (built.far) {
    const mesh = new THREE.Mesh(built.far, mats.far);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  if (built.mid) {
    const mesh = new THREE.Mesh(built.mid, mats.mid);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  if (built.near) {
    const mesh = new THREE.Mesh(built.near, mats.near);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  return group;
}

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.skyGroup = new THREE.Group();
    this.terrainGroup = new THREE.Group();
    this.terrainStrips = [];
    this.time = 0;
    this._skyStopsKey = '';
    this._auroraMeshes = [];
    this._cycleStarOpacity = 0.88;
    this._cycleMoonVis = 1;
    this._cycleMoonGlow = 0.08;
    this._cycleMoonHalo = 0.03;
    this._decorUpdateTimer = 0;

    const initialSky = createSkyTexture(
      ['#141022', '#221838', '#342850', '#5a4870', '#8878a0', '#a898b0'],
      [255, 170, 150, 0.07]
    );
    this.skyTexture = initialSky.texture;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(85, GRAPHICS.mobile ? 24 : 32, GRAPHICS.mobile ? 16 : 24),
      new THREE.MeshBasicMaterial({
        map: this.skyTexture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    this.skyMesh = sky;
    this.skyGroup.add(sky);

    const starField = createStarField(GRAPHICS.starCount);
    this.stars = starField.points;
    this.starPhases = starField.phases;
    this.starBaseSize = starField.baseSize;
    this.skyGroup.add(this.stars);

    const brightStars = createBrightStars();
    this.brightStars = brightStars.stars;
    this.skyGroup.add(brightStars.group);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xdde8ff, fog: false, transparent: true, opacity: 1 })
    );
    this.moon.position.set(18, 28, -35);
    this.skyGroup.add(this.moon);

    this.moonGlow = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x8899ff,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        fog: false,
      })
    );
    this.moonGlow.position.copy(this.moon.position);
    this.skyGroup.add(this.moonGlow);

    this.moonHalo = new THREE.Mesh(
      new THREE.SphereGeometry(9, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0x6677cc,
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
        fog: false,
      })
    );
    this.moonHalo.position.copy(this.moon.position);
    this.skyGroup.add(this.moonHalo);

    for (let i = 0; i < GRAPHICS.auroraCount; i++) {
      const aurora = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 12),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0x442266 : 0x662244,
          transparent: true,
          opacity: 0.06 + i * 0.02,
          depthWrite: false,
          fog: false,
          side: THREE.DoubleSide,
        })
      );
      aurora.position.set(-5 + i * 8, 18 + i * 3, -40 - i * 10);
      aurora.rotation.x = -0.4 + i * 0.1;
      aurora.rotation.z = 0.2 - i * 0.15;
      this._auroraMeshes.push(aurora);
      this.skyGroup.add(aurora);
    }

    scene.add(this.skyGroup);

    for (let i = 0; i < TERRAIN_POOL; i++) {
      const strip = createTerrainStrip(i * 7919 + 17);
      strip.position.z = -i * STRIP_SPACING - 18;
      this.terrainStrips.push(strip);
      this.terrainGroup.add(strip);
    }
    scene.add(this.terrainGroup);

    scene.background = null;
  }

  updateSkyTexture(stops, horizonGlow) {
    const key = stops.join('|') + horizonGlow.join(',');
    if (key === this._skyStopsKey) return;
    this._skyStopsKey = key;

    const next = createSkyTexture(stops, horizonGlow);
    const old = this.skyTexture;
    this.skyTexture = next.texture;
    this.skyMesh.material.map = this.skyTexture;
    this.skyMesh.material.needsUpdate = true;
    old?.dispose();
  }

  applyDayCycle(state) {
    this.updateSkyTexture(state.sky, state.horizonGlow);

    const starBase = 0.78 * state.stars;
    this._cycleStarOpacity = starBase;
    this.stars.material.opacity = starBase;
    this.stars.visible = state.stars > 0.04;

    for (const star of this.brightStars) {
      star.mesh.visible = state.stars > 0.15;
    }

    const moonAlpha = state.moonVis;
    this._cycleMoonVis = moonAlpha;
    this._cycleMoonGlow = state.moonGlow * moonAlpha;
    this._cycleMoonHalo = state.moonGlow * 0.45 * moonAlpha;
    this.moon.material.opacity = moonAlpha;
    this.moon.material.transparent = true;
    this.moon.visible = moonAlpha > 0.05;
    this.moonGlow.material.opacity = this._cycleMoonGlow;
    this.moonHalo.material.opacity = this._cycleMoonHalo;

    for (let i = 0; i < this._auroraMeshes.length; i++) {
      const mesh = this._auroraMeshes[i];
      mesh.material.opacity = state.aurora * (0.85 + i * 0.15);
      mesh.visible = state.aurora > 0.01;
    }
  }

  update(dt, speed, camera) {
    this.time += dt;
    this.skyGroup.position.set(camera.position.x * 0.15, camera.position.y * 0.3, camera.position.z);

    this._decorUpdateTimer += dt;
    if (!GRAPHICS.mobile || this._decorUpdateTimer >= 1 / 30) {
      this._decorUpdateTimer = 0;
      const starPulse = 0.88 + Math.sin(this.time * 2.4) * 0.12;
      this.stars.material.size = this.starBaseSize * starPulse;
      this.stars.material.opacity = this._cycleStarOpacity * (0.94 + Math.sin(this.time * 1.8) * 0.06);

      for (const star of this.brightStars) {
        const twinkle = 0.45 + Math.sin(this.time * star.speed + star.phase) * 0.35;
        star.mesh.material.opacity = twinkle;
        const scale = 0.85 + Math.sin(this.time * star.speed * 1.3 + star.phase) * 0.2;
        star.mesh.scale.setScalar(scale);
      }

      const moonPulse = 0.92 + Math.sin(this.time * 0.9) * 0.08;
      this.moonGlow.scale.setScalar(moonPulse);
      this.moonGlow.material.opacity = this._cycleMoonGlow * (0.92 + Math.sin(this.time * 1.1) * 0.08);
      this.moonHalo.scale.setScalar(0.95 + Math.sin(this.time * 0.7) * 0.08);
      this.moonHalo.material.opacity = this._cycleMoonHalo * (0.95 + Math.sin(this.time * 0.85 + 1) * 0.05);
    }

    const parallax = speed * dt * 0.38;

    for (const strip of this.terrainStrips) {
      strip.position.z += parallax;
    }

    let minZ = Infinity;
    for (const strip of this.terrainStrips) {
      if (strip.position.z < minZ) minZ = strip.position.z;
    }

    for (const strip of this.terrainStrips) {
      if (strip.position.z > TERRAIN_RECYCLE_Z) {
        strip.position.z = minZ - STRIP_SPACING - STRIP_BACKOFF;
        minZ = strip.position.z;
      }
    }
  }

  reset() {
    this.time = 0;
    this.terrainStrips.forEach((strip, i) => {
      strip.position.z = -i * STRIP_SPACING - 18;
    });
    this._decorUpdateTimer = 0;
  }
}
