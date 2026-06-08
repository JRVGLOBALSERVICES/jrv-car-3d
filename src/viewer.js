import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';

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
// This renders CONTINUOUSLY, exactly like the home hero that's confirmed smooth
// on a phone (which carries far more — Reflector + bloom + bokeh + a shader pass).
// An earlier build gated rendering on interaction ("render-on-demand"); on a phone
// there's no hover to trigger the first frame, so the car + HDRI backdrop never
// painted until you tapped. Continuous render makes "first frame shows everything"
// true by construction. At 92 draw calls this is a fraction of the home hero's load.

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
renderer.toneMappingExposure = 1.15; // brighter, warm studio like the Cycles reference (was a gloomy 0.95)
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();


// The studio scenery (windows, plant, louvre doors, polished floor) IS the HDRI.
// A FLAT equirect background never blends with a separate floor plane: the
// backdrop's floor meets your geometry floor at the horizon as a hard seam (the
// exact "scene/floor/car don't blend" bug). The fix is a GroundedSkybox — it
// bends the HDRI's lower hemisphere DOWN into a flat ground that the car sits
// on, so room + floor + car are one continuous lit space, like the render.
// Built in the RGBELoader callback below. A neutral fill shows until it loads.
scene.background = new THREE.Color(0x141414);

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

// the HDRI does ~all the lighting; a faint cool rim keeps the back edge alive.
const rim = new THREE.DirectionalLight(0xbfd0ff, 0.3);
rim.position.set(-6, 4, -5);
scene.add(rim);

// NO separate floor mesh. The car sits directly on the GroundedSkybox's own
// projected ground — which IS the studio floor texture (already a polished,
// reflective-looking surface in the HDRI), so it's tone-matched by construction
// and blends with zero seam. An opaque disc was darker than the projected floor
// and re-introduced the exact seam we're killing; a black gloss layer would dim
// it the same way. Grounding comes from the contact shadow below — that's it.

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

// --- IBL + grounded backdrop: the exact studio HDRI used by the Cycles render ---
// Yaw (radians) chosen so a furnished, warm part of the room sits behind the car
// at the default camera view (orbiting reveals the rest). The SAME yaw is applied
// to the lighting so reflections line up with what's visible.
const ENV_YAW = 2.2;
// GroundedSkybox geometry: `height` = how high the photographer's camera was
// (bigger => the floor reads flatter/further); `radius` = dome size (camera must
// stay inside). Tuned to the car's ~4.5 m scale; verified by screenshot below.
const SKY_HEIGHT = 6;
const SKY_RADIUS = 90;
new RGBELoader().load('/model/brown_photostudio_02_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;                 // lights the car + feeds reflections
  scene.environmentRotation = new THREE.Euler(0, ENV_YAW, 0);

  // ground-projected studio = the visible backdrop AND a flat floor at y=0 the
  // car sits on. One continuous space — no horizon seam.
  const sky = new GroundedSkybox(hdr, SKY_HEIGHT, SKY_RADIUS);
  sky.position.y = SKY_HEIGHT;             // puts the projected ground at y=0
  sky.rotation.y = ENV_YAW;                // match the lighting yaw
  sky.renderOrder = 0;
  scene.add(sky);
  scene.background = null;                  // the skybox mesh is the backdrop now
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

// device-independent per-frame cost probe (honest measure on a GPU-less box)
window.__info = () => ({
  calls: renderer.info.render.calls,
  tris: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
});

// --- continuous render loop --------------------------------------------------
// Renders every frame, just like the home hero confirmed smooth on a phone. No
// interaction-gating: the car, the studio backdrop and the idle auto-spin are all
// visible the instant the page loads — nothing waits for a tap.
function tick() {
  controls.update();        // damping + idle auto-rotate
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
