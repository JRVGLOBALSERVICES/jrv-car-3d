# JRV 911 studio showcase

A real-time **Three.js** Porsche 911 shot like an **auto-shop studio cut**: a cinematic
camera **orbits and whip-pans** the car while it holds a drift, rear wheels **trailing
tire smoke**, under overhead strip-light reflections that rake down the clearcoat. Built
as a JRV brand moment — the sibling piece to [ORI](../jrv-robot-3d) (the interactive
robot), sharing the JRV studio language: dark-tech atmosphere, JRV-orange clearcoat,
real HDRI + bloom, raytracing-quality look.

The lighting + motion direction is lifted from two reference reels supplied by Rj
(see _References_ below): reel 1 = the strip-light garage lighting, reel 2 = the
orbiting/whip-pan drift camera.

**Live:** _(Vercel URL after deploy)_

![JRV 911 hero](https://res.cloudinary.com/de3gn7o77/image/upload/v1780849991/friday-screenshots/car-final-desktop.png)

---

## What it does

- **Cinematic camera (reel 2):** a keyframed timeline orbits the 911 with smooth
  eased legs punctuated by fast whip-pan **snaps** between hero quarter-angles, looping.
- **Drift + smoke:** the car holds a subtle drift sway while **rear-wheel tire smoke**
  billows from a sprite pool, scaled to drift intensity (clears as it settles).
- **Pointer nudge:** moving the cursor gently offsets the camera azimuth/elevation on
  top of the cinematic — interactive, but the showcase drives itself.
- **Live energy:** headlights breathe (emissive + bloom), JRV-orange rim light rakes the
  body, `HEADING nnn°` HUD reads the camera's orbit angle.
- **Reduced-motion:** a static hero 3/4 with the full lighting, no orbit/drift/smoke.

## Stack

| Layer | Choice |
|-------|--------|
| 3D engine | **Three.js** `^0.171` (vanilla, ES modules) |
| Build | **Vite** `^5` |
| Rendering | WebGL, `ACESFilmicToneMapping` (exposure 1.05) + `SRGBColorSpace`, `PCFSoftShadowMap` |
| Lighting | **IBL** via real **Poly Haven `autoshop_01` HDRI** (`RGBELoader` → `PMREMGenerator`, reflections only) + **4× `RectAreaLight` strips** (the elongated clearcoat streaks) + overhead key / JRV-orange rim / faint mint + cool fill |
| Body material | `MeshPhysicalMaterial` — JRV-orange base, `clearcoat: 1`, `clearcoatRoughness: 0.03` (sharp strip reflections), metalness 0.55 |
| Camera | keyframed orbit timeline (az/el/dist), eased legs + `easeOutExpo` whip-pan snaps; pointer parallax overlay |
| Smoke | 90-sprite pool, canvas radial texture, emitted from the four wheel corners, lifecycle fade in/out + grow |
| Geometry | Sketchfab GLB → `gltf-transform optimize` (Draco geometry + WebP textures), 25.4 MB → **2.55 MB** |
| Loading | `GLTFLoader` + `DRACOLoader` (gstatic decoder) |
| Post | `EffectComposer` → `UnrealBloomPass` (0.32 / 0.6 / 0.88) → `OutputPass` |
| Grounding | overhead cast shadow + polished-concrete floor (reflection) + a radial **blob contact shadow** parented to the car |
| Host | Vercel (static `dist/`) |

## Design system (shared with ORI — `src/tokens.css`)

Studied-DNA lifted verbatim from `jrv-systems-new` + `jrv_car_rental_front_new`.

| Token | Value | Role |
|-------|-------|------|
| `--jrv-orange` | `#F15828` | primary — carpaint + accents + rim light |
| `--jrv-orange-soft` | `#F47A55` | secondary orange |
| `--jrv-mint` | `#00FF88` | energy green — fill light + HUD glow |
| `--jrv-navy` | `#0B0F1E` | deep ink backdrop |
| `--jrv-bone` | `#FAF6EE` | text |
| Page chrome | OKLCH equivalents (`--color-bg`, `--color-accent`, `--color-glow`…) | atmospheric dark |
| Display type | **Space Grotesk** (700 hero, clamp `44px → min(9vw,13vh) → 104px`) | headline POV |
| Mono type | **Geist Mono** | HUD / hints / credit |
| Space | 4-pt scale (`8 / 16 / 32 / 64`) | layout |
| Motion | cinematic camera timeline (`easeInOutSine`/`Cubic` orbits + `easeOutExpo` snaps), pointer follow `k=0.06` | drift-cut feel |

## Anti-slop notes (design-3d-stack.md)

- One typographic POV (Space Grotesk display + Geist Mono counter-melody), not sans-everything.
- One accent (JRV orange) doing the heavy lifting against a muted navy base; OKLCH chrome.
- Concrete, interaction-led copy ("the camera orbits and snaps as it holds a drift") — no "Empower/seamless" marketing-speak.
- `prefers-reduced-motion` honored (static hero, no orbit/drift/smoke, no headlight pulse).
- Real grounded hero object lit by a real HDRI with true contact shadow — not a floating clay grab.
- Lighting/motion driven by supplied reference reels, not invented — strip-light reflections + drift-orbit camera matched to spec.

Consulted: `design-3d-stack.md` §"Anti-AI-slop checklist", §2 (web-3D defaults: sRGB + ACES, bloom last, DRACO), §6.D/E (3D-first / hybrid archetype), `hero-3d-pipeline.md` (source real geometry + real HDRI, never ship a grey grab).

## File structure

```
index.html             chrome overlay (brand, HEADING HUD, headline, credit, loader) + tokens link
src/tokens.css         JRV brand tokens (hex source of truth + OKLCH chrome)
src/main.js            the scene: renderer, HDRI IBL, strip lights, GLB load + material
                       re-skin, wheel detection, blob shadow, smoke pool, cinematic
                       camera timeline, drift sway, bloom, HUD
public/model/
  porsche.glb          optimized model (Draco + WebP)
  autoshop_01_2k.hdr   Poly Haven auto-shop HDRI (CC0) — environment/reflections
  license.txt          CC-BY-SA attribution
```

## Local dev

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
```

Screenshot/debug poses: append `?still=1` to freeze the cinematic on a hero 3/4, or
`?az=1.95&el=0.5&dist=5.7` to pin a specific camera orbit angle (radians).

## Deployment

Static SPA — Vercel serves `dist/`. Disable Attack Challenge Mode after project creation
so preview URLs are testable.

## Model credit (required — CC-BY-SA-4.0)

This work is based on **"(FREE) Porsche 911 Carrera 4S"**
(https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf)
by **Karol Miklas** (https://sketchfab.com/karolmiklas), licensed under
**CC-BY-SA-4.0** (http://creativecommons.org/licenses/by-sa/4.0/). The model was modified
(materials re-skinned to JRV orange clearcoat, baked studio environment stripped,
optimized to Draco/WebP GLB). Per ShareAlike, this derivative model carries the same license.

## Environment credit

HDRI: **`autoshop_01`** from [Poly Haven](https://polyhaven.com/a/autoshop_01) — **CC0**
(public domain, no attribution required; credited as good practice). Used for
image-based lighting and reflections only.

## References

Lighting + animation direction supplied by Rj as Instagram reels:

- **Reel 1 — lighting:** `instagram.com/reel/DYpCcLsuiTJ` — industrial auto-shop studio,
  overhead linear strip lights, sharp clearcoat reflections, polished-concrete floor.
- **Reel 2 — animation:** `instagram.com/reel/DY1v7sfzVgk` — orbiting/whip-pan camera
  around a drifting car with tire smoke and timed reveals.
- **Reel 3 — detail clarity:** `instagram.com/reel/DXrXth8DQTX` (referenced for surface
  detail/sharpness; informed the low `clearcoatRoughness` + sharp reflections).
