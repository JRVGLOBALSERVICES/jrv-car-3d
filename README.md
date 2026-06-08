# JRV · 911 GT3 RS — real-time showroom

A real-time **React Three Fiber** Porsche 911 GT3 RS. The home route is a
scroll-driven cinematic reel (the camera flies through five framed shots while
the wheels spin up); two mood routes are drag-to-orbit explorers in cool and
warm night light. No video, no scroll-scrub image sequences — every frame is
live WebGL.

**Live:** https://jrv-car-3d.vercel.app
`/` (cinematic reel) · `/night-city` (After Dark, cool) · `/night-street` (Backstreet, warm)

---

## Stack

| Layer            | Choice                                                            |
|------------------|------------------------------------------------------------------|
| Framework        | **Next.js 14** (app router), SSR'd copy + client-only Canvas      |
| 3D               | **React Three Fiber 8.x** + **drei 9.x** (pinned per R3F v9 caveats) |
| Renderer         | three.js r0.171, AgX tone mapping, sRGB output                    |
| Post             | `@react-three/postprocessing` — Bloom → ColorGrade → ToneMapping(AGX) |
| Scroll           | drei `ScrollControls` (wheel/touch-native, iOS-safe, no GSAP pin) |
| Fonts            | `next/font` — Space Grotesk (display) + JetBrains Mono (mono)     |
| Host             | Vercel (framework preset: Next.js)                                |

The 3D layer is `dynamic(() => import('./Experience'), { ssr: false })`, so the
page server-renders as normal HTML (copy, OG, metadata) — Googlebot and
no-WebGL users get the same text — and the WebGL hydrates after.

## Design system

Tokens live in `app/globals.css`. OKLCH for page chrome, hex for the JRV brand
and the Three.js scene.

| Token              | Value                                  | Use                       |
|--------------------|----------------------------------------|---------------------------|
| `--jrv-orange`     | `#f15828`                              | brand primary / accent    |
| `--jrv-mint`       | `#00ff88`                              | mint glow / status dot     |
| `--color-bg`       | `oklch(14% 0.03 264)`                  | deep navy backdrop        |
| `--color-ink`      | `oklch(96% 0.012 80)`                  | bone text                 |
| `--color-ink-dim`  | `oklch(72% 0.012 80 / 0.66)`           | muted mono copy           |
| `--color-accent`   | `oklch(64% 0.19 38)`  (JRV orange)     | headline `<em>`, nav active |
| `--color-glow`     | `oklch(88% 0.24 158)` (mint)           | scroll cue, dot glow      |

Type: **Space Grotesk** 700 for the display H1 (`clamp(44px, min(9vw,13vh), 108px)`,
leading 0.9), **JetBrains Mono** for tags/hints/credits at `0.28em` tracking.
One accent (JRV orange) does the heavy lifting; mint is a single glow note.

Scene palette (per mood, `lib/moods.js`): HDRI drives reflections + lighting
**only** — the visible backdrop is a controlled dark cyclorama gradient, never
the blurry HDRI photo (that was the original "fucked-up scenery" failure).

## Patterns implemented

- **Wheel spin** — the GLB's four corner groups (rim `chrome_wheels_20x9` +
  tyre `Object_4.00N` + brake `brakedisc_FR.00N`) are collected and spun with
  `rotateOnWorldAxis(worldX, …)` — flip-proof against the model's baked −90°X
  Blender→Y-up rotation. Matched nodes are ancestor-filtered so no part
  double-rotates. Idle roll + a kick proportional to scroll velocity.
- **Camera scene-changes** — five waypoints (front stance → rear wing → wheel
  detail → nose line → hero orbit) in `components/CameraDirector.jsx`, lerped by
  `useScroll().offset` with frame-rate-independent damping and a slow breathe on
  held shots.
- **The look** — 3-point `RectAreaLight` rig + top soft box, `MeshReflectorMaterial`
  wet-asphalt floor, soft contact shadow, clearcoat + iridescent paint, AgX
  tonemap, Bloom on emitters, and a ported color-grade (saturation lift,
  shadow/highlight split-tone, vignette, film grain).
- **Mobile + reduced-motion** — DPR capped per device, `prefers-reduced-motion`
  freezes camera/orbit, `AdaptiveDpr` drops resolution under load.

## File structure

```
app/
  layout.jsx              fonts, metadata, OG
  globals.css             design tokens + chrome
  page.jsx                / — cinematic scroll reel (cool mood)
  night-city/page.jsx     /night-city — orbit, cool
  night-street/page.jsx   /night-street — orbit, warm
components/
  SceneMount.jsx          client dynamic import + drei <Loader/>
  Experience.jsx          <Canvas>, ScrollControls vs OrbitControls, post chain
  Car.jsx                 useGLTF, material tune, wheel-spin
  SceneRig.jsx            HDRI env, cyclorama, lights, reflector floor
  CameraDirector.jsx      scroll-driven camera waypoints (SHOTS)
  Grade.jsx               ColorGrade postprocessing Effect
  Chrome.jsx              SSR'd DOM chrome (brand, nav, hero copy, credit)
lib/moods.js              cool/warm mood presets
public/model/             porsche-gt3rs-wheels.glb (Draco) + Poly Haven HDRIs
```

## Local dev

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the production build
```

## Deployment notes

- Vercel **framework preset must be Next.js** (`outputDirectory` unset). The
  project carried a stale Vite `dist` override that failed the first deploy —
  fixed via the project settings API.
- `next.config.mjs` ships a CSP with `wasm-unsafe-eval` so the Draco/KTX2
  decoders aren't blocked, and `transpilePackages` for the three/R3F ESM stack.
- Attack Challenge Mode stays **off** so preview URLs are testable.

## Credits

- Model: [“2023 Porsche 911 GT3 RS (992)”](https://sketchfab.com/3d-models/2023-porsche-911-gt3-rs-992-bbb0f6181a52416bb776713cfd4987dd)
  by supercarmodels — CC-BY-4.0
- HDRIs: [Poly Haven](https://polyhaven.com) — CC0
- Real-time React Three Fiber + AgX grade by JRV
