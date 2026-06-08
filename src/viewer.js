import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { gsap } from 'gsap';

const BASE = import.meta.env.BASE_URL; // '/' in prod, './' for file:// probe builds

// ============================================================================
// JRV 911 — cinematic "attract reel" (NFS Most Wanted / Hot Pursuit grammar)
// ----------------------------------------------------------------------------
// A GSAP master timeline directs the camera in hard cuts through three ACTS,
// each lit by its OWN real Poly Haven HDRI (not a recoloured single map):
//   REVEAL (brown photo studio) → PURSUIT (modern-buildings NIGHT, world
//   rushing past) → GOLDEN HOUR (belfast sunset)
// — each with its own colour grade, light beats, audio envelope and transition
// vocabulary (hard cut · whip-pan motion-blur · slow-mo speed-ramp). Drag any
// time takes the wheel (OrbitControls); idle 6s and the reel resumes.
// Reduced-motion skips the reel entirely (gentle free-orbit, no audio, no FX).
//
// Honest constraint: the production GLB is ONE merged mesh (`GEO-gt3rs-merged`,
// 84 draw calls) — there are no separate wheel nodes, so per-wheel spin is not
// possible without a wheel-separated re-export. Speed is sold the way NFS sells
// it: the world scrolls under a near-static car + motion blur + speed lines +
// camera ramps. Lights DO pulse (real emissive beats by material name).
// ============================================================================

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const pctEl = document.getElementById('pct');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches;

// HUD elements (added in model.html). Guarded so the scene runs without them.
const hudAct = document.getElementById('hud-act');
const hudActName = document.getElementById('hud-act-name');
const soundBtn = document.getElementById('sound-toggle');

const DPR = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 1.75);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141414);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 400);
camera.position.set(4.2, 1.6, 5.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.4;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotateSpeed = 0.5;
controls.autoRotate = reduceMotion;
controls.enabled = true;

const rim = new THREE.DirectionalLight(0xbfd0ff, 0.3);
rim.position.set(-6, 4, -5);
scene.add(rim);

// ---------------------------------------------------------------------------
// Contact shadow (grounds the car on whatever floor the current act shows).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// ROAD (the SPEED / HERO act ground): a wet-asphalt plane whose texture scrolls
// under the near-static car to sell velocity. Procedural canvas = zero asset
// fetch, fully reliable. Hidden (opacity 0) until the SPEED act fades it in.
// ---------------------------------------------------------------------------
function roadTexture() {
  const w = 256, h = 1024, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // dark wet asphalt with a subtle vertical sheen
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, '#0a0c10'); base.addColorStop(0.5, '#15181e'); base.addColorStop(1, '#0a0c10');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  // speckle for tarmac grain
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * w, y = Math.random() * h, a = Math.random() * 0.06;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }
  // dashed centre line (warm, picks up the JRV orange under bloom)
  ctx.fillStyle = 'rgba(241,88,40,0.92)';
  const dash = 120, gap = 110;
  for (let y = -dash; y < h + dash; y += dash + gap) ctx.fillRect(w / 2 - 5, y, 10, dash);
  // solid lane edges
  ctx.fillStyle = 'rgba(230,230,230,0.5)';
  ctx.fillRect(26, 0, 5, h); ctx.fillRect(w - 31, 0, 5, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 8);
  t.anisotropy = 8;
  return t;
}
const roadTex = roadTexture();
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(26, 320),
  new THREE.MeshPhysicalMaterial({
    map: roadTex, roughness: 0.34, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.3,
    transparent: true, opacity: 0,
  })
);
road.rotateX(-Math.PI / 2);
road.position.y = 0.0;
road.renderOrder = -1;
road.visible = false;
scene.add(road);

// gradient backdrop (dome) for the SPEED/HERO acts — replaces the studio skybox.
function skyDomeTexture(top, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}
const dome = new THREE.Mesh(
  new THREE.SphereGeometry(160, 32, 16),
  new THREE.MeshBasicMaterial({ map: skyDomeTexture('#10131c', '#241a16'), side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false })
);
dome.visible = false;
scene.add(dome);

// ---------------------------------------------------------------------------
// NIGHT CITY (PURSUIT act). The night HDRI alone only lit + reflected — it never
// read as a city. This is the actual city you drive through: instanced building
// blocks with lit-window facades flanking the road, plus sodium/neon streetlight
// posts that the afterimage pass smears into light streaks as they rush past.
// The whole thing scrolls toward the camera synced to roadSpeed (car stays put,
// world moves — same trick as the road). Hidden until the SPEED act fades it in.
// ---------------------------------------------------------------------------
const CITY_DEPTH = 380;   // recycle length along z
const CITY_NEAR = 44;     // z past which an element wraps back to the far end
const cityGroup = new THREE.Group();
cityGroup.visible = false;
scene.add(cityGroup);

// dark facade with a grid of randomly-lit windows (used as BOTH colour + emissive)
function facadeTexture() {
  const w = 128, h = 256, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, w, h);
  const cols = 6, rows = 16, mx = 12, my = 10;
  const cw = (w - mx * 2) / cols, ch = (h - my * 2) / rows;
  const lit = ['#ffd8a0', '#ffe6c4', '#cfe0ff', '#a8bcff', '#fff0cf'];
  for (let r = 0; r < rows; r++) for (let cI = 0; cI < cols; cI++) {
    if (Math.random() < 0.5) continue;            // dark window
    ctx.fillStyle = lit[(Math.random() * lit.length) | 0];
    ctx.globalAlpha = 0.55 + Math.random() * 0.45;
    ctx.fillRect(mx + cI * cw + 2, my + r * ch + 2, cw - 4, ch - 4);
  }
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
}
const facade = facadeTexture();
const cityMat = new THREE.MeshStandardMaterial({
  map: facade, emissiveMap: facade, emissive: 0xffffff, emissiveIntensity: 0.85,
  roughness: 0.88, metalness: 0.0, transparent: true, opacity: 0,
});
const CITY_N = 60;
const cityZ = new Float32Array(CITY_N);
const cityData = [];
const cityMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cityMat, CITY_N);
cityMesh.frustumCulled = false;
const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3(), _cp = new THREE.Vector3();
for (let i = 0; i < CITY_N; i++) {
  const side = i % 2 === 0 ? -1 : 1;
  const bw = 6 + Math.random() * 11;
  const bd = 6 + Math.random() * 11;
  const bh = 12 + Math.random() * 46;
  const x = side * (15 + Math.random() * 26);
  cityData.push({ x, w: bw, d: bd, h: bh });
  cityZ[i] = CITY_NEAR - (i / CITY_N) * CITY_DEPTH - Math.random() * 6;
}
function placeCity() {
  for (let i = 0; i < CITY_N; i++) {
    const b = cityData[i];
    _cp.set(b.x, b.h / 2, cityZ[i]); _cs.set(b.w, b.h, b.d);
    _cm.compose(_cp, _cq, _cs); cityMesh.setMatrixAt(i, _cm);
  }
  cityMesh.instanceMatrix.needsUpdate = true;
}
placeCity();
cityGroup.add(cityMesh);

// streetlight / neon posts — bright unlit emissive so bloom + afterimage turn
// them into the light streaks that sell speed. Alternating sodium / neon hues.
const LAMP_N = 96;
const lampZ = new Float32Array(LAMP_N);
const lampData = [];
const lampMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false });
const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 3.4, 0.45), lampMat, LAMP_N);
lampMesh.frustumCulled = false;
const LAMP_HUES = [0xff9a3c, 0xff9a3c, 0xff3d7a, 0x30d6ff]; // mostly sodium, some neon
const _lc = new THREE.Color();
for (let i = 0; i < LAMP_N; i++) {
  const side = i % 2 === 0 ? -1 : 1;
  lampData.push({ x: side * 13.6, y: 5.4, hue: LAMP_HUES[(Math.random() * LAMP_HUES.length) | 0] });
  lampZ[i] = CITY_NEAR - (i / LAMP_N) * CITY_DEPTH;
  lampMesh.setColorAt(i, _lc.setHex(lampData[i].hue));
}
function placeLamps() {
  for (let i = 0; i < LAMP_N; i++) {
    const l = lampData[i];
    _cp.set(l.x, l.y, lampZ[i]); _cs.set(1, 1, 1);
    _cm.compose(_cp, _cq, _cs); lampMesh.setMatrixAt(i, _cm);
  }
  lampMesh.instanceMatrix.needsUpdate = true;
}
placeLamps();
cityGroup.add(lampMesh);

// advance the city toward the camera and wrap elements that pass behind it
function scrollCity(dt) {
  const adv = roadSpeed * dt * 13;
  if (adv <= 0) return;
  for (let i = 0; i < CITY_N; i++) { cityZ[i] += adv; if (cityZ[i] > CITY_NEAR) cityZ[i] -= CITY_DEPTH; }
  for (let i = 0; i < LAMP_N; i++) { lampZ[i] += adv; if (lampZ[i] > CITY_NEAR) lampZ[i] -= CITY_DEPTH; }
  placeCity(); placeLamps();
}
const cityFog = new THREE.Fog(0x070b16, 55, 330);  // applied only during PURSUIT

// ---------------------------------------------------------------------------
// IBL: studio HDRI (REVEAL) as a GroundedSkybox + sunset HDRI (SPEED/HERO) env.
// ---------------------------------------------------------------------------
const ENV_YAW = 2.2;
const SKY_HEIGHT = 6;
const SKY_RADIUS = 90;
let studioSky = null;
let studioEnv = null;
let sunsetEnv = null;
let nightEnv = null;

const rgbe = new RGBELoader();
rgbe.load(`${BASE}model/brown_photostudio_02_2k.hdr`, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  studioEnv = hdr;
  scene.environment = hdr;
  scene.environmentRotation = new THREE.Euler(0, ENV_YAW, 0);
  studioSky = new GroundedSkybox(hdr, SKY_HEIGHT, SKY_RADIUS);
  studioSky.position.y = SKY_HEIGHT;
  studioSky.rotation.y = ENV_YAW;
  studioSky.renderOrder = 0;
  studioSky.material.transparent = true;   // so we can crossfade it out for the drive
  scene.add(studioSky);
  scene.background = null;
  // if the reel already left the studio before this finished loading, keep it hidden
  if (currentAct && currentAct !== 'reveal') { studioSky.visible = false; studioSky.material.opacity = 0; }
});
rgbe.load(`${BASE}model/belfast_sunset_puresky_2k.hdr`, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  sunsetEnv = hdr;   // reflection env for the GOLDEN HOUR act
  if (currentAct === 'hero') scene.environment = hdr;
});
// PURSUIT act: a real night-city HDRI (modern_buildings_night, Poly Haven CC0)
// — its neon vertical streaks rake across the iridescent clearcoat, selling the
// chase far better than the recoloured sunset map it replaced.
rgbe.load(`${BASE}model/modern_buildings_night_2k.hdr`, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  nightEnv = hdr;
  if (currentAct === 'speed') scene.environment = hdr;
});

function frameObject(target) {
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z) || 1;
  const aspect = window.innerWidth / window.innerHeight;
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

// collect light materials for the emissive beats (verified names from the GLB)
const headMats = [];   // headlights + DRL (cool white)
const tailMats = [];   // tail + brake (red)

function tuneMaterials(root) {
  root.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) {
      const name = (m.name || '').toLowerCase();
      if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name)) {
        m.clearcoat = 1.0; m.clearcoatRoughness = 0.03;
        m.roughness = Math.min(m.roughness ?? 0.4, 0.12);
        m.envMapIntensity = 1.5;
        // iridescent thin-film paint (kept — Rj's call): hue shifts with angle.
        m.iridescence = 1.0;
        m.iridescenceIOR = 1.3;
        m.iridescenceThicknessRange = [130, 720];
        if (m.color) m.color.lerp(new THREE.Color(0x0b0d12), 0.55);
        m.metalness = Math.max(m.metalness ?? 0, 0.6);
      } else if (/chrome|mirror|metal/.test(name)) {
        m.metalness = 1.0; m.roughness = Math.min(m.roughness ?? 0.1, 0.12);
        m.envMapIntensity = 1.4;
        if ('transmission' in m) { m.transmission = 0; m.transparent = false; }
      } else if (/glass|window|windscreen|windshield/.test(name)) {
        if ('transmission' in m) m.transmission = 0;
        m.metalness = 0; m.roughness = 0.08;
        m.color = new THREE.Color(0x0a0d12);
        m.envMapIntensity = 1.3; m.transparent = true; m.opacity = 0.46;
      } else if (/rubber|tyre|tire|trim/.test(name)) {
        m.metalness = 0.0; m.roughness = Math.max(m.roughness ?? 0.6, 0.7);
      }
      // --- light groups: set an emissive COLOUR so the beats actually read ---
      if (/headlight|head_light|drl|led_lights/.test(name)) {
        m.emissive = new THREE.Color(0xfff1dc);
        m.emissiveIntensity = 1.4;
        headMats.push(m);
      } else if (/taillight|tail_light|backlight|brake/.test(name) || /(^|_)red(\.|$|_)/.test(name)) {
        m.emissive = new THREE.Color(0xff1414);
        m.emissiveIntensity = 1.6;
        tailMats.push(m);
      }
      m.needsUpdate = true;
    }
  });
}

// rack the lens to a given subject distance (world units). Hold shots open the
// aperture for a visible fall-off on the dome/road behind the car; whip/ramp
// shots stay near-sharp so the fast move reads. No-op on mobile (no bokeh pass).
function rackFocus(dist, aperture, dur = 1.1) {
  if (!bokeh) return;
  gsap.to(bokeh.uniforms['focus'], { value: dist, duration: dur, ease: 'power2.inOut' });
  gsap.to(bokeh.uniforms['aperture'], { value: aperture, duration: dur, ease: 'power2.inOut' });
}

// pulse a light group — used on shot beats (headlight ignition, brake flare)
function beat(group, peak, dur = 0.45) {
  if (!group.length) return;
  const o = { v: group[0].emissiveIntensity };
  gsap.to(o, {
    v: peak, duration: dur * 0.35, ease: 'power3.out', yoyo: true, repeat: 1,
    onUpdate: () => { for (const m of group) m.emissiveIntensity = o.v; },
  });
}

// ---------------------------------------------------------------------------
// POST-PROCESSING — the film look. Chain:
//   RenderPass → Bokeh DOF (rack-focus on holds) → Bloom (lights/sun)
//   → Afterimage (motion blur on whips)
//   → Grade (tint/contrast/sat/vignette/chromatic-aberration/grain) → Output
// Mobile drops the Bokeh + afterimage passes and runs bloom at lower strength.
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(DPR);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));

// Bokeh DOF: BokehPass takes the previous pass's colour + its own depth render,
// so it sits right after RenderPass. focus is in WORLD units (camera→subject
// distance); the director racks it per shot. Desktop only — it's a second
// full-scene (depth) render, too heavy for low-end mobile GPUs.
let bokeh = null;
if (!isMobile) {
  bokeh = new BokehPass(scene, camera, { focus: 6.0, aperture: 0.0009, maxblur: 0.006 });
  composer.addPass(bokeh);
}

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  isMobile ? 0.32 : 0.42,   // strength — restrained, so it's a glow not a wash
  0.5,                      // radius
  0.92                      // threshold — ONLY genuine highlights (lights/sun) bloom,
);                          // not the bright metallic paint reflecting the studio
composer.addPass(bloom);

let afterimage = null;
if (!isMobile) {
  afterimage = new AfterimagePass(0.0);   // damp animated up during whip-pans
  composer.addPass(afterimage);
}

// colour-grade + grain + vignette + chromatic aberration (the per-act mood)
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uLift: { value: new THREE.Color(0, 0, 0) },
    uContrast: { value: 1.0 },
    uSaturation: { value: 1.0 },
    uVignette: { value: 0.28 },
    uGrain: { value: 0.04 },
    uCA: { value: 0.0 },          // chromatic aberration (px-ish, anim on ramps)
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec3 uTint, uLift;
    uniform float uContrast, uSaturation, uVignette, uGrain, uCA, uTime;
    uniform vec2 uRes;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      // chromatic aberration: split channels radially (stronger toward edges)
      float ca = uCA / max(uRes.x, 1.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * ca * 1.0).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * ca * 1.0).b;
      // lift + tint + contrast
      col = col + uLift;
      col *= uTint;
      col = (col - 0.5) * uContrast + 0.5;
      // saturation
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      // vignette
      float vig = smoothstep(0.9, 0.25, length(d) * (1.0 + uVignette));
      col *= mix(1.0 - uVignette, 1.0, vig);
      // film grain
      float g = (hash(uv * uRes + uTime) - 0.5) * uGrain;
      col += g;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};
const grade = new ShaderPass(GradeShader);
grade.uniforms.uRes.value.set(window.innerWidth * DPR, window.innerHeight * DPR);
composer.addPass(grade);
composer.addPass(new OutputPass());

// per-act grade presets (gsap tweens uniforms between them on each act change)
const GRADES = {
  reveal: { tint: 0xfff2e6, lift: 0x040404, contrast: 1.04, sat: 1.04, vig: 0.26, grain: 0.03, ca: 0.0 },
  speed:  { tint: 0xbfe0ff, lift: 0x0a0600, contrast: 1.18, sat: 1.16, vig: 0.42, grain: 0.08, ca: 1.6 },
  hero:   { tint: 0xffd9a8, lift: 0x0c0602, contrast: 1.08, sat: 1.14, vig: 0.30, grain: 0.04, ca: 0.4 },
};
function applyGrade(name, dur = 1.0) {
  const g = GRADES[name]; if (!g) return;
  const tintC = new THREE.Color(g.tint), liftC = new THREE.Color(g.lift);
  gsap.to(grade.uniforms.uTint.value, { r: tintC.r, g: tintC.g, b: tintC.b, duration: dur, ease: 'power2.inOut' });
  gsap.to(grade.uniforms.uLift.value, { r: liftC.r, g: liftC.g, b: liftC.b, duration: dur, ease: 'power2.inOut' });
  gsap.to(grade.uniforms.uContrast, { value: g.contrast, duration: dur });
  gsap.to(grade.uniforms.uSaturation, { value: g.sat, duration: dur });
  gsap.to(grade.uniforms.uVignette, { value: g.vig, duration: dur });
  gsap.to(grade.uniforms.uGrain, { value: g.grain, duration: dur });
  gsap.to(grade.uniforms.uCA, { value: g.ca, duration: dur });
}

// ---------------------------------------------------------------------------
// WORLD / ACT state — crossfade between the studio (REVEAL) and the dusk/sunset
// street (SPEED/HERO). Driven by act-change callbacks on the timeline.
// ---------------------------------------------------------------------------
let roadSpeed = 0;            // texture scroll rate (anim per act)
let currentAct = null;
const ACT_LABELS = { reveal: 'REVEAL', speed: 'PURSUIT', hero: 'GOLDEN HOUR' };
const ACT_NUM = { reveal: '01', speed: '02', hero: '03' };

function setAct(name) {
  if (name === currentAct) return;
  currentAct = name;
  applyGrade(name, 1.1);
  if (hudActName) hudActName.textContent = ACT_LABELS[name] || '';
  if (hudAct) hudAct.textContent = ACT_NUM[name] || '';

  if (name === 'reveal') {
    if (studioEnv) scene.environment = studioEnv;
    road.visible = true;
    gsap.to(road.material, { opacity: 0, duration: 0.8, onComplete: () => { road.visible = false; } });
    gsap.to(dome.material, { opacity: 0, duration: 0.8, onComplete: () => { dome.visible = false; } });
    if (studioSky) { studioSky.visible = true; gsap.to(studioSky.material, { opacity: 1, duration: 1.0 }); }
    scene.fog = null;
    gsap.to(cityMat, { opacity: 0, duration: 0.6 });
    gsap.to(lampMat, { opacity: 0, duration: 0.6, onComplete: () => { cityGroup.visible = false; } });
    setRoadSpeed(0);
    setEngineSpeed(0.85);
  } else {
    // PURSUIT (night city) + GOLDEN HOUR (sunset) street. Fade studio out, road
    // + dome in, and reflect the act's OWN HDRI off the car.
    const env = name === 'hero' ? sunsetEnv : nightEnv;
    if (env) scene.environment = env;
    if (studioSky) gsap.to(studioSky.material, { opacity: 0, duration: 0.9, onComplete: () => { studioSky.visible = false; } });
    if (scene.background) scene.background = null;
    dome.visible = true;
    road.visible = true;
    // deep-night vs golden-hour dome tint (the HDRI carries the real reflections;
    // the dome is just the far backdrop gradient behind the road).
    const top = name === 'hero' ? '#1a1410' : '#05070e';
    const bot = name === 'hero' ? '#7a3d1c' : '#161b2c';
    dome.material.map = skyDomeTexture(top, bot);
    dome.material.map.needsUpdate = true;
    gsap.to(dome.material, { opacity: 1, duration: 1.0 });
    gsap.to(road.material, { opacity: 1, duration: 0.9 });
    if (name === 'speed') {
      setRoadSpeed(2.4); setEngineSpeed(1.85);
      // bring the actual night city up + night haze
      scene.fog = cityFog;
      cityGroup.visible = true;
      gsap.to(cityMat, { opacity: 1, duration: 1.1 });
      gsap.to(lampMat, { opacity: 1, duration: 1.1 });
    } else {
      setRoadSpeed(0.6); setEngineSpeed(1.15);
      // GOLDEN HOUR: no city, no fog
      scene.fog = null;
      gsap.to(cityMat, { opacity: 0, duration: 0.7 });
      gsap.to(lampMat, { opacity: 0, duration: 0.7, onComplete: () => { cityGroup.visible = false; } });
    }
  }
}
function setRoadSpeed(v) { gsap.to({ s: roadSpeed }, { s: v, duration: 1.0, onUpdate() { roadSpeed = this.targets()[0].s; } }); }

// ---------------------------------------------------------------------------
// AUDIO — engine loop (playbackRate = speed envelope) + tyre screech on the
// brake beat. Gated behind a user gesture (autoplay policy). Starts muted; the
// HUD sound toggle (or first drag) enables it.
// ---------------------------------------------------------------------------
let audioOn = false;
let engine = null, screech = null;
function initAudio() {
  if (engine) return;
  engine = new Audio(`${BASE}audio/engine.mp3`); engine.loop = true; engine.volume = 0.0; engine.preload = 'auto';
  screech = new Audio(`${BASE}audio/screech.mp3`); screech.volume = 0.0; screech.preload = 'auto';
}
function enableAudio() {
  initAudio();
  audioOn = true;
  engine.play().catch(() => {});
  gsap.to(engine, { volume: 0.32, duration: 1.2 });
  if (soundBtn) soundBtn.classList.add('on');
}
function disableAudio() {
  audioOn = false;
  if (engine) gsap.to(engine, { volume: 0, duration: 0.4, onComplete: () => engine.pause() });
  if (screech) screech.pause();
  if (soundBtn) soundBtn.classList.remove('on');
}
function setEngineSpeed(rate) {
  if (!engine) return;
  gsap.to(engine, { playbackRate: rate, duration: 1.2, ease: 'power2.inOut' });
}
function playScreech() {
  if (!audioOn || !screech) return;
  try { screech.currentTime = 0.3; screech.volume = 0.0; screech.play().catch(() => {}); } catch (e) {}
  gsap.to(screech, { volume: 0.45, duration: 0.1, yoyo: true, repeat: 1,
    onComplete: () => { try { screech.pause(); } catch (e) {} } });
}
if (soundBtn) {
  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    audioOn ? disableAudio() : enableAudio();
  });
}

// ---------------------------------------------------------------------------
// LOAD THE CAR
// ---------------------------------------------------------------------------
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const gltf = new GLTFLoader();
gltf.setDRACOLoader(draco);
gltf.load(
  `${BASE}model/porsche-gt3rs.glb`,
  (data) => {
    const root = data.scene;
    const stray = root.getObjectByName('Cube');
    if (stray) stray.parent.remove(stray);

    const pre = new THREE.Box3().setFromObject(root);
    root.position.y -= pre.min.y;

    tuneMaterials(root);
    scene.add(root);
    frameObject(root);

    const fitted = new THREE.Box3().setFromObject(root);
    const fc = fitted.getCenter(new THREE.Vector3());
    const fs = fitted.getSize(new THREE.Vector3());
    const fr = Math.max(fs.x, fs.z) || 1;
    cam.tx = controls.target.x; cam.ty = controls.target.y; cam.tz = controls.target.z;
    cam.px = camera.position.x; cam.py = camera.position.y; cam.pz = camera.position.z;
    cam.fov = camera.fov;
    director = buildDirector(fc, fr);
    if (mode !== 'reel') applyGrade('reveal', 0); else setAct('reveal');

    // verification hook: ?t=<seconds> pauses the reel at an absolute timeline
    // position (and forces the matching act) so each act can be captured
    // deterministically regardless of load time. No effect in normal use.
    const seek = parseFloat(new URLSearchParams(location.search).get('t'));
    if (!Number.isNaN(seek) && director) {
      const act = seek < 6.7 ? 'reveal' : seek < 16 ? 'speed' : 'hero';
      setAct(act);
      director.pause();
      director.time(seek);
    }

    if (loaderEl) {
      loaderEl.classList.add('gone');
      setTimeout(() => loaderEl.remove(), 600);
    }
  },
  (e) => { if (e.lengthComputable && pctEl) pctEl.textContent = String(Math.round((e.loaded / e.total) * 100)); },
  (err) => { console.error('GLB load failed', err); if (pctEl) pctEl.textContent = 'ERR'; }
);

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
  grade.uniforms.uRes.value.set(window.innerWidth * DPR, window.innerHeight * DPR);
});

// ---------------------------------------------------------------------------
// THE DIRECTOR — shots grouped into acts, each with a transition + beats.
// ---------------------------------------------------------------------------
const IDLE_MS = 6000;
let mode = reduceMotion ? 'control' : 'reel';
let director = null;
let idleT = 0;

const cam = { px: 4.2, py: 1.6, pz: 5.2, tx: 0, ty: 0.6, tz: 0, fov: 38 };

// shot: framing relative to car centre `c` / radius `r`. act drives the world +
// grade; transition: 'cut' (default) | 'whip' (motion-blur pre-roll) | 'ramp'
// (slow-mo). beat: 'head' | 'brake' fired at the shot's start.
function buildShots(c, r) {
  const at = (ox, oy, oz) => [c.x + ox * r, c.y + oy * r, c.z + oz * r];
  const tgt = (oy = 0.0) => [c.x, c.y + oy * r, c.z];
  // look DOWN the road (−z, where the city streams in from) — the chase angle
  const ahead = (oy = 0.06) => [c.x, c.y + oy * r, c.z - 9 * r];
  return [
    // ===== ACT I — REVEAL (studio) =====
    { act: 'reveal', beat: 'head', from: at(0.55, 0.16, 1.95), to: at(0.42, 0.22, 1.30), look: tgt(0.02), lookTo: tgt(0.04), fov: 36, fovTo: 30, dur: 2.6, ease: 'power2.out' },
    { act: 'reveal', from: at(-1.55, 0.10, 0.55), to: at(-1.55, 0.12, -0.65), look: tgt(0.05), fov: 42, fovTo: 42, dur: 2.4, ease: 'none' },
    { act: 'reveal', transition: 'whip', from: at(0.15, 2.05, 0.70), to: at(0.08, 1.45, 0.38), look: tgt(0.0), fov: 46, fovTo: 40, dur: 1.7, ease: 'power3.inOut' },
    // ===== ACT II — PURSUIT (night city, world rushing) =====
    // chase cam: low + behind, looking down the road into the oncoming city
    { act: 'speed', transition: 'whip', beat: 'head', from: at(0.22, 0.22, 2.95), to: at(-0.10, 0.30, 2.45), look: ahead(0.12), lookTo: ahead(0.06), fov: 60, fovTo: 52, dur: 3.0, ease: 'power2.out' },
    // low side track — car streaks past the lit storefronts/streetlights
    { act: 'speed', from: at(2.35, 0.12, -0.75), to: at(2.35, 0.16, 0.95), look: tgt(0.06), fov: 48, fovTo: 46, dur: 2.2, ease: 'none' },
    // brake slide — front 3/4, city walls behind, racked focus on the nose
    { act: 'speed', transition: 'ramp', beat: 'brake', from: at(-1.7, 0.26, 0.30), to: at(-1.5, 0.32, -0.30), look: tgt(0.06), fov: 42, fovTo: 36, dur: 2.4, ease: 'power3.out' },
    // ===== ACT III — GOLDEN HOUR (sunset hero) =====
    { act: 'hero', transition: 'whip', from: at(1.25, 0.32, -1.45), to: at(1.05, 0.40, -1.15), look: tgt(0.08), fov: 34, fovTo: 30, dur: 2.4, ease: 'power2.out' },
    { act: 'hero', from: at(1.25, 0.42, 1.35), to: at(1.55, 1.05, 1.70), look: tgt(0.10), lookTo: tgt(0.18), fov: 36, fovTo: 28, dur: 3.0, ease: 'power2.inOut' },
  ];
}

function buildDirector(c, r) {
  const shots = buildShots(c, r);
  const tl = gsap.timeline({ repeat: -1, paused: mode !== 'reel' });
  for (const s of shots) {
    const L0 = s.look, L1 = s.lookTo || s.look;
    // focus distance for this shot = camera-start → look-target distance, so the
    // car sits in the sharp plane; holds open the aperture, fast moves stay crisp.
    const fdist = Math.hypot(s.from[0] - L0[0], s.from[1] - L0[1], s.from[2] - L0[2]);
    const fap = (s.transition === 'whip' || s.transition === 'ramp') ? 0.0005 : 0.0015;
    // act + beat fire at the cut
    tl.call(() => {
      setAct(s.act);
      rackFocus(fdist, fap, 1.0);
      if (s.beat === 'head') beat(headMats, 6.0, 0.5);
      if (s.beat === 'brake') { beat(tailMats, 7.0, 0.6); playScreech(); }
      // whip-pan: spike the motion-blur damp, then ease it back down
      if (afterimage) {
        if (s.transition === 'whip') {
          afterimage.uniforms.damp.value = 0.82;
          gsap.to(afterimage.uniforms.damp, { value: 0.0, duration: 0.9, ease: 'power2.out' });
        } else if (s.transition === 'ramp') {
          afterimage.uniforms.damp.value = 0.55;
          gsap.to(afterimage.uniforms.damp, { value: 0.0, duration: 1.3, ease: 'power2.out' });
        }
      }
    });
    // hard CUT to the shot's start framing
    tl.set(cam, { px: s.from[0], py: s.from[1], pz: s.from[2], tx: L0[0], ty: L0[1], tz: L0[2], fov: s.fov });
    // slow-mo ramp dilates the in-shot move
    const dur = s.transition === 'ramp' ? s.dur * 1.5 : s.dur;
    tl.to(cam, {
      px: s.to[0], py: s.to[1], pz: s.to[2], tx: L1[0], ty: L1[1], tz: L1[2], fov: s.fovTo,
      duration: dur, ease: s.ease,
    });
  }
  return tl;
}

// ---------------------------------------------------------------------------
// CONTROL HANDOFF
// ---------------------------------------------------------------------------
function takeControl() {
  if (reduceMotion || mode === 'control') { clearTimeout(idleT); return; }
  mode = 'control';
  if (director) director.pause();
  controls.target.set(cam.tx, cam.ty, cam.tz);
  camera.position.set(cam.px, cam.py, cam.pz);
  camera.fov = cam.fov; camera.updateProjectionMatrix();
  controls.update();
}
function scheduleResume() {
  if (reduceMotion) return;
  clearTimeout(idleT);
  idleT = setTimeout(() => { mode = 'reel'; if (director) director.play(); }, IDLE_MS);
}
canvas.addEventListener('pointerdown', takeControl);
controls.addEventListener('start', takeControl);
controls.addEventListener('end', scheduleResume);

window.__info = () => ({
  calls: renderer.info.render.calls,
  tris: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  act: currentAct,
});

// ---------------------------------------------------------------------------
// RENDER LOOP
// ---------------------------------------------------------------------------
let t = 0;
function tick() {
  t += 0.016;
  grade.uniforms.uTime.value = t;
  // scroll the road to sell speed (only matters when it's visible)
  if (roadSpeed > 0.001) roadTex.offset.y -= roadSpeed * 0.016;
  if (cityGroup.visible) scrollCity(0.016);

  if (mode === 'control') {
    controls.update();
  } else {
    // handheld sway scales with the act's energy (more in PURSUIT)
    const amp = currentAct === 'speed' ? 0.03 : 0.012;
    const nx = Math.sin(t * 0.7) * amp;
    const ny = Math.cos(t * 0.9) * amp * 0.8;
    camera.position.set(cam.px + nx, cam.py + ny, cam.pz);
    if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }
  composer.render();
  requestAnimationFrame(tick);
}
tick();
