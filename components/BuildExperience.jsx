'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ScrollControls,
  Scroll,
  useScroll,
  Grid,
  Html,
  Environment,
  MeshReflectorMaterial,
  AdaptiveDpr,
  Preload,
} from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

import BuildCar from './BuildCar';

const VIEWPORT_BG = new THREE.Color('#2a2a2a'); // 3D-software viewport grey
const STUDIO_BG = new THREE.Color('#0c0d10'); // dark studio for the reveal
const PAGES = 4; // scroll length

// Real 911 GT3 RS (992) dimensions — the HUD reads like a modelling viewport.
const DIMS = [
  { p: [0, 1.55, 2.5], t: 'L  4.572 m' },
  { p: [2.7, 0.95, 0], t: 'W  1.900 m' },
  { p: [0, 1.85, -0.6], t: 'H  1.297 m' },
  { p: [1.7, 0.5, 1.85], t: 'Ø  0.920 m' },
];

function smooth01(x) {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

// Flat viewport-grey vs dark-studio background, hard-cut at the reveal.
function Background({ building }) {
  const { scene } = useThree();
  scene.background = building ? VIEWPORT_BG : STUDIO_BG;
  return null;
}

// Slowly-orbiting modelling-scene props: light "cards" + a camera gizmo, like
// the reel's part-1 rig orbiting the wireframe model. Cardboard-brown wireframes.
function RigCards() {
  const g = useRef();
  useFrame((_, delta) => {
    if (g.current) g.current.rotation.y += Math.min(delta, 0.05) * 0.18;
  });
  return (
    <group ref={g}>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        const r = 5.2;
        return (
          <mesh key={i} position={[Math.cos(a) * r, 2.2 + i * 0.4, Math.sin(a) * r]} rotation={[0, -a + Math.PI / 2, 0]}>
            <planeGeometry args={[2.2, 1.4]} />
            <meshBasicMaterial color="#9f8c75" wireframe transparent opacity={0.7} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      {/* camera gizmo */}
      <mesh position={[0, 1.4, 5.6]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.55, 1.1, 4]} />
        <meshBasicMaterial color="#88ccff" wireframe transparent opacity={0.55} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Director({ phase, setBuilding, reduceMotion }) {
  const scroll = useScroll();
  const { camera } = useThree();
  const tgt = useRef(new THREE.Vector3(0, 0.55, 0));
  const lastBuilding = useRef(true);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const offset = reduceMotion ? 1 : scroll.offset;
    const building = reduceMotion ? false : offset < 0.5;

    phase.current.building = building;
    phase.current.reveal = offset;
    if (building !== lastBuilding.current) {
      lastBuilding.current = building;
      setBuilding(building);
    }

    // reveal eases the camera from a wide modelling view to a tight hero shot
    const r = smooth01((offset - 0.32) / 0.68);
    const az = -0.55 + offset * Math.PI * 1.45 + (reduceMotion ? 0 : Math.sin(performance.now() * 0.00015) * 0.05);
    const radius = THREE.MathUtils.lerp(6.4, 4.6, r);
    const height = THREE.MathUtils.lerp(2.5, 1.25, r);

    const want = new THREE.Vector3(Math.cos(az) * radius, height, Math.sin(az) * radius);
    const s = 1 - Math.pow(0.0016, d);
    camera.position.lerp(want, reduceMotion ? 1 : s);
    tgt.current.lerp(new THREE.Vector3(0, 0.55, 0), s);
    camera.lookAt(tgt.current);
  });
  return null;
}

function Studio({ visible }) {
  RectAreaLightUniformsLib.init();
  const backdrop = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#262a31');
    g.addColorStop(0.6, '#0c0d10');
    g.addColorStop(1, '#08090b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);

  return (
    <group visible={visible}>
      <mesh>
        <sphereGeometry args={[40, 32, 16]} />
        <meshBasicMaterial map={backdrop} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <MeshReflectorMaterial
          resolution={1024}
          mixBlur={0.8}
          mixStrength={2.2}
          blur={[360, 90]}
          mirror={0.7}
          color="#0a0c10"
          metalness={0.8}
          roughness={0.25}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
        />
      </mesh>
    </group>
  );
}

function HUD({ p, t }) {
  return (
    <Html position={p} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono), monospace',
          fontSize: '13px',
          letterSpacing: '0.06em',
          color: '#ffffff',
          textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span style={{ width: 6, height: 6, background: '#FFBB00', display: 'inline-block', transform: 'rotate(45deg)' }} />
        {t}
      </div>
    </Html>
  );
}

export default function BuildExperience({ mood }) {
  const phase = useRef({ building: true, reveal: 0 });
  const [building, setBuilding] = useState(true);
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;

  return (
    <Canvas
      shadows={!isMobile}
      dpr={[1, isMobile ? 1.3 : 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance', outputColorSpace: THREE.SRGBColorSpace }}
      camera={{ fov: 38, near: 0.05, far: 500, position: [5.6, 2.4, 4.2] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
      }}
    >
      <Suspense fallback={null}>
        <ScrollControls pages={PAGES} damping={0.3}>
          <Background building={building} />
          {/* HDRI drives reflections on the reveal materials only */}
          <Environment files={mood.hdri} environmentIntensity={0.95} background={false} />

          {/* studio reveal — visible after the cut */}
          <Studio visible={!building} />

          {/* viewport furniture — visible during the build */}
          <group visible={building}>
            <Grid
              args={[60, 60]}
              cellSize={0.5}
              cellThickness={0.6}
              cellColor="#555555"
              sectionSize={2.5}
              sectionThickness={1}
              sectionColor="#73767c"
              fadeDistance={26}
              fadeStrength={1.2}
              infiniteGrid
              position={[0, 0.001, 0]}
            />
            <axesHelper args={[1.6]} position={[0, 0.02, 0]} />
            <RigCards />
          </group>

          {/* 3-point reveal rig (only lights the render materials) */}
          <rectAreaLight color="#dfe6ff" intensity={11} width={7} height={5} position={[-7, 6, 5.5]} />
          <rectAreaLight color="#cdd8ff" intensity={6} width={9} height={5} position={[3, 2.2, -8]} />
          <rectAreaLight color="#ffffff" intensity={5.5} width={6} height={6} position={[0, 7, 0.5]} />
          <ambientLight intensity={0.12} />

          <BuildCar phase={phase} paintBase={mood.paintBase} />
          <Director phase={phase} setBuilding={setBuilding} reduceMotion={reduceMotion} />

          {/* measurement HUD — only during the build phase */}
          {building && DIMS.map((dseg) => <HUD key={dseg.t} p={dseg.p} t={dseg.t} />)}

          <Scroll html style={{ width: '100%' }}>
            <BuildLabels building={building} />
          </Scroll>
        </ScrollControls>

        <EffectComposer disableNormalPass multisampling={isMobile ? 0 : 4}>
          <Bloom mipmapBlur intensity={building ? 0.35 : 0.5} luminanceThreshold={0.82} luminanceSmoothing={0.22} radius={0.6} />
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
        <AdaptiveDpr pixelated />
        <Preload all />
      </Suspense>
    </Canvas>
  );
}

// Scroll-synced captions: the build phase reads like a modelling timeline, the
// reveal flips to the product line.
function BuildLabels({ building }) {
  const steps = [
    { k: 'PRIMITIVES', n: 'Block out the body' },
    { k: 'WIREFRAME', n: 'Refine the panels' },
    { k: 'RENDER', n: 'Light it · reveal' },
    { k: 'HERO', n: '911 GT3 RS' },
  ];
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%' }}>
      {steps.map((s, i) => (
        <section
          key={s.k}
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
                color: i < 2 ? '#88ccff' : '#9B6CFF',
              }}
            >
              {String(i + 1).padStart(2, '0')} — {s.k}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(30px, 5.5vw, 70px)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.02,
                color: 'var(--color-ink)',
                marginTop: '10px',
              }}
            >
              {s.n}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
