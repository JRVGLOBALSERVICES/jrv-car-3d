import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';
import { MOODS } from '@/lib/moods';

export const metadata = {
  title: 'JRV · 911 GT3 RS — Backstreet',
  description:
    'A real-time React Three Fiber Porsche 911 GT3 RS on warm backstreet light. AgX tone mapping, Reflector wet floor, copper-to-violet thin-film paint. Drag to orbit.',
  openGraph: { title: 'JRV · 911 GT3 RS — Backstreet', description: 'Warm sodium light, copper paint — live WebGL. Drag to orbit.' },
};

export default function NightStreet() {
  return (
    <main>
      <SceneMount mood={MOODS.street} mode="orbit" />
      <Chrome mood={MOODS.street} current="street" hint="drag to orbit · scroll to zoom" />
    </main>
  );
}
