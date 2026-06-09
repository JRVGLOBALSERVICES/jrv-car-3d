'use client';

// Branded static stage shown when WebGL is unavailable or the 3D layer throws.
// Never let the page collapse to a white screen — the page copy lives outside
// this component, so we just paint the studio backdrop + a quiet note.
export default function SceneFallback({ mood }) {
  const accent = (mood && mood.accent) || 'var(--color-accent)';
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        background:
          `radial-gradient(120% 90% at 50% 18%, ${accent}22 0%, transparent 46%),` +
          'radial-gradient(140% 120% at 50% 120%, rgba(255,255,255,0.06) 0%, transparent 60%),' +
          'var(--color-bg)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 'clamp(40px, 12vh, 120px)',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono), monospace',
          fontSize: '11px',
          letterSpacing: '0.34em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.4)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        Real-time 3D unavailable on this device
      </div>
    </div>
  );
}
