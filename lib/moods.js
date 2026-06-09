// Mood presets — ported from the verified Blender Cycles dark-studio render.
// The HDRI drives reflections + lighting ONLY; the visible backdrop is a
// controlled dark cyclorama gradient (never the blurry photo behind the car).

export const MOODS = {
  street: {
    key: 'street',
    label: 'Backstreet · KL after dark',
    title: ['Hold the', 'slide'],
    blurb:
      'A 911 GT3 RS on warm backstreet light. Sodium amber rakes the clearcoat, the thin-film paint shifts copper to violet across the panels. Scroll to ride the camera through the cut.',
    hdri: '/model/cobblestone_street_night_2k.hdr',
    exposure: 1.0,
    envIntensity: 0.95,
    bloom: 0.5,
    bgTop: '#0b0805',
    bgBot: '#16100a',
    key_: { color: '#dce0ff', power: 10, pos: [-7, 6, 5.5] },
    rim: { color: '#ff8a3c', power: 17, pos: [6.8, 4.0, -5] },
    fill: { color: '#ffcaa0', power: 3.2, pos: [3, 2.2, -8] },
    paintBase: '#1a1410',
    accent: '#F15828',
    grade: { saturation: 0.18, vignette: 0.5, grain: 0.03, shadowTint: [0.05, 0.018, 0.0], highTint: [0.06, 0.03, 0.012] },
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
    noGrid: true,
    noWash: true,
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
      'The same GT3 RS under a cool night-city skyline. Neon rakes the clearcoat and the thin-film shifts green to violet. Scroll to ride the camera through the cut.',
    hdri: '/model/modern_buildings_night_2k.hdr',
    exposure: 1.0,
    envIntensity: 0.9,
    bloom: 0.5,
    bgTop: '#05060c',
    bgBot: '#0a1320',
    key_: { color: '#e2ecff', power: 11, pos: [-7, 6, 5.5] },
    rim: { color: '#ff9c54', power: 15, pos: [6.8, 4.0, -5] },
    fill: { color: '#bcd0ff', power: 3.2, pos: [3, 2.2, -8] },
    paintBase: '#0e1b34',
    accent: '#00FF88',
    grade: { saturation: 0.22, vignette: 0.48, grain: 0.028, shadowTint: [0.0, 0.025, 0.055], highTint: [0.012, 0.032, 0.06] },
  },
};
