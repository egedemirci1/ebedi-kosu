import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SEGMENT_LENGTH = 20;
const TRACK_WIDTH = 8;
const SEGMENT_HALF = SEGMENT_LENGTH / 2;
const FLOOR_TILE_COUNT = 10;
const FLOOR_TILE_LENGTH = SEGMENT_LENGTH / FLOOR_TILE_COUNT;
const FLOOR_TILE_HALF = FLOOR_TILE_LENGTH / 2;
const FLOOR_THICKNESS = 0.12;
const FLOOR_Y = -FLOOR_THICKNESS / 2;
const CAMERA_Z = 8;
const RECYCLE_AFTER_Z = CAMERA_Z + SEGMENT_HALF + 8;
export const WALL_X = TRACK_WIDTH / 2 + 0.22;
export const WALL_TILE_WIDTH = 0.45;

function createWallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, 128, 0);
  base.addColorStop(0, '#1e1830');
  base.addColorStop(0.55, '#2c2648');
  base.addColorStop(0.85, '#3a3460');
  base.addColorStop(1, '#4a4080');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);

  const heightFade = ctx.createLinearGradient(0, 0, 0, 256);
  heightFade.addColorStop(0, 'rgba(120, 100, 200, 0.22)');
  heightFade.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
  heightFade.addColorStop(1, 'rgba(10, 8, 20, 0.35)');
  ctx.fillStyle = heightFade;
  ctx.fillRect(0, 0, 128, 256);

  ctx.strokeStyle = 'rgba(140, 120, 210, 0.18)';
  ctx.lineWidth = 1;
  for (let y = 32; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }

  const innerGlow = ctx.createLinearGradient(96, 0, 128, 0);
  innerGlow.addColorStop(0, 'rgba(140, 110, 255, 0)');
  innerGlow.addColorStop(1, 'rgba(200, 160, 255, 0.45)');
  ctx.fillStyle = innerGlow;
  ctx.fillRect(88, 0, 40, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createFloorSegmentTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#3a3468');
  base.addColorStop(0.5, '#2e2858');
  base.addColorStop(1, '#3a3468');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);

  const sheen = ctx.createLinearGradient(0, 0, 256, 0);
  sheen.addColorStop(0, 'rgba(120, 90, 200, 0.35)');
  sheen.addColorStop(0.5, 'rgba(80, 70, 140, 0.08)');
  sheen.addColorStop(1, 'rgba(120, 90, 200, 0.35)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 256, 512);

  for (let x = 64; x < 256; x += 64) {
    ctx.strokeStyle = 'rgba(140, 120, 220, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  const laneX = [42, 128, 214];
  for (const lx of laneX) {
    const laneGrad = ctx.createLinearGradient(lx - 8, 0, lx + 8, 0);
    laneGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    laneGrad.addColorStop(0.5, 'rgba(100, 180, 255, 0.22)');
    laneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = laneGrad;
    ctx.fillRect(lx - 10, 0, 20, 512);
  }

  ctx.strokeStyle = 'rgba(180, 140, 255, 0.2)';
  ctx.lineWidth = 2;
  for (const lx of [85, 171]) {
    ctx.setLineDash([12, 18]);
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, 512);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const edgeGlow = ctx.createLinearGradient(0, 0, 256, 0);
  edgeGlow.addColorStop(0, 'rgba(180, 120, 255, 0.35)');
  edgeGlow.addColorStop(0.06, 'rgba(0, 0, 0, 0)');
  edgeGlow.addColorStop(0.94, 'rgba(0, 0, 0, 0)');
  edgeGlow.addColorStop(1, 'rgba(180, 120, 255, 0.35)');
  ctx.fillStyle = edgeGlow;
  ctx.fillRect(0, 0, 256, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function tileLocalZ(tileIndex) {
  return -SEGMENT_HALF + FLOOR_TILE_HALF + tileIndex * FLOOR_TILE_LENGTH;
}

function createFloorTileBoxGeometry(tileIndex) {
  const geo = new THREE.BoxGeometry(TRACK_WIDTH, FLOOR_THICKNESS, FLOOR_TILE_LENGTH);
  const uv = geo.attributes.uv;
  const normal = geo.attributes.normal;
  const vLo = tileIndex / FLOOR_TILE_COUNT;
  const vHi = (tileIndex + 1) / FLOOR_TILE_COUNT;

  for (let i = 0; i < uv.count; i++) {
    if (normal.getY(i) > 0.5) {
      uv.setY(i, vLo + uv.getY(i) * (vHi - vLo));
    }
  }

  return geo;
}

function translateGeo(geo, x, y, z) {
  const g = geo.clone();
  g.translate(x, y, z);
  return g;
}

function buildSideDecorTileGeo(trimGeo, capGeo, wallX, trimX, localZ) {
  const parts = [
    translateGeo(trimGeo, trimX, 1.5, localZ),
    translateGeo(capGeo, wallX, 2.98, localZ),
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildRailsTileGeo(railGeo, localZ) {
  const parts = [
    translateGeo(railGeo, -TRACK_WIDTH / 2, 0.06, localZ),
    translateGeo(railGeo, TRACK_WIDTH / 2, 0.06, localZ),
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.poolSize = 14;
    this.pulseTime = 0;

    const wallTexture = createWallTexture();
    wallTexture.repeat.set(1, FLOOR_TILE_LENGTH / 10);

    const floorTexture = createFloorSegmentTexture();

    this.floorSideMat = new THREE.MeshLambertMaterial({
      color: 0x141020,
      emissive: 0x06040c,
      emissiveIntensity: 0.08,
      fog: true,
    });

    this.floorTopMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      color: 0xffffff,
      emissive: 0x443366,
      emissiveIntensity: 0.32,
      roughness: 0.52,
      metalness: 0.12,
      fog: true,
    });

    this.floorMats = [
      this.floorSideMat,
      this.floorSideMat,
      this.floorTopMat,
      this.floorSideMat,
      this.floorSideMat,
      this.floorSideMat,
    ];

    this.wallMat = new THREE.MeshStandardMaterial({
      map: wallTexture,
      color: 0xccccee,
      emissive: 0x1a1030,
      emissiveIntensity: 0.35,
      roughness: 0.65,
      metalness: 0.2,
      fog: true,
    });

    this.decorMat = new THREE.MeshBasicMaterial({
      color: 0x8866cc,
      transparent: true,
      opacity: 0.92,
      fog: true,
      depthWrite: false,
    });

    this.railMat = new THREE.MeshBasicMaterial({
      color: 0xaa66cc,
      transparent: true,
      opacity: 0.88,
      fog: true,
      depthWrite: false,
    });

    this.floorTileGeos = Array.from({ length: FLOOR_TILE_COUNT }, (_, i) =>
      createFloorTileBoxGeometry(i)
    );
    this.wallTileGeo = new THREE.BoxGeometry(0.45, 3, FLOOR_TILE_LENGTH);
    this.trimTileGeo = new THREE.BoxGeometry(0.07, 2.7, FLOOR_TILE_LENGTH);
    this.capTileGeo = new THREE.BoxGeometry(0.52, 0.14, FLOOR_TILE_LENGTH);
    this.railTileGeo = new THREE.BoxGeometry(0.1, 0.1, FLOOR_TILE_LENGTH);

    this.wallX = TRACK_WIDTH / 2 + 0.22;
    this.trimX = TRACK_WIDTH / 2 + 0.06;

    for (let i = 0; i < this.poolSize; i++) {
      this.segments.push(this.createSegment(-i * SEGMENT_LENGTH));
    }
  }

  createSegment(z) {
    const group = new THREE.Group();
    group.position.z = z;

    const trackTiles = [];

    for (let i = 0; i < FLOOR_TILE_COUNT; i++) {
      const localZ = tileLocalZ(i);
      const meshes = [];

      const floor = new THREE.Mesh(this.floorTileGeos[i], this.floorMats);
      floor.position.set(0, FLOOR_Y, localZ);
      floor.receiveShadow = true;
      group.add(floor);
      meshes.push(floor);

      const leftWall = new THREE.Mesh(this.wallTileGeo, this.wallMat);
      leftWall.position.set(-this.wallX, 1.5, localZ);
      group.add(leftWall);
      meshes.push(leftWall);

      const rightWall = new THREE.Mesh(this.wallTileGeo, this.wallMat);
      rightWall.position.set(this.wallX, 1.5, localZ);
      group.add(rightWall);
      meshes.push(rightWall);

      const leftDecor = new THREE.Mesh(
        buildSideDecorTileGeo(this.trimTileGeo, this.capTileGeo, -this.wallX, -this.trimX, localZ),
        this.decorMat
      );
      group.add(leftDecor);
      meshes.push(leftDecor);

      const rightDecor = new THREE.Mesh(
        buildSideDecorTileGeo(this.trimTileGeo, this.capTileGeo, this.wallX, this.trimX, localZ),
        this.decorMat
      );
      group.add(rightDecor);
      meshes.push(rightDecor);

      const rails = new THREE.Mesh(buildRailsTileGeo(this.railTileGeo, localZ), this.railMat);
      group.add(rails);
      meshes.push(rails);

      trackTiles.push({ localZ, meshes });
    }

    this.scene.add(group);
    return { group, z, trackTiles };
  }

  findSegmentNearest(worldZ) {
    let best = this.segments[0];
    for (const seg of this.segments) {
      if (Math.abs(worldZ - seg.z) < Math.abs(worldZ - best.z)) best = seg;
    }
    return best;
  }

  /** Solid floor edge (toward gap) just before gapStart — aligned to tile grid. */
  getFloorEdgeBeforeGap(gapStartZ, hintZ = gapStartZ) {
    const base = this.findSegmentNearest(hintZ).z - SEGMENT_HALF;
    return base + FLOOR_TILE_LENGTH * Math.floor((gapStartZ - base) / FLOOR_TILE_LENGTH);
  }

  /** Solid floor edge (toward gap) just after gapEnd — aligned to tile grid. */
  getFloorEdgeAfterGap(gapEndZ, hintZ = gapEndZ) {
    const base = this.findSegmentNearest(hintZ).z - SEGMENT_HALF;
    return base + FLOOR_TILE_LENGTH * Math.ceil((gapEndZ - base) / FLOOR_TILE_LENGTH);
  }

  tileIntersectsGap(gapManager, worldZ) {
    const half = FLOOR_TILE_HALF;
    return (
      gapManager.coversFloorAt(worldZ) ||
      gapManager.coversFloorAt(worldZ - half) ||
      gapManager.coversFloorAt(worldZ + half)
    );
  }

  updateGapMask(gapManager) {
    if (!gapManager) return;

    for (const seg of this.segments) {
      for (const tile of seg.trackTiles) {
        const worldZ = seg.z + tile.localZ;
        const visible = !this.tileIntersectsGap(gapManager, worldZ);
        for (const mesh of tile.meshes) {
          mesh.visible = visible;
        }
      }
    }
  }

  getRearZ(exclude = null) {
    let rear = Infinity;
    for (const seg of this.segments) {
      if (seg === exclude) continue;
      if (seg.z < rear) rear = seg.z;
    }
    return rear;
  }

  update(dt, speed) {
    this.pulseTime += dt;
    const pulse = 0.78 + Math.sin(this.pulseTime * 3.2) * 0.14;
    const railPulse = 0.72 + Math.sin(this.pulseTime * 4.1 + 1.2) * 0.16;
    const floorPulse = 0.3 + Math.sin(this.pulseTime * 2.6) * 0.06;
    this.decorMat.opacity = pulse;
    this.railMat.opacity = railPulse;
    this.floorTopMat.emissiveIntensity = floorPulse;

    const move = speed * dt;

    for (const seg of this.segments) {
      seg.group.position.z += move;
      seg.z = seg.group.position.z;
    }

    for (const seg of this.segments) {
      const backEdge = seg.z - SEGMENT_HALF;
      if (backEdge > RECYCLE_AFTER_Z) {
        const rearZ = this.getRearZ(seg);
        seg.group.position.z = rearZ - SEGMENT_LENGTH;
        seg.z = seg.group.position.z;
      }
    }
  }

  reset() {
    this.pulseTime = 0;
    this.floorTopMat.emissiveIntensity = 0.32;
    this.segments.forEach((seg, i) => {
      seg.group.position.z = -i * SEGMENT_LENGTH;
      seg.z = seg.group.position.z;
      for (const tile of seg.trackTiles) {
        for (const mesh of tile.meshes) {
          mesh.visible = true;
        }
      }
    });
  }
}

export {
  SEGMENT_LENGTH,
  SEGMENT_HALF,
  TRACK_WIDTH,
  RECYCLE_AFTER_Z,
  FLOOR_TILE_HALF,
  FLOOR_TILE_LENGTH,
  FLOOR_THICKNESS,
};
