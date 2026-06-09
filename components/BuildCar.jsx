'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// The "making-of" car, reworked per Rj's note (silver chrome → coat → 360).
// Three overlaid clones of the same body, sharing TWO sweep uniforms so they
// stay in lock-step. Both sweeps run nose-to-tail along world Z:
//   • wireClone   — light-blue 3D-viewport wireframe; shows AHEAD of the chrome
//                   sweep (the panels not built yet)
//   • chromeClone — bare polished SILVER CHROME; shows in the band that's been
//                   built (behind uChrome) but NOT yet painted (ahead of uPaint)
//   • paintClone  — the lit studio paint; shows BEHIND the paint sweep
// At any fragment exactly one clone draws (the three discard bands tile the
// car), so there's no coincident overdraw. A cool seam rides the build edge,
// a warm accent seam rides the coat edge.
//
//   build phase :  uChrome 0→1   panels forge in chrome, nose-to-tail
//   coat  phase :  uPaint  0→1   paint washes over the chrome
//   alive       :  wheels spin + head/tail lights flare on the 360 finish

const WORLD_X = new THREE.Vector3(1, 0, 0);
const Z_MIN = -2.3;
const Z_MAX = 2.3;

// wheel node patterns (same GLB as Car.jsx — verified node graph)
const RIM_RE = /chrome_wheels_20x9/i;
const TYRE_RE = /Object_4\.\d/i;
const BRAKE_RE = /brakedisc_FR/i;

// Inject the two-stage build sweep into any material. `mode`:
//   'wire'   → keep fragments AHEAD of the chrome sweep   (bt >  uChrome)
//   'chrome' → keep the built-but-unpainted band          (uPaint < bt <= uChrome)
//   'paint'  → keep fragments BEHIND the paint sweep      (bt <= uPaint)
function injectSweep(m, uniforms, mode) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader) => {
    if (prev) prev(shader);
    shader.uniforms.uChrome = uniforms.uChrome;
    shader.uniforms.uPaint = uniforms.uPaint;
    shader.uniforms.uBuildEdge = uniforms.uBuildEdge;
    shader.uniforms.uCoatEdge = uniforms.uCoatEdge;
    shader.uniforms.uZMin = uniforms.uZMin;
    shader.uniforms.uZMax = uniforms.uZMax;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSweepW;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSweepW = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    const discard =
      mode === 'wire'
        ? 'if (bt <= uChrome) discard;'
        : mode === 'chrome'
        ? 'if (bt > uChrome || bt <= uPaint) discard;'
        : 'if (bt > uPaint) discard;';
    // the seam this clone lights: wire+chrome glow on the build edge (uChrome),
    // paint glows on the coat edge (uPaint). chrome carries both edges.
    const seam =
      mode === 'wire'
        ? 'edgeC * uBuildEdge * 1.4'
        : mode === 'chrome'
        ? 'edgeC * uBuildEdge * 2.0 + edgeP * uCoatEdge * 2.0'
        : 'edgeP * uCoatEdge * 2.4';
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uChrome;\nuniform float uPaint;\nuniform vec3 uBuildEdge;\nuniform vec3 uCoatEdge;\nuniform float uZMin;\nuniform float uZMax;\nvarying vec3 vSweepW;'
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */ `
        {
          float bt = clamp((vSweepW.z - uZMin) / (uZMax - uZMin), 0.0, 1.0);
          ${discard}
          float edgeC = smoothstep(0.05, 0.0, abs(bt - uChrome))
                        * step(0.001, uChrome) * step(uChrome, 0.999);
          float edgeP = smoothstep(0.05, 0.0, abs(bt - uPaint))
                        * step(0.001, uPaint) * step(uPaint, 0.999);
          gl_FragColor.rgb += ${seam};
        }
        #include <dithering_fragment>`
      );
  };
  m.needsUpdate = true;
}

function enhanceRenderMaterial(m, base) {
  const name = (m.name || '').toLowerCase();
  if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name)) {
    m.clearcoat = 1.0;
    m.clearcoatRoughness = 0.06;
    m.roughness = Math.min(m.roughness ?? 0.3, 0.26);
    m.metalness = 0.65;
    m.envMapIntensity = 1.55;
    if (m.color) m.color.lerp(base, 0.7);
  } else if (/chrome|mirror|metal|rim|wheel/.test(name)) {
    m.metalness = 1.0;
    m.roughness = Math.min(m.roughness ?? 0.18, 0.2);
    m.envMapIntensity = 1.2;
    if ('transmission' in m) { m.transmission = 0; m.transparent = false; }
  } else if (/glass|window|windscreen|windshield|tint/.test(name)) {
    if ('transmission' in m) m.transmission = 0;
    m.metalness = 0;
    m.roughness = 0.06;
    m.color = new THREE.Color(0x0a0d12);
    m.envMapIntensity = 1.3;
    m.transparent = true;
    m.opacity = 0.55;
  } else if (/rubber|tyre|tire/.test(name)) {
    m.metalness = 0;
    m.roughness = Math.max(m.roughness ?? 0.7, 0.85);
  }
}

// Bare polished chrome — drives entirely off the HDRI reflections. Used for the
// "panels added in silver chrome" stage before the paint coats on.
function makeChrome(srcName) {
  const name = (srcName || '').toLowerCase();
  // glass stays glass even in the chrome blockout, so the canopy reads right
  if (/glass|window|windscreen|windshield|tint/.test(name)) {
    return new THREE.MeshStandardMaterial({
      color: 0x10141c,
      metalness: 0.1,
      roughness: 0.08,
      envMapIntensity: 1.1,
      transparent: true,
      opacity: 0.5,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: 0xc6ccd4, // light silver
    metalness: 1.0,
    roughness: 0.16,
    envMapIntensity: 1.5,
  });
}

export default function BuildCar({ phase, paintBase = '#1b2330', accent = '#88ccff' }) {
  const { scene } = useGLTF('/model/porsche-gt3rs-wheels.glb', true);
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // shared sweep uniforms (one object → all three clones stay in lock-step)
  const uniforms = useMemo(
    () => ({
      uChrome: { value: 0 },
      uPaint: { value: 0 },
      uBuildEdge: { value: new THREE.Color('#aeb9c9') }, // cool steel seam
      uCoatEdge: { value: new THREE.Color(accent) }, // warm coat seam
      uZMin: { value: Z_MIN },
      uZMax: { value: Z_MAX },
    }),
    [accent]
  );

  // ---- paint clone: lit studio materials + paint-on sweep ------------------
  const lightMats = useRef([]); // head/tail light mats to flare on "alive"
  const wheels = useRef([]);
  const paintCar = useMemo(() => {
    const car = scene.clone(true);
    const base = new THREE.Color(paintBase);
    const rims = [], tyres = [], brakes = [];
    lightMats.current = [];

    car.traverse((n) => {
      if (n.name) {
        if (RIM_RE.test(n.name)) rims.push(n);
        else if (TYRE_RE.test(n.name)) tyres.push(n);
        else if (BRAKE_RE.test(n.name)) brakes.push(n);
      }
      if (!n.isMesh || !n.material) return;
      n.castShadow = true;
      n.receiveShadow = false;
      // CLONE every material — scene.clone(true) shares material instances with
      // the cached GLB (and with Car.jsx). Owning our own copies keeps the
      // sweep uniforms bound to a live object (deterministic reveal).
      const prep = (src) => {
        const m = src.clone();
        enhanceRenderMaterial(m, base);
        const name = (m.name || '').toLowerCase();
        if (/headlight|head_light|drl|led/.test(name)) {
          m.emissive = new THREE.Color(0xfff1dc);
          m.emissiveIntensity = 0.15;
          m.userData.baseEmissive = 1.4;
          lightMats.current.push(m);
        } else if (/taillight|tail|backlight|brake(?!disc)/.test(name) || /(^|_)red(\.|$|_)/.test(name)) {
          m.emissive = new THREE.Color(0xff1414);
          m.emissiveIntensity = 0.12;
          m.userData.baseEmissive = 1.5;
          lightMats.current.push(m);
        }
        injectSweep(m, uniforms, 'paint');
        return m;
      };
      n.material = Array.isArray(n.material) ? n.material.map(prep) : prep(n.material);
    });

    // cluster each corner's rim+tyre+brake into a hub-pivoted group (see Car.jsx)
    const onlyOutermost = (list) => {
      const set = new Set(list);
      return list.filter((n) => {
        let p = n.parent;
        while (p) { if (set.has(p)) return false; p = p.parent; }
        return true;
      });
    };
    car.updateWorldMatrix(true, true);
    const cornerKey = (n) => {
      const p = n.getWorldPosition(new THREE.Vector3());
      return `${p.x >= 0 ? 'R' : 'L'}${p.z >= 0 ? 'F' : 'B'}`;
    };
    const corners = {};
    const bucket = (list, slot) => {
      for (const n of list) (corners[cornerKey(n)] ||= {})[slot] = n;
    };
    bucket(onlyOutermost(rims), 'rim');
    bucket(onlyOutermost(tyres), 'tyre');
    bucket(onlyOutermost(brakes), 'brake');

    const pivots = [];
    for (const k of Object.keys(corners)) {
      const { rim, tyre, brake } = corners[k];
      const parts = [rim, tyre, brake].filter(Boolean);
      if (!parts.length) continue;
      const hubSrc = tyre || rim || parts[0];
      const hubWorld = new THREE.Box3().setFromObject(hubSrc).getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.name = `BUILD_WHEEL_${k}`;
      car.add(pivot);
      car.updateWorldMatrix(true, true);
      pivot.position.copy(car.worldToLocal(hubWorld.clone()));
      pivot.updateWorldMatrix(true, true);
      for (const part of parts) pivot.attach(part);
      pivots.push(pivot);
    }
    wheels.current = pivots;
    return car;
  }, [scene, paintBase, uniforms]);

  // ---- chrome clone: bare silver panels, shows in the built-but-unpainted band
  const chromeCar = useMemo(() => {
    const car = scene.clone(true);
    car.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      n.castShadow = false;
      const mat = (src) => {
        const m = makeChrome(src.name);
        injectSweep(m, uniforms, 'chrome');
        return m;
      };
      n.material = Array.isArray(n.material) ? n.material.map(mat) : mat(n.material);
    });
    return car;
  }, [scene, uniforms]);

  // ---- wire clone: blue viewport wireframe, shows ahead of the chrome sweep -
  const wireCar = useMemo(() => {
    const car = scene.clone(true);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      wireframe: true,
      toneMapped: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    injectSweep(wireMat, uniforms, 'wire');
    car.traverse((n) => {
      if (n.isMesh) { n.material = wireMat; n.castShadow = false; }
    });
    return car;
  }, [scene, uniforms]);

  // ---- normalize all clones identically (centre, drop to floor, scale) -----
  useEffect(() => {
    for (const car of [paintCar, chromeCar, wireCar]) {
      car.scale.setScalar(1);
      car.position.set(0, 0, 0);
      const box = new THREE.Box3().setFromObject(car);
      const size = box.getSize(new THREE.Vector3());
      const s = 4.2 / Math.max(size.x, size.z);
      car.scale.setScalar(s);
      const box2 = new THREE.Box3().setFromObject(car);
      const c2 = box2.getCenter(new THREE.Vector3());
      car.position.x -= c2.x;
      car.position.z -= c2.z;
      car.position.y -= box2.min.y;
    }
  }, [paintCar, chromeCar, wireCar]);

  // ---- drive the two sweeps + the "alive" payoff from scroll reveal --------
  useFrame((_, delta) => {
    const reveal = phase.current.reveal ?? 0;
    // 1) panels forge in chrome nose-to-tail, fully built by ~0.40
    uniforms.uChrome.value = THREE.MathUtils.smoothstep(reveal, 0.1, 0.4);
    // 2) paint coats over the chrome, fully on by ~0.72, then HOLDS through the
    //    tail (the 360) so the finished car is always fully painted at the end.
    uniforms.uPaint.value = THREE.MathUtils.smoothstep(reveal, 0.46, 0.72);

    // alive: the 360 finish → wheels roll + lights flare
    const alive = THREE.MathUtils.smoothstep(reveal, 0.78, 0.96);
    const d = Math.min(delta, 0.05);
    if (alive > 0.001 && !reduceMotion) {
      const speed = alive * d * 9.0;
      for (const w of wheels.current) w.rotateOnWorldAxis(WORLD_X, speed);
    }
    for (const m of lightMats.current) {
      const target = 0.12 + alive * (m.userData.baseEmissive ?? 1.4);
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, d * 6);
    }
  });

  return (
    <group>
      <primitive object={wireCar} />
      <primitive object={chromeCar} />
      <primitive object={paintCar} />
    </group>
  );
}

useGLTF.preload('/model/porsche-gt3rs-wheels.glb', true);
