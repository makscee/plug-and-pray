// npm run offline: the game loads offline after the first load (sw/sw.js).
// Serves dist/ with vite preview (run `npm run build` first), or checks PLAY_URL (e.g. https://makscee.github.io/thaw/):
// loads ?seed=1, waits for the service worker to hold the page, goes offline, reloads, expects the wake console.

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = Number(process.env.PLAY_PORT) || 4100 + Math.floor(Math.random() * 800);
const BASE = process.env.PLAY_URL ?? `http://localhost:${PORT}/`;

const server = process.env.PLAY_URL ? null : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
process.on('exit', () => server?.kill());
if (server)
  await new Promise((ok, fail) => {
    server.stdout.on('data', (d) => String(d).includes(String(PORT)) && ok());
    server.on('exit', (c) => fail(new Error(`vite preview exited ${c}; did you npm run build?`)));
  });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const boot = () => page.waitForFunction(() => document.body.innerText.includes('core ok'), null, { timeout: 15000 });
try {
  await page.goto(`${BASE}?seed=1`);
  await boot();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await boot();
  // a fresh visit offline: the plain URL, then another seed
  for (const q of ['', '?seed=2']) {
    const p = await context.newPage();
    await p.goto(BASE + q);
    await p.waitForFunction(() => document.body.innerText.includes('core ok'), null, { timeout: 15000 });
    await p.close();
  }
  const font = await page.evaluate(() => document.fonts.load('20px VT323').then((f) => f.length > 0, () => false));
  if (!font) throw new Error('VT323 not loaded offline');
  console.log(`offline: ${BASE} reloads offline, boot screen shown, font loaded`);
} catch (e) {
  console.error(`offline: failed at ${BASE}\n${String(e).split("\n")[0]}`);
  console.error("screen:\n" + (await page.locator("body").innerText().catch(() => "?")).slice(0, 300));
  process.exitCode = 1;
} finally {
  await browser.close();
  server?.kill();
}
