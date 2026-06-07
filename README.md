# JRV interactive sport car — 911

A real-time **Three.js** Porsche 911 that **turns to face your cursor** on desktop and
your **tap** on mobile. Left alone, it idles on a slow turntable. Built as a JRV brand
moment — the sibling piece to [ORI](../jrv-robot-3d) (the interactive robot), sharing the
exact same JRV studio language: dark-tech atmosphere, JRV-orange clearcoat, IBL +
bloom, raytracing-quality look.

**Live:** _(Vercel URL after deploy)_

![JRV 911 hero](https://res.cloudinary.com/de3gn7o77/image/upload/v1780847789/friday-screenshots/car-desktop.png)

---

## What it does

- **Cursor steering (desktop):** the whole car yaws to meet the pointer, with a subtle
  bank + nose tip and a live `HEADING nnn°` readout each frame.
- **Tap steering (mobile):** tap anywhere and the car turns to that heading.
- **Idle turntable:** with no input for ~2.6 s the car rotates slowly on its own
  (suppressed under `prefers-reduced-motion`).
- **Live energy:** headlights breathe (emissive + bloom), construction rings drift,
  JRV-orange rim light rakes the body.

## Stack

| Layer | Choice |
|-------|--------|
| 3D engine | **Three.js** `^0.171` (vanilla, ES modules) |
| Build | **Vite** `^5` |
| Rendering | WebGL, `ACESFilmicToneMapping` + `SRGBColorSpace`, `PCFSoftShadowMap` |
| Lighting | **IBL** via `RoomEnvironment` → `PMREMGenerator` (carries the clearcoat reflections) + overhead key / JRV-orange rim / mint + warm front fill |
| Body material | `MeshPhysicalMaterial` — JRV-orange base, `clearcoat: 1`, metalness 0.5 (real carpaint, not chrome) |
| Geometry | Sketchfab GLB → `gltf-transform optimize` (Draco geometry + WebP textures), 25.4 MB → **2.55 MB** |
| Loading | `GLTFLoader` + `DRACOLoader` (gstatic decoder) |
| Post | `EffectComposer` → `UnrealBloomPass` (0.3 / 0.6 / 0.9) → `OutputPass` |
| Grounding | overhead cast shadow + a radial **blob contact shadow** parented to the car |
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
| Motion | `cubic-bezier(0.16,1,0.3,1)` ease-out, smooth-follow `k=0.07` | steering feel |

## Anti-slop notes (design-3d-stack.md)

- One typographic POV (Space Grotesk display + Geist Mono counter-melody), not sans-everything.
- One accent (JRV orange) doing the heavy lifting against a muted navy base; OKLCH chrome.
- Concrete, interaction-led copy ("the 911 turns to meet your eye") — no "Empower/seamless" marketing-speak.
- `prefers-reduced-motion` honored (no idle spin, no headlight pulse, instant follow).
- Real grounded hero object with true contact shadow — not a floating clay grab.

Consulted: `design-3d-stack.md` §"Anti-AI-slop checklist", §2 (web-3D defaults: sRGB + ACES, bloom last, DRACO), §6.D/E (3D-first / hybrid archetype), `hero-3d-pipeline.md` (source real geometry, never ship a grey grab).

## File structure

```
index.html          chrome overlay (brand, HEADING HUD, headline, credit, loader) + tokens link
src/tokens.css      JRV brand tokens (hex source of truth + OKLCH chrome)
src/main.js         the scene: renderer, IBL, lights, GLB load + material re-skin,
                    blob shadow, cursor/tap steering, idle turntable, bloom, HUD
public/model/
  porsche.glb       optimized model (Draco + WebP)
  license.txt       CC-BY-SA attribution
```

## Local dev

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
```

Screenshot/debug poses: append `?gx=0.4&gy=-0.1` to freeze the car at a deterministic heading.

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
