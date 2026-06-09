import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';
import { MOODS } from '@/lib/moods';

// Home is the SPEED reel — its own scene: the accent laser-grid streaming under
// the car + rushing air, with the camera flying a 5-shot cut. Distinct from
// /night-city (which is a neon skyline light-field) even though it shares the
// city HDRI. Green grid, sharp glass mirror, wind on.
const mood = {
  ...MOODS.city,
  signature: 'grid', // laser-grid floor (the home reel signature)
  noWind: false, // rushing air is part of the speed read here
  accent: '#00FF88', // green laser-grid
  // Guards Red body — the speed-reel hero colour, hot against the green grid.
  paintBase: '#C8102E',
  windColor: '#cfe2ff', // cool air, kept off the green grid hue
  bloom: 0.5,
  // home's own glass floor — sharper + darker than the city's rain-wet mirror
  floorMirror: 0.78,
  floorColor: '#070a0e',
  floorRoughness: 0.32,
  title: ['Ride the', 'cut'],
  blurb:
    'A 911 GT3 RS in a dark studio, lit by a night-city HDRI. Scroll and the camera flies the cut — front stance, rear wing, wheel detail, nose line, hero orbit — while the grid streams under the wheels and the air tears past. Real-time React Three Fiber, no video.',
};

export default function Home() {
  return (
    <main>
      <SceneMount mood={mood} mode="scroll" />
      <Chrome mood={{ ...mood, label: 'After Dark · cinematic' }} current="home" cue />
    </main>
  );
}
