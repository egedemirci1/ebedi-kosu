import * as THREE from 'three';
import { LANES } from './scene.js';

const SEGMENT_LENGTH = 20;
const TRACK_WIDTH = 8;
const SEGMENT_HALF = SEGMENT_LENGTH / 2;
const CAMERA_Z = 8;
const RECYCLE_AFTER_Z = CAMERA_Z + SEGMENT_HALF + 8;

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.poolSize = 10;

    this.floorMat = new THREE.MeshStandardMaterial({
      color: 0x151520,
      roughness: 0.85,
      metalness: 0.1,
      fog: false,
    });

    this.wallMat = new THREE.MeshStandardMaterial({
      color: 0x0e0e18,
      roughness: 0.9,
      fog: false,
    });

    this.lineMat = new THREE.MeshBasicMaterial({ color: 0x334466, fog: false });

    for (let i = 0; i < this.poolSize; i++) {
      this.segments.push(this.createSegment(-i * SEGMENT_LENGTH));
    }
  }

  createSegment(z) {
    const group = new THREE.Group();
    group.position.z = z;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_WIDTH, 0.3, SEGMENT_LENGTH),
      this.floorMat
    );
    floor.position.y = -0.15;
    floor.receiveShadow = true;
    group.add(floor);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 3, SEGMENT_LENGTH),
        this.wallMat
      );
      wall.position.set(side * (TRACK_WIDTH / 2 + 0.2), 1.5, 0);
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, SEGMENT_LENGTH),
        new THREE.MeshStandardMaterial({
          color: 0x442244,
          emissive: 0x220011,
          emissiveIntensity: 0.5,
          fog: false,
        })
      );
      rail.position.set(side * (TRACK_WIDTH / 2), 0.05, 0);
      group.add(rail);
    }

    for (const lane of LANES) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.02, SEGMENT_LENGTH),
        this.lineMat
      );
      line.position.set(lane, 0.01, 0);
      group.add(line);
    }

    this.scene.add(group);
    return { group, z };
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
    this.segments.forEach((seg, i) => {
      seg.group.position.z = -i * SEGMENT_LENGTH;
      seg.z = seg.group.position.z;
    });
  }
}

export { SEGMENT_LENGTH, TRACK_WIDTH, RECYCLE_AFTER_Z };
