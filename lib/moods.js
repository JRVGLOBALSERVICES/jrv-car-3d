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
    envIntensity: 1.1,
    bgTop: '#0b0805',
    bgBot: '#16100a',
    key_: { color: '#dce0ff', power: 15, pos: [-7, 6, 5.5] },
    rim: { color: '#ff8a3c', power: 26, pos: [6.8, 4.0, -5] },
    fill: { color: '#ffcaa0', power: 4.5, pos: [3, 2.2, -8] },
    paintBase: '#1a1410',
    accent: '#F15828',
    grade: { saturation: 0.18, vignette: 0.5, grain: 0.03, shadowTint: [0.05, 0.018, 0.0], highTint: [0.06, 0.03, 0.012] },
  },
  city: {
    key: 'city',
    label: 'After Dark · KL skyline',
    title: ['City light,', 'oil-slick paint'],
    blurb:
      'The same GT3 RS under a cool night-city skyline. Neon rakes the clearcoat and the thin-film shifts green to violet. Scroll to ride the camera through the cut.',
    hdri: '/model/modern_buildings_night_2k.hdr',
    exposure: 1.0,
    envIntensity: 1.05,
    bgTop: '#05060c',
    bgBot: '#0a1320',
    key_: { color: '#e2ecff', power: 16, pos: [-7, 6, 5.5] },
    rim: { color: '#ff9c54', power: 22, pos: [6.8, 4.0, -5] },
    fill: { color: '#bcd0ff', power: 4.5, pos: [3, 2.2, -8] },
    paintBase: '#0e1b34',
    accent: '#00FF88',
    grade: { saturation: 0.22, vignette: 0.48, grain: 0.028, shadowTint: [0.0, 0.025, 0.055], highTint: [0.012, 0.032, 0.06] },
  },
};
