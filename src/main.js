import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
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

// deterministic pose override for screenshot capture: ?gx=0.6&gy=-0.2
const params = new URLSearchParams(location.search);
const gxOverride = params.has('gx') ? parseFloat(params.get('gx')) : null;
const gyOverride = params.has('gy') ? parseFloat(params.get('gy')) : null;
const hasOverride = gxOverride !== null || gyOverride !== null;

// ===== renderer (raytracing-quality output pipeline) =====
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// ===== IBL environment (carries the reflections / "raytraced" clearcoat look) =====
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = envRT.texture;

// ===== camera — 3/4 front hero framing =====
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const CAM = { x: 2.7, y: 0.82, z: 5.6 };   // base 3/4 angle, near eye-level
const LOOK_H = 0.5;

function fitCamera() {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  let scale = 1;
  if (aspect < 1) {
    // portrait phones: pull the rig back so the whole car stays in frame
    scale = 1 + (1 - aspect) * 1.15;
  } else if (aspect < 1.3) {
    scale = 1 + (1.3 - aspect) * 0.5;
  }
  CAM.scale = scale;
  camera.updateProjectionMatrix();
}
fitCamera();

// ===== lighting (HDRI does the heavy lifting; these sculpt + brand-tint) =====
scene.add(new THREE.AmbientLight(0x18233c, 0.35));

const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(3, 9.5, 2.5);   // high/overhead → short, grounded cast shadow
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 24;
key.shadow.camera.left = -6; key.shadow.camera.right = 6;
key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
key.shadow.bias = -0.0004; key.shadow.radius = 4;
scene.add(key);

const rim = new THREE.DirectionalLight(JRV.orange, 1.5);
rim.position.set(-6, 3.5, -5);
scene.add(rim);

const fill = new THREE.PointLight(JRV.mint, 5, 16, 2);
fill.position.set(-3.5, 1.6, 4);
scene.add(fill);

// soft front fill so the body face reads its orange (not just edge highlights)
const front = new THREE.DirectionalLight(0xfff1e8, 1.1);
front.position.set(2, 2, 7);
scene.add(front);

// ===== contact-shadow ground =====
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.ShadowMaterial({ opacity: 0.62 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

// reflective floor tint so the car doesn't float in a void
const floorGlow = new THREE.Mesh(
  new THREE.CircleGeometry(7, 64),
  new THREE.MeshStandardMaterial({
    color: 0x05080f, roughness: 0.55, metalness: 0.3,
    envMapIntensity: 0.45,
  })
);
floorGlow.rotation.x = -Math.PI / 2;
floorGlow.position.y = -0.001;
floorGlow.receiveShadow = true;
scene.add(floorGlow);

// ===== dotted blueprint backdrop (the JRV "dotted lines" motif, shared with ORI) =====
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
  t.repeat.set(20, 20);
  return t;
}
const dotPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(70, 70),
  new THREE.MeshBasicMaterial({ map: makeDotTexture(), transparent: true, opacity: 0.42, depthWrite: false })
);
dotPlane.position.set(0, 4, -9);
scene.add(dotPlane);

// concentric dashed construction rings behind the car
const rings = new THREE.Group();
rings.position.set(0, 1.0, -5.5);
for (let i = 0; i < 3; i++) {
  const r = 2.2 + i * 1.2;
  const pts = [];
  for (let a = 0; a <= 360; a += 4) pts.push(new THREE.Vector3(Math.cos(a * Math.PI / 180) * r, Math.sin(a * Math.PI / 180) * r, 0));
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.LineDashedMaterial({ color: JRV.orange, dashSize: 0.14, gapSize: 0.2, transparent: true, opacity: 0.26 });
  const line = new THREE.Line(g, m);
  line.computeLineDistances();
  rings.add(line);
}
scene.add(rings);

// ===== car =====
const carRoot = new THREE.Group();   // turntable + steering pivot
scene.add(carRoot);
const BASE_YAW = -0.5;                // resting 3/4 angle
const lampMats = [];
let innerCar = null;

// tight radial "blob" contact shadow that always hugs the wheels (parented to
// the car so it tracks heading) — kills the floating look the cast shadow can't.
function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
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

  // ---- strip the model's baked studio environment (backdrop dish + flat
  // shadow plane). Leaving them in floats the car and skews auto-scaling. ----
  const junk = [];
  car.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const s = b.getSize(new THREE.Vector3());
    const flatGround = s.y < 0.05 && Math.max(s.x, s.z) > 2;       // baked shadow plane
    const backdrop = /plane\d|backdrop|studio|ground|floor/i.test(o.name || '');
    if (flatGround || backdrop) junk.push(o);
  });
  junk.forEach((o) => o.removeFromParent());

  car.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    if (!m) return;
    const name = (m.name || '').toLowerCase();
    m.envMapIntensity = 1.5;

    if (/paint|coat|body/.test(name)) {
      // upgrade the body to a physical clearcoat carpaint in JRV orange
      o.material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(JRV.orange),
        metalness: 0.5,
        roughness: 0.4,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.5,
      });
    } else if (/glass|window/.test(name)) {
      m.transparent = true;
      m.opacity = 0.34;
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
    } else if (/silver|chrome|coat/.test(name)) {
      m.metalness = 1.0;
      m.roughness = 0.18;
      m.envMapIntensity = 1.9;
    }
  });

  // center on origin, scale to a target length, drop onto the ground (y=0)
  let box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.z);
  const targetLen = 4.4;
  car.scale.setScalar(targetLen / longest);

  box = new THREE.Box3().setFromObject(car);
  const center = box.getCenter(new THREE.Vector3());
  car.position.x -= center.x;
  car.position.z -= center.z;
  car.position.y -= box.min.y;          // wheels sit on the floor

  // blob contact shadow sized to the car footprint, parented so it tracks heading
  const fp = box.getSize(new THREE.Vector3());
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(fp.x * 1.5, fp.z * 1.25),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.8, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.015;
  carRoot.add(blob);

  innerCar = car;
  carRoot.add(car);
  loader.classList.add('gone');
}, undefined, (err) => {
  console.error('GLB load failed', err);
  loader.querySelector('span').innerHTML = 'COULD NOT LOAD <b>911</b>';
});

// ===== postprocessing (bloom on the headlights / brand rim) =====
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.6, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ===== pointer / tap tracking =====
const target = { x: 0, y: 0 };   // -1..1
const cur = { x: 0, y: 0 };
let lastInput = performance.now();

function setTargetFromEvent(clientX, clientY) {
  target.x = (clientX / innerWidth) * 2 - 1;
  target.y = (clientY / innerHeight) * 2 - 1;
  lastInput = performance.now();
}
if (!hasOverride) {
  window.addEventListener('pointermove', (e) => setTargetFromEvent(e.clientX, e.clientY));
  window.addEventListener('pointerdown', (e) => setTargetFromEvent(e.clientX, e.clientY));
} else {
  target.x = gxOverride ?? 0; target.y = gyOverride ?? 0; cur.x = target.x; cur.y = target.y;
}

// ===== loop =====
const clock = new THREE.Clock();
let idleSpin = 0;

function applyCam() {
  const s = CAM.scale || 1;
  camera.position.set(
    (CAM.x + cur.x * 0.7) * s,
    (CAM.y - cur.y * 0.5) * s,
    CAM.z * s
  );
  camera.lookAt(0, LOOK_H, 0);
}

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  const idle = !hasOverride && !reduceMotion && performance.now() - lastInput > 2600;
  if (idle) idleSpin += 0.0026;   // slow continuous turntable when left alone

  const k = reduceMotion ? 1 : 0.07;
  cur.x += (target.x - cur.x) * k;
  cur.y += (target.y - cur.y) * k;

  // car turns to meet the cursor (yaw), with a subtle bank + nose tip
  carRoot.rotation.y = BASE_YAW + cur.x * 1.0 + idleSpin;
  carRoot.rotation.z = -cur.x * 0.018;
  carRoot.rotation.x = cur.y * 0.022;
  // (car stays planted on the floor — no float, so the contact shadow reads true)

  // camera parallax
  applyCam();

  // headlight breathing pulse
  const pulse = reduceMotion ? 1.6 : 1.5 + Math.sin(t * 2.2) * 0.5;
  for (const m of lampMats) m.emissiveIntensity = pulse;

  rings.rotation.z = reduceMotion ? 0 : t * 0.03;

  // HUD: heading in degrees, wrapped 0–359
  let deg = ((carRoot.rotation.y * 180 / Math.PI) % 360 + 360) % 360;
  headingEl.textContent = `${String(Math.round(deg)).padStart(3, '0')}°`;

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
