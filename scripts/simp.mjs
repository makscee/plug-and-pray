// The balance sim in parallel, with a summary for balance passes: `node scripts/simp.mjs [seeds=40] [careful|rusher|both] [workers=4] [--json out.json] [--from 1]`
// Each worker runs a slice of the seeds (scripts/sim/brain.ts); the parent prints finish rates, floor times,
// deaths, uniques per run and how each keeper went (first try, tries).
import { fork } from 'child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
if (args[0] === '--worker') {
  const { createServer } = await import('vite');
  const [, style, seeds, out, limit] = args;
  const s = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  const brain = await s.ssrLoadModule('/scripts/sim/brain.ts');
  const runs = seeds.split(',').map((x) => {
    const r = brain.play(Number(x), { style, limit: Number(limit) });
    delete r.snaps;
    delete r.log;
    return r;
  });
  writeFileSync(out, JSON.stringify(runs));
  await s.close();
  process.exit(0);
}
const pos = args.filter((a, k) => !a.startsWith('--') && !['--json', '--from', '--limit'].includes(args[k - 1]));
const N = Number(pos[0] || 40), STYLE = pos[1] || 'both', W = Number(pos[2] || 4), FROM = Number(opt('--from', 1)), LIMIT = Number(opt('--limit', 2400));
const styles = STYLE === 'both' ? ['careful', 'rusher'] : [STYLE];
const dir = mkdtempSync(join(tmpdir(), 'simp-'));
const jobs = [];
for (const style of styles) for (let w = 0; w < W; w++) {
  const seeds = [];
  for (let k = w; k < N; k += W) seeds.push(FROM + k);
  if (seeds.length) jobs.push({ style, seeds, out: join(dir, `${style}-${w}.json`) });
}
await Promise.all(jobs.map((j) => new Promise((ok, no) => fork(new URL(import.meta.url).pathname, ['--worker', j.style, j.seeds.join(','), j.out, String(LIMIT)]).on('exit', (c) => (c ? no(new Error('worker ' + c)) : ok())))));
const all = jobs.flatMap((j) => JSON.parse(readFileSync(j.out, 'utf8'))).sort((a, b) => a.seed - b.seed);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(all));
const mm = (t) => (t == null ? '-' : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`);
const med = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const BOSSY = /great warden|mite queen|the bell$|seraph choir|mimic organ|bell-ringer|high abbot|hydra|hollow saint|burning saint|twin|slag worm|heart/;
for (const style of styles) {
  const runs = all.filter((r) => r.style === style);
  const won = runs.filter((r) => r.ended === 'thaw');
  const dead = runs.filter((r) => r.ended === 'dead');
  // floor lengths: arrival to arrival (floor 1 from 0), the heart to the thaw
  const len = (r, f) => { const a = f === 1 ? 0 : r.marks['floor ' + f]; const b = f === 5 ? (r.ended === 'thaw' ? r.t : null) : r.marks['floor ' + (f + 1)]; return a != null && b != null ? b - a : null; };
  console.log(`\n${style}: ${won.length}/${runs.length} thaw, ${dead.length} dead, ${runs.length - won.length - dead.length} out of time; median thaw ${mm(med(won.map((r) => r.t)))}`);
  console.log(`  floor lengths (median, of runs that left it): ${[1, 2, 3, 4, 5].map((f) => `f${f} ${mm(med(runs.map((r) => len(r, f))))}`).join('  ')}`);
  console.log(`  deaths by floor: ${[0, 1, 2, 3, 4].map((z) => `f${z + 1} ${dead.filter((r) => r.deathZone === z).length}`).join(', ')}; to bosses ${dead.filter((r) => BOSSY.test(r.killer ?? '')).length}`);
  console.log(`  killers: ${Object.entries(dead.reduce((m, r) => ((m[`${r.killer} f${r.deathZone + 1}`] = (m[`${r.killer} f${r.deathZone + 1}`] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(`  uniques per run: seen ${mean(runs.map((r) => r.uniques.seen.length)).toFixed(1)}, held ${mean(runs.map((r) => r.uniques.held.length)).toFixed(1)}, dealt ${mean(runs.map((r) => r.uniques.dealt)).toFixed(1)}`);
  // keepers: met, beaten, first-try (no break-off), by floor
  const rows = [];
  for (let f = 0; f < 5; f++) {
    const met = runs.filter((r) => r.atBoss[f]);
    const beat = met.filter((r) => r.marks['floor ' + (f + 2)] != null || (f === 4 && r.ended === 'thaw'));
    const first = beat.filter((r) => !r.bossTries[f]);
    rows.push(`f${f + 1} met ${met.length} beat ${beat.length} first-try ${first.length} | hp@boss med ${med(met.map((r) => r.atBoss[f].maxHp))} ready med ${med(met.map((r) => r.atBoss[f].ready))}`);
  }
  console.log('  keepers: ' + rows.join('\n           '));
}
