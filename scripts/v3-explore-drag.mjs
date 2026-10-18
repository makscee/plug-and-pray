// v3-explore: the console window must stop following the cursor once its drag ended, however it ended
// (a release lost outside the page, a right press). `node scripts/v3-explore-drag.mjs . [out.png]` (needs dist)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: process.argv[2], stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://localhost:${port}/?seed=1&still`);
await p.waitForTimeout(1200);
const pos = () => p.evaluate(() => { const r = document.querySelector('.win[data-win="console"]').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
const title = async () => { const r = await p.evaluate(() => { const r = document.querySelector('.win[data-win="console"] .title').getBoundingClientRect(); return [r.left + 60, r.top + r.height / 2]; }); return r; };
const out = {};
// 1: a normal drag moves it, and after the release it stays put
let [x, y] = await title();
await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 80, y - 120, { steps: 5 }); await p.mouse.up();
out.dragged = await pos();
await p.mouse.move(900, 100, { steps: 5 });
out.afterUp = await pos();
// 2: the release is lost (outside the page): the next moves come with no button down
[x, y] = await title();
await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 20, y + 20, { steps: 3 });
const lost0 = await pos();
await p.evaluate(([x, y]) => { const t = document.querySelector('.win[data-win="console"] .title'); for (let k = 1; k <= 5; k++) t.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', clientX: x + k * 60, clientY: y + k * 20, buttons: 0 })); }, [x, y]);
out.lostUpMoved = JSON.stringify(await pos()) !== JSON.stringify(lost0);
await p.mouse.up();
// 3: a right press on the title never starts a drag
[x, y] = await title();
const r0 = await pos();
await p.mouse.move(x, y); await p.mouse.down({ button: 'right' }); await p.mouse.move(x + 200, y - 100, { steps: 4 }); await p.mouse.up({ button: 'right' });
out.rightMoved = JSON.stringify(await pos()) !== JSON.stringify(r0);
// 4: the window loses focus mid-drag: the drag ends
[x, y] = await title();
await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 10, y + 10, { steps: 2 });
await p.evaluate(() => dispatchEvent(new Event('blur')));
const b0 = await pos();
await p.mouse.move(x + 300, y - 200, { steps: 4 });
out.blurMoved = JSON.stringify(await pos()) !== JSON.stringify(b0);
await p.mouse.up();
await p.screenshot({ path: process.argv[3] || 'v3-explore-drag.png' });
console.log(JSON.stringify(out));
await b.close(); srv.kill();
