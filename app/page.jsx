import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';
import { MOODS } from '@/lib/moods';

// Home is the SPEED reel — its own scene: the accent laser-grid streaming under
// the car + rushing air, with the camera flying a 5-shot cut. Distinct from
// /night-city (which is a neon skyline light-field) even though it shares the
// city HDRI. Green grid, sharp glass mirror, wind on.
const mood = {
  ...MOODS.city,
  // ...MOODS.city drags in the city page's drone-descent shot list + glide
  // style — home keeps its OWN language: the default hard-cut six-shot reel.
  shots: undefined,
  camStyle: 'cut',
  signature: 'grid', // laser-grid floor (the home reel signature)
  noWind: false, // rushing air is part of the speed read here
  // FULL night-city game world streaming past — instanced lit-window
  // buildings, kerbside streetlights with volumetric cones, NFS traffic
  // light-trails — all speed-synced to the same spinRef as the grid + wheels.
  world: 'drive',
  lampColor: '#ffb15c', // sodium kerb lamps against the green grid
  fog: { color: '#04070f', near: 18, far: 72 }, // city recedes into night air
  accent: '#00FF88', // green laser-grid
  // Candy cherry body — flake clearcoat carpaint, hot against the green grid.
  paintBase: '#D80A2E',
  windColor: '#cfe2ff', // cool air, kept off the green grid hue
  bloom: 0.5,
  // home's own glass floor — sharper + darker than the city's rain-wet mirror
  floorMirror: 0.78,
  floorColor: '#070a0e',
  floorRoughness: 0.32,
  title: ['Ride the', 'cut'],
  blurb:
    'A 911 GT3 RS tearing through a night city — lit-window towers and streetlights rush past, traffic streaks by in light-trails, and the camera flies a six-shot cut: front stance, rear wing, wheel detail, nose line, street chase, hero orbit. Real-time React Three Fiber, no video.',
};

export default function Home() {
  return (
    <main>
      <SceneMount mood={mood} mode="scroll" />
      <Chrome mood={{ ...mood, label: 'After Dark · cinematic' }} current="home" cue />
    </main>
  );
}
