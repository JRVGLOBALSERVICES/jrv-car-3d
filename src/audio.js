// ===== drift audio — Web Audio engine + tyre-screech, mapped to the donut state =====
// Two CC0 loops carry the whole soundbed:
//   • engine.mp3  — a low rev loop whose playbackRate (≈RPM) rides speed + throttle
//   • screech.mp3 — a sustained tyre squeal whose gain rides the slide (drift phase)
// Browsers block audio until a user gesture, so nothing sounds until the first
// pointer/tap unlocks the context (the same gesture that fires the throttle). A mute
// toggle persists in localStorage; reduced-motion / muted users get silence.

export function createAudio({ reduceMotion = false } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  // graceful no-op shim if the browser has no Web Audio (very old / locked-down)
  if (!AC) return { unlock() {}, update() {}, toggleMuted() { return true; }, get muted() { return true; }, ready: false };

  let muted = localStorage.getItem('jrv-car-muted') === '1';
  let ctx = null, started = false, loaded = false;
  let master, engineGain, screechGain;
  let engineSrc, screechSrc;
  let engineBuf = null, screechBuf = null;

  // smoothed targets so gain/RPM never click
  let engGainCur = 0, scrGainCur = 0, rpmCur = 0.7;

  async function decode(url) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  }

  async function ensureBuffers() {
    if (loaded || !ctx) return;
    try {
      [engineBuf, screechBuf] = await Promise.all([
        decode('audio/engine.mp3'),
        decode('audio/screech.mp3'),
      ]);
      loaded = true;
      if (started) wireSources();
    } catch (e) {
      console.warn('audio decode failed', e);
    }
  }

  function wireSources() {
    if (engineSrc || !engineBuf || !screechBuf) return;
    engineSrc = ctx.createBufferSource();
    engineSrc.buffer = engineBuf; engineSrc.loop = true;
    engineSrc.connect(engineGain);
    engineSrc.start();

    screechSrc = ctx.createBufferSource();
    screechSrc.buffer = screechBuf; screechSrc.loop = true;
    // start a little into the squeal so it doesn't lead with the tyre-chirp transient
    screechSrc.connect(screechGain);
    screechSrc.start(0, 0.4);
  }

  // call on the FIRST user gesture (pointerdown / tap). Idempotent.
  function unlock() {
    if (started || reduceMotion) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    engineGain = ctx.createGain(); engineGain.gain.value = 0; engineGain.connect(master);
    screechGain = ctx.createGain(); screechGain.gain.value = 0; screechGain.connect(master);
    started = true;
    if (ctx.state === 'suspended') ctx.resume();
    if (loaded) wireSources(); else ensureBuffers();
  }

  function toggleMuted() {
    muted = !muted;
    localStorage.setItem('jrv-car-muted', muted ? '1' : '0');
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.04);
    if (ctx && !muted && ctx.state === 'suspended') ctx.resume();
    return muted;
  }

  // per-frame: map the live drift state onto engine RPM + screech level.
  //   active   — true once the car is alive (post-reveal)
  //   drifting — phase === 'drift' (the donut beat)
  //   speed    — 0..1 wheel/track speed
  //   throttle — 0..1 tap burst
  function update({ active, drifting, speed = 0, throttle = 0 }, dt) {
    if (!started || !engineSrc || muted) return;
    const k = Math.min(1, dt * 6);

    // engine: idles low, climbs with speed + a hard kick on throttle. gain swells in
    // when the car is alive; the donut sits a touch louder than the pull.
    const rpmTarget = active ? 0.74 + speed * 0.5 + throttle * 0.7 + (drifting ? 0.12 : 0) : 0.7;
    rpmCur += (rpmTarget - rpmCur) * k;
    engineSrc.playbackRate.setTargetAtTime(rpmCur, ctx.currentTime, 0.05);
    const engTarget = active ? 0.16 + speed * 0.08 + throttle * 0.16 : 0;
    engGainCur += (engTarget - engGainCur) * k;
    engineGain.gain.setTargetAtTime(engGainCur, ctx.currentTime, 0.05);

    // screech: only in the slide, louder on a throttle stab; a slight pitch wobble keeps
    // the loop from sounding static.
    const scrTarget = drifting ? 0.17 + throttle * 0.2 : 0;
    scrGainCur += (scrTarget - scrGainCur) * k;
    screechGain.gain.setTargetAtTime(scrGainCur, ctx.currentTime, drifting ? 0.06 : 0.18);
    if (screechSrc) screechSrc.playbackRate.value = 0.98 + throttle * 0.12;
  }

  return {
    unlock,
    update,
    toggleMuted,
    get muted() { return muted; },
    get ready() { return started; },
  };
}
