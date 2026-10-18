// v5-fx-attack: your attacks seen, on the map (no eye) and in first person, 1280x720
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
const step = async (s) => { for (let k = 0; k < Math.round(s / 0.05); k++) await p.evaluate(() => window.step(0.05)); };
const give = (mods) => p.evaluate((mods) => {
  const g = thaw.g;
  g.player.maxPower = 20; g.player.slots = 20;
  for (const m of mods) { g.player.inv.push({ kind: 'mod', mod: m }); thaw.send('install ' + m.replace(/-/g, ' ')); }
  for (const i of g.player.installed) if (!/thread|stepper/.test(i.mod)) { i.on = true; i.readyAt = 0; } else i.on = false;
  return g.player.installed.filter((i) => i.on).map((i) => i.mod).join(' ');
}, mods);
const foe = (dx, dy, type = 'walker') => p.evaluate(([dx, dy, type]) => { const g = thaw.g; g.ents = g.ents.filter((e) => !e.enemy); for (const [a, b] of [[dx, dy]]) g.ents.push({ id: g.nextId++, kind: 'enemy', x: g.player.x + a, y: g.player.y + b, enemy: { type, hp: 99, readyAt: 99, data: { noticed: true } } }); return true; }, [dx, dy, type]);
const out = {};
// find a room: put you in the open middle of the start
await p.evaluate(() => { thaw.send('install all'); for (let i = 0; i < 60; i++) window.step(0.05); });
out.mods = await give(['nail-psalm', 'choir-bell', 'spark-finger']);
await step(1.5);
// map view: a nail psalm shot in flight, then the bell's ring
out.at = await p.evaluate(() => [thaw.g.player.x, thaw.g.player.y, thaw.g.player.dir]);
await foe(0, -4, 'walker');
await p.evaluate(() => { thaw.g.player.dir = 0; thaw.send('shoot'); });
await step(0.1);
await p.screenshot({ path: 'v5-fx-1-map-shot.png' });
await foe(0.9, -0.9, 'walker');
for (let k = 0; k < 40; k++) { await step(0.05); if (await p.evaluate(() => fxTest.live(thaw.g).some((k) => k === "ring" || k === "zap"))) break; }
out.melee = await p.evaluate(() => fxTest.live(thaw.g));
await step(0.1);
await p.screenshot({ path: 'v5-fx-2-map-melee.png' });
out.log = await p.evaluate(() => thaw.g.log.slice(-6).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')));
// first person: the pinhole eye
out.eye = await p.evaluate(() => { const g = thaw.g; g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' }); thaw.send('install pinhole eye'); for (const i of g.player.installed) if (i.mod === 'pinhole-eye') { i.on = true; i.readyAt = 0; } return g.player.installed.map((i) => i.mod + (i.on ? '' : '(off)')).join(' '); });
await step(2);
await foe(0, -3.5, 'walker');
await p.evaluate(() => { thaw.g.player.dir = 0; fpsTest.fire?.(); });
out.fpsFx = await p.evaluate(() => fxTest.live(thaw.g));
await step(0.05);
await p.screenshot({ path: 'v5-fx-3-fps-shot.png' });
await foe(0, -1.1, 'walker');
await p.evaluate(() => { thaw.g.player.dir = 0; for (const i of thaw.g.player.installed) i.data.readyAt = 0; fpsTest.lunge?.(); });
await step(0.1);
await p.screenshot({ path: 'v5-fx-4-fps-melee.png' });
out.view = await p.evaluate(() => document.body.dataset.view + ' big=' + document.body.classList.contains('big'));
console.log(JSON.stringify(out, null, 1));
console.log(errs.join('\n'));
await b.close();
srv.kill();
