// v6-look: the ground on floors 0 and 3, and two eyes (martyr scope, carrion eye) after a step, at 1280x720
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const port = 4000 + Math.floor(Math.random()*1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: '.', stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type()==='error' && errs.push(m.text()));
const tag = process.argv[2] || 'x';
const step = async (s) => { for (let k = 0; k < s * 20; k++) await p.evaluate(() => window.step(0.05)); };
for (const [eye, word, f] of [['martyr-scope', 'martyr', 0], ['martyr-scope', 'martyr', 3], ['carrion-eye', 'carrion', 2]]) {
  await p.goto(`http://localhost:${port}/?seed=1&still`);
  await p.waitForTimeout(800);
  await p.evaluate(([eye, word, f]) => { thaw.g.floor = f; thaw.g.player.inv.push({ kind: 'mod', mod: eye }); thaw.send('install ' + word); }, [eye, word, f]);
  await step(2);
  await p.evaluate(() => { thaw.g.player.x += Math.sin(thaw.g.player.dir) * 0.3; thaw.g.player.y -= Math.cos(thaw.g.player.dir) * 0.3; });
  await step(0.2);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `shots/${tag}-${word}-f${f}.png` });
}
console.log(errs.join('\n'));
await b.close(); srv.kill();
