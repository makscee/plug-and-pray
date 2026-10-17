// One seed, one player, with its commands: node scripts/sim/dbg.mjs <seed> [limit s] [careful|rusher]
import { createServer } from 'vite';
const s = await createServer({ root: new URL('../..', import.meta.url).pathname, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const brain = await s.ssrLoadModule('/scripts/sim/brain.ts');
const r = brain.play(Number(process.argv[2] || 1), { style: process.argv[4] || 'careful', limit: Number(process.argv[3] || 300), debug: true });
console.log(r.ended, r.t, JSON.stringify(r.marks), r.killer ?? '');
for (const x of r.snaps) console.log(`  ${x.t}s z${x.zone} @${x.at} hp${x.hp}/${x.maxHp} pw${x.power} sl${x.slots} dps${x.dps} ready${x.ready} res${x.res} -> ${x.goal}`);
console.log(r.log.slice(-Number(process.env.N || 60)).join('\n'));
await s.close();
