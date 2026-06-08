// Baked-turntable viewer — drag-scrub image sequence.
//
// These 36 frames ARE the Cycles render (brown_photostudio_02 HDRI, clearcoat
// paint, transmissive glass, real chrome, AgX grade) — the exact hero look,
// nothing approximated. Because playback is just blitting pre-decoded JPEGs to
// a 2D canvas, there is ZERO per-frame GPU cost: it stays glass-smooth on any
// phone, where the real-time WebGL build (IBL + mirror floor + 84 materials)
// could not. Trade-off: orbit is locked to the turntable's horizontal sweep
// (no free pitch / zoom) — the deliberate price for guaranteed-smooth + the
// best possible look on mobile.

const FRAME_COUNT = 36;
const FRAME_URL = (i) => `/model/turntable/frame_${String(i + 1).padStart(4, '0')}.jpg`;
const FRAME_W = 1600;
const FRAME_H = 900;

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });
const loaderEl = document.getElementById('loader');
const pctEl = document.getElementById('pct');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- load all frames, report progress ---------------------------------------
const frames = new Array(FRAME_COUNT);
let loaded = 0;

function loadFrames() {
  return Promise.all(
    Array.from({ length: FRAME_COUNT }, (_, i) =>
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          frames[i] = img;
          loaded++;
          if (pctEl) pctEl.textContent = Math.round((loaded / FRAME_COUNT) * 100);
          resolve();
        };
        img.onerror = () => { loaded++; resolve(); };
        img.src = FRAME_URL(i);
      })
    )
  );
}

// --- canvas sizing -----------------------------------------------------------
let vw = 0, vh = 0, dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = window.innerWidth;
  vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  needsDraw = true;
}

// --- scrub state -------------------------------------------------------------
let pos = 0;            // continuous frame index, wraps 0..FRAME_COUNT
let velocity = 0;       // frames advanced per rAF tick (from a flick)
let dragging = false;
let lastX = 0;
let lastMoveT = 0;
const idleSpin = reduceMotion ? 0 : 0.06; // gentle auto-rotate when untouched
let interacted = false;
let needsDraw = true;

const DRAG_SENSITIVITY = 0.06; // frames advanced per px dragged

const wrap = (i) => ((i % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;

// --- background gradient (cheap, drawn each frame) ---------------------------
function drawBackdrop() {
  const g = ctx.createRadialGradient(
    vw * 0.5, vh * 0.42, Math.min(vw, vh) * 0.1,
    vw * 0.5, vh * 0.55, Math.max(vw, vh) * 0.85
  );
  g.addColorStop(0, '#23262b');
  g.addColorStop(0.55, '#15171a');
  g.addColorStop(1, '#0b0c0e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

// --- frame draw (contain-fit, never crops the car) ---------------------------
function drawFrame() {
  drawBackdrop();
  const img = frames[wrap(Math.round(pos))];
  if (!img) return;

  const portrait = vh > vw;
  const scale = portrait
    ? (vw / FRAME_W)                              // fill width, whole car shows
    : Math.min(vw / FRAME_W, vh / FRAME_H);       // contain on landscape
  const dw = FRAME_W * scale;
  const dh = FRAME_H * scale;
  const dx = (vw - dw) / 2;
  const dy = portrait ? vh * 0.30 - dh / 2 : (vh - dh) / 2; // bias up on portrait

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, dw, dh);
}

// --- main loop ---------------------------------------------------------------
function tick() {
  if (dragging) {
    needsDraw = true;
  } else if (Math.abs(velocity) > 0.0008) {
    pos = wrap(pos + velocity);
    velocity *= 0.92;                              // inertia decay
    needsDraw = true;
  } else {
    velocity = 0;
    if (!interacted && idleSpin) {                 // idle auto-spin until touched
      pos = wrap(pos + idleSpin);
      needsDraw = true;
    }
  }
  if (needsDraw) {
    drawFrame();
    needsDraw = false;
  }
  requestAnimationFrame(tick);
}

// --- input -------------------------------------------------------------------
function pointerDown(x) {
  dragging = true;
  interacted = true;
  velocity = 0;
  lastX = x;
  lastMoveT = performance.now();
}
function pointerMove(x) {
  if (!dragging) return;
  const dx = x - lastX;
  const now = performance.now();
  const dt = Math.max(now - lastMoveT, 1);
  const advance = -dx * DRAG_SENSITIVITY;          // drag right → spins as expected
  pos = wrap(pos + advance);
  velocity = (advance / dt) * 16;                  // per-frame velocity for inertia
  lastX = x;
  lastMoveT = now;
  needsDraw = true;
}
function pointerUp() {
  dragging = false;
  velocity = Math.max(-1.2, Math.min(1.2, velocity)); // clamp runaway flicks
}

canvas.addEventListener('mousedown', (e) => { e.preventDefault(); pointerDown(e.clientX); });
window.addEventListener('mousemove', (e) => pointerMove(e.clientX));
window.addEventListener('mouseup', pointerUp);

canvas.addEventListener('touchstart', (e) => pointerDown(e.touches[0].clientX), { passive: true });
canvas.addEventListener('touchmove', (e) => pointerMove(e.touches[0].clientX), { passive: true });
canvas.addEventListener('touchend', pointerUp, { passive: true });

window.addEventListener('resize', resize);

// --- boot --------------------------------------------------------------------
resize();
loadFrames().then(() => {
  if (loaderEl) {
    loaderEl.classList.add('gone');
    setTimeout(() => loaderEl.remove(), 600);
  }
  needsDraw = true;
  requestAnimationFrame(tick);
});
