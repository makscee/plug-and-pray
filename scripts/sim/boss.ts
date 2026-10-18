// A headless boss fight for balance (scripts/boss-sim.mjs): a careful player with the floor's usual loadout
// (src/fight/bosses.ts LOADOUTS) fights one boss in a staged arena. It reads a wind-up a reaction time after
// it starts, steps off the zones it will hit, strafes across bullets heading its way, keeps its weapons'
// range and shoots when it can. Now and then it misreads a wind-up (`sloppy`), like a person would.
import '../../src/mods';
import { newGame, tick } from '../../src/core/game';
import { clear, open } from '../../src/core/grid';
import { active, param } from '../../src/core/mods';
import { exec } from '../../src/core/verbs';
import { hash, rng } from '../../src/core/rng';
import type { Entity, Game } from '../../src/core/types';
import { BOSS, inZone, poolsOf, stageBoss, stunOf, type Zone } from '../../src/fight/bosses';
import { shots, type ShotData } from '../../src/fight/shots';
import { volley } from '../../src/fight/aim';

export interface Fight {
  boss: string;
  seed: number;
  won: boolean;
  t: number;
  hp: number;
  maxHp: number;
}

const DT = 0.05;

export function fight(floor: number, variant: string, seed: number, o: { react?: number; sloppy?: number; limit?: number; trace?: boolean } = {}): Fight {
  const g = newGame(seed);
  stageBoss(g, floor, variant);
  const { won } = duel(g, floor, seed, o);
  const p = g.player;
  return { boss: variant, seed, won, t: Math.round(g.t), hp: Math.max(0, Math.round(p.hp * 10) / 10), maxHp: p.maxHp };
}

/** fight the bosses standing in `g` now, until they are down, you are, or `limit` s more pass (v2 floors: the run
 *  sim, scripts/sim/brain.ts, hands its player over to this at each floor's keeper) */
export function duel(g: Game, floor: number, seed: number, o: { react?: number; sloppy?: number; limit?: number; trace?: boolean } = {}): { won: boolean } {
  const r = rng(hash(seed, 99, floor));
  const p = g.player;
  // the cradle and the choir walk in cell steps by keys: a little slower to react than free movement
  const react = (o.react ?? (floor <= 1 ? 0.4 : 0.32)) + r() * 0.1;
  const sloppy = o.sloppy ?? 0.12;
  const limit = g.t + (o.limit ?? 300);
  const speed = 2.5;
  const reach = Math.max(...active(g, 'weapon').map((i) => param<number>(i, 'range', 1.3)));
  const melee = reach < 3;
  const want = melee ? 1.1 : Math.min(reach - 1, 5);
  /** wind-ups it misread: it ignores their zones */
  const missed = new Set<string>();
  const seenShot = new Map<number, number>();
  let won = false;
  while (g.t < limit && !g.ended) {
    const bosses = g.ents.filter((e) => e.enemy && BOSS[e.enemy.type] && Math.abs(e.x - p.x) < 200);
    const up = bosses.filter((e) => Math.abs(e.x - p.x) < 1000);
    if (!bosses.length) {
      won = true;
      break;
    }
    // zones it knows of: wind-ups at least `react` old, not misread
    const zones: Zone[] = [];
    for (const e of bosses) {
      const d = e.enemy!.data;
      const zs = d.zones as Zone[] | null;
      if (!zs) continue;
      const key = `${e.id}:${d.windAt}`;
      if (g.t - Number(d.windAt ?? 0) < react && !d.under) continue;
      if (!missed.has(key + '?')) {
        missed.add(key + '?');
        if (r() < sloppy) missed.add(key);
      }
      if (missed.has(key)) continue;
      zones.push(...zs);
    }
    for (const s of shots(g)) if (!seenShot.has(s.id)) seenShot.set(s.id, g.t);
    // bullets: seen a reaction time after they fly, and some never (a person misses one in a crowd)
    const flying = shots(g).filter((s) => (s.data as unknown as ShotData).foe && g.t - (seenShot.get(s.id) ?? g.t) >= react * 0.8 && hash(seed, s.id) / 2 ** 32 > sloppy);
    const near = up.length ? up.reduce((a, b) => (dist(a, p) < dist(b, p) ? a : b)) : null;
    const danger = (x: number, y: number): number => {
      let k = 0;
      for (const z of zones) if (inZone(z, x, y)) k += 10;
      for (const q of poolsOf(g)) if (Math.hypot(x - q.x, y - q.y) <= q.r + 0.3) k += 6;
      for (const s of flying) {
        const d = s.data as unknown as ShotData;
        for (let tau = 0; tau <= 0.8; tau += 0.1) {
          const f = Math.min(1, (tau * speed) / Math.max(0.01, Math.hypot(x - p.x, y - p.y)));
          const [bx, by] = [p.x + (x - p.x) * f, p.y + (y - p.y) * f];
          if (Math.hypot(s.x + d.vx * tau - bx, s.y + d.vy * tau - by) < 0.6) k += 6 * (1 - tau);
        }
      }
      // contact: bosses and their brood
      for (const e of g.ents) if (e.enemy && Math.hypot(e.x - x, e.y - y) < (BOSS[e.enemy.type] ? 0.9 : 0.6)) k += 1;
      return k;
    };
    // a person decides about six times a second
    const think = Math.round(g.t / DT) % 3 === 0;
    if (g.t >= stunOf(g) && near && think) {
      let best: [number, number] = [p.x, p.y];
      let bestScore = Infinity;
      const cands: [number, number][] = [[p.x, p.y]];
      for (const step of [0.4, 0.9, 1.5])
        for (let a = 0; a < 16; a++) cands.push([p.x + Math.cos((a / 16) * Math.PI * 2) * step, p.y + Math.sin((a / 16) * Math.PI * 2) * step]);
      for (const [x, y] of cands) {
        if (!open(g, x + 0.25, y) || !open(g, x - 0.25, y) || !open(g, x, y + 0.25) || !open(g, x, y - 0.25)) continue;
        const range = Math.abs(dist({ x, y }, near) - want);
        // keep going the way it was going: a person does not zigzag every frame
        const [mx, my] = [x - p.x, y - p.y];
        const was = p.path[0] ? [p.path[0][0] - p.x, p.path[0][1] - p.y] : null;
        const turn = was && Math.hypot(...was) > 0.01 && Math.hypot(mx, my) > 0.01 ? 1 - (mx * was[0] + my * was[1]) / (Math.hypot(mx, my) * Math.hypot(was[0], was[1])) : 0;
        // and keep off the walls: a corner is where a slow thing catches you
        let walls = 0;
        for (const r of [1, 2.2]) for (let a = 0; a < 8; a++) if (!open(g, x + Math.cos((a * Math.PI) / 4) * r, y + Math.sin((a * Math.PI) / 4) * r)) walls += r < 2 ? 1 : 0.6;
        const score = walls * 0.35 + danger(x, y) * 10 + range + (clear(g, x, y, near.x, near.y) ? 0 : 2) + Math.hypot(mx, my) * 0.3 + turn * 0.4;
        if (score < bestScore) [bestScore, best] = [score, [x, y]];
      }
      const [dx, dy] = [best[0] - p.x, best[1] - p.y];
      const m = Math.hypot(dx, dy);
      // walk there as a path (the stepper's keys and the gyro's WASD both come to this)
      p.move = null;
      p.pace = speed;
      p.path = m < 0.05 ? [] : [best];
      p.faceLock = g.t + 1;
      p.dir = Math.atan2(near.x - p.x, -(near.y - p.y));
      if (volley(g).length && dist(near, p) <= reach && clear(g, p.x, p.y, near.x, near.y)) exec(g, 'shoot');
    }
    const at = g.log.length;
    tick(g, DT);
    if (o.trace && p.hurtAt === g.t) console.log('  hurt', g.t.toFixed(2), `at ${p.x.toFixed(2)},${p.y.toFixed(2)}`, bosses.map((e) => `${e.enemy!.data.atk} ${e.x.toFixed(1)},${e.y.toFixed(1)} d=${dist(e, p).toFixed(2)} wind=${Number(e.enemy!.data.windAt ?? 0).toFixed(2)}`).join(' '), 'zones', zones.length);
    if (o.trace) for (const l of g.log.slice(at)) console.log(g.t.toFixed(1), `hp ${p.hp.toFixed(1)}`, `boss ${bosses.map((e) => e.enemy!.hp.toFixed(1)).join('/')}`, l.map((x) => (typeof x === 'string' ? x : x.text)).join(''));
  }
  return { won: won && g.ended !== 'dead' };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export type { Entity, Game };
