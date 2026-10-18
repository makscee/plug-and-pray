// A typed run to the Thaw Engine: the sim's careful player (scripts/sim/brain.ts) plays one seed in node,
// by console commands only, and prints its timeline. Exits 0 when the run ends in 'thaw'.
//   node scripts/bot.mjs 1            (seed, then a game-time limit in s, default 2400, then careful|rusher)
// The many-seed balance table is scripts/sim.mjs.
import { createServer } from 'vite';
const seed = Number(process.argv[2] || 1), LIMIT = Number(process.argv[3] || 2400), style = process.argv[4] || 'careful';
const s = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const brain = await s.ssrLoadModule('/scripts/sim/brain.ts');
const r = brain.play(seed, { style, limit: LIMIT });
const mm = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
for (const [what, t] of Object.entries(r.marks).sort((a, b) => a[1] - b[1])) console.log(`${mm(t)} ${what}`);
for (const x of r.steps) console.log(`${mm(x.t)} ${x.what}`);
console.log(`END ${r.ended} at ${mm(r.t)}${r.killer ? `: ${r.killer} (zone ${r.deathZone})` : ''}; kills ${r.kills}, folds home ${r.homes}`);
process.exitCode = r.ended === 'thaw' ? 0 : 1;
await s.close();
