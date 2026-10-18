// Boss balance: each boss fought by a careful headless player (scripts/sim/boss.ts) with its floor's usual
// loadout, over many seeds. Prints win rate, fight time and hp left per boss.
// `node scripts/boss-sim.mjs [seeds=30] [boss-id|floor ...]`, or `trace <floor> <boss-id> [seed]`
// `--kits runs.json [careful|rusher]`: instead of the idealised loadouts, each fight replays a loadout (and hp) a run
// sim really had when it met that floor's keeper (`node scripts/simp.mjs 40 both --json runs.json`), one per run
import { createServer } from 'vite';
import { readFileSync } from 'fs';
const argv = process.argv.slice(2);
const kitsAt = argv.indexOf('--kits');
const kitRuns = kitsAt >= 0 ? JSON.parse(readFileSync(argv[kitsAt + 1], 'utf8')).filter((r) => !argv[kitsAt + 2] || argv[kitsAt + 2].startsWith('--') || /^\d/.test(argv[kitsAt + 2]) || r.style === argv[kitsAt + 2]) : null;
const args = kitsAt >= 0 ? argv.filter((a, k) => k < kitsAt || k > kitsAt + (argv[kitsAt + 2] && /^[a-z]/.test(argv[kitsAt + 2]) ? 2 : 1)) : argv;
const N = Number(args[0] || 30);
const only = args.slice(1);
const s = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const sim = await s.ssrLoadModule('/scripts/sim/boss.ts');
const { BOSSES } = await s.ssrLoadModule('/src/fight/bosses.ts');
// `trace <floor> <boss-id> [seed]`: one fight, line by line
if (args[0] === 'trace') {
  console.log(sim.fight(Number(args[1]), args[2], Number(args[3] || 1), { trace: true }));
  await s.close();
  process.exit(0);
}
const med = (xs) => { const a = [...xs].sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
console.log(`floor boss                       win   time med (min-max)   hp left med${kitRuns ? '   (kits from ' + kitRuns.length + ' runs)' : ''}`);
for (let floor = 0; floor < BOSSES.length; floor++) {
  for (const b of BOSSES[floor]) {
    if (b.mate && b.id > b.mate) continue;
    if (only.length && !only.includes(b.id) && !only.includes(String(floor))) continue;
    const runs = [];
    if (kitRuns) for (const r of kitRuns.filter((r) => r.atBoss[floor])) runs.push(sim.fightKit(floor, b.id, r.seed, r.atBoss[floor]));
    else for (let seed = 1; seed <= N; seed++) runs.push(sim.fight(floor, b.id, seed));
    const won = runs.filter((r) => r.won);
    const times = won.map((r) => r.t);
    const left = won.map((r) => Math.round((100 * r.hp) / r.maxHp));
    const name = b.mate ? 'the forge twins' : b.name;
    console.log(`${String(floor).padStart(5)} ${name.padEnd(26)} ${String(Math.round((100 * won.length) / runs.length)).padStart(3)}%   ${String(med(times) ?? '-').padStart(4)} s (${times.length ? Math.min(...times) : '-'}-${times.length ? Math.max(...times) : '-'})   ${med(left) ?? '-'}%${kitRuns ? `   n=${runs.length}` : ''}`);
  }
}
await s.close();
