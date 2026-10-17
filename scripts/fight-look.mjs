// A screenshot of a staged fight on seed 1: saint's lens, nail psalm and frost coat on, a seraph lamp,
// a mite and an ossuary walker in the start chamber, one shot fired. node scripts/fight-look.mjs out.png (after npm run build)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const port = 4000 + Math.floor(Math.random()*1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://localhost:${port}/?seed=1&still`);
await p.waitForTimeout(800);
await p.evaluate(() => {
  const g = thaw.g;
  g.ents = g.ents.filter(e => e.kind !== 'item');
  for (const m of ['saints-lens', 'nail-psalm', 'frost-coat']) g.player.inv.push({ kind: 'mod', mod: m });
  g.player.core = 8; g.player.slots = 4;
  thaw.send('install saint'); thaw.send('install nail'); thaw.send('install frost');
  window.step(3.2);
  g.player.dir = -Math.PI / 2; // west
  g.ents.push({ id: 9001, kind: 'enemy', x: 5.5, y: 8.5, enemy: { type: 'seraph', hp: 3, readyAt: 0, data: {} } });
  g.ents.push({ id: 9002, kind: 'enemy', x: 6.5, y: 6.5, enemy: { type: 'mite', hp: 2, readyAt: 0, data: {} } });
  g.ents.push({ id: 9003, kind: 'enemy', x: 6.5, y: 10.5, enemy: { type: 'walker', hp: 8, readyAt: 0, data: {} } });
  window.step(1.0);
  thaw.send('shoot');
  window.step(0.15);
});
await p.waitForTimeout(400);
await p.screenshot({ path: process.argv[2] });
console.log(await p.evaluate(() => JSON.stringify({ hp: thaw.g.player.hp, log: thaw.g.log.slice(-8).map(l => l.map(s => typeof s === 'string' ? s : s.text).join('')) })));
console.log(errs.join('\n'));
await b.close(); srv.kill();
