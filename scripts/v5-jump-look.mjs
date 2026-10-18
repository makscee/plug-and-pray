// v5-jump: one screenshot per jump link, live clock, 1280x720 (node scripts/v5-jump-look.mjs [names...])
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
mkdirSync('shots', { recursive: true });
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: '.', stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['f1-start', 'f1-reliquary', 'f1-eye', 'f1-fps', 'f1-keeper', 'f2-start', 'f2-keeper', 'f3-start', 'f3-reins', 'f3-keeper', 'f4-start', 'f4-keeper', 'heart', 'ending', 'eye-levels', 'printer', 'foes', 'weapons'];
for (const n of names) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`http://localhost:${port}/?seed=1&scene=jump&at=${n}`);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `shots/jump-${n}.png` });
  const st = await p.evaluate(() => { const g = thaw.g; return { f: g.floor, hp: g.player.hp, ended: g.ended, inst: g.player.installed.map((i) => i.mod + (i.level ? i.level : '')).join(','), log: g.log.slice(-3).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join(' | ') }; });
  console.log(n, JSON.stringify(st), errs.join(' ; '));
  await p.close();
}
await b.close();
srv.kill();
