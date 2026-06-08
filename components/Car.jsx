'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const WORLD_X = new THREE.Vector3(1, 0, 0); // car points along Z → axle is world X

// Wheel node patterns (verified from the GLB node graph): each corner carries a
// rim + tyre + brake-disc group. Spinning these about world-X rolls the wheels.
const WHEEL_RE = /chrome_wheels_20x9|Object_4\.\d|brakedisc_FR/i;

export default function Car({ mood, spinRef }) {
  const root = useRef();
  const wheels = useRef([]);
  const { scene } = useGLTF('/model/porsche-gt3rs-wheels.glb', true);

  // Clone so the two mood pages don't fight over one cached graph.
  const car = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    const found = [];
    const paintBase = new THREE.Color(mood.paintBase);

    car.traverse((n) => {
      if (n.name && WHEEL_RE.test(n.name)) found.push(n);
      if (!n.isMesh || !n.material) return;
      n.castShadow = true;
      n.receiveShadow = false;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) {
        const name = (m.name || '').toLowerCase();
        if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name)) {
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

    // Keep only the OUTERMOST matched node per wheel group — otherwise a matched
    // child inherits its parent's spin AND gets its own, doubling its rate.
    const set = new Set(found);
    const outermost = found.filter((n) => {
      let p = n.parent;
      while (p) {
        if (set.has(p)) return false;
        p = p.parent;
      }
      return true;
    });
    wheels.current = outermost;
    if (typeof window !== 'undefined') {
      window.__wheelCount = outermost.length;
      window.__wheelQ = () => (outermost[0] ? outermost[0].quaternion.toArray().map((n) => +n.toFixed(4)) : null);
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
