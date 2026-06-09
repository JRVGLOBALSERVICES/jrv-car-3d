// Mood presets — ported from the verified Blender Cycles dark-studio render.
// The HDRI drives reflections + lighting ONLY; the visible backdrop is a
// controlled dark cyclorama gradient (never the blurry photo behind the car).

export const MOODS = {
  street: {
    key: 'street',
    label: 'Backstreet · KL after dark',
    title: ['Hold the', 'slide'],
    blurb:
      'A 911 GT3 RS parked under a single sodium streetlight. Warm amber pools on damp asphalt, dust drifts in the lamp glow, and the thin-film paint shifts copper to violet across the panels. Drag to orbit the car around the light.',
    hdri: '/model/cobblestone_street_night_2k.hdr',
    signature: 'sodium', // warm light-pool + drifting dust motes (no laser-grid)
    noWind: true, // a parked car under a lamp — no rushing air on the orbit pages
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
    paintBase: '#1a1410',
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
      'The 911 in a black studio, wrapped in a thin-film oil-slick. The whole spectrum rides the panels — warm where the body faces you, cool at the grazing edges — with a fine metallic flake shimmer. Drag to orbit and watch the colour walk across the car.',
    hdri: '/model/modern_buildings_night_2k.hdr',
    paint: 'iridescent',
    signature: 'void', // black void, the paint is the sole hero (no grid/wash/wind)
    noGrid: true,
    noWash: true,
    noWind: true, // deliberate still showcase — the paint is the sole hero
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
      'The GT3 RS standing in a field of neon — a distant city skyline of glowing light-bars and bokeh, mirrored in a rain-wet floor. Cyan and magenta rake the clearcoat and the thin-film shifts across the panels. Drag to orbit through the lights.',
    hdri: '/model/modern_buildings_night_2k.hdr',
    signature: 'skyline', // neon vertical light-bar field + bokeh (no laser-grid)
    noWind: true, // a parked car in a light-field — orbit the lights, no rushing air
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
    paintBase: '#0e1b34',
    accent: '#19E3FF', // cyan neon — the skyline + accent wash hue
    // elevated turntable so you read the light-field wrapping around behind the car
    orbit: { start: [5.0, 1.85, 5.6], fov: 40, autoRotateSpeed: 0.55, polarMax: 0.48, target: [0, 0.5, 0] },
    grade: { saturation: 0.26, vignette: 0.5, grain: 0.028, shadowTint: [0.0, 0.03, 0.06], highTint: [0.02, 0.03, 0.06] },
  },
};
