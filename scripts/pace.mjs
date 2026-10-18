// Pacing and novelty: what a run meets for the first time, minute by minute, and where it goes quiet.
//
//   node scripts/pace.mjs [seeds=12] [careful|rusher|both] [limit s=2400]     sim runs (scripts/sim/brain.ts), headless
//   node scripts/pace.mjs 12 careful 2400 --from 5        seeds 5..16
//   node scripts/pace.mjs 3 --timeline                    also print every run's full novelty timeline
//   node scripts/pace.mjs 12 --json out.json              write every run's events and metrics as JSON
//   node scripts/pace.mjs --trace play.json [--timeline]  analyse a browser session recorded with `sample` (below)
//
// Recording a browser session (hand play): import { sample } from './scripts/pace.mjs', then after every
// step of your Playwright script push `await page.evaluate(`(${sample})(thaw.g)`)` into an array and save it
// as JSON. Any sampling rate works (0.1–1 s of game time); the sim samples every 0.5 s.
//
// What counts as new (first time in a run). Major: a foe type met (noticed within 8 cells; the hidden hum
// within 2.5), an elite, a zone (a floor, v2: z2 adds dark + cold, z3 heat, z4 the heart), a module family, a mechanic (altar,
// printer, reliquary shop, memory card, card reader, mimic, keeper down, descend, generator on, setups), a set piece (src/world/events.ts:
// the first of each kind per zone) and a kind of
// decision (KINDS below: loadout, buy, recycle, print slot/module, offer power/flesh/mend, attune, read card,
// aim, drain, dig, retreat, setup). Minor: a new module id. Also: the share of minutes with no major novelty
// (the benchmark: something new every 1-2 minutes).
// Metrics: time to first fight (first foe noticed within 2.5 cells, first hp lost to a foe or first kill);
// time to first real choice (first remove/off/buy/reroll/recycle/print/offer/attune: a trade, not the kit);
// novelty per 5-minute window; the longest gap with no major novelty; damage taken per minute and per zone
// (difficulty steps: hp lost per minute in each zone's first 2 minutes vs the zone before); danger moments
// (hp falls under 30% of max; rearms above 60%); empty walking (seconds the body moved with no foe noticed
// within 8, no hp change, no kill, nothing picked up or bought); resting (standing still while mending,
// no foe near); run length and where runs end. Run it before and after a balance change and compare.
import { pathToFileURL } from 'url';

/** a plain-data snapshot of the game for the tracker; self-contained so it can run in the page too */
export function sample(g) {
  const p = g.player;
  const at = g.__paceLog ?? 0;
  const lines = g.log.slice(at).map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join(''));
  g.__paceLog = g.log.length;
  const near = [];
  for (const e of g.ents) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > 10) continue;
    near.push({ k: e.kind, d: Math.round(d * 10) / 10, type: e.enemy ? e.enemy.type : undefined, noticed: !!(e.enemy && e.enemy.data.noticed), elite: !!(e.enemy && e.enemy.data.elite), altar: !!(e.data && e.data.altar), shop: !!(e.data && e.data.shop), mimic: !!(e.data && e.data.mimic), set: (e.data && e.data.set) || (e.enemy && e.enemy.data.set) || undefined });
  }
  const res = p.inv.reduce((n, i) => n + (i.kind === 'res' ? i.n : 0), 0);
  return {
    t: Math.round(g.t * 100) / 100, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, slots: p.slots, core: p.core,
    inv: p.inv.filter((i) => i.kind === 'mod').map((i) => i.mod), cards: p.inv.filter((i) => i.kind === 'card').length,
    read: [...g.cards], on: p.installed.filter((i) => i.on).map((i) => i.mod), inst: p.installed.map((i) => i.mod),
    res, kills: g.stats.kills, ended: g.ended, near, lines,
  };
}

/** kinds of decision, by verb (a verb not listed here is not a decision: walking, looking, help) */
const KINDS = { install: 'loadout', remove: 'loadout', on: 'loadout', off: 'loadout', buy: 'buy', reroll: 'buy', recycle: 'recycle', attune: 'attune', read: 'read card', shoot: 'aim', drain: 'drain', dig: 'dig', unstuck: 'retreat', save: 'setup', setup: 'setup', conjure: 'conjure' };
const TRADES = ['remove', 'off', 'buy', 'reroll', 'recycle', 'print', 'offer', 'attune'];
const mm = (t) => (t == null ? '  -  ' : `${String(Math.floor(t / 60)).padStart(2)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
const med = (xs) => { const a = xs.filter((x) => x != null && !Number.isNaN(x)).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };

/** turn a run's samples into its novelty timeline and metrics; `M` = { MODS, zoneAt } from the game */
export function analyse(samples, M) {
  const ev = [];
  const seen = new Set();
  const add = (t, kind, what, major = true) => {
    const k = kind + ':' + what;
    if (seen.has(k)) return;
    seen.add(k);
    ev.push({ t, kind, what, major });
  };
  const fam = (id) => M.MODS[id]?.family ?? '?';
  const s0 = samples[0];
  for (const id of [...s0.inv, ...s0.inst]) { seen.add('family:' + fam(id)); seen.add('mod:' + id); }
  seen.add('zone:0');
  let firstFight = null, firstChoice = null, danger = 0, armed = true, restS = 0, emptyS = 0, emptyRun = 0, emptyMax = 0, emptyMaxAt = 0;
  const hpLostByMin = [];
  const zoneT = { 0: 0 };
  const hpLostByZone = {};
  const timeByZone = {};
  let prev = s0;
  for (const s of samples.slice(1)) {
    const dt = s.t - prev.t;
    const z = M.zoneAt(s.x, s.y);
    timeByZone[z] = (timeByZone[z] ?? 0) + dt;
    if (!(z in zoneT)) {
      zoneT[z] = s.t;
      add(s.t, 'zone', 'z' + z);
      if (z === 2) { add(s.t, 'mechanic', 'dark'); add(s.t, 'mechanic', 'cold'); }
      if (z === 3) add(s.t, 'mechanic', 'heat');
    }
    for (const e of s.near) {
      if (e.k === 'enemy' && e.type && e.noticed && (e.type === 'hum' ? e.d < 2.5 : e.d < 8)) {
        add(s.t, e.elite ? 'elite' : 'foe', e.type);
        if (e.type === 'mimic') add(s.t, 'mechanic', 'mimic');
        if (firstFight == null && e.d < 2.5) firstFight = s.t;
      }
      // a set piece (src/world/events.ts): the first of each kind in each zone
      if (e.set && e.d < 8) add(s.t, 'set', `${e.set} z${z}`);
      if (e.d < 4) {
        if (e.altar) add(s.t, 'mechanic', 'altar');
        if (e.k === 'printer') add(s.t, 'mechanic', e.shop ? 'shop' : 'printer');
      }
    }
    for (const id of [...s.inv, ...s.inst]) { add(s.t, 'family', fam(id)); add(s.t, 'module', id, false); }
    if (s.cards > prev.cards) add(s.t, 'mechanic', 'memory card');
    if (s.inst.includes('card-reader')) add(s.t, 'mechanic', 'card reader');
    // v2 floors: a keeper down (the way down opens), a floor gone down to
    if (s.lines.some((l) => l.startsWith('THE WAY DOWN IS OPEN'))) add(s.t, 'mechanic', 'keeper down');
    if (s.lines.some((l) => l.startsWith('you go down'))) add(s.t, 'mechanic', 'descend');
    for (const id of s.on) if (fam(id) === 'power' && (M.MODS[id]?.params?.power ?? 0) > 0) add(s.t, 'mechanic', 'generator');
    for (const l of s.lines) {
      const m = /^> (\w+)(?: (\w+))?/.exec(l);
      if (!m) continue;
      if (m[1] === 'save' || m[1] === 'setup') add(s.t, 'mechanic', 'setups');
      const kind = KINDS[m[1]] ?? ((m[1] === 'offer' || m[1] === 'print') && m[2] ? m[1] + ' ' + m[2] : null);
      if (kind) add(s.t, 'decision', kind);
      if (firstChoice == null && TRADES.includes(m[1])) firstChoice = s.t;
    }
    const lost = Math.max(0, prev.hp - s.hp);
    const healed = s.hp > prev.hp + 1e-6;
    if (lost > 0 || s.kills > prev.kills) firstFight ??= s.t;
    const min = Math.floor(s.t / 60);
    hpLostByMin[min] = (hpLostByMin[min] ?? 0) + lost;
    hpLostByZone[z] = hpLostByZone[z] ?? [];
    const sinceIn = s.t - zoneT[z];
    hpLostByZone[z].push({ t: sinceIn, lost });
    const frac = s.hp / s.maxHp;
    if (armed && frac < 0.3 && !s.ended) { danger++; armed = false; ev.push({ t: s.t, kind: 'danger', what: `hp ${s.hp.toFixed(1)}/${s.maxHp}`, major: false, flag: true }); }
    if (frac > 0.6) armed = true;
    const moved = Math.hypot(s.x - prev.x, s.y - prev.y);
    const foe = s.near.some((e) => e.k === 'enemy' && e.noticed && e.d < 8);
    const happened = foe || lost > 0 || healed || s.kills > prev.kills || s.res !== prev.res || s.inv.length !== prev.inv.length || s.inst.join() !== prev.inst.join() || s.cards !== prev.cards;
    // a fold home is a teleport, not walking
    // resting: standing still, mending, nothing near
    if (moved < 0.05 && healed && !foe && lost === 0) restS += dt;
    if (moved > 0.05 && moved < dt * 6 && !happened) {
      emptyS += dt; emptyRun += dt;
      if (emptyRun > emptyMax) { emptyMax = emptyRun; emptyMaxAt = s.t - emptyRun; }
    } else if (happened) emptyRun = 0;
    prev = s;
  }
  const end = samples[samples.length - 1];
  ev.sort((a, b) => a.t - b.t);
  const majors = ev.filter((e) => e.major);
  // the longest stretch with no major novelty (to the end of the run)
  let gap = 0, gapAt = 0;
  const marks = [0, ...majors.map((e) => e.t), end.t];
  for (let k = 1; k < marks.length; k++) if (marks[k] - marks[k - 1] > gap) { gap = marks[k] - marks[k - 1]; gapAt = marks[k - 1]; }
  const quietMin = [];
  for (let k = 0; k * 60 < end.t - 30; k++) quietMin.push(!majors.some((e) => e.t >= k * 60 && e.t < (k + 1) * 60));
  const windows = [];
  for (let w = 0; w * 300 < end.t; w++) windows.push({ major: majors.filter((e) => e.t >= w * 300 && e.t < (w + 1) * 300).length, minor: ev.filter((e) => !e.major && !e.flag && e.t >= w * 300 && e.t < (w + 1) * 300).length });
  // difficulty steps: hp lost per minute in a zone's first two minutes there, and over the whole stay
  const steps = Object.keys(zoneT).map(Number).sort().map((z) => {
    const xs = hpLostByZone[z] ?? [];
    const early = xs.filter((x) => x.t < 120).reduce((a, x) => a + x.lost, 0);
    const earlyT = Math.min(120, timeByZone[z] ?? 0);
    const all = xs.reduce((a, x) => a + x.lost, 0);
    return { zone: z, at: zoneT[z], early: earlyT > 10 ? (60 * early) / earlyT : null, all: timeByZone[z] > 10 ? (60 * all) / timeByZone[z] : null, minutes: (timeByZone[z] ?? 0) / 60 };
  });
  const deathLine = end.ended === 'dead' ? samples.flatMap((s) => s.lines).reverse().find((l) => l.includes('took you')) : null;
  return {
    events: ev, length: end.t, ended: end.ended ?? 'time', endZone: M.zoneAt(end.x, end.y), killer: deathLine?.replace(/^you stop\. /, '').replace(/ took you\.$/, ''),
    firstFight, firstChoice, windows, gap, gapAt, danger, restS, emptyS, emptyMax, emptyMaxAt, hpLostByMin: hpLostByMin.map((x) => Math.round((x ?? 0) * 10) / 10), steps,
    quiet: quietMin.filter(Boolean).length / Math.max(1, quietMin.length), quietMin, majors: majors.length, minors: ev.filter((e) => !e.major && !e.flag).length,
  };
}

function printRun(label, a, timeline) {
  const w = a.windows.map((x) => `${x.major}/${x.minor}`).join(' ');
  console.log(`${label.padEnd(14)} ${a.ended.padEnd(5)} ${mm(a.length)} z${a.endZone} ${(a.killer ?? '').padEnd(20)} fight ${mm(a.firstFight)} choice ${mm(a.firstChoice)} gap ${mm(a.gap)}@${mm(a.gapAt).trim()} rest ${Math.round(a.restS)}s empty ${Math.round(a.emptyS)}s (max ${Math.round(a.emptyMax)}s@${mm(a.emptyMaxAt).trim()}) danger ${a.danger}  new/5min ${w}`);
  if (!timeline) return;
  let lastMin = -1;
  for (const e of a.events) {
    const m = Math.floor(e.t / 60);
    if (m !== lastMin) lastMin = m;
    console.log(`    ${mm(e.t)} ${e.major ? '*' : e.flag ? '!' : ' '} ${e.kind.padEnd(9)} ${e.what}`);
  }
  console.log(`    hp lost per minute: ${a.hpLostByMin.join(' ')}`);
  console.log(`    zones: ${a.steps.map((s) => `z${s.zone} in ${mm(s.at).trim()} ${s.minutes.toFixed(1)} min, hp lost/min first 2 min ${s.early?.toFixed(2) ?? '-'}, overall ${s.all?.toFixed(2) ?? '-'}`).join(' | ')}`);
}

function summary(name, as) {
  const n = as.length;
  console.log(`\n${name}: ${n} runs. ends: ${['thaw', 'dead', 'time'].map((k) => `${k} ${as.filter((a) => a.ended === k).length}`).join(', ')}; median length ${mm(med(as.map((a) => a.length)))}`);
  console.log(`  first fight median ${mm(med(as.map((a) => a.firstFight)))} (max ${mm(Math.max(...as.map((a) => a.firstFight ?? 1e9).filter((x) => x < 1e9)))}); first real choice median ${mm(med(as.map((a) => a.firstChoice)))}`);
  console.log(`  major novelties median ${med(as.map((a) => a.majors))}, minor ${med(as.map((a) => a.minors))}; longest gap with nothing new: median ${mm(med(as.map((a) => a.gap)))}, worst ${mm(Math.max(...as.map((a) => a.gap)))}`);
  const W = Math.max(...as.map((a) => a.windows.length));
  const row = [];
  for (let k = 0; k < W; k++) {
    const xs = as.filter((a) => a.windows[k]);
    row.push(`${k * 5}-${k * 5 + 5}m ${med(xs.map((a) => a.windows[k].major))}/${med(xs.map((a) => a.windows[k].minor))} (n${xs.length})`);
  }
  console.log(`  new things per 5 min, median major/minor: ${row.join(', ')}`);
  const M2 = Math.max(...as.map((a) => a.quietMin.length));
  const qrow = [];
  for (let k = 0; k < M2; k++) { const xs = as.filter((a) => k < a.quietMin.length); qrow.push(Math.round((100 * xs.filter((a) => !a.quietMin[k]).length) / xs.length)); }
  console.log(`  minutes with no major novelty: median ${Math.round(100 * med(as.map((a) => a.quiet)))}% of the run; share of runs meeting something new, by minute: ${qrow.join(' ')}`);
  console.log(`  empty walking: median ${Math.round(med(as.map((a) => a.emptyS)))} s (${Math.round(100 * med(as.map((a) => a.emptyS / a.length)))}% of the run), longest stretch median ${Math.round(med(as.map((a) => a.emptyMax)))} s, worst ${Math.round(Math.max(...as.map((a) => a.emptyMax)))} s`);
  console.log(`  resting (still, mending, nothing near): median ${Math.round(med(as.map((a) => a.restS)))} s (${Math.round(100 * med(as.map((a) => a.restS / a.length)))}% of the run)`);
  console.log(`  danger moments (hp < 30%): median ${med(as.map((a) => a.danger))}, total ${as.reduce((x, a) => x + a.danger, 0)}`);
  for (const z of [0, 1, 2, 3, 4]) {
    const st = as.map((a) => a.steps.find((s) => s.zone === z)).filter(Boolean);
    if (!st.length) continue;
    console.log(`  zone ${z}: reached ${st.length}/${n}, entered median ${mm(med(st.map((s) => s.at)))}, stay median ${med(st.map((s) => s.minutes))?.toFixed(1)} min, hp lost/min first 2 min ${med(st.map((s) => s.early))?.toFixed(2) ?? '-'}, overall ${med(st.map((s) => s.all))?.toFixed(2) ?? '-'}`);
  }
  const firsts = {};
  for (const a of as) for (const e of a.events) if (e.major) (firsts[e.kind + ' ' + e.what] ??= []).push(e.t);
  const order = Object.entries(firsts).sort((p, q) => med(p[1]) - med(q[1]));
  console.log(`  first met (median time, share of runs): ${order.map(([k, ts]) => `${k} ${mm(med(ts)).trim()} ${Math.round((100 * ts.length) / n)}%`).join(' · ')}`);
  const dead = as.filter((a) => a.ended === 'dead');
  if (dead.length) console.log(`  deaths: ${dead.map((a) => `${mm(a.length).trim()} z${a.endZone} ${a.killer}`).join('; ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const timeline = args.includes('--timeline');
  const json = opt('--json'), trace = opt('--trace'), from = Number(opt('--from') ?? 1);
  const pos = args.filter((a, k) => !a.startsWith('--') && !['--json', '--trace', '--from'].includes(args[k - 1]));
  const N = Number(pos[0] || 12), STYLE = pos[1] || 'careful', LIMIT = Number(pos[2] || 2400);
  const { createServer } = await import('vite');
  const s = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  const brain = await s.ssrLoadModule('/scripts/sim/brain.ts');
  const game = await s.ssrLoadModule('/src/core/game.ts');
  const mods = await s.ssrLoadModule('/src/core/mods.ts');
  const zones = await s.ssrLoadModule('/src/world/zones.ts');
  const M = { MODS: mods.MODS, zoneAt: zones.zoneAt };
  const out = [];
  if (trace) {
    const samples = JSON.parse((await import('fs')).readFileSync(trace, 'utf8'));
    const a = analyse(samples, M);
    printRun('trace', a, true);
    summary('trace', [a]);
    out.push(a);
  } else {
    // sample the sim's game every 0.5 s of game time through the core's tick hooks
    let cur = null, next = 0, samples = [];
    game.tickHooks.push((g) => {
      if (g !== cur) { cur = g; next = 0; samples = []; }
      if (g.t >= next || g.ended) { samples.push(sample(g)); next = g.t + 0.5; }
    });
    for (const style of STYLE === 'both' ? ['careful', 'rusher'] : [STYLE]) {
      const as = [];
      for (let seed = from; seed < from + N; seed++) {
        const r = brain.play(seed, { style, limit: LIMIT });
        // the last moment (death happens mid-tick, before the hooks)
        if (cur) samples.push(sample(cur));
        const a = analyse(samples, M);
        a.seed = seed; a.style = style;
        printRun(`${style} ${seed}`, a, timeline);
        as.push(a);
        cur = null;
      }
      summary(style, as);
      out.push(...as);
    }
  }
  if (json) (await import('fs')).writeFileSync(json, JSON.stringify(out, null, 1));
  await s.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
