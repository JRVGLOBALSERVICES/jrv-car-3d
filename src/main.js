import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- JRV brand palette ---
const JRV = {
  orange: 0xF15828,
  mint: 0x00FF88,
};

const canvas = document.getElementById('scene');
const headingEl = document.getElementById('heading');
const loader = document.getElementById('loader');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// capture overrides for deterministic screenshots:
//   ?still=1            freeze on the hero 3/4 (full, post-reveal)
//   ?clay=1             hold the clay-render reveal (tight front-wheel framing)
//   ?az=..&el=..&dist=.. pin the orbit rig
const params = new URLSearchParams(location.search);
const still = params.has('still');
const azOverride = params.has('az') ? parseFloat(params.get('az')) : null;
const elOverride = params.has('el') ? parseFloat(params.get('el')) : null;
const distOverride = params.has('dist') ? parseFloat(params.get('dist')) : null;
const frozen = still || azOverride !== null;
const holdClay = params.has('clay');

// ===== renderer =====
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// reveal state machine: 'load' → 'clay' (grey turntable tight on the front wheel,
// % counter ticking) → SNAP → 'pull' (camera dollies back to the hero 3/4) → 'done'
// (cinematic orbit). Mirrors the reference: tight clay open, snap to full render, pull back.
let phase = 'load';
let revealed = false;
let carModel = null;
let clayT = 0;
const CLAY_DUR = 2.0;
let pullT = 0;
const PULL_DUR = 2.6;

// ===== IBL — overcast FOREST HDRI (matches the rain-soaked woodland reference) =====
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let forestEnv = null;
let forestEquirect = null;
new RGBELoader().load('model/niederwihl_forest_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  forestEquirect = hdr;
  forestEnv = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = forestEnv;           // reflections live from the start so the clay reads as a real studio
  scene.environmentIntensity = 1.0;
  if (revealed) applyForestBackground();
});

scene.background = new THREE.Color(0x20262a);   // neutral render-studio grey behind the clay

function applyForestBackground() {
  if (!forestEquirect) return;
  scene.environmentIntensity = 1.25;
  scene.background = forestEquirect;
  scene.backgroundBlurriness = 0.32;            // defocused depth — NOT a smeared dome
  scene.backgroundIntensity = 0.7;
  scene.fog = new THREE.FogExp2(0x141a14, 0.016);
}

// the SNAP: clay → real PBR + forest bg + rain
function snapToReal() {
  if (revealed) return;
  revealed = true;
  if (carModel) carModel.traverse((o) => {
    if (o.isMesh && o.userData.realMat) o.material = o.userData.realMat;
  });
  applyForestBackground();
  rain.visible = true;
  const fl = document.getElementById('flash');
  if (fl) { fl.classList.add('fire'); setTimeout(() => fl.classList.remove('fire'), 420); }
  const ld = document.getElementById('loader');
  if (ld) ld.classList.add('gone');
  phase = frozen || reduceMotion ? 'done' : 'pull';
  pullT = 0;
}

// ===== camera =====
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const LOOK_H = 0.62;                          // hero aim height (beltline)
const RIG = { az: 0.85, el: 0.6, dist: 6.0 };
let camScale = 1;

function fitCamera() {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  let scale = 1;
  if (aspect < 1) scale = 1 + (1 - aspect) * 2.1;        // portrait: pull back hard so the whole car fits
  else if (aspect < 1.3) scale = 1 + (1.3 - aspect) * 0.7;
  camScale = scale;
  camera.updateProjectionMatrix();
}
fitCamera();

// ===== lighting — soft overcast studio (HDRI carries reflections; lights add shape) =====
scene.add(new THREE.AmbientLight(0x2a3340, 0.25));

const key = new THREE.DirectionalLight(0xfbfdff, 1.6);
key.position.set(3, 9, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 24;
key.shadow.camera.left = -5; key.shadow.camera.right = 5;
key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
key.shadow.bias = -0.0004; key.shadow.radius = 6;
scene.add(key);

const skyFill = new THREE.DirectionalLight(0xcfe0ff, 0.5);
skyFill.position.set(-5, 4, -4);
scene.add(skyFill);

// rim from behind to carve the silhouette off the dark forest
const rim = new THREE.DirectionalLight(0xeaf2ff, 0.8);
rim.position.set(-2, 3, -7);
scene.add(rim);

// soft front fill — lifts the car's face out of shadow at ANY orbit angle once
// you start dragging the camera around (the 3-point rig alone leaves the rear
// dark when you swing behind it). Kept low so the HDRI still leads.
const frontFill = new THREE.DirectionalLight(0xffffff, 0.45);
frontFill.position.set(0, 3.5, 8);
scene.add(frontFill);

// ONE brand accent — a warm JRV-orange kiss along the near flank. Restraint:
// a single tinted light reads as a signature glint on the wet paint, not a
// stage-gel disco. No second colour gel (that's the AI-slop tell).
const accent = new THREE.DirectionalLight(JRV.orange, 0.5);
accent.position.set(6, 2.2, 3.5);
scene.add(accent);

// ===== wet floor (mirror-dark asphalt, like the reference's rain-soaked road) =====
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.ShadowMaterial({ opacity: 0.5 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// wide dark wet apron fills the void out to the fog so we never see canvas edge
const apron = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.22, metalness: 0.3, envMapIntensity: 0.9 })
);
apron.rotation.x = -Math.PI / 2;
apron.position.y = -0.004;
apron.receiveShadow = true;
scene.add(apron);

// ===== wet ROAD strip — scrolls under the car to read as forward motion =====
// roadGroup is re-aimed every frame to the car's true heading (see loop), so the
// lane dashes always flow straight down the car's travel axis.
const roadTex = makeRoadTexture();
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
roadTex.repeat.set(1, 16);                 // many dash cycles down the length
roadTex.anisotropy = 8;
const roadGroup = new THREE.Group();
scene.add(roadGroup);
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(7.2, 90),
  new THREE.MeshStandardMaterial({
    map: roadTex, color: 0xffffff,
    roughness: 0.16, metalness: 0.5, envMapIntensity: 1.35,
  })
);
road.rotation.x = -Math.PI / 2;
road.position.y = -0.001;
road.receiveShadow = true;
roadGroup.add(road);
const ROAD_SPEED = 2.4;                     // texture units / sec — the sense of speed

// ===== falling rain =====
const RAIN_N = 1400;
const RAIN_LEN = 0.5;
const RAIN_BOX = { x: 18, z: 18, yTop: 18, yBot: -0.5 };
const rainPos = new Float32Array(RAIN_N * 2 * 3);
const rainSpeed = new Float32Array(RAIN_N);
for (let i = 0; i < RAIN_N; i++) {
  const x = (Math.random() * 2 - 1) * RAIN_BOX.x;
  const z = (Math.random() * 2 - 1) * RAIN_BOX.z;
  const y = Math.random() * (RAIN_BOX.yTop - RAIN_BOX.yBot) + RAIN_BOX.yBot;
  const o = i * 6;
  rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
  rainPos[o + 3] = x; rainPos[o + 4] = y - RAIN_LEN; rainPos[o + 5] = z;
  rainSpeed[i] = 16 + Math.random() * 12;
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(
  rainGeo,
  new THREE.LineBasicMaterial({ color: 0xb6c4d2, transparent: true, opacity: 0.0, depthWrite: false })
);
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);

// ===== car =====
const carRoot = new THREE.Group();
scene.add(carRoot);
let BASE_YAW = -0.5;
const lampMats = [];
const wheels = [];                 // 4 hub pivots, spun each frame
const rearWheels = [];             // the 2 rear pivots — smoke emitters
const localForward = new THREE.Vector3(0, 0, 1);  // car travel axis in carRoot-local space
let frontWheelWorld = new THREE.Vector3(1.2, 0.35, 1.6);  // tight-reveal target (replaced on load)

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(draco);

gltfLoader.load('model/porsche-gt3rs.glb', (gltf) => {
  const car = gltf.scene;
  car.updateMatrixWorld(true);

  // shared flat clay for the WIP-render phase
  const clayMat = new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.92, metalness: 0.0 });

  car.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const matName = (mats[0]?.name || '').toLowerCase();
    o.userData.realMat = buildRealMat(matName, mats[0]);
    o.material = clayMat;
  });

  function buildRealMat(name, m) {
    m.envMapIntensity = 1.4;
    // tyres — the GLB ships them as a shiny semi-metal (metalness 0.43, rough 0.23),
    // so under the forest HDRI they mirror the env and read grey/shiny instead of black
    // (worst on the front pair facing the key light). Force matte black rubber.
    if (/scene_-_root/.test(name)) {
      m.metalness = 0.0; m.roughness = 0.93;
      m.color = new THREE.Color(0x08080a);
      m.envMapIntensity = 0.25;
      m.clearcoat = 0.0;
      return m;
    }
    if (/carpaint/.test(name)) {
      // clean automotive gloss — JRV orange base under a mirror clearcoat. NO droplet
      // normal (that read as noise/dirt); crisp HDRI reflections sell the wet shine.
      const p = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(JRV.orange),
        metalness: 0.55, roughness: 0.22,
        clearcoat: 1.0, clearcoatRoughness: 0.045,
        envMapIntensity: 2.1,
      });
      return p;
    }
    if (/(?<!head|tail|brake)glass|blackglass|glass_int/.test(name) || name === 'twixer_992_glass.002' || /glass\.\d/.test(name)) {
      // tinted automotive glass. Low roughness + high envMap made the whole
      // greenhouse mirror the bright sky and blow out to a solid white pane
      // (read as "broken windscreen"). Soften the reflection and add body so it
      // reads as dark tinted glass you can see the cabin through.
      m.transparent = true; m.opacity = 0.62; m.roughness = 0.14; m.metalness = 0.0;
      m.color = new THREE.Color(0x090d13); m.envMapIntensity = 0.9; m.depthWrite = false;
      return m;
    }
    if (/headlight|taillight|brakelight|led_light|running/.test(name)) {
      m.emissive = new THREE.Color(/tail|brake/.test(name) ? 0xff2a18 : 0xfff3e2);
      m.emissiveIntensity = /tail|brake/.test(name) ? 1.4 : 1.9;
      m.toneMapped = false;
      lampMats.push(m);
      return m;
    }
    if (/carbon|carbon_roof/.test(name)) {
      m.metalness = 0.55; m.roughness = 0.34; m.color = new THREE.Color(0x121316);
      m.envMapIntensity = 1.7; m.clearcoat = 0.6; m.clearcoatRoughness = 0.2;
      return m;
    }
    if (/chrome|antichrome|metal_radiator|exhausttip/.test(name)) {
      // The wing-mirror face + window trim are chrome. The GLB ships antichrome
      // as an alphaMode:BLEND material (opacity ~0.17), so GLTFLoader left it
      // transparent — the mirror face rendered as a see-through stub. Force it
      // opaque, and soften the reflection so the mirror doesn't blow to white.
      m.metalness = 1.0; m.roughness = 0.26; m.envMapIntensity = 1.15;
      m.transparent = false; m.opacity = 1;
      return m;
    }
    if (/gt3rs_black|plastic_mgl|^twixer_992\.001$/.test(name)) {
      // wheel rims / dark exterior trim — matte graphite, catches a crisp edge
      m.metalness = 0.85; m.roughness = 0.4; m.envMapIntensity = 1.5;
      if (!/plastic_mgl/.test(name)) m.color = new THREE.Color(0x111317);
      return m;
    }
    return m;
  }

  // center + scale + drop wheels to floor
  let box = new THREE.Box3().setFromObject(car);
  let size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.z);
  car.scale.setScalar(4.45 / longest);

  box = new THREE.Box3().setFromObject(car);
  size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  car.position.x -= center.x;
  car.position.z -= center.z;
  car.position.y -= box.min.y;

  // orient the longest axis along Z so the hero 3/4 reads as a side-front
  if (size.x > size.z) carRoot.rotation.y = Math.PI / 2;
  carRoot.add(car);
  carRoot.updateMatrixWorld(true);

  // ---- per-wheel spin: bucket rim+tyre meshes into 4 corners, each its own hub pivot ----
  // This is the front-rim fix: every wheel rotates about ITS OWN hub center (not a shared
  // axle-pair pivot), so front and rear roll identically. Width axis = the shorter span.
  const spinAxis = size.x < size.z ? 'x' : 'z';
  // GLTFLoader names the mesh primitives "Object_N"; the descriptive "wheels_20x9"
  // label lives on a PARENT group — so test the ancestor chain, not o.name.
  const isWheelPart = (obj) => {
    let n = obj;
    for (let i = 0; i < 5 && n; i++) { if (/wheels_20x9/i.test(n.name || '')) return true; n = n.parent; }
    return false;
  };
  const buckets = new Map();        // "sx_sz" -> [meshes]
  car.traverse((o) => {
    if (!o.isMesh) return;
    if (!isWheelPart(o)) return;
    const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const lc = carRoot.worldToLocal(c.clone());
    const k = `${lc.x >= 0 ? 'R' : 'L'}_${lc.z >= 0 ? 'F' : 'B'}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(o);
  });
  const frontLocal = new THREE.Vector3(), rearLocal = new THREE.Vector3();
  let nF = 0, nR = 0;
  for (const [k, group] of buckets.entries()) {
    const wb = new THREE.Box3();
    for (const m of group) wb.expandByObject(m);
    const wc = wb.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.copy(carRoot.worldToLocal(wc.clone()));
    pivot.userData.rear = k.endsWith('B');     // bucket key R_F / L_B etc.
    carRoot.add(pivot);
    for (const m of group) pivot.attach(m);
    wheels.push(pivot);
    if (pivot.userData.rear) { rearLocal.add(pivot.position); nR++; }
    else { frontLocal.add(pivot.position); nF++; }
    if (pivot.userData.rear) rearWheels.push(pivot);
  }
  wheels.spinAxis = spinAxis;
  // car forward axis in carRoot-LOCAL space (front-axle mid → rear-axle mid, negated = travel dir)
  if (nF && nR) {
    frontLocal.multiplyScalar(1 / nF); rearLocal.multiplyScalar(1 / nR);
    localForward.copy(frontLocal).sub(rearLocal); localForward.y = 0; localForward.normalize();
  }

  // a front wheel world-center for the tight reveal framing (pick the +Z, +X corner)
  let best = null;
  for (const p of wheels) {
    const w = p.getWorldPosition(new THREE.Vector3());
    if (!best || (w.z + w.x) > (best.z + best.x)) best = w;
  }
  if (best) frontWheelWorld.copy(best);

  // contact shadow blob hugging the footprint
  const blobTex = makeBlobTexture();
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 2.0, size.z * 2.0),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.8, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  carRoot.add(blob);

  carModel = car;

  if (frozen || reduceMotion) {
    snapToReal();
    loader.classList.add('gone');
  } else {
    phase = 'clay';
    document.getElementById('loader').classList.add('revealing');
  }
}, undefined, (err) => {
  console.error('GLB load failed', err);
  const lbl = loader.querySelector('.rev-label');
  if (lbl) lbl.innerHTML = 'COULD NOT LOAD <b>911</b>';
});

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 126);
  g.addColorStop(0, 'rgba(0,0,0,0.8)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.4)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// wet-asphalt road with a dashed centre line + faint lane edges — tiles down its length
function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const ctx = c.getContext('2d');
  // asphalt base with subtle speckle
  ctx.fillStyle = '#0a0d11'; ctx.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 2600; i++) {
    const v = 8 + Math.floor(Math.random() * 22);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},${0.25 + Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 1024, 1.4, 1.4);
  }
  // lane edge lines
  ctx.fillStyle = 'rgba(190,196,205,0.5)';
  ctx.fillRect(26, 0, 5, 1024);
  ctx.fillRect(225, 0, 5, 1024);
  // dashed centre line (2 dashes per tile so it reads fast)
  ctx.fillStyle = 'rgba(225,210,150,0.78)';
  ctx.fillRect(123, 80, 10, 240);
  ctx.fillRect(123, 592, 10, 240);
  return new THREE.CanvasTexture(c);
}

// soft smoke puff (greyscale radial)
function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(225,227,230,0.95)');
  g.addColorStop(0.45, 'rgba(165,170,178,0.5)');
  g.addColorStop(1, 'rgba(140,145,152,0)');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
  return new THREE.CanvasTexture(c);
}

// ===== smoke pool — billboard sprites trailing off the rear wheels (the "moving" tell) =====
const SMOKE_N = 150;
const smokeTex = makeSmokeTexture();
const smokeSprites = [];
const smokeState = [];
for (let i = 0; i < SMOKE_N; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: smokeTex, transparent: true, depthWrite: false, opacity: 0, color: 0x9aa0a8,
  }));
  s.scale.set(0.001, 0.001, 1);
  s.visible = false;
  scene.add(s);
  smokeSprites.push(s);
  smokeState.push({ active: false, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0.2, s1: 1, peak: 0.4 });
}
let smokeCursor = 0;
function emitSmoke(px, py, pz, back) {
  const st = smokeState[smokeCursor], sp = smokeSprites[smokeCursor];
  smokeCursor = (smokeCursor + 1) % SMOKE_N;
  st.active = true; st.life = 0; st.max = 0.9 + Math.random() * 0.7;
  sp.position.set(px + (Math.random() - 0.5) * 0.22, py + Math.random() * 0.08, pz + (Math.random() - 0.5) * 0.22);
  st.vx = back.x * (1.7 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.35;   // trail BACK, away from the car
  st.vz = back.z * (1.7 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.35;
  st.vy = 0.28 + Math.random() * 0.5;
  st.s0 = 0.12 + Math.random() * 0.1;
  st.s1 = 0.7 + Math.random() * 0.6;
  st.peak = 0.14 + Math.random() * 0.16;
  sp.visible = true;
}
function updateSmoke(dt) {
  for (let i = 0; i < SMOKE_N; i++) {
    const st = smokeState[i];
    if (!st.active) continue;
    const sp = smokeSprites[i];
    st.life += dt;
    const p = st.life / st.max;
    if (p >= 1) { st.active = false; sp.visible = false; continue; }
    st.vy += dt * 0.22;            // buoyancy
    sp.position.x += st.vx * dt;
    sp.position.y += st.vy * dt;
    sp.position.z += st.vz * dt;
    st.vx *= (1 - dt * 0.9); st.vz *= (1 - dt * 0.9);
    const sc = st.s0 + (st.s1 - st.s0) * easeOutCubic(p);
    sp.scale.set(sc, sc, 1);
    sp.material.opacity = p < 0.18 ? (p / 0.18) * st.peak : st.peak * (1 - (p - 0.18) / 0.82);
  }
}
let smokeAccum = 0;
let seededSmoke = false;

// ===== postprocessing (subtle bloom on lights only) =====
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ===== pointer parallax =====
const ptr = { x: 0, y: 0 }, ptrCur = { x: 0, y: 0 };
if (!frozen) {
  addEventListener('pointermove', (e) => {
    ptr.x = (e.clientX / innerWidth) * 2 - 1;
    ptr.y = (e.clientY / innerHeight) * 2 - 1;
  });
}

// ===== cinematic orbit (post-reveal loop) =====
const TAU = Math.PI * 2;
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
const HERO = { az: 0.85, el: 0.6, dist: 6.0 };
const TIMELINE = [
  { az: 0.85, el: 0.58, dist: 6.0, dur: 3.6, ease: easeInOutSine },
  { az: 1.95, el: 0.48, dist: 5.7, dur: 3.2, ease: easeInOutSine },
  { az: 3.45, el: 0.74, dist: 6.1, dur: 0.6, ease: easeOutExpo },
  { az: 4.5, el: 0.52, dist: 5.8, dur: 3.0, ease: easeInOutCubic },
  { az: 6.1, el: 0.9, dist: 6.3, dur: 0.55, ease: easeOutExpo },
  { az: 6.28 + 0.85, el: 0.6, dist: 6.0, dur: 3.0, ease: easeInOutSine },
];
let legIdx = 0, legT = 0;
let prevKey = { az: TIMELINE[0].az, el: TIMELINE[0].el, dist: TIMELINE[0].dist };

function advanceCinematic(dt) {
  const leg = TIMELINE[legIdx];
  legT += dt / leg.dur;
  const e = leg.ease(Math.min(legT, 1));
  RIG.az = prevKey.az + (leg.az - prevKey.az) * e;
  RIG.el = prevKey.el + (leg.el - prevKey.el) * e;
  RIG.dist = prevKey.dist + (leg.dist - prevKey.dist) * e;
  if (legT >= 1) {
    legT = 0;
    prevKey = { az: leg.az % TAU, el: leg.el, dist: leg.dist };
    legIdx = (legIdx + 1) % TIMELINE.length;
    if (legIdx === 0) prevKey.az = TIMELINE[TIMELINE.length - 1].az % TAU;
  }
}

const _camPos = new THREE.Vector3();
const _look = new THREE.Vector3();
function rigToPos(az, el, dist, out) {
  const s = camScale;
  const a = az + ptrCur.x * 0.16;
  const e = Math.max(0.18, el - ptrCur.y * 0.22);
  const d = dist * s;
  out.set(Math.sin(a) * d, e * s + 0.4, Math.cos(a) * d);
  return out;
}

// ===== user drag-orbit — grab the scene to steer the camera =====
// Horizontal drag swings the view left↔right (full circle); vertical drag tilts
// between a near top-down look and just above the road. Clamped so the camera
// NEVER dips below the road plane. Pointer events cover mouse + touch (mobile),
// and #scene already has `touch-action:none` so a drag won't scroll the page.
const userControl = { active: false, az: HERO.az, polar: 1.15, radius: HERO.dist * 1.05 };
const userTarget = { az: HERO.az, polar: 1.15 };
const POLAR_TOP = 0.18;     // ~10° off vertical → top-down view
const POLAR_FLOOR = 1.46;   // ~84° → just above the road, never below it
let dragging = false, dragX = 0, dragY = 0;

if (!frozen) {
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragX = e.clientX; dragY = e.clientY;
    // seed the orbit from wherever the auto-camera is RIGHT NOW → no jump on grab
    const dx = camera.position.x, dy = camera.position.y - LOOK_H, dz = camera.position.z;
    const r = Math.max(2.5, Math.hypot(dx, dy, dz));
    userControl.radius = r;
    userTarget.polar = userControl.polar = THREE.MathUtils.clamp(Math.acos(dy / r), POLAR_TOP, POLAR_FLOOR);
    userTarget.az = userControl.az = Math.atan2(dx, dz);
    userControl.active = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragX, dy = e.clientY - dragY;
    dragX = e.clientX; dragY = e.clientY;
    userTarget.az -= dx * 0.005;                                                   // drag right → orbit right
    userTarget.polar = THREE.MathUtils.clamp(userTarget.polar + dy * 0.005, POLAR_TOP, POLAR_FLOOR);
  });
  const endDrag = (e) => { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}

// ===== loop =====
const clock = new THREE.Clock();
let driftPhase = 0;
const _heroPos = new THREE.Vector3();
const _clayPos = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  ptrCur.x += (ptr.x - ptrCur.x) * 0.06;
  ptrCur.y += (ptr.y - ptrCur.y) * 0.06;

  // ---- camera state machine ----
  if (frozen) {
    rigToPos(azOverride ?? HERO.az, elOverride ?? HERO.el, distOverride ?? HERO.dist, _camPos);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H, 0);
  } else if (phase === 'clay') {
    // tight on the FRONT WHEEL while the % ticks up (the reference's clay open)
    if (holdClay) clayT = CLAY_DUR * 0.6; else clayT += dt;
    const p = Math.min(clayT / CLAY_DUR, 1);
    const e = easeOutCubic(p);
    const f = frontWheelWorld;
    // slow creep in + tiny arc around the wheel
    const ang = -0.5 + e * 0.35;
    const rad = 2.0 - e * 0.35;
    _camPos.set(f.x + Math.sin(ang) * rad, f.y + 0.25 + e * 0.1, f.z + Math.cos(ang) * rad);
    camera.position.copy(_camPos);
    camera.lookAt(f.x * 0.4, f.y + 0.05, f.z * 0.4);
    const pctEl = document.getElementById('pct');
    const fillEl = document.getElementById('revfill');
    if (pctEl) pctEl.textContent = Math.round(e * 100);
    if (fillEl) fillEl.style.transform = `scaleX(${e})`;
    if (p >= 1 && !holdClay) snapToReal();
  } else if (phase === 'pull') {
    // dolly back from the tight wheel shot to the hero 3/4
    pullT += dt;
    const p = Math.min(pullT / PULL_DUR, 1);
    const e = easeOutCubic(p);
    const f = frontWheelWorld;
    _clayPos.set(f.x + Math.sin(-0.15) * 1.65, f.y + 0.35, f.z + Math.cos(-0.15) * 1.65);
    rigToPos(HERO.az, HERO.el, HERO.dist, _heroPos);
    _camPos.lerpVectors(_clayPos, _heroPos, e);
    camera.position.copy(_camPos);
    _look.set(THREE.MathUtils.lerp(f.x * 0.4, 0, e), THREE.MathUtils.lerp(f.y + 0.05, LOOK_H, e), THREE.MathUtils.lerp(f.z * 0.4, 0, e));
    camera.lookAt(_look);
    if (p >= 1) { phase = 'done'; legIdx = 0; legT = 0; prevKey = { az: HERO.az, el: HERO.el, dist: HERO.dist }; }
  } else if (userControl.active) {
    // user is steering — damped orbit, clamped to left↔right + top view, above the road
    userControl.az += (userTarget.az - userControl.az) * 0.12;
    userControl.polar += (userTarget.polar - userControl.polar) * 0.12;
    const sp = Math.sin(userControl.polar), R = userControl.radius;
    _camPos.set(Math.sin(userControl.az) * sp * R, LOOK_H + Math.cos(userControl.polar) * R, Math.cos(userControl.az) * sp * R);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H, 0);
  } else if (!reduceMotion) {
    // DRIVING tracking shot — camera holds a front-3/4 and weaves gently while the
    // road scrolls underneath (that's what sells "moving"); no full turntable spin.
    RIG.az = HERO.az + Math.sin(t * 0.16) * 0.45 + Math.sin(t * 0.41) * 0.08;
    RIG.el = HERO.el + Math.sin(t * 0.26) * 0.05;
    RIG.dist = HERO.dist - 0.3 + Math.sin(t * 0.12) * 0.4;
    rigToPos(RIG.az, RIG.el, RIG.dist, _camPos);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H + Math.sin(t * 7.0) * 0.01, 0);
  } else {
    rigToPos(HERO.az, HERO.el, HERO.dist, _camPos);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H, 0);
  }

  // ---- car heading + suspension (driving feel once revealed) ----
  const driving = phase === 'done' && !reduceMotion;
  if (driving) {
    driftPhase += dt;
    carRoot.rotation.y = BASE_YAW + Math.sin(t * 0.7) * 0.022;       // faint steering weave
    carRoot.position.y = Math.sin(t * 7.3) * 0.012 + Math.sin(t * 11.7) * 0.006;  // road chatter
    carRoot.rotation.z = Math.sin(t * 5.5) * 0.006;                  // body roll
    carRoot.rotation.x = Math.sin(t * 6.3) * 0.004;                  // pitch
  } else {
    carRoot.rotation.y = BASE_YAW;
    carRoot.position.y = 0;
    carRoot.rotation.z = 0; carRoot.rotation.x = 0;
  }

  // ---- world travel direction (drives road heading, smoke, rain slant) ----
  const wf = localForward.clone().applyQuaternion(carRoot.quaternion);
  wf.y = 0;
  if (wf.lengthSq() > 1e-6) wf.normalize(); else wf.set(0, 0, 1);
  roadGroup.rotation.y = Math.atan2(wf.x, wf.z);

  // ---- scroll the road + spin wheels (matched so it reads as rolling, not sliding) ----
  if ((phase === 'done' || phase === 'pull') && !reduceMotion) {
    if (carModel) roadTex.offset.y = (roadTex.offset.y + ROAD_SPEED * dt) % 1;
    if (wheels.length) {
      const ws = 16.0;                       // fast — matches the road rush
      const axis = wheels.spinAxis || 'x';
      for (const w of wheels) w.rotation[axis] += ws * dt;
    }
  }

  // ---- tyre/exhaust smoke trailing off the rear wheels ----
  if (driving && rearWheels.length) {
    const back = wf.clone().multiplyScalar(-1);
    // frozen screenshots: headless throttles rAF so smoke can't accumulate —
    // pre-simulate ~2s of trail in one frame so the still shows the real plume.
    const step = 1 / 17;                      // ~17 puffs/sec per rear wheel — a plume, not a bomb
    if (frozen && !seededSmoke) {
      seededSmoke = true;
      const _w = new THREE.Vector3();
      let acc = 0;
      for (let k = 0; k < 130; k++) {         // pre-sim at the real cadence → real steady-state density
        acc += 0.02;
        while (acc >= step) { acc -= step; for (const rw of rearWheels) { rw.getWorldPosition(_w); emitSmoke(_w.x, 0.08, _w.z, back); } }
        updateSmoke(0.02);
      }
    }
    smokeAccum += dt;
    const _wp = new THREE.Vector3();
    while (smokeAccum >= step) {
      smokeAccum -= step;
      for (const rw of rearWheels) {
        rw.getWorldPosition(_wp);
        emitSmoke(_wp.x, 0.08, _wp.z, back);
      }
    }
  }
  updateSmoke(dt);

  // ---- rain ----
  if (rain.visible) {
    const rm = rain.material;
    if (rm.opacity < 0.3) rm.opacity = Math.min(0.3, rm.opacity + dt * 0.5);
    const pos = rainGeo.attributes.position.array;
    const hx = -wf.x * 5.5 * dt, hz = -wf.z * 5.5 * dt;   // lean streaks back along travel
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 6, d = rainSpeed[i] * dt;
      pos[o + 1] -= d; pos[o + 4] -= d;
      pos[o] += hx; pos[o + 2] += hz; pos[o + 3] += hx; pos[o + 5] += hz;
      if (pos[o + 4] < RAIN_BOX.yBot) {
        const x = (Math.random() * 2 - 1) * RAIN_BOX.x, z = (Math.random() * 2 - 1) * RAIN_BOX.z;
        pos[o] = x; pos[o + 1] = RAIN_BOX.yTop; pos[o + 2] = z;
        pos[o + 3] = x; pos[o + 4] = RAIN_BOX.yTop - RAIN_LEN; pos[o + 5] = z;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // ---- headlight breathing ----
  const pulse = reduceMotion ? 1.8 : 1.7 + Math.sin(t * 2.0) * 0.3;
  for (const m of lampMats) if (!/tail|brake/.test((m.name || '').toLowerCase())) m.emissiveIntensity = pulse;

  // ---- HUD heading ----
  let deg = ((RIG.az * 180 / Math.PI) % 360 + 360) % 360;
  if (headingEl && phase === 'done') headingEl.textContent = `${String(Math.round(deg)).padStart(3, '0')}°`;

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
