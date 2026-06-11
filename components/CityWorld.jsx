'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Night-city game world — real 3D geometry, not just light bars. Instanced
// building blocks with baked lit-window facades flank a road corridor, sodium
// streetlights stand along the kerb with fake-volumetric light cones, and
// NFS-style traffic light-trails (red away / warm-white toward) stream down
// the road. Two modes:
//   drive  → the whole world streams toward the camera, speed-synced to
//            spinRef so buildings, lamps, trails and the laser-grid all read
//            as ONE ground speed (the home reel's gaming-world feel).
//   parked → static world ring; windows twinkle gently instead.
// All additive elements set fog:false so the scene fog doesn't grey them out.

const ROAD_HALF = 7.2; // buildings start outside this
const SPAN = 110; // corridor length (z) before wrap
const Z_FRONT = 34; // wrap line past the camera

// Baked facade: dark concrete wall + a grid of randomly-lit windows. Used as
// map + emissiveMap so lit windows survive the night exposure and Bloom.
function facadeTexture(warm = true) {
  const w = 128, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#07080a';
  ctx.fillRect(0, 0, w, h);
  const cols = 6, rows = 16;
  const cw = w / cols, ch = h / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (Math.random() > 0.34) continue; // most windows dark at night
      const lit = Math.random();
      ctx.fillStyle = warm && Math.random() > 0.4
        ? `rgba(255, ${170 + Math.floor(lit * 60)}, ${90 + Math.floor(lit * 60)}, ${0.65 + lit * 0.35})`
        : `rgba(${150 + Math.floor(lit * 60)}, ${200 + Math.floor(lit * 40)}, 255, ${0.55 + lit * 0.4})`;
      ctx.fillRect(x * cw + cw * 0.22, y * ch + ch * 0.3, cw * 0.56, ch * 0.42);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Fake-volumetric lamp cone — additive shader, bright at the lamp head and
// fading to nothing at the road, with a soft radial edge. Cheap "light ray".
const coneVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const coneFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    // vertical falloff: bright under the lamp head (uv.y=1), gone at the road
    float vert = pow(vUv.y, 1.6);
    // soft silhouette edge: faces pointing at the camera glow, edges dissolve
    vec3 vd = normalize(cameraPosition - vPosW);
    float edge = pow(abs(dot(normalize(vNormalW), vd)), 1.4);
    float a = vert * edge * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

function LampCone({ position, color, opacity = 0.1, height = 4.6, radius = 1.7 }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: coneVert,
        fragmentShader: coneFrag,
        uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [color, opacity]
  );
  return (
    <mesh position={position} material={mat} renderOrder={2}>
      <coneGeometry args={[radius, height, 24, 1, true]} />
    </mesh>
  );
}

export default function CityWorld({ isMobile = false, speedRef, mode = 'drive', accent = '#19e3ff', lampColor = '#ffb15c' }) {
  const buildingsRef = useRef();
  const polesRef = useRef();
  const headsRef = useRef();
  const trailsRef = useRef();
  const travel = useRef(0);
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const B_COUNT = isMobile ? 30 : 64;
  const L_COUNT = isMobile ? 6 : 10;
  const T_COUNT = mode === 'drive' ? (isMobile ? 12 : 26) : 0;

  const facade = useMemo(() => facadeTexture(true), []);

  // ---- buildings: two ranks per side, taller at the back, gap-toothed skyline
  const buildings = useMemo(() => {
    const a = [];
    for (let i = 0; i < B_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const rank = Math.random() > 0.55 ? 1 : 0; // 0 = kerbside, 1 = back row
      const x = side * (ROAD_HALF + 2.6 + rank * 9 + Math.random() * 6);
      const z = -SPAN * 0.72 + (i / B_COUNT) * SPAN + Math.random() * 5;
      const h = 5 + Math.random() * (rank ? 26 : 14);
      const w = 3.2 + Math.random() * 4.2;
      const d = 3.2 + Math.random() * 4.5;
      const tint = 0.6 + Math.random() * 0.4;
      a.push({ x, z, h, w, d, phase: Math.random() * Math.PI * 2, tint, col: new THREE.Color(tint, tint, tint * 1.05) });
    }
    return a;
  }, [B_COUNT]);

  // ---- streetlights: alternate kerbs, evenly spaced down the corridor
  const lamps = useMemo(() => {
    const a = [];
    for (let i = 0; i < L_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -SPAN * 0.6 + (i / L_COUNT) * SPAN * 0.92;
      a.push({ x: side * ROAD_HALF, z, h: 5.2 });
    }
    return a;
  }, [L_COUNT]);

  // ---- traffic light-trails: long thin additive streaks, two lanes
  const trails = useMemo(() => {
    const a = [];
    for (let i = 0; i < T_COUNT; i++) {
      const toward = i % 2 === 0; // oncoming lane = warm headlights, our lane ahead = red tails
      a.push({
        x: (toward ? 1 : -1) * (2.4 + Math.random() * 2.6),
        y: 0.32 + Math.random() * 0.5,
        z: -SPAN * 0.7 + Math.random() * SPAN,
        len: 4 + Math.random() * 7,
        spd: 14 + Math.random() * 16,
        toward,
        col: toward ? new THREE.Color('#ffd9a4') : new THREE.Color('#ff2230'),
      });
    }
    return a;
  }, [T_COUNT]);

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() }),
    []
  );

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const t = performance.now() * 0.001;
    const speed = mode === 'drive' && !reduceMotion ? (speedRef?.current ?? 0.2) * 3.1 : 0;
    travel.current += speed * d;

    // The car drives toward +z, so the world streams toward -z (past the car,
    // behind the camera). Map base z minus travel into [Z_FRONT - SPAN, Z_FRONT).
    const lo = Z_FRONT - SPAN;
    const wrap = (z) => {
      const zz = z - (mode === 'drive' ? travel.current : 0);
      return ((zz - lo) % SPAN + SPAN) % SPAN + lo;
    };

    const binst = buildingsRef.current;
    if (binst) {
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const z = wrap(b.z);
        tmp.p.set(b.x, b.h / 2, z);
        tmp.q.identity();
        tmp.s.set(b.w, b.h, b.d);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        binst.setMatrixAt(i, tmp.m);
        if (mode === 'parked' && !reduceMotion) {
          const tw = 0.85 + 0.15 * Math.sin(t * 0.4 + b.phase);
          tmp.c.set(b.tint * tw, b.tint * tw, b.tint * 1.05 * tw);
          binst.setColorAt(i, tmp.c);
        }
      }
      binst.instanceMatrix.needsUpdate = true;
      if (mode === 'parked' && binst.instanceColor) binst.instanceColor.needsUpdate = true;
    }

    const pinst = polesRef.current;
    const hinst = headsRef.current;
    if (pinst && hinst) {
      for (let i = 0; i < lamps.length; i++) {
        const l = lamps[i];
        const z = wrap(l.z);
        tmp.q.identity();
        tmp.p.set(l.x, l.h / 2, z);
        tmp.s.set(0.09, l.h, 0.09);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        pinst.setMatrixAt(i, tmp.m);
        // head leans in over the road
        const lean = l.x > 0 ? -0.9 : 0.9;
        tmp.p.set(l.x + lean, l.h, z);
        tmp.s.set(0.55, 0.1, 0.22);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        hinst.setMatrixAt(i, tmp.m);
      }
      pinst.instanceMatrix.needsUpdate = true;
      hinst.instanceMatrix.needsUpdate = true;
    }

    const tinst = trailsRef.current;
    if (tinst) {
      for (let i = 0; i < trails.length; i++) {
        const tr = trails[i];
        // trails move on their own + the world stream
        // oncoming traffic runs -z (at us); same-direction traffic runs +z (ahead)
        tr.z += (tr.toward ? -tr.spd : tr.spd) * d * (reduceMotion ? 0 : 1);
        const z = wrap(tr.z);
        tmp.p.set(tr.x, tr.y, z);
        tmp.q.identity();
        // stretch with speed so they smear into light streaks at velocity
        const stretch = 1 + Math.min((speedRef?.current ?? 0) * 0.55, 2.4);
        tmp.s.set(0.07, 0.05, tr.len * stretch);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        tinst.setMatrixAt(i, tmp.m);
        tmp.c.copy(tr.col).multiplyScalar(1.6);
        tinst.setColorAt(i, tmp.c);
      }
      tinst.instanceMatrix.needsUpdate = true;
      if (tinst.instanceColor) tinst.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* building blocks — lit-window facades, fogged so depth reads */}
      <instancedMesh ref={buildingsRef} args={[undefined, undefined, B_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          map={facade}
          emissiveMap={facade}
          emissive={'#ffffff'}
          emissiveIntensity={1.15}
          color={'#15171c'}
          roughness={0.9}
          metalness={0.05}
        />
      </instancedMesh>

      {/* lamp poles (dark) + emissive heads — heads bloom, floor mirrors them */}
      <instancedMesh ref={polesRef} args={[undefined, undefined, L_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={'#0c0e11'} roughness={0.7} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={headsRef} args={[undefined, undefined, L_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={lampColor} toneMapped={false} fog={false} />
      </instancedMesh>

      {/* fixed near-field lamp cones — the visible "light rays" by the car.
          Static (not streamed) so the pools of light hold while the world moves
          through them, which is how a real night drive reads. Skipped on mobile. */}
      {!isMobile && (
        <>
          <LampCone position={[-ROAD_HALF + 0.9, 2.6, -7]} color={lampColor} opacity={0.12} />
          <LampCone position={[ROAD_HALF - 0.9, 2.6, 3]} color={lampColor} opacity={0.1} />
          <LampCone position={[-ROAD_HALF + 0.9, 2.6, 12]} color={accent} opacity={0.07} />
        </>
      )}

      {/* traffic light-trails (drive mode only) */}
      {T_COUNT > 0 && (
        <instancedMesh ref={trailsRef} args={[undefined, undefined, T_COUNT]} frustumCulled={false} renderOrder={1}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
        </instancedMesh>
      )}
    </group>
  );
}
