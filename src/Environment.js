import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  const count = 8;

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

const MOUNTAIN_CONE = new THREE.ConeGeometry(1, 1, 4);
const MOUNTAIN_MAT = new THREE.MeshBasicMaterial({
  color: 0x221838,
  fog: true,
});

const MOUNTAIN_FAR_MAT = new THREE.MeshBasicMaterial({
  color: 0x3a2850,
  fog: false,
});

const VALLEY_MAT = new THREE.MeshBasicMaterial({
  color: 0x4a335f,
  fog: true,
});

const VALLEY_ACCENT_MAT = new THREE.MeshBasicMaterial({
  color: 0x6a4668,
  fog: true,
});

const VALLEY_FAR_MAT = new THREE.MeshBasicMaterial({
  color: 0x2f213f,
  transparent: true,
  opacity: 0.62,
  fog: true,
  depthWrite: false,
});
const VALLEY_BASE_FOG_MAT = new THREE.MeshBasicMaterial({
  color: 0x3a2a4a,
  transparent: true,
  opacity: 0.32,
  fog: true,
  depthWrite: false,
});
const VALLEY_WALL_MAT = new THREE.MeshBasicMaterial({
  color: 0x22172f,
  transparent: true,
  opacity: 0.72,
  fog: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const VALLEY_DEEP_FOG_MAT = new THREE.MeshBasicMaterial({
  color: 0x2a1d3a,
  transparent: true,
  opacity: 0.26,
  fog: true,
  depthWrite: false,
});

const VALLEY_BOX = new THREE.BoxGeometry(1, 1, 1);
const VALLEY_CENTER_CLEAR = 12;
const VALLEY_SIDE_WALL_GEO = new THREE.PlaneGeometry(42, 30);
const VALLEY_FOG_BED_GEO = new THREE.PlaneGeometry(34, 28);

const RECYCLE_Z = 12;
const STRIP_BACKOFF = 8;

function buildMountainStripGeo() {
  const parts = [];
  const count = 5 + Math.floor(Math.random() * 4);

  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const width = 4 + Math.random() * 8;
    const height = 3 + Math.random() * 10;
    const geo = MOUNTAIN_CONE.clone();
    geo.scale(width, height, width);
    const matrix = new THREE.Matrix4().makeRotationY(Math.random() * Math.PI);
    matrix.setPosition(
      side * (14 + Math.random() * 10),
      height * 0.5 - 0.5,
      (Math.random() - 0.5) * 12
    );
    geo.applyMatrix4(matrix);
    parts.push(geo);
  }

  if (parts.length === 0) return MOUNTAIN_CONE.clone();
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged || MOUNTAIN_CONE.clone();
}

function buildValleyStripGeo() {
  const parts = [];
  const accentParts = [];
  const farParts = [];
  const zSlots = [-16, -6, 6, 16];

  for (const side of [-1, 1]) {
    for (let i = 0; i < zSlots.length; i++) {
      const nearWidth = 4.5 + Math.random() * 5.5;
      const nearHeight = 4 + Math.random() * 6;
      const nearX = side * (VALLEY_CENTER_CLEAR + 6.5 + i * 3.2 + Math.random() * 0.7);
      const nearZ = zSlots[i] + (Math.random() - 0.5) * 1.6;

      const cone = MOUNTAIN_CONE.clone();
      cone.scale(nearWidth, nearHeight, nearWidth);
      const coneMatrix = new THREE.Matrix4().makeRotationY((Math.random() - 0.5) * 0.7);
      coneMatrix.setPosition(
        nearX,
        -5.8 - nearHeight * 0.55 - Math.random() * 1.6,
        nearZ
      );
      cone.applyMatrix4(coneMatrix);
      if ((i + (side < 0 ? 1 : 0)) % 3 === 0) accentParts.push(cone);
      else parts.push(cone);

      const ledge = VALLEY_BOX.clone();
      ledge.scale(18 + Math.random() * 9, 2.6 + Math.random() * 1.6, 10 + Math.random() * 6);
      const ledgeMatrix = new THREE.Matrix4().makeRotationY((Math.random() - 0.5) * 0.18);
      ledgeMatrix.setPosition(
        side * (VALLEY_CENTER_CLEAR + 11 + i * 2.2 + Math.random() * 0.8),
        -11.2 - Math.random() * 2.2,
        nearZ * 0.85
      );
      ledge.applyMatrix4(ledgeMatrix);
      parts.push(ledge);

      const farBlock = VALLEY_BOX.clone();
      farBlock.scale(20 + Math.random() * 12, 3.6 + Math.random() * 2.3, 14 + Math.random() * 7);
      const farMatrix = new THREE.Matrix4().makeRotationY((Math.random() - 0.5) * 0.15);
      farMatrix.setPosition(
        side * (VALLEY_CENTER_CLEAR + 22 + i * 4.4 + Math.random() * 1.2),
        -15.5 - Math.random() * 3.2,
        nearZ - 3.5 + (Math.random() - 0.5) * 1.2
      );
      farBlock.applyMatrix4(farMatrix);
      farParts.push(farBlock);
    }
  }

  const main = parts.length > 0 ? mergeGeometries(parts, false) : MOUNTAIN_CONE.clone();
  for (const p of parts) p.dispose();
  const far = farParts.length > 0 ? mergeGeometries(farParts, false) : null;
  for (const p of farParts) p.dispose();

  let accent = null;
  if (accentParts.length > 0) {
    accent = mergeGeometries(accentParts, false);
    for (const p of accentParts) p.dispose();
  }

  return { main, accent, far };
}

function createValleyStrip(z) {
  const group = new THREE.Group();
  group.position.z = z;
  const built = buildValleyStripGeo();
  const main = new THREE.Mesh(built.main, VALLEY_MAT);
  group.add(main);

  if (built.far) {
    const far = new THREE.Mesh(built.far, VALLEY_FAR_MAT);
    far.position.set(0, 0, -5.5);
    group.add(far);
  }

  if (built.accent) {
    group.add(new THREE.Mesh(built.accent, VALLEY_ACCENT_MAT));
  }

  // Add side walls so valley masses visually connect downward (no "floating islands").
  for (const side of [-1, 1]) {
    const sideWall = new THREE.Mesh(VALLEY_SIDE_WALL_GEO, VALLEY_WALL_MAT);
    sideWall.position.set(side * (VALLEY_CENTER_CLEAR + 9.5), -10.8, -2);
    sideWall.rotation.y = side * Math.PI / 2;
    sideWall.rotation.z = side * 0.03;
    group.add(sideWall);
  }

  // Low-lying fog bed to hide valley bottoms and avoid "floating" silhouettes.
  for (const side of [-1, 1]) {
    const fogBed = new THREE.Mesh(VALLEY_FOG_BED_GEO, VALLEY_BASE_FOG_MAT);
    fogBed.rotation.x = -Math.PI / 2;
    fogBed.position.set(side * (VALLEY_CENTER_CLEAR + 14), -8.4, -1);
    group.add(fogBed);

    const deepFogBed = new THREE.Mesh(VALLEY_FOG_BED_GEO, VALLEY_DEEP_FOG_MAT);
    deepFogBed.rotation.x = -Math.PI / 2;
    deepFogBed.position.set(side * (VALLEY_CENTER_CLEAR + 14), -12.2, -3.5);
    deepFogBed.scale.set(1.2, 1, 1.25);
    group.add(deepFogBed);
  }

  return group;
}

function createMountainStrip(z) {
  const group = new THREE.Group();
  group.position.z = z;

  const mountains = new THREE.Mesh(buildMountainStripGeo(), MOUNTAIN_MAT);
  group.add(mountains);

  const farMountains = new THREE.Mesh(buildMountainStripGeo(), MOUNTAIN_FAR_MAT);
  farMountains.position.set(0, 1.5, -4);
  farMountains.scale.set(1.15, 1.1, 1.2);
  group.add(farMountains);

  const fogMat = new THREE.MeshBasicMaterial({
    color: 0x2a2040,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    fog: true,
  });

  const mistGeo = new THREE.PlaneGeometry(22, 7);
  for (const side of [-1, 1]) {
    const sideMist = new THREE.Mesh(mistGeo, fogMat);
    sideMist.rotation.x = -Math.PI / 2;
    sideMist.position.set(side * 22, 3, 0);
    group.add(sideMist);
  }

  return group;
}

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.skyGroup = new THREE.Group();
    this.mountainGroup = new THREE.Group();
    this.valleyGroup = new THREE.Group();
    this.mountainStrips = [];
    this.valleyStrips = [];
    this.stripSpacing = 40;
    this.valleySpacing = 26;
    this.poolSize = 10;
    this.valleyPoolSize = 12;
    this.time = 0;
    this._skyStopsKey = '';
    this._auroraMeshes = [];
    this._cycleStarOpacity = 0.88;
    this._cycleMoonVis = 1;
    this._cycleMoonGlow = 0.08;
    this._cycleMoonHalo = 0.03;

    const initialSky = createSkyTexture(
      ['#141022', '#221838', '#342850', '#5a4870', '#8878a0', '#a898b0'],
      [255, 170, 150, 0.07]
    );
    this.skyTexture = initialSky.texture;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(85, 32, 24),
      new THREE.MeshBasicMaterial({
        map: this.skyTexture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    this.skyMesh = sky;
    this.skyGroup.add(sky);

    const starField = createStarField();
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

    for (let i = 0; i < 3; i++) {
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

    for (let i = 0; i < this.poolSize; i++) {
      const strip = createMountainStrip(-i * this.stripSpacing - 20);
      this.mountainStrips.push(strip);
      this.mountainGroup.add(strip);
    }
    scene.add(this.mountainGroup);

    for (let i = 0; i < this.valleyPoolSize; i++) {
      const strip = createValleyStrip(-i * this.valleySpacing - 12);
      this.valleyStrips.push(strip);
      this.valleyGroup.add(strip);
    }
    scene.add(this.valleyGroup);

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

    const parallax = speed * dt * 0.35;
    const valleyParallax = speed * dt * 0.55;

    for (const strip of this.mountainStrips) {
      strip.position.z += parallax;
    }

    for (const strip of this.valleyStrips) {
      strip.position.z += valleyParallax;
    }

    let minZ = Infinity;
    for (const strip of this.mountainStrips) {
      if (strip.position.z < minZ) minZ = strip.position.z;
    }

    for (const strip of this.mountainStrips) {
      if (strip.position.z > RECYCLE_Z) {
        strip.position.z = minZ - this.stripSpacing - STRIP_BACKOFF;
        minZ = strip.position.z;
      }
    }

    let valleyMinZ = Infinity;
    for (const strip of this.valleyStrips) {
      if (strip.position.z < valleyMinZ) valleyMinZ = strip.position.z;
    }

    for (const strip of this.valleyStrips) {
      if (strip.position.z > RECYCLE_Z) {
        strip.position.z = valleyMinZ - this.valleySpacing - STRIP_BACKOFF;
        valleyMinZ = strip.position.z;
      }
    }
  }

  reset() {
    this.time = 0;
    this.mountainStrips.forEach((strip, i) => {
      strip.position.z = -i * this.stripSpacing - 20;
    });
    this.valleyStrips.forEach((strip, i) => {
      strip.position.z = -i * this.valleySpacing - 12;
    });
  }
}
