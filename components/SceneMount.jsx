'use client';

import dynamic from 'next/dynamic';
import { Loader } from '@react-three/drei';

// Client-only mount: dynamic-import the Canvas so the page SSRs as normal DOM
// (Googlebot + no-WebGL users get the copy) and the 3D layer hydrates after.
const Experience = dynamic(() => import('./Experience'), {
  ssr: false,
  loading: () => null,
});

export default function SceneMount({ mood, mode }) {
  return (
    <>
      <div className="stage">
        <Experience mood={mood} mode={mode} />
      </div>
      <Loader
        containerStyles={{ background: 'var(--color-bg)' }}
        innerStyles={{ width: 'min(280px, 60vw)', height: '2px', background: 'rgba(255,255,255,0.12)' }}
        barStyles={{ background: 'var(--color-accent)', height: '2px' }}
        dataStyles={{
          fontFamily: 'var(--font-mono), monospace',
          fontSize: '11px',
          letterSpacing: '0.34em',
          textTransform: 'uppercase',
          color: 'var(--color-ink)',
          marginTop: '14px',
        }}
        dataInterpolation={(p) => `Rendering 911 · ${p.toFixed(0)}%`}
      />
    </>
  );
}
