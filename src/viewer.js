import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Real-time Three.js showcase of the GT3 RS — same car + same look as the
// Cycles hero render, in an interactive (drag-orbit + zoom) viewer. The match
// comes from: the SAME brown_photostudio_02 HDRI as the env (carries the
// reflections), the rebuilt PBR exported from Blender (clearcoat paint,
// transmissive glass, real chrome, emissive lights), NeutralToneMapping
// (ACES washes carpaint out — see project memory), a Reflector floor for the
// showroom mirror, and selective bloom on the emissive lights only.

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const pctEl = document.getElementById('pct');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // matches AgX read far better than ACES
renderer.toneMappingExposure = 0.85;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0b0e);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(4.2, 1.6, 5.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.4;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.5; // never dip under the floor
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.55;

// the HDRI does ~all the lighting; a faint rim only, to keep the back edge alive.
// (extra directional lights on top of the studio HDRI just blow a white car out.)
const rim = new THREE.DirectionalLight(0xbfd0ff, 0.4);
rim.position.set(-6, 4, -5);
scene.add(rim);

// --- showroom mirror floor (the reflection the hero render has) ---
const floorGeo = new THREE.CircleGeometry(40, 64);
const reflector = new Reflector(floorGeo, {
  textureWidth: window.innerWidth * Math.min(window.devicePixelRatio, 2),
  textureHeight: window.innerHeight * Math.min(window.devicePixelRatio, 2),
  color: 0x101216,
});
reflector.rotateX(-Math.PI / 2);
reflector.position.y = 0;
scene.add(reflector);
// a dark glossy glaze over the mirror so it reads polished, not a perfect mirror
const glaze = new THREE.Mesh(
  floorGeo.clone(),
  new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.55 })
);
glaze.rotateX(-Math.PI / 2);
glaze.position.y = 0.001;
scene.add(glaze);

// --- IBL: the exact studio HDRI used by the Cycles render ---
new RGBELoader().load('/model/brown_photostudio_02_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
});

function frameObject(target) {
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // drop the car so its wheels sit on the floor (y=0)
  target.position.y -= box.min.y;
  box.setFromObject(target);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.z) || 1;
  const dist = maxDim * 1.45;
  camera.position.set(center.x + dist * 0.92, center.y + maxDim * 0.34, center.z + dist * 1.05);
  controls.target.set(center.x, center.y * 0.85, center.z);
  controls.minDistance = maxDim * 0.85;
  controls.maxDistance = maxDim * 4;
  controls.update();
}

// nudge the exported PBR toward the hero look by material name
function tuneMaterials(root) {
  root.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    n.castShadow = n.receiveShadow = true;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) {
      const name = (m.name || '').toLowerCase();
      if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name)) {
        m.clearcoat = 1.0;
        m.clearcoatRoughness = 0.08;
        m.roughness = Math.min(m.roughness ?? 0.4, 0.38);
        m.envMapIntensity = 0.85;
      } else if (/chrome|mirror|metal/.test(name)) {
        m.metalness = 1.0;
        m.roughness = Math.min(m.roughness ?? 0.1, 0.12);
        m.envMapIntensity = 1.4;
      } else if (/glass/.test(name)) {
        m.transmission = m.transmission || 0.9;
        m.roughness = 0.05;
        m.metalness = 0.0;
        m.ior = 1.45;
        m.envMapIntensity = 1.2;
        m.transparent = true;
      } else if (/rubber|tyre|tire|trim/.test(name)) {
        m.metalness = 0.0;
        m.roughness = Math.max(m.roughness ?? 0.6, 0.7);
      } else if (/led|light|backlight|tail/.test(name)) {
        m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 1, 2.2);
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

// --- post: selective bloom on the emissive lights, then tone-map in OutputPass ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.22,  // strength — just a kiss, the LEDs/tails only
  0.45,  // radius
  1.4    // threshold — high enough that bright white-paint reflections DON'T bloom
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});

// pause idle auto-rotate while dragging; resume a beat after release
let resumeT = 0;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeT); });
controls.addEventListener('end', () => {
  if (reduceMotion) return;
  resumeT = setTimeout(() => { controls.autoRotate = true; }, 2500);
});

renderer.setAnimationLoop(() => {
  controls.update();
  composer.render();
});
