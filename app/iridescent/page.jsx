import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';
import { MOODS } from '@/lib/moods';

export const metadata = {
  title: 'JRV · 911 GT3 RS — Oil-Slick',
  description:
    'A real-time React Three Fiber Porsche 911 GT3 RS wrapped in a thin-film oil-slick. Scrolling drives the shader itself — the full spectrum slides across the body while the camera pushes from full body to a macro panel.',
  openGraph: {
    title: 'JRV · 911 GT3 RS — Oil-Slick',
    description: 'Scroll-scrubbed thin-film paint, live WebGL. The rainbow walks the panels as you scroll.',
  },
};

export default function Iridescent() {
  return (
    <main>
      <SceneMount mood={MOODS.iridescent} mode="scroll" />
      <Chrome mood={MOODS.iridescent} current="iridescent" cue hint="scroll to scrub the spectrum" />
    </main>
  );
}
