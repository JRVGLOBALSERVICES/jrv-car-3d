import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Real-time GT3 RS — same car + studio HDRI as the Cycles hero, but built to
// run smooth on a phone. The two per-frame killers from the last build are GONE:
//   - Reflector (re-rendered the WHOLE scene to a texture every frame)  -> replaced
//     by a mirrored car-clone under a glossy floor: ONE static extra draw, no
//     second render pass. The reflection updates for free as you orbit.
//   - EffectComposer + UnrealBloom (a fullscreen pass that also blew out the white
//     paint) -> gone. We render direct to screen; lights glow via emissive alone.

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const pctEl = document.getElementById('pct');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches;

// hard cap pixel ratio — full retina (3x) on a phone is the #1 silent perf sink
const DPR = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 1.75);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // matches AgX read far better than ACES
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// --- premium gradient backdrop (radial spotlight, not a dead flat fill) ---
function backdropTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#23282f');
  g.addColorStop(0.45, '#14171c');
  g.addColorStop(1.0, '#070809');
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
controls.maxPolarAngle = Math.PI * 0.49; // stay above the floor (never see under the reflection)
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.5;

// the HDRI does ~all the lighting; a faint cool rim keeps the back edge alive.
const rim = new THREE.DirectionalLight(0xbfd0ff, 0.3);
rim.position.set(-6, 4, -5);
scene.add(rim);

// --- glossy showroom floor (env-reflective; reads as polished dark stone) ---
const floorGeo = new THREE.CircleGeometry(60, 64);
const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
  color: 0x0a0c10, roughness: 0.18, metalness: 0.9, envMapIntensity: 0.7,
  transparent: true, opacity: 0.62, // lower opacity = the mirrored clone reads as a real reflection
}));
floor.rotateX(-Math.PI / 2);
floor.renderOrder = 1;
scene.add(floor);

// --- soft contact shadow under the car (grounds it; reads premium) ---
function shadowTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  g.addColorStop(0, 'rgba(0,0,0,0.7)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.85 })
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
  const maxDim = Math.max(size.x, size.z) || 1;
  const aspect = window.innerWidth / window.innerHeight;
  // On portrait phones the horizontal car would crop at the roof/wing — pull the
  // camera back as the viewport narrows so the whole car always fits, and raise
  // the look-target so the body copy panel at the bottom never sits on the car.
  const portraitPad = aspect < 1 ? (1.45 / aspect) : 1.45;
  const dist = maxDim * Math.min(portraitPad, 2.6);
  const lift = aspect < 1 ? maxDim * 0.55 : maxDim * 0.34;
  camera.position.set(center.x + dist * 0.92, center.y + lift, center.z + dist * 1.05);
  controls.target.set(center.x, center.y * (aspect < 1 ? 1.15 : 0.8), center.z);
  controls.minDistance = maxDim * 0.85;
  controls.maxDistance = maxDim * 4.5;
  controls.update();
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
        m.roughness = Math.min(m.roughness ?? 0.4, 0.35);
        m.envMapIntensity = 1.0;
      } else if (/chrome|mirror|metal/.test(name)) {
        m.metalness = 1.0; m.roughness = Math.min(m.roughness ?? 0.1, 0.12);
        m.envMapIntensity = 1.4;
      } else if (/glass/.test(name)) {
        m.transmission = m.transmission || 0.9; m.roughness = 0.05;
        m.metalness = 0.0; m.ior = 1.45; m.envMapIntensity = 1.2; m.transparent = true;
      } else if (/rubber|tyre|tire|trim/.test(name)) {
        m.metalness = 0.0; m.roughness = Math.max(m.roughness ?? 0.6, 0.7);
      } else if (/led|light|backlight|tail/.test(name)) {
        m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 1, 2.4);
      }
      m.needsUpdate = true;
    }
  });
}

// Build a mirrored, dimmed clone under the floor — the showroom reflection,
// without a per-frame render-to-texture. Materials are cloned (so tuning the
// real car never touches the reflection) and flipped to DoubleSide because the
// negative Y-scale inverts winding.
function buildReflection(root) {
  const refl = root.clone(true);
  refl.scale.y = -1;
  refl.position.y = root.position.y * -2; // mirror across y=0
  refl.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    const mats = (Array.isArray(n.material) ? n.material : [n.material]).map((m) => {
      const c = m.clone();
      c.side = THREE.DoubleSide;
      c.envMapIntensity = (c.envMapIntensity ?? 1) * 0.5;
      c.transparent = true;
      c.opacity = (c.opacity ?? 1) * 0.85;
      c.depthWrite = false;
      return c;
    });
    n.material = Array.isArray(n.material) ? mats : mats[0];
    n.renderOrder = 0; // draw before the floor + real car
  });
  return refl;
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

    // wheels on the floor (y=0)
    const pre = new THREE.Box3().setFromObject(root);
    root.position.y -= pre.min.y;

    tuneMaterials(root);
    scene.add(root);
    scene.add(buildReflection(root));
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

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// pause idle auto-rotate while dragging; resume a beat after release
let resumeT = 0;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeT); });
controls.addEventListener('end', () => {
  if (reduceMotion) return;
  resumeT = setTimeout(() => { controls.autoRotate = true; }, 2500);
});

// expose draw-call / triangle counts — a device-independent measure of the
// per-frame cost (the thing the Reflector + composer removal actually fixes).
window.__info = () => ({
  calls: renderer.info.render.calls,
  tris: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
});
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
