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

const VIEWS = [
  { href: '/', key: 'home', label: 'Reel' },
  { href: '/night-city', key: 'city', label: 'After Dark' },
  { href: '/night-street', key: 'street', label: 'Backstreet' },
  { href: '/iridescent', key: 'iridescent', label: 'Oil-Slick' },
  { href: '/build', key: 'build', label: 'The Build' },
];

export default function Chrome({ mood, current, hint, cue }) {
  const active = VIEWS.find((v) => v.key === current) ?? VIEWS[0];

  return (
    <div className="chrome">
      <div className="brand">
        <span className="mark">
          JRV<b>.</b>
        </span>
        <span className="sub">{mood.label}</span>
      </div>

      {/* Dropdown menu-bar. Native <details> = works SSR / no-JS, keyboard
          accessible, and keeps every link in the DOM for SEO + no-WebGL crawl. */}
      <details className="navmenu">
        <summary aria-label="Showroom views">
          <span className="navmenu-current">{active.label}</span>
          <span className="navmenu-chev" aria-hidden="true" />
        </summary>
        <nav className="navmenu-list" aria-label="Showroom views">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.href}
              aria-current={current === v.key ? 'page' : undefined}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </details>

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
