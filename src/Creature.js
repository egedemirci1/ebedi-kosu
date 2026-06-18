import * as THREE from 'three';

export class Creature {
  constructor(scene) {
    this.group = new THREE.Group();
    this.chaseDistance = 14;
    this.targetDistance = 14;
    this.minDistance = 1.8;
    this.lungeTimer = 0;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a0818,
      emissive: 0x220011,
      emissiveIntensity: 0.6,
      roughness: 0.9,
      fog: false,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.8, 4, 8), bodyMat);
    torso.position.y = 2.2;
    torso.castShadow = true;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), bodyMat.clone());
    head.position.y = 3.5;
    head.scale.set(1.1, 1, 0.9);
    head.castShadow = true;
    this.group.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1133, fog: false });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), eyeMat);
      eye.position.set(side * 0.22, 3.55, 0.42);
      this.group.add(eye);

      const eyeGlow = new THREE.PointLight(0xff0022, 0.8, 4);
      eyeGlow.position.copy(eye.position);
      this.group.add(eyeGlow);
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

    const aura = new THREE.PointLight(0xff0022, 1.5, 12);
    aura.position.y = 2.5;
    this.group.add(aura);
    this.aura = aura;

    this.torso = torso;
    this.head = head;
    scene.add(this.group);
    this.group.position.set(0, 0, this.chaseDistance);
  }

  get distance() {
    return this.chaseDistance;
  }

  get dangerLevel() {
    const range = 14 - this.minDistance;
    return Math.max(0, Math.min(1, 1 - (this.chaseDistance - this.minDistance) / range));
  }

  lunge(amount = 2.5) {
    this.chaseDistance = Math.max(this.minDistance, this.chaseDistance - amount * 0.55);
    this.targetDistance = Math.max(this.minDistance, this.chaseDistance - amount * 0.25);
    this.lungeTimer = 0.85;
  }

  update(dt, playerX, gameSpeed, playerStumbling) {
    const catchUpRate = playerStumbling ? 6 : 1.2;
    const baseTarget = Math.max(
      this.minDistance,
      Math.min(18, 14 - gameSpeed * 0.15 + (playerStumbling ? -3 : 0))
    );

    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      this.targetDistance = Math.min(this.targetDistance, baseTarget);
    } else {
      this.targetDistance = baseTarget;
    }

    this.chaseDistance += (this.targetDistance - this.chaseDistance) * dt * catchUpRate;

    const sway = Math.sin(Date.now() * 0.004) * 0.3;
    this.group.position.set(
      playerX * 0.3 + sway,
      Math.sin(Date.now() * 0.006) * 0.1,
      this.chaseDistance
    );

    this.torso.rotation.x = Math.sin(Date.now() * 0.005) * 0.08;
    this.head.rotation.y = Math.sin(Date.now() * 0.003) * 0.15;

    this.group.children.forEach((child) => {
      if (child.userData.isTentacle) {
        child.rotation.x =
          0.4 + child.userData.phase * 0.2 + Math.sin(Date.now() * 0.008 + child.userData.phase) * 0.25;
      }
    });

    this.aura.intensity = 1 + this.dangerLevel * 3;
  }

  hasCaught() {
    return this.chaseDistance <= this.minDistance;
  }

  reset() {
    this.chaseDistance = 14;
    this.targetDistance = 14;
    this.lungeTimer = 0;
    this.group.position.set(0, 0, 14);
  }
}
