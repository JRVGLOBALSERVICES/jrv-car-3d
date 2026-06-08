import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Real-time Three.js showcase of the GT3 RS — same car + same studio look as
// the Cycles hero. Performance: the car is ONE merged mesh (84 prims, not the
// old 702 objects), pixel ratio is capped, and the showroom Reflector renders
// at a fixed modest resolution — so the mirror floor is affordable again.

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const pctEl = document.getElementById('pct');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches;

// hard cap pixel ratio — full retina (3x) on a phone is the #1 silent perf sink
const DPR = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 1.75);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // matches AgX read far better than ACES
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// --- premium gradient backdrop (radial spotlight, not a dead flat fill) ---
function backdropTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const g = c.getContext('2d').createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#1c2026');
  g.addColorStop(0.45, '#111419');
  g.addColorStop(1.0, '#070809');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
scene.background = backdropTexture();

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(4.2, 1.6, 5.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.4;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.495; // never dip under the floor
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.5;

// the HDRI does ~all the lighting; a faint cool rim keeps the back edge alive.
const rim = new THREE.DirectionalLight(0xbfd0ff, 0.35);
rim.position.set(-6, 4, -5);
scene.add(rim);

// --- showroom mirror floor — Reflector at a FIXED modest resolution ---
// (the old code rendered the reflection at viewport*devicePixelRatio — huge.
//  capped here, it's cheap now that the scene is ~84 draw calls.)
const REFLECT_RES = isMobile ? 512 : 1024;
const floorGeo = new THREE.CircleGeometry(40, 64);
const reflector = new Reflector(floorGeo, {
  textureWidth: REFLECT_RES,
  textureHeight: REFLECT_RES,
  color: 0x0c0e12,
});
reflector.rotateX(-Math.PI / 2);
scene.add(reflector);
// dark glossy glaze so the floor reads polished stone, not a perfect mirror
const glaze = new THREE.Mesh(
  floorGeo.clone(),
  new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.5, metalness: 0.0, transparent: true, opacity: 0.45 })
);
glaze.rotateX(-Math.PI / 2);
glaze.position.y = 0.001;
scene.add(glaze);

// --- soft contact shadow under the car (grounds it; reads premium) ---
function shadowTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  g.addColorStop(0, 'rgba(0,0,0,0.65)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 })
);
contact.rotateX(-Math.PI / 2);
contact.position.y = 0.004;
contact.renderOrder = 2;
scene.add(contact);

// --- IBL: the exact studio HDRI used by the Cycles render ---
new RGBELoader().load('/model/brown_photostudio_02_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
});

function frameObject(target) {
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  target.position.y -= box.min.y; // wheels on the floor (y=0)
  box.setFromObject(target);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.z) || 1;
  const dist = maxDim * 1.45;
  camera.position.set(center.x + dist * 0.92, center.y + maxDim * 0.34, center.z + dist * 1.05);
  controls.target.set(center.x, center.y * 0.8, center.z);
  controls.minDistance = maxDim * 0.85;
  controls.maxDistance = maxDim * 4;
  controls.update();
  // size + place the contact shadow to the car footprint
  contact.scale.set(size.x * 1.35, size.z * 1.6, 1);
  contact.position.set(center.x, 0.004, center.z);
}

// nudge the exported PBR toward the hero look by material name
function tuneMaterials(root) {
  root.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) {
      const name = (m.name || '').toLowerCase();
      if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name)) {
        m.clearcoat = 1.0; m.clearcoatRoughness = 0.08;
        m.roughness = Math.min(m.roughness ?? 0.4, 0.38);
        m.envMapIntensity = 0.9;
      } else if (/chrome|mirror|metal/.test(name)) {
        m.metalness = 1.0; m.roughness = Math.min(m.roughness ?? 0.1, 0.12);
        m.envMapIntensity = 1.4;
      } else if (/glass/.test(name)) {
        m.transmission = m.transmission || 0.9; m.roughness = 0.05;
        m.metalness = 0.0; m.ior = 1.45; m.envMapIntensity = 1.2; m.transparent = true;
      } else if (/rubber|tyre|tire|trim/.test(name)) {
        m.metalness = 0.0; m.roughness = Math.max(m.roughness ?? 0.6, 0.7);
      } else if (/led|light|backlight|tail/.test(name)) {
        m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 1, 2.2);
      }
      m.needsUpdate = true;
    }
  });
}

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const gltf = new GLTFLoader();
gltf.setDRACOLoader(draco);
gltf.load(
  '/model/porsche-gt3rs.glb',
  (data) => {
    const root = data.scene;
    // strip the stray export Cube (default-cube artifact, not part of the car)
    const stray = root.getObjectByName('Cube');
    if (stray) stray.parent.remove(stray);
    tuneMaterials(root);
    scene.add(root);
    frameObject(root);
    if (loaderEl) {
      loaderEl.classList.add('gone');
      setTimeout(() => loaderEl.remove(), 600);
    }
  },
  (e) => {
    if (e.lengthComputable && pctEl) pctEl.textContent = String(Math.round((e.loaded / e.total) * 100));
  },
  (err) => {
    console.error('GLB load failed', err);
    if (pctEl) pctEl.textContent = 'ERR';
  }
);

// --- post: light selective bloom on the emissive lights only ---
const composer = new EffectComposer(renderer);
composer.setPixelRatio(DPR);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.2,   // strength — a kiss on the LEDs/tails only
  0.5,   // radius
  1.4    // threshold — high so bright white-paint reflections DON'T bloom
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});

// pause idle auto-rotate while dragging; resume a beat after release
let resumeT = 0;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeT); });
controls.addEventListener('end', () => {
  if (reduceMotion) return;
  resumeT = setTimeout(() => { controls.autoRotate = true; }, 2500);
});

renderer.setAnimationLoop(() => {
  controls.update();
  composer.render();
});
