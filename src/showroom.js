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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============================================================================
// JRV 911 — real-time PHOTOREAL showroom (Three.js / WebGL)
// ----------------------------------------------------------------------------
// Direct port of the verified Blender Cycles STUDIO render (car-studio-cool):
//   • the HDRI drives reflections + lighting ONLY — it is NOT the background
//     (showing a blurred street photo behind the car was the "fucked-up
//     scenery" / milky-mush failure). The visible backdrop is a controlled
//     dark cyclorama gradient, exactly like the Cycles dark-studio world.
//   • AgX tone mapping (== Blender view transform) + a real color-GRADE post
//     pass (contrast / saturation / split-tone / vignette / film grain) that
//     ports the cool-industrial & warm-cinematic grade presets to the web.
//   • boosted 3-point RectAreaLight rig (cool key, warm rim, soft fill) and a
//     real Reflector wet-asphalt floor — the jewel-lit hero, not a photo paste.
// Two MOODS, set per-page via window.__MOOD before this module imports.
// ============================================================================

const MOOD = Object.assign(
  {
    hdri: 'cobblestone_street_night_2k.hdr', // reflections/light source only
    label: 'Backstreet · KL after dark',
    exposure: 1.0,
    envIntensity: 0.9,
    // cyclorama backdrop (top → bottom), kept near-black like the studio world
    bgTop: 0x05060b,
    bgBot: 0x0c1320,
    // 3-point rig
    keyColor: 0xdce8ff, keyPower: 16,
    rimColor: 0xff9c54, rimPower: 22,
    fillColor: 0xb9ccff, fillPower: 4.5,
    // paint
    paintBase: 0x0e1b34,
    // grade (display-space, after AgX) — ports the Blender grade preset
    grade: {
      contrast: 1.09, saturation: 1.06, vignette: 0.46, grain: 0.025,
      shadowTint: [0.00, 0.022, 0.05],   // teal shadows
      highTint:  [0.015, 0.03, 0.055],   // cool highlights
    },
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
renderer.toneMapping = THREE.AgXToneMapping;            // == Blender AgX
renderer.toneMappingExposure = MOOD.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(4.4, 1.35, 5.4);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3.2;
controls.maxDistance = 13;
controls.maxPolarAngle = Math.PI * 0.495;   // stay above the floor
controls.autoRotate = true;
controls.autoRotateSpeed = reduceMotion ? 0 : 0.4;
controls.target.set(0, 0.5, 0);

// ---------------------------------------------------------------------------
// CYCLORAMA BACKDROP — a vertical dark gradient as the visible background.
// (HDRI is assigned to scene.environment only, further down, so it lights and
// reflects but is never the blurry photo behind the car.)
// ---------------------------------------------------------------------------
function gradientBackground(topHex, botHex) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  const top = '#' + topHex.toString(16).padStart(6, '0');
  const bot = '#' + botHex.toString(16).padStart(6, '0');
  g.addColorStop(0, top);
  g.addColorStop(0.62, bot);
  g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
scene.background = gradientBackground(MOOD.bgTop, MOOD.bgBot);

// ---------------------------------------------------------------------------
// LIGHTING — boosted 3-point rig ported from the verified Blender render.
// ---------------------------------------------------------------------------
function rect(color, intensity, w, h, pos, look) {
  const l = new THREE.RectAreaLight(color, intensity, w, h);
  l.position.set(...pos);
  l.lookAt(...look);
  scene.add(l);
  return l;
}
rect(MOOD.keyColor, MOOD.keyPower, 7, 5, [-7, 6, 5.5], [0, 0.5, 0]);   // cool key, cam-left high
rect(MOOD.rimColor, MOOD.rimPower, 4.5, 3, [6.8, 4.0, -5], [0, 0.6, 0]); // warm rim, behind-right
rect(MOOD.fillColor, MOOD.fillPower, 9, 5, [3, 2.2, -8], [0, 0, 0]);  // soft fill

// ---------------------------------------------------------------------------
// WET-ASPHALT FLOOR — real Reflector mirror, dimmed to a dark sheen and faded
// with distance so it reads as wet ground, not an infinity mirror.
// ---------------------------------------------------------------------------
const reflector = new Reflector(new THREE.PlaneGeometry(80, 80), {
  textureWidth: window.innerWidth * DPR,
  textureHeight: window.innerHeight * DPR,
  color: 0x3d4148,           // dim the reflection (wet asphalt, not chrome)
  clipBias: 0.003,
});
reflector.rotateX(-Math.PI / 2);
reflector.position.y = 0.0;
scene.add(reflector);

function radial(stops) {
  const s = 512, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.04, s / 2, s / 2, s * 0.5);
  for (const [p, col] of stops) g.addColorStop(p, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
const botCol = '#' + MOOD.bgBot.toString(16).padStart(6, '0');
const floorFade = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshBasicMaterial({
    map: radial([[0, 'rgba(8,9,14,0.28)'], [0.5, 'rgba(8,9,14,0.72)'], [1, botCol]]),
    transparent: true, depthWrite: false,
  })
);
floorFade.rotateX(-Math.PI / 2);
floorFade.position.y = 0.001;
scene.add(floorFade);

// soft contact shadow blob under the car (grounds it on the reflection)
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: radial([[0, 'rgba(0,0,0,0.72)'], [0.55, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, opacity: 0.95,
  })
);
contact.rotateX(-Math.PI / 2);
contact.position.y = 0.002;
scene.add(contact);

// ---------------------------------------------------------------------------
// ENVIRONMENT — the real night HDRI assigned to scene.environment ONLY.
// ---------------------------------------------------------------------------
new RGBELoader().load(`${BASE}model/${MOOD.hdri}`, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.environmentIntensity = MOOD.envIntensity;
  scene.environmentRotation = new THREE.Euler(0, 2.1, 0);
});

// ---------------------------------------------------------------------------
// MATERIALS — ported from the verified Blender paint.
// ---------------------------------------------------------------------------
function tuneMaterials(root) {
  root.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    n.castShadow = true;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) {
      const name = (m.name || '').toLowerCase();
      if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name)) {
        m.clearcoat = 1.0; m.clearcoatRoughness = 0.07;
        m.roughness = Math.min(m.roughness ?? 0.32, 0.32);
        m.metalness = 0.6;
        m.envMapIntensity = 1.15;
        m.iridescence = 1.0;
        m.iridescenceIOR = 1.4;
        m.iridescenceThicknessRange = [180, 820];
        if (m.color) m.color.lerp(new THREE.Color(MOOD.paintBase), 0.6);
        m.sheen = 1.0; m.sheenRoughness = 0.4;
        m.sheenColor = new THREE.Color(0x2a5cff);
      } else if (/chrome|mirror|metal/.test(name)) {
        m.metalness = 1.0; m.roughness = Math.min(m.roughness ?? 0.18, 0.2);
        m.envMapIntensity = 1.2;
        if ('transmission' in m) { m.transmission = 0; m.transparent = false; }
      } else if (/glass|window|windscreen|windshield/.test(name)) {
        if ('transmission' in m) m.transmission = 0;
        m.metalness = 0; m.roughness = 0.06;
        m.color = new THREE.Color(0x080b10);
        m.envMapIntensity = 1.4; m.transparent = true; m.opacity = 0.52;
      } else if (/rubber|tyre|tire/.test(name)) {
        m.metalness = 0; m.roughness = Math.max(m.roughness ?? 0.7, 0.85);
      }
      if (/headlight|head_light|drl|led_lights/.test(name)) {
        m.emissive = new THREE.Color(0xfff1dc); m.emissiveIntensity = 1.15;
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
  const pad = aspect < 1 ? (1.4 / aspect) : 1.28;       // car bigger in frame
  const dist = maxDim * Math.min(pad, 2.4);
  const lift = aspect < 1 ? maxDim * 0.42 : maxDim * 0.24;
  camera.position.set(center.x + dist * 0.9, center.y + lift, center.z + dist * 1.02);
  controls.target.set(center.x, center.y * 0.85 + 0.18, center.z);
  controls.minDistance = maxDim * 0.8;
  controls.maxDistance = maxDim * 3.4;
  controls.update();
  contact.scale.set(size.x * 1.55, size.z * 1.75, 1);
  contact.position.set(center.x, 0.002, center.z);
}

// ---------------------------------------------------------------------------
// POST — bloom on real emitters only, then a final color-GRADE pass that ports
// the Blender grade preset (contrast / saturation / split-tone / vignette /
// grain) in display space, after the AgX view transform.
// ---------------------------------------------------------------------------
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: MOOD.grade.contrast },
    uSaturation: { value: MOOD.grade.saturation },
    uVignette: { value: MOOD.grade.vignette },
    uGrain: { value: MOOD.grade.grain },
    uShadowTint: { value: new THREE.Vector3(...MOOD.grade.shadowTint) },
    uHighTint: { value: new THREE.Vector3(...MOOD.grade.highTint) },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uContrast, uSaturation, uVignette, uGrain, uTime;
    uniform vec3 uShadowTint, uHighTint;
    float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // contrast around mid-grey
      c = (c - 0.5) * uContrast + 0.5;
      // saturation
      float l = luma(c);
      c = mix(vec3(l), c, uSaturation);
      // split-tone: tint shadows + highlights for the cinematic grade
      float lum = clamp(l, 0.0, 1.0);
      c += uShadowTint * (1.0 - lum) + uHighTint * lum;
      // vignette
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - uVignette * smoothstep(0.32, 0.9, d);
      // film grain
      float n = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

const composer = new EffectComposer(renderer);
composer.setPixelRatio(DPR);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  isMobile ? 0.12 : 0.16,  // gentle — only real emitters/rim highlights glow
  0.4,
  0.9
);
composer.addPass(bloom);
composer.addPass(new OutputPass());      // AgX tonemap + sRGB
const gradePass = new ShaderPass(GradeShader);
composer.addPass(gradePass);             // photographic finish, after AgX

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

// pause auto-rotate while dragging; resume after idle
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

let frame = 0;
function tick() {
  controls.update();
  gradePass.uniforms.uTime.value = (frame++ % 1024);
  composer.render();
  requestAnimationFrame(tick);
}
tick();
