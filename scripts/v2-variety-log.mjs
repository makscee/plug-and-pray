// prints a sim run's log lines matching a pattern: node v2-variety-log.mjs <wt> <seed> <style> <regex>
import { createServer } from 'vite';
const [wt, seed, style, re] = process.argv.slice(2);
const s = await createServer({ root: wt, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const brain = await s.ssrLoadModule('/scripts/sim/brain.ts');
const r = brain.play(Number(seed), { style: style || 'careful', limit: 2400, debug: true });
const rx = new RegExp(re || 'cache|pick|scrap|FLOOR');
for (const l of r.log) if (rx.test(l)) console.log(l);
console.log('END', r.ended, r.t, r.killer ?? '', JSON.stringify(r.marks));
await s.close();
