'use client';

import { Component, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader } from '@react-three/drei';
import SceneFallback from './SceneFallback';

// Client-only mount: dynamic-import the Canvas so the page SSRs as normal DOM
// (Googlebot + no-WebGL users get the copy) and the 3D layer hydrates after.
const Experience = dynamic(() => import('./Experience'), {
  ssr: false,
  loading: () => null,
});

// If the WebGL tree throws at any point (context creation, GLB decode, a driver
// quirk on a low-end phone GPU), React would unmount the whole tree -> white
// screen. This boundary catches that and paints the branded fallback instead.
class GLBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    if (typeof console !== 'undefined') console.warn('[3D] disabled — falling back:', err?.message);
  }
  render() {
    if (this.state.failed) return <SceneFallback mood={this.props.mood} />;
    return this.props.children;
  }
}

// Cheap capability probe — bail to the static stage before we ever try to mount
// the Canvas on a device with no WebGL at all.
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export default function SceneMount({ mood, mode }) {
  // 'probe' until we know; avoids an SSR/client flash.
  const [gl, setGl] = useState('probe');
  useEffect(() => {
    setGl(hasWebGL() ? 'ok' : 'none');
  }, []);

  return (
    <>
      <div className="stage">
        {gl === 'none' ? (
          <SceneFallback mood={mood} />
        ) : gl === 'ok' ? (
          <GLBoundary mood={mood}>
            <Experience mood={mood} mode={mode} />
          </GLBoundary>
        ) : null}
      </div>
      {gl !== 'none' && (
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
      )}
    </>
  );
}
