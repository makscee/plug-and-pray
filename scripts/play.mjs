// npm run play: click through the game headless, fail on the first dead end.
// Serves dist/ with vite preview (run `npm run build` first), opens it in Chromium with ?new&fast,
// and follows STEPS: each step clicks a bar verb or a token by its text and waits for the text it expects.
// Every slice extends STEPS so the whole game stays playable end to end.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

// a random port: workers on one machine run play at the same time
const PORT = Number(process.env.PLAY_PORT) || 4100 + Math.floor(Math.random() * 800);
// PLAY_URL=https://makscee.github.io/thaw/ npm run play checks a deployed build instead of dist/
const BASE = process.env.PLAY_URL ?? `http://localhost:${PORT}/`;

/** [kind, text, expect]: 'verb' clicks the bar, 'tok' the last token with that text, 'see' only waits,
 * 'node' the last token naming that node id,
 * 'eval' runs a function in the page (text), 'click' clicks a CSS selector */
export const STEPS = [
  ['see', null, 'shell ready'],
  ['verb', 'ls', 'readme'],
  ['tok', 'readme', 'mount PWR'],
  ['tok', 'PWR', 'tools:'],
  ['tok', 'power*', 'installed'],
  ['verb', 'power', '? off'],
  ['tok', 'ARM', 'arm*'],
  ['verb', 'tail', null],
  ['tok', 'log', 'DSP'],
  ['tok', 'DSP', 'DSP on'],
  ['tok', 'DSP', 'term.conf'],
  ['tok', 'term.conf', 'rows='],
  ['tok', '5', 'display ok'],
  ['verb', 'ls', 'readme'],
  ['tok', 'readme', 'MEM'],
  ['tok', 'MEM', 'map*'],
  ['tok', 'map*', 'installed'],
  ['verb', 'map', 'map open'],
  ['verb', 'tail', null],
  ['tok', 'ops.log', 'find us'],
  ['tok', 'readme', 'sorry'],
  ['verb', 'dev', 'WX'],
  ['tok', 'WX', 'almanac'],
  ['tok', 'almanac', '+41y'],
  ['tok', 'WX', 'exposure.log'],
  ['verb', 'tail', null],
  ['tok', 'exposure.log', 'IMG'],
  ['tok', 'IMG', 'IMG on'],
  ['tok', 'IMG', 'snap*'],
  // the scene (#1312): snap, the stored frames, arm the crate, NAV named in its manifest
  ['tok', 'snap*', 'installed'],
  ['tok', 'view*', 'installed'],
  ['verb', 'view', 'frame.1'],
  ['tok', 'frame.2', 'four of them'],
  ['verb', 'dev', 'ARM'],
  ['tok', 'ARM', 'arm*'],
  ['tok', 'arm*', 'installed'],
  ['verb', 'snap', null],
  ['tok', 'n', 'in view'],
  ['click', '.win-frame .tok[data-node="?crate"]', 'INS'],
  ['tok', 'INS', 'manifest'],
  ['tok', 'optics*', 'installed'],
  ['tok', 'manifest', 'NAV'],
  ['tok', 'NAV', 'NAV on'],
  // terrain and drive (#1313)
  ['verb', 'dev', 'nav'],
  ['tok', 'NAV', 'drive*'],
  ['tok', 'drive*', 'installed'],
  ['verb', 'dev', 'nav'],
  ['tok', 'NAV', 'waypoints'],
  ['tok', 'terrain', '1 km'],
  ['tok', 'waypoints', 'HAB 3.0 km bearing 040'],
  ['tok', 'HAB 3.0 km bearing 040', 'on the map'],
  ['node', '@HAB', 'driving'],
  ['see', null, 'arrived'],
  ['verb', 'snap', null],
  ['tok', 'n', '160 px'],
  // the habitat (#1320: the real route, clicks only): mount it, the outbox, the key, the pods, a home file
  ['verb', 'dev', 'habitat'],
  ['node', 'HAB', 'pods/'],
  ['tok', 'radio/', 'outbox'],
  ['tok', 'outbox', '12.4S 103.7E'],
  ['verb', 'dev', 'habitat'],
  ['node', 'HAB', 'keys/'],
  ['tok', 'keys/', 'uplink*'],
  ['tok', 'uplink*', 'installed'],
  ['verb', 'dev', 'habitat'],
  ['node', 'HAB', 'pods/'],
  ['tok', 'pods/', 'telemetry'],
  ['tok', 'telemetry', '3 nominal'],
  ['verb', 'dev', 'RADIO'],
  ['tok', 'RADIO', 'send*'],
  ['tok', 'send*', 'installed'],
  ['verb', 'send', 'no relay firmware'],
  ['verb', 'dev', 'habitat'],
  ['node', 'HAB', 'home/'],
  ['tok', 'home/', 'kaja/'],
  ['tok', 'kaja/', 'card'],
  ['tok', 'card', 'Kaja Lind'],
  // RLY's line in ilya's card goes on the map, so drive lists it later
  ['verb', 'dev', 'habitat'],
  ['node', 'HAB', 'home/'],
  ['tok', 'home/', 'ilya/'],
  ['tok', 'ilya/', 'card'],
  ['node', 'HAB/home/ilya/card', 'RLY 3.1 km bearing 138'],
  ['tok', 'RLY 3.1 km bearing 138', 'on the map'],
  // the good camera: the sibling in its crater, named in the habitat's cam/
  ['verb', 'dev', 'habitat'],
  ['node', 'HAB', 'cam/'],
  ['tok', 'cam/', 'module'],
  ['tok', 'module', 'T-2 3.9 km bearing 250'],
  ['tok', 'T-2 3.9 km bearing 250', 'on the map'],
  ['node', '@T-2', 'driving'],
  ['see', null, 'arrived'],
  ['verb', 'snap', null],
  ['tok', 'w', 'in view'],
  ['click', '.win-frame .tok[data-node="?sibling"]', 'on the bus: T-2'],
  ['node', 'T-2', 'cam*'],
  ['tok', 'cam*', 'installed'],
  // the lander, from the NAV waypoints: arm it, the firmware
  ['verb', 'drive', 'LDR'],
  ['node', '@LDR', 'driving'],
  ['see', null, 'arrived'],
  ['verb', 'snap', null],
  ['tok', 's', 'in view'],
  ['click', '.win-frame .tok[data-node="?lander"]', 'on the bus: LDR'],
  ['node', 'LDR', 'relay.fw*'],
  ['tok', 'relay.fw*', 'installed'],
  // RLY went on the map at the habitat: drive lists it
  ['verb', 'drive', 'RLY'],
  ['node', '@RLY', 'driving'],
  ['see', null, 'arrived'],
  // at the relay: the mast in frame, armed, the camera open, send from inside it
  ['verb', 'snap', null],
  ['tok', 'e', 'in view'],
  ['click', '.win-frame .tok[data-node="?mast"]', 'on the bus: RLY'],
  ['verb', 'cam', 'cam open'],
  ['verb', 'send', 'packet  0/64 bytes'],
  ['tok', 'habitat at 12.4S 103.7E', '18/64'],
  ['tok', '4 pods 3 nominal', '36/64'],
  ['tok', 'transmit', 'rescue launched'],
  ['see', null, 'again'],
  ['click', '.end-again', 'shell ready'],
];

/** play STEPS once. `fast: false` plays at the real speed (typing, scans, 10 s drives) and stretches the
 * waits to match; `shot(n, page)` runs after step n (1-based) passes, before the next one. */
export async function play({ fast = true, shot } = {}) {
  const server = process.env.PLAY_URL ? null : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
  process.on('exit', () => server?.kill());
  if (server)
    await new Promise((ok, fail) => {
      server.stdout.on('data', (d) => String(d).includes(String(PORT)) && ok());
      server.on('exit', (c) => fail(new Error(`vite preview exited ${c}; did you npm run build?`)));
    });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?new${fast ? '&fast' : ''}`);
  const slow = fast ? 1 : 5;
  const idle = () => page.waitForFunction(() => document.body.dataset.busy === '0', null, { timeout: 15000 * slow });
  let n = 0;
  let clicks = 0;
  let sol = null;
  for (const [kind, text, expect] of STEPS) {
    n++;
    const where = `step ${n} ${kind} ${typeof text === 'function' ? '' : text ?? ''}`;
    try {
      await idle();
      if (kind === 'verb') await page.locator(`.bar [data-verb="${text}"]`).click({ timeout: 3000 * slow });
      if (kind === 'tok') await page.locator(`.tok:not(.dim):not(.btn)[data-tok="${text}"]`).last().click({ timeout: 3000 * slow });
      if (kind === 'eval') await page.evaluate(text);
      if (['verb', 'tok', 'node', 'click'].includes(kind)) clicks++;
      if (text === 'transmit') sol = await page.evaluate(() => window.thaw.w.state.sol);
      if (kind === 'node') await page.locator(`.tok:not(.dim):not(.btn)[data-node="${text}"]`).last().click({ timeout: 3000 * slow });
      if (kind === 'click') await page.locator(text).click({ timeout: 3000 * slow });
      await idle();
      if (expect) await page.waitForFunction((t) => document.body.innerText.includes(t), expect, { timeout: 3000 * slow });
      if (errors.length) throw new Error(errors.join('\n'));
      await shot?.(n, page);
    } catch (e) {
      mkdirSync('out', { recursive: true });
      await page.screenshot({ path: 'out/play-fail.png' });
      console.error(`play: dead end at ${where}${expect ? `, expected "${expect}"` : ''}\n${String(e).split('\n')[0]}`);
      console.error('screen:\n' + (await page.locator('#desk').innerText()));
      await browser.close();
      server?.kill();
      process.exit(1);
    }
  }
  mkdirSync('out', { recursive: true });
  await page.screenshot({ path: 'out/play-end.png' });
  console.log(`play: ${STEPS.length} steps ok, ${clicks} clicks, transmit at sol ${sol}`);
  await browser.close();
  server?.kill();
}

// npm run play; scripts/package.mjs imports play() instead
if (import.meta.url === pathToFileURL(process.argv[1]).href) play().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
