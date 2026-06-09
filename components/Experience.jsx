'use client';

import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ScrollControls, Scroll, AdaptiveDpr, Preload } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';

import Car from './Car';
import SceneRig from './SceneRig';
import WindStreaks from './WindStreaks';
import CameraDirector, { SHOTS } from './CameraDirector';
import { ColorGrade } from './Grade';

function Effects({ mood, isMobile }) {
  return (
    <EffectComposer disableNormalPass multisampling={isMobile ? 2 : 4}>
      {/* With a composer active the canvas `antialias` is bypassed — the composer
          renders to its own buffer, so MSAA here is the real edge-AA lever. 2 on
          mobile (cheap on tile GPUs) kills the stair-stepping. Bloom is dialled
          back + tightened so the emissive grid/neon read as glow, not heavy rays:
          lower intensity (more so on mobile, where Rj saw it blown out), higher
          threshold (fewer things bloom), smaller radius (tighter halo, less smear,
          and less highlight-wash so colour stays saturated). */}
      <Bloom
        mipmapBlur
        intensity={(mood.bloom ?? 0.5) * (isMobile ? 0.58 : 0.82)}
        luminanceThreshold={isMobile ? 0.92 : 0.88}
        luminanceSmoothing={0.3}
        radius={isMobile ? 0.4 : 0.46}
      />
      <ColorGrade
        saturation={mood.grade.saturation}
        vignette={mood.grade.vignette}
        grain={mood.grade.grain}
        shadowTint={mood.grade.shadowTint}
        highTint={mood.grade.highTint}
      />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}

export default function Experience({ mood, mode = 'scroll' }) {
  // Orbit pages are PARKED showrooms (turntable on the camera, not the car), so
  // the wheels must be still — a parked car with forever-spinning wheels was the
  // biggest "fake" tell. Scroll reel idles near-still and rolls with scroll speed.
  const spinRef = useRef(mode === 'orbit' ? 0 : 0.2);
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;

  // Per-mood orbit camera so the orbit pages don't all circle identically.
  const orbit = mood.orbit ?? { start: [4.4, 1.2, 5.0], fov: 38, autoRotateSpeed: 0.45, polarMax: 0.495, target: [0, 0.5, 0] };

  return (
    <Canvas
      shadows={!isMobile}
      // Mobile DPR was capped at 1.0 — on a 2.5–3× phone that's a hard downsample
      // and the source of the "soft / low-res" look. 1.6 restores HD crispness on
      // a single-hero scene while staying well under the per-frame blur cost that
      // caused the earlier lag (that blur stays killed in SceneRig on mobile).
      dpr={[1, isMobile ? 1.6 : 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance', outputColorSpace: THREE.SRGBColorSpace }}
      camera={{
        // Orbit pages frame statically from the mood's own camera — widen fov +
        // pull back on mobile so the portrait viewport doesn't balloon the car
        // (scroll mode does this live in CameraDirector).
        fov: mode === 'orbit' ? (isMobile ? orbit.fov + 6 : orbit.fov) : SHOTS[0].fov,
        near: 0.05,
        far: 500,
        position:
          mode === 'orbit'
            ? (isMobile ? [orbit.start[0] + 1.2, orbit.start[1], orbit.start[2] + 1.4] : orbit.start)
            : SHOTS[0].pos,
      }}
      onCreated={({ gl }) => {
        // A lost context (phone GPU evicts WebGL under memory pressure / tab
        // switch) would otherwise blank the canvas permanently. preventDefault
        // lets the browser + r3f restore it instead of dying.
        gl.domElement.addEventListener(
          'webglcontextlost',
          (e) => e.preventDefault(),
          false,
        );
      }}
    >
      <Suspense fallback={null}>
        {mode === 'scroll' ? (
          <ScrollControls pages={SHOTS.length} damping={0.3}>
            <SceneRig mood={mood} isMobile={isMobile} spinRef={spinRef} />
            <Car mood={mood} spinRef={spinRef} />
            <WindStreaks spinRef={spinRef} mood={mood} reduceMotion={reduceMotion} isMobile={isMobile} />
            <CameraDirector spinRef={spinRef} reduceMotion={reduceMotion} />
            <Scroll html style={{ width: '100%' }}>
              <SectionLabels mood={mood} />
            </Scroll>
          </ScrollControls>
        ) : (
          <>
            <SceneRig mood={mood} isMobile={isMobile} spinRef={spinRef} />
            <Car mood={mood} spinRef={spinRef} />
            <WindStreaks spinRef={spinRef} mood={mood} reduceMotion={reduceMotion} isMobile={isMobile} />
            <OrbitControls
              enableDamping
              dampingFactor={0.06}
              minDistance={isMobile ? 4.8 : 3.4}
              maxDistance={isMobile ? 14 : 12}
              maxPolarAngle={Math.PI * (orbit.polarMax ?? 0.495)}
              autoRotate={!reduceMotion}
              autoRotateSpeed={orbit.autoRotateSpeed ?? 0.45}
              target={orbit.target ?? [0, 0.5, 0]}
            />
          </>
        )}
        <Effects mood={mood} isMobile={isMobile} />
        <AdaptiveDpr pixelated />
        <Preload all />
      </Suspense>
    </Canvas>
  );
}

// Section markers scroll with the camera shots — the visible "scene changes".
function SectionLabels({ mood }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%' }}>
      {SHOTS.map((s) => (
        <section
          key={s.id}
          style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'flex-start',
            padding: 'clamp(88px, 14vh, 150px) clamp(20px, 5vw, 72px) 0',
            justifyContent: 'flex-end',
          }}
        >
          <div style={{ textAlign: 'right', pointerEvents: 'none' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.34em',
                textTransform: 'uppercase',
                color: mood.accent,
              }}
            >
              {s.id} — Scene
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(34px, 6vw, 76px)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1,
                color: 'var(--color-ink)',
                marginTop: '10px',
              }}
            >
              {s.name}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
