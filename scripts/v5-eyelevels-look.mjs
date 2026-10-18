// v5-eyelevels: the same spot through a pinhole eye at level I, II (and mid focus pull), III, at 1280x720
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const port = 4000 + Math.floor(Math.random()*1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: '.', stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type()==='error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?seed=1&still`);
await p.waitForTimeout(800);
const step = async (s) => { for (let k = 0; k < s * 20; k++) await p.evaluate(() => window.step(0.05)); };
await p.evaluate(() => { thaw.g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' }); thaw.send('install pinhole'); });
await step(3);
await p.waitForTimeout(300);
await p.screenshot({ path: 'shots/eye-1.png' });
for (const lv of [2, 3]) {
  await p.evaluate((lv) => { thaw.g.player.installed.find((i) => i.mod === 'pinhole-eye').level = lv; }, lv);
  await step(0.3);
  await p.waitForTimeout(200);
  await p.screenshot({ path: `shots/eye-${lv}-focus.png` });
  await step(1.5);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `shots/eye-${lv}.png` });
}
console.log(await p.evaluate(() => thaw.g.log?.slice?.(-4)?.join?.('\n') ?? ''));
console.log(errs.join('\n'));
await b.close(); srv.kill();
