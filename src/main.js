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
const holdClay = params.has('clay');   // debug: pause in the clay-render reveal for a screenshot

// ===== renderer (raytracing-quality output pipeline) =====
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;        // controlled: wet clearcoat reads deeper with sharp, not blown, highlights
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
RectAreaLightUniformsLib.init();

// reveal state machine: 'load' (GLB downloading) → 'clay' (grey render + % counter
// ticking) → reveal SNAP → 'done' (full PBR + forest + rain + spray). See snapToReal().
let phase = 'load';
let revealed = false;
let loadedCar = null;
let clayT = 0;
const CLAY_DUR = 1.9;

// the reveal SNAP: clay → full PBR + forest env/bg + rain + spray, with a quick flash.
function snapToReal() {
  if (revealed) return;
  revealed = true;
  phase = 'done';
  if (loadedCar) loadedCar.traverse((o) => {
    if (o.isMesh && o.userData.realMat) o.material = o.userData.realMat;
  });
  applyForest();                 // forest IBL + blurred backdrop + fog (no-op until HDRI ready)
  rain.visible = true;
  sprayOn = true;
  // a brief white flash sells the "render finished" snap
  const fl = document.getElementById('flash');
  if (fl) { fl.classList.add('fire'); setTimeout(() => fl.classList.remove('fire'), 420); }
  const ld = document.getElementById('loader');
  if (ld) ld.classList.add('gone');
}

// ===== IBL — overcast FOREST HDRI (matches the reference: rain-soaked woodland) =====
// The reference render sits the car on a wet forest road under a diffuse overcast sky,
// blurred green foliage behind. So the HDRI is loaded for BOTH the environment
// (green-tinted reflections in the wet clearcoat) AND the background (blurred, darkened
// so it reads as moody woodland, not a bright photo). It is held in vars and only
// applied at the reveal SNAP — the clay-render phase before it stays a neutral grey.
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let forestEnv = null;      // PMREM env map (reflections + ambient)
let forestEquirect = null; // raw equirect, used blurred as the background
new RGBELoader().load('model/niederwihl_forest_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  forestEquirect = hdr;                          // keep (NOT disposed) for the blurred backdrop
  forestEnv = pmrem.fromEquirectangular(hdr).texture;
  // if the reveal already fired before the HDRI arrived, apply it now
  if (revealed) applyForest();
});

// neutral grey "render studio" while the clay model loads in (the WIP look)
scene.background = new THREE.Color(0x23282b);

function applyForest() {
  if (!forestEnv) return;
  scene.environment = forestEnv;
  scene.environmentIntensity = 1.15;
  scene.background = forestEquirect;
  scene.backgroundBlurriness = 0.55;             // soft, defocused foliage — not a sharp photo
  scene.backgroundIntensity = 0.62;              // darken toward the reference's moody overcast
  scene.fog = new THREE.FogExp2(0x10160f, 0.018); // green-grey woodland haze for depth
}

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

// ===== lighting (overcast-studio: soft + even, matches the wet-reveal reference) =====
// The reference render is lit by a diffuse overcast sky, NOT hard studio tubes —
// so the HDRI carries the ambient + reflections, and we add just ONE soft overhead
// area light for a clean roof/hood highlight plus a gentle fill. The previous four
// bright RectArea strips were what made the lighting read "weird" (clashing streaks).
scene.add(new THREE.AmbientLight(0x222b3a, 0.3));       // soft overcast base, kept low so the scene stays moody (car pops)

// soft overhead key — high + broad so the shadow is short and feathered, not hard
const key = new THREE.DirectionalLight(0xfbfdff, 1.05);
key.position.set(2.5, 10, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 26;
key.shadow.camera.left = -6; key.shadow.camera.right = 6;
key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
key.shadow.bias = -0.0004; key.shadow.radius = 7;        // softer penumbra
scene.add(key);

// ONE broad, soft overhead panel — the single clean specular sweep down the roof
// and hood that says "freshly coated". Wide + lower intensity = a soft band, not a
// hard tube. This is the only area light, so reflections stay calm and readable.
const panel = new THREE.RectAreaLight(0xf6f9ff, 5.5, 5.0, 9.0);
panel.position.set(0, 7.0, 0);
panel.lookAt(0, 0, 0);
scene.add(panel);

// cool sky fill from the front-left so the shadow side keeps detail (overcast bounce)
const skyFill = new THREE.DirectionalLight(0xd7e4ff, 0.55);
skyFill.position.set(-5, 4, 5);
scene.add(skyFill);

// whisper of brand mint on the deep shadow side only — kept very low so the orange
// paint reads true and the scene stays neutral/overcast, not green.
const mintKick = new THREE.PointLight(JRV.mint, 0.16, 9, 2.4);
mintKick.position.set(-4.5, 3.4, 3.4);          // higher + dimmer so it tints the shadow side, not a hot floor spot
scene.add(mintKick);

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
    // wet-asphalt read: near-black + low roughness so it mirrors the car & sky like
    // a rain-soaked surface (the reference grounds the car on glossy wet tarmac).
    color: 0x05070b, roughness: 0.14, metalness: 0.2, envMapIntensity: 1.25,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.002;
floor.receiveShadow = true;
scene.add(floor);

// ===== falling rain (the reference is mid-downpour) =====
// LineSegments rather than points so each drop is a short vertical STREAK, which reads
// as rain at speed. A box of streaks around the car falls each frame and recycles to
// the top when it passes the floor. Hidden until the reveal SNAP (clay phase is dry).
const RAIN_N = 1500;
const RAIN_LEN = 0.55;                            // streak length (world units)
const RAIN_BOX = { x: 16, z: 16, yTop: 17, yBot: -0.5 };
const rainPos = new Float32Array(RAIN_N * 2 * 3); // 2 verts (top+bottom) per streak
const rainSpeed = new Float32Array(RAIN_N);
for (let i = 0; i < RAIN_N; i++) {
  const x = (Math.random() * 2 - 1) * RAIN_BOX.x;
  const z = (Math.random() * 2 - 1) * RAIN_BOX.z;
  const y = Math.random() * (RAIN_BOX.yTop - RAIN_BOX.yBot) + RAIN_BOX.yBot;
  const o = i * 6;
  rainPos[o] = x;     rainPos[o + 1] = y;            rainPos[o + 2] = z; // top
  rainPos[o + 3] = x; rainPos[o + 4] = y - RAIN_LEN; rainPos[o + 5] = z; // bottom
  rainSpeed[i] = 14 + Math.random() * 10;
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(
  rainGeo,
  new THREE.LineBasicMaterial({ color: 0xaebccb, transparent: true, opacity: 0.0, depthWrite: false })
);
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);

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

// ===== procedural water-droplet clearcoat normal map (the "freshly coated / wet" read) =====
// The reference render's premium signature is beaded water on a mirror clearcoat. We
// fake it the way studios do for real-time: a normal map of scattered domed droplets
// applied to the CLEARCOAT layer only — so the base orange stays smooth and vivid, but
// the clear lacquer on top sparkles with thousands of tiny refracting highlights.
function makeDropletNormalMap(size = 1024, count = 900) {
  // 1) build a height field of smooth domed droplets
  const h = new Float32Array(size * size);
  let seed = 1337;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < count; i++) {
    const cx = rnd() * size, cy = rnd() * size;
    const r = 4 + rnd() * 16;              // droplet radius in px
    const amp = 0.5 + rnd() * 0.5;
    const r2 = r * r;
    const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(size - 1, (cx + r) | 0);
    const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(size - 1, (cy + r) | 0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const dome = Math.sqrt(1 - d2 / r2);   // hemispherical dome profile
      const v = dome * amp;
      if (v > h[y * size + x]) h[y * size + x] = v;  // droplets sit on top, not add
    }
  }
  // 2) derive a normal map from the height field (central differences)
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const strength = 2.2;
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
    const ny = (at(x, y - 1) - at(x, y + 1)) * strength;
    const nz = 1.0;
    const len = Math.hypot(nx, ny, nz) || 1;
    const o = (y * size + x) * 4;
    img.data[o]     = ((nx / len) * 0.5 + 0.5) * 255;
    img.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
    img.data[o + 2] = ((nz / len) * 0.5 + 0.5) * 255;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
const dropletNormal = makeDropletNormalMap();

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

  // shared flat clay material for the WIP render phase (matte light grey, no reflections)
  const clayMat = new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.95, metalness: 0.0 });

  car.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    if (!m) return;
    const name = (m.name || '').toLowerCase();
    m.envMapIntensity = 1.3;

    // build the FINAL material now, but stash it — clay is shown until the reveal snap.
    let realMat;
    if (/paint|coat|body/.test(name)) {
      // JRV-orange WET clearcoat, matching the reference reveal. A saturated base
      // coat (low-ish metalness so the orange stays vivid) under a mirror clearcoat
      // carrying a droplet normal map — thousands of tiny beaded highlights that read
      // as "freshly washed / just coated". That beading IS the premium signature.
      realMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(JRV.orange),
        metalness: 0.35,
        roughness: 0.28,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        clearcoatNormalMap: dropletNormal,
        clearcoatNormalScale: new THREE.Vector2(0.42, 0.42),
        envMapIntensity: 2.0,
      });
    } else if (/glass|window/.test(name)) {
      m.transparent = true;
      m.opacity = 0.32;
      m.roughness = 0.04;
      m.metalness = 0.0;
      m.envMapIntensity = 2.2;
      m.color = new THREE.Color(0x0c1422);
      realMat = m;
    } else if (/light|lamp|head|tail/.test(name)) {
      m.emissive = new THREE.Color(0xfff2e0);
      m.emissiveIntensity = 1.6;
      m.toneMapped = false;
      lampMats.push(m);                       // glows only once realMat is assigned (post-snap)
      realMat = m;
    } else if (/rubber|tire|tyre/.test(name)) {
      // wet tire: dark rubber with a faint clearcoat sheen + droplet beading (the
      // reference tires glisten too). Upgrade to physical so the wet layer reads.
      realMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x0a0b0d),
        roughness: 0.62, metalness: 0.0,
        clearcoat: 0.6, clearcoatRoughness: 0.35,
        clearcoatNormalMap: dropletNormal,
        clearcoatNormalScale: new THREE.Vector2(0.5, 0.5),
        envMapIntensity: 1.0,
      });
    } else if (/silver|chrome|rim|alloy/.test(name)) {
      // matte graphite-black machined alloy (reference runs black wheels), still
      // metallic enough to catch a crisp edge of the overhead panel.
      m.color = new THREE.Color(0x14161a);
      m.metalness = 1.0;
      m.roughness = 0.34;
      m.envMapIntensity = 1.6;
      realMat = m;
    } else {
      realMat = m;
    }

    o.userData.realMat = realMat;
    o.material = clayMat;                       // start as clay; snapToReal() swaps these in
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

  // ---- wheel spin (grounded in the real GLB structure) ----
  // Verified from the GLB: each AXLE is ONE node group spanning BOTH wheels —
  // `Cylinder.000*` (meshes 8-11) and `Cylinder.001*` (29-32), split only by
  // material (silver rim / rubber tire / disc). A rolling wheel rotates around the
  // car's WIDTH axis (the axle), so we spin each axle group around that axis — NOT
  // a hardcoded X (the earlier bug: car length runs along X here, so spinning X
  // rolled the wheels around their length and looked dead).
  car.updateMatrixWorld(true);
  const halfX = size.x / 2, halfZ = size.z / 2;
  const lengthAxis = size.x >= size.z ? 'x' : 'z';       // car points down its longest dim
  const spinAxis = lengthAxis === 'x' ? 'z' : 'x';       // wheels roll around the perpendicular (width) axis

  const axleGroups = new Map();                          // "Cylinder000" -> [meshes]
  car.traverse((o) => {
    if (!o.isMesh) return;
    // NB: three's GLTFLoader strips dots from GLB node names, so "Cylinder.000_0"
    // arrives as "Cylinder000_0" — match the de-dotted form and key by axle prefix.
    const mm = /^(Cylinder\d+)_/i.exec(o.name || '');
    if (mm) {
      const k = mm[1];
      if (!axleGroups.has(k)) axleGroups.set(k, []);
      axleGroups.get(k).push(o);
    }
  });

  for (const group of axleGroups.values()) {
    // axle center in world space, from the union bbox of its meshes
    const wb = new THREE.Box3();
    for (const m of group) wb.expandByObject(m);
    const wc = wb.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.copy(carRoot.worldToLocal(wc.clone()));
    carRoot.add(pivot);
    for (const m of group) pivot.attach(m);              // attach() preserves world xform
    wheels.push(pivot);
  }
  // expose the axis the loop should spin around
  wheels.spinAxis = spinAxis;

  // spray origins (car-local): all four wheel footprint corners at ground level,
  // so the rooster-tail kicks regardless of which Z end the model treats as rear.
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

  loadedCar = car;

  if (frozen || reduceMotion) {
    // screenshots + reduced-motion: skip the reveal animation, go straight to final.
    snapToReal();
    loader.classList.add('gone');
  } else {
    // begin the clay-render reveal: grey model is already in-scene, now tick the counter.
    phase = 'clay';
    document.getElementById('loader').classList.add('revealing'); // drop the opaque bg, keep counter
  }
}, undefined, (err) => {
  console.error('GLB load failed', err);
  const lbl = loader.querySelector('.rev-label');
  if (lbl) lbl.innerHTML = 'COULD NOT LOAD <b>911</b>';
});

// ===== tire WATER SPRAY (the reference money shot) — bright cool droplets w/ gravity =====
// Distinct from the warm drift smoke: this is a denser burst of small, bright blue-white
// droplets kicked UP, OUT and BACK from the spinning tires, arcing down under gravity —
// the rooster-tail a car throws on a soaking-wet road. Emits whenever the wheels roll.
let sprayOn = false;
function makeSprayTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, 'rgba(244,248,255,0.95)');
  g.addColorStop(0.45, 'rgba(200,216,235,0.55)');
  g.addColorStop(1, 'rgba(190,208,230,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const sprayTex = makeSprayTexture();
const SPRAY_N = 340;
const spray = [];
const sprayGroup = new THREE.Group();
scene.add(sprayGroup);
for (let i = 0; i < SPRAY_N; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sprayTex, transparent: true, opacity: 0, depthWrite: false, color: 0xeaf2ff,
  }));
  s.visible = false;
  s.userData = { life: 0, max: 0, vx: 0, vy: 0, vz: 0 };
  sprayGroup.add(s);
  spray.push(s);
}
let sprayCursor = 0;
const _spray = new THREE.Vector3();
function emitSpray(localPt, drift) {
  const s = spray[sprayCursor];
  sprayCursor = (sprayCursor + 1) % SPRAY_N;
  _spray.copy(localPt);
  carRoot.localToWorld(_spray);
  s.position.copy(_spray);
  s.position.x += (Math.random() - 0.5) * 0.22;
  s.position.z += (Math.random() - 0.5) * 0.22;
  s.userData.max = 0.55 + Math.random() * 0.55;
  s.userData.life = s.userData.max;
  // kicked up hard, fanned out sideways, and thrown back off the tread
  s.userData.vy = 2.6 + Math.random() * 3.0;
  s.userData.vx = (Math.random() - 0.5) * 3.0 - drift * 1.6;
  s.userData.vz = (Math.random() - 0.5) * 1.8 - 2.0;   // backward bias (rooster-tail)
  s.scale.setScalar(0.1 + Math.random() * 0.16);
  s.material.opacity = 0;
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
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
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
  } else if (phase === 'clay') {
    // WIP render phase: slow turntable on the grey clay model while the % ticks up
    if (holdClay) clayT = CLAY_DUR * 0.62; else clayT += dt;   // debug param freezes the counter
    const p = Math.min(clayT / CLAY_DUR, 1);
    const e = easeOutCubic(p);
    RIG.az = 0.55 + p * 0.5; RIG.el = 0.6; RIG.dist = 5.9;
    const pctEl = document.getElementById('pct');
    const fillEl = document.getElementById('revfill');
    if (pctEl) pctEl.textContent = Math.round(e * 100);
    if (fillEl) fillEl.style.transform = `scaleX(${e})`;
    if (p >= 1 && !holdClay) snapToReal();
  } else if (!reduceMotion) {
    advanceCinematic(dt);
  } else {
    RIG.az = 0.85; RIG.el = 0.62; RIG.dist = 5.7;   // static hero
  }
  applyCam();

  // ---- car drift-sway (subtle ± yaw so it feels alive while the camera flies) ----
  let drift = 0;
  if (phase === 'done' && !reduceMotion) {
    driftPhase += dt;
    drift = Math.sin(driftPhase * 0.9) * 0.14 + Math.sin(driftPhase * 2.3) * 0.04;
  }
  carRoot.rotation.y = BASE_YAW + drift;
  carRoot.rotation.z = -drift * 0.05;

  // ---- wheels spin (rolling around the axle/width axis) ----
  if (phase === 'done' && !reduceMotion && wheels.length) {
    const ws = 9.0;
    const axis = wheels.spinAxis || 'x';
    for (const w of wheels) w.rotation[axis] += ws * dt;
  }

  // ---- rain: fall + recycle streaks, fade in after the reveal ----
  if (rain.visible) {
    const rm = rain.material;
    if (rm.opacity < 0.32) rm.opacity = Math.min(0.32, rm.opacity + dt * 0.5);
    const pos = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 6, d = rainSpeed[i] * dt;
      pos[o + 1] -= d; pos[o + 4] -= d;
      if (pos[o + 4] < RAIN_BOX.yBot) {
        const x = (Math.random() * 2 - 1) * RAIN_BOX.x, z = (Math.random() * 2 - 1) * RAIN_BOX.z;
        pos[o] = x; pos[o + 1] = RAIN_BOX.yTop; pos[o + 2] = z;
        pos[o + 3] = x; pos[o + 4] = RAIN_BOX.yTop - RAIN_LEN; pos[o + 5] = z;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // ---- tire WATER SPRAY off the spinning rear wheels (replaces dry drift smoke) ----
  if (sprayOn && !reduceMotion && rearEmit.length) {
    const burst = 7 + Math.round(Math.abs(Math.sin(driftPhase * 0.9)) * 6); // heavier on drift
    for (let k = 0; k < burst; k++) {
      emitSpray(rearEmit[Math.random() < 0.5 ? 0 : 1], drift);
    }
  }
  for (const s of spray) {
    if (!s.visible) continue;
    const u = s.userData;
    u.life -= dt;
    if (u.life <= 0) { s.visible = false; s.material.opacity = 0; continue; }
    u.vy -= 6.6 * dt;                            // gravity → the rooster-tail arcs down
    s.position.x += u.vx * dt;
    s.position.y += u.vy * dt;
    s.position.z += u.vz * dt;
    if (s.position.y < 0.02) { s.position.y = 0.02; u.vy *= -0.25; u.vx *= 0.5; u.vz *= 0.5; } // splash
    const age = 1 - u.life / u.max;
    s.material.opacity = Math.sin(Math.min(age, 1) * Math.PI) * 0.9;
    s.scale.setScalar(0.08 + age * 0.24);
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
