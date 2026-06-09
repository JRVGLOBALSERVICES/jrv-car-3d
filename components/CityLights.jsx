'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Neon skyline light-field — the signature scene element for /night-city.
// A band of thin vertical glowing bars (+ a few bokeh discs) standing far
// behind and around the car like a distant city at night. Additive +
// toneMapped=false so the Bloom pass blooms them, and they sit above the floor
// so the wet MeshReflectorMaterial mirrors them back. This REPLACES the
// laser-grid here so "After Dark" reads as a genuinely different scene from the
// home reel rather than the same grid in a different colour.
//
// Cheap: one instanced mesh, matrices rebuilt per frame for a gentle vertical
// bob + per-bar twinkle (≤84 instances). Frozen entirely under reduced-motion.
const PALETTE = ['#19e3ff', '#76f4ff', '#ff4fd8', '#b78bff', '#eaf6ff'];

export default function CityLights({ isMobile = false }) {
  const mesh = useRef();
  const seeded = useRef(false);
  const reduceMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const count = isMobile ? 42 : 84;

  const data = useMemo(() => {
    const a = [];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      // push the field out past the car and bias toward the back hemisphere so
      // the foreground stays clean for the turntable
      const r = 12 + Math.random() * 13;
      const h = 1.0 + Math.random() * 8.5;
      a.push({
        x: Math.cos(ang) * r,
        z: Math.sin(ang) * r - 3.0,
        h,
        w: 0.05 + Math.random() * 0.17,
        y0: 0.15 + Math.random() * 1.1 + h / 2,
        ang,
        phase: Math.random() * Math.PI * 2,
        tw: 0.5 + Math.random() * 0.9, // twinkle rate
        bob: 0.05 + Math.random() * 0.14,
        bright: 0.55 + Math.random() * 0.8,
        col: new THREE.Color(PALETTE[Math.floor(Math.random() * PALETTE.length)]),
      });
    }
    return a;
  }, [count]);

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), e: new THREE.Euler(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() }),
    []
  );

  useFrame((_, delta) => {
    const inst = mesh.current;
    if (!inst) return;
    if (reduceMotion && seeded.current) return; // frozen light-field — settle once, then idle
    const t = reduceMotion ? 0 : performance.now() * 0.001;
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      const bob = reduceMotion ? 0 : Math.sin(t * 0.6 + b.phase) * b.bob;
      // face the bar inward toward the car (rotate about Y)
      tmp.e.set(0, -b.ang + Math.PI / 2, 0);
      tmp.q.setFromEuler(tmp.e);
      tmp.p.set(b.x, b.y0 + bob, b.z);
      tmp.s.set(b.w, b.h, 1);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      inst.setMatrixAt(i, tmp.m);

      // twinkle: modulate per-instance brightness (additive so this reads as flicker)
      const tw = reduceMotion ? 0.85 : 0.6 + 0.4 * Math.sin(t * b.tw + b.phase);
      tmp.c.copy(b.col).multiplyScalar(b.bright * tw);
      inst.setColorAt(i, tmp.c);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    if (!seeded.current) seeded.current = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}
