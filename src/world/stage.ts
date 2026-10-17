// ?scene=world-map | world-printer | world-deep | world-engine stages a world scene for judging
// (the fight slice's ?scene=fight does the same for fights). Nothing happens without the parameter.

import { CHUNK, chunk, ensure } from '../core/grid';
import { say, tickHooks } from '../core/game';
import { exec } from '../core/verbs';
import type { Game } from '../core/types';
import { middle, rooms } from './gen';
import { engineAt, plan } from './vectors';

const scene = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('scene');
const staged = new WeakSet<Game>();

function kit(g: Game, mods: string[]): void {
  const p = g.player;
  p.slots = Math.max(p.slots, mods.length + 1);
  p.core = 12;
  g.ents = g.ents.filter((e) => e.kind !== 'item' || Math.hypot(e.x - p.x, e.y - p.y) > 2);
  for (const mod of mods) {
    p.inv.push({ kind: 'mod', mod });
    exec(g, `install ${mod.replace(/-/g, ' ').replace('saints', "saint's")}`);
  }
  for (const i of p.installed) i.readyAt = g.t - 1; // warm now (the first browser tick can run g.t a hair below 0)
}

function goTo(g: Game, x: number, y: number): void {
  g.player.x = x;
  g.player.y = y;
  g.player.path = [];
  ensure(g, x, y);
}

const STAGES: Record<string, (g: Game) => void> = {
  'world-map'(g) {
    kit(g, ['vidicon-tube', 'stepper-relay', 'card-reader', 'map-spool', 'drowned-compass']);
    g.player.inv.push({ kind: 'card', card: 'log-surveyor' });
    exec(g, 'read card');
    say(g, ['staged: the first card read. follow the compass. ', { text: 'go n 3', cmd: 'go n 3' }, '  ', { text: 'go e 3', cmd: 'go e 3' }, '  ', { text: 'vectors', cmd: 'vectors' }]);
  },
  'world-printer'(g) {
    chunk(g, -1, 0);
    const pr = g.ents.find((e) => e.kind === 'printer' && e.x < 0);
    if (pr) goTo(g, pr.x, pr.y);
    kit(g, ['vidicon-tube', 'stepper-relay', 'leech-needle']);
    g.player.inv.push({ kind: 'res', res: 'bone', n: 14 }, { kind: 'res', res: 'glass', n: 5 }, { kind: 'res', res: 'copper', n: 7 }, { kind: 'res', res: 'ichor', n: 2 });
    say(g, 'staged: at the printer west of the start, resources in hand.');
  },
  'world-deep'(g) {
    const [cx, cy] = [5, -3];
    const [mx, my] = middle(rooms(g.seed, cx, cy)[0]);
    goTo(g, cx * CHUNK + mx + 0.5, cy * CHUNK + my + 0.5);
    // the map shows the chunks around as if walked, so the generator can be judged at a glance
    for (let y = (cy - 1) * CHUNK; y < (cy + 2) * CHUNK; y++) for (let x = (cx - 1) * CHUNK; x < (cx + 2) * CHUNK; x++) g.seen.add(`${x},${y}`);
    kit(g, ['saints-lens', 'stepper-relay', 'survey-spool', 'leech-needle']);
    say(g, `staged: ${Math.round(Math.hypot(cx, cy))} chunks out, where the chambers grow strange.`);
  },
  'world-engine'(g) {
    const p = plan(g.seed).engine;
    chunk(g, p[0], p[1]);
    const [ex, ey] = engineAt(g);
    kit(g, ['vidicon-tube', 'stepper-relay', 'card-reader']);
    g.player.inv.push({ kind: 'card', card: 'shard-1' }, { kind: 'card', card: 'shard-2' }, { kind: 'card', card: 'shard-3' });
    for (let k = 0; k < 3; k++) exec(g, 'read card');
    goTo(g, ex, ey);
    say(g, ['staged: the engine lies at your feet. ', { text: 'take thaw', cmd: 'take thaw' }, '  ', { text: 'install thaw engine', cmd: 'install thaw engine' }]);
  },
};

tickHooks.push((g) => {
  if (!scene || !STAGES[scene] || staged.has(g)) return;
  staged.add(g);
  STAGES[scene](g);
});
