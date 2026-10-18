// v6-pieces: a set piece in nearby, rare + unique loot glowing on the map and in first person
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: '.', stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`http://localhost:${port}/?seed=1&still`);
await p.waitForTimeout(800);
const step = async (s) => { for (let k = 0; k < s * 20; k++) await p.evaluate(() => window.step(0.05)); };
const out = await p.evaluate(() => {
  const g = thaw.g;
  thaw.send('install all');
  for (let i = 0; i < 600 && !g.ents.some((e) => e.data?.piece); i++) window.step(0.05);
  const pc = g.ents.find((e) => e.data?.piece);
  g.ents = g.ents.filter((x) => !x.enemy);
  if (!pc) return 'no piece';
  // stand next to it on open floor
  const op = (x, y) => { x = Math.floor(x); y = Math.floor(y); const c = g.chunks.get(Math.floor(x / 16) + ',' + Math.floor(y / 16)); return !!c && c.cells[((y % 16) + 16) % 16 * 16 + ((x % 16) + 16) % 16] === 1; };
  let at = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]]) if (op(pc.x + dx, pc.y + dy)) { at = [Math.floor(pc.x + dx) + 0.5, Math.floor(pc.y + dy) + 0.5]; break; }
  if (at) { g.player.x = at[0]; g.player.y = at[1]; g.player.path = [[Math.floor(at[0]), Math.floor(at[1])]]; }
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) g.seen.add(`${Math.floor(g.player.x) + x},${Math.floor(g.player.y) + y}`);
  // a rare and a unique find a few cells off, plus a common one
  const put = (dx, rarity) => { for (const dy of [0, 1, -1, 2, -2]) if (op(g.player.x + dx, g.player.y + dy)) return g.ents.push({ id: 90000 + dx * 10 + dy, kind: 'item', x: Math.floor(g.player.x + dx) + 0.5, y: Math.floor(g.player.y + dy) + 0.5, item: { kind: 'mod', mod: 'pinhole-eye', rarity } }); };
  put(3, 'rare'); put(-3, 'unique'); put(4, 'common');
  return pc.data.piece;
});
await step(0.5);
await p.screenshot({ path: 'v6-pieces-1-map.png' });
const near = await p.evaluate(() => document.querySelector('[data-win="near"], #near')?.innerText ?? [...document.querySelectorAll('.win')].map((w) => w.innerText).join('\n---\n'));
// first person: take an eye and look round
await p.evaluate(() => {
  const g = thaw.g;
  g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
  thaw.send('install pinhole eye');
});
await step(2);
for (const k of [0, 1]) {
  await p.evaluate((k) => { const g = thaw.g, e = g.ents.find((e) => e.id >= 90000 && e.item?.rarity === (k ? 'unique' : 'rare')); if (e) window.fpsTest?.face(Math.atan2(e.x - g.player.x, -(e.y - g.player.y))); }, k);
  await step(0.2);
  await p.screenshot({ path: `v6-pieces-2-fp${k}.png` });
}
console.log(JSON.stringify({ out, near, errs }, null, 1));
await b.close(); srv.kill();
