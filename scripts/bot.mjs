// A typed run to the Thaw Engine (#1328): a headless browser plays ?seed=N&still by console commands
// only (take, install, remove, read card, go, crawl, listen), no conjure and no state edits. It picks
// its way over the cells the game has generated so far (what a player learns from eyes, listen and
// the map spool) and goes: eye, stepper, spark finger, card reader, cards, the three shards, the
// Engine. It rests when hurt and steps out of a seraph's line. Prints a timeline; exits 0 on 'thaw'.
//   npm run build && node scripts/bot.mjs 1        (seed, then a game-time limit in s, default 2400)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const seed = process.argv[2] || '1', LIMIT = Number(process.argv[3] || 2400);
const port = 7100 + Math.floor(Math.random() * 800);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`http://localhost:${port}/?seed=${seed}&still`);
await p.waitForFunction(() => window.thaw);
await p.evaluate(() => {
  const S = (window.bot = { seen: new Set(), timeline: [], marks: {} });
  const key = (x, y) => x + ',' + y;
  const cellAt = (g, x, y) => { const cx = Math.floor(x / 16), cy = Math.floor(y / 16); const c = g.chunks.get(cx + ',' + cy); return c ? c.cells[(y - cy * 16) * 16 + (x - cx * 16)] : -1; };
  const has = (g, id) => g.player.inv.some((i) => i.mod === id);
  const inst = (g, id) => g.player.installed.some((i) => i.mod === id);
  S.mark = (g, what) => { if (!(what in S.marks)) { S.marks[what] = Math.round(g.t); S.timeline.push(`${Math.round(g.t)}s ${what}`); } };
  S.next = () => {
    const g = thaw.g, P = g.player, px = Math.floor(P.x), py = Math.floor(P.y);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) S.seen.add(key(px + dx, py + dy));
    if (P.path.length) return 0.5;
    if (!S.trail) S.trail = []; if (g.t - (S.lt || -99) > 15) { S.lt = g.t; S.trail.push(Math.round(g.t) + ':' + px + ',' + py + ' hp' + Math.round(P.hp)); }
    // a player steps out of a seraph's line once it has hit them
    const lamps = g.ents.filter((e) => e.enemy?.type === 'seraph' && Math.hypot(e.x - P.x, e.y - P.y) < 9);
    const inLine = (x, y) => lamps.some((e) => Math.abs(e.x - x - 0.5) < 0.6 || Math.abs(e.y - y - 0.5) < 0.6);
    if (g.t - P.hurtAt < 1.5 && inLine(px, py)) for (const [d, ox, oy] of [['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]]) if (cellAt(g, px + ox, py + oy) === 1 && !inLine(px + ox, py + oy)) return 'go ' + d + ' 1';
    const foe = g.ents.some((e) => e.enemy && Math.hypot(e.x - P.x, e.y - P.y) < 6);
    if (P.hp < P.maxHp * 0.6 && !foe) { S.rested = (S.rested || 0) + 3; return 3; }
    if (g.ents.some((e) => e.kind === 'item' && Math.hypot(e.x - P.x, e.y - P.y) < 1.6 && !(e.data && e.data.mimic) && (e.item.kind !== 'mod' || !S.skip?.has(e.id)))) {
      const n = P.inv.length; S.lastTake = g.t; return 'take';
    }
    const here = key(px, py);
    // stuck on a goal (standing still or pacing between two cells): give it up
    S.visits ||= new Map(); S.visits.set(here, (S.visits.get(here) || 0) + 1);
    if (S.visits.get(here) > 12 && S.goal) { (S.ban ||= new Set()).add(S.goal); S.visits.clear(); }
    const free = P.slots - P.installed.length;
    const want = ['stepper-relay', 'spark-finger', 'card-reader'];
    if (has(g, 'slot-board')) return 'install slot board';
    if (has(g, 'thaw-engine')) { if (free > 0) return 'install thaw engine'; return 'remove ' + P.installed.find((i) => i.mod !== 'stepper-relay').mod.replace('-', ' '); }
    for (const id of want) if (has(g, id) && !inst(g, id)) {
      if (free > 0) return 'install ' + id.replace('-', ' ');
      const drop = P.installed.find((i) => !want.includes(i.mod));
      if (drop) return 'remove ' + drop.mod.replace('-', ' ');
    }
    // body and weapons for the empty slots
    for (const i of P.inv) if (i.mod && free > 0 && ['lead-lung', 'frost-coat', 'reliquary-ribs', 'choir-bell', 'ember-cell', 'votive-battery'].includes(i.mod)) return 'install ' + i.mod.replace('-', ' ');
    if (inst(g, 'card-reader') && P.inv.some((i) => i.kind === 'card') && P.installed.find((i) => i.mod === 'card-reader').readyAt <= g.t) return 'read card';
    // where to: an open vector, else a card or wanted module seen, else unexplored floor
    const goals = [];
    const key2 = (v) => (v.what === 'scripture shard' || v.what === 'thaw engine' ? 0 : 1000) + Math.hypot(v.x - P.x, v.y - P.y);
    const v = g.vectors.filter((v) => !v.found && !S.ban?.has(v)).sort((a, b) => key2(a) - key2(b))[0];
    const items = g.ents.filter((e) => e.kind === 'item' && !(e.data && e.data.mimic) && (Math.hypot(e.x - P.x, e.y - P.y) < (g.vectors.some((v) => !v.found && v.what.match(/shard|engine/)) ? 8 : 20) || (!g.cards.length && ['card-reader','spark-finger','log-surveyor'].includes(e.item.mod || e.item.card))) && (e.item.kind === 'card' || ['stepper-relay', 'spark-finger', 'card-reader', 'thaw-engine', 'slot-board', 'lead-lung', 'frost-coat', 'reliquary-ribs', 'ember-cell', 'votive-battery'].includes(e.item.mod)));
    // BFS over generated open cells
    const dist = new Map([[key(px, py), 0]]), prev = new Map(), q = [[px, py]];
    for (let h = 0; h < q.length && q.length < 20000; h++) {
      const [x, y] = q[h];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy, k = key(nx, ny);
        if (dist.has(k) || cellAt(g, nx, ny) !== 1) continue;
        dist.set(k, dist.get(key(x, y)) + 1); prev.set(k, [x, y]); q.push([nx, ny]);
      }
    }
    let target = null;
    const reachable = (x, y) => dist.has(key(Math.floor(x), Math.floor(y)));
    const it = items.filter((e) => reachable(e.x, e.y) && !S.ban?.has(e)).sort((a, b) => dist.get(key(Math.floor(a.x), Math.floor(a.y))) - dist.get(key(Math.floor(b.x), Math.floor(b.y))))[0];
    S.goal = it || v || null;
    if (it) target = [Math.floor(it.x), Math.floor(it.y)];
    else if (v) {
      if (reachable(v.x, v.y)) target = [Math.floor(v.x), Math.floor(v.y)];
      else { // the known cell nearest the vector, preferring ones not stood on
        let best = Infinity; for (const [x, y] of q) { const d = Math.hypot(x - v.x, y - v.y) + (S.seen.has(key(x, y)) ? 3 : 0) + dist.get(key(x, y)) * 0.05; if (d < best) { best = d; target = [x, y]; } }
      }
    } else { // unexplored floor: near you, and near where you woke while no vector leads out
      let best = Infinity; for (const [x, y] of q) if (!S.seen.has(key(x, y))) { const d = dist.get(key(x, y)) + 0.6 * Math.hypot(x - 8, y - 8); if (d < best) { best = d; target = [x, y]; } }
    }
    if (!target || (target[0] === px && target[1] === py)) { S.stuck = (S.stuck || 0) + 1; return 'listen'; }
    const path = []; let c = target;
    while (c && !(c[0] === px && c[1] === py)) { path.unshift(c); c = prev.get(key(c[0], c[1])); }
    const d0 = [path[0][0] - px, path[0][1] - py]; let n = 0;
    while (n < path.length && n < 9 && path[n][0] - (n ? path[n - 1][0] : px) === d0[0] && path[n][1] - (n ? path[n - 1][1] : py) === d0[1]) n++;
    const dir = d0[0] === 1 ? 'e' : d0[0] === -1 ? 'w' : d0[1] === 1 ? 's' : 'n';
    return inst(g, 'stepper-relay') && P.installed.find((i) => i.mod === 'stepper-relay').readyAt <= g.t ? `go ${dir} ${n}` : `crawl ${dir}`;
  };
});
let cmds = 0, last = '';
const t0 = Date.now();
for (;;) {
  const s = await p.evaluate(() => { const g = thaw.g, P = g.player;
    for (const i of [...P.inv, ...P.installed]) if (i.mod) bot.mark(g, i.mod); 
    for (const c of g.cards) bot.mark(g, 'read ' + c);
    return { t: g.t, hp: P.hp, ended: g.ended, x: P.x, y: P.y }; });
  if (s.ended || s.hp <= 0 || s.t > LIMIT || Date.now() - t0 > 600000) { console.log('END', JSON.stringify(s)); break; }
  const c = await p.evaluate(() => bot.next());
  if (typeof c === 'number') await p.evaluate((x) => window.step(x), c);
  else {
    await p.evaluate((x) => window.thaw.send(x), c); cmds++;
    if (c === last && (c === 'take' || c.startsWith('install') || c === 'listen')) await p.evaluate(() => window.step(1)); // nothing happened: let time pass
    last = c;
    await p.evaluate(() => window.step(c.startsWith?.('crawl') ? 2.2 : 0.3)).catch(() => p.evaluate(() => window.step(0.3)));
  }
}
const out = await p.evaluate(() => ({ ended: thaw.g.ended, timeline: bot.timeline, log: thaw.g.log.slice(-25).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')), vectors: thaw.g.vectors.map(v => v.what + ' ' + Math.round(v.x) + ',' + Math.round(v.y) + (v.found ? ' (reached)' : '')), trail: bot.trail, hp: thaw.g.player.hp, inst: thaw.g.player.installed.map(i => i.mod), dmg: thaw.g.log.filter(l => JSON.stringify(l).match(/hits you|bites|you take \d/)).length }));
console.log('commands', cmds, 'rested', await p.evaluate(() => bot.rested)); console.log(out.timeline.join('\n')); console.log(out.trail.join(' | ')); console.log('vectors', out.vectors, 'inst', out.inst); console.log(out.log.join('\n'));
console.log(errs.slice(0, 3).join('\n'));
process.exitCode = out.ended === 'thaw' ? 0 : 1;
await b.close(); srv.kill();
