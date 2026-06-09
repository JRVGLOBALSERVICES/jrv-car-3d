'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const WORLD_X = new THREE.Vector3(1, 0, 0); // car points along Z → axle is world X

// Bold thin-film / oil-slick paint (reel DZUxxxXpBrH). MeshPhysicalMaterial's
// built-in `iridescence` is too subtle for this look (see memory), so we inject
// the reel's actual node graph by hand: Layer-Weight *Facing* → wavelength ramp.
// Facing the camera reads warm (red/orange), grazing edges go cool (blue/violet),
// with a fine flake sparkle. The spectral colour both tints the lit surface and
// adds a fresnel-weighted emissive so Bloom lights the grazing edges.
function applyIridescentPaint(m) {
  m.clearcoat = 0.7;
  m.clearcoatRoughness = 0.1;
  m.roughness = 0.22; // reel's Glossy roughness
  m.metalness = 0.5;
  m.envMapIntensity = 0.6; // keep the HDRI from blowing out the spectral read
  m.color = new THREE.Color('#141416'); // near-black charcoal substrate
  if ('iridescence' in m) {
    m.iridescence = 0.6;
    m.iridescenceIOR = 1.3;
    m.iridescenceThicknessRange = [120, 560];
  }
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        /* glsl */ `
        vec3 jrvHue(float h){
          h = fract(h);
          return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
        }
        void main() {`
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          vec3 vd = normalize(vViewPosition);
          vec3 nn = normalize(normal);
          float ndv = clamp(dot(nn, vd), 0.0, 1.0);
          float fres = pow(1.0 - ndv, 1.55);
          // facing → warm (orange/red), grazing → cool (blue/violet). Smooth,
          // view-stable spectrum (no screen-space hash → no shimmer/grain) so a
          // 3/4 view shows the whole spectrum walk cleanly across the panels.
          float h = (1.0 - ndv) * 0.92 + 0.04;
          vec3 iri = jrvHue(h);
          // tint the lit surface with the spectral colour (dominant over the base)
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.12 + iri * 0.9, 0.94);
          // fresnel-weighted glow on the grazing edges (Bloom catches this)
          totalEmissiveRadiance += iri * (fres * 1.5 + 0.14);
        }`
      );
  };
  m.needsUpdate = true;
}

// Per-part wheel node patterns (verified from the GLB node graph). Each corner
// has THREE separate sibling nodes — rim, tyre, brake — and crucially their node
// origins do NOT coincide (the brake-disc origin sits ~15u off the hub). Spinning
// each node about its own origin makes the brake sweep away from the tyre and the
// parts never move as one wheel. So we instead CLUSTER each corner's three parts
// into a Group pivoted at the true hub centre and spin the group rigidly.
const RIM_RE = /chrome_wheels_20x9/i;
const TYRE_RE = /Object_4\.\d/i;
const BRAKE_RE = /brakedisc_FR/i;

export default function Car({ mood, spinRef }) {
  const root = useRef();
  const wheels = useRef([]);
  const { scene } = useGLTF('/model/porsche-gt3rs-wheels.glb', true);

  // Clone so the two mood pages don't fight over one cached graph.
  const car = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    const rims = [], tyres = [], brakes = [];
    const paintBase = new THREE.Color(mood.paintBase);

    car.traverse((n) => {
      if (n.name) {
        if (RIM_RE.test(n.name)) rims.push(n);
        else if (TYRE_RE.test(n.name)) tyres.push(n);
        else if (BRAKE_RE.test(n.name)) brakes.push(n);
      }
      if (!n.isMesh || !n.material) return;
      n.castShadow = true;
      n.receiveShadow = false;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) {
        const name = (m.name || '').toLowerCase();
        if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name) && mood.paint === 'iridescent') {
          applyIridescentPaint(m);
        } else if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name)) {
          m.clearcoat = 1.0;
          m.clearcoatRoughness = 0.06;
          m.roughness = Math.min(m.roughness ?? 0.3, 0.3);
          m.metalness = 0.55;
          m.envMapIntensity = 1.45;
          if ('iridescence' in m) {
            m.iridescence = 1.0;
            m.iridescenceIOR = 1.4;
            m.iridescenceThicknessRange = [180, 820];
          }
          if (m.color) m.color.lerp(paintBase, 0.4);
          m.sheen = 1.0;
          m.sheenRoughness = 0.4;
          m.sheenColor = new THREE.Color(0x2a5cff);
        } else if (/chrome|mirror|metal|rim|wheel/.test(name)) {
          m.metalness = 1.0;
          m.roughness = Math.min(m.roughness ?? 0.18, 0.2);
          m.envMapIntensity = 1.25;
          if ('transmission' in m) { m.transmission = 0; m.transparent = false; }
        } else if (/glass|window|windscreen|windshield|tint/.test(name)) {
          if ('transmission' in m) m.transmission = 0;
          m.metalness = 0;
          m.roughness = 0.06;
          m.color = new THREE.Color(0x080b10);
          m.envMapIntensity = 1.4;
          m.transparent = true;
          m.opacity = 0.5;
        } else if (/rubber|tyre|tire/.test(name)) {
          m.metalness = 0;
          m.roughness = Math.max(m.roughness ?? 0.7, 0.85);
        }
        if (/headlight|head_light|drl|led/.test(name)) {
          m.emissive = new THREE.Color(0xfff1dc);
          m.emissiveIntensity = 1.2;
        } else if (/taillight|tail|backlight|brake(?!disc)/.test(name) || /(^|_)red(\.|$|_)/.test(name)) {
          m.emissive = new THREE.Color(0xff1414);
          m.emissiveIntensity = 1.3;
        }
        m.needsUpdate = true;
      }
    });

    // Outermost-only per part type, so a matched child doesn't get clustered twice.
    const onlyOutermost = (list) => {
      const set = new Set(list);
      return list.filter((n) => {
        let p = n.parent;
        while (p) { if (set.has(p)) return false; p = p.parent; }
        return true;
      });
    };
    const rimRoots = onlyOutermost(rims);
    const tyreRoots = onlyOutermost(tyres);
    const brakeRoots = onlyOutermost(brakes);

    // Cluster the parts into 4 corners by the sign of their world position
    // (x = left/right, z = front/rear). Each corner = 1 rim + 1 tyre + 1 brake.
    car.updateWorldMatrix(true, true);
    const cornerKey = (n) => {
      const p = n.getWorldPosition(new THREE.Vector3());
      return `${p.x >= 0 ? 'R' : 'L'}${p.z >= 0 ? 'F' : 'B'}`;
    };
    const corners = {}; // key -> { rim, tyre, brake }
    const bucket = (list, slot) => {
      for (const n of list) {
        const k = cornerKey(n);
        (corners[k] ||= {})[slot] = n;
      }
    };
    bucket(rimRoots, 'rim');
    bucket(tyreRoots, 'tyre');
    bucket(brakeRoots, 'brake');

    // For each corner: build a pivot Group at the TRUE hub centre (the tyre's
    // bounding-box centre — a clean torus around the axle), then re-parent the
    // rim + tyre + brake into it preserving world transforms. Spinning the group
    // now rolls all three parts rigidly about the real hub axis.
    const pivots = [];
    for (const k of Object.keys(corners)) {
      const { rim, tyre, brake } = corners[k];
      const parts = [rim, tyre, brake].filter(Boolean);
      if (!parts.length) continue;
      const hubSrc = tyre || rim || parts[0];
      const hubWorld = new THREE.Box3().setFromObject(hubSrc).getCenter(new THREE.Vector3());

      const pivot = new THREE.Group();
      pivot.name = `WHEEL_PIVOT_${k}`;
      car.add(pivot);
      car.updateWorldMatrix(true, true);
      pivot.position.copy(car.worldToLocal(hubWorld.clone()));
      pivot.updateWorldMatrix(true, true);
      for (const part of parts) pivot.attach(part); // preserves world transform
      pivots.push(pivot);
    }
    wheels.current = pivots;
    if (typeof window !== 'undefined') {
      window.__wheelCount = pivots.length;
      window.__wheelQ = () => (pivots[0] ? pivots[0].quaternion.toArray().map((n) => +n.toFixed(4)) : null);
    }

    // Normalize: center on origin, drop onto the floor (y=0), scale to ~4 units long.
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const target = 4.2;
    const s = target / Math.max(size.x, size.z);
    car.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(car);
    const c2 = box2.getCenter(new THREE.Vector3());
    car.position.x -= c2.x;
    car.position.z -= c2.z;
    car.position.y -= box2.min.y;
  }, [car, mood]);

  useFrame((_, delta) => {
    const base = spinRef?.current ?? 1;
    // clamp delta so a tab-switch stutter doesn't snap the wheels
    const d = Math.min(delta, 0.05);
    const speed = base * d * 9.0;
    if (speed === 0) return;
    for (const w of wheels.current) w.rotateOnWorldAxis(WORLD_X, speed);
  });

  return <primitive ref={root} object={car} />;
}

useGLTF.preload('/model/porsche-gt3rs-wheels.glb', true);
