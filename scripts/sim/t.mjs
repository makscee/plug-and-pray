import { createServer } from 'vite';
const s = await createServer({ root: new URL('../..', import.meta.url).pathname, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
await s.ssrLoadModule('/src/mods/index.ts');
const G = await s.ssrLoadModule('/src/core/game.ts');
const g = G.newGame(1);
console.log(G.nextCell(g, 8.5, 8.5, 10.5, 6.5), G.nextCell(g, -3.5, -3.5, 8.5, 8.5));
await s.close();
