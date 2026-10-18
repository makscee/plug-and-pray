// npm run package: the submission package from the latest build (npm run package runs `npm run build` first).
// Five 1280x720 screenshots, each a short run typed like look.mjs (commands, numbers step the clock, 'js:'
// stages, 'wait:' waits real ms), the v2 run in five moments: the map-only wake, first sight, a floor-1 keeper,
// floor 3 through the reins, the ending with a real run's numbers; then dist/ zipped into submission/thaw.zip
// with index.html at its root for the itch.io HTML5 upload.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = 'submission';
// the stagings say "staged: ..." in the console; a screenshot shows the console as a player would see it
const CLEAN = "js:thaw.g.log.splice(0, thaw.g.log.length, ...thaw.g.log.filter((l) => !JSON.stringify(l).includes('staged'))), thaw.screen.con.shown = 1e9";
const POS = "log:[thaw.g.player.x, thaw.g.player.y, thaw.g.t, thaw.g.player.hp, thaw.g.player.installed.map(i=>i.mod).join(' ')]";
// the walk a real run made from (x0, y0) to (x1, y1), as the map remembers it: a shortest open way through the
// chunks made so far, and every cell within 2 of it seen (a teleport would leave the map blank behind you)
const WALKED = (x0, y0, x1, y1) => `js:(() => {
  const g = thaw.g, C = 16, at = (x, y) => { const c = g.chunks.get(Math.floor(x / C) + ',' + Math.floor(y / C)); return c ? c.cells[(y - Math.floor(y / C) * C) * C + (x - Math.floor(x / C) * C)] : 0; };
  const from = new Map([['${x0},${y0}', null]]), q = [[${x0}, ${y0}]];
  while (q.length) { const [x, y] = q.shift(); if (x === ${x1} && y === ${y1}) break;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const k = (x + dx) + ',' + (y + dy); if (!from.has(k) && at(x + dx, y + dy) === 1) { from.set(k, x + ',' + y); q.push([x + dx, y + dy]); } } }
  for (let k = '${x1},${y1}'; k; k = from.get(k)) { const [x, y] = k.split(',').map(Number); for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) g.seen.add((x + i) + ',' + (y + j)); }
})()`;
/** a kit as a run would have it by then: the staged one put away, these conjured and installed, warm */
const KIT = (...mods) => [`js:thaw.g.player.installed = []; thaw.g.player.inv = thaw.g.player.inv.filter((i) => i.kind !== 'mod')`, ...mods.flatMap((m) => [`conjure ${m}`, `install ${m.replace(/-/g, ' ').replace(/^saints /, "saint's ").replace(/^martyrs /, "martyr's ")}`]), 'js:for (const i of thaw.g.player.installed) i.readyAt = thaw.g.t - 1'];
const BOSSLOG = "log:thaw.g.ents.filter(e=>e.enemy?.data.boss).map(e=>[e.enemy.type, Math.round(e.x), Math.round(e.y), e.enemy.hp])";
/** the big view turned to the keeper */
const FACE = "js:{ const p = thaw.g.player, b = thaw.g.ents.find((e) => e.enemy?.data.boss); if (b) fpsTest.face(Math.atan2(b.x - p.x, -(b.y - p.y))) }";
// half a minute into the fight: the room's other foes put down, the keeper at 62% (still its first phase), you a few hits down
const MIDFIGHT = "js:{ const g = thaw.g, p = g.player; g.ents = g.ents.filter((e) => !e.enemy || e.enemy.data.boss || Math.hypot(e.x - p.x, e.y - p.y) > 16); for (const e of g.ents) if (e.enemy?.data.boss) e.enemy.hp = Math.round(e.enemy.data.maxHp * 0.62); p.hp = Math.round(p.maxHp * 0.75) }";
const INTO = "js:{ const p = thaw.g.player; p.x += Math.round(Math.sin(p.dir) * 3); p.y -= Math.round(Math.cos(p.dir) * 3) }";
const FPS3 = [1, CLEAN, 'js:Object.assign(thaw.g.player, { slots: 8, core: 14, flesh: 6, maxHp: 16, hp: 16 })', ...KIT('pilgrim-scope', 'saints-reins', 'gyro-heart', 'bone-lance', 'nail-psalm', 'halo', 'frost-coat', 'map-spool'), 1, 'go in', INTO, 0.3, MIDFIGHT, FACE, 'js:fpsTest.big(true)', 'js:document.querySelector(".floor-banner")?.remove()', 0.5, POS, BOSSLOG];
// in play the reins hold the mouse (Playwright cannot lock the pointer): no "click to take the mouse"
const LOCKED = `js:document.head.insertAdjacentHTML('beforeend', '<style>.big-lock { display: none !important }</style>')`;
/** n shots of the big view's weapon, a quarter second apart, kept on the keeper */
const FIRE = (n) => Array.from({ length: n }, () => [FACE, 'js:fpsTest.fire()', 0.25]).flat();
// the ending of a real run: what the sim's careful player (scripts/bot.mjs 1, main 2f18d5c) ended seed 1 with, set on the heart's
// floor: its time, its cells out, its modules found and foes put down, its last loadout and what the heart drank
const RUN1 = {
  t: 1361, far: 189, kills: 208, slots: 9, core: 15, flesh: 22, maxHp: 32, hp: 18.5,
  mods: ['thread-bell', 'stepper-relay', 'map-spool', 'spark-finger', 'choir-bell', 'frost-coat', 'vitus-chain', 'ember-cell', 'ledger', 'pinhole-eye', 'card-reader', 'lead-lung', 'censer-flail', 'nail-psalm', 'rivet-sling', 'reliquary-saw', 'ember-spit', 'suture-moth', 'halo', 'saints-reins', 'pilgrim-scope', 'bone-lance', 'heart-shard', 'rime-hood', 'martyrs-reins', 'rime-hood', 'heart-shard', 'heat-lance', 'lodestone'],
  installed: ['choir-bell', 'stepper-relay', 'reliquary-saw', 'pilgrim-scope', 'ember-spit', 'martyrs-reins', 'nail-psalm', 'heat-lance'],
  res: { bone: 85, glass: 106, copper: 2, ichor: 38 },
};
// the heart's keeper at its last sliver, then put down by the run's own weapon (its blow is the 208th): the game itself ends the run
const ENDING = [`js:Object.assign(thaw.g.player, { slots: ${RUN1.slots}, core: ${RUN1.core}, flesh: ${RUN1.flesh} })`, ...KIT(...RUN1.installed), 1, 'go in', INTO, 0.3, MIDFIGHT, FACE, 'js:fpsTest.big(true)', LOCKED,
  `js:{ const g = thaw.g, r = ${JSON.stringify(RUN1)}; g.player.inv = Object.entries(r.res).map(([res, n]) => ({ kind: 'res', res, n })); Object.assign(g.stats, { far: r.far, kills: r.kills - 1, mods: r.mods }); Object.assign(g.player, { maxHp: r.maxHp, hp: r.hp }); g.t = r.t; document.querySelector('.floor-banner')?.remove(); for (const e of g.ents) if (e.enemy?.data.boss) e.enemy.hp = 1 }`,
  ...FIRE(6), BOSSLOG, 'log:thaw.g.ended'];
/** file, query, steps; the steps after the page loads, as look.mjs takes them */
const SHOTS = [
  // the wake: map only, the floor-1 kit picked (choir bell, frost coat), a few legs walked out; the thread bell sweeps
  ['1-wake.png', '?seed=1&still', ['pick 1', 'pick 1', 'scrap', 'install all', 1, 'go e 5', 4, 'go n 2', 5, 'go e 6', 5, POS]],
  // first sight: the same run at the pinhole on the way to the keeper (v3: open floor, firstEye(1) = 8.5,-8.5), the eye in
  ['2-sight.png', '?seed=1&still', ['pick 1', 'pick 1', 'scrap', 'install all', 1, 'go e 5', 4, 'js:thaw.g.player.x = 8.5; thaw.g.player.y = -5.5', 1.5, 'go n 3', 4, 'take', 1, 'js:Object.assign(thaw.g.player, { slots: 7, core: 7 })', 'remove spark finger', 'install pinhole eye', 1.5, 'wait:1600', POS]],
  // floor 1's keeper (seed 5 rolls the bell): a floor-1 kit through the door, the room up as a map, a few blows traded
  ['3-keeper.png', '?seed=5&scene=boss&f=0&still', [1, CLEAN, 'js:Object.assign(thaw.g.player, { slots: 7, core: 7 })', ...KIT('pinhole-eye', 'stepper-relay', 'map-spool', 'choir-bell', 'censer-flail', 'frost-coat'), 1.5, 'go s 1', 1, 'go in', 1.5, 'go s 2', 2, 'go s 1', 1, 'go s 1', 1, 'attack', 3, 'attack', 3, POS, BOSSLOG, 'wait:600']],
  // floor 3 through the reins (seed 1 rolls the hollow saint): its ring of bolts in the air as it gathers a saltire
  ['4-reins.png', '?seed=1&scene=boss&f=2&still', [...FPS3, LOCKED, ...FIRE(15), POS, BOSSLOG, 'wait:400']],
  ['5-thaw.png', '?seed=1&scene=boss&f=4&still', [1, CLEAN, ...ENDING, 1.2, 0.8, 4, 4, 2, POS]],
];

if (!existsSync('dist/index.html')) throw new Error('package: no dist/, run npm run build first');
mkdirSync(OUT, { recursive: true });

const port = 4000 + Math.floor(Math.random() * 1000);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
process.on('exit', () => srv.kill());
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;

// `node scripts/package.mjs 3 4` retakes only those shots (no zip); a 'log:' step prints what it evaluates
const only = process.argv.slice(2).map(Number);
for (const [file, query, steps] of SHOTS.filter((_, k) => !only.length || only.includes(k + 1))) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://localhost:${port}/${query}`);
  await page.waitForFunction(() => window.thaw);
  await page.evaluate(() => document.fonts.ready);
  await wait(800);
  const still = query.includes('still');
  for (const s of steps) {
    // a number steps the clock on ?still runs and waits that long on real-clock ones
    if (typeof s === 'number') await (still ? page.evaluate((x) => window.step(x), s) : wait(s * 1000));
    else if (s.startsWith('js:')) await page.evaluate(s.slice(3));
    else if (s.startsWith('wait:')) await wait(Number(s.slice(5)));
    else if (s.startsWith('log:')) console.log(`  ${file}: ${JSON.stringify(await page.evaluate(s.slice(4)))}`);
    else if (s.startsWith('click:')) await page.click(s.slice(6));
    else await page.evaluate((c) => window.thaw.send(c), s);
    await wait(60);
  }
  await wait(400);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log(`package: ${OUT}/${file}${errs.length ? '  errors: ' + errs.join('; ') : ''}`);
  if (errs.length) failed = true;
  await page.close();
}
await browser.close();
if (only.length) process.exit(failed ? 1 : 0);

rmSync(`${OUT}/thaw.zip`, { force: true });
execFileSync('zip', ['-qrX', `../${OUT}/thaw.zip`, '.'], { cwd: 'dist', stdio: 'inherit' });
console.log(`package: ${OUT}/thaw.zip`);
process.exit(failed ? 1 : 0);
