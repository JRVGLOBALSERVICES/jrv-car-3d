// Static DOM chrome — SSR'd so the copy is real HTML (SEO + no-WebGL fallback).
import Link from 'next/link';

const CREDIT = (
  <>
    Model:{' '}
    <a
      href="https://sketchfab.com/3d-models/2023-porsche-911-gt3-rs-992-bbb0f6181a52416bb776713cfd4987dd"
      target="_blank"
      rel="noopener"
    >
      “2023 Porsche 911 GT3 RS (992)”
    </a>{' '}
    by supercarmodels — CC-BY-4.0 · HDRI{' '}
    <a href="https://polyhaven.com" target="_blank" rel="noopener">
      Poly Haven
    </a>{' '}
    CC0 · Real-time React Three Fiber + AgX by JRV
  </>
);

export default function Chrome({ mood, current, hint, cue }) {
  return (
    <div className="chrome">
      <div className="brand">
        <span className="mark">
          JRV<b>.</b>
        </span>
        <span className="sub">{mood.label}</span>
      </div>

      <nav className="nav" aria-label="Showroom views">
        <Link href="/" aria-current={current === 'home' ? 'page' : undefined}>
          Reel
        </Link>
        <Link href="/night-city" aria-current={current === 'city' ? 'page' : undefined}>
          After Dark
        </Link>
        <Link href="/night-street" aria-current={current === 'street' ? 'page' : undefined}>
          Backstreet
        </Link>
      </nav>

      <div className="hero">
        <div className="tag">911 GT3 RS · live WebGL · {mood.label}</div>
        <h1>
          {mood.title[0]}
          <br />
          <em>{mood.title[1]}</em>
        </h1>
        <p>{mood.blurb}</p>
      </div>

      {hint && (
        <div className="hint">
          <div>
            <span className="dot" />
            {hint}
          </div>
          <div>react three fiber · agx · reflector floor</div>
        </div>
      )}

      {cue && (
        <div className="cue">
          <span className="line" />
          scroll the cut
        </div>
      )}

      <div className="credit">{CREDIT}</div>
    </div>
  );
}
