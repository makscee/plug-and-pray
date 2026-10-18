// v2-variety screenshots: node scripts/v2-variety-shots.mjs <dir> <out-dir> <w>x<h> '<json list of [name, query, cmds]>'
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const [dir, out, size, list] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: dir, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, query, cmds] of JSON.parse(list)) {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(`http://localhost:${port}/?${query}`);
  await p.waitForTimeout(800);
  for (const c of cmds) {
    if (typeof c === 'number') await p.evaluate((s) => window.step(s), c);
    else if (c.startsWith('js:')) console.log(name, 'js ->', JSON.stringify(await p.evaluate(c.slice(3))));
    else if (c.startsWith('click:')) await p.click(c.slice(6));
    else if (c.startsWith('wait:')) await p.waitForTimeout(Number(c.slice(5)));
    else await p.evaluate((c) => window.thaw.send(c), c);
    await p.waitForTimeout(60);
  }
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(name, errs.length ? 'ERRORS ' + errs.join(' | ') : 'ok');
  await p.close();
}
await b.close();
srv.kill();
