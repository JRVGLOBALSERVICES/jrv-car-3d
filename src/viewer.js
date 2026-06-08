// On-site 911 showcase — baked Cycles turntable.
// The realtime GLB viewer can't reproduce Cycles, so the on-page model is a
// pre-rendered 360° frame sequence: SAME scene, SAME AgX Medium-High grade,
// SAME HDRI + materials as the hero render. Scrubbed on a <canvas> as an
// image sequence (NOT video.currentTime — that breaks scrub on iOS Safari).

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });
const loaderEl = document.getElementById('loader');
const pctEl = document.getElementById('pct');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FRAME_COUNT = 36;
const PAD = 4;
const SRC = (i) => `/model/turntable/frame_${String(i + 1).padStart(PAD, '0')}.jpg`;

const frames = new Array(FRAME_COUNT);
let loaded = 0;

// --- turntable state ---
let pos = 0;            // float frame index, wraps [0, FRAME_COUNT)
let vel = 0;            // frames per tick (momentum)
let dragging = false;
let lastX = 0;
let idleTimer = 0;      // ticks since last user input
const AUTO_SPEED = 0.06;   // idle auto-rotate (frames/tick) ~ a slow 360 in ~10s
const DRAG_PER_PX = 0.045; // how many frames one px of drag advances
const FRICTION = 0.92;     // momentum decay
const IDLE_DELAY = 48;     // ticks of no input before auto-rotate resumes

function wrap(i) { return ((i % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT; }

// --- sizing (cover-fit, hi-dpi) ---
let dpr = 1, vw = 0, vh = 0;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = window.innerWidth;
  vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
  draw();
}

function draw() {
  const img = frames[wrap(Math.round(pos))];
  if (!img || !img.complete) return;
  const cw = canvas.width, ch = canvas.height;
  const ir = img.width / img.height;
  const cr = cw / ch;
  let dw, dh, dx, dy;
  if (ir > cr) { dh = ch; dw = ch * ir; dx = (cw - dw) / 2; dy = 0; }
  else { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
  ctx.fillStyle = '#0a0c0e';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, dw, dh);
}

// --- interaction ---
function pointerDown(e) {
  dragging = true;
  vel = 0;
  idleTimer = 0;
  lastX = (e.touches ? e.touches[0].clientX : e.clientX);
  canvas.setPointerCapture?.(e.pointerId ?? 0);
}
function pointerMove(e) {
  if (!dragging) return;
  const x = (e.touches ? e.touches[0].clientX : e.clientX);
  const dx = x - lastX;
  lastX = x;
  const delta = -dx * DRAG_PER_PX;   // drag right -> car turns toward you
  pos = wrap(pos + delta);
  vel = delta;                       // carry into momentum on release
  idleTimer = 0;
  draw();
}
function pointerUp() { dragging = false; idleTimer = 0; }

canvas.addEventListener('pointerdown', pointerDown);
canvas.addEventListener('pointermove', pointerMove);
addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);
// touch fallbacks (older iOS Safari)
canvas.addEventListener('touchstart', pointerDown, { passive: true });
canvas.addEventListener('touchmove', (e) => { pointerMove(e); }, { passive: true });
canvas.addEventListener('touchend', pointerUp);
// wheel / trackpad spins too
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  vel += (e.deltaY || e.deltaX) * 0.004;
  idleTimer = 0;
}, { passive: false });

// --- tick ---
function tick() {
  if (!dragging) {
    pos = wrap(pos + vel);
    vel *= FRICTION;
    if (Math.abs(vel) < 0.0008) vel = 0;
    if (vel === 0) {
      idleTimer++;
      if (!reduceMotion && idleTimer > IDLE_DELAY) pos = wrap(pos + AUTO_SPEED);
    }
    draw();
  }
  requestAnimationFrame(tick);
}

// --- preload all frames, then reveal ---
function onLoad() {
  loaded++;
  if (pctEl) pctEl.textContent = String(Math.round((loaded / FRAME_COUNT) * 100));
  if (loaded === 1) { resize(); }          // show first frame ASAP
  if (loaded === FRAME_COUNT) {
    if (loaderEl) {
      loaderEl.classList.add('gone');
      setTimeout(() => loaderEl.remove(), 600);
    }
  }
}
for (let i = 0; i < FRAME_COUNT; i++) {
  const img = new Image();
  img.decoding = 'async';
  img.onload = onLoad;
  img.onerror = onLoad; // don't stall the loader on a single miss
  img.src = SRC(i);
  frames[i] = img;
}

addEventListener('resize', resize);
requestAnimationFrame(tick);
