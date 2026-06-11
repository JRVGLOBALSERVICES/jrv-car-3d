import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';
import { MOODS } from '@/lib/moods';

export const metadata = {
  title: 'JRV · 911 GT3 RS — Backstreet',
  description:
    'A real-time React Three Fiber Porsche 911 GT3 RS parked under a sodium streetlight on a real backstreet. Scroll walks a full 360° circle around the car at eye level — nose, flank, wing, wheel. AgX tone mapping.',
  openGraph: { title: 'JRV · 911 GT3 RS — Backstreet', description: 'A 360° eye-level walk-around under sodium light, live WebGL. Scroll to circle the car.' },
};

export default function NightStreet() {
  return (
    <main>
      <SceneMount mood={MOODS.street} mode="scroll" />
      <Chrome mood={MOODS.street} current="street" cue hint="scroll to walk around the car" />
    </main>
  );
}
