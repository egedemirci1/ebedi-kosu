import * as THREE from 'three';
import { createSurfaceMaterial } from './surfaceMaterial.js';

export class Creature {
  constructor(scene) {
    this.group = new THREE.Group();
    this.farDistance = 14;
    this.chaseDistance = 14;
    this.targetDistance = 14;
    this.minDistance = 1.8;
    this.lungeTimer = 0;
    this.animTime = 0;

    const bodyMat = createSurfaceMaterial({
      color: 0x1a0818,
      emissive: 0x220011,
      emissiveIntensity: 0.6,
      roughness: 0.9,
      fog: false,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.8, 4, 8), bodyMat);
    torso.position.y = 2.2;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), bodyMat.clone());
    head.position.y = 3.5;
    head.scale.set(1.1, 1, 0.9);
    this.group.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1133, fog: true });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), eyeMat);
      eye.position.set(side * 0.22, 3.55, 0.42);
      this.group.add(eye);
    }

    for (let i = 0; i < 4; i++) {
      const tentacle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.02, 1.2, 4),
        bodyMat.clone()
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
  }

  get distance() {
    return this.chaseDistance;
  }

  get dangerLevel() {
    const range = this.farDistance - this.minDistance;
    return Math.max(0, Math.min(1, 1 - (this.chaseDistance - this.minDistance) / range));
  }

  chaseDistanceForDanger(fraction) {
    const range = this.farDistance - this.minDistance;
    return this.minDistance + range * (1 - Math.max(0, Math.min(1, fraction)));
  }

  /**
   * Çarpma anında canavarı belirli tehlike seviyesine yaklaştırır; temiz koşuda geri açılır.
   * @param {number} fraction 0–1 arası tehlike
   */
  applyHitDanger(fraction) {
    const hitDistance = this.chaseDistanceForDanger(fraction);
    this.chaseDistance = Math.min(this.chaseDistance, hitDistance);
    this.targetDistance = hitDistance;
    this.lungeTimer = 0.85;
    this.syncGroupZ();
  }

  /** İkinci çarpma — yakalama mesafesine kilitler. */
  forceCatch() {
    this.chaseDistance = this.minDistance;
    this.targetDistance = this.minDistance;
    this.lungeTimer = 0;
    this.syncGroupZ();
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

    const catchUpRate = playerStumbling ? 6 : 1.2;
    const baseTarget = Math.max(this.minDistance, playerStumbling ? 11 : this.farDistance);

    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      this.targetDistance = Math.min(this.targetDistance, baseTarget);
    } else {
      this.targetDistance = baseTarget;
    }

    this.chaseDistance += (this.targetDistance - this.chaseDistance) * dt * catchUpRate;

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
  }

  hasCaught() {
    return this.chaseDistance <= this.minDistance;
  }

  reset() {
    this.chaseDistance = this.farDistance;
    this.targetDistance = this.farDistance;
    this.lungeTimer = 0;
    this.animTime = 0;
    this.group.position.set(0, 0, this.farDistance);
  }
}
