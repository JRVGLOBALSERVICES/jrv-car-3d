import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============================================================================
// JRV 911 — real-time PHOTOREAL showroom (Three.js / WebGL)
// ----------------------------------------------------------------------------
// Direct port of the verified Blender Cycles look (web-target-street.png):
//   • AgX tone mapping (THREE.AgXToneMapping) — same transform Blender renders
//   • a REAL Poly Haven night HDRI shown CRISP as the backdrop (not procedural
//     boxes, not a blurred mush) — it lights, reflects AND is the visible scene
//   • a real Reflector wet-asphalt floor (mirror reflection, distance-faded)
//   • key + rim RectAreaLights matching the Blender 3-point rig
//   • deep-indigo iridescent clearcoat paint + red calipers
// No attract-reel, no procedural city, no canvas road, no image scrub. The car
// is the hero; you orbit it; it idles on a slow turntable. Each PAGE sets a
// window.__MOOD before importing this module to pick its HDRI + accent.
// ============================================================================

const MOOD = Object.assign(
  {
    hdri: 'cobblestone_street_night_2k.hdr',
    label: 'Backstreet · KL after dark',
    exposure: 0.92,       // AgX exposure — kept low so the bright HDRI lamp
                          // doesn't flood the frame to milky white
    bgBlur: 0.12,         // push the backdrop to DOF — softens the hot streetlight
    bgIntensity: 0.5,     // the single biggest fix for the washed-out look
    envIntensity: 0.85,
    paintBase: 0x101c3a,  // deep indigo base under the clearcoat
    rimColor: 0xffb072,   // warm rim (matches the Blender rig)
    keyColor: 0xdce6ff,   // cool key
    groundColor: 0x0b0d11,
  },
  window.__MOOD || {}
);

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const pctEl = document.getElementById('pct');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
const BASE = import.meta.env.BASE_URL;
const DPR = Math.min(window.devicePixelRatio, isMobile ? 2 : 1.85);

RectAreaLightUniformsLib.init();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;          // == Blender AgX
renderer.toneMappingExposure = MOOD.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(4.4, 1.5, 5.4);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3.2;
controls.maxDistance = 13;
controls.maxPolarAngle = Math.PI * 0.5;
controls.autoRotate = true;
controls.autoRotateSpeed = reduceMotion ? 0 : 0.45;
controls.target.set(0, 0.55, 0);

// ---------------------------------------------------------------------------
// LIGHTING — the verified Blender 3-point rig, ported to RectAreaLights.
// The HDRI does most of the work; these shape the body + rake the iridescence.
// ---------------------------------------------------------------------------
function rect(color, intensity, w, h, pos, look) {
  const l = new THREE.RectAreaLight(color, intensity, w, h);
  l.position.set(...pos);
  l.lookAt(...look);
  scene.add(l);
  return l;
}
rect(MOOD.keyColor, 6.5, 7, 5, [-7, 6, 5.5], [0, 0.5, 0]);   // key, cam-left high
rect(MOOD.rimColor, 11, 4, 3, [6.5, 4.2, -5], [0, 0.6, 0]);  // warm rim, behind-right
rect(0xbcd2ff, 2.0, 9, 5, [2, 2, -8], [0, 0, 0]);            // soft fill

// ---------------------------------------------------------------------------
// WET-ASPHALT FLOOR — real Reflector mirror, knocked back to a dark sheen and
// faded with distance by a radial-gradient overlay so it reads as wet ground,
// not an infinity mirror.
// ---------------------------------------------------------------------------
const reflector = new Reflector(new THREE.PlaneGeometry(60, 60), {
  textureWidth: window.innerWidth * DPR,
  textureHeight: window.innerHeight * DPR,
  color: 0x4a4f57,           // dim the reflection (wet asphalt, not chrome)
  clipBias: 0.003,
});
reflector.rotateX(-Math.PI / 2);
reflector.position.y = 0.0;
scene.add(reflector);

function fadeTexture() {
  const s = 512, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.06, s / 2, s / 2, s * 0.5);
  g.addColorStop(0, 'rgba(11,13,17,0.35)');
  g.addColorStop(0.55, 'rgba(11,13,17,0.72)');
  g.addColorStop(1, 'rgba(11,13,17,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
const floorFade = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshBasicMaterial({ map: fadeTexture(), transparent: true, depthWrite: false })
);
floorFade.rotateX(-Math.PI / 2);
floorFade.position.y = 0.001;
scene.add(floorFade);

// soft contact shadow blob under the car (grounds it on the reflection)
function shadowTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 })
);
contact.rotateX(-Math.PI / 2);
contact.position.y = 0.002;
scene.add(contact);

// ---------------------------------------------------------------------------
// ENVIRONMENT — the real night HDRI: lights, reflects AND is the visible scene.
// ---------------------------------------------------------------------------
new RGBELoader().load(`${BASE}model/${MOOD.hdri}`, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.environmentIntensity = MOOD.envIntensity;
  scene.background = hdr;
  scene.backgroundBlurriness = MOOD.bgBlur;
  scene.backgroundIntensity = MOOD.bgIntensity;
  scene.backgroundRotation = new THREE.Euler(0, 2.2, 0);
  scene.environmentRotation = new THREE.Euler(0, 2.2, 0);
});

// ---------------------------------------------------------------------------
// MATERIALS — ported from the verified Blender paint. Under AgX the heavy
// saturation hacks are unnecessary; let the tone mapping carry the colour.
// ---------------------------------------------------------------------------
function tuneMaterials(root) {
  root.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    n.castShadow = true;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) {
      const name = (m.name || '').toLowerCase();
      if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name)) {
        m.clearcoat = 1.0; m.clearcoatRoughness = 0.08;
        m.roughness = Math.min(m.roughness ?? 0.35, 0.34);
        m.metalness = 0.55;
        m.envMapIntensity = 1.0;
        m.iridescence = 1.0;
        m.iridescenceIOR = 1.4;
        m.iridescenceThicknessRange = [180, 820];
        if (m.color) m.color.lerp(new THREE.Color(MOOD.paintBase), 0.6);
        m.sheen = 1.0; m.sheenRoughness = 0.45;
        m.sheenColor = new THREE.Color(0x2a5cff);
      } else if (/chrome|mirror|metal/.test(name)) {
        m.metalness = 1.0; m.roughness = Math.min(m.roughness ?? 0.18, 0.2);
        m.envMapIntensity = 1.1;
        if ('transmission' in m) { m.transmission = 0; m.transparent = false; }
      } else if (/glass|window|windscreen|windshield/.test(name)) {
        if ('transmission' in m) m.transmission = 0;
        m.metalness = 0; m.roughness = 0.06;
        m.color = new THREE.Color(0x0a0d12);
        m.envMapIntensity = 1.3; m.transparent = true; m.opacity = 0.5;
      } else if (/rubber|tyre|tire/.test(name)) {
        m.metalness = 0; m.roughness = Math.max(m.roughness ?? 0.7, 0.8);
      }
      if (/headlight|head_light|drl|led_lights/.test(name)) {
        m.emissive = new THREE.Color(0xfff1dc); m.emissiveIntensity = 1.1;
      } else if (/taillight|tail_light|backlight|brake/.test(name) || /(^|_)red(\.|$|_)/.test(name)) {
        m.emissive = new THREE.Color(0xff1414); m.emissiveIntensity = 1.3;
      }
      m.needsUpdate = true;
    }
  });
}

function frameObject(target) {
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z) || 1;
  const aspect = window.innerWidth / window.innerHeight;
  const pad = aspect < 1 ? (1.55 / aspect) : 1.45;
  const dist = maxDim * Math.min(pad, 2.6);
  const lift = aspect < 1 ? maxDim * 0.5 : maxDim * 0.3;
  camera.position.set(center.x + dist * 0.9, center.y + lift, center.z + dist * 1.05);
  controls.target.set(center.x, center.y * 0.85 + 0.2, center.z);
  controls.minDistance = maxDim * 0.85;
  controls.maxDistance = maxDim * 3.6;
  controls.update();
  contact.scale.set(size.x * 1.5, size.z * 1.7, 1);
  contact.position.set(center.x, 0.002, center.z);
}

// ---------------------------------------------------------------------------
// POST — subtle bloom on the real emitters (head/tail/streetlights) only.
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(DPR);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  isMobile ? 0.1 : 0.12,   // strength — gentle; the milky-orange wash was bloom
  0.4,                     // radius
  0.95                     // threshold — ONLY real emitters glow, not the HDRI
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// LOAD THE CAR
// ---------------------------------------------------------------------------
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const gltf = new GLTFLoader();
gltf.setDRACOLoader(draco);
gltf.load(
  `${BASE}model/porsche-gt3rs-wheels.glb`,
  (data) => {
    const root = data.scene;
    const stray = root.getObjectByName('Cube');
    if (stray && stray.parent) stray.parent.remove(stray);
    const pre = new THREE.Box3().setFromObject(root);
    root.position.y -= pre.min.y;
    tuneMaterials(root);
    scene.add(root);
    frameObject(root);
    if (loaderEl) {
      loaderEl.classList.add('gone');
      setTimeout(() => loaderEl.remove(), 600);
    }
  },
  (e) => { if (e.lengthComputable && pctEl) pctEl.textContent = String(Math.round((e.loaded / e.total) * 100)); },
  (err) => { console.error('GLB load failed', err); if (pctEl) pctEl.textContent = 'ERR'; }
);

// pause auto-rotate while the user is dragging; resume after idle
let idleT = 0;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleT); });
controls.addEventListener('end', () => {
  if (reduceMotion) return;
  clearTimeout(idleT);
  idleT = setTimeout(() => { controls.autoRotate = true; }, 4000);
});

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});

function tick() {
  controls.update();
  composer.render();
  requestAnimationFrame(tick);
}
tick();
