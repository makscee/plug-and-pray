// ?scene=world-map | world-printer | world-deep | world-engine | floor | boss | stairs stages a world scene for judging
// (floor, boss and stairs take &f=0..4: a floor's landing, its boss room before the boss wakes, its stairs open)
// (the fight slice's ?scene=fight does the same for fights). Nothing happens without the parameter.

import { CHUNK, chunk, ensure, open } from '../core/grid';
import { say, tickHooks } from '../core/game';
import { exec } from '../core/verbs';
import type { Game } from '../core/types';
import { middle, rooms } from './gen';
import { bossAt, bossRoom, FLOORS, goDown, onBossDown, stairsAt, stairsChunk } from './floors';
import { clean } from '../tune/start';
import { opening } from './spawn';

const params = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
const scene = params?.get('scene') ?? null;
const floorParam = () => Math.max(0, Math.min(FLOORS.length - 1, Number(params?.get('f') ?? 0) || 0));
const staged = new WeakSet<Game>();

function kit(g: Game, mods: string[]): void {
  clean(g);
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
    const [px, py] = opening(g.seed).printer;
    chunk(g, px, py);
    const pr = g.ents.find((e) => e.kind === 'printer' && !e.data?.shop && Math.floor(e.x / CHUNK) === px && Math.floor(e.y / CHUNK) === py);
    if (pr) goTo(g, pr.x, pr.y);
    kit(g, ['vidicon-tube', 'stepper-relay', 'leech-needle']);
    g.player.inv.push({ kind: 'res', res: 'bone', n: 14 }, { kind: 'res', res: 'glass', n: 5 }, { kind: 'res', res: 'copper', n: 7 }, { kind: 'res', res: 'ichor', n: 2 });
    say(g, 'staged: at the printer by the start, resources in hand.');
  },
  'world-deep'(g) {
    goDown(g, 2);
    const [cx, cy] = [2 * 16 + 1, -1];
    const [mx, my] = middle(rooms(g.seed, cx, cy)[0]);
    goTo(g, cx * CHUNK + mx + 0.5, cy * CHUNK + my + 0.5);
    // the map shows the chunks around as if walked, so the generator can be judged at a glance
    for (let y = (cy - 1) * CHUNK; y < (cy + 2) * CHUNK; y++) for (let x = (cx - 1) * CHUNK; x < (cx + 2) * CHUNK; x++) g.seen.add(`${x},${y}`);
    kit(g, ['saints-lens', 'stepper-relay', 'survey-spool', 'leech-needle']);
    say(g, 'staged: the ossuary, where the chambers grow strange.');
  },
  // v2 floors: a floor's landing with a kit for it
  floor(g) {
    const f = floorParam();
    if (f) goDown(g, f);
    kit(g, ['vidicon-tube', 'stepper-relay', 'map-spool', ...(f ? ['censer-flail', 'frost-coat'] : ['spark-finger'])]);
    say(g, `staged: floor ${f + 1}, ${FLOORS[f].name}.`);
  },
  // the boss room's doorway, the boss not yet awake
  boss(g) {
    const f = floorParam();
    if (f) goDown(g, f);
    const [cx, cy] = stairsChunk(g.seed, f);
    chunk(g, cx, cy);
    const [x0, y0, x1, y1] = bossRoom(g.seed, f);
    const [bx, by] = bossAt(g.seed, f);
    // stand just outside the room on the side facing the boss, on open floor
    const spots: [number, number][] = [];
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if ((x < x0 || x > x1 || y < y0 || y > y1) && open(g, x + 0.5, y + 0.5)) spots.push([x + 0.5, y + 0.5]);
    const [sx, sy] = spots.sort((a, b) => Math.hypot(a[0] - bx, a[1] - by) - Math.hypot(b[0] - bx, b[1] - by))[0] ?? [bx, by];
    goTo(g, sx, sy);
    g.player.dir = Math.atan2(bx - sx, -(by - sy));
    kit(g, ['saints-lens', 'stepper-relay', 'map-spool', 'reliquary-saw', 'ossuary-plate']);
    for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) g.seen.add(`${x},${y}`);
    say(g, ['staged: the boss room ahead. ', { text: 'go', cmd: 'go n 2' }]);
  },
  // the boss down, the stairs open, you in front of them looking at them
  stairs(g) {
    const f = Math.min(floorParam(), FLOORS.length - 2);
    if (f) goDown(g, f);
    const [cx, cy] = stairsChunk(g.seed, f);
    chunk(g, cx, cy);
    const [x, y] = stairsAt(g.seed, f);
    const [mx, my] = bossAt(g.seed, f);
    const k = 1.6 / Math.hypot(mx - x, my - y);
    goTo(g, Math.floor(x + (mx - x) * k) + 0.5, Math.floor(y + (my - y) * k) + 0.5);
    g.player.dir = Math.atan2(x - g.player.x, -(y - g.player.y));
    kit(g, ['saints-lens', 'stepper-relay', 'map-spool', 'reliquary-saw']);
    const [x0, y0, x1, y1] = bossRoom(g.seed, f);
    for (let yy = y0 - 2; yy <= y1 + 2; yy++) for (let xx = x0 - 2; xx <= x1 + 2; xx++) g.seen.add(`${xx},${yy}`);
    onBossDown(g, f);
    say(g, ['staged: the way down, open. ', { text: 'descend', cmd: 'descend' }]);
  },
};

tickHooks.push((g) => {
  if (!scene || !STAGES[scene] || staged.has(g)) return;
  staged.add(g);
  STAGES[scene](g);
});
