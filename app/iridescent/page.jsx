import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';
import { MOODS } from '@/lib/moods';

export const metadata = {
  title: 'JRV · 911 GT3 RS — Oil-Slick',
  description:
    'A real-time React Three Fiber Porsche 911 GT3 RS wrapped in a thin-film oil-slick paint. A hand-written Fresnel→spectral shader walks the full spectrum across the body — warm facing the camera, cool at the grazing edges. Drag to orbit.',
  openGraph: {
    title: 'JRV · 911 GT3 RS — Oil-Slick',
    description: 'Thin-film iridescent paint, live WebGL. Drag to orbit and watch the colour walk across the car.',
  },
};

export default function Iridescent() {
  return (
    <main>
      <SceneMount mood={MOODS.iridescent} mode="orbit" />
      <Chrome mood={MOODS.iridescent} current="iridescent" hint="drag to orbit · scroll to zoom" />
    </main>
  );
}
