// A screenshot of the staged fight (?scene=fight, seed 1, real clock): click shoot, wait, shoot.
// node scripts/fight-look.mjs . out.png (after npm run build); prints hp, the foes left and the last lines.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const port = 4000 + Math.floor(Math.random()*1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: process.argv[2], stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://localhost:${port}/?seed=1&scene=fight`);
await p.waitForTimeout(1500);
await p.click('button[data-cmd=shoot]');
await p.waitForTimeout(1200);
await p.screenshot({ path: process.argv[3] });
console.log(await p.evaluate(() => JSON.stringify({ hp: thaw.g.player.hp, foes: thaw.g.ents.filter(e=>e.enemy).map(e=>e.enemy.type), log: thaw.g.log.slice(-6).map(l => l.map(s => typeof s === 'string' ? s : s.text).join('')) })));
console.log(errs.join('\n'));
await b.close(); srv.kill();
