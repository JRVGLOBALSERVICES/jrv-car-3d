'use client';

import { useEffect, useMemo } from 'react';
import { Environment, MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import LaserGrid from './LaserGrid';
import CityLights from './CityLights';
import DustField from './DustField';
import CityWorld from './CityWorld';

function gradientTexture(top, bot) {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, top);
  g.addColorStop(0.6, bot);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function radialTexture(stops) {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.04, s / 2, s / 2, s * 0.5);
  for (const [p, col] of stops) g.addColorStop(p, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

// One light helper as a <rectAreaLight> with explicit lookAt.
function Rect({ color, intensity, width, height, position, target = [0, 0.5, 0] }) {
  const ref = (l) => {
    if (l) l.lookAt(new THREE.Vector3(...target));
  };
  return <rectAreaLight ref={ref} color={color} intensity={intensity} width={width} height={height} position={position} />;
}

export default function SceneRig({ mood, isMobile = false, spinRef }) {
  useEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);

  const backdrop = useMemo(() => gradientTexture(mood.bgTop, mood.bgBot), [mood.bgTop, mood.bgBot]);
  const contactTex = useMemo(
    () => radialTexture([[0, 'rgba(0,0,0,0.72)'], [0.55, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]),
    []
  );
  // accent wash rising behind the car — the reel's coloured backdrop glow
  const accentGlow = useMemo(() => {
    const a = new THREE.Color(mood.accent);
    const toRGBA = (al) => `rgba(${Math.round(a.r * 255)},${Math.round(a.g * 255)},${Math.round(a.b * 255)},${al})`;
    return radialTexture([[0, toRGBA(0.55)], [0.45, toRGBA(0.16)], [1, toRGBA(0)]]);
  }, [mood.accent]);

  return (
    <>
      {/* HDRI drives reflections + lighting ONLY — never the visible background */}
      <Environment files={mood.hdri} environmentIntensity={mood.envIntensity} background={false} />

      {/* Night air — depth fog so the building corridor recedes instead of
          popping in. Density per mood; additive scene elements opt out (fog:false). */}
      {mood.fog && <fog attach="fog" args={[mood.fog.color, mood.fog.near, mood.fog.far]} />}

      {/* Dark cyclorama backdrop (the controlled gradient, not the blurry photo) */}
      <mesh scale={[1, 1, 1]} rotation={[0, 0, 0]}>
        <sphereGeometry args={[40, 32, 16]} />
        <meshBasicMaterial map={backdrop} side={THREE.BackSide} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>

      {/* Accent wash rising behind the car (reel's coloured backdrop glow) — additive so Bloom lights it.
          Suppressed for the iridescent void (mood.noWash) so the paint is the sole hero. */}
      {!mood.noWash && (
        <mesh position={[0, 3.0, -11]} scale={[26, 16, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={accentGlow}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            // softer wash — an additive glow that Bloom amplifies, so 0.9 read as a
            // bright haze behind the car. Lower (and lower again on mobile) so it
            // frames the car without becoming one of the "too bright" rays.
            // when the 3D city world is present it carries the backdrop —
            // the wash steps back to a faint halo instead of a sky-wide smear
            opacity={(isMobile ? 0.46 : 0.6) * (mood.world ? 0.5 : 1)}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Boosted 3-point rig ported from the verified render */}
      <Rect color={mood.key_.color} intensity={mood.key_.power} width={7} height={5} position={mood.key_.pos} />
      <Rect color={mood.rim.color} intensity={mood.rim.power} width={4.5} height={3} position={mood.rim.pos} target={[0, 0.6, 0]} />
      <Rect color={mood.fill.color} intensity={mood.fill.power} width={9} height={5} position={mood.fill.pos} target={[0, 0, 0]} />
      {/* top soft box to lift the roof + read the clearcoat — dropped for the
          iridescent void (mood.noWash) where it just blows out the clearcoat */}
      {!mood.noWash && (
        <Rect color={mood.key_.color} intensity={mood.key_.power * 0.5} width={6} height={6} position={[0, 7, 0.5]} target={[0, 0, 0]} />
      )}
      <ambientLight intensity={0.09} />

      {/* Real cast shadow — RectAreaLights can't cast, so one shadow-casting
          spotlight rides above the key side. Tight cone + bias so the car
          throws a hard readable shadow onto the mirror floor (desktop only —
          shadow maps are off on mobile via Canvas `shadows`). */}
      <spotLight
        castShadow
        color={mood.key_.color}
        position={[mood.key_.pos[0] * 0.8, 8.5, mood.key_.pos[2] * 0.8]}
        angle={0.42}
        penumbra={0.75}
        intensity={mood.shadowSpot ?? 95}
        distance={36}
        decay={2}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00018}
        shadow-camera-near={2}
        shadow-camera-far={26}
      />

      {/* Wet-asphalt mirror floor — sharper mirror to match the reel's glass floor.
          Half-res reflection target on mobile to avoid GPU-memory white-screens. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <MeshReflectorMaterial
          resolution={isMobile ? 512 : 1536}
          mixBlur={isMobile ? 0 : 0.5}
          mixStrength={1.7}
          // Mobile: no blur passes — the blur is a per-frame full-screen kernel
          // and the single biggest GPU cost on a phone. A sharp low-res mirror
          // is far cheaper and still grounds the car. Desktop keeps the soft floor.
          blur={isMobile ? [0, 0] : [200, 70]}
          mirror={mood.floorMirror ?? 0.78}
          color={mood.floorColor ?? '#070a0e'}
          metalness={0.85}
          roughness={mood.floorRoughness ?? 0.32}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
        />
      </mesh>

      {/* Per-page signature scene element — each route gets a DIFFERENT one so the
          pages don't read as the same scene recoloured:
            grid    → home reel: streaming accent laser-grid (speed)
            skyline → /night-city: neon vertical light-bar field + bokeh
            sodium  → /night-street: warm light-pool + drifting dust motes
            void    → /iridescent: nothing (paint is the sole hero)
          Falls back to the laser-grid when a mood predates `signature`. */}
      {(mood.signature ?? (mood.noGrid ? 'void' : 'grid')) === 'grid' && (
        <LaserGrid color={mood.accent} intensity={isMobile ? 0.58 : 0.82} speedRef={spinRef} />
      )}
      {mood.signature === 'skyline' && <CityLights isMobile={isMobile} />}
      {mood.signature === 'sodium' && <DustField isMobile={isMobile} color={mood.windColor} />}

      {/* 3D night-city game world — instanced lit-window buildings, kerbside
          streetlights with volumetric cones, NFS traffic light-trails. `drive`
          streams it past the car speed-synced to the reel; `parked` rings the
          orbit pages with a static twinkling skyline. */}
      {mood.world && (
        <CityWorld
          isMobile={isMobile}
          speedRef={spinRef}
          mode={mood.world}
          accent={mood.accent}
          lampColor={mood.lampColor ?? '#ffb15c'}
        />
      )}

      {/* Soft contact shadow grounding the car on the reflection */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0.2]} scale={[3.4, 4.6, 1]}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial map={contactTex} transparent depthWrite={false} opacity={0.95} toneMapped={false} />
      </mesh>
    </>
  );
}
