'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useScroll } from '@react-three/drei';
import * as THREE from 'three';

// Cinematic camera scene-changes. Each waypoint is a framed shot; scrolling
// flies the camera between them. Wheels spin faster with scroll velocity.
export const SHOTS = [
  { id: '01', name: 'Front stance', pos: [3.4, 1.15, 4.6], tgt: [0, 0.55, 0.3], fov: 38 },
  { id: '02', name: 'Rear wing', pos: [-2.9, 1.55, -4.9], tgt: [0, 0.82, -1.5], fov: 40 },
  { id: '03', name: 'Wheel detail', pos: [4.5, 0.42, 1.9], tgt: [0.1, 0.45, 1.95], fov: 34 },
  { id: '04', name: 'Nose line', pos: [0.5, 0.5, 5.5], tgt: [0, 0.55, 0.6], fov: 36 },
  { id: '05', name: 'Hero orbit', pos: [3.8, 2.55, 4.2], tgt: [0, 0.5, 0], fov: 38 },
];

// Hold-then-snap: each shot holds its framing for the first ~58% of its scroll
// segment, then snaps to the next over the last ~42% — the reel's "cut between
// framed shots" feel rather than a constant slow drift.
const holdSnap = (t) => {
  const hold = 0.58;
  if (t <= hold) return 0;
  const u = (t - hold) / (1 - hold);
  return u * u * (3 - 2 * u); // smoothstep on the back portion
};

export default function CameraDirector({ spinRef, reduceMotion }) {
  const scroll = useScroll();
  const { camera, size } = useThree();
  const tgt = useRef(new THREE.Vector3(...SHOTS[0].tgt));
  const desiredPos = useRef(new THREE.Vector3(...SHOTS[0].pos));
  const lastOffset = useRef(0);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const offset = reduceMotion ? 0 : scroll.offset;

    // wheel spin: idle roll + a kick proportional to scroll velocity
    const vel = Math.abs(offset - lastOffset.current) / Math.max(d, 0.0001);
    lastOffset.current = offset;
    if (spinRef) spinRef.current = 0.5 + Math.min(vel * 2.2, 5);

    // interpolate between shots
    const n = SHOTS.length - 1;
    const seg = THREE.MathUtils.clamp(offset, 0, 1) * n;
    const i = Math.min(Math.floor(seg), n - 1);
    const f = holdSnap(seg - i);
    const a = SHOTS[i];
    const b = SHOTS[i + 1];

    desiredPos.current.set(
      THREE.MathUtils.lerp(a.pos[0], b.pos[0], f),
      THREE.MathUtils.lerp(a.pos[1], b.pos[1], f),
      THREE.MathUtils.lerp(a.pos[2], b.pos[2], f)
    );
    const tx = THREE.MathUtils.lerp(a.tgt[0], b.tgt[0], f);
    const ty = THREE.MathUtils.lerp(a.tgt[1], b.tgt[1], f);
    const tz = THREE.MathUtils.lerp(a.tgt[2], b.tgt[2], f);
    let fov = THREE.MathUtils.lerp(a.fov, b.fov, f);

    // Responsive framing. fov is VERTICAL in three.js, so a portrait phone
    // (aspect ~0.46) sees a tiny horizontal slice for the same fov and the car
    // balloons + crops. Compensate by (a) dollying the camera back along its
    // view direction — keeps the framing angle, no fisheye — and (b) a gentle
    // fov widen so we don't pull to infinity. Desktop (aspect ≥ ~1.55) is a no-op.
    const aspect = size.width / Math.max(size.height, 1);
    const fit = THREE.MathUtils.clamp(1.55 / aspect, 1, 1.64);
    const fovMul = THREE.MathUtils.clamp(1.5 / aspect, 1, 1.16);
    fov *= fovMul;
    // dolly desiredPos away from the target by `fit`
    desiredPos.current.x = tx + (desiredPos.current.x - tx) * fit;
    desiredPos.current.y = ty + (desiredPos.current.y - ty) * fit;
    desiredPos.current.z = tz + (desiredPos.current.z - tz) * fit;

    // slow drift on the held shot so a static frame still breathes
    const breathe = reduceMotion ? 0 : Math.sin(performance.now() * 0.00018) * 0.12;

    const smooth = 1 - Math.pow(0.0016, d); // frame-rate independent damping
    camera.position.lerp(
      desiredPos.current.clone().add(new THREE.Vector3(breathe, 0, 0)),
      smooth
    );
    tgt.current.lerp(new THREE.Vector3(tx, ty, tz), smooth);
    camera.lookAt(tgt.current);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, fov, smooth);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
