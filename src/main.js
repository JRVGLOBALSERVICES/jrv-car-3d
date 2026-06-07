import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- JRV brand palette (hex, lifted from jrv-systems-new + jrv_car_rental_front_new) ---
const JRV = {
  orange: 0xF15828,
  orangeHi: 0xF47A55,
  mint: 0x00FF88,
  navy: 0x0B0F1E,
  bone: 0xEFEAE0,
};

const canvas = document.getElementById('scene');
const headingEl = document.getElementById('heading');
const loader = document.getElementById('loader');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// deterministic capture overrides for screenshots:
//   ?still=1        freeze the cinematic on a hero 3/4
//   ?az=2.1&el=0.9  pin camera azimuth(rad)+elevation, ?dist=5.8 radius
const params = new URLSearchParams(location.search);
const still = params.has('still');
const azOverride = params.has('az') ? parseFloat(params.get('az')) : null;
const elOverride = params.has('el') ? parseFloat(params.get('el')) : null;
const distOverride = params.has('dist') ? parseFloat(params.get('dist')) : null;
const frozen = still || azOverride !== null;

// ===== renderer (raytracing-quality output pipeline) =====
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;        // lifted: brighter studio → glossier clearcoat read
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
RectAreaLightUniformsLib.init();

// ===== IBL — real auto-shop HDRI carries the garage reflections (reel 1) =====
// Used for reflections/lighting ONLY; the JRV dotted backdrop stays as background
// so the brand identity survives while the paint reads a true studio clearcoat.
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
new RGBELoader().load('model/autoshop_01_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const env = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = env;
  scene.environmentIntensity = 1.35;          // brighten HDRI reflections so the clearcoat has crisp light to mirror
  hdr.dispose();
});

// ===== camera =====
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
const LOOK_H = 0.55;                          // aim a touch above the floor (beltline)
const RIG = { az: 0.9, el: 0.62, dist: 5.7 }; // live azimuth/elevation/radius
let camScale = 1;

function fitCamera() {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  let scale = 1;
  if (aspect < 1) scale = 1 + (1 - aspect) * 1.15;        // portrait: pull back
  else if (aspect < 1.3) scale = 1 + (1.3 - aspect) * 0.5;
  camScale = scale;
  camera.updateProjectionMatrix();
}
fitCamera();

// ===== lighting =====
// HDRI does the ambient + general reflections; these sculpt + brand-tint, and the
// RectAreaLight strips throw the signature elongated streaks across the clearcoat.
scene.add(new THREE.AmbientLight(0x1a2233, 0.25));

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(3, 9.5, 2.5);               // high/overhead → short grounded shadow
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 24;
key.shadow.camera.left = -6; key.shadow.camera.right = 6;
key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
key.shadow.bias = -0.0004; key.shadow.radius = 4;
scene.add(key);

// overhead linear strip lights — the studio "tube" reflections on hood/roof/flanks
function strip(x, z, w, h, intensity) {
  const l = new THREE.RectAreaLight(0xfdfdff, intensity, w, h);   // ~6000K cool white
  l.position.set(x, 6.2, z);
  l.lookAt(x, 0, z);                          // face straight down at the car
  scene.add(l);
  return l;
}
strip(0, 1.6, 1.1, 7.0, 15);                 // long tube running the car's length
strip(0, -1.6, 1.1, 7.0, 15);                // bright = sharp specular streak on the clearcoat
strip(-3.2, 0, 0.9, 4.5, 7);                 // side accents
strip(3.2, 0, 0.9, 4.5, 7);

// cool rim for crisp edge separation — the brand orange already lives in the paint,
// so an orange rim only muddied it and pooled a hot wash on the floor. Raised + cool.
const rim = new THREE.DirectionalLight(0xdfe9ff, 0.85);
rim.position.set(-6, 6.5, -5);
scene.add(rim);

const fill = new THREE.PointLight(JRV.mint, 0.9, 12, 2);
fill.position.set(-3.8, 2.6, 3.5);           // faint mint kick on the shadow side only
scene.add(fill);

// neutral cool fill so the shadow side keeps detail (reel-1 stays neutral, not green)
const coolFill = new THREE.DirectionalLight(0xcfe0ff, 0.6);
coolFill.position.set(-4, 3, 5);
scene.add(coolFill);

// ===== polished-concrete floor (reel 1: subtle blurred reflections + contact shadow) =====
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.ShadowMaterial({ opacity: 0.55 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 96),
  new THREE.MeshStandardMaterial({
    color: 0x07090f, roughness: 0.34, metalness: 0.0, envMapIntensity: 0.9,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.002;
floor.receiveShadow = true;
scene.add(floor);

// ===== dotted blueprint backdrop (JRV motif, shared with ORI) =====
function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(122,140,170,0.5)';
  const step = 32;
  for (let x = step / 2; x < 256; x += step)
    for (let y = step / 2; y < 256; y += step) {
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(22, 22);
  return t;
}
// backdrop is a large cylinder so the dotted grid wraps behind the orbiting camera
const backdrop = new THREE.Mesh(
  new THREE.CylinderGeometry(26, 26, 30, 64, 1, true),
  new THREE.MeshBasicMaterial({
    map: makeDotTexture(), transparent: true, opacity: 0.22,
    side: THREE.BackSide, depthWrite: false,
  })
);
backdrop.position.y = 8;
scene.add(backdrop);

// ===== car =====
const carRoot = new THREE.Group();           // drift-sway pivot
scene.add(carRoot);
const BASE_YAW = -0.45;                       // resting 3/4 hero angle
const lampMats = [];
const wheels = [];                            // {pivot} groups spun each frame
let rearEmit = [];                            // car-local wheel smoke origins

// tight radial blob contact shadow that hugs the wheels (tracks heading)
function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
const blobTex = makeBlobTexture();

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(draco);

gltfLoader.load('model/porsche.glb', (gltf) => {
  const car = gltf.scene;
  car.updateMatrixWorld(true);

  // ---- strip the model's baked studio backdrop dish + flat shadow plane ----
  const junk = [];
  car.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const s = b.getSize(new THREE.Vector3());
    const flatGround = s.y < 0.05 && Math.max(s.x, s.z) > 2;
    const backdropMesh = /backdrop|studio|cyclo|ground|floor/i.test(o.name || '');
    if (flatGround || backdropMesh) junk.push(o);
  });
  junk.forEach((o) => o.removeFromParent());

  car.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    if (!m) return;
    const name = (m.name || '').toLowerCase();
    m.envMapIntensity = 1.3;

    if (/paint|coat|body/.test(name)) {
      // JRV-orange wet clearcoat. Two-layer car-paint: a saturated base coat
      // (low metalness so the orange stays vivid, not muddied to charcoal) under a
      // mirror-sharp clearcoat (clearcoat 1, near-zero roughness) that throws the
      // bright studio-strip streaks — that hard specular IS the "freshly coated" read.
      o.material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(JRV.orange),
        metalness: 0.3,
        roughness: 0.26,
        clearcoat: 1.0,
        clearcoatRoughness: 0.015,
        envMapIntensity: 1.8,
      });
    } else if (/glass|window/.test(name)) {
      m.transparent = true;
      m.opacity = 0.32;
      m.roughness = 0.04;
      m.metalness = 0.0;
      m.envMapIntensity = 2.2;
      m.color = new THREE.Color(0x0c1422);
    } else if (/light|lamp|head|tail/.test(name)) {
      m.emissive = new THREE.Color(0xfff2e0);
      m.emissiveIntensity = 1.6;
      m.toneMapped = false;
      lampMats.push(m);
    } else if (/rubber|tire|tyre/.test(name)) {
      m.roughness = 0.92;
      m.metalness = 0.0;
    } else if (/silver|chrome|rim|alloy/.test(name)) {
      m.metalness = 1.0;
      m.roughness = 0.16;
      m.envMapIntensity = 1.9;
    }
  });

  // center on origin, scale to a target length, drop wheels onto the floor (y=0)
  let box = new THREE.Box3().setFromObject(car);
  let size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.z);
  const targetLen = 4.4;
  car.scale.setScalar(targetLen / longest);

  box = new THREE.Box3().setFromObject(car);
  size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  car.position.x -= center.x;
  car.position.z -= center.z;
  car.position.y -= box.min.y;

  carRoot.add(car);

  // ---- best-effort wheel detection (geometry, not names): meshes whose centre
  // sits low. This Porsche groups each AXLE as one mesh (Cylinder000 = rear pair,
  // Cylinder001 = front pair, each ~1.7 wide spanning both wheels), so name-match
  // the wheel cylinders and cluster them by axle (front/rear) rather than into 4
  // corners. Spinning each axle group around its own X axis rolls all four wheels.
  car.updateMatrixWorld(true);
  const halfX = size.x / 2, halfZ = size.z / 2;
  const WHEEL_RE = /cylinder|wheel|tyre|tire|\brim\b|alloy|brake|disc|disk|hub|caliper/i;
  const wheelMeshes = [];
  car.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const c = b.getCenter(new THREE.Vector3());
    const sz = b.getSize(new THREE.Vector3());
    const named = WHEEL_RE.test(o.name || '');
    // strict geometric fallback: low + round cross-section (sy≈sz) + not a flat panel
    const round = sz.y > 0.12 && Math.abs(sz.y - sz.z) < sz.y * 0.5 && sz.x < size.x * 0.95;
    if (c.y < size.y * 0.45 && (named || round)) wheelMeshes.push({ o, c });
  });
  // cluster by Z (front axle vs rear axle); spin whatever axle groups we find
  const carCz = box.getCenter(new THREE.Vector3()).z;
  const axles = [
    wheelMeshes.filter((w) => w.c.z >= carCz),
    wheelMeshes.filter((w) => w.c.z < carCz),
  ].filter((g) => g.length);
  for (const group of axles) {
    const wc = group.reduce((a, m) => a.add(m.c.clone()), new THREE.Vector3()).divideScalar(group.length);
    const pivot = new THREE.Group();
    pivot.position.copy(carRoot.worldToLocal(wc.clone()));
    carRoot.add(pivot);
    for (const m of group) pivot.attach(m.o);            // attach() preserves world xform
    wheels.push(pivot);
  }

  // smoke origins (car-local): all four wheel footprint corners at ground level,
  // so a hard drift smokes regardless of which Z end the model treats as rear.
  rearEmit = [
    new THREE.Vector3(-halfX * 0.62, 0.18, halfZ * 0.55),
    new THREE.Vector3(halfX * 0.62, 0.18, halfZ * 0.55),
    new THREE.Vector3(-halfX * 0.62, 0.18, -halfZ * 0.55),
    new THREE.Vector3(halfX * 0.62, 0.18, -halfZ * 0.55),
  ];

  // blob contact shadow sized to footprint, parented so it tracks heading
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 1.6, size.z * 1.3),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.82, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.014;
  carRoot.add(blob);

  loader.classList.add('gone');
}, undefined, (err) => {
  console.error('GLB load failed', err);
  loader.querySelector('span').innerHTML = 'COULD NOT LOAD <b>911</b>';
});

// ===== tire smoke (reel 2 drift drama) — sprite pool emitted from rear wheels =====
function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(225,228,235,0.9)');
  g.addColorStop(0.4, 'rgba(200,205,215,0.5)');
  g.addColorStop(1, 'rgba(200,205,215,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const smokeTex = makeSmokeTexture();
const SMOKE_N = 90;
const smoke = [];
const smokeGroup = new THREE.Group();
scene.add(smokeGroup);
for (let i = 0; i < SMOKE_N; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: smokeTex, transparent: true, opacity: 0, depthWrite: false,
    color: 0xc7ccd6,
  }));
  s.visible = false;
  s.userData = { life: 0, max: 0, vy: 0, vx: 0, vz: 0, spin: 0 };
  smokeGroup.add(s);
  smoke.push(s);
}
let smokeCursor = 0;
const _emit = new THREE.Vector3();
function emitSmoke(localPt, drift) {
  const s = smoke[smokeCursor];
  smokeCursor = (smokeCursor + 1) % SMOKE_N;
  _emit.copy(localPt);
  carRoot.localToWorld(_emit);
  s.position.copy(_emit);
  s.position.x += (Math.random() - 0.5) * 0.3;
  s.position.z += (Math.random() - 0.5) * 0.3;
  s.userData.max = 1.1 + Math.random() * 0.8;
  s.userData.life = s.userData.max;
  s.userData.vy = 0.35 + Math.random() * 0.4;
  s.userData.vx = (Math.random() - 0.5) * 0.9 - drift * 0.6;
  s.userData.vz = (Math.random() - 0.5) * 0.9 + 0.5;
  s.userData.spin = (Math.random() - 0.5) * 0.6;
  s.scale.setScalar(0.5 + Math.random() * 0.4);
  s.material.opacity = 0;
  s.material.rotation = Math.random() * Math.PI;
  s.visible = true;
}

// ===== postprocessing (bloom on headlights / brand rim) =====
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.6, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ===== pointer parallax (subtle nudge on top of the cinematic) =====
const ptr = { x: 0, y: 0 }, ptrCur = { x: 0, y: 0 };
if (!frozen) {
  const onMove = (cx, cy) => { ptr.x = (cx / innerWidth) * 2 - 1; ptr.y = (cy / innerHeight) * 2 - 1; };
  addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
}

// ===== cinematic camera timeline (reel 2: smooth orbits + whip-pan snaps) =====
// each leg tweens az/el/dist from the previous keyframe over `dur` with `ease`.
const TAU = Math.PI * 2;
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
// az: 0=front, +ve swings clockwise. Mix long smooth orbits with fast snaps.
const TIMELINE = [
  { az: 0.85, el: 0.60, dist: 5.7, dur: 3.4, ease: easeInOutSine },  // front-right → settle
  { az: 1.95, el: 0.50, dist: 5.5, dur: 3.2, ease: easeInOutSine },  // orbit to right side
  { az: 3.55, el: 0.78, dist: 5.9, dur: 0.55, ease: easeOutExpo },   // SNAP to rear-left
  { az: 4.55, el: 0.55, dist: 5.6, dur: 3.0, ease: easeInOutCubic }, // orbit rear→rear-right
  { az: 6.10, el: 0.92, dist: 6.1, dur: 0.5, ease: easeOutExpo },    // SNAP toward front (hi)
  { az: 6.28 + 0.85, el: 0.60, dist: 5.7, dur: 3.0, ease: easeInOutSine }, // glide back to start (≡ leg 0)
];
let legIdx = 0, legT = 0;
let prevKey = { az: TIMELINE[0].az, el: TIMELINE[0].el, dist: TIMELINE[0].dist };

function advanceCinematic(dt) {
  const leg = TIMELINE[legIdx];
  legT += dt / leg.dur;
  let k = Math.min(legT, 1);
  const e = leg.ease(k);
  RIG.az = prevKey.az + (leg.az - prevKey.az) * e;
  RIG.el = prevKey.el + (leg.el - prevKey.el) * e;
  RIG.dist = prevKey.dist + (leg.dist - prevKey.dist) * e;
  if (legT >= 1) {
    legT = 0;
    prevKey = { az: leg.az % TAU, el: leg.el, dist: leg.dist };
    legIdx = (legIdx + 1) % TIMELINE.length;
    // keep prevKey.az continuous with the next leg's frame of reference
    if (legIdx === 0) prevKey.az = TIMELINE[TIMELINE.length - 1].az % TAU;
  }
}

const _camPos = new THREE.Vector3();
function applyCam() {
  const s = camScale;
  const az = RIG.az + ptrCur.x * 0.18;          // pointer nudges azimuth a touch
  const el = Math.max(0.2, RIG.el - ptrCur.y * 0.25);
  const d = RIG.dist * s;
  _camPos.set(Math.sin(az) * d, el * s + 0.35, Math.cos(az) * d);
  camera.position.copy(_camPos);
  camera.lookAt(0, LOOK_H, 0);
}

// ===== loop =====
const clock = new THREE.Clock();
let driftPhase = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // pointer easing
  ptrCur.x += (ptr.x - ptrCur.x) * 0.06;
  ptrCur.y += (ptr.y - ptrCur.y) * 0.06;

  // ---- camera ----
  if (frozen) {
    RIG.az = azOverride ?? 0.85;
    RIG.el = elOverride ?? 0.6;
    RIG.dist = distOverride ?? 5.7;
  } else if (!reduceMotion) {
    advanceCinematic(dt);
  } else {
    RIG.az = 0.85; RIG.el = 0.62; RIG.dist = 5.7;   // static hero
  }
  applyCam();

  // ---- car drift-sway (subtle ± yaw so it feels alive while the camera flies) ----
  let drift = 0;
  if (!frozen && !reduceMotion) {
    driftPhase += dt;
    drift = Math.sin(driftPhase * 0.9) * 0.14 + Math.sin(driftPhase * 2.3) * 0.04;
  }
  carRoot.rotation.y = BASE_YAW + drift;
  carRoot.rotation.z = -drift * 0.05;

  // ---- wheels spin (rolling) ----
  if (!reduceMotion && !frozen) {
    const ws = 9.0;
    for (const w of wheels) w.rotation.x += ws * dt;
  }

  // ---- tire smoke from rear wheels, scaled by drift intensity ----
  if (!reduceMotion && !frozen && rearEmit.length) {
    const intensity = 0.5 + Math.abs(Math.sin(driftPhase * 0.9)) * 1.0;
    const rate = intensity * 3.2;               // particles this frame (fractional)
    if (Math.random() < rate * dt * 12) {
      emitSmoke(rearEmit[Math.random() < 0.5 ? 0 : 1], drift);
    }
  }
  for (const s of smoke) {
    if (!s.visible) continue;
    const u = s.userData;
    u.life -= dt;
    if (u.life <= 0) { s.visible = false; s.material.opacity = 0; continue; }
    s.position.x += u.vx * dt;
    s.position.y += u.vy * dt;
    s.position.z += u.vz * dt;
    u.vy *= 0.985;
    const age = 1 - u.life / u.max;             // 0→1
    s.scale.setScalar((0.5 + age * 2.4));
    s.material.opacity = Math.sin(Math.min(age, 1) * Math.PI) * 0.34;  // fade in/out
    s.material.rotation += u.spin * dt;
  }

  // ---- headlight breathing pulse ----
  const pulse = reduceMotion ? 1.6 : 1.5 + Math.sin(t * 2.2) * 0.5;
  for (const m of lampMats) m.emissiveIntensity = pulse;

  // ---- HUD: camera heading around the car, wrapped 0–359 ----
  let deg = ((RIG.az * 180 / Math.PI) % 360 + 360) % 360;
  if (headingEl) headingEl.textContent = `${String(Math.round(deg)).padStart(3, '0')}°`;

  composer.render();
}
animate();

// ===== resize =====
addEventListener('resize', () => {
  fitCamera();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);
composer.setSize(innerWidth, innerHeight);
