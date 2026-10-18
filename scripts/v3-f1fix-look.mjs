// v3-f1fix: kit tile card below its tile, a pinned card with a hover over another item, T brings the console home, the eye swap, at 1280×720
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const dir = process.argv[2] || '.';
const out = process.argv[3] || '.';
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: dir, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?seed=81&still`);
await p.waitForTimeout(800);
const send = (c) => p.evaluate((c) => window.thaw.send(c), c);
const step = (s) => p.evaluate((s) => window.step(s), s);
const rect = (sel) => p.evaluate((s) => { const c = document.querySelector(s); if (!c || c.hidden) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), pinned: c.classList.contains('pinned'), t: c.innerText.split('\n')[0] }; }, sel);
const res = {};
for (const c of ['install map spool', 'install stepper relay', 'install spark finger', 'conjure nail psalm', 'conjure ember iris', 'conjure choir bell']) await send(c);
await step(3);
await p.mouse.click(640, 360);
await step(0.5);
// pin a bag item: the detail panel opens; the card sits beside the window, clear of its buttons
await (await p.$('.panel-inv .cell[data-mod="nail-psalm"]')).click();
await p.waitForTimeout(150);
res.pin = await rect('.item-card');
await p.mouse.move(640, 250);
await p.waitForTimeout(150);
res.pinAfterMove = await rect('.item-card');
await (await p.$('.panel-inv .cell[data-mod="nail-psalm"]')).hover();
res.inv = await rect('.panel-inv');
res.btns = await rect('.panel-inv .btns');
await p.screenshot({ path: `${out}/f1-pin.png` });
// hover another item while pinned: its card shows; leave: the pin is back
await (await p.$('.panel-inv .cell[data-mod="ember-iris"]')).hover();
await p.waitForTimeout(150);
res.hoverWhilePinned = await rect('.item-card');
await p.screenshot({ path: `${out}/f1-hover-pinned.png` });
await p.mouse.move(640, 250);
await p.waitForTimeout(150);
res.back = await rect('.item-card');
await p.mouse.click(640, 250);
// T after the console was dragged right
await p.evaluate(() => { const c = document.querySelector('.win-console'); c.dataset.moved = '1'; c.style.left = '800px'; c.style.top = '54px'; });
await p.waitForTimeout(100);
res.conDragged = await rect('.win-console');
await p.keyboard.press('t');
await p.waitForTimeout(300);
res.conTidy = await rect('.win-console');
res.mods = await rect('.panel-modules');
await p.screenshot({ path: `${out}/f1-tidy.png` });
// the kit picker: a tile's card below or above it
await p.evaluate(() => { const g = thaw.g; const e = g.ents.find((e) => e.kind === 'prop' && e.data?.cache === 1); if (e) { g.player.x = e.x + 1.5; g.player.y = e.y + 0.5; } });
await step(1);
await p.waitForTimeout(300);
await p.mouse.click(640, 30);
const kts = await p.$$('.kit-tile:not(.kit-taken)');
if (kts.length > 1) { await kts[1].hover(); await p.waitForTimeout(150); }
res.kitCard = await rect('.item-card');
res.kitTiles = await p.evaluate(() => [...document.querySelectorAll('.kit-tile')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }));
await p.screenshot({ path: `${out}/f1-kit.png` });
console.log(JSON.stringify(res));
console.log('errors:', errs.join('\n'));
await b.close();
srv.kill();
