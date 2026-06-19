import * as THREE from 'three';
import { LANES } from './scene.js';
import { GRAPHICS } from './graphicsProfile.js';
import { createSurfaceMaterial } from './surfaceMaterial.js';

const WALL_BUMP_AMOUNT = 1.15;
const WALL_BUMP_DURATION = 0.5;
const GRAVITY = 24;
const VOID_GRAVITY = 48;
const VOID_DROP_SPEED = 6;
const JUMP_VY = 9.5;
const SUPER_JUMP_VY = 13.8;
const FAST_FALL_SPEED = 20;
export const SLIDE_DURATION = 0.8;
const STAND_BODY_Y = 1.05;
const STAND_HEAD_Y = 1.75;
const SLIDE_BODY_Y = 0.42;
const SLIDE_HEAD_Y = 0.58;
const SLIDE_BODY_ROT_X = 1.35;
const TRAIL_COUNT = 3;
const TRAIL_SPACING = 0.35;
const TRAIL_STAND_Y = 0.32;
const TRAIL_SLIDE_Y = 0.14;

export class Player {
  constructor(scene) {
    this.scene = scene;
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
    this.trailSpawnTimer = 0;
    this.isGhostVisual = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideBlend = 0;

    const bodyMat = createSurfaceMaterial({
      color: 0x44aaff,
      emissive: 0x114466,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.2,
      fog: true,
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 8), bodyMat);
    body.position.y = 1.05;
    body.castShadow = GRAPHICS.shadows;
    this.group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 8),
      bodyMat.clone()
    );
    head.position.y = 1.75;
    head.castShadow = GRAPHICS.shadows;
    this.group.add(head);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0x44ccff,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        fog: true,
      })
    );
    glow.position.y = 1.2;
    glow.visible = false;
    this.group.add(glow);

    this.body = body;
    this.head = head;
    this.glow = glow;
    this.bodyMat = bodyMat;
    this.headMat = head.material;

    this.trails = [];
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.24 - i * 0.04, 6, 6),
        new THREE.MeshBasicMaterial({
          color: 0x44ccff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          fog: true,
        })
      );
      scene.add(mesh);
      this.trails.push({
        mesh,
        life: 0,
        maxLife: 0.28 + i * 0.06,
        x: this.x,
        y: TRAIL_STAND_Y,
        z: (i + 1) * TRAIL_SPACING,
      });
    }

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

  jump(superJump = false) {
    if (!this.onGround) return false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.onGround = false;
    this.isJumping = true;
    this.vy = superJump ? SUPER_JUMP_VY : JUMP_VY;
    return true;
  }

  canSlide() {
    return (
      this.onGround &&
      !this.isFalling &&
      !this.isStumbling &&
      !this.isJumping &&
      this.wallBounceTimer <= 0
    );
  }

  startSlide(duration = SLIDE_DURATION) {
    if (!this.canSlide()) return false;
    this.isSliding = true;
    this.slideTimer = duration;
    return true;
  }

  fastFall() {
    if (!this.onGround && !this.isFalling) {
      this.vy = Math.min(this.vy, -FAST_FALL_SPEED);
    }
  }

  setGhostVisual(active) {
    if (this.isGhostVisual === active) return;
    this.isGhostVisual = active;

    if (active) {
      this.bodyMat.transparent = true;
      this.headMat.transparent = true;
      this.bodyMat.opacity = 0.55;
      this.headMat.opacity = 0.55;
      this.glow.material.color.setHex(0xaaeeff);
      this.glow.material.opacity = 0.65;
    } else {
      this.bodyMat.opacity = 1;
      this.headMat.opacity = 1;
      this.bodyMat.transparent = false;
      this.headMat.transparent = false;
      this.glow.material.color.setHex(0x44ccff);
      this.glow.material.opacity = 0.65;
    }
    this.syncGlowVisibility();
  }

  syncGlowVisibility() {
    this.glow.visible =
      this.isGhostVisual &&
      !this.isStumbling &&
      this.wallBounceTimer <= 0 &&
      this.slideBlend < 0.92;
  }

  trailFeetY(slideBlend = 0) {
    const base = THREE.MathUtils.lerp(TRAIL_STAND_Y, TRAIL_SLIDE_Y, slideBlend);
    return this.y + base + Math.sin(this.runPhase) * 0.05;
  }

  stumble(duration = 0.6, side = 0) {
    this.isSliding = false;
    this.slideTimer = 0;
    this.isStumbling = true;
    this.stumbleTimer = duration;
    this.stumbleSide = side;
    this.resetTrails();
    this.glow.visible = false;

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
    this.head.position.z = 0;
    this.body.rotation.x = 0;
    this.head.rotation.x = 0;
    this.body.rotation.z = 0;
    this.body.scale.set(1, 1, 1);
    this.body.position.y = STAND_BODY_Y;
    this.head.position.y = STAND_HEAD_Y;
    this.glow.position.y = 1.2;
    this.glow.position.z = 0;
    this.glow.scale.set(1, 1, 1);
    this.glow.visible = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideBlend = 0;
    this.setGhostVisual(false);
    this.resetTrails();
  }

  resetTrails() {
    for (const trail of this.trails) {
      trail.life = 0;
      trail.mesh.material.opacity = 0;
      trail.mesh.visible = false;
    }
    this.trailSpawnTimer = 0;
  }

  updateTrails(dt) {
    const running = this.onGround && !this.isFalling && !this.isStumbling && !this.isSliding;

    if (this.isStumbling || this.wallBounceTimer > 0) {
      for (const trail of this.trails) {
        trail.life = 0;
        trail.mesh.material.opacity = 0;
        trail.mesh.visible = false;
      }
      return;
    }

    if (running) {
      this.trailSpawnTimer += dt;
      if (this.trailSpawnTimer >= 0.045) {
        this.trailSpawnTimer = 0;
        const slot = this.trails.reduce(
          (oldest, t, i, arr) => (t.life / t.maxLife < arr[oldest].life / arr[oldest].maxLife ? i : oldest),
          0
        );
        const trail = this.trails[slot];
        trail.life = trail.maxLife;
        trail.x = this.x;
        trail.y = this.trailFeetY(this.slideBlend);
        trail.z = TRAIL_SPACING * 0.5;
        trail.mesh.visible = true;
      }
    }

    for (const trail of this.trails) {
      if (trail.life <= 0) {
        trail.mesh.material.opacity = 0;
        trail.mesh.visible = false;
        continue;
      }

      trail.life -= dt;
      trail.z += dt * 9;
      const t = Math.max(0, trail.life / trail.maxLife);
      trail.mesh.position.set(trail.x, trail.y, trail.z);
      trail.mesh.material.opacity = t * 0.38;
      const puff = 0.55 + t * 0.45;
      trail.mesh.scale.set(puff, puff * 0.52, puff);

      if (trail.life <= 0) {
        trail.mesh.visible = false;
      }
    }
  }

  get isSlideActive() {
    return this.isSliding || this.slideBlend > 0.45;
  }

  get lane() {
    return this.laneIndex;
  }

  get position() {
    return { x: this.x, y: this.y, z: 0 };
  }

  get hitbox() {
    if (this.isSliding || this.slideBlend > 0.35) {
      return {
        x: this.x,
        y: this.y + 0.35,
        z: 0,
        radius: 0.42,
        height: 0.62,
      };
    }

    return {
      x: this.x,
      y: this.y + 0.9,
      z: 0,
      radius: 0.45,
      height: 1.6,
    };
  }

  updateSlideState(dt, wantsDown, hasFloor) {
    if (this.slideTimer > 0) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.slideTimer = 0;
    }

    const canGroundSlide = this.canSlide() && hasFloor;

    if (wantsDown && canGroundSlide) {
      this.isSliding = true;
    } else if (this.slideTimer <= 0) {
      this.isSliding = false;
    }

    if (!hasFloor || this.isFalling || this.isStumbling) {
      this.isSliding = false;
      this.slideTimer = 0;
    }
  }

  update(dt, hasFloor = true, wantsDown = false) {
    if (this.wallBounceTimer > 0) {
      this.wallBounceTimer -= dt;
      const t = 1 - Math.max(0, this.wallBounceTimer) / WALL_BUMP_DURATION;
      const push = Math.sin(t * Math.PI) * WALL_BUMP_AMOUNT;
      this.x = this.wallBounceHomeX + this.wallBounceSide * push;
      this.targetX = this.wallBounceHomeX;
    } else {
      this.x += (this.targetX - this.x) * Math.min(1, dt * 14);
    }

    if (!hasFloor && this.onGround && !this.isJumping) {
      this.isFalling = true;
      this.onGround = false;
      this.vy = -VOID_DROP_SPEED;
    }

    if (this.onGround && hasFloor && !this.isFalling) {
      this.y = 0;
      this.vy = 0;
      this.isJumping = false;
      this.updateSlideState(dt, wantsDown, hasFloor);
    } else {
      this.onGround = false;
      this.isSliding = false;
      this.slideTimer = 0;
      const gravity = this.isFalling ? VOID_GRAVITY : GRAVITY;
      this.vy -= gravity * dt;

      if (wantsDown && !this.isFalling) {
        this.vy = Math.min(this.vy, -FAST_FALL_SPEED);
      }

      this.y += this.vy * dt;

      if (!hasFloor && this.y <= 0 && this.vy <= 0 && !this.isFalling) {
        this.isFalling = true;
        if (this.vy > -VOID_DROP_SPEED) this.vy = -VOID_DROP_SPEED;
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

    this.runPhase += dt * (this.isStumbling ? 4 : this.isSliding ? 16 : 12);
    const bob = this.isSliding ? 0 : Math.sin(this.runPhase) * (this.isStumbling ? 0.02 : 0.08);
    const fallTuck = this.isFalling ? Math.min(0.55, Math.max(0, -this.y * 0.25)) : 0;

    const targetSlide = this.isSliding ? 1 : 0;
    this.slideBlend += (targetSlide - this.slideBlend) * Math.min(1, dt * 16);
    const s = this.slideBlend;

    const bodyY = THREE.MathUtils.lerp(STAND_BODY_Y, SLIDE_BODY_Y, s) + bob + (this.isStumbling ? -0.15 : 0) - fallTuck;
    const headY = THREE.MathUtils.lerp(STAND_HEAD_Y, SLIDE_HEAD_Y, s) + bob + (this.isStumbling ? -0.15 : 0) - fallTuck * 1.1;
    this.body.position.y = bodyY;
    this.head.position.y = headY;
    this.head.position.z = THREE.MathUtils.lerp(0, 0.28, s);
    this.body.position.x = this.wallBounceSide * wallPush * 0.12;
    this.head.position.x = this.wallBounceSide * wallPush * 0.08;
    this.body.scale.set(
      THREE.MathUtils.lerp(1, 1.08, s),
      THREE.MathUtils.lerp(1, 0.72, s),
      THREE.MathUtils.lerp(1, 1.18, s)
    );

    if (this.isGhostVisual) {
      this.glow.position.y = THREE.MathUtils.lerp(1.2, bodyY + 0.08, s);
      this.glow.position.z = THREE.MathUtils.lerp(0, 0.12, s);
      this.glow.scale.setScalar(THREE.MathUtils.lerp(1, 0.4, s));
      this.glow.material.opacity = 0.65 * (1 - s);
    }
    this.syncGlowVisibility();

    if (this.isStumbling) {
      const wobble = Math.sin(this.runPhase * 2) * 0.1;
      this.body.rotation.z =
        this.stumbleSide !== 0
          ? this.stumbleSide * 0.28 + wobble
          : wobble + Math.sin(this.runPhase * 2) * 0.05;
    } else if (this.isFalling) {
      this.body.rotation.z *= 0.85;
      this.body.rotation.x = Math.min(0.55, this.body.rotation.x + dt * 3);
      this.head.rotation.x = this.body.rotation.x * 0.6;
      this.body.position.x *= 0.85;
      this.head.position.x *= 0.85;
    } else {
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, SLIDE_BODY_ROT_X * s, Math.min(1, dt * 14));
      this.head.rotation.x = this.body.rotation.x * 0.35;
      this.body.rotation.z *= 0.85;
      this.body.position.x *= 0.85;
      this.head.position.x *= 0.85;
    }

    this.group.position.set(this.x, this.y, -s * 0.22);
    this.updateTrails(dt);
  }
}
