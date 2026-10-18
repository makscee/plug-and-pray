// Screenshots of the staged world scenes (?scene=world-*, seed 1, real clock): node scripts/world-look.mjs <outdir>
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const out = process.argv[2] || '.';
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
for (const s of ['map', 'printer', 'deep']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => errs.push(`${s}: ${e}`));
  await p.goto(`http://localhost:${port}/?seed=1&scene=world-${s}`);
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${out}/world-${s}.png` });
  await p.close();
}
console.log(errs.join('\n') || 'no page errors');
await b.close();
srv.kill();
