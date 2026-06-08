import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

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
//   ?detail=1           hold the tight front-rim study (car still)
//   ?drift=1 / ?still=1 jump to the drift beat (smoke + burn marks pre-seeded)
//   ?az=..&el=..&dist=.. pin the orbit rig
const params = new URLSearchParams(location.search);
const still = params.has('still') || params.has('drift');
const holdDetail = params.has('detail');
const azOverride = params.has('az') ? parseFloat(params.get('az')) : null;
const elOverride = params.has('el') ? parseFloat(params.get('el')) : null;
const distOverride = params.has('dist') ? parseFloat(params.get('dist')) : null;
const frozen = still || azOverride !== null;

// ===== easings (defined early — TIMELINE references them at eval) =====
const TAU = Math.PI * 2;
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

// ===== renderer =====
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// PBR Neutral (Khronos) instead of ACES Filmic — ACES desaturates highlights and
// was the main reason the orange read "faded"/chalky under the bright clear sky.
// Neutral holds the candy saturation while still rolling off the sky highlights.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// reveal state machine: 'load' → 'detail' (extreme close-up studying the front rim
// while the car stands still, % ticking) → SNAP → 'pull' (camera dollies back to the
// hero 3/4 as the wheels spin up + the track starts to rush) → 'drift' (sustained
// power-slide: car yaws across its travel line, tyre smoke pours off the rears,
// burn marks streak down the tarmac).
let phase = 'load';
let revealed = false;
let carModel = null;
let detailT = 0;
const DETAIL_DUR = 3.8;
let pullT = 0;
const PULL_DUR = 2.8;

// ===== IBL — TWILIGHT PURE-SKY HDRI (dusk racetrack / Most-Wanted dusk grade) =====
// Cool blue dome with a warm low sun on the horizon → teal-shadow / orange-highlight
// split that reads cinematic AND keeps the orange car popping (an orange sky would
// have gone muddy on an already-orange body).
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let skyEnv = null;
let skyEquirect = null;
new RGBELoader().load('model/belfast_sunset_puresky_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  skyEquirect = hdr;
  skyEnv = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = skyEnv;
  scene.environmentIntensity = 1.15;
  if (revealed) applySkyBackground();
});

scene.background = new THREE.Color(0x0d1119);   // deep dusk-blue behind the rim study

function applySkyBackground() {
  if (!skyEquirect) return;
  scene.environmentIntensity = 1.3;             // sky carries the gloss reflections (bg dimmed separately)
  scene.background = skyEquirect;
  scene.backgroundBlurriness = 0.14;            // softer dusk dome → bright horizon doesn't blow out
  scene.backgroundIntensity = 0.6;
  scene.fog = new THREE.FogExp2(0x161c28, 0.02);   // cool dusk haze rolling down the track
}

// the SNAP: rim study → real PBR + sky bg + the car comes alive
function snapToReal() {
  if (revealed) return;
  revealed = true;
  applySkyBackground();
  const fl = document.getElementById('flash');
  if (fl) { fl.classList.add('fire'); setTimeout(() => fl.classList.remove('fire'), 420); }
  const ld = document.getElementById('loader');
  if (ld) ld.classList.add('gone');
  phase = frozen || reduceMotion ? 'drift' : 'pull';
  pullT = 0;
}

// ===== camera =====
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 120);
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

// ===== lighting — DUSK: a low warm raking sun, deep-blue twilight fill =====
scene.add(new THREE.AmbientLight(0x33415c, 0.30));   // cool dusk ambient (teal shadows)

// the SUN — low, warm, raking. Long dramatic shadow + a hot orange clearcoat streak
// down the flank (the Most-Wanted golden-hour kiss).
const key = new THREE.DirectionalLight(0xffd9b4, 2.6);
key.position.set(7, 6, 5);                          // lower than midday → longer rake
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 40;
key.shadow.camera.left = -8; key.shadow.camera.right = 8;
key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
key.shadow.bias = -0.0004; key.shadow.radius = 6;
scene.add(key);

// deep-blue twilight fill — cool bounce from the opposite sky (carves the teal shadow side)
const skyFill = new THREE.DirectionalLight(0x5874a8, 0.85);
skyFill.position.set(-6, 5, -3);
scene.add(skyFill);

// cold rim from behind to carve the silhouette against the dusk
const rim = new THREE.DirectionalLight(0xbcd0ff, 1.1);
rim.position.set(-2, 3, -7);
scene.add(rim);

// camera-side fill — at dusk the raking sun lights the FAR flank, so the near
// (camera) side falls into shadow and the paint reads dark/crimson. This warm fill
// puts a glossy specular hit back on the visible side without flattening the mood.
const frontFill = new THREE.DirectionalLight(0xfff0e2, 0.9);
frontFill.position.set(0, 3.5, 8);
scene.add(frontFill);

// ONE brand accent — a warm JRV-orange kiss along the near flank. Restraint:
// a single tinted light reads as a signature glint, not a stage-gel disco.
const accent = new THREE.DirectionalLight(JRV.orange, 0.7);
accent.position.set(6, 2.2, 3.5);
scene.add(accent);

// ===== ground (sun-baked tarmac) =====
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.ShadowMaterial({ opacity: 0.42 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// wide tarmac apron out to the haze — a REFLECTOR (Three.js addon) so the car body,
// kerbs and sky mirror in the ground for a wet-track / showroom-floor gloss. The
// reflection colour is dimmed (dark tint) and a translucent asphalt sheet rides on
// top, so it reads as polished wet asphalt rather than a chrome mirror.
const _dpr = Math.min(window.devicePixelRatio, 2);
const apronMirror = new Reflector(new THREE.PlaneGeometry(200, 200), {
  clipBias: 0.003,
  textureWidth: Math.floor(innerWidth * _dpr),
  textureHeight: Math.floor(innerHeight * _dpr),
  color: 0x333b43,                      // dim the reflection → wet asphalt, not a mirror
});
apronMirror.rotation.x = -Math.PI / 2;
apronMirror.position.y = -0.012;
scene.add(apronMirror);

// translucent asphalt sheet over the mirror — lets ~45% of the reflection bleed
// through for a wet sheen while keeping a dark tarmac body.
const apron = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({
    color: 0x121519, roughness: 0.5, metalness: 0.0,
    envMapIntensity: 0.7, transparent: true, opacity: 0.55,
  })
);
apron.rotation.x = -Math.PI / 2;
apron.position.y = -0.008;
apron.receiveShadow = true;
scene.add(apron);

// ===== RACETRACK strip — kerbed tarmac that scrolls under the car (the rush) =====
const roadTex = makeTrackTexture();
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
const ROAD_LEN = 90;
const ROAD_REPEAT = 18;
roadTex.repeat.set(1, ROAD_REPEAT);
roadTex.anisotropy = 8;
const roadGroup = new THREE.Group();
scene.add(roadGroup);
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(8.6, ROAD_LEN),
  new THREE.MeshStandardMaterial({
    map: roadTex, color: 0xffffff,
    roughness: 0.5, metalness: 0.08, envMapIntensity: 0.85,
  })
);
road.rotation.x = -Math.PI / 2;
road.position.y = -0.002;
road.receiveShadow = true;
roadGroup.add(road);

// ===== motion model — ONE linear speed drives BOTH the track scroll AND the wheel
// spin, so the rims never slide. world-units / tile = ROAD_LEN / ROAD_REPEAT.
const V_MAX = 15;                              // top track speed (world units / sec)
const UNITS_PER_TILE = ROAD_LEN / ROAD_REPEAT;
let WHEEL_R = 0.34;                            // measured from the GLB at load
const SPIN_SIGN = -1;                          // contact point travels backwards as we go forward
let speedFactor = 0;                           // 0 = still, ramps to 1 — gates scroll + spin together
const travelDirBase = new THREE.Vector3(0, 0, 1);  // fixed track-flow direction (world), set at load

// ===== car =====
const carRoot = new THREE.Group();
scene.add(carRoot);
let BASE_YAW = -0.5;
const lampMats = [];
const wheels = [];                 // 4 hub pivots, spun each frame
const rearWheels = [];             // the 2 rear pivots — smoke + burn-mark emitters
const localForward = new THREE.Vector3(0, 0, 1);  // car travel axis in carRoot-local space
let frontWheelWorld = new THREE.Vector3(1.2, 0.35, 1.6);  // tight-reveal target (replaced on load)

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(draco);

gltfLoader.load('model/porsche-gt3rs.glb', (gltf) => {
  const car = gltf.scene;
  car.updateMatrixWorld(true);

  car.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const matName = (mats[0]?.name || '').toLowerCase();
    o.material = buildRealMat(matName, mats[0]);   // real PBR from the first frame — the rim study needs detail
  });

  function buildRealMat(name, m) {
    m.envMapIntensity = 1.2;
    // tyres — the GLB ships them as a shiny semi-metal, so under a bright sky they
    // mirror the env and read grey/shiny instead of black. Force matte black rubber.
    if (/scene_-_root/.test(name)) {
      m.metalness = 0.0; m.roughness = 0.95;
      m.color = new THREE.Color(0x08080a);
      m.envMapIntensity = 0.2;
      m.clearcoat = 0.0;
      return m;
    }
    if (/carpaint/.test(name)) {
      // proper candy-metallic automotive paint: a saturated orange metallic-flake
      // base (high metalness tints the reflection → deep, rich body colour, not the
      // muddy half-metal it was) under a mirror clearcoat for the wet gloss highlight.
      // envMap pushed hard so the sky + track actually reflect in the panels.
      const p = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xff5a1c),       // candy orange — survives tonemap + dusk grade without going crimson
        metalness: 0.85, roughness: 0.30,
        clearcoat: 1.0, clearcoatRoughness: 0.03,
        envMapIntensity: 3.0,                   // dusk sky reflects hard → wet candy gloss
        specularIntensity: 1.0,
        sheen: 0.0,
      });
      return p;
    }
    if (/(?<!head|tail|brake)glass|blackglass|glass_int/.test(name) || name === 'twixer_992_glass.002' || /glass\.\d/.test(name)) {
      // tinted automotive glass — softened reflection so the greenhouse doesn't blow to white
      m.transparent = true; m.opacity = 0.62; m.roughness = 0.13; m.metalness = 0.0;
      m.color = new THREE.Color(0x0b0f16); m.envMapIntensity = 0.8; m.depthWrite = false;
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
      m.envMapIntensity = 1.3; m.clearcoat = 0.6; m.clearcoatRoughness = 0.2;
      return m;
    }
    if (/chrome|antichrome|metal_radiator|exhausttip/.test(name)) {
      // wing-mirror face + window trim are chrome; the GLB ships antichrome BLEND →
      // force opaque so the mirror isn't a see-through stub, soften so it doesn't blow out
      m.metalness = 1.0; m.roughness = 0.24; m.envMapIntensity = 1.0;
      m.transparent = false; m.opacity = 1;
      return m;
    }
    if (/gt3rs_black|plastic_mgl|^twixer_992\.001$/.test(name)) {
      // wheel rims / dark exterior trim — machined graphite, catches a crisp sun edge
      m.metalness = 0.85; m.roughness = 0.38; m.envMapIntensity = 1.3;
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
  const spinAxis = size.x < size.z ? 'x' : 'z';
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
  let nF = 0, nR = 0, wheelDiam = 0;
  for (const [k, group] of buckets.entries()) {
    const wb = new THREE.Box3();
    for (const m of group) wb.expandByObject(m);
    const wc = wb.getCenter(new THREE.Vector3());
    wheelDiam = Math.max(wheelDiam, wb.max.y - wb.min.y);   // world wheel diameter → real radius
    const pivot = new THREE.Group();
    pivot.position.copy(carRoot.worldToLocal(wc.clone()));
    pivot.userData.rear = k.endsWith('B');     // bucket key R_F / L_B etc.
    carRoot.add(pivot);
    for (const m of group) pivot.attach(m);
    wheels.push(pivot);
    if (pivot.userData.rear) { rearLocal.add(pivot.position); nR++; rearWheels.push(pivot); }
    else { frontLocal.add(pivot.position); nF++; }
  }
  wheels.spinAxis = spinAxis;
  if (wheelDiam > 0.05) WHEEL_R = wheelDiam / 2;
  // car forward axis in carRoot-LOCAL space (front-axle mid → rear-axle mid)
  if (nF && nR) {
    frontLocal.multiplyScalar(1 / nF); rearLocal.multiplyScalar(1 / nR);
    localForward.copy(frontLocal).sub(rearLocal); localForward.y = 0; localForward.normalize();
  }

  // FIXED track-flow direction: the car's forward at its BASE pose. The track always
  // rushes straight down this line; during the drift the car YAWS across it (that's
  // the slide), so flow + smoke + marks must read off this fixed axis, not live yaw.
  const baseQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, BASE_YAW, 0));
  travelDirBase.copy(localForward).applyQuaternion(baseQuat);
  travelDirBase.y = 0;
  if (travelDirBase.lengthSq() > 1e-6) travelDirBase.normalize(); else travelDirBase.set(0, 0, 1);
  roadGroup.rotation.y = Math.atan2(travelDirBase.x, travelDirBase.z);

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
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.7, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  carRoot.add(blob);

  carModel = car;

  if (frozen || reduceMotion) {
    snapToReal();
    loader.classList.add('gone');
  } else {
    phase = 'detail';
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

// sun-baked racetrack tarmac: dark asphalt, a rubbered racing line, red/white kerbs
// down both edges + a thin white limit line. Tiles down its length.
function makeTrackTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const ctx = c.getContext('2d');
  // asphalt base + speckle
  ctx.fillStyle = '#0c0f12'; ctx.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 3000; i++) {
    const v = 14 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 4},${0.22 + Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 1024, 1.5, 1.5);
  }
  // worn rubber racing line down the centre (two faint dark bands = the groove)
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.fillRect(96, 0, 26, 1024);
  ctx.fillRect(134, 0, 26, 1024);
  // thin white limit lines just inboard of the kerbs
  ctx.fillStyle = 'rgba(214,220,226,0.55)';
  ctx.fillRect(34, 0, 4, 1024);
  ctx.fillRect(218, 0, 4, 1024);
  // red/white kerbs on both edges (classic curbing — instant racetrack read)
  const block = 64;
  for (let y = 0; y < 1024; y += block) {
    const red = ((y / block) % 2) === 0;
    ctx.fillStyle = red ? '#c4241b' : '#e9e9ea';
    ctx.fillRect(6, y, 24, block);       // left kerb
    ctx.fillRect(226, y, 24, block);     // right kerb
  }
  return new THREE.CanvasTexture(c);
}

// soft smoke puff (greyscale radial)
function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(232,234,237,0.96)');
  g.addColorStop(0.45, 'rgba(178,183,190,0.5)');
  g.addColorStop(1, 'rgba(150,155,162,0)');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
  return new THREE.CanvasTexture(c);
}

// soft burn-mark decal — dark, longer than wide, feathered edges so overlaps build up
function makeBurnTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 64, 2, 32, 64, 60);
  g.addColorStop(0, 'rgba(0,0,0,0.92)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 128);
  return new THREE.CanvasTexture(c);
}

// ===== smoke pool — billboard sprites trailing off the rear wheels =====
const SMOKE_N = 240;
const smokeTex = makeSmokeTexture();
const smokeSprites = [];
const smokeState = [];
for (let i = 0; i < SMOKE_N; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: smokeTex, transparent: true, depthWrite: false, opacity: 0, color: 0x6b7079,
  }));
  s.scale.set(0.001, 0.001, 1);
  s.visible = false;
  scene.add(s);
  smokeSprites.push(s);
  smokeState.push({ active: false, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0.2, s1: 1, peak: 0.4 });
}
let smokeCursor = 0;
function emitSmoke(px, py, pz, back, lateral) {
  const st = smokeState[smokeCursor], sp = smokeSprites[smokeCursor];
  smokeCursor = (smokeCursor + 1) % SMOKE_N;
  st.active = true; st.life = 0; st.max = 1.1 + Math.random() * 0.9;
  sp.position.set(px + (Math.random() - 0.5) * 0.28, py + Math.random() * 0.1, pz + (Math.random() - 0.5) * 0.28);
  // trail BACK down the track + a sideways kick from the slide
  st.vx = back.x * (1.9 + Math.random() * 1.4) + lateral.x * (0.7 + Math.random() * 1.0) + (Math.random() - 0.5) * 0.4;
  st.vz = back.z * (1.9 + Math.random() * 1.4) + lateral.z * (0.7 + Math.random() * 1.0) + (Math.random() - 0.5) * 0.4;
  st.vy = 0.4 + Math.random() * 0.7;
  st.s0 = 0.18 + Math.random() * 0.14;
  st.s1 = 1.0 + Math.random() * 0.85;
  st.peak = 0.16 + Math.random() * 0.12;
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

// ===== burn-mark pool — flat decals laid at the rear contact points, receding with
// the track (so they read as rubber laid down on the tarmac as the car slides). The
// rear wheels sweep side-to-side as the car yaws → the trail snakes like a real drift.
const BURN_N = 340;
const burnTex = makeBurnTexture();
const burnGeo = new THREE.PlaneGeometry(1, 1);
const burnMeshes = [];
const burnState = [];
for (let i = 0; i < BURN_N; i++) {
  const m = new THREE.Mesh(burnGeo, new THREE.MeshBasicMaterial({
    map: burnTex, transparent: true, depthWrite: false, opacity: 0, color: 0x000000,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.014;
  m.visible = false;
  m.renderOrder = 1;
  scene.add(m);
  burnMeshes.push(m);
  burnState.push({ active: false, life: 0, max: 1, peak: 0.5 });
}
let burnCursor = 0;
const _burnYaw = () => Math.atan2(travelDirBase.x, travelDirBase.z);
function emitBurn(px, pz) {
  const st = burnState[burnCursor], m = burnMeshes[burnCursor];
  burnCursor = (burnCursor + 1) % BURN_N;
  st.active = true; st.life = 0; st.max = 2.0 + Math.random() * 0.5;
  st.peak = 0.5 + Math.random() * 0.18;
  m.position.set(px + (Math.random() - 0.5) * 0.05, 0.014, pz);
  m.rotation.z = _burnYaw();                 // align the streak down the travel line
  m.scale.set(0.4, 0.95, 1);                 // tyre-width × an overlapping segment → continuous line
  m.material.opacity = st.peak;
  m.visible = true;
}
function updateBurn(dt, recede) {
  for (let i = 0; i < BURN_N; i++) {
    const st = burnState[i];
    if (!st.active) continue;
    const m = burnMeshes[i];
    st.life += dt;
    const p = st.life / st.max;
    if (p >= 1) { st.active = false; m.visible = false; continue; }
    // recede with the track so the rubber appears to stay on the ground as we move
    m.position.x += recede.x * dt;
    m.position.z += recede.z * dt;
    m.material.opacity = st.peak * (1 - easeInCubic(p));   // hold dark, then fade
  }
}
let burnAccum = 0;
let seededAction = false;

// ===== postprocessing — Most-Wanted cinematic chain =====
// RenderPass → Bloom (lights + bright dusk highlights glow) → OutputPass (tonemap+sRGB)
// → CinematicPass (radial speed-blur + chromatic aberration + teal/orange grade +
//    vignette + film grain). The grade runs on display-ready pixels so it behaves
//    like a real colour-grade LUT rather than fighting the tonemapper.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.34, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const CinematicShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uTime:      { value: 0 },
    uSpeed:     { value: 0 },     // 0..1 track speed → radial smear + chroma
    uThrottle:  { value: 0 },     // 0..1 tap burst → punchier smear
    uResolution:{ value: new THREE.Vector2(innerWidth, innerHeight) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uSpeed, uThrottle;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;                       // outward from centre
      float edge = dot(dir, dir);                // 0 centre → ~0.5 corner
      float speedAmt = uSpeed * 0.55 + uThrottle * 0.55;

      // ---- radial speed blur smeared toward centre, harder at the edges + faster ----
      float blurStr = speedAmt * edge * 1.0;
      float chroma  = 0.0016 + speedAmt * 0.0045;   // chromatic aberration grows with speed
      vec3 col = vec3(0.0);
      const int N = 8;
      for (int i = 0; i < N; i++) {
        float t = float(i) / float(N - 1);
        vec2 s = uv - dir * blurStr * t;
        col.r += texture2D(tDiffuse, s + dir * chroma).r;
        col.g += texture2D(tDiffuse, s).g;
        col.b += texture2D(tDiffuse, s - dir * chroma).b;
      }
      col /= float(N);

      // ---- cinematic grade: teal-cool shadows, warm-orange highlights ----
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 shadowTint = vec3(0.92, 1.00, 1.09);
      vec3 highTint   = vec3(1.06, 1.00, 0.93);
      col *= mix(shadowTint, highTint, smoothstep(0.20, 0.80, luma));
      col = (col - 0.5) * 1.12 + 0.5;            // contrast S-curve
      col = mix(vec3(luma), col, 1.12);          // saturation lift
      col = clamp(col, 0.0, 1.0);

      // ---- vignette ----
      float vig = smoothstep(0.95, 0.25, length(dir) * 1.28);
      col *= mix(0.74, 1.0, vig);

      // ---- film grain ----
      col += (hash(uv * uResolution + uTime) - 0.5) * 0.055;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
const cinematic = new ShaderPass(CinematicShader);
composer.addPass(cinematic);

// ===== pointer parallax + DRIFT STEERING =====
// Hover (desktop) or touch position steers the slide: cursor left → the 911 drifts
// left, cursor right → drifts right, centre → it tracks straight. A tap/click fires
// a throttle burst (deeper yaw kick + a gout of extra smoke). On touch there's no
// hover, so the tap POSITION also sets the steer direction ("drift toward my tap").
const ptr = { x: 0, y: 0 }, ptrCur = { x: 0, y: 0 };
let steerTarget = 0;          // -1 (full left) .. +1 (full right)
let steerCur = 0;
let throttle = 0;             // 0..1, decays; tap kicks it to 1
if (!frozen) {
  addEventListener('pointermove', (e) => {
    ptr.x = (e.clientX / innerWidth) * 2 - 1;
    ptr.y = (e.clientY / innerHeight) * 2 - 1;
    if (!dragging) steerTarget = THREE.MathUtils.clamp(ptr.x, -1, 1);
  });
}

// ===== drift-camera weave (post-reveal hero loop) =====
const HERO = { az: 0.85, el: 0.6, dist: 6.0 };

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
// between a near top-down look and just above the road. Clamped so the camera NEVER
// dips below the road plane. Pointer events cover mouse + touch (mobile), and #scene
// already has `touch-action:none` so a drag won't scroll the page.
const userControl = { active: false, az: HERO.az, polar: 1.15, radius: HERO.dist * 1.05 };
const userTarget = { az: HERO.az, polar: 1.15 };
const POLAR_TOP = 0.18;     // ~10° off vertical → top-down view
const POLAR_FLOOR = 1.46;   // ~84° → just above the road, never below it
let dragging = false;       // true only once the press crosses the drag threshold
let pressing = false, downX = 0, downY = 0, dragX = 0, dragY = 0;
const DRAG_THRESH = 7;      // px before a press becomes a camera-orbit drag (vs a tap)

function fireThrottle(clientX) {
  // tap burst: drift toward where you tapped + a gout of smoke
  steerTarget = THREE.MathUtils.clamp((clientX / innerWidth) * 2 - 1, -1, 1);
  throttle = 1;
}

if (!frozen) {
  canvas.addEventListener('pointerdown', (e) => {
    pressing = true; dragging = false;
    downX = dragX = e.clientX; downY = dragY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pressing) return;
    if (!dragging) {
      // promote to a camera-orbit drag only after real movement; below the
      // threshold it's still a candidate tap and the hover-steer keeps working
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < DRAG_THRESH) return;
      dragging = true;
      const dx = camera.position.x, dy = camera.position.y - LOOK_H, dz = camera.position.z;
      const r = Math.max(2.5, Math.hypot(dx, dy, dz));
      userControl.radius = r;
      userTarget.polar = userControl.polar = THREE.MathUtils.clamp(Math.acos(dy / r), POLAR_TOP, POLAR_FLOOR);
      userTarget.az = userControl.az = Math.atan2(dx, dz);
      userControl.active = true;
    }
    const dx = e.clientX - dragX, dy = e.clientY - dragY;
    dragX = e.clientX; dragY = e.clientY;
    userTarget.az -= dx * 0.005;
    userTarget.polar = THREE.MathUtils.clamp(userTarget.polar + dy * 0.005, POLAR_TOP, POLAR_FLOOR);
  });
  const endPress = (e) => {
    if (pressing && !dragging) fireThrottle(e.clientX);   // released without dragging → tap
    pressing = false; dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerup', endPress);
  canvas.addEventListener('pointercancel', endPress);
}

// ===== loop =====
const clock = new THREE.Clock();
const _back = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _recede = new THREE.Vector3();
const _wp = new THREE.Vector3();
let driftYaw = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  ptrCur.x += (ptr.x - ptrCur.x) * 0.06;
  ptrCur.y += (ptr.y - ptrCur.y) * 0.06;

  // ---- speed ramp: still during the rim study, eases up through the pull, full in drift ----
  let targetSpeed = 0;
  if (phase === 'pull') targetSpeed = easeInOutCubic(Math.min(pullT / PULL_DUR, 1));
  else if (phase === 'drift') targetSpeed = 1;
  speedFactor += (targetSpeed - speedFactor) * Math.min(1, dt * 4);

  // ---- drift attitude: STEERED by hover/tap. steerCur leads the slide; a tap
  // throttle-burst adds a deeper yaw kick. A faint idle weave keeps it alive when
  // the pointer sits still / on first load. ----
  steerCur += (steerTarget - steerCur) * Math.min(1, dt * 2.4);
  throttle += (0 - throttle) * Math.min(1, dt * 1.3);
  const driftAmt = phase === 'drift' ? 1 : 0;
  const idleWeave = 0.07 * Math.sin(t * 0.6) + 0.04 * Math.sin(t * 1.3);
  const kick = throttle * (steerCur >= 0 ? 1 : -1) * 0.2;
  const targetYaw = driftAmt * (steerCur * 0.5 + idleWeave + kick);
  driftYaw += (targetYaw - driftYaw) * Math.min(1, dt * 3);

  // ---- camera state machine ----
  if (frozen && azOverride !== null) {
    rigToPos(azOverride, elOverride ?? HERO.el, distOverride ?? HERO.dist, _camPos);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H, 0);
  } else if (phase === 'detail') {
    // EXTREME close-up studying the front rim while the car stands still (the "detailing")
    if (holdDetail) detailT = DETAIL_DUR * 0.55; else detailT += dt;
    const p = Math.min(detailT / DETAIL_DUR, 1);
    const e = easeOutCubic(p);
    const f = frontWheelWorld;
    const ang = -0.65 + e * 0.5;              // slow arc around the wheel face
    const rad = 1.55 - e * 0.35;              // creep in
    _camPos.set(f.x + Math.sin(ang) * rad, f.y - 0.05 + e * 0.22, f.z + Math.cos(ang) * rad);
    camera.position.copy(_camPos);
    camera.lookAt(f.x * 0.78, f.y - 0.02, f.z * 0.78);
    const pctEl = document.getElementById('pct');
    const fillEl = document.getElementById('revfill');
    if (pctEl) pctEl.textContent = Math.round(e * 100);
    if (fillEl) fillEl.style.transform = `scaleX(${e})`;
    if (p >= 1 && !holdDetail) snapToReal();
  } else if (phase === 'pull') {
    // dolly back from the tight rim shot to the hero 3/4 (rims now spinning up)
    pullT += dt;
    const p = Math.min(pullT / PULL_DUR, 1);
    const e = easeOutCubic(p);
    const f = frontWheelWorld;
    const startPos = _back.set(f.x + Math.sin(-0.15) * 1.2, f.y + 0.18, f.z + Math.cos(-0.15) * 1.2);
    rigToPos(HERO.az, HERO.el, HERO.dist, _look);
    _camPos.lerpVectors(startPos, _look, e);
    camera.position.copy(_camPos);
    _recede.set(THREE.MathUtils.lerp(f.x * 0.78, 0, e), THREE.MathUtils.lerp(f.y - 0.02, LOOK_H, e), THREE.MathUtils.lerp(f.z * 0.78, 0, e));
    camera.lookAt(_recede);
    if (p >= 1) phase = 'drift';
  } else if (userControl.active) {
    // user is steering — damped orbit, clamped to left↔right + top view, above the road
    userControl.az += (userTarget.az - userControl.az) * 0.12;
    userControl.polar += (userTarget.polar - userControl.polar) * 0.12;
    const sp = Math.sin(userControl.polar), R = userControl.radius;
    _camPos.set(Math.sin(userControl.az) * sp * R, LOOK_H + Math.cos(userControl.polar) * R, Math.cos(userControl.az) * sp * R);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H, 0);
  } else if (!reduceMotion) {
    // DRIFT tracking shot — a low front-3/4 that weaves a touch while the track rushes
    // underneath and the car slides. No full turntable spin — it's a chase, not a spin.
    RIG.az = HERO.az + Math.sin(t * 0.18) * 0.4 + Math.sin(t * 0.43) * 0.08 - steerCur * 0.32;
    RIG.el = HERO.el - 0.06 + Math.sin(t * 0.27) * 0.05;
    RIG.dist = HERO.dist + 0.2 + Math.sin(t * 0.12) * 0.4 - throttle * 0.3;   // tap punches in slightly
    rigToPos(RIG.az, RIG.el, RIG.dist, _camPos);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H + Math.sin(t * 7.0) * 0.01, 0);
  } else {
    rigToPos(HERO.az, HERO.el, HERO.dist, _camPos);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H, 0);
  }

  // ---- car attitude (drift yaw + suspension load) ----
  const moving = (phase === 'drift' || phase === 'pull') && !reduceMotion;
  if (moving) {
    carRoot.rotation.y = BASE_YAW + driftYaw;
    carRoot.position.y = Math.sin(t * 7.3) * 0.012 * speedFactor + Math.sin(t * 11.7) * 0.006 * speedFactor;
    carRoot.rotation.z = -driftYaw * 0.18 + Math.sin(t * 5.5) * 0.005;   // weight rolls out of the slide
    carRoot.rotation.x = Math.sin(t * 6.3) * 0.004;
  } else {
    carRoot.rotation.y = BASE_YAW;
    carRoot.position.y = 0;
    carRoot.rotation.z = 0; carRoot.rotation.x = 0;
  }

  // ---- scroll the track + spin wheels — LOCKED to one linear speed (no sliding) ----
  if (carModel && !reduceMotion) {
    const v = V_MAX * speedFactor;                       // world units / sec right now
    roadTex.offset.y = (roadTex.offset.y + (v / UNITS_PER_TILE) * dt) % 1;
    if (wheels.length) {
      const omega = SPIN_SIGN * (v / WHEEL_R);           // ω = v / r → contact speed == track speed
      const axis = wheels.spinAxis || 'x';
      for (const w of wheels) w.rotation[axis] += omega * dt;
    }
  }

  // ---- tyre smoke + burn marks off the rear wheels (drift) ----
  _back.copy(travelDirBase).multiplyScalar(-1);          // straight back down the track
  _lat.set(-travelDirBase.z, 0, travelDirBase.x).multiplyScalar(driftYaw * 2.2);  // sideways kick from the slide
  _recede.copy(travelDirBase).multiplyScalar(-V_MAX * speedFactor);               // marks recede with the track

  if (phase === 'drift' && rearWheels.length) {
    // frozen screenshots: headless throttles rAF, so pre-simulate a few seconds of
    // trail in one frame so the still already shows the plume + laid rubber.
    if (frozen && !seededAction) {
      seededAction = true;
      const sStep = 1 / 18, bStep = 1 / 60;
      let sa = 0, ba = 0;
      for (let kf = 0; kf < 95; kf++) {
        const tt = kf * 0.02;
        const dyaw = 0.34 * Math.sin(tt * 0.85) + 0.12 * Math.sin(tt * 1.7) + 0.12;
        carRoot.rotation.y = BASE_YAW + dyaw;
        carRoot.updateMatrixWorld(true);
        _lat.set(-travelDirBase.z, 0, travelDirBase.x).multiplyScalar(dyaw * 2.2);
        sa += 0.02; ba += 0.02;
        while (sa >= sStep) { sa -= sStep; for (const rw of rearWheels) { rw.getWorldPosition(_wp); emitSmoke(_wp.x, 0.08, _wp.z, _back, _lat); } }
        while (ba >= bStep) { ba -= bStep; for (const rw of rearWheels) { rw.getWorldPosition(_wp); emitBurn(_wp.x, _wp.z); } }
        updateSmoke(0.02); updateBurn(0.02, _recede);
      }
    }
    smokeAccum += dt; burnAccum += dt;
    // denser smoke the harder it slides + on a throttle burst
    const slip = Math.min(1, Math.abs(driftYaw) / 0.5 + throttle * 0.7);
    const sStep = 1 / (16 + slip * 30), bStep = 1 / 60;
    while (smokeAccum >= sStep) {
      smokeAccum -= sStep;
      for (const rw of rearWheels) { rw.getWorldPosition(_wp); emitSmoke(_wp.x, 0.08, _wp.z, _back, _lat); }
    }
    while (burnAccum >= bStep) {
      burnAccum -= bStep;
      for (const rw of rearWheels) { rw.getWorldPosition(_wp); emitBurn(_wp.x, _wp.z); }
    }
  }
  updateSmoke(dt);
  updateBurn(dt, _recede);

  // ---- headlight breathing (brighter for the dusk → bloom streaks read like MW) ----
  const pulse = reduceMotion ? 2.4 : 2.3 + Math.sin(t * 2.0) * 0.4;
  for (const m of lampMats) if (!/tail|brake/.test((m.name || '').toLowerCase())) m.emissiveIntensity = pulse;

  // ---- speed-rush FOV punch: the lens widens as the car gets up to speed + on a tap ----
  if (!(frozen && azOverride !== null)) {
    const targetFov = (phase === 'drift' || phase === 'pull')
      ? 40 + speedFactor * 3 + throttle * 9
      : 40;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();
  }

  // ---- feed the cinematic grade: speed drives the radial smear + chromatic aberration ----
  cinematic.uniforms.uTime.value = t;
  cinematic.uniforms.uSpeed.value = speedFactor;
  cinematic.uniforms.uThrottle.value = throttle;

  // ---- HUD heading ----
  let deg = ((RIG.az * 180 / Math.PI) % 360 + 360) % 360;
  if (headingEl && phase === 'drift') headingEl.textContent = `${String(Math.round(deg)).padStart(3, '0')}°`;

  composer.render();
}
animate();

// ===== resize =====
addEventListener('resize', () => {
  fitCamera();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  cinematic.uniforms.uResolution.value.set(innerWidth, innerHeight);
  const dpr = Math.min(window.devicePixelRatio, 2);
  apronMirror.getRenderTarget().setSize(Math.floor(innerWidth * dpr), Math.floor(innerHeight * dpr));
});
renderer.setSize(innerWidth, innerHeight);
composer.setSize(innerWidth, innerHeight);
