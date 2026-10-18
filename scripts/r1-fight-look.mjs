// r1-fight: many screenshots in one page. node scripts/r1-fight-look.mjs <dir> <W> <H> <outdir> <scenes.json>
// scenes: [{ name, cmds: [...] }] where a cmd is a console command, a number (seconds stepped), 'js:...', or 'shot'
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const [dir, W, H, out, file] = process.argv.slice(2);
import { readFileSync } from 'fs';
const scenes = JSON.parse(readFileSync(file, 'utf8'));
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: dir, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const sc of scenes) {
  const p = await b.newPage({ viewport: { width: Number(W), height: Number(H) } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`http://localhost:${port}/?seed=${sc.seed ?? 1}&still`);
  await p.waitForTimeout(800);
  let k = 0;
  for (const c of sc.cmds) {
    if (typeof c === 'number') await p.evaluate((s) => window.step(s), c);
    else if (c === 'shot') await p.screenshot({ path: `${out}/${sc.name}-${k++}.png` });
    else if (c.startsWith('js:')) console.log(sc.name, JSON.stringify(await p.evaluate(c.slice(3))));
    else if (c.startsWith('key:')) await p.keyboard.press(c.slice(4));
    else if (c.startsWith('wait:')) await p.waitForTimeout(Number(c.slice(5)));
    else await p.evaluate((c) => window.thaw.send(c), c);
    await p.waitForTimeout(60);
  }
  if (errs.length) console.log(sc.name, 'ERR', errs.join('\n'));
  await p.close();
}
await b.close();
srv.kill();
