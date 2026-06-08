# JRV 911 trackday drift

A real-time **Three.js** Porsche 911 GT3 RS that **opens framed tight on the front
rim** — a ticking `%` counter studying the brake, spokes and splitter while the car
stands dead still — then **pulls back as the wheels spin up** and the 911 breaks into a
sustained **drift**: tyre smoke pouring off the rears and **rubber burn marks streaking
down a sun-baked racetrack**. Built as a JRV brand moment — sibling to
[ORI](../jrv-robot-3d) (the interactive robot), sharing the JRV language: a glossy metallic
clearcoat hero, real HDRI + bloom, raytracing-quality look.

The beat is the brief Rj set: *close-up on the front rims with detailing → slow pull-back
with the rims moving → the car drifts with smoke and burn marks on the road.* The earlier
critical fix is baked in too — the **track scroll and the tyre spin are now driven by one
linear speed**, so the rims roll instead of sliding.

**Live:** https://jrv-car-3d.vercel.app

---

## What it does

- **Rim study (opening):** the car holds **dead still** while an extreme close-up camera
  creeps in and arcs around the **front rim** — brake, spokes, splitter, tyre wall — in
  full PBR. A mono `%` counter + accent bar tick up; at 100% a white **flash-snap** drops
  the studio veil and the car comes alive. State machine: `load → detail → pull → drift`.
  `?detail=1` holds the rim study for a screenshot.
- **Pull-back:** the camera dollies from the rim out to the hero front-3/4 while the
  **wheels spin up** and the **track starts to rush** — speed eases in together so it
  reads as the car launching, not a cut.
- **Drift (the money shot):** the 911 **yaws across its travel line** in a sustained
  power-slide. **Tyre smoke** billows off the spinning rears and trails down-track with a
  sideways kick; **burn marks** lay down as dark rubber on the tarmac and recede with the
  track, snaking as the rear sweeps — a real drift trail.
- **Velocity-locked motion:** one speed `V` drives **both** the track texture scroll
  *and* the wheel angular velocity (`ω = V / wheel-radius`, radius measured from the GLB).
  No more wheels-slide-while-road-flows mismatch.
- **Hazy-daylight cinematic grade (current):** lit + backed by the **Poly Haven Kloofendal
  Clear (Pure Sky)** HDRI (clear midday, CC0) — a high near-white sun + strong cool sky
  ambient, with a subtle blue-grey `FogExp2` haze that softens the distance only. Cool,
  desaturated colour grade + shallow depth-of-field + a sun lens-flare — matching the
  reference reel's bright open-lot drift look. The lot is light-grey concrete that scrolls
  underneath.
- **Hover / tap to steer the slide:** cursor (or touch) X position steers the drift —
  left → the 911 slides left, right → slides right, centre → tracks straight. A **tap/click
  fires a throttle burst** (deeper yaw kick + a gout of extra smoke). Press-and-**drag still
  orbits the camera** (threshold-gated so a tap doesn't trigger orbit), polar-clamped so it
  never dips below the tarmac.
- **Nardo-grey metallic clearcoat:** `MeshPhysicalMaterial` cool grey base `#5c646a`
  (`metalness 0.72`, `roughness 0.34`, `envMapIntensity 2.1`) under a glossy clearcoat; the
  bright hazy sky reflects cleanly in the panels. (Single `CAR_PAINT` flip-point reverts to
  the candy-orange look.) Tyres forced matte black, rims machined graphite.
- **Live energy:** headlights breathe (emissive + bloom), `HEADING nnn°` HUD reads the
  orbit angle.
- **Reduced-motion:** skips the reveal + drift entirely — a static lit hero 3/4.

## Stack

| Layer | Choice |
|-------|--------|
| 3D engine | **Three.js** `^0.171` (vanilla, ES modules) |
| Build | **Vite** `^5` |
| Rendering | WebGL, `NeutralToneMapping` (Khronos PBR Neutral, exposure 0.96 — clean bright-daylight roll-off that holds the cool metallic grey without clipping the sky to white) + `SRGBColorSpace`, `PCFSoftShadowMap` |
| Lighting | **IBL** via **Poly Haven `kloofendal_43d_clear_puresky` HDRI** (`RGBELoader` → `PMREMGenerator`) — clear-midday reflections; high near-white **sun** key 3.1 (shadow caster) + strong cool sky ambient 0.62 (lifted shadows) + cool sky fill 1.05 + cool back rim 0.7 + neutral camera-side fill 0.55. Plus a **sun `Lensflare`** (bright core + coloured ghost discs) anchored in the sun direction |
| Environment | HDRI as **hazy daylight backdrop** (`backgroundBlurriness 0.18`, `backgroundIntensity 0.72`, `environmentIntensity 1.0`) + subtle blue-grey `FogExp2(#c3cfd9, 0.016)` atmospheric haze that softens the distance only |
| Lot | light-grey concrete `CanvasTexture` (bright asphalt speckle + worn centre line + muted faded edge dashes — neutral industrial-lot, not race kerbs), `RepeatWrapping` scrolled via `offset.y` |
| Body material | `MeshPhysicalMaterial` Nardo-grey metallic — cool grey base `#5c646a`, `metalness 0.72`, `roughness 0.34`, `clearcoat 1`, `clearcoatRoughness 0.06`, `envMapIntensity 2.1` (hazy sky reflects cleanly in the panels). `CAR_PAINT` const is the single flip-point back to candy orange |
| Reveal | state machine `load → detail → pull → drift`; real PBR from frame 0 (the rim study needs detail); `easeOutCubic` counter; white flash on snap |
| Motion model | one linear speed `V_MAX` ramps via `speedFactor`; drives **both** `roadTex.offset` (`V / units-per-tile`) and wheel spin (`ω = V / WHEEL_R`) — locked, no sliding |
| Drift | car yaws across a **fixed** `travelDirBase`; `driftYaw` driven by `steerCur` (hover/tap) + a faint idle weave + throttle kick + counter-roll; smoke/marks read off the fixed travel axis, not live yaw |
| Interaction | hover/touch X → `steerTarget` (smoothed `steerCur`) steers the slide; tap → `throttle` burst (denser smoke + yaw kick); drag past a 7px threshold → camera orbit |
| Smoke | 240-sprite pool, soft **white** puff (fat/voluminous — bigger scale + higher peak opacity), emitted off the rear hubs with back + lateral velocity + buoyancy |
| Burn marks | 340 flat decal quads laid at the rear contact points, aligned to travel, **receding with the track**, fading over ~2s — overlap → continuous rubber line |
| Camera | drift tracking weave (az/el/dist, leans into `steerCur`) + **pointer-event drag-orbit** with polar clamp (`0.18 … 1.46` rad) |
| Geometry | Sketchfab GLB → `gltf-transform optimize` (Draco geometry + WebP textures) → **2.7 MB** |
| Loading | `GLTFLoader` + `DRACOLoader` (gstatic decoder) |
| Post | **Hazy-daylight cinematic chain:** `EffectComposer` → **`BokehPass`** (shallow DOF, `focus` tracks the car each frame so the hero stays razor-sharp while fg/bg melt) → `UnrealBloomPass` (0.2 / 0.6 / 0.9 — sun glints + specular highlights glow) → `OutputPass` (tonemap+sRGB) → **`CinematicShader` `ShaderPass`** — edge-masked radial speed-blur + chromatic aberration (scale with `uSpeed` + `uThrottle`, `smoothstep 0.34→0.66` keeps a sharp central hero zone), **cool DESATURATED daylight grade** (cool shadows, faintly warm highlights, lifted blacks, saturation pulled down), soft vignette, fine film grain. Plus a speed-rush **FOV punch** on throttle |
| Grounding | sun cast shadow (`ShadowMaterial`) + **`Reflector` wet-tarmac mirror apron** (three.js addon, dimmed reflection under a translucent asphalt sheet → car/sky mirror in the ground) + a radial **blob contact shadow** parented to the car |
| Host | Vercel (static `dist/`) |

## Design system (shared with ORI — `src/tokens.css`)

Studied-DNA lifted verbatim from `jrv-systems-new` + `jrv_car_rental_front_new`.

| Token | Value | Role |
|-------|-------|------|
| `--jrv-orange` | `#F15828` | primary — carpaint + accents + progress bar + light kiss |
| `--jrv-orange-soft` | `#F47A55` | secondary orange |
| `--jrv-mint` | `#00FF88` | energy green — HUD glow |
| `--jrv-navy` | `#0B0F1E` | deep ink backdrop |
| `--jrv-bone` | `#FAF6EE` | text |
| Page chrome | OKLCH equivalents (`--color-bg`, `--color-accent`, `--color-glow`…) | atmospheric dark |
| Display type | **Space Grotesk** (700 hero, clamp `44px → min(9vw,13vh) → 104px`) | headline POV |
| Mono type | **Geist Mono** | HUD / hints / credit / reveal counter |
| Space | 4-pt scale (`8 / 16 / 32 / 64`) | layout |
| Motion | rim-study reveal (`easeOutCubic` counter, flash snap) → eased pull-back → drift weave + drag-orbit (`k=0.12` damping); pointer follow `k=0.06` | reveal → slide feel |

## Anti-slop notes (design-3d-stack.md)

- One typographic POV (Space Grotesk display + Geist Mono counter-melody), not sans-everything.
- Restrained palette — cool desaturated greys with one warm accent (the red taillight kiss) against the muted base; OKLCH chrome.
- Concrete, interaction-led copy ("hold the slide — smoke off the rears, rubber on the tarmac") — no "Empower/seamless" marketing-speak.
- `prefers-reduced-motion` honored (static hero, no reveal/drift, no smoke/marks, no headlight pulse, no flash).
- Real grounded hero object lit by a real HDRI with true contact shadow — never a floating grey grab.
- Motion is physically coherent: track scroll and wheel spin share one speed; smoke and rubber read off a fixed travel axis so the drift looks real, not invented.

Consulted: `design-3d-stack.md` §"Anti-AI-slop checklist", §2 (web-3D defaults: sRGB + ACES, bloom last, DRACO), §6.D/E (3D-first / hybrid archetype), `hero-3d-pipeline.md` (source real geometry + real HDRI).

## File structure

```
index.html                     chrome overlay (brand, HEADING HUD, headline, credit) +
                               render-reveal counter/bar + flash, tokens link
src/tokens.css                 JRV brand tokens (hex source of truth + OKLCH chrome)
src/main.js                    the scene: renderer, clear-daytime HDRI IBL + hazy backdrop +
                               haze fog, midday sun lighting + sun lens-flare, GLB load (real
                               PBR) + wheel detection + measured radius, concrete lot texture,
                               speed-locked scroll + spin, detail→pull→drift state machine,
                               drift yaw, white smoke pool, burn-mark decal pool, drag-orbit,
                               blob shadow, cinematic post chain (DOF + bloom +
                               speed-blur/grade/vignette/grain), HUD
public/model/
  porsche-gt3rs.glb            optimized model (Draco + WebP)
  kloofendal_43d_clear_puresky_2k.hdr  Poly Haven clear-midday HDRI (CC0) — daylight IBL + backdrop
  belfast_sunset_puresky_2k.hdr        Poly Haven twilight HDRI (CC0) — retained (prev dusk look)
  license.txt                  model attribution + HDRI note
```

## Local dev

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
```

Debug poses: `?detail=1` holds the front-rim study (car still, counter visible),
`?drift=1` (or `?still=1`) jumps straight to the drift beat with smoke + burn marks
pre-seeded, `?az=2.1&el=0.5&dist=6.5` pins a camera orbit angle (radians) on the drift.

## Deployment

Static SPA — Vercel serves `dist/`. Disable Attack Challenge Mode after project creation
so preview URLs are testable.

## Model credit (required — CC-BY-4.0)

This work is based on **"2023 Porsche 911 GT3 RS (992)"**
(https://sketchfab.com/3d-models/2023-porsche-911-gt3-rs-992-bbb0f6181a52416bb776713cfd4987dd)
by **supercarmodels**, licensed under **CC-BY-4.0**
(http://creativecommons.org/licenses/by/4.0/). The model was modified (materials re-skinned
to JRV orange clearcoat, per-wheel hub pivots, optimized to Draco/WebP GLB).

## Environment credit

HDRI (current): **`kloofendal_43d_clear_puresky`** from
[Poly Haven](https://polyhaven.com/a/kloofendal_43d_clear_puresky) — **CC0** (public domain,
no attribution required; credited as good practice). Used for clear-daytime image-based
lighting and the hazy daylight backdrop. The previous **`belfast_sunset_puresky`** (also
Poly Haven, CC0) is retained in the repo for the dusk look.

## References

Direction supplied by Rj:

- **NFS hazy-daylight reel (current):** [reel](https://www.instagram.com/reel/DYuMMG8TwZN/) —
  a widebody coupe drifting in a bright, hazy open lot: cool desaturated grey palette, high
  midday sun, shallow depth-of-field, sun lens-flare, fat white tyre smoke + skid marks. The
  scene was re-graded to match this (clear-daytime HDRI, Nardo-grey paint, DOF, cool grade).
- **Need for Speed: Most Wanted look (previous):** dusk twilight sky, teal/orange film colour,
  radial speed-blur + chromatic aberration, vignette, grain, bloom, FOV punch — superseded by
  the hazy-daylight reel above (revertible via the `CAR_PAINT` + HDRI swap).
- **Trackday drift:** open tight on the front rims with detailing, slowly pull back with the
  rims moving, then the car drifts with smoke and burn marks. This brief drove the build the
  grade sits on top of.
- **Earlier — rain reveal:** clay→full-render reveal that snapped to a wet 911 on a forest
  road with a tyre water-spray plume (superseded by the trackday concept).
