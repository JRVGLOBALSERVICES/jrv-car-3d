import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { createAudio } from './audio.js';

// --- JRV brand palette ---
const JRV = {
  orange: 0xF15828,
  mint: 0x00FF88,
};

// Hero paint colour — single flip-point. Nardo-style cool grey to match the reel's
// widebody; set to 0xff5a1c (candy orange) to revert to the previous look.
const CAR_PAINT = 0x5c646a;

const canvas = document.getElementById('scene');
const headingEl = document.getElementById('heading');
const loader = document.getElementById('loader');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// drift soundbed (engine RPM + tyre screech) — gesture-unlocked, muted-by-default-safe
const audio = createAudio({ reduceMotion });

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
// PBR Neutral (Khronos) instead of ACES Filmic — ACES crushes/desaturates and the
// reel is a CLEAN bright-daylight grade. Neutral rolls the hot sky highlights off
// gently while holding the cool metallic grey of the paint (the cinematic-render look).
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.96;
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

// ===== IBL — CLEAR DAYTIME PURE-SKY HDRI (the reel's bright hazy daylight grade) =====
// Light-blue midday dome with a high sun → bright open-lot drift look. The sky carries
// soft cool reflections in the grey paint; atmospheric haze (fog) softens + desaturates
// the distance exactly like the reel's hazed-out skyline.
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let skyEnv = null;
let skyEquirect = null;
new RGBELoader().load('model/kloofendal_43d_clear_puresky_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  skyEquirect = hdr;
  skyEnv = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = skyEnv;
  scene.environmentIntensity = 1.0;
  if (revealed) applySkyBackground();
});

scene.background = new THREE.Color(0xb9c6d2);   // pale hazy daylight behind the rim study

// HAZE — a light blue-grey atmospheric fog is THE defining environmental cue of the
// reel: it diffuses + desaturates everything past the car, fades the kerbs out, and
// blends the ground into the sky at the horizon. Kept module-level so it can be tuned.
const HAZE_COLOR = 0xc3cfd9;

function applySkyBackground() {
  if (!skyEquirect) return;
  scene.environmentIntensity = 1.0;             // sky carries the soft daylight reflections
  scene.background = skyEquirect;
  scene.backgroundBlurriness = 0.18;            // hazy dome → soft, diffused horizon (not crisp)
  scene.backgroundIntensity = 0.72;             // bright daylight sky (not blown to white)
  scene.fog = new THREE.FogExp2(HAZE_COLOR, 0.016);   // SUBTLE haze — softens distance only, keeps the car/ground clean
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

// ===== lighting — BRIGHT MIDDAY: a high near-white sun + strong cool sky ambient =====
// High ambient from the open sky LIFTS the shadows (the reel's shadows hold detail and
// carry a faint cool tint, never crushed to black).
scene.add(new THREE.AmbientLight(0xbcccdc, 0.62));   // cool open-sky ambient, shadows stay open

// the SUN — high, bright, barely-warm white (midday). Crisp shadow, hot specular kick
// that the bloom turns into the reel's sun glints.
const key = new THREE.DirectionalLight(0xfff6ec, 3.1);
key.position.set(6, 11, 4);                         // HIGH → short midday shadow
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 50;
key.shadow.camera.left = -8; key.shadow.camera.right = 8;
key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
key.shadow.bias = -0.0004; key.shadow.radius = 5;
scene.add(key);

// SUN LENS-FLARE — the reel's signature daytime artifact. A bright core + a few coloured
// ghosts ride the line from the sun through frame centre, appearing when the sun swings
// into view during the orbit. Parented to a far point in the sun's direction.
const sunAnchor = new THREE.Object3D();
sunAnchor.position.copy(key.position).normalize().multiplyScalar(70);
scene.add(sunAnchor);
const flareGlow = makeFlareTexture(0xffffff, 0.0);
const flareGhost = makeFlareTexture(0xbfe0ff, 0.55);
const lensflare = new Lensflare();
lensflare.addElement(new LensflareElement(flareGlow, 480, 0, new THREE.Color(0xfff4e6)));
lensflare.addElement(new LensflareElement(flareGhost, 60, 0.35));
lensflare.addElement(new LensflareElement(flareGhost, 90, 0.5));
lensflare.addElement(new LensflareElement(flareGhost, 140, 0.7));
lensflare.addElement(new LensflareElement(flareGhost, 70, 0.9));
sunAnchor.add(lensflare);

// strong cool sky fill — bounced daylight from the opposite dome, carves the shadow
// side without warming it (keeps the whole car in the cool grey family).
const skyFill = new THREE.DirectionalLight(0xc4d4e6, 1.05);
skyFill.position.set(-6, 6, -3);
scene.add(skyFill);

// cool rim from behind — a clean highlight edge against the hazy sky
const rim = new THREE.DirectionalLight(0xd8e6ff, 0.7);
rim.position.set(-2, 4, -7);
scene.add(rim);

// camera-side fill — soft, neutral, just lifts the near flank so the grey reads as
// glossy metal rather than going flat-matte in self-shadow.
const frontFill = new THREE.DirectionalLight(0xeef3f8, 0.55);
frontFill.position.set(0, 3.5, 8);
scene.add(frontFill);

// ===== ground (sun-baked tarmac) =====
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.ShadowMaterial({ opacity: 0.26 })   // lifted midday shadow — open, not crushed
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
  color: 0x6a727b,                      // brighter daytime bounce, still dimmed (dry-ish lot, not a mirror)
});
apronMirror.rotation.x = -Math.PI / 2;
apronMirror.position.y = -0.012;
scene.add(apronMirror);

// light-grey concrete sheet over the mirror — daytime open lot. Mostly opaque so only
// a faint sheen of the reflection bleeds through (dry concrete, not wet asphalt).
const apron = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({
    color: 0x9298a0, roughness: 0.82, metalness: 0.0,
    envMapIntensity: 0.55, transparent: true, opacity: 0.8,
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
    roughness: 0.82, metalness: 0.0, envMapIntensity: 0.5,   // dry daytime concrete
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
      // NARDO GREY metallic — the reel's widebody colour: a cool, desaturated slate
      // grey with a subtle metallic flake, under a glossy clearcoat that mirrors the
      // bright hazy sky. (Flip CAR_PAINT back to an orange hex for the candy look.)
      const p = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(CAR_PAINT),      // #5c646a Nardo-style cool grey
        metalness: 0.72, roughness: 0.34,
        clearcoat: 1.0, clearcoatRoughness: 0.06,
        envMapIntensity: 2.1,                   // bright sky reflects in the panels (clean, not blown)
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

// lens-flare sprite — a soft radial glow. tint is applied per-element via LensflareElement,
// so the texture is white→transparent; `edge` adds a faint ring for the ghost discs.
function makeFlareTexture(_color, edge) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, `rgba(255,255,255,${0.12 + edge * 0.18})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 64, 0, Math.PI * 2); x.fill();
  if (edge > 0) {                         // faint ring → reads as a lens ghost disc
    x.strokeStyle = `rgba(255,255,255,${edge * 0.5})`;
    x.lineWidth = 2;
    x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// sun-baked racetrack tarmac: dark asphalt, a rubbered racing line, red/white kerbs
// down both edges + a thin white limit line. Tiles down its length.
function makeTrackTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const ctx = c.getContext('2d');
  // light-grey concrete base + speckle (bright open lot, not dark race asphalt)
  ctx.fillStyle = '#878d94'; ctx.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 3200; i++) {
    const v = 120 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},${0.18 + Math.random() * 0.26})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 1024, 1.5, 1.5);
  }
  // worn rubber line down the centre where cars track (two faint dark bands)
  ctx.fillStyle = 'rgba(40,42,46,0.28)';
  ctx.fillRect(96, 0, 26, 1024);
  ctx.fillRect(134, 0, 26, 1024);
  // faded painted lot lines near the edges (worn white, not race kerbs)
  ctx.fillStyle = 'rgba(228,232,236,0.5)';
  ctx.fillRect(30, 0, 5, 1024);
  ctx.fillRect(221, 0, 5, 1024);
  // muted dashed edge markings — neutral industrial-lot read, faded by the haze
  const block = 64;
  for (let y = 0; y < 1024; y += block) {
    const on = ((y / block) % 2) === 0;
    if (!on) continue;
    ctx.fillStyle = 'rgba(206,210,214,0.34)';
    ctx.fillRect(10, y, 14, block * 0.7);     // left dashes
    ctx.fillRect(232, y, 14, block * 0.7);    // right dashes
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
const SMOKE_N = 340;
const smokeTex = makeSmokeTexture();
const smokeSprites = [];
const smokeState = [];
for (let i = 0; i < SMOKE_N; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: smokeTex, transparent: true, depthWrite: false, opacity: 0, color: 0xdce1e7,
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
  st.s0 = 0.22 + Math.random() * 0.16;
  st.s1 = 1.5 + Math.random() * 1.1;            // fat, voluminous plume (reel-style)
  st.peak = 0.32 + Math.random() * 0.2;         // thick white smoke, not thin haze
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
const BURN_N = 720;
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
function emitBurn(px, pz, yaw) {
  const st = burnState[burnCursor], m = burnMeshes[burnCursor];
  burnCursor = (burnCursor + 1) % BURN_N;
  st.active = true; st.life = 0; st.max = 5.5 + Math.random() * 1.5;   // long-lived → the donut ring holds
  st.peak = 0.5 + Math.random() * 0.18;
  m.position.set(px + (Math.random() - 0.5) * 0.05, 0.014, pz);
  m.rotation.z = (yaw ?? _burnYaw());        // align the streak along the donut tangent
  m.scale.set(0.42, 0.78, 1);                // tyre-width × an overlapping segment → continuous ring
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

// ===== postprocessing — bright-daylight cinematic chain (the reel's look) =====
// RenderPass → Bokeh (shallow DOF: hero sharp, fg/bg melt) → Bloom (sun glints +
// specular highlights glow) → OutputPass (tonemap+sRGB) → CinematicPass (edge-only
// speed-blur + COOL DESATURATED grade + soft vignette + fine grain). The grade runs
// on display-ready pixels so it behaves like a colour LUT, not fighting the tonemapper.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// shallow depth-of-field — the reel keeps the car razor-sharp while the immediate
// foreground and the hazed-out skyline melt into bokeh. focus tracks the car each
// frame (see loop); aperture/maxblur tuned so ONLY off-subject depths soften.
const bokeh = new BokehPass(scene, camera, {
  focus: 6.0, aperture: 0.00032, maxblur: 0.0042,
  width: innerWidth, height: innerHeight,
});
composer.addPass(bokeh);

const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.6, 0.9);
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
      float r = length(dir);                     // 0 centre → ~0.7 corner
      float speedAmt = uSpeed * 0.55 + uThrottle * 0.55;

      // ---- radial speed blur — HERO STAYS SHARP ----
      // The car sits in the central frame, so the smear must be masked OUT of a
      // generous middle zone and only streak the rushing track at the edges. A flat
      // dot()-falloff (old version) still blurred the car; this keeps a hard sharp
      // core (periph≈0 until r>0.34) so the 911 is always crisp.
      float periph  = smoothstep(0.34, 0.66, r);
      float blurStr = speedAmt * periph * 0.6;       // edges-only, capped
      float chroma  = speedAmt * 0.0030 * periph;    // no fringing on the hero (zero at centre)
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

      // ---- bright-daylight grade: cool, clean, DESATURATED (the reel's render look) ----
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      // gently cool the whole frame (slight blue lift), warm the very brightest
      // highlights a hair so the sun glints don't go clinical-blue.
      vec3 shadowTint = vec3(0.97, 1.00, 1.05);   // cool shadows
      vec3 highTint   = vec3(1.03, 1.005, 0.98);  // faintly warm highlights
      col *= mix(shadowTint, highTint, smoothstep(0.25, 0.85, luma));
      col += 0.018;                               // lift blacks (never crushed — reel keeps shadow detail)
      col = (col - 0.5) * 1.06 + 0.5;             // soft contrast
      col = mix(vec3(luma), col, 0.86);           // PULL saturation DOWN → desaturated grade
      col = clamp(col, 0.0, 1.0);

      // ---- soft vignette ----
      float vig = smoothstep(0.98, 0.34, length(dir) * 1.22);
      col *= mix(0.86, 1.0, vig);

      // ---- fine film grain ----
      col += (hash(uv * uResolution + uTime) - 0.5) * 0.04;

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
    audio.unlock();                       // first gesture lights up the soundbed
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

// ===== sound toggle (chrome button) =====
const soundBtn = document.getElementById('sound');
if (soundBtn && !frozen && !reduceMotion) {
  const paint = () => {
    soundBtn.classList.toggle('muted', audio.muted);
    soundBtn.setAttribute('aria-label', audio.muted ? 'Unmute engine sound' : 'Mute engine sound');
    soundBtn.querySelector('.lbl').textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
  };
  paint();
  soundBtn.addEventListener('click', () => { audio.unlock(); audio.toggleMuted(); paint(); });
} else if (soundBtn) {
  soundBtn.style.display = 'none';   // frozen captures + reduced-motion: no audio control
}

// ===== loop =====
const clock = new THREE.Clock();
const _back = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _recede = new THREE.Vector3();
const _wp = new THREE.Vector3();
const _out = new THREE.Vector3();      // outward (car-centre → rear wheel), for smoke billow
const _tan = new THREE.Vector3();      // tangent to the donut circle, for mark streak + swirl
let driftYaw = 0;
let driftSpin = 0;                     // continuous donut rotation (rad) accumulated in drift

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
    // DRONE ORBIT — the reel's signature: an FPV drone circles the donut continuously
    // (rear → side → front → rear), low to the ground and close, with a faint handheld
    // bob. The az accumulates with t so it's a true fly-around, not a fixed weave. A tap
    // speeds the orbit + punches in; hover nudges it a touch.
    const orbitSpeed = 0.40 + throttle * 0.55;
    RIG.az = HERO.az + t * orbitSpeed + Math.sin(t * 0.7) * 0.06 - steerCur * 0.18;
    RIG.el = HERO.el - 0.14 + Math.sin(t * 0.5) * 0.06;                       // low drone, gentle bob
    RIG.dist = HERO.dist + 0.1 + Math.sin(t * 0.23) * 0.5 - throttle * 0.45;  // breathes in/out, tap punches in
    rigToPos(RIG.az, RIG.el, RIG.dist, _camPos);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H + Math.sin(t * 6.0) * 0.008, 0);
  } else {
    rigToPos(HERO.az, HERO.el, HERO.dist, _camPos);
    camera.position.copy(_camPos);
    camera.lookAt(0, LOOK_H, 0);
  }

  // ---- car attitude — DONUT: the car spins continuously in place (rear wheels trace a
  // circle), leaning out of the slide. During 'pull' it's still straight (donut=0). ----
  const moving = (phase === 'drift' || phase === 'pull') && !reduceMotion;
  if (moving) {
    const donut = phase === 'drift' ? 1 : 0;
    const spinRate = 0.85 + throttle * 0.85;          // rad/s, tap accelerates the donut
    driftSpin += donut * spinRate * dt;
    carRoot.rotation.y = BASE_YAW + driftSpin + Math.sin(t * 5.5) * 0.008;
    carRoot.position.y = Math.sin(t * 7.3) * 0.012 * speedFactor + Math.sin(t * 11.7) * 0.006 * speedFactor;
    carRoot.rotation.z = donut * 0.045 + Math.sin(t * 5.5) * 0.005;   // leans out of the donut
    carRoot.rotation.x = Math.sin(t * 6.3) * 0.004;
  } else {
    carRoot.rotation.y = BASE_YAW;
    carRoot.position.y = 0;
    carRoot.rotation.z = 0; carRoot.rotation.x = 0;
  }

  // open lot: hide the kerbed race-track strip once the donut starts (the reel has no
  // rushing road — just an open concrete pad with scorched circles).
  roadGroup.visible = phase !== 'drift';

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

  // ---- tyre smoke + burn marks off the rear wheels (DONUT) ----
  // The lot is static (no track rush), so laid rubber STAYS where it's put → the rear
  // wheels, tracing a circle as the car spins, scorch a continuous donut ring. Smoke
  // billows outward from the donut centre + rises (per-wheel direction set at emit time).
  _recede.set(0, 0, 0);                                  // static ground — marks don't slide

  // per-rear-wheel direction helpers: billow OUTWARD from the donut centre (scene origin)
  // + rise; ring marks STREAK along the circle tangent so they read as one laid ring.
  const emitSmokeRears = () => {
    for (const rw of rearWheels) {
      rw.getWorldPosition(_wp);
      _out.set(_wp.x, 0, _wp.z);
      if (_out.lengthSq() > 1e-4) _out.normalize(); else _out.set(0, 0, 1);
      _tan.set(-_out.z, 0, _out.x);
      emitSmoke(_wp.x, 0.08, _wp.z, _out, _tan);          // outward push + tangential swirl
    }
  };
  const emitBurnRears = () => {
    for (const rw of rearWheels) {
      rw.getWorldPosition(_wp);
      _out.set(_wp.x, 0, _wp.z);
      if (_out.lengthSq() > 1e-4) _out.normalize(); else _out.set(0, 0, 1);
      emitBurn(_wp.x, _wp.z, Math.atan2(-_out.z, _out.x));  // streak along the circle tangent
    }
  };

  if (phase === 'drift' && rearWheels.length) {
    // frozen screenshots: headless throttles rAF, so pre-simulate a chunk of the donut in
    // one frame so the still already shows the ring of rubber + the plume.
    if (frozen && !seededAction) {
      seededAction = true;
      const sStep = 1 / 18, bStep = 1 / 55;
      let sa = 0, ba = 0;
      for (let kf = 0; kf < 150; kf++) {
        carRoot.rotation.y = BASE_YAW + kf * 0.02 * 1.7;  // sweep ~2.9 rad of the donut
        carRoot.rotation.z = 0.045;
        carRoot.updateMatrixWorld(true);
        sa += 0.02; ba += 0.02;
        while (sa >= sStep) { sa -= sStep; emitSmokeRears(); }
        while (ba >= bStep) { ba -= bStep; emitBurnRears(); }
        updateSmoke(0.02); updateBurn(0.02, _recede);
      }
    }
    smokeAccum += dt; burnAccum += dt;
    // denser smoke the harder it's spinning + on a throttle burst
    const slip = Math.min(1, 0.6 + throttle * 0.7);
    const sStep = 1 / (16 + slip * 30), bStep = 1 / 45;
    while (smokeAccum >= sStep) { smokeAccum -= sStep; emitSmokeRears(); }
    while (burnAccum >= bStep) { burnAccum -= bStep; emitBurnRears(); }
  }
  updateSmoke(dt);
  updateBurn(dt, _recede);

  // ---- headlights stay dim in daylight (no dusk glow); taillights keep their red kiss ----
  const pulse = reduceMotion ? 0.35 : 0.3 + Math.sin(t * 2.0) * 0.08;
  for (const m of lampMats) if (!/tail|brake/.test((m.name || '').toLowerCase())) m.emissiveIntensity = pulse;

  // ---- speed-rush FOV punch: the lens widens as the car gets up to speed + on a tap ----
  if (!(frozen && azOverride !== null)) {
    const targetFov = (phase === 'drift' || phase === 'pull')
      ? 40 + speedFactor * 3 + throttle * 9
      : 40;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();
  }

  // ---- DOF: focus locks onto the car (≈ scene origin at beltline) so it stays razor
  // sharp while the foreground tarmac and the hazed-out background melt into bokeh ----
  _look.set(0, LOOK_H, 0);
  const focusDist = camera.position.distanceTo(_look);
  bokeh.uniforms['focus'].value = focusDist;
  // during the tight rim study the subject is much closer — pull focus in so the wheel
  // is sharp and the body behind it falls off.
  if (phase === 'detail') bokeh.uniforms['focus'].value = camera.position.distanceTo(frontWheelWorld);

  // ---- feed the soundbed: engine RPM rides speed + throttle, screech rides the slide ----
  audio.update({
    active: revealed && !reduceMotion,
    drifting: phase === 'drift',
    speed: speedFactor,
    throttle,
  }, dt);

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
  bokeh.setSize(innerWidth, innerHeight);
  cinematic.uniforms.uResolution.value.set(innerWidth, innerHeight);
  const dpr = Math.min(window.devicePixelRatio, 2);
  apronMirror.getRenderTarget().setSize(Math.floor(innerWidth * dpr), Math.floor(innerHeight * dpr));
});
renderer.setSize(innerWidth, innerHeight);
composer.setSize(innerWidth, innerHeight);
