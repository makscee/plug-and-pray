// node scripts/shots.mjs: render every place and direction, the stored frames, into out/shots.html (needs npm run build)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4180;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
process.on('exit', () => server.kill());
await new Promise((ok) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && ok()));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error(String(e)));
await page.goto(`http://localhost:${PORT}/?new&fast`);
await page.waitForFunction(() => window.thaw);
const html = await page.evaluate(() => {
  const { render, still } = window.thaw.scene;
  // a frame as the player sees it; `lit` paints the things' pixels amber, as a hover does
  const img = (s, res, lit = false) => {
    const c = document.createElement('canvas');
    c.width = c.height = res;
    const x = c.getContext('2d');
    const d = x.createImageData(res, res);
    for (let i = 0; i < res * res; i++) {
      const on = lit && s.things.some((t) => t.mask[i]);
      for (let k = 0; k < 3; k++) d.data[i * 4 + k] = on ? [255, 176, 0][k] : s.pixels[i * 3 + k] * (lit ? 0.45 : 1);
      d.data[i * 4 + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return c.toDataURL();
  };
  const fig = (s, res, cap) =>
    `<figure style="margin:0"><img src="${img(s, res)}" width=320 style="image-rendering:pixelated;display:block"><img src="${img(s, res, true)}" width=80 style="image-rendering:pixelated"><figcaption>${cap}</figcaption></figure>`;
  let h = '<!doctype html><meta charset=utf-8><title>thaw frames</title><body style="background:#111;color:#ccc;font:14px monospace;padding:12px">';
  h += '<p>thaw frames (makscee/void-board#1320, Maks 10-17): 64 px in 8 dusk colours, 160 px in 32 after optics, shown at 320. Small: the things lit, as a hover.</p>';
  for (const place of ['@here', '@LDR', '@T-2', '@HAB', '@RLY'])
    for (const res of [64, 160]) {
      h += `<h3>${place} ${res}</h3><div style="display:flex;gap:8px;flex-wrap:wrap">`;
      for (const heading of [0, 90, 180, 270]) {
        const s = render({ place, heading, res });
        h += fig(s, res, `${heading} ${s.things.map((t) => t.id).join(' ')}`);
      }
      h += '</div>';
    }
  h += '<h3>mid-road blur, stored frames</h3><div style="display:flex;gap:8px;flex-wrap:wrap">';
  h += fig(render({ place: '@here', heading: 0, res: 64, blur: true, at: [0.6, 0.8] }), 64, 'blur 64');
  h += fig(render({ place: '@here', heading: 0, res: 160, blur: true, at: [0.6, 0.8] }), 160, 'blur 160');
  for (const n of ['land', 'crew', 'wave']) h += fig(still(n), 64, n);
  return h + '</div>';
});
mkdirSync('out', { recursive: true });
writeFileSync('out/shots.html', html);
await browser.close();
process.exit(0);
