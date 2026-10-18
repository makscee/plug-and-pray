// v2-last-fight screenshots: the door card's "risky" and "ready" verdicts with the floor-1 kit at 12 and 30 hp (seed 5: the bell),
// on a vite dev server. node scripts/v2-last-fight-look.mjs <outdir> [w h]
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const out = process.argv[2] || '.';
const [W, H] = [Number(process.argv[3]) || 1280, Number(process.argv[4]) || 800];
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: '.', stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 4000));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
async function scene(name, fn) {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => errs.push(name + ': ' + String(e)));
  await p.goto(`http://localhost:${port}/?seed=5&still`);
  await p.waitForTimeout(2500);
  await p.evaluate(() => { thaw.send('install all'); window.step(3); });
  await p.evaluate(fn);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/lastfight-${name}-${W}x${H}.png` });
  const log = await p.evaluate(() => thaw.g.log.slice(-8).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n'));
  console.log(`--- ${name}\n${log}`);
  await p.close();
}
const door = async (hp) => {
  const grid = await import('/src/core/grid.ts');
  const floors = await import('/src/world/floors.ts');
  const door = await import('/src/tune/door.ts');
  const { LOADOUTS } = await import('/src/fight/bosses.ts');
  const g = thaw.g;
  const [cx, cy] = floors.stairsChunk(g.seed, 0);
  grid.chunk(g, cx, cy);
  const d = door.doorOf(g);
  const k = LOADOUTS[0];
  g.player.installed = k.mods.map((mod) => ({ uid: g.nextId++, mod, on: true, readyAt: 0, data: {}, ...(k.rolls?.[mod] ? { roll: { ...k.rolls[mod] } } : {}) }));
  g.player.slots = Math.max(g.player.slots, 8);
  g.player.core = Math.max(g.player.core, k.core);
  g.player.flesh = hp - 10;
  g.player.maxHp = g.player.hp = hp;
  [g.player.x, g.player.y] = [d.x, d.y];
  window.step(1);
};
async function sceneArg(name, hp) {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => errs.push(name + ': ' + String(e)));
  await p.goto(`http://localhost:${port}/?seed=5&still`);
  await p.waitForTimeout(2500);
  await p.evaluate(() => { thaw.send('install all'); window.step(3); });
  await p.evaluate(door, hp);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/lastfight-${name}-${W}x${H}.png` });
  console.log(`--- ${name}\n` + (await p.evaluate(() => thaw.g.log.slice(-4).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n'))));
  await p.close();
}
await sceneArg('risky', 12);
await sceneArg('ready', 30);
console.log(errs.join('\n'));
await b.close();
srv.kill();
