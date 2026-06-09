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
    <EffectComposer disableNormalPass multisampling={isMobile ? 0 : 4}>
      {/* Higher luminanceThreshold so only true speculars bloom — keeps the
          mid-tones crisp instead of washing the whole car into haze. */}
      <Bloom mipmapBlur intensity={mood.bloom ?? 0.5} luminanceThreshold={0.85} luminanceSmoothing={0.32} radius={0.55} />
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
      shadows={!isMobile}
      dpr={[1, isMobile ? 1.0 : 1.85]}
      gl={{ antialias: !isMobile, powerPreference: 'high-performance', outputColorSpace: THREE.SRGBColorSpace }}
      camera={{
        // Orbit pages frame statically — widen fov + pull back on mobile so the
        // portrait viewport doesn't balloon the car (scroll mode does this live
        // in CameraDirector). Desktop keeps the original framing.
        fov: mode === 'orbit' && isMobile ? 46 : SHOTS[0].fov,
        near: 0.05,
        far: 500,
        position:
          mode === 'orbit'
            ? (isMobile ? [5.6, 1.6, 6.4] : [4.4, 1.2, 5.0])
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
              maxPolarAngle={Math.PI * 0.495}
              autoRotate={!reduceMotion}
              autoRotateSpeed={0.45}
              target={[0, 0.5, 0]}
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
