// v2-view driver: node scripts/v2-view-look.mjs '<query>' '[cmds, {"shot":"name"}]' outdir
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const port = 4000 + Math.floor(Math.random()*1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type()==='error' && errs.push(m.text()));
const q = process.argv[2] || 'seed=1&still';
await p.goto(`http://localhost:${port}/?${q}`);
await p.waitForTimeout(800);
const cmds = JSON.parse(process.argv[3] || '[]');
const out = process.argv[4] || '/tmp/claude-501/pt/v2-view';
for (const c of cmds) {
  if (typeof c === 'number') await p.evaluate(s => window.step(s), c);
  else if (typeof c === 'object' && c.shot) { await p.waitForTimeout(200); await p.screenshot({ path: `${out}/${c.shot}.png` }); }
  else if (typeof c === 'object' && c.click) await p.mouse.click(c.click[0], c.click[1]);
  else if (typeof c === 'object' && c.key) await p.keyboard.press(c.key);
  else if (typeof c === 'object' && c.wait) await p.waitForTimeout(c.wait);
  else if (c.startsWith('js:')) console.log(JSON.stringify(await p.evaluate(c.slice(3))));
  else await p.evaluate(c => window.thaw.send(c), c);
  await p.waitForTimeout(50);
}
console.log(errs.join('\n'));
await b.close(); srv.kill();
