# JRV 911 rain reveal

A real-time **Three.js** Porsche 911 that **renders in from a grey clay model** — a
ticking `%` counter and progress bar, then a flash-**snap** to the finished car — and
lands on a **rain-soaked forest road**: wet JRV-orange clearcoat beaded with water,
tyres throwing a **spray rooster-tail** as a cinematic camera orbits and whip-pans.
Built as a JRV brand moment — sibling to [ORI](../jrv-robot-3d) (the interactive robot),
sharing the JRV language: dark-tech atmosphere, JRV-orange clearcoat, real HDRI + bloom,
raytracing-quality look.

The direction is lifted from reference reels supplied by Rj (see _References_): the
**clay→full render reveal**, the **overcast wet-forest environment**, and the **tyre
water-spray** are matched to the latest clip.

**Live:** https://jrv-car-3d.vercel.app

![JRV 911 hero](https://res.cloudinary.com/de3gn7o77/image/upload/v1780849991/friday-screenshots/car-final-desktop.png)

---

## What it does

- **Render reveal:** the model first appears as a flat **grey clay** turntable while a
  mono `%` counter + accent progress bar tick up; at 100% a white **flash-snap** swaps in
  the full PBR materials, forest environment, rain and spray. A state machine drives it
  (`load → clay → done`); `?clay=1` holds the reveal for a screenshot.
- **Rainy forest:** lit + backed by the **Poly Haven Niederwihl Forest** HDRI (overcast,
  CC0) — used for image-based lighting *and* a **blurred, darkened backdrop** of foliage,
  with `FogExp2` woodland haze for depth. **Falling rain** streaks across the frame.
- **Tyre spray (the money shot):** bright cool **droplet rooster-tail** kicked up, out and
  back off the **spinning rear wheels**, arcing down under gravity with a splash at the
  floor — the wet-road burnout. Heavier during the drift sway.
- **Wet clearcoat:** `MeshPhysicalMaterial` JRV-orange base under a mirror clearcoat
  carrying a procedural **water-droplet normal map** — thousands of beaded highlights that
  read "freshly washed". Tyres + rims get a wet sheen too; rims are matte graphite.
- **Cinematic camera:** keyframed timeline orbits the 911 with eased legs and fast
  whip-pan **snaps** between hero quarter-angles, looping; pointer nudges the view.
- **Live energy:** headlights breathe (emissive + bloom), `HEADING nnn°` HUD reads the
  orbit angle.
- **Reduced-motion:** skips the reveal animation and all rain/spray/drift — a static lit
  hero 3/4.

## Stack

| Layer | Choice |
|-------|--------|
| 3D engine | **Three.js** `^0.171` (vanilla, ES modules) |
| Build | **Vite** `^5` |
| Rendering | WebGL, `ACESFilmicToneMapping` (exposure 1.05) + `SRGBColorSpace`, `PCFSoftShadowMap` |
| Lighting | **IBL** via **Poly Haven `niederwihl_forest` HDRI** (`RGBELoader` → `PMREMGenerator`) — overcast green reflections; one soft overhead `RectAreaLight` panel + overhead key + cool sky fill + faint mint shadow tint |
| Environment | HDRI as **blurred backdrop** (`backgroundBlurriness 0.55`, `backgroundIntensity 0.62`) + `FogExp2(#10160f, 0.018)` |
| Body material | `MeshPhysicalMaterial` — JRV-orange base, `clearcoat 1`, `clearcoatRoughness 0.03`, procedural droplet `clearcoatNormalMap` |
| Reveal | state machine `load → clay → done`; flat clay `MeshStandardMaterial` swapped to stashed real materials on snap; `easeOutCubic` counter; white flash |
| Rain | `LineSegments` — 1,500 falling streaks recycled in a box around the car, faded in post-reveal |
| Spray | 340-sprite pool, cool droplet texture, emitted from wheel corners with up/out/back velocity + gravity + floor splash |
| Camera | keyframed orbit timeline (az/el/dist), eased legs + `easeOutExpo` whip-pan snaps; pointer parallax overlay |
| Geometry | Sketchfab GLB → `gltf-transform optimize` (Draco geometry + WebP textures), 25.4 MB → **2.55 MB** |
| Loading | `GLTFLoader` + `DRACOLoader` (gstatic decoder) |
| Post | `EffectComposer` → `UnrealBloomPass` (0.32 / 0.6 / 0.88) → `OutputPass` |
| Grounding | overhead cast shadow + dark **wet-asphalt floor** (low-roughness mirror) + a radial **blob contact shadow** parented to the car |
| Host | Vercel (static `dist/`) |

## Design system (shared with ORI — `src/tokens.css`)

Studied-DNA lifted verbatim from `jrv-systems-new` + `jrv_car_rental_front_new`.

| Token | Value | Role |
|-------|-------|------|
| `--jrv-orange` | `#F15828` | primary — carpaint + accents + progress bar |
| `--jrv-orange-soft` | `#F47A55` | secondary orange |
| `--jrv-mint` | `#00FF88` | energy green — faint shadow-side tint + HUD glow |
| `--jrv-navy` | `#0B0F1E` | deep ink backdrop |
| `--jrv-bone` | `#FAF6EE` | text |
| Page chrome | OKLCH equivalents (`--color-bg`, `--color-accent`, `--color-glow`…) | atmospheric dark |
| Display type | **Space Grotesk** (700 hero, clamp `44px → min(9vw,13vh) → 104px`) | headline POV |
| Mono type | **Geist Mono** | HUD / hints / credit / reveal counter |
| Space | 4-pt scale (`8 / 16 / 32 / 64`) | layout |
| Motion | clay-render reveal (`easeOutCubic` counter, flash snap) → cinematic camera timeline (`easeInOutSine`/`Cubic` orbits + `easeOutExpo` snaps), pointer follow `k=0.06` | reveal → drift-cut feel |

## Anti-slop notes (design-3d-stack.md)

- One typographic POV (Space Grotesk display + Geist Mono counter-melody), not sans-everything.
- One accent (JRV orange) doing the heavy lifting against a muted base; OKLCH chrome.
- Concrete, interaction-led copy ("it renders in from clay — then the rain hits") — no "Empower/seamless" marketing-speak.
- `prefers-reduced-motion` honored (static hero, no reveal animation, no rain/spray/drift, no headlight pulse, no flash).
- Real grounded hero object lit by a real HDRI with true contact shadow — the clay phase is a deliberate *reveal*, the deliverable is the lit final, never a floating grey grab.
- Reveal/environment/spray driven by the supplied reference reel, not invented.

Consulted: `design-3d-stack.md` §"Anti-AI-slop checklist", §2 (web-3D defaults: sRGB + ACES, bloom last, DRACO), §6.D/E (3D-first / hybrid archetype), `hero-3d-pipeline.md` (source real geometry + real HDRI).

## File structure

```
index.html                     chrome overlay (brand, HEADING HUD, headline, credit) +
                               render-reveal counter/bar + flash, tokens link
src/tokens.css                 JRV brand tokens (hex source of truth + OKLCH chrome)
src/main.js                    the scene: renderer, forest HDRI IBL + blurred backdrop +
                               fog, overcast lights, GLB load + clay/real material swap,
                               reveal state machine, wheel detection, rain, water-spray
                               pool, blob shadow, cinematic camera timeline, bloom, HUD
public/model/
  porsche.glb                  optimized model (Draco + WebP)
  niederwihl_forest_2k.hdr     Poly Haven overcast forest HDRI (CC0) — IBL + backdrop
  license.txt                  model CC-BY-SA attribution + HDRI note
```

## Local dev

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
```

Debug poses: `?still=1` freezes the cinematic on a hero 3/4 (skips the reveal),
`?az=1.95&el=0.5&dist=5.7` pins a camera orbit angle (radians), `?clay=1` holds the
clay-render reveal so the counter can be captured.

## Deployment

Static SPA — Vercel serves `dist/`. Disable Attack Challenge Mode after project creation
so preview URLs are testable.

## Model credit (required — CC-BY-SA-4.0)

This work is based on **"(FREE) Porsche 911 Carrera 4S"**
(https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf)
by **Karol Miklas** (https://sketchfab.com/karolmiklas), licensed under
**CC-BY-SA-4.0** (http://creativecommons.org/licenses/by-sa/4.0/). The model was modified
(materials re-skinned to JRV orange wet clearcoat, baked studio environment stripped,
optimized to Draco/WebP GLB). Per ShareAlike, this derivative model carries the same license.

## Environment credit

HDRI: **`niederwihl_forest`** from [Poly Haven](https://polyhaven.com/a/niederwihl_forest)
— **CC0** (public domain, no attribution required; credited as good practice). Used for
image-based lighting and the blurred backdrop.

## References

Direction supplied by Rj as reference reels:

- **Reveal + environment + spray (latest):** a Porsche render that opens as a grey clay
  model with a `4% → 51% → 97%` loading counter, then snaps to a fully textured orange
  911 on a wet forest road — beaded water on the body, mirror-wet tarmac, and a dramatic
  **water-spray plume off the accelerating tyre**. This clip drove the current build.
- **Earlier — lighting:** industrial studio, overhead reflections, sharp clearcoat.
- **Earlier — animation:** orbiting/whip-pan camera around a drifting car with timed reveals.
- **Earlier — detail clarity:** surface sharpness (informed the low `clearcoatRoughness`).
