import * as THREE from 'three';
import { GRAPHICS } from './graphicsProfile.js';
import { createSurfaceMaterial } from './surfaceMaterial.js';

const SEGMENT_LENGTH = 20;
const TRACK_WIDTH = 8;
const SEGMENT_HALF = SEGMENT_LENGTH / 2;
const FLOOR_TILE_COUNT = 10;
const FLOOR_TILE_LENGTH = SEGMENT_LENGTH / FLOOR_TILE_COUNT;
const FLOOR_TILE_HALF = FLOOR_TILE_LENGTH / 2;
const FLOOR_THICKNESS = 0.12;
const FLOOR_Y = -FLOOR_THICKNESS / 2;
const FLOOR_TOP_Y = FLOOR_THICKNESS / 2;
const CAMERA_Z = 8;
const RECYCLE_AFTER_Z = CAMERA_Z + SEGMENT_HALF + 8;
export const WALL_X = TRACK_WIDTH / 2 + 0.22;
export const WALL_TILE_WIDTH = 0.45;

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const TEMP_MATRIX = new THREE.Matrix4();
const MESH_PROXY_COUNT = 6;

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
  const tileV = canvas.height / FLOOR_TILE_COUNT;

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

  // Per-tile panel grid (matches 10 floor tiles per segment — zero extra GPU cost)
  for (let t = 0; t < FLOOR_TILE_COUNT; t++) {
    const y0 = t * tileV;
    const y1 = y0 + tileV;

    ctx.strokeStyle = 'rgba(100, 80, 160, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, y0 + 1, 254, tileV - 2);

    ctx.strokeStyle = 'rgba(160, 130, 230, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(128, y0 + 4);
    ctx.lineTo(128, y1 - 4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(8, y0 + tileV / 2);
    ctx.lineTo(248, y0 + tileV / 2);
    ctx.stroke();

    for (let gx = 32; gx < 256; gx += 32) {
      for (let gy = y0 + 8; gy < y1 - 4; gy += 10) {
        ctx.fillStyle = 'rgba(130, 100, 200, 0.12)';
        ctx.fillRect(gx, gy, 1, 1);
      }
    }

    ctx.fillStyle = 'rgba(180, 140, 255, 0.35)';
    ctx.fillRect(4, y0 + 3, 3, 3);
    ctx.fillRect(249, y0 + 3, 3, 3);
  }

  for (let x = 64; x < 256; x += 64) {
    ctx.strokeStyle = 'rgba(140, 120, 220, 0.22)';
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
    laneGrad.addColorStop(0.5, 'rgba(100, 180, 255, 0.28)');
    laneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = laneGrad;
    ctx.fillRect(lx - 10, 0, 20, 512);
  }

  ctx.strokeStyle = 'rgba(200, 160, 255, 0.32)';
  ctx.lineWidth = 2;
  for (const lx of [85, 171]) {
    ctx.setLineDash([10, 14]);
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
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function tileLocalZ(tileIndex) {
  return -SEGMENT_HALF + FLOOR_TILE_HALF + tileIndex * FLOOR_TILE_LENGTH;
}

function createFloorTopGeometry(tileIndex) {
  const geo = new THREE.PlaneGeometry(TRACK_WIDTH, FLOOR_TILE_LENGTH);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  const vLo = tileIndex / FLOOR_TILE_COUNT;
  const vHi = (tileIndex + 1) / FLOOR_TILE_COUNT;

  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, vLo + uv.getY(i) * (vHi - vLo));
  }

  return geo;
}

function createTileMeshProxies(tile) {
  return Array.from({ length: MESH_PROXY_COUNT }, () => ({
    get visible() {
      return tile.visible;
    },
    set visible(value) {
      tile.visible = value;
    },
  }));
}

function setTranslationMatrix(x, y, z) {
  TEMP_MATRIX.makeTranslation(x, y, z);
  return TEMP_MATRIX;
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

    this.floorTopMat = GRAPHICS.useLambert
      ? new THREE.MeshBasicMaterial({
          map: floorTexture,
          color: 0xddddee,
          fog: true,
          side: THREE.DoubleSide,
        })
      : createSurfaceMaterial({
          map: floorTexture,
          color: 0xffffff,
          emissive: 0x332255,
          emissiveIntensity: 0.25,
          roughness: 0.52,
          metalness: 0.12,
          fog: true,
          side: THREE.DoubleSide,
        });

    this.wallMat = createSurfaceMaterial({
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

    this.wallTileGeo = new THREE.BoxGeometry(0.45, 3, FLOOR_TILE_LENGTH);
    this.floorBodyGeo = new THREE.BoxGeometry(TRACK_WIDTH, FLOOR_THICKNESS, FLOOR_TILE_LENGTH);
    this.trimTileGeo = new THREE.BoxGeometry(0.07, 2.7, FLOOR_TILE_LENGTH);
    this.capTileGeo = new THREE.BoxGeometry(0.52, 0.14, FLOOR_TILE_LENGTH);
    this.railTileGeo = new THREE.BoxGeometry(0.1, 0.1, FLOOR_TILE_LENGTH);

    this.wallX = TRACK_WIDTH / 2 + 0.22;
    this.trimX = TRACK_WIDTH / 2 + 0.06;

    this.maxTileSlots = this.poolSize * FLOOR_TILE_COUNT;
    this._initInstancedMeshes();
    this._instanceLayersDirty = true;

    for (let i = 0; i < this.poolSize; i++) {
      this.segments.push(this.createSegment(-i * SEGMENT_LENGTH));
    }

    this.syncAllInstanceMatrices();
  }

  _initInstancedMeshes() {
    const dynamic = THREE.DynamicDrawUsage;

    this.floorTopLayers = Array.from({ length: FLOOR_TILE_COUNT }, (_, tileIndex) => {
      const mesh = new THREE.InstancedMesh(
        createFloorTopGeometry(tileIndex),
        this.floorTopMat,
        this.poolSize
      );
      mesh.instanceMatrix.setUsage(dynamic);
      mesh.receiveShadow = GRAPHICS.shadows;
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      return mesh;
    });

    this.floorBodyMesh = new THREE.InstancedMesh(
      this.floorBodyGeo,
      this.floorSideMat,
      this.maxTileSlots
    );
    this.floorBodyMesh.instanceMatrix.setUsage(dynamic);
    this.floorBodyMesh.receiveShadow = GRAPHICS.shadows;
    this.floorBodyMesh.frustumCulled = false;
    this.scene.add(this.floorBodyMesh);

    this.wallLeftMesh = new THREE.InstancedMesh(this.wallTileGeo, this.wallMat, this.maxTileSlots);
    this.wallLeftMesh.instanceMatrix.setUsage(dynamic);
    this.wallLeftMesh.frustumCulled = false;
    this.scene.add(this.wallLeftMesh);

    this.wallRightMesh = new THREE.InstancedMesh(this.wallTileGeo, this.wallMat, this.maxTileSlots);
    this.wallRightMesh.instanceMatrix.setUsage(dynamic);
    this.wallRightMesh.frustumCulled = false;
    this.scene.add(this.wallRightMesh);

    this.decorTrimLeftMesh = new THREE.InstancedMesh(
      this.trimTileGeo,
      this.decorMat,
      this.maxTileSlots
    );
    this.decorTrimLeftMesh.instanceMatrix.setUsage(dynamic);
    this.decorTrimLeftMesh.frustumCulled = false;
    this.scene.add(this.decorTrimLeftMesh);

    this.decorCapLeftMesh = new THREE.InstancedMesh(
      this.capTileGeo,
      this.decorMat,
      this.maxTileSlots
    );
    this.decorCapLeftMesh.instanceMatrix.setUsage(dynamic);
    this.decorCapLeftMesh.frustumCulled = false;
    this.scene.add(this.decorCapLeftMesh);

    this.decorTrimRightMesh = new THREE.InstancedMesh(
      this.trimTileGeo,
      this.decorMat,
      this.maxTileSlots
    );
    this.decorTrimRightMesh.instanceMatrix.setUsage(dynamic);
    this.decorTrimRightMesh.frustumCulled = false;
    this.scene.add(this.decorTrimRightMesh);

    this.decorCapRightMesh = new THREE.InstancedMesh(
      this.capTileGeo,
      this.decorMat,
      this.maxTileSlots
    );
    this.decorCapRightMesh.instanceMatrix.setUsage(dynamic);
    this.decorCapRightMesh.frustumCulled = false;
    this.scene.add(this.decorCapRightMesh);

    this.railLeftMesh = new THREE.InstancedMesh(this.railTileGeo, this.railMat, this.maxTileSlots);
    this.railLeftMesh.instanceMatrix.setUsage(dynamic);
    this.railLeftMesh.frustumCulled = false;
    this.scene.add(this.railLeftMesh);

    this.railRightMesh = new THREE.InstancedMesh(this.railTileGeo, this.railMat, this.maxTileSlots);
    this.railRightMesh.instanceMatrix.setUsage(dynamic);
    this.railRightMesh.frustumCulled = false;
    this.scene.add(this.railRightMesh);
  }

  createSegment(z) {
    const segIndex = this.segments.length;
    const trackTiles = [];

    for (let tileIndex = 0; tileIndex < FLOOR_TILE_COUNT; tileIndex++) {
      const localZ = tileLocalZ(tileIndex);
      const tile = {
        localZ,
        slot: segIndex * FLOOR_TILE_COUNT + tileIndex,
        visible: true,
        meshes: [],
      };
      tile.meshes = createTileMeshProxies(tile);
      trackTiles.push(tile);
    }

    return { z, trackTiles };
  }

  syncAllInstanceMatrices() {
    for (let slot = 0; slot < this.maxTileSlots; slot++) {
      this.syncInstanceMatrixForSlot(slot);
    }
    this._markInstanceLayersDirty();
  }

  syncInstanceMatrixForSlot(slot) {
    const segIndex = Math.floor(slot / FLOOR_TILE_COUNT);
    const tileIndex = slot % FLOOR_TILE_COUNT;
    const segment = this.segments[segIndex];
    if (!segment) return;

    const tile = segment.trackTiles[tileIndex];
    const worldZ = segment.z + tile.localZ;
    const hidden = HIDDEN_MATRIX;
    const visible = tile.visible;

    this.floorTopLayers[tileIndex].setMatrixAt(
      segIndex,
      visible ? setTranslationMatrix(0, FLOOR_TOP_Y + 0.002, worldZ) : hidden
    );

    this.floorBodyMesh.setMatrixAt(
      slot,
      visible ? setTranslationMatrix(0, FLOOR_Y, worldZ) : hidden
    );

    this.wallLeftMesh.setMatrixAt(
      slot,
      visible ? setTranslationMatrix(-this.wallX, 1.5, worldZ) : hidden
    );

    this.wallRightMesh.setMatrixAt(
      slot,
      visible ? setTranslationMatrix(this.wallX, 1.5, worldZ) : hidden
    );

    this.decorTrimLeftMesh.setMatrixAt(
      slot,
      visible ? setTranslationMatrix(-this.trimX, 1.5, worldZ) : hidden
    );
    this.decorCapLeftMesh.setMatrixAt(
      slot,
      visible ? setTranslationMatrix(-this.wallX, 2.98, worldZ) : hidden
    );
    this.decorTrimRightMesh.setMatrixAt(
      slot,
      visible ? setTranslationMatrix(this.trimX, 1.5, worldZ) : hidden
    );
    this.decorCapRightMesh.setMatrixAt(
      slot,
      visible ? setTranslationMatrix(this.wallX, 2.98, worldZ) : hidden
    );
    this.railLeftMesh.setMatrixAt(
      slot,
      visible ? setTranslationMatrix(-TRACK_WIDTH / 2, 0.06, worldZ) : hidden
    );
    this.railRightMesh.setMatrixAt(
      slot,
      visible ? setTranslationMatrix(TRACK_WIDTH / 2, 0.06, worldZ) : hidden
    );
  }

  _markInstanceLayersDirty() {
    for (const mesh of this.floorTopLayers) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.floorBodyMesh.instanceMatrix.needsUpdate = true;
    this.wallLeftMesh.instanceMatrix.needsUpdate = true;
    this.wallRightMesh.instanceMatrix.needsUpdate = true;
    this.decorTrimLeftMesh.instanceMatrix.needsUpdate = true;
    this.decorCapLeftMesh.instanceMatrix.needsUpdate = true;
    this.decorTrimRightMesh.instanceMatrix.needsUpdate = true;
    this.decorCapRightMesh.instanceMatrix.needsUpdate = true;
    this.railLeftMesh.instanceMatrix.needsUpdate = true;
    this.railRightMesh.instanceMatrix.needsUpdate = true;
  }

  findSegmentNearest(worldZ) {
    let best = this.segments[0];
    for (const seg of this.segments) {
      if (Math.abs(worldZ - seg.z) < Math.abs(worldZ - best.z)) best = seg;
    }
    return best;
  }

  getFloorEdgeBeforeGap(gapStartZ, hintZ = gapStartZ) {
    const base = this.findSegmentNearest(hintZ).z - SEGMENT_HALF;
    return base + FLOOR_TILE_LENGTH * Math.floor((gapStartZ - base) / FLOOR_TILE_LENGTH);
  }

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
        tile.visible = visible;
        for (const mesh of tile.meshes) {
          mesh.visible = visible;
        }
        this.syncInstanceMatrixForSlot(tile.slot);
      }
    }

    this._markInstanceLayersDirty();
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
    const floorPulse = 0.88 + Math.sin(this.pulseTime * 2.6) * 0.06;
    this.decorMat.opacity = pulse;
    this.railMat.opacity = railPulse;
    if (this.floorTopMat.emissiveIntensity !== undefined) {
      this.floorTopMat.emissiveIntensity = floorPulse * 0.28;
    } else {
      this.floorTopMat.color.setScalar(floorPulse);
    }

    const move = speed * dt;

    for (const seg of this.segments) {
      seg.z += move;
    }

    for (const seg of this.segments) {
      const backEdge = seg.z - SEGMENT_HALF;
      if (backEdge > RECYCLE_AFTER_Z) {
        const rearZ = this.getRearZ(seg);
        seg.z = rearZ - SEGMENT_LENGTH;
      }
    }

    this.syncAllInstanceMatrices();
  }

  reset() {
    this.pulseTime = 0;
    if (this.floorTopMat.emissiveIntensity !== undefined) {
      this.floorTopMat.emissiveIntensity = 0.25;
    } else {
      this.floorTopMat.color.setScalar(0.92);
    }
    this.segments.forEach((seg, i) => {
      seg.z = -i * SEGMENT_LENGTH;
      for (const tile of seg.trackTiles) {
        tile.visible = true;
        for (const mesh of tile.meshes) {
          mesh.visible = true;
        }
      }
    });
    this.syncAllInstanceMatrices();
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
  FLOOR_TOP_Y,
};
