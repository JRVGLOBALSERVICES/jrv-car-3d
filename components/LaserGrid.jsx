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

  float gridLine(vec2 uv, float cells) {
    vec2 g = abs(fract(uv * cells - 0.5) - 0.5) / fwidth(uv * cells);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    vec2 uv = vUv;
    float fine  = gridLine(uv, 30.0) * 0.42;
    float major = gridLine(uv, 7.5) * 1.25;
    float grid  = max(fine, major);

    float d = distance(uv, vec2(0.5));
    float fade = smoothstep(0.5, 0.06, d);

    // expanding laser ring sweeping outward from the car
    float phase = fract(uTime * 0.085);
    float ring  = abs(d - phase * 0.52);
    float sweep = smoothstep(0.018, 0.0, ring) * 1.4 * (1.0 - phase);

    float a = (grid + sweep) * fade * uIntensity;
    vec3 col = uColor * (1.0 + sweep * 2.2);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export default function LaserGrid({ color = '#00FF88', intensity = 1.0, size = 46 }) {
  const matRef = useRef();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // keep colour/intensity live without rebuilding the material
  uniforms.uColor.value.set(color);
  uniforms.uIntensity.value = intensity;

  useFrame((_, delta) => {
    uniforms.uTime.value += Math.min(delta, 0.05);
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
