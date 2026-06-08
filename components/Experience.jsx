'use client';

import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ScrollControls, Scroll, AdaptiveDpr, Preload } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';

import Car from './Car';
import SceneRig from './SceneRig';
import CameraDirector, { SHOTS } from './CameraDirector';
import { ColorGrade } from './Grade';

function Effects({ mood }) {
  return (
    <EffectComposer disableNormalPass multisampling={4}>
      <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.9} luminanceSmoothing={0.3} radius={0.7} />
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
  const spinRef = useRef(mode === 'orbit' ? 1 : 0.5);
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;

  return (
    <Canvas
      shadows
      dpr={[1, isMobile ? 2 : 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance', outputColorSpace: THREE.SRGBColorSpace }}
      camera={{ fov: SHOTS[0].fov, near: 0.05, far: 500, position: mode === 'orbit' ? [4.4, 1.2, 5.0] : SHOTS[0].pos }}
    >
      <Suspense fallback={null}>
        {mode === 'scroll' ? (
          <ScrollControls pages={SHOTS.length} damping={0.3}>
            <SceneRig mood={mood} />
            <Car mood={mood} spinRef={spinRef} />
            <CameraDirector spinRef={spinRef} reduceMotion={reduceMotion} />
            <Scroll html style={{ width: '100%' }}>
              <SectionLabels mood={mood} />
            </Scroll>
          </ScrollControls>
        ) : (
          <>
            <SceneRig mood={mood} />
            <Car mood={mood} spinRef={spinRef} />
            <OrbitControls
              enableDamping
              dampingFactor={0.06}
              minDistance={3.4}
              maxDistance={12}
              maxPolarAngle={Math.PI * 0.495}
              autoRotate={!reduceMotion}
              autoRotateSpeed={0.45}
              target={[0, 0.5, 0]}
            />
          </>
        )}
        <Effects mood={mood} />
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
