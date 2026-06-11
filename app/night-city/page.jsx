import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';
import { MOODS } from '@/lib/moods';

export const metadata = {
  title: 'JRV · 911 GT3 RS — After Dark',
  description:
    'A real-time React Three Fiber Porsche 911 GT3 RS in a neon plaza ringed by a night skyline. Scroll flies a continuous drone descent — aerial top-down spiralling to street level. AgX tone mapping, Reflector wet floor.',
  openGraph: { title: 'JRV · 911 GT3 RS — After Dark', description: 'Drone descent through a neon night city, live WebGL. Scroll to fly down.' },
};

export default function NightCity() {
  return (
    <main>
      <SceneMount mood={MOODS.city} mode="scroll" />
      <Chrome mood={MOODS.city} current="city" cue hint="scroll to fly the descent" />
    </main>
  );
}
