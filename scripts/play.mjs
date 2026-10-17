// The merge check's play-through: a headless browser types a run on a fixed seed with the clock
// stopped (?still), steps time by hand and fails on the first expectation that does not hold.
// Each step: [command | seconds, check?]. A check is a JS expression over `g` (the game).
// Slices add steps for what they add; keep it a run a player could type.
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const STEPS = [
  ['take', 'g.player.inv.some(i => i.mod === "pinhole-eye")'],
  ['install pinhole', 'g.player.installed.length === 1'],
  [1.5, 'document.querySelector("canvas.eye") !== null'],
  ['crawl e'], [2.5], ['crawl n'], [2.5, 'g.player.x === 9.5 && g.player.y === 7.5'],
  ['take', 'g.player.inv.some(i => i.mod === "stepper-relay")'],
  ['install stepper'], [1],
  ['go e 3'], [2, 'g.player.x >= 11.5 && g.player.path.length === 0'],
  ['status', 'g.log.some(l => l.join && JSON.stringify(l).includes("power 2/4"))'],
  // world: the reader and a card lie a chunk south; this hands them over (the check is the setup)
  [0, '(g.player.slots = 5, g.player.inv.push({ kind: "mod", mod: "card-reader" }, { kind: "mod", mod: "map-spool" }, { kind: "card", card: "log-surveyor" }), true)'],
  ['install card reader'], ['install map spool'], [1.5, 'document.querySelector("canvas.map") !== null'],
  ['read card', 'g.vectors.length === 1 && g.vectors[0].what === "scripture shard"'],
  ['vectors', 'g.log.some(l => JSON.stringify(l).includes("bearing"))'],
];

const port = Number(process.env.PLAY_PORT) || 4000 + Math.floor(Math.random() * 1000);
const url = process.env.PLAY_URL;
const srv = url ? null : spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
if (srv) await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
let ok = 0;
try {
  await p.goto((url ?? `http://localhost:${port}/`) + '?seed=1&still');
  await p.waitForFunction(() => window.thaw);
  for (const [cmd, check] of STEPS) {
    if (typeof cmd === 'number') await p.evaluate((s) => window.step(s), cmd);
    else await p.evaluate((c) => window.thaw.send(c), cmd);
    if (check) {
      const pass = await p.evaluate((c) => { const g = window.thaw.g; return !!eval(c); }, check);
      if (!pass) throw new Error(`step ${ok + 1} (${cmd}): expected ${check}`);
    }
    if (errs.length) throw new Error(`step ${ok + 1} (${cmd}): ${errs[0]}`);
    ok++;
  }
  console.log(`play: ${ok} steps ok`);
} catch (e) {
  console.error('play: ' + e.message);
  process.exitCode = 1;
} finally {
  await b.close();
  srv?.kill();
}
