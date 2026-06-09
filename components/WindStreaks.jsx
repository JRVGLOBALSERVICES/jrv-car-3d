'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Air-rush streaks. The car's wheels spin and the camera flies, but with a dead
// static floor + air it reads as a parked car on rollers. These are faint,
// additive ribbons that stream PAST the body along its travel axis (Z) — the
// rushing-air cue that sells "in motion". Density/length/brightness all scale
// with `spinRef` (the same idle→fast speed signal that spins the wheels), so the
// air is calm at rest and tears past when you scroll the cut. Bloom catches them.
//
// Each streak is a camera-facing ribbon: its length maps to world-Z (the travel
// direction) and it rolls about that axis to face the camera, so it reads as a
// streak from any of the framed shots rather than vanishing edge-on.

const ZRANGE = 6.4; // streaks live in z ∈ [-ZRANGE, ZRANGE]; wrap when they exit
const X_SPREAD = 3.4;
const Y_LOW = 0.12;
const Y_HIGH = 2.7;

export default function WindStreaks({ spinRef, mood, reduceMotion = false, isMobile = false }) {
  const mesh = useRef();
  const { camera } = useThree();
  const count = isMobile ? 64 : 150;

  // per-instance home data: base position, length jitter, drift phase, brightness
  const data = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      // bias x away from dead-centre so streaks read as passing the flanks,
      // but allow some to cross the frame for depth
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (0.5 + Math.random() * X_SPREAD);
      arr.push({
        x,
        y: Y_LOW + Math.random() * (Y_HIGH - Y_LOW),
        z: -ZRANGE + Math.random() * (2 * ZRANGE),
        len: 0.32 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        wob: 0.04 + Math.random() * 0.09,
        bright: 0.45 + Math.random() * 0.55,
      });
    }
    return arr;
  }, [count]);

  const color = useMemo(() => new THREE.Color(mood?.windColor || '#dfe9ff'), [mood?.windColor]);

  // seed per-instance brightness once
  const seeded = useRef(false);
  const tmp = useMemo(() => ({
    m: new THREE.Matrix4(),
    basis: new THREE.Matrix4(),
    pos: new THREE.Vector3(),
    scl: new THREE.Vector3(),
    n: new THREE.Vector3(),
    x: new THREE.Vector3(),
    y: new THREE.Vector3(0, 0, 1), // length axis = world Z (car's travel axis)
    camDir: new THREE.Vector3(),
    col: new THREE.Color(),
  }), []);

  useFrame((_, delta) => {
    const inst = mesh.current;
    if (!inst) return;
    const d = Math.min(delta, 0.05);

    // normalised speed from the wheel-spin signal: idle≈0, scroll-fast≈1.
    // (orbit pages hold spin≈1 → a gentle constant drift keeps them alive.)
    const raw = spinRef?.current ?? 1;
    const s = THREE.MathUtils.clamp((raw - 0.5) / 4.5, 0, 1);
    const drift = 0.1 + s; // keep a faint floor so the air never fully dies

    // global brightness fade — near-invisible at rest, bright when tearing past
    if (inst.material) inst.material.opacity = 0.06 + s * 0.62;

    // shared camera-facing basis: length=Z, normal points at camera (flattened
    // perpendicular to Z), width = cross. Build once per frame for all streaks.
    tmp.camDir.copy(camera.position).normalize();
    const dotZ = tmp.camDir.z;
    tmp.n.set(tmp.camDir.x, tmp.camDir.y, tmp.camDir.z - dotZ).normalize();
    if (tmp.n.lengthSq() < 1e-4) tmp.n.set(1, 0, 0);
    tmp.x.copy(tmp.y).cross(tmp.n).normalize(); // width axis
    tmp.basis.makeBasis(tmp.x, tmp.y, tmp.n);

    const t = performance.now() * 0.001;
    const baseW = isMobile ? 0.016 : 0.013;

    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      // travel: stream toward -Z, faster with speed; wrap around
      p.z -= (1.6 + drift * 9.0) * d;
      if (p.z < -ZRANGE) p.z += 2 * ZRANGE;

      // subtle turbulence so it isn't a rigid conveyor
      const wx = Math.sin(t * 1.3 + p.phase) * p.wob;
      const wy = Math.cos(t * 1.1 + p.phase * 1.7) * p.wob * 0.6;

      // length grows with speed → streaks elongate as the car accelerates
      const length = p.len * (0.5 + drift * 2.4);

      tmp.m.copy(tmp.basis);
      tmp.m.scale(tmp.scl.set(baseW, length, 1));
      tmp.pos.set(p.x + wx, p.y + wy, p.z);
      tmp.m.setPosition(tmp.pos);
      inst.setMatrixAt(i, tmp.m);

      if (!seeded.current) {
        tmp.col.copy(color).multiplyScalar(p.bright);
        inst.setColorAt(i, tmp.col);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (!seeded.current && inst.instanceColor) {
      inst.instanceColor.needsUpdate = true;
      seeded.current = true;
    }
  });

  if (reduceMotion || mood?.noWind) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false} renderOrder={3}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.2}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}
