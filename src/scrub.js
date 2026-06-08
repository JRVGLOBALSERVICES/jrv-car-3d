/* Image-sequence scroll-scrub engine — Cycles-rendered turntable played back on
 * a <canvas>. iOS-safe (canvas draw, NOT video.currentTime seek). Drives the
 * frame index off Lenis smooth-scroll progress; honours prefers-reduced-motion.
 *
 * Wire-up: a <canvas data-seq="/seq-a" data-count="30"> plus a tall
 *   .scrub-track that provides the scroll distance, and .beat[data-at] overlay
 *   blocks revealed at scroll thresholds.
 */
import Lenis from 'lenis';

const canvas = document.getElementById('scene');
const SEQ = canvas.dataset.seq;
const COUNT = parseInt(canvas.dataset.count, 10);
const PAD = 3; // frame_000.webp
const ctx = canvas.getContext('2d', { alpha: false });
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const frames = new Array(COUNT);
let loaded = 0;
let current = -1;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

const pctEl = document.getElementById('pct');
const loaderEl = document.getElementById('loader');
const fillEl = document.getElementById('revfill');

function frameURL(i) {
  return `${SEQ}/frame_${String(i).padStart(PAD, '0')}.webp`;
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  if (current >= 0) draw(current, true);
}

// cover-fit the frame to the canvas (like background-size: cover)
function draw(i, force) {
  i = Math.max(0, Math.min(COUNT - 1, i));
  if (i === current && !force) return;
  const img = frames[i];
  if (!img || !img.complete || !img.naturalWidth) return;
  current = i;
  const cw = canvas.width, ch = canvas.height;
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = cw / ch;
  let dw, dh, dx, dy;
  if (cr > ir) { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
  else { dh = ch; dw = ch * ir; dx = (cw - dw) / 2; dy = 0; }
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, dw, dh);
}

function load(i) {
  return new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = () => {
      loaded++;
      const p = Math.round((loaded / COUNT) * 100);
      if (pctEl) pctEl.textContent = p;
      if (fillEl) fillEl.style.transform = `scaleX(${loaded / COUNT})`;
      res();
    };
    img.src = frameURL(i);
    frames[i] = img;
  });
}

const beats = [...document.querySelectorAll('.beat')];
const railFill = document.querySelector('.rail i');
const cue = document.querySelector('.cue');
function updateBeats(p) {
  for (const b of beats) {
    const at = parseFloat(b.dataset.at);
    const span = parseFloat(b.dataset.span || '0.18');
    b.classList.toggle('on', Math.abs(p - at) < span);
  }
  if (railFill) railFill.style.height = (p * 100).toFixed(2) + '%';
  if (cue) cue.style.opacity = p > 0.015 ? '0' : '';
}

function progressFromScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

async function boot() {
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // first frame fast so the loader can reveal something immediately
  await load(0);
  draw(0, true);
  // rest in parallel
  await Promise.all(Array.from({ length: COUNT - 1 }, (_, k) => load(k + 1)));

  if (loaderEl) {
    loaderEl.classList.add('gone');
    setTimeout(() => loaderEl.remove(), 600);
  }

  const apply = (p) => {
    draw(Math.round(p * (COUNT - 1)));
    updateBeats(p);
  };

  if (reduced) {
    // no smooth scroll, no scrub momentum — map native scroll directly
    apply(progressFromScroll());
    window.addEventListener('scroll', () => apply(progressFromScroll()), { passive: true });
    return;
  }

  const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
  let raf = 0;
  lenis.on('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; apply(progressFromScroll()); });
  });
  function tick(t) { lenis.raf(t); requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
  apply(0);
}

boot();
