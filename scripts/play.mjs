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
  // body slice: slot boards, the ledger, the servo gait on real arrow keys, setups, the clock
  [0, '["slot-board","slot-board","ledger","servo-gait","clock-of-hours","ember-cell"].forEach(m => g.player.inv.push({ kind: "mod", mod: m })) ?? true'],
  ['install slot board'], ['install slot board', 'g.player.slots === 5'],
  ['install ledger'], ['install ember'], ['install servo'], [2, 'document.querySelectorAll(".ledger-row button").length >= 2'],
  [0, 'document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })) && g.player.path.length === 1'],
  [1, 'g.player.y === 8.5'],
  ['remove stepper'], ['install clock'], [2, 'document.querySelector("canvas.clock") !== null'],
  ['save setup battle'], ['off clock'], ['setup battle', 'g.player.installed.find(i => i.mod === "clock-of-hours").on'],
  ['remove servo', 'g.player.inv.push({ kind: "mod", mod: "gyro-heart" })'], ['install gyro'], [2.5, 'g.player.dir === Math.PI'],
  [0, 'document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true }))'], [0.2], [0.4, 'g.player.y > 8.6'],
  [0, 'document.body.dispatchEvent(new KeyboardEvent("keyup", { key: "w", bubbles: true }))'], [0.2, 'g.player.move === null'],
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
