// v3 cards: hover, pin, click-away, Esc, and a kit tile, at 1280×720
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const dir = process.argv[2] || '.';
const out = process.argv[3] || 'shots';
const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: dir, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?seed=3&still`);
await p.waitForTimeout(800);
const send = (c) => p.evaluate((c) => window.thaw.send(c), c);
const step = (s) => p.evaluate((s) => window.step(s), s);
const res = {};
const vis = () => p.evaluate(() => { const c = document.querySelector('.item-card'); if (!c || c.hidden) return null; const r = c.getBoundingClientRect(); return { pinned: c.classList.contains('pinned'), text: c.innerText, x: r.left, y: r.top, r: r.right, b: r.bottom }; });
for (const c of ['install map spool', 'install stepper relay', 'install spark finger', 'conjure nail psalm', 'conjure ember iris', 'conjure choir bell', 'conjure bone lance']) await send(c);
await step(3);
await p.mouse.click(640, 360); // start
await step(0.5);
// hover a bag tile
const tile = await p.$('.panel-inv .cell[data-mod="nail-psalm"]');
await tile.hover();
await p.waitForTimeout(150);
res.hover = await vis();
await p.screenshot({ path: `${out}/hover.png` });
// leave: it goes
await p.mouse.move(400, 300);
await p.waitForTimeout(150);
res.afterLeave = await vis();
// click an installed module: it pins; moving away keeps it
const mt = await p.$('.panel-modules .cell[data-mod="spark-finger"]');
await mt.click();
await p.waitForTimeout(100);
await p.mouse.move(300, 500);
await step(1);
await p.waitForTimeout(150);
res.pinned = await vis();
await p.screenshot({ path: `${out}/pinned.png` });
// click away closes
await p.mouse.click(300, 500);
await p.waitForTimeout(100);
res.afterClickAway = await vis();
// pin again, Esc closes
await (await p.$('.panel-inv .cell[data-mod="ember-iris"]')).click();
await p.waitForTimeout(100);
res.pinned2 = !!(await vis())?.pinned;
await p.keyboard.press('Escape');
await p.waitForTimeout(100);
res.afterEsc = await vis();
// a module window's does line
res.windowDoes = await p.evaluate(() => [...document.querySelectorAll('.win .does')].map((e) => e.textContent));
await p.screenshot({ path: `${out}/windows.png` });
// the cradle's kit cache: stand by it
await p.evaluate(() => { const g = thaw.g; const e = g.ents.find((e) => e.kind === 'prop' && e.data?.cache === 1); if (e) { g.player.x = e.x + 1.5; g.player.y = e.y + 0.5; } });
await step(1);
await p.waitForTimeout(300);
res.kit = await p.evaluate(() => !!document.querySelector('.kit-card'));
const kt = await p.$('.kit-tile:not(.kit-taken)');
if (kt) { await kt.hover(); await p.waitForTimeout(150); await kt.click({ position: { x: 20, y: 20 } }); await p.waitForTimeout(150); }
res.kitCard = await vis();
await p.screenshot({ path: `${out}/kit.png` });
// a shop row in nearby
await p.evaluate(() => { document.querySelector('.kit-later')?.click(); const g = thaw.g; g.ents.push({ id: 9998, kind: 'printer', x: g.player.x + 0.6, y: g.player.y, data: { far: 0, shop: true } }); });
await step(0.5);
await p.evaluate(() => { const n = document.querySelector('.panel-near'); if (n) { n.dataset.moved = '1'; n.style.top = '380px'; n.style.left = '1000px'; n.style.zIndex = '9000'; } });
const sr = await p.$$('.panel-near .row');
const shopRow = sr.length ? sr[sr.length - 1] : null;
for (const r of sr) if (await r.evaluate((e) => !!e.dataset.card)) { await r.hover({ position: { x: 30, y: 8 } }); break; }
await p.waitForTimeout(150);
res.shop = await vis();
await p.screenshot({ path: `${out}/shop.png` });
console.log(JSON.stringify(res, null, 1));
console.log('errors:', errs.join('\n'));
await b.close();
srv.kill();
