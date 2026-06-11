// Mood presets — ported from the verified Blender Cycles dark-studio render.
// The HDRI drives reflections + lighting ONLY; the visible backdrop is a
// controlled dark cyclorama gradient (never the blurry photo behind the car).

export const MOODS = {
  street: {
    key: 'street',
    label: 'Backstreet · KL after dark',
    title: ['Hold the', 'slide'],
    blurb:
      'A 911 GT3 RS parked under a single sodium streetlight on a real backstreet — shuttered blocks, damp asphalt, dust drifting in the lamp glow. Scroll to walk a full circle around the car at eye level: nose, flank, wing, wheel, and back. Real-time React Three Fiber, no video.',
    hdri: '/model/cobblestone_street_night_2k.hdr',
    signature: 'sodium', // warm light-pool + drifting dust motes (no laser-grid)
    noWind: true, // a parked car under a lamp — no rushing air
    // real backstreet geometry ringing the lamp pool — warm windows, sodium heads
    world: 'parked',
    lampColor: '#ff9e4a',
    // WALK-AROUND camera language: polar waypoints, the camera rides the circle
    // at human eye height like a buyer circling the car — opposite of the home
    // reel's flying hard cuts and the city page's drone descent.
    camStyle: 'arc',
    shots: [
      { id: '01', name: 'Approach', angle: 18, radius: 6.2, height: 1.55, tgt: [0, 0.5, 0], fov: 40 },
      { id: '02', name: 'Nose', angle: 70, radius: 4.6, height: 1.05, tgt: [0, 0.55, 0.4], fov: 38 },
      { id: '03', name: 'Flank', angle: 128, radius: 4.2, height: 0.95, tgt: [0, 0.5, 0], fov: 38 },
      { id: '04', name: 'Rear wing', angle: 196, radius: 4.7, height: 1.35, tgt: [0, 0.75, -0.9], fov: 37 },
      { id: '05', name: 'Wheel + brake', angle: 262, radius: 3.7, height: 0.7, tgt: [0.2, 0.45, 1.2], fov: 35 },
      { id: '06', name: 'Full circle', angle: 378, radius: 6.0, height: 1.7, tgt: [0, 0.5, 0], fov: 41 },
    ],
    // thin warm night air — depth without losing the single-lamp intimacy
    fog: { color: '#100b07', near: 16, far: 52 },
    exposure: 1.0,
    envIntensity: 0.95,
    bloom: 0.55,
    bgTop: '#0b0805',
    bgBot: '#16100a',
    // damp matte asphalt — a softer, warmer floor than the home reel's glass mirror
    floorMirror: 0.5,
    floorColor: '#0a0805',
    floorRoughness: 0.52,
    key_: { color: '#dce0ff', power: 10, pos: [-7, 6, 5.5] },
    rim: { color: '#ff8a3c', power: 17, pos: [6.8, 4.0, -5] },
    fill: { color: '#ffcaa0', power: 3.2, pos: [3, 2.2, -8] },
    // deep teal body — complementary to the warm sodium lamp, so it pops
    // against the amber pool instead of disappearing into a near-black brown.
    paintBase: '#0E8F8A',
    accent: '#F15828',
    windColor: '#ffd9a8', // warm sodium tone for the dust motes
    // low, raking turntable — you circle the car at headlight height under the lamp
    orbit: { start: [5.4, 0.95, 5.2], fov: 42, autoRotateSpeed: 0.3, polarMax: 0.5, target: [0, 0.45, 0] },
    grade: { saturation: 0.18, vignette: 0.52, grain: 0.03, shadowTint: [0.05, 0.018, 0.0], highTint: [0.06, 0.03, 0.012] },
  },
  // Reel DZUxxxXpBrH — bold thin-film / oil-slick paint over a near-black base,
  // floating in a dark void. View-dependent wavelength shift (warm facing the
  // camera, cool at grazing angles) + flake shimmer. paint:'iridescent' switches
  // Car.jsx to the hand-written Fresnel→spectral shader (MeshPhysical's built-in
  // iridescence is too subtle for this look). No laser-grid / accent wash so the
  // paint is the sole hero, matching the reel's black studio.
  iridescent: {
    key: 'iridescent',
    label: 'Thin-film · oil-slick',
    title: ['Oil-slick', 'spectrum'],
    blurb:
      'The 911 in a black studio, wrapped in a thin-film oil-slick. Here the SCROLL drives the paint itself — the whole spectrum slides across the panels as you move, while the camera pushes from full body into a macro panel and pulls back out. Real-time React Three Fiber, no video.',
    hdri: '/model/modern_buildings_night_2k.hdr',
    paint: 'iridescent',
    signature: 'void', // black void, the paint is the sole hero (no grid/wash/wind)
    noGrid: true,
    noWash: true,
    noWind: true, // deliberate still showcase — the paint is the sole hero
    // SPECTRUM-SCRUB language: scroll walks the thin-film hue uniform across the
    // body (Car.jsx uHueShift) while the camera glides full-body → macro → out.
    // The shader IS the scroll animation here — unique to this page.
    camStyle: 'glide',
    shots: [
      { id: '01', name: 'Full body', pos: [4.6, 1.3, 5.2], tgt: [0, 0.5, 0], fov: 38 },
      { id: '02', name: 'Spectrum walk', pos: [3.1, 1.0, 3.9], tgt: [0, 0.55, 0.6], fov: 34 },
      { id: '03', name: 'Macro panel', pos: [1.9, 0.85, 2.7], tgt: [0.5, 0.6, 1.1], fov: 30 },
      { id: '04', name: 'Grazing edge', pos: [-2.2, 0.7, 3.4], tgt: [-0.2, 0.6, 0.4], fov: 33 },
      { id: '05', name: 'Pull back', pos: [-4.6, 1.6, 4.8], tgt: [0, 0.5, 0], fov: 40 },
    ],
    orbit: { start: [4.4, 1.2, 5.0], fov: 38, autoRotateSpeed: 0.42, polarMax: 0.52, target: [0, 0.5, 0] },
    bloom: 0.45,
    floorMirror: 0.45,
    floorColor: '#040507',
    floorRoughness: 0.34,
    exposure: 1.0,
    envIntensity: 0.5,
    bgTop: '#08080b',
    bgBot: '#020203',
    key_: { color: '#eef2ff', power: 8, pos: [-7, 6, 5.5] },
    rim: { color: '#bcd0ff', power: 11, pos: [6.8, 4.0, -5] },
    fill: { color: '#c8d2ff', power: 3.0, pos: [3, 2.2, -8] },
    paintBase: '#161618',
    accent: '#9B6CFF',
    grade: { saturation: 0.32, vignette: 0.55, grain: 0.026, shadowTint: [0.02, 0.0, 0.05], highTint: [0.03, 0.02, 0.06] },
  },
  city: {
    key: 'city',
    label: 'After Dark · KL skyline',
    title: ['City light,', 'oil-slick paint'],
    blurb:
      'The GT3 RS parked in a neon plaza ringed by a real night skyline — lit towers, glowing light-bars, a rain-wet mirror floor. Scroll to fly a drone descent: from an aerial top-down over the plaza, spiralling down through the towers to touch down at street level beside the car. Real-time React Three Fiber, no video.',
    hdri: '/model/modern_buildings_night_2k.hdr',
    signature: 'skyline', // neon vertical light-bar field + bokeh (no laser-grid)
    noWind: true, // a parked car in a light-field — no rushing air
    // REAL city geometry ringing the plaza behind the neon bars — parked mode,
    // windows twinkle. Cool lamp heads to sit with the neon palette.
    world: 'parked',
    lampColor: '#9fdcff',
    // DRONE-DESCENT camera language: one continuous glide (no cuts) from a
    // top-down aerial over the plaza spiralling down to street level — the
    // skyline + towers carry the read, opposite of the street page's eye-level
    // walk-around and the home reel's hard cuts.
    camStyle: 'glide',
    shots: [
      { id: '01', name: 'Aerial', pos: [0.6, 17, 2.5], tgt: [0, 0.4, 0], fov: 50 },
      { id: '02', name: 'Descent', pos: [9.5, 8.5, -7.5], tgt: [0, 0.6, 0], fov: 44 },
      { id: '03', name: 'Through the towers', pos: [-8.0, 4.2, 4.5], tgt: [0, 0.6, 0], fov: 41 },
      { id: '04', name: 'Skim the floor', pos: [4.8, 1.15, 5.6], tgt: [0, 0.55, 0], fov: 38 },
      { id: '05', name: 'Touchdown', pos: [2.7, 0.8, 5.1], tgt: [0, 0.6, 0.5], fov: 36 },
    ],
    fog: { color: '#081424', near: 17, far: 62 },
    exposure: 1.0,
    envIntensity: 0.9,
    bloom: 0.6,
    bgTop: '#04060e',
    bgBot: '#081424',
    // rain-wet glossy floor to mirror the neon bars back up under the car
    floorMirror: 0.86,
    floorColor: '#05080f',
    floorRoughness: 0.22,
    key_: { color: '#e2ecff', power: 11, pos: [-7, 6, 5.5] },
    rim: { color: '#19e3ff', power: 15, pos: [6.8, 4.0, -5] },
    fill: { color: '#ff4fd8', power: 3.4, pos: [3, 2.2, -8] },
    // deep magenta body — the classic neon counter-hue to the cyan skyline,
    // a single saturated accent rather than a navy that vanishes in the dark.
    paintBase: '#C2186A',
    accent: '#19E3FF', // cyan neon — the skyline + accent wash hue
    // elevated turntable so you read the light-field wrapping around behind the car
    orbit: { start: [5.0, 1.85, 5.6], fov: 40, autoRotateSpeed: 0.55, polarMax: 0.48, target: [0, 0.5, 0] },
    grade: { saturation: 0.26, vignette: 0.5, grain: 0.028, shadowTint: [0.0, 0.03, 0.06], highTint: [0.02, 0.03, 0.06] },
  },
};
