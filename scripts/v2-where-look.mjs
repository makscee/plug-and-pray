// v2-where screenshots: stages the door card's swap link, `go in` at the eye niche and the shoot reasons
// on a vite dev server (so src modules can be imported in the page). node scripts/v2-where-look.mjs <outdir> [w h]
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
  await p.goto(`http://localhost:${port}/?seed=1&still`);
  await p.waitForTimeout(2500);
  await p.evaluate(() => { thaw.send('install all'); window.step(3); });
  await p.evaluate(fn);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/where-${name}-${W}.png` });
  const log = await p.evaluate(() => thaw.g.log.slice(-8).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n'));
  console.log(`--- ${name}\n${log}`);
  await p.close();
}
await scene('door', async () => {
  const grid = await import('/src/core/grid.ts');
  const floors = await import('/src/world/floors.ts');
  const door = await import('/src/tune/door.ts');
  const g = thaw.g;
  const [cx, cy] = floors.stairsChunk(g.seed, 0);
  grid.chunk(g, cx, cy);
  const d = door.doorOf(g);
  g.player.inv = g.player.inv.filter((i) => i.kind !== 'mod');
  g.player.inv.push({ kind: 'mod', mod: 'frost-coat' });
  const used = g.player.installed.length;
  g.player.slots = Math.max(used, 3);
  [g.player.x, g.player.y] = [d.x, d.y];
  window.step(1);
});
await scene('eyeniche', async () => {
  const sec = await import('/src/world/secrets.ts');
  const g = thaw.g;
  // chunks are made as you go: walk the map out toward the eye until its niche exists
  const { eyeChunk } = await import('/src/world/spawn.ts');
  const grid = await import('/src/core/grid.ts');
  const [ex, ey] = eyeChunk(g.seed);
  grid.chunk(g, ex, ey);
  const s = sec.sealedEye(g);
  [g.player.x, g.player.y] = [s.x + s.fx + 0.5, s.y + s.fy + 0.5];
  window.step(0.5);
  thaw.send('go in');
  window.step(0.3);
});
await scene('shoot', async () => {
  const game = await import('/src/core/game.ts');
  const g = thaw.g;
  g.player.installed.push({ uid: g.nextId++, mod: 'nail-psalm', on: true, readyAt: 0, data: {} });
  g.player.core = 9;
  window.step(2);
  const p = g.player;
  // a foe behind you, out of the eye's view, on open floor
  const grid = await import('/src/core/grid.ts');
  const fx = Math.sin(p.dir), fy = -Math.cos(p.dir);
  let at = null;
  for (let r = 2; r < 5 && !at; r++) if (grid.open(g, p.x - fx * r, p.y - fy * r)) at = [p.x - fx * r, p.y - fy * r];
  if (at) game.spawnEnemy(g, 'mite', at[0], at[1]);
  thaw.send('shoot');
  window.step(1.5);
});
console.log(errs.join('\n'));
await b.close();
srv.kill();
