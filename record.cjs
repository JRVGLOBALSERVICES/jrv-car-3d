// Records the live WebGL scene via CDP Page.startScreencast (event-driven —
// frames arrive as the page paints; no blocking captureScreenshot loop).
// A continuous pointer drag orbits the car so the clip covers many angles.
// Usage: node record.cjs <page.html> <outdir> [durationMs]
const http = require('http'); const fs = require('fs'); const path = require('path');
const { spawn } = require('child_process'); const CDP = require('chrome-remote-interface');

const PAGE = process.argv[2] || 'night-street.html';
const OUTDIR = process.argv[3] || '/tmp/rec';
const DURATION = parseInt(process.argv[4] || '16000', 10);

const ROOT = path.join(__dirname, 'dist'); const PORT = 5144; const RDP = 9288;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.hdr':'application/octet-stream','.mp3':'audio/mpeg','.json':'application/json','.png':'image/png','.jpg':'image/jpeg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.mkdirSync(OUTDIR, { recursive: true });

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/' + PAGE;
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

server.listen(PORT, '127.0.0.1', async () => {
  const chrome = spawn('google-chrome', [
    '--headless=new','--no-sandbox','--disable-dev-shm-usage',
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    `--remote-debugging-port=${RDP}`,'--window-size=440,900','--hide-scrollbars','--mute-audio'
  ], { stdio: 'ignore', detached: true });
  chrome.unref();

  await sleep(2500);
  let client;
  for (let i=0;i<25;i++){ try { client = await CDP({ port: RDP }); break; } catch(e){ await sleep(400); } }
  const { Page, Runtime, Emulation, Input } = client;
  await Page.enable(); await Runtime.enable();
  const errs = [];
  Runtime.exceptionThrown(p => errs.push((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text));
  Runtime.consoleAPICalled(p => { if (p.type === 'error') errs.push('err: ' + p.args.map(a => a.value || a.description).join(' ')); });
  await Emulation.setDeviceMetricsOverride({ width:440, height:900, deviceScaleFactor:1, mobile:true });

  await Page.navigate({ url: `http://127.0.0.1:${PORT}/${PAGE}` });
  await Page.loadEventFired();

  let ready = false;
  for (let i=0;i<80;i++){
    const r = await Runtime.evaluate({ expression: "(!document.getElementById('loader') || !!document.querySelector('#loader.gone'))", returnByValue:true });
    if (r.result.value) { ready = true; break; } await sleep(500);
  }
  console.log('READY', ready, 'errs:', JSON.stringify(errs));
  await sleep(4500); // let the loader overlay fully fade + first lit frame paint

  // event-driven frame capture
  let n = 0;
  Page.screencastFrame(async ({ data, sessionId }) => {
    fs.writeFileSync(path.join(OUTDIR, `f${String(n).padStart(4,'0')}.jpg`), Buffer.from(data,'base64'));
    n++;
    try { await Page.screencastFrameAck({ sessionId }); } catch(e){}
  });
  await Page.startScreencast({ format:'jpeg', quality:80, everyNthFrame:1 });

  // continuous orbit drag to rotate the car across the clip (keeps it painting)
  const cy = 470; let mx = 120;
  await Input.dispatchMouseEvent({ type:'mousePressed', x:mx, y:cy, button:'left', clickCount:1 });
  const t0 = Date.now();
  while (Date.now() - t0 < DURATION) {
    mx += 4; if (mx > 420) mx = 120; // sweep across, wrap to keep spinning one direction-ish
    await Input.dispatchMouseEvent({ type:'mouseMoved', x:mx, y:cy, button:'left' });
    await sleep(90);
  }
  await Input.dispatchMouseEvent({ type:'mouseReleased', x:mx, y:cy, button:'left' });
  await Page.stopScreencast();
  await sleep(300);
  console.log('CAPTURED', n, 'frames ->', OUTDIR, 'JS_ERRORS:', JSON.stringify(errs));
  await client.close();
  try { process.kill(-chrome.pid); } catch(e){}
  server.close(() => process.exit(0));
}).on('error', e => { console.log('SERVER_ERR', e.message); process.exit(1); });
