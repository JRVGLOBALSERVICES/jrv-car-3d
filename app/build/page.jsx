import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';

// The "making-of" treatment: a 3D-software viewport (grey grid, light-blue
// wireframe, RGB axis gizmo, measurement HUD, orbiting light rigs) where the
// panels forge in bare SILVER CHROME nose-to-tail, the paint then COATS over
// the chrome, and the finished car spins a full 360 turntable. Own Canvas variant.
const buildMood = {
  key: 'build',
  label: 'Making-of · chrome → coat → 360',
  title: ['Chrome', 'to hero'],
  blurb:
    'The 911 assembled the way it is in the studio — primitive block-out, then panels forged in bare silver chrome, then the paint coats over the metal nose-to-tail, then a full 360 turntable of the finished car. Scroll to run the make. Real-time React Three Fiber, no video.',
  hdri: '/model/modern_buildings_night_2k.hdr',
  paintBase: '#4a5d78',
  accent: '#88ccff',
};

export const metadata = {
  title: 'JRV · 911 GT3 RS — The Build',
  description:
    'The making-of: a live React Three Fiber 911 GT3 RS that scrolls from a wireframe block-out, forges its panels in bare silver chrome, coats them in paint, then spins the finished car on a full 360 turntable.',
  openGraph: {
    title: 'JRV · 911 GT3 RS — The Build',
    description: 'Wireframe → silver chrome panels → paint coat → 360 turntable, live WebGL. Scroll to run the build.',
  },
};

export default function Build() {
  return (
    <main>
      <SceneMount mood={buildMood} variant="build" />
      <Chrome mood={buildMood} current="build" cue />
    </main>
  );
}
