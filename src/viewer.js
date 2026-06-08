import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Interactive GT3 RS — same car + studio HDRI as the Cycles hero, free-orbit,
// and built to stay smooth on a phone. The home hero proves Three.js itself is
// fine on mobile; what made the LAST model build choke were two things the home
// never did, both removed here:
//   1. A full mirrored GEOMETRY CLONE of the car under the floor — doubled every
//      draw call + triangle, every frame. Gone. The floor is a glossy env-lit
//      surface + a soft contact shadow: the showroom read, none of the cost.
//   2. transmission glass (a separate full-scene render-target pass each frame,
//      and wrongly applied to metal too — half the "ugly"). Gone. Windows are a
//      cheap dark tint now.
// On top of that: RENDER-ON-DEMAND. We only draw a frame while you're orbiting
// or it's auto-spinning; idle costs zero GPU. That makes this strictly lighter
// than the home hero you already confirmed smooth.

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
renderer.toneMapping = THREE.NeutralToneMapping; // matches the AgX hero grade far better than ACES
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// render-on-demand dirty flag — set true whenever something needs a fresh frame
let dirty = true;

// The studio scenery (windows, winter trees, plant, polished floor) IS the HDRI.
// We set scene.background = that same HDRI below in the RGBELoader callback so
// the viewer shows the environment AS the backdrop — exactly like the Cycles
// render — instead of a flat dark fill. A faint blur gives it the render's soft
// depth-of-field; intensity is tuned so it doesn't blow out behind the car.
// (A neutral gradient is shown until the HDRI finishes loading, to avoid a flash
// of black.)
scene.background = new THREE.Color(0x14171c);
scene.backgroundBlurriness = 0.035; // slight DoF like the render, windows still read
scene.backgroundIntensity = 0.95;

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(4.2, 1.6, 5.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.4;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.49; // stay above the floor (never see under the car)
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.5;
// any control change requests a frame (render-on-demand, see tick())
controls.addEventListener('change', () => { dirty = true; });

// the HDRI does ~all the lighting; a faint cool rim keeps the back edge alive.
const rim = new THREE.DirectionalLight(0xbfd0ff, 0.3);
rim.position.set(-6, 4, -5);
scene.add(rim);

// --- glossy showroom floor: reflects the HDRI env (free — no scene re-render),
//     reads as polished dark stone. Slightly more visible than before so it
//     grounds the car without a literal mirror. ---
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(60, 64),
  new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.14, metalness: 0.9, envMapIntensity: 1.05 })
);
floor.rotateX(-Math.PI / 2);
floor.renderOrder = 1;
scene.add(floor);

// --- soft contact shadow under the car (grounds it; reads premium) ---
function shadowTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.72)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.32)');
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
// Yaw (radians) that brings the studio's big windows + winter trees behind the
// car at the default camera view — so first load reads like the Cycles render,
// not a blank wall. Orbiting reveals the rest of the room.
const ENV_YAW = 3.1;
new RGBELoader().load('/model/brown_photostudio_02_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;   // lights the car + feeds reflections
  scene.background = hdr;     // AND shows the studio scenery as the backdrop
  scene.backgroundRotation = new THREE.Euler(0, ENV_YAW, 0);
  scene.environmentRotation = new THREE.Euler(0, ENV_YAW, 0);
  dirty = true;
});

function frameObject(target) {
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z) || 1;
  const aspect = window.innerWidth / window.innerHeight;
  // On portrait phones the horizontal car would crop at the roof/wing — pull the
  // camera back as the viewport narrows so the whole car always fits, and raise
  // the look-target so the body-copy panel at the bottom never sits on the car.
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
  dirty = true;
}

// nudge the exported PBR toward the hero look by material name. No transmission
// anywhere — glass is a cheap dark tint, metal is real metal (not see-through).
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
        if ('transmission' in m) { m.transmission = 0; m.transparent = false; } // undo stray glass on metal
      } else if (/glass|window|windscreen|windshield/.test(name)) {
        // cheap tinted glass — NO transmission (that pass is what killed mobile)
        if ('transmission' in m) m.transmission = 0;
        m.metalness = 0; m.roughness = 0.08;
        m.color = new THREE.Color(0x0a0d12);
        m.envMapIntensity = 1.3; m.transparent = true; m.opacity = 0.46;
      } else if (/rubber|tyre|tire|trim/.test(name)) {
        m.metalness = 0.0; m.roughness = Math.max(m.roughness ?? 0.6, 0.7);
      } else if (/led|light|backlight|tail/.test(name)) {
        m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 1, 2.4);
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

    // wheels on the floor (y=0)
    const pre = new THREE.Box3().setFromObject(root);
    root.position.y -= pre.min.y;

    tuneMaterials(root);
    scene.add(root);
    frameObject(root);

    if (loaderEl) {
      loaderEl.classList.add('gone');
      setTimeout(() => loaderEl.remove(), 600);
    }
    dirty = true;
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
  dirty = true;
});

// pause idle auto-rotate while dragging; resume a beat after release
let resumeT = 0;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeT); });
controls.addEventListener('end', () => {
  if (reduceMotion) return;
  resumeT = setTimeout(() => { controls.autoRotate = true; dirty = true; }, 2500);
});

// device-independent per-frame cost probe (honest measure on a GPU-less box)
window.__info = () => ({
  calls: renderer.info.render.calls,
  tris: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
});

// --- render-on-demand loop ---------------------------------------------------
// controls.update() returns true while damping is settling or auto-rotate is on.
// When the user isn't touching it and auto-rotate is off, it returns false and
// we skip the draw entirely — idle frames cost nothing. rAF itself is a cheap
// boolean check; the GPU only works when something actually moved.
function tick() {
  const moved = controls.update();
  if (moved || dirty) {
    renderer.render(scene, camera);
    dirty = false;
  }
  requestAnimationFrame(tick);
}
tick();
