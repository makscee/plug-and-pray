// npm run package: the submission package from the latest build (npm run package runs `npm run build` first).
// Five 1280x720 screenshots on seed 1, each a short run typed like look.mjs (commands, numbers step the
// clock, 'js:' stages), some from the slices' ?scene= stagings; then dist/ zipped into submission/thaw.zip
// with index.html at its root for the itch.io HTML5 upload.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = 'submission';
// the stagings say "staged: ..." in the console; a screenshot shows the console as a player would see it
const CLEAN = "js:thaw.g.log.splice(0, thaw.g.log.length, ...thaw.g.log.filter((l) => !JSON.stringify(l).includes('staged'))), thaw.screen.con.shown = 1e9";
// r4: a good ending for the shot ("spring"): resources to give the engine, and the shard banner gone
const HAUL = "js:thaw.g.player.inv.push({ kind: 'res', res: 'bone', n: 40 }, { kind: 'res', res: 'copper', n: 35 }, { kind: 'res', res: 'glass', n: 20 }, { kind: 'res', res: 'ichor', n: 15 })";
const NOBANNER = "js:document.querySelectorAll('.shard-fanfare').forEach((e) => e.remove())";
const ENGINE = "js:thaw.g.player.slots++, thaw.g.player.inv.push({ kind: 'mod', mod: 'thaw-engine' })";

/** file, query, steps; the steps after the page loads, as look.mjs takes them */
const SHOTS = [
  // r4: the kit installed and the dawn eye in, so the shot shows colour and the windows (bare, it was black)
  ['1-wake.png', '?seed=1&still', ['install all', 'conjure dawn-eye', 'js:thaw.g.player.core++', 'swap in dawn eye', 2.5, 'listen', 0.5]],
  ['2-pinhole.png', '?seed=1&still', ['take', 'install pinhole', 1.5, 'crawl e', 2.5, 'crawl n', 2.5, 'take', 'install stepper', 1.2, 'go e 3', 2.2]],
  ['3-deep.png', '?seed=1&scene=world-deep&still', [1.5, CLEAN, 'go e 2', 1.5]],
  ['4-fight.png', '?seed=1&scene=fight', [1.5, CLEAN, 'click:button[data-cmd=shoot]', 1.2]],
  ['5-thaw.png', '?seed=1&scene=world-engine&still', [1, CLEAN, 'take thaw', ENGINE, HAUL, NOBANNER, 'install thaw engine', 1.2, 0.8, 4, 4, 2, NOBANNER]],
];

if (!existsSync('dist/index.html')) throw new Error('package: no dist/, run npm run build first');
mkdirSync(OUT, { recursive: true });

const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
process.on('exit', () => srv.kill());
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;

for (const [file, query, steps] of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://localhost:${port}/${query}`);
  await page.waitForFunction(() => window.thaw);
  await page.evaluate(() => document.fonts.ready);
  await wait(800);
  const still = query.includes('still');
  for (const s of steps) {
    // a number steps the clock on ?still runs and waits that long on real-clock ones
    if (typeof s === 'number') await (still ? page.evaluate((x) => window.step(x), s) : wait(s * 1000));
    else if (s.startsWith('js:')) await page.evaluate(s.slice(3));
    else if (s.startsWith('click:')) await page.click(s.slice(6));
    else await page.evaluate((c) => window.thaw.send(c), s);
    await wait(60);
  }
  await wait(400);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log(`package: ${OUT}/${file}${errs.length ? '  errors: ' + errs.join('; ') : ''}`);
  if (errs.length) failed = true;
  await page.close();
}
await browser.close();

rmSync(`${OUT}/thaw.zip`, { force: true });
execFileSync('zip', ['-qrX', `../${OUT}/thaw.zip`, '.'], { cwd: 'dist', stdio: 'inherit' });
console.log(`package: ${OUT}/thaw.zip`);
process.exit(failed ? 1 : 0);
