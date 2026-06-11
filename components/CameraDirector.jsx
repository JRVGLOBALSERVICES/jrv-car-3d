'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useScroll } from '@react-three/drei';
import * as THREE from 'three';

// Cinematic camera scene-changes. Each waypoint is a framed shot; scrolling
// flies the camera between them. Three camera LANGUAGES so every page scrolls
// differently (not one rig recoloured):
//   cut   → hold-then-snap between framed shots (the home reel's hard cuts)
//   glide → one continuous smoothed flight through the waypoints (drone descent)
//   arc   → waypoints are polar (angle/radius/height around the target); the
//           camera RIDES THE CIRCLE between them, so a 360° walk-around can
//           never cut through the car body.
export const SHOTS = [
  { id: '01', name: 'Front stance', pos: [3.4, 1.15, 4.6], tgt: [0, 0.55, 0.3], fov: 38 },
  { id: '02', name: 'Rear wing', pos: [-2.9, 1.55, -4.9], tgt: [0, 0.82, -1.5], fov: 40 },
  { id: '03', name: 'Wheel detail', pos: [4.5, 0.42, 1.9], tgt: [0.1, 0.45, 1.95], fov: 34 },
  { id: '04', name: 'Nose line', pos: [0.5, 0.5, 5.5], tgt: [0, 0.55, 0.6], fov: 36 },
  // chase cam: low behind the wing, looking PAST the car down the road so the
  // streaming buildings + light-trails carry the speed read (not the car alone)
  { id: '05', name: 'Street chase', pos: [-1.6, 1.4, -7.8], tgt: [0.3, 0.7, 11], fov: 48 },
  { id: '06', name: 'Hero orbit', pos: [3.8, 2.55, 4.2], tgt: [0, 0.5, 0], fov: 38 },
];

// Resolve a shot to a cartesian camera position. Polar (arc) shots define
// angle°/radius/height around their target instead of a raw pos.
export function shotPos(s) {
  if (s.pos) return s.pos;
  const a = (s.angle * Math.PI) / 180;
  const t = s.tgt ?? [0, 0.5, 0];
  return [t[0] + Math.sin(a) * s.radius, s.height, t[2] + Math.cos(a) * s.radius];
}

// Hold-then-snap: each shot holds its framing for the first ~58% of its scroll
// segment, then snaps to the next over the last ~42% — the reel's "cut between
// framed shots" feel rather than a constant slow drift.
const holdSnap = (t) => {
  const hold = 0.58;
  if (t <= hold) return 0;
  const u = (t - hold) / (1 - hold);
  return u * u * (3 - 2 * u); // smoothstep on the back portion
};
// Glide: plain smoothstep across the whole segment — continuous motion, no hold.
const glideEase = (t) => t * t * (3 - 2 * t);

export default function CameraDirector({
  spinRef,
  reduceMotion,
  shots = SHOTS,
  style = 'cut',
  drive = true,
  progressRef,
}) {
  const scroll = useScroll();
  const { camera, size } = useThree();
  const tgt = useRef(new THREE.Vector3(...(shots[0].tgt ?? [0, 0.5, 0])));
  const desiredPos = useRef(new THREE.Vector3(...shotPos(shots[0])));
  const lastOffset = useRef(0);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const offset = reduceMotion ? 0 : scroll.offset;
    if (progressRef) progressRef.current = offset;

    // wheel spin: only the DRIVE reel rolls — parked pages (walk-around,
    // descent, spectrum scrub) keep the wheels dead still, a parked car with
    // spinning wheels was the biggest "fake" tell.
    if (spinRef) {
      if (drive) {
        const vel = Math.abs(offset - lastOffset.current) / Math.max(d, 0.0001);
        spinRef.current = 0.2 + Math.min(vel * 2.9, 7);
      } else {
        spinRef.current = 0;
      }
    }
    lastOffset.current = offset;

    // interpolate between shots
    const n = shots.length - 1;
    const seg = THREE.MathUtils.clamp(offset, 0, 1) * n;
    const i = Math.min(Math.floor(seg), n - 1);
    const f = (style === 'cut' ? holdSnap : glideEase)(seg - i);
    const a = shots[i];
    const b = shots[i + 1];

    const t0 = a.tgt ?? [0, 0.5, 0];
    const t1 = b.tgt ?? [0, 0.5, 0];
    const tx = THREE.MathUtils.lerp(t0[0], t1[0], f);
    const ty = THREE.MathUtils.lerp(t0[1], t1[1], f);
    const tz = THREE.MathUtils.lerp(t0[2], t1[2], f);

    if (style === 'arc') {
      // ride the circle: interpolate the POLAR params, then project — the
      // camera sweeps around the car like a person walking it, never through it
      const ang = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(a.angle, b.angle, f));
      const rad = THREE.MathUtils.lerp(a.radius, b.radius, f);
      const hgt = THREE.MathUtils.lerp(a.height, b.height, f);
      desiredPos.current.set(tx + Math.sin(ang) * rad, hgt, tz + Math.cos(ang) * rad);
    } else {
      const pa = shotPos(a);
      const pb = shotPos(b);
      desiredPos.current.set(
        THREE.MathUtils.lerp(pa[0], pb[0], f),
        THREE.MathUtils.lerp(pa[1], pb[1], f),
        THREE.MathUtils.lerp(pa[2], pb[2], f)
      );
    }
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

    // slow drift on the held shot so a static frame still breathes — the cut
    // language only; glide/arc are already always in motion (handheld sway on
    // a drone path reads as jitter, not breath)
    const breathe = style === 'cut' && !reduceMotion ? Math.sin(performance.now() * 0.00018) * 0.12 : 0;

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
