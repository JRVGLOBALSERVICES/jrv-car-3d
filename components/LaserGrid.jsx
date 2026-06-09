'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Animated accent laser-grid on the floor — the signature product-viz element
// from the reference reel (the green grid sweeping across the mirror floor).
// One shader plane: a glowing grid with a radial fade and an expanding sweep
// ring. toneMapped=false + additive blending so the Bloom pass lights it up.
// Sits just above the mirror floor so MeshReflectorMaterial reflects it.
const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uScroll; // accumulated travel — streams the grid backward
  uniform float uSpeed;  // normalised 0..1 speed for the rush emphasis

  float gridLine(vec2 uv, float cells) {
    vec2 g = abs(fract(uv * cells - 0.5) - 0.5) / fwidth(uv * cells);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    vec2 uv = vUv;
    // Stream the grid sample along the travel axis so the ground rushes under
    // the car — the glow/fade stays centred (uses the un-scrolled uv), so only
    // the lines move. This is the ground-speed cue that kills the "parked" read.
    vec2 guv = uv + vec2(0.0, uScroll);
    float fine  = gridLine(guv, 30.0) * 0.38;
    float major = gridLine(guv, 7.5) * 0.92;
    float grid  = max(fine, major);

    float d = distance(uv, vec2(0.5));
    float fade = smoothstep(0.5, 0.06, d);

    // expanding laser ring sweeping outward from the car — trimmed so the sweep
    // line reads as a soft pulse, not a hard bright ray that Bloom blows out.
    float phase = fract(uTime * 0.085);
    float ring  = abs(d - phase * 0.52);
    float sweep = smoothstep(0.018, 0.0, ring) * 0.85 * (1.0 - phase);

    // at speed, the major lines smear into motion bands along the travel axis
    float band = gridLine(vec2(0.0, guv.y), 7.5) * uSpeed * 0.6;

    float a = (grid + sweep + band) * fade * uIntensity;
    // lower colour-boost on the sweep/speed so the grid stays a coloured glow
    // rather than clipping to a white-hot streak under the bloom pass.
    vec3 col = uColor * (1.0 + sweep * 1.3 + uSpeed * 0.45);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export default function LaserGrid({ color = '#00FF88', intensity = 1.0, size = 46, speedRef }) {
  const matRef = useRef();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uScroll: { value: 0 },
      uSpeed: { value: 0 },
    }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // keep colour/intensity live without rebuilding the material
  uniforms.uColor.value.set(color);
  uniforms.uIntensity.value = intensity;

  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useFrame((_, delta) => {
    if (reduceMotion) {
      uniforms.uSpeed.value = 0; // static glowing grid — no ground-rush / sweep travel
      return;
    }
    const d = Math.min(delta, 0.05);
    uniforms.uTime.value += d;
    // derive ground speed from the shared wheel-spin signal (idle 0.5 → fast ~5.5)
    const raw = speedRef?.current ?? 1;
    const s = THREE.MathUtils.clamp((raw - 0.5) / 4.5, 0, 1);
    uniforms.uSpeed.value = s;
    // accumulate travel; a faint floor keeps the orbit pages quietly alive
    uniforms.uScroll.value += (0.04 + s * 0.85) * d;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} renderOrder={2}>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
