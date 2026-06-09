'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Sodium streetlight atmosphere — the signature scene element for /night-street.
// A warm light-pool spilled on the damp asphalt + slow drifting dust motes
// caught in the lamp glow. This REPLACES the laser-grid here so "Backstreet"
// reads as a real backstreet under a lamp, not the home reel's grid recoloured.
//
// Two cheap pieces: a static additive radial plane on the floor (the pool), and
// one instanced mesh of small warm motes drifting up-and-sideways like dust in
// a beam. Additive + toneMapped=false so Bloom carries the warm haze. Motes
// freeze under reduced-motion; the pool stays (it's static light, not motion).

function poolTexture(rgb) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.02, s / 2, s / 2, s * 0.5);
  g.addColorStop(0, `rgba(${rgb},0.55)`);
  g.addColorStop(0.4, `rgba(${rgb},0.2)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

export default function DustField({ isMobile = false, color = '#ffd9a8' }) {
  const mesh = useRef();
  const reduceMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const count = isMobile ? 34 : 70;

  const warm = useMemo(() => new THREE.Color(color), [color]);
  const rgb = useMemo(() => {
    const c = new THREE.Color(color);
    return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  }, [color]);
  const poolTex = useMemo(() => poolTexture(rgb), [rgb]);

  const data = useMemo(() => {
    const a = [];
    for (let i = 0; i < count; i++) {
      a.push({
        x: (Math.random() - 0.5) * 7,
        y: 0.1 + Math.random() * 3.4,
        z: (Math.random() - 0.5) * 7,
        sz: 0.012 + Math.random() * 0.03,
        ph: Math.random() * Math.PI * 2,
        rise: 0.05 + Math.random() * 0.14,
        drift: 0.04 + Math.random() * 0.08,
        bright: 0.4 + Math.random() * 0.7,
      });
    }
    return a;
  }, [count]);

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), q: new THREE.Quaternion() }),
    []
  );
  const seeded = useRef(false);

  useFrame((_, delta) => {
    const inst = mesh.current;
    if (!inst) return;
    if (reduceMotion && seeded.current) return; // frozen field — settle once, then idle
    const d = Math.min(delta, 0.05);
    const t = performance.now() * 0.001;
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      if (!reduceMotion) {
        p.y += p.rise * d;
        if (p.y > 3.6) p.y = 0.1; // wrap
      }
      const wob = reduceMotion ? 0 : Math.sin(t * 0.7 + p.ph) * p.drift;
      tmp.p.set(p.x + wob, p.y, p.z + Math.cos(t * 0.5 + p.ph) * p.drift);
      // fade with height so motes dissolve as they leave the pool
      const fade = THREE.MathUtils.clamp(1 - p.y / 3.6, 0, 1);
      tmp.s.set(p.sz, p.sz, p.sz);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      inst.setMatrixAt(i, tmp.m);
      tmp.c.copy(warm).multiplyScalar(p.bright * (0.35 + fade * 0.9));
      inst.setColorAt(i, tmp.c);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    if (!seeded.current) seeded.current = true;
  });

  return (
    <>
      {/* warm light-pool on the damp asphalt */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0.1]} scale={[9, 9, 1]} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={poolTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.68} toneMapped={false} />
      </mesh>

      {/* drifting dust motes caught in the lamp glow */}
      <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false} renderOrder={3}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
    </>
  );
}
