'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// The "making-of" car (reel DZQgjJ9Mpmj). One cloned GLB that switches between
// two looks driven by the shared `phase` ref:
//   • build  → every mesh drawn as a light-blue 3D-viewport wireframe (#88CCFF)
//   • reveal → original materials, lightly enhanced for a clean studio render
// The reel cuts hard between the two, so we hard-swap materials at the threshold
// rather than cross-fading (a swap is cheap — just a draw-mode change).
export default function BuildCar({ phase, paintBase = '#1b2330' }) {
  const { scene } = useGLTF('/model/porsche-gt3rs-wheels.glb', true);
  const car = useMemo(() => scene.clone(true), [scene]);
  const applied = useRef(null); // 'wire' | 'render' — avoids re-swapping every frame

  const wireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        wireframe: true,
        toneMapped: false, // keep the viewport blue crisp under AgX
        transparent: true,
        opacity: 0.9,
      }),
    []
  );

  useEffect(() => {
    const base = new THREE.Color(paintBase);
    car.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      n.castShadow = true;
      n.receiveShadow = false;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      // Stash the (enhanced) render material so we can flip back to it.
      for (const m of mats) {
        const name = (m.name || '').toLowerCase();
        if (/carpaint|paint|body/.test(name) && !/glass|chrome|trim/.test(name)) {
          m.clearcoat = 1.0;
          m.clearcoatRoughness = 0.06;
          m.roughness = Math.min(m.roughness ?? 0.3, 0.28);
          m.metalness = 0.6;
          m.envMapIntensity = 1.35;
          if (m.color) m.color.lerp(base, 0.5);
        } else if (/chrome|mirror|metal|rim|wheel/.test(name)) {
          m.metalness = 1.0;
          m.roughness = Math.min(m.roughness ?? 0.18, 0.2);
          m.envMapIntensity = 1.25;
          if ('transmission' in m) { m.transmission = 0; m.transparent = false; }
        } else if (/glass|window|windscreen|windshield|tint/.test(name)) {
          if ('transmission' in m) m.transmission = 0;
          m.metalness = 0;
          m.roughness = 0.06;
          m.color = new THREE.Color(0x0a0d12);
          m.envMapIntensity = 1.3;
          m.transparent = true;
          m.opacity = 0.55;
        } else if (/rubber|tyre|tire/.test(name)) {
          m.metalness = 0;
          m.roughness = Math.max(m.roughness ?? 0.7, 0.85);
        }
        if (/headlight|head_light|drl|led/.test(name)) {
          m.emissive = new THREE.Color(0xfff1dc);
          m.emissiveIntensity = 1.1;
        } else if (/taillight|tail|backlight|brake(?!disc)/.test(name) || /(^|_)red(\.|$|_)/.test(name)) {
          m.emissive = new THREE.Color(0xff1414);
          m.emissiveIntensity = 1.2;
        }
        m.needsUpdate = true;
      }
      n.userData.renderMat = n.material; // original (now enhanced) material
    });

    // Normalize: centre on origin, drop onto the floor (y=0), scale to ~4.2 long.
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const s = 4.2 / Math.max(size.x, size.z);
    car.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(car);
    const c2 = box2.getCenter(new THREE.Vector3());
    car.position.x -= c2.x;
    car.position.z -= c2.z;
    car.position.y -= box2.min.y;
  }, [car, paintBase]);

  useFrame(() => {
    const want = phase.current.building ? 'wire' : 'render';
    if (want === applied.current) return;
    applied.current = want;
    car.traverse((n) => {
      if (!n.isMesh) return;
      n.material = want === 'wire' ? wireMat : n.userData.renderMat;
    });
  });

  return <primitive object={car} />;
}

useGLTF.preload('/model/porsche-gt3rs-wheels.glb', true);
