import * as THREE from 'three';

function createSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#060612');
  grad.addColorStop(0.25, '#0e0822');
  grad.addColorStop(0.5, '#1a0e32');
  grad.addColorStop(0.72, '#351840');
  grad.addColorStop(0.88, '#5a2048');
  grad.addColorStop(1, '#7a2848');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const horizon = ctx.createLinearGradient(0, 380, 0, 512);
  horizon.addColorStop(0, 'rgba(255, 80, 60, 0)');
  horizon.addColorStop(1, 'rgba(255, 60, 40, 0.15)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 380, 512, 132);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStarField(count = 900) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.85 + 0.05);
    const r = 70 + Math.random() * 15;
    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) + 5,
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xddeeff,
    size: 0.35,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function buildMountainPeak(width, height, depth) {
  const geo = new THREE.ConeGeometry(width, height, 4);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0812,
    emissive: 0x120818,
    emissiveIntensity: 0.25,
    roughness: 1,
    flatShading: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.random() * Math.PI;
  mesh.position.y = height * 0.5 - 0.5;
  mesh.position.z = (Math.random() - 0.5) * depth;
  return mesh;
}

function createMountainStrip(z) {
  const group = new THREE.Group();
  group.position.z = z;

  const count = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const peak = buildMountainPeak(
      4 + Math.random() * 8,
      3 + Math.random() * 10,
      12
    );
    peak.position.x = side * (14 + Math.random() * 10);
    group.add(peak);
  }

  const fogMat = new THREE.MeshBasicMaterial({
    color: 0x1a1028,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    fog: false,
  });

  for (const side of [-1, 1]) {
    const sideMist = new THREE.Mesh(new THREE.PlaneGeometry(22, 7), fogMat);
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
    this.mountainStrips = [];
    this.stripSpacing = 40;
    this.poolSize = 10;

    const skyTex = createSkyTexture();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(85, 32, 24),
      new THREE.MeshBasicMaterial({
        map: skyTex,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    this.skyGroup.add(sky);

    const stars = createStarField();
    this.skyGroup.add(stars);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xdde8ff, fog: false })
    );
    moon.position.set(18, 28, -35);
    this.skyGroup.add(moon);

    const moonGlow = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x8899ff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        fog: false,
      })
    );
    moonGlow.position.copy(moon.position);
    this.skyGroup.add(moonGlow);

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
      this.skyGroup.add(aurora);
    }

    scene.add(this.skyGroup);

    for (let i = 0; i < this.poolSize; i++) {
      const strip = createMountainStrip(-i * this.stripSpacing - 20);
      this.mountainStrips.push(strip);
      this.mountainGroup.add(strip);
    }
    scene.add(this.mountainGroup);

    scene.background = null;
  }

  update(dt, speed, camera) {
    this.skyGroup.position.set(camera.position.x * 0.15, camera.position.y * 0.3, camera.position.z);

    const parallax = speed * dt * 0.35;
    let minZ = Infinity;

    for (const strip of this.mountainStrips) {
      strip.position.z += parallax;
      if (strip.position.z < minZ) minZ = strip.position.z;

      if (strip.position.z > 25) {
        strip.position.z = minZ - this.stripSpacing;
        minZ = strip.position.z;
      }
    }
  }

  reset() {
    this.mountainStrips.forEach((strip, i) => {
      strip.position.z = -i * this.stripSpacing - 20;
    });
  }
}
