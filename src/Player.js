import * as THREE from 'three';
import { LANES } from './scene.js';

const WALL_BUMP_AMOUNT = 1.15;
const WALL_BUMP_DURATION = 0.5;

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.laneIndex = 1;
    this.targetX = LANES[1];
    this.x = LANES[1];
    this.y = 0;
    this.vy = 0;
    this.isJumping = false;
    this.isStumbling = false;
    this.onGround = true;
    this.isFalling = false;
    this.stumbleTimer = 0;
    this.stumbleSide = 0;
    this.wallBounceTimer = 0;
    this.wallBounceSide = 0;
    this.wallBounceHomeX = 0;
    this.runPhase = 0;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x44aaff,
      emissive: 0x114466,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.2,
      fog: false,
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 8), bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;
    this.group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 8),
      bodyMat.clone()
    );
    head.position.y = 1.75;
    head.castShadow = true;
    this.group.add(head);

    const glow = new THREE.PointLight(0x44ccff, 0.6, 6);
    glow.position.y = 1.2;
    this.group.add(glow);

    this.body = body;
    this.head = head;
    scene.add(this.group);
  }

  moveLeft() {
    if (this.laneIndex > 0) {
      this.laneIndex--;
      this.targetX = LANES[this.laneIndex];
      return 'moved';
    }
    return 'wall';
  }

  moveRight() {
    if (this.laneIndex < 2) {
      this.laneIndex++;
      this.targetX = LANES[this.laneIndex];
      return 'moved';
    }
    return 'wall';
  }

  jump() {
    if (!this.onGround) return false;
    this.onGround = false;
    this.isJumping = true;
    this.vy = 9.5;
    return true;
  }

  stumble(duration = 0.6, side = 0) {
    this.isStumbling = true;
    this.stumbleTimer = duration;
    this.stumbleSide = side;

    if (side !== 0) {
      this.wallBounceTimer = WALL_BUMP_DURATION;
      this.wallBounceSide = side;
      this.wallBounceHomeX = LANES[this.laneIndex];
      this.targetX = this.wallBounceHomeX;
    }
  }

  resetVisuals() {
    this.body.position.x = 0;
    this.head.position.x = 0;
    this.body.rotation.z = 0;
    this.body.position.y = 1.05;
    this.head.position.y = 1.75;
  }

  get lane() {
    return this.laneIndex;
  }

  get position() {
    return { x: this.x, y: this.y, z: 0 };
  }

  get hitbox() {
    return {
      x: this.x,
      y: this.y + 0.9,
      z: 0,
      radius: 0.45,
      height: 1.6,
    };
  }

  update(dt, hasFloor = true) {
    if (this.wallBounceTimer > 0) {
      this.wallBounceTimer -= dt;
      const t = 1 - Math.max(0, this.wallBounceTimer) / WALL_BUMP_DURATION;
      const push = Math.sin(t * Math.PI) * WALL_BUMP_AMOUNT;
      this.x = this.wallBounceHomeX + this.wallBounceSide * push;
      this.targetX = this.wallBounceHomeX;
    } else {
      this.x += (this.targetX - this.x) * Math.min(1, dt * 14);
    }

    if (!hasFloor && this.onGround && this.y <= 0.01 && this.vy <= 0.01) {
      this.isFalling = true;
    }

    if (this.onGround && hasFloor && !this.isFalling) {
      this.y = 0;
      this.vy = 0;
      this.isJumping = false;
    } else {
      this.onGround = false;
      this.vy -= 24 * dt;
      this.y += this.vy * dt;

      if (!hasFloor && this.y <= 0 && this.vy <= 0) {
        this.isFalling = true;
      }

      if (hasFloor && this.y <= 0 && this.vy <= 0 && !this.isFalling) {
        this.y = 0;
        this.vy = 0;
        this.isJumping = false;
        this.onGround = true;
      }
    }

    if (this.isStumbling) {
      this.stumbleTimer -= dt;
      if (this.stumbleTimer <= 0) {
        this.isStumbling = false;
        this.stumbleSide = 0;
      }
    }

    const wallPush =
      this.wallBounceTimer > 0
        ? Math.sin((1 - this.wallBounceTimer / WALL_BUMP_DURATION) * Math.PI) * WALL_BUMP_AMOUNT
        : 0;

    this.runPhase += dt * (this.isStumbling ? 4 : 12);
    const bob = Math.sin(this.runPhase) * (this.isStumbling ? 0.02 : 0.08);
    this.body.position.y = 1.05 + bob + (this.isStumbling ? -0.15 : 0);
    this.head.position.y = 1.75 + bob + (this.isStumbling ? -0.15 : 0);
    this.body.position.x = this.wallBounceSide * wallPush * 0.12;
    this.head.position.x = this.wallBounceSide * wallPush * 0.08;

    if (this.isStumbling) {
      const wobble = Math.sin(this.runPhase * 2) * 0.1;
      this.body.rotation.z =
        this.stumbleSide !== 0
          ? this.stumbleSide * 0.28 + wobble
          : wobble + Math.sin(this.runPhase * 2) * 0.05;
    } else {
      this.body.rotation.z *= 0.85;
      this.body.position.x *= 0.85;
      this.head.position.x *= 0.85;
    }

    this.group.position.set(this.x, this.y, 0);
  }
}
