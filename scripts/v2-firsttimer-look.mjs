// v2-firsttimer: look.mjs with a query and a viewport: node scripts/v2-firsttimer-look.mjs . '?seed=1&still' '[cmds]' out.png [w] [h]
// a command "shot:name.png" screenshots mid-way; "log" prints the console's last lines
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: process.argv[2], stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: Number(process.argv[6] || 1280), height: Number(process.argv[7] || 800) } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
try {
  await p.goto(`http://localhost:${port}/${process.argv[3]}`);
  await p.waitForTimeout(800);
  for (const c of JSON.parse(process.argv[4] || '[]')) {
    if (typeof c === 'number') await p.evaluate((s) => window.step(s), c);
    else if (c.startsWith('js:')) console.log('js', JSON.stringify(await p.evaluate(c.slice(3))));
    else if (c.startsWith('wait:')) await p.waitForTimeout(Number(c.slice(5)));
    else if (c.startsWith('shot:')) await p.screenshot({ path: c.slice(5) });
    else if (c === 'log') console.log((await p.evaluate(() => thaw.g.log.slice(-6).map((l) => l.map((s) => (typeof s === 'string' ? s : `[${s.text}]`)).join('')))).join('\n'));
    else await p.evaluate((c) => window.thaw.send(c), c);
    await p.waitForTimeout(60);
  }
  await p.waitForTimeout(300);
  await p.screenshot({ path: process.argv[5] || 'look.png' });
} finally {
  console.log(errs.join('\n'));
  await b.close();
  srv.kill();
}
