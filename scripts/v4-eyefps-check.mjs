// v4-eyefps: floor 1 seed 1, pick the eye up, then first person: W walks, mouse/QE turn, Space shoots
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
const st = () => p.evaluate(() => { const g = thaw.g, f = fpsTest.state(); return { x: +g.player.x.toFixed(2), y: +g.player.y.toFixed(2), dir: +g.player.dir.toFixed(3), on: f.on, view: document.body.dataset.view, lock: !!document.pointerLockElement, power: thaw.g.player.installed.filter(i=>i.on).map(i=>i.mod).join(' ') }; });
const step = async (s) => { for (let k = 0; k < s * 20; k++) await p.evaluate(() => window.step(0.05)); };
const out = {};
// walk to the eye and take it, as a player would (teleport next to it: the walk is not under test)
await p.evaluate(() => {
  const g = thaw.g;
  thaw.send('install all');
  for (let i = 0; i < 400 && !g.ents.some((e) => e.item?.mod === 'pinhole-eye'); i++) window.step(0.05);
  const e = g.ents.find((e) => e.item?.mod === 'pinhole-eye');
  if (e) { g.player.x = e.x; g.player.y = e.y; g.player.path = [[Math.floor(e.x), Math.floor(e.y)]]; }
  g.ents = g.ents.filter((x) => !x.enemy);
});
await step(0.3);
await p.evaluate(() => thaw.send('take pinhole eye'));
out.picked = await p.evaluate(() => thaw.g.player.inv.some((i) => i.mod === 'pinhole-eye'));
await p.evaluate(() => thaw.send('install pinhole eye'));
await step(2);
out.afterInstall = await st();
out.log = await p.evaluate(() => thaw.g.log.slice(-8).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')));
await p.screenshot({ path: 'v4-eyefps-1-first.png' });
// W held 1s
await p.mouse.click(640, 360);
await p.waitForTimeout(200);
out.lockAfterClick = (await st()).lock;
// face the longest open way (the landing spot faced a wall)
out.faced = await p.evaluate(() => {
  const g = thaw.g, P = g.player;
  const op = (x, y) => { x = Math.floor(x); y = Math.floor(y); const c = g.chunks.get(Math.floor(x / 16) + ',' + Math.floor(y / 16)); return !!c && c.cells[((y % 16) + 16) % 16 * 16 + ((x % 16) + 16) % 16] === 1; };
  let best = 0, bd = 0;
  for (let k = 0; k < 16; k++) { const d = (k * Math.PI) / 8; let r = 0; while (r < 10 && op(P.x + Math.sin(d) * r, P.y - Math.cos(d) * r)) r += 0.1; if (r > best) { best = r; bd = d; } }
  fpsTest.face(bd);
  return [bd, best];
});
await step(0.2);
await p.screenshot({ path: 'v4-eyefps-0-open.png' });
const a = await st();
await p.keyboard.down('w'); await step(1); await p.keyboard.up('w');
const bpos = await st();
out.walk = Math.hypot(bpos.x - a.x, bpos.y - a.y).toFixed(2);
// mouse move turns (pointer lock in headless: else the same hook the mouse calls)
const d0 = (await st()).dir;
await p.mouse.move(700, 360); await p.mouse.move(800, 360);
await p.waitForTimeout(100);
let d1 = (await st()).dir;
out.mouseTurn = d1 - d0;
if (!out.mouseTurn) { await p.evaluate(() => fpsTest.turn(0.4)); d1 = (await st()).dir; out.mouseTurnHook = d1 - d0; }
// Q/E turn
await p.keyboard.down('e'); await step(0.5); await p.keyboard.up('e');
const d2 = (await st()).dir; out.eTurn = +(d2 - d1).toFixed(3);
await p.keyboard.down('q'); await step(0.3); await p.keyboard.up('q');
out.qTurn = +((await st()).dir - d2).toFixed(3);
// a mite ahead: Space shoots it (warm the weapons; give an aimed one, as floor 1 kits do)
out.shot = await p.evaluate((bd) => {
  const g = thaw.g, P = g.player;
  P.dir = bd + Math.PI; // back the way it walked: open floor
  if (!P.inv.some((i) => i.mod === 'nail-psalm')) P.inv.push({ kind: 'mod', mod: 'nail-psalm' });
  P.core += 2; thaw.send('install nail psalm');
  for (let i = 0; i < 40; i++) window.step(0.05);
  for (const i of P.installed) i.data.readyAt = 0;
  const x = P.x + Math.sin(P.dir) * 2.5, y = P.y - Math.cos(P.dir) * 2.5;
  g.ents.push({ id: g.nextId++, kind: 'enemy', x, y, enemy: { type: 'mite', hp: 6, readyAt: 99, data: { noticed: true } } });
  window.__foe = g.ents[g.ents.length - 1];
  return { hp: window.__foe.enemy.hp };
}, out.faced[0]);
await p.keyboard.press('Space');
await step(0.1);
out.shotAfter = await p.evaluate(() => ({ hp: window.__foe.enemy?.hp, alive: thaw.g.ents.includes(window.__foe), shotAt: fpsTest.state().shotAt, t: thaw.g.t }));
await p.screenshot({ path: 'v4-eyefps-2-shot.png' });
out.final = await st();
await p.keyboard.press('Tab'); await step(0.3);
out.afterTab = await st();
await p.screenshot({ path: 'v4-eyefps-3-cursor.png' });
out.cost = await p.evaluate(() => backdropCost());
console.log(JSON.stringify(out, null, 1));
console.log(errs.join('\n'));
await b.close(); srv.kill();
