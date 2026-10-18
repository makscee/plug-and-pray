// Balance sims: a headless player (scripts/sim/brain.ts) plays many seeds by console commands, in node
// (no browser), and this prints per seed: when each shard and the Engine came, deaths (where, what),
// power and slot steps, resources held. `node scripts/sim.mjs [seeds=20] [careful|rusher|both] [limit s=2400] [--json out.json]`
import { createServer } from 'vite';
const args = process.argv.slice(2);
const json = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const pos = args.filter((a, k) => !a.startsWith('--') && args[k - 1] !== '--json');
const N = Number(pos[0] || 20), STYLE = pos[1] || 'both', LIMIT = Number(pos[2] || 2400);
const s = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const brain = await s.ssrLoadModule('/scripts/sim/brain.ts');
const styles = STYLE === 'both' ? ['careful', 'rusher'] : [STYLE];
const all = [];
const mm = (t) => (t == null ? '  -  ' : `${String(Math.floor(t / 60)).padStart(2)}:${String(t % 60).padStart(2, '0')}`);
const med = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
for (const style of styles) {
  console.log(`\n${style}: seed  shard1 shard2 shard3 engine  end     killer (zone)               kills homes res peak/end  steps`);
  const runs = [];
  for (let seed = 1; seed <= N; seed++) {
    const r = brain.play(seed, { style, limit: LIMIT });
    runs.push(r);
    const sh = ['shard-1', 'shard-2', 'shard-3'].map((k) => r.marks['shard ' + k]);
    const end = r.ended === 'thaw' ? 'THAW ' + mm(r.t) : r.ended === 'dead' ? 'dead ' + mm(r.t) : 'time ' + mm(r.t);
    const killer = r.killer ? `${r.killer} (z${r.deathZone})` : '';
    console.log(`        ${String(seed).padStart(4)}  ${sh.map(mm).join('  ')}  ${mm(r.ended === 'thaw' ? r.t : null)}  ${end.padEnd(11)} ${killer.padEnd(28)} ${String(r.kills).padStart(5)} ${String(r.homes).padStart(5)} ${String(r.resPeak).padStart(4)}/${String(r.resEnd).padEnd(4)}  ${r.steps.map((x) => mm(x.t).trim() + ' ' + x.what).join(', ')}`);
  }
  const won = runs.filter((r) => r.ended === 'thaw');
  const dead = runs.filter((r) => r.ended === 'dead');
  console.log(`  ${style}: ${won.length}/${runs.length} thaw, ${dead.length} dead, median thaw ${mm(med(won.map((r) => r.t)))}, median shards ${['shard-1', 'shard-2', 'shard-3'].map((k) => mm(med(runs.map((r) => r.marks['shard ' + k])))).join(' ')}`);
  console.log(`  deaths by zone: ${[0, 1, 2, 3].map((z) => `z${z} ${dead.filter((r) => r.deathZone === z).length}`).join(', ')}; killers: ${Object.entries(dead.reduce((m, r) => ((m[r.killer] = (m[r.killer] || 0) + 1), m), {})).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(`  power/slot steps per run: median ${med(runs.map((r) => r.steps.length))}; res peak median ${med(runs.map((r) => r.resPeak))}, at end ${med(runs.map((r) => r.resEnd))}; buys median ${med(runs.map((r) => r.bought.length))}`);
  all.push(...runs);
}
if (json) (await import('fs')).writeFileSync(json, JSON.stringify(all, null, 1));
await s.close();
