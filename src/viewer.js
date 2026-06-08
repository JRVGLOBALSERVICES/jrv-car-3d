import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Dedicated on-site viewer for the full Blender scene export
// (public/hero/car-drift-scene.glb). Separate from the live procedural
// hero in main.js — this shows the actual Blender deliverable, orbitable.

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const pctEl = document.getElementById('pct');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // ACES desaturates carpaint — Neutral keeps it
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c0e);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(4.2, 1.9, 5.6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.2;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.495; // don't dip under the floor
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.5;

// soft fill so shadow sides aren't pure black even before the HDRI lands
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(5, 8, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0002;
scene.add(key);
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20242a, 0.6));

// IBL — same Poly Haven sky the hero uses, so reflections read like the reel
new RGBELoader().load('/model/kloofendal_43d_clear_puresky_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
});

function frameObject(target) {
  // frame the camera on the target's world bbox without moving any geometry
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z, size.y) || 1;
  const dist = maxDim * 2.1;
  camera.position.set(center.x + dist * 0.78, center.y + dist * 0.34, center.z + dist * 0.92);
  controls.target.copy(center);
  controls.minDistance = maxDim * 0.9;
  controls.maxDistance = maxDim * 6;
  controls.update();
}

// the scene GLB is Draco-compressed (KHR_draco_mesh_compression) — same
// decoder source as the hero in main.js
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const gltf = new GLTFLoader();
gltf.setDRACOLoader(draco);
gltf.load(
  '/hero/car-drift-scene.glb',
  (data) => {
    const root = data.scene;
    // Blender volumetric smoke + dust dashes don't translate to glTF — they
    // export as solid white blobs. Hide them so the viewer shows the clean car.
    root.traverse((n) => {
      if (/^(GEO-smoke|GEO-dash)/.test(n.name)) n.visible = false;
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
      }
    });
    scene.add(root);
    // frame on the car itself (Sketchfab_model), not the giant ground plane
    const car = root.getObjectByName('Sketchfab_model') || root;
    frameObject(car);
    if (loaderEl) {
      loaderEl.classList.add('gone');
      setTimeout(() => loaderEl.remove(), 600);
    }
  },
  (e) => {
    if (e.lengthComputable && pctEl) {
      pctEl.textContent = String(Math.round((e.loaded / e.total) * 100));
    }
  },
  (err) => {
    console.error('GLB load failed', err);
    if (pctEl) pctEl.textContent = 'ERR';
  }
);

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// pause auto-rotate while the user is dragging, resume after
controls.addEventListener('start', () => { controls.autoRotate = false; });

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
