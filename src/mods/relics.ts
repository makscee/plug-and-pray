// Uniques in the world (v2 rarity, src/mods/uniques.ts): where they lie, and the perks that tick on their own.
// Three a run at least, by seed: a relic in one of the cradle's corner chunks (its second half), one from each
// elite, and now and then one on a reliquary's shelf past the cradle (src/world/printer.ts).
import { chunkHook, open } from '../core/grid';
import { dist, hurtHooks, killHooks, say, spawn, strike, tickHooks } from '../core/game';
import { active, def, label, powerMax, powerUsed, param } from '../core/mods';
import { hash, rng } from '../core/rng';
import { goThere } from '../core/verbs';
import type { Chunk, Game, Inst } from '../core/types';
import { cellIn } from '../world/spawn';
import { mapHooks } from '../world/mind';
import { zoneAt } from '../world/zones';
import { dealUnique, perk, throughOne } from './uniques';

/** the cradle corner chunk that keeps this seed's relic */
export function relicChunk(seed: number): [number, number] {
  return rng(hash(seed, 72)).pick([[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]);
}

chunkHook((g: Game, c: Chunk) => {
  const [rx, ry] = relicChunk(g.seed);
  if (c.cx !== rx || c.cy !== ry) return;
  const [x, y] = cellIn(rng(hash(g.seed, 73, c.cx, c.cy)), c, g.seed);
  spawn(g, { kind: 'item', x, y, item: dealUnique(g, true), data: { relic: true } });
});

// an elite gives up a unique beside its usual module
killHooks.push((g, e) => {
  if (!e.enemy?.data.elite || e.enemy.data.boss) return; // bosses deal their own (src/fight/bosses.ts)
  const it = dealUnique(g);
  spawn(g, { kind: 'item', x: e.x, y: e.y + 0.3, item: it, data: { relic: true } });
  if (it.kind === 'mod') say(g, `✦ it leaves a relic with its own name: ${label(it)}.`);
});

/** a relic in sight range says so, once each: its name and the way to it */
const told = new WeakSet<object>();
tickHooks.push((g) => {
  for (const e of g.ents) {
    if (!e.data?.relic || e.item?.kind !== 'mod' || told.has(e) || dist(e, g.player) > 9) continue;
    told.add(e);
    const [far, go] = goThere(g, e.x, e.y, true);
    say(g, [`✦ something near hums its own name: ${label(e.item)}, a unique. it lies ${far}. `, go]);
  }
});

const perked = (g: Game, fam: Parameters<typeof active>[1], p: string): Inst[] => active(g, fam).filter((i) => perk(i) === p);

// the kiln heart: +1 power for each zone deeper you stand; walking back up may leave you short, and the
// newest module goes off (as when a generator goes off)
tickHooks.push((g) => {
  let changed = false;
  for (const i of g.player.installed) {
    if (perk(i) !== 'kiln') continue;
    const bonus = i.on && g.t >= i.readyAt ? zoneAt(g.player.x, g.player.y) : 0;
    if (bonus !== (i.data.bonus ?? 0)) [i.data.bonus, changed] = [bonus, true];
  }
  if (!changed) return;
  const on = g.player.installed.filter((i) => i.on && def(i).family !== 'power');
  let off = '';
  while (powerUsed(g) > powerMax(g) && on.length) {
    const last = on.pop()!;
    last.on = false;
    off = label(last);
  }
  if (off) say(g, `the kiln heart cools: ${off} goes off.`);
});

// the penitent's heels: ash on every cell you walked for TRAIL s; a foe on it wades at half speed
export const TRAIL = 5;
const ash = new WeakMap<Game, Map<string, number>>();
tickHooks.push((g) => {
  const heels = perked(g, 'gait', 'trail').length > 0;
  let m = ash.get(g);
  if (!heels && !m?.size) return;
  if (!m) ash.set(g, (m = new Map()));
  if (heels) m.set(`${Math.floor(g.player.x)},${Math.floor(g.player.y)}`, g.t);
  for (const [k, t] of m) if (g.t - t > TRAIL) m.delete(k);
  for (const e of g.ents) if (e.enemy && m.has(`${Math.floor(e.x)},${Math.floor(e.y)}`)) e.enemy.data.slowUntil = g.t + 0.3;
});
mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const m = ash.get(g);
  if (!m?.size) return;
  ctx.fillStyle = '#9a9490';
  for (const [k, t] of m) {
    const [x, y] = k.split(',').map(Number);
    ctx.globalAlpha = 0.25 + 0.5 * Math.max(0, 1 - (g.t - t) / TRAIL);
    ctx.fillRect((x - ox + 0.3) * px, (y - oy + 0.3) * px, px * 0.4, px * 0.4);
  }
  ctx.globalAlpha = 1;
});

// the lantern of saint ignis: foes in its light burn
export const BURN = { dmg: 0.5, every: 1.5 };
tickHooks.push((g) => {
  for (const i of perked(g, 'lamp', 'burn')) {
    if (g.t < ((i.data.burnAt as number) ?? 0)) continue;
    i.data.burnAt = g.t + BURN.every;
    const r = param<number>(i, 'radius', 4);
    for (const e of [...g.ents]) if (e.enemy && dist(e, g.player) <= r && open(g, e.x, e.y)) strike(g, e, BURN.dmg);
  }
});

// the pilgrim's unrolled reel: loot within LOOT cells goes on the map, walls or not
export const LOOT = 16;
tickHooks.push((g) => {
  if (!perked(g, 'mind', 'loot').length) return;
  for (const e of g.ents) if (e.kind === 'item' && !e.data?.mimic && dist(e, g.player) <= LOOT) g.seen.add(`${Math.floor(e.x)},${Math.floor(e.y)}`);
});

// the leech psalm: every kill mends a little
killHooks.push((g) => {
  if (!perked(g, 'weapon', 'leech').length) return;
  const p = g.player;
  p.hp = Math.min(p.maxHp, p.hp + 1);
});

// the abbot's last rite: the killing blow leaves you at 1 hp, then it sleeps
export const RITE = 90;
hurtHooks.push((g, n) => {
  const p = g.player;
  if (n <= 0 || n < p.hp) return n;
  const rite = perked(g, 'body', 'rite').find((i) => g.t >= ((i.data.riteAt as number) ?? 0));
  if (!rite) return n;
  rite.data.riteAt = g.t + RITE;
  say(g, `✦ the abbot's last rite is said over you. you stand, barely. it sleeps ${RITE} s.`);
  return Math.max(0, p.hp - 1);
});

/** the saint's last lens: the rooms behind one wall go on your map (when you move) */
const lensAt = new WeakMap<Game, string>();
tickHooks.push((g, _dt) => {
  const lens = perked(g, 'camera', 'xray')[0];
  if (!lens) return;
  const p = g.player;
  const [i, j] = [Math.floor(p.x), Math.floor(p.y)];
  const r = Math.min(10, param<number>(lens, 'range', 10));
  const k = `${i},${j},${g.chunks.size}`;
  if (lensAt.get(g) === k) return;
  lensAt.set(g, k);
  for (let y = j - r; y <= j + r; y++)
    for (let x = i - r; x <= i + r; x++)
      if (Math.hypot(x - i, y - j) <= r && !g.seen.has(`${x},${y}`) && open(g, x + 0.5, y + 0.5) && throughOne(g, p.x, p.y, x + 0.5, y + 0.5)) {
        g.seen.add(`${x},${y}`);
        // and the walls round a cell it saw
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!open(g, x + dx + 0.5, y + dy + 0.5)) g.seen.add(`${x + dx},${y + dy}`);
      }
});
