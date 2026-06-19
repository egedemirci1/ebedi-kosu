import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  AmbientLight,
  DirectionalLight,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  FogExp2,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  DoubleSide,
} from 'three';

export const LANES = [-2.2, 0, 2.2];
export const LANE_WIDTH = 2.2;

export function getViewportSize() {
  if (window.visualViewport) {
    return {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
    };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

export function createRenderer() {
  const renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  const { width, height } = getViewportSize();
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export function createScene() {
  const scene = new Scene();
  scene.fog = new FogExp2(0x0a0818, 0.018);
  return scene;
}

export function createCamera() {
  const { width, height } = getViewportSize();
  const camera = new PerspectiveCamera(65, width / height, 0.1, 220);
  camera.position.set(0, 5.5, 8);
  camera.lookAt(0, 1.5, -5);
  return camera;
}

export function getCameraProfile(aspect) {
  if (aspect < 0.72) {
    return { baseFov: 78, baseY: 6.4, baseZ: 11.5, lookZ: -4.5 };
  }
  if (aspect < 1) {
    return { baseFov: 72, baseY: 6, baseZ: 10, lookZ: -4.8 };
  }
  return { baseFov: 65, baseY: 5.5, baseZ: 8, lookZ: -5 };
}

export function setupLights(scene) {
  const ambient = new AmbientLight(0x332255, 0.6);
  scene.add(ambient);

  const moon = new DirectionalLight(0x8888ff, 0.8);
  moon.position.set(5, 12, -3);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 90;
  moon.shadow.camera.left = -22;
  moon.shadow.camera.right = 22;
  moon.shadow.camera.top = 22;
  moon.shadow.camera.bottom = -22;
  scene.add(moon);
  moon.target.position.set(0, 0, -40);
  scene.add(moon.target);

  const rim = new Mesh(
    new PlaneGeometry(10, 6),
    new MeshBasicMaterial({
      color: 0xff2244,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: DoubleSide,
    })
  );
  rim.rotation.x = -0.25;
  rim.position.set(0, 4.5, 18);
  scene.add(rim);

  return { moon, rim };
}
