import { chromium } from 'playwright';
import { spawn } from 'child_process';
const port = 4000 + Math.floor(Math.random()*1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: process.argv[2], stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type()==='error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?seed=1&still`);
await p.waitForTimeout(800);
const cmds = JSON.parse(process.argv[3] || '[]');
for (const c of cmds) {
  if (typeof c === 'number') await p.evaluate(s => window.step(s), c);
  else if (c.startsWith('js:')) await p.evaluate(`{ const g = thaw.g; ${c.slice(3)} }`); // setup, e.g. js:g.player.inv.push(...)
  else await p.evaluate(c => window.thaw.send(c), c);
  await p.waitForTimeout(50);
}
await p.waitForTimeout(300);
await p.screenshot({ path: process.argv[4] || '/tmp/claude-501/look.png' });
console.log(JSON.stringify(await p.evaluate(() => ({ x: thaw.g.player.x, y: thaw.g.player.y, hp: thaw.g.player.hp, inst: thaw.g.player.installed.length }))));
console.log(errs.join('\n'));
await b.close(); srv.kill();
