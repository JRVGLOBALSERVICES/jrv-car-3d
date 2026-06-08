import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';
import { MOODS } from '@/lib/moods';

export const metadata = {
  title: 'JRV · 911 GT3 RS — After Dark',
  description:
    'A real-time React Three Fiber Porsche 911 GT3 RS under a cool night-city skyline. AgX tone mapping, Reflector wet floor, iridescent clearcoat. Drag to orbit.',
  openGraph: { title: 'JRV · 911 GT3 RS — After Dark', description: 'Cool night-city light, oil-slick paint — live WebGL. Drag to orbit.' },
};

export default function NightCity() {
  return (
    <main>
      <SceneMount mood={MOODS.city} mode="orbit" />
      <Chrome mood={MOODS.city} current="city" hint="drag to orbit · scroll to zoom" />
    </main>
  );
}
