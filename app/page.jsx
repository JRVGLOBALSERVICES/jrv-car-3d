import SceneMount from '@/components/SceneMount';
import Chrome from '@/components/Chrome';
import { MOODS } from '@/lib/moods';

const mood = {
  ...MOODS.city,
  title: ['Ride the', 'cut'],
  blurb:
    'A 911 GT3 RS in a dark studio, lit by a night-city HDRI. Scroll and the camera flies the cut — front stance, rear wing, wheel detail, nose line, hero orbit — while the wheels spin up. Real-time React Three Fiber, no video.',
};

export default function Home() {
  return (
    <main>
      <SceneMount mood={mood} mode="scroll" />
      <Chrome mood={{ ...mood, label: 'After Dark · cinematic' }} current="home" cue />
    </main>
  );
}
