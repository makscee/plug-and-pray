// Enemy projectiles from floor 3 on (v2): foes that shoot back, so you dodge. A shot is the fight slice's
// `fire` (src/fight/shots.ts) with a `kind` the eyes draw glowing (src/sight/fps.ts) and a hit radius.
// Each ranged foe draws breath first (`data.windup` and `data.move`: the attack pose and the HUD's ⚠),
// so a bolt is always seen coming; a sidestep of half a cell clears one.
//   floor 3 (the ossuary): seraph lamps aim bolts at you, not only down their lines
//   floor 4 (the furnace): pyre seraphs fan three bolts; walkers spit slag, slow and fat
// Bosses (src/fight/bosses.ts) reuse `bolt`, `spread` and `ring` for their patterns.
import { clear } from '../core/grid';
import { dist, ENEMIES, say } from '../core/game';
import type { Entity, Game } from '../core/types';
import { fire } from './shots';
import { zoneAt } from '../world/zones';

/** what each kind of shot is: speed (cells/s), hit radius (cells), how far it flies */
export const KINDS: Record<string, { speed: number; r: number; range: number }> = {
  bolt: { speed: 5, r: 0.35, range: 11 },
  slag: { speed: 3.2, r: 0.45, range: 8 },
  /** for bosses: a big slow ball and a quick needle */
  ball: { speed: 2.4, r: 0.55, range: 12 },
  needle: { speed: 7.5, r: 0.28, range: 12 },
};

/** the floor you are on: 0 cradle .. 4 the heart (src/world/floors.ts sets `g.floor`; before that, the zone) */
export const floorNow = (g: Game): number => {
  const f = (g as unknown as { floor?: number }).floor;
  return typeof f === 'number' ? f : zoneAt(g.player.x, g.player.y);
};
/** foes shoot back from this floor on (0-based: floor 3, the ossuary) */
export const RANGED_FROM = 2;

/** one shot from `from` at an angle (0 = north, clockwise) */
export function bolt(g: Game, from: Entity, angle: number, o: { kind?: string; dmg?: number; speed?: number } = {}): Entity {
  const k = KINDS[o.kind ?? 'bolt'] ?? KINDS.bolt;
  const speed = o.speed ?? k.speed;
  const [fx, fy] = [Math.sin(angle), -Math.cos(angle)];
  const dmg = o.dmg ?? (ENEMIES[from.enemy?.type ?? '']?.damage ?? 1) * 0.7;
  return fire(g, { x: from.x + fx * 0.3, y: from.y + fy * 0.3, vx: fx * speed, vy: fy * speed, dmg, range: k.range, src: from, foe: true, kind: o.kind ?? 'bolt', r: k.r });
}

/** the angle from `from` to you */
export const aimAt = (g: Game, from: { x: number; y: number }): number => Math.atan2(g.player.x - from.x, -(g.player.y - from.y));

/** `n` shots fanned over `arc` radians, centred on you */
export function spread(g: Game, from: Entity, n: number, arc: number, o: { kind?: string; dmg?: number; speed?: number } = {}): void {
  const mid = aimAt(g, from);
  for (let k = 0; k < n; k++) bolt(g, from, mid + (n === 1 ? 0 : (k / (n - 1) - 0.5) * arc), o);
}

/** `n` shots all round, turned by `turn` radians */
export function ring(g: Game, from: Entity, n: number, turn = 0, o: { kind?: string; dmg?: number; speed?: number } = {}): void {
  for (let k = 0; k < n; k++) bolt(g, from, turn + (k / n) * Math.PI * 2, o);
}

/** a foe that draws breath, then lets go: true while it is busy aiming (its own walk waits) */
function aimed(g: Game, e: Entity, o: { reach: number; min?: number; every: number; windup: number; move: string; shoot: () => void }): boolean {
  const d = e.enemy!.data;
  if (typeof d.aimAt === 'number') {
    if (g.t < d.aimAt) return true;
    d.aimAt = undefined;
    d.windup = 0;
    d.move = '';
    o.shoot();
    return false;
  }
  const r = dist(e, g.player);
  if (r > o.reach || r < (o.min ?? 0) || g.t < ((d.boltAt as number) ?? 0) || !clear(g, e.x, e.y, g.player.x, g.player.y)) return false;
  d.noticed = true;
  d.boltAt = g.t + o.every;
  d.aimAt = d.windup = g.t + o.windup;
  d.windAt = g.t;
  d.move = o.move;
  told(g, e);
  return true;
}

/** the first ranged foe of a kind a run meets: one line on how to dodge */
const toldOf = new WeakMap<Game, Set<string>>();
function told(g: Game, e: Entity): void {
  let s = toldOf.get(g);
  if (!s) toldOf.set(g, (s = new Set()));
  const type = e.enemy!.type;
  if (s.has(type)) return;
  s.add(type);
  const what = type === 'walker' ? `${ENEMIES[type].name} spits slag` : `${ENEMIES[type].name} fires bolts`;
  say(g, `⚠ ${what} at you. watch the glow and step aside: strafe (a/d) or put a wall between.`);
  g.events.push({ type: 'warn', at: [e.x, e.y] });
}

/** arm the ranged foes: wraps the fight slice's AIs (called once they are registered, src/fight/index.ts) */
const armed = new Set<string>();
export function arm(): void {
  const wrap = (type: string, f: (g: Game, e: Entity, dt: number, base: (g: Game, e: Entity, dt: number) => void) => void) => {
    const d = ENEMIES[type];
    if (!d || armed.has(type)) return;
    armed.add(type);
    const base = d.ai ?? (() => {});
    d.ai = (g, e, dt) => f(g, e, dt, base);
  };
  // seraph lamps aim at you: a bolt every cooldown, wherever you stand in their sight
  wrap('seraph', (g, e, dt, base) => {
    if (floorNow(g) < RANGED_FROM) return base(g, e, dt);
    const d = ENEMIES.seraph;
    aimed(g, e, { reach: d.sense, every: d.cooldown + 1, windup: 0.6, move: 'seraph draws a bolt', shoot: () => bolt(g, e, aimAt(g, e)) });
  });
  // pyre seraphs fan three: the middle one at you, so step wide
  wrap('pyre', (g, e, dt, base) => {
    if (floorNow(g) < RANGED_FROM) return base(g, e, dt);
    const d = ENEMIES.pyre;
    aimed(g, e, { reach: d.sense, every: d.cooldown + 1.2, windup: 0.6, move: 'pyre fans its flame', shoot: () => spread(g, e, 3, 0.55, { dmg: d.damage * 0.45 }) });
  });
  // furnace walkers spit slag from afar, then walk in for the arm
  wrap('walker', (g, e, dt, base) => {
    if (floorNow(g) < 3) return base(g, e, dt);
    if (e.enemy!.data.windup && typeof e.enemy!.data.aimAt !== 'number') return base(g, e, dt); // its arm is up
    const d = ENEMIES.walker;
    if (aimed(g, e, { reach: 5.5, min: 2.5, every: 6, windup: 0.7, move: 'walker gathers slag', shoot: () => bolt(g, e, aimAt(g, e), { kind: 'slag', dmg: d.damage * 0.45 }) })) return;
    base(g, e, dt);
  });
}
