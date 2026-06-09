import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';

// Reel DZQgjJ9Mpmj — the "making-of" treatment: a 3D-software viewport (grey
// grid, light-blue wireframe, RGB axis gizmo, measurement HUD, orbiting light
// rigs) that hard-cuts into the polished rendered hero. Its own Canvas variant.
const buildMood = {
  key: 'build',
  label: 'Making-of · wireframe → render',
  title: ['Wireframe', 'to hero'],
  blurb:
    'The 911 built the way it is in the studio — primitives, then wireframe, then lit and revealed. Scroll to run the make: the viewport grid and on-model measurements give way to a hard cut into the rendered hero. Real-time React Three Fiber, no video.',
  hdri: '/model/modern_buildings_night_2k.hdr',
  paintBase: '#4a5d78',
  accent: '#88ccff',
};

export const metadata = {
  title: 'JRV · 911 GT3 RS — The Build',
  description:
    'The making-of: a live React Three Fiber 911 GT3 RS that scrolls from a 3D-software wireframe viewport — grid, axis gizmo, on-model measurements — into a hard cut to the lit rendered hero.',
  openGraph: {
    title: 'JRV · 911 GT3 RS — The Build',
    description: 'Wireframe viewport → rendered hero, live WebGL. Scroll to run the build.',
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
