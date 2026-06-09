'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ScrollControls,
  Scroll,
  useScroll,
  Grid,
  Html,
  Environment,
  MeshReflectorMaterial,
  ContactShadows,
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
const PAGES = 5; // scroll length — block-out · chrome · coat · 360 · drive
const CUT = 0.44; // viewport → studio handoff (panels done, coat begins)

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
  const { camera, size } = useThree();
  const tgt = useRef(new THREE.Vector3(0, 0.55, 0));
  const lastBuilding = useRef(true);
  // manual "turn the car around" drag on the finished-car step. Pointer events
  // bound to window so they fire even under drei's ScrollControls scroll overlay
  // (OrbitControls won't compose under ScrollControls — this does).
  const drag = useRef({ down: false, lastX: 0, az: 0, auto: 0 });
  const canInspect = useRef(false);

  useEffect(() => {
    const px = (e) => (e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0));
    const onDown = (e) => { drag.current.down = true; drag.current.lastX = px(e); };
    const onUp = () => { drag.current.down = false; };
    const onMove = (e) => {
      if (!drag.current.down || !canInspect.current) return;
      const x = px(e);
      drag.current.az += (x - drag.current.lastX) * 0.006;
      drag.current.lastX = x;
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const offset = reduceMotion ? 1 : scroll.offset;
    const building = reduceMotion ? false : offset < CUT;
    canInspect.current = reduceMotion || offset >= 0.78;

    phase.current.building = building;
    phase.current.reveal = offset;
    if (building !== lastBuilding.current) {
      lastBuilding.current = building;
      setBuilding(building);
    }

    // The camera dollies from a wide modelling view to the hero distance across
    // the block-out + chrome (offset 0 → 0.46). Then — the key change — it does
    // a FULL 360 turntable *while the paint coats on* (0.46 → 0.78), so you watch
    // the coat wrap around the whole car from every angle (front, side, rear,
    // far side) instead of from one fixed 3/4. It lands back on the hero angle
    // (2π ≡ 0) and holds there for the finished "drive" payoff.
    const buildIn = smooth01(offset / 0.46);
    const heroAz = -0.62; // front-left 3/4 hero
    let az;
    if (offset < 0.46) {
      az = THREE.MathUtils.lerp(-0.32, heroAz, buildIn); // ease to the hero start angle
    } else if (offset < 0.78) {
      const coatT = smooth01((offset - 0.46) / 0.32);
      az = heroAz + coatT * Math.PI * 2; // one full revolution synced to the coat
    } else {
      // finished car: a slow showroom turntable the user can grab and HOLD —
      // the auto-rotate pauses while dragging (grab-and-hold) and resumes on
      // release, so drag left/right actually turns the car and keeps it there.
      if (!drag.current.down && !reduceMotion) drag.current.auto += d * 0.12;
      az = heroAz + drag.current.auto + drag.current.az;
    }
    az += reduceMotion ? 0 : Math.sin(performance.now() * 0.00015) * 0.03;
    const radius = THREE.MathUtils.lerp(6.4, 5.0, buildIn);
    const height = THREE.MathUtils.lerp(2.6, 1.7, buildIn);

    const want = new THREE.Vector3(Math.cos(az) * radius, height, Math.sin(az) * radius);

    // Responsive framing — fov is vertical, so portrait phones balloon the car.
    // Dolly the orbit out (relative to the look target) + gently widen fov.
    const aspect = size.width / Math.max(size.height, 1);
    const fit = THREE.MathUtils.clamp(1.55 / aspect, 1, 1.64);
    const ty0 = 0.6;
    want.x *= fit;
    want.z *= fit;
    want.y = ty0 + (want.y - ty0) * fit;
    const fov = 38 * THREE.MathUtils.clamp(1.5 / aspect, 1, 1.16);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    const s = 1 - Math.pow(0.0016, d);
    camera.position.lerp(want, reduceMotion ? 1 : s);
    tgt.current.lerp(new THREE.Vector3(0, ty0, 0), s);
    camera.lookAt(tgt.current);
  });
  return null;
}

// Radial glow texture (bright centre → transparent) for the showroom mood washes.
function glowTexture(rgb) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, `rgba(${rgb},0.9)`);
  g.addColorStop(0.4, `rgba(${rgb},0.32)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

function Studio({ visible, isMobile }) {
  RectAreaLightUniformsLib.init();
  // Showroom infinity-cove: a bright top wall sweeping down into a darker
  // polished floor — the seamless studio backdrop of a car showroom, not the
  // black void it was before. The glossy floor + two coloured mood washes
  // (cool teal one side, warm amber the other) give the "concept showroom" feel.
  const backdrop = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#d9dde3');   // bright cove ceiling
    g.addColorStop(0.5, '#6a7077'); // soft horizon
    g.addColorStop(0.78, '#23262b');
    g.addColorStop(1, '#15171b');   // floor base
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  const coolGlow = useMemo(() => glowTexture('40,210,200'), []);
  const warmGlow = useMemo(() => glowTexture('255,150,70'), []);

  return (
    <group visible={visible}>
      <mesh>
        <sphereGeometry args={[40, 32, 16]} />
        <meshBasicMaterial map={backdrop} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Coloured showroom mood washes — additive so Bloom catches them, framing
          the car with a cool teal rake on the left and a warm amber on the right. */}
      <mesh position={[-9, 3.2, -10]} scale={[16, 13, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={coolGlow} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh position={[9, 2.6, -10]} scale={[15, 12, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={warmGlow} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.5} toneMapped={false} />
      </mesh>
      {/* Polished showroom floor — a lighter glossy reflection that grounds the
          car on a lit platform rather than the old near-black mirror over a void. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[44, 44]} />
        <MeshReflectorMaterial
          resolution={isMobile ? 512 : 1024}
          mixBlur={isMobile ? 0 : 1}
          mixStrength={0.8}
          // Mobile: skip the blur kernel (per-frame full-screen pass, the heaviest
          // single phone cost). Sharp low-res mirror + roughness still reads soft.
          blur={isMobile ? [0, 0] : [300, 120]}
          mirror={0.62}
          color="#1b1f25"
          metalness={0.6}
          roughness={0.62}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.25}
          reflectorOffset={0.01}
        />
      </mesh>
      {/* grounds the car so it sits ON the floor instead of hovering over it.
          Mobile bakes it once (frames=1) instead of re-rendering every frame. */}
      <ContactShadows position={[0, 0.01, 0]} scale={13} far={4} blur={2.6} opacity={0.55} resolution={isMobile ? 256 : 1024} frames={isMobile ? 1 : Infinity} color="#000000" />
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
      // Mobile DPR was 1.0 (soft/low-res on a 2.5–3× phone). 1.6 restores HD
      // crispness; the per-frame mirror blur stays killed on mobile below.
      dpr={[1, isMobile ? 1.6 : 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance', outputColorSpace: THREE.SRGBColorSpace }}
      camera={{ fov: 38, near: 0.05, far: 500, position: [5.6, 2.4, 4.2] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
      }}
    >
      <Suspense fallback={null}>
        <ScrollControls pages={PAGES} damping={0.3}>
          <Background building={building} />
          {/* HDRI drives reflections on the chrome + paint materials */}
          <Environment files={mood.hdri} environmentIntensity={0.9} background={false} />

          {/* studio reveal — visible after the cut */}
          <Studio visible={!building} isMobile={isMobile} />

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

          {/* 3-point reveal rig (only lights the chrome + render materials) —
              dialled back so the studio floor + backdrop don't blow out. */}
          <rectAreaLight color="#dfe6ff" intensity={6.2} width={7} height={5} position={[-7, 6, 5.5]} />
          <rectAreaLight color="#cdd8ff" intensity={3.8} width={9} height={5} position={[3, 2.2, -8]} />
          <rectAreaLight color="#ffffff" intensity={2.1} width={6} height={6} position={[0, 7, 0.5]} />
          <ambientLight intensity={0.14} />

          <BuildCar phase={phase} paintBase={mood.paintBase} accent={mood.accent} />
          <Director phase={phase} setBuilding={setBuilding} reduceMotion={reduceMotion} />

          {/* measurement HUD — only during the build phase */}
          {building && DIMS.map((dseg) => <HUD key={dseg.t} p={dseg.p} t={dseg.t} />)}

          <Scroll html style={{ width: '100%' }}>
            <BuildLabels />
          </Scroll>
        </ScrollControls>

        <EffectComposer disableNormalPass multisampling={isMobile ? 2 : 4}>
          {/* MSAA 2 on mobile (the real edge-AA when a composer is active) +
              tighter, dimmer bloom so the showroom washes glow without heavy rays. */}
          <Bloom mipmapBlur intensity={(building ? 0.3 : 0.32) * (isMobile ? 0.7 : 1)} luminanceThreshold={0.9} luminanceSmoothing={0.3} radius={isMobile ? 0.42 : 0.46} />
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
        <AdaptiveDpr pixelated />
        <Preload all />
      </Suspense>
    </Canvas>
  );
}

// Scroll-synced captions: modelling timeline (block-out → chrome panels → coat)
// then the product line (360 spin → finished car).
function BuildLabels() {
  const steps = [
    { k: 'BLOCK OUT', n: 'Primitive geometry', c: '#88ccff' },
    { k: 'PANELS', n: 'Forged in chrome', c: '#c6ccd4' },
    { k: 'COAT', n: 'Lay the paint', c: '#9B6CFF' },
    { k: '360° COAT', n: 'Wrap every panel', c: '#9B6CFF' },
    { k: 'SHOWROOM', n: '911 GT3 RS', c: '#88ccff', hint: 'drag to turn the car' },
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
                color: s.c,
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
            {s.hint && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--color-ink)',
                  opacity: 0.55,
                  marginTop: '14px',
                }}
              >
                ⟷ {s.hint}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
