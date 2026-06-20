import * as THREE from 'three';
import { createSurfaceMaterial } from './surfaceMaterial.js';

/** Mesh visibility tracks bar fill — noticeable from ~40% danger. */
const VISIBILITY_START = 0.35;
const VISIBILITY_FULL = 0.75;
/** Clean-run pressure decay (per second). */
const PRESSURE_DECAY_RATE = 0.06;

export class Creature {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    this.farDistance = 11;
    this.chaseDistance = 11;
    this.targetDistance = 11;
    this.minDistance = 1.8;
    this.lungeTimer = 0;
    this.animTime = 0;
    this.pressure = 0;
    this.fadeMats = [];
    this.eyeMats = [];

    const bodyMat = createSurfaceMaterial({
      color: 0x1a0818,
      emissive: 0x220011,
      emissiveIntensity: 0.6,
      roughness: 0.9,
      fog: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.registerFadeMat(bodyMat);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.8, 4, 8), bodyMat);
    torso.position.y = 2.2;
    this.group.add(torso);

    const headMat = bodyMat.clone();
    this.registerFadeMat(headMat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), headMat);
    head.position.y = 3.5;
    head.scale.set(1.1, 1, 0.9);
    this.group.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xff1133,
      fog: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.eyeMats.push(eyeMat);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), eyeMat);
      eye.position.set(side * 0.22, 3.55, 0.42);
      this.group.add(eye);
    }

    for (let i = 0; i < 4; i++) {
      const tentacleMat = bodyMat.clone();
      this.registerFadeMat(tentacleMat);
      const tentacle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.02, 1.2, 4),
        tentacleMat
      );
      tentacle.position.set(
        Math.sin(i * 1.5) * 0.5,
        1.5,
        Math.cos(i * 1.5) * 0.3
      );
      tentacle.rotation.x = 0.4 + i * 0.2;
      tentacle.rotation.z = (i - 1.5) * 0.3;
      this.group.add(tentacle);
      tentacle.userData.phase = i;
      tentacle.userData.isTentacle = true;
    }

    this.torso = torso;
    this.head = head;
    scene.add(this.group);
    this.group.position.set(0, 0, this.chaseDistance);
    this.updateVisibility();
  }

  registerFadeMat(mat) {
    mat.transparent = true;
    mat.opacity = 0;
    mat.depthWrite = false;
    this.fadeMats.push(mat);
  }

  get distance() {
    return this.chaseDistance;
  }

  get dangerLevel() {
    return this.pressure;
  }

  chaseDistanceForDanger(fraction) {
    const range = this.farDistance - this.minDistance;
    return this.minDistance + range * (1 - Math.max(0, Math.min(1, fraction)));
  }

  visibilityForPressure(pressure = this.pressure) {
    if (pressure <= VISIBILITY_START) return 0;
    const t = Math.min(1, (pressure - VISIBILITY_START) / (VISIBILITY_FULL - VISIBILITY_START));
    return t * t * (3 - 2 * t);
  }

  updateVisibility() {
    const opacity = this.visibilityForPressure();
    this.group.visible = opacity > 0.02;

    for (const mat of this.fadeMats) {
      mat.opacity = opacity * 0.94;
      mat.depthWrite = opacity > 0.88;
    }

    const eyeOpacity =
      opacity <= 0 ? 0 : Math.min(1, 0.25 + (opacity - 0.08) * 1.15);
    for (const mat of this.eyeMats) {
      mat.opacity = eyeOpacity;
    }
  }

  addHitPressure(amount) {
    this.pressure = Math.min(1, this.pressure + amount);
    if (this.pressure >= 1) {
      this.forceCatch();
      return;
    }
    this.applyHitDanger(this.pressure);
  }

  /**
   * Çarpma anında canavarı bar seviyesine yaklaştırır; temiz koşuda geri açılır.
   * @param {number} fraction 0–1 arası tehlike
   */
  applyHitDanger(fraction) {
    this.pressure = Math.max(this.pressure, Math.min(1, fraction));
    this.targetDistance = this.chaseDistanceForDanger(this.pressure);
    this.chaseDistance = this.targetDistance;
    this.lungeTimer = 0.55;
    this.syncGroupZ();
    this.updateVisibility();
  }

  /** Tehlike %100 — yakalama mesafesine kilitler. */
  forceCatch() {
    this.pressure = 1;
    this.chaseDistance = this.minDistance;
    this.targetDistance = this.minDistance;
    this.lungeTimer = 0;
    this.syncGroupZ();
    this.updateVisibility();
  }

  lunge(amount = 2.5) {
    this.chaseDistance = Math.max(this.minDistance, this.chaseDistance - amount * 0.55);
    this.targetDistance = Math.max(this.minDistance, this.chaseDistance - amount * 0.25);
    this.lungeTimer = 0.85;
  }

  syncGroupZ() {
    this.group.position.z = this.chaseDistance;
  }

  update(dt, playerX, playerStumbling) {
    this.animTime += dt;

    const catchUpRate =
      this.lungeTimer > 0 ? 10 : playerStumbling ? 6 : 2.2;

    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
    }

    if (!playerStumbling && this.lungeTimer <= 0) {
      this.pressure = Math.max(0, this.pressure - dt * PRESSURE_DECAY_RATE);
    }

    this.targetDistance = this.chaseDistanceForDanger(this.pressure);
    const blend = Math.min(1, catchUpRate * dt);
    this.chaseDistance += (this.targetDistance - this.chaseDistance) * blend;

    const t = this.animTime;
    const sway = Math.sin(t * 4) * 0.3;
    this.group.position.set(
      playerX * 0.3 + sway,
      Math.sin(t * 6) * 0.1,
      this.chaseDistance
    );

    this.torso.rotation.x = Math.sin(t * 5) * 0.08;
    this.head.rotation.y = Math.sin(t * 3) * 0.15;

    this.group.children.forEach((child) => {
      if (child.userData.isTentacle) {
        child.rotation.x =
          0.4 + child.userData.phase * 0.2 + Math.sin(t * 8 + child.userData.phase) * 0.25;
      }
    });

    this.updateVisibility();
  }

  hasCaught() {
    return this.pressure >= 1;
  }

  reset() {
    this.pressure = 0;
    this.chaseDistance = this.farDistance;
    this.targetDistance = this.farDistance;
    this.lungeTimer = 0;
    this.animTime = 0;
    this.group.position.set(0, 0, this.farDistance);
    this.updateVisibility();
  }
}

export { VISIBILITY_START, VISIBILITY_FULL };
