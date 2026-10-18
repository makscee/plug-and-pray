// Shots in flight: props with `data.shot`, ticked every step. An enemy's orb hurts you on contact;
// yours strikes the first enemy it touches (the hum too: it hides from cameras, not from nails).
import { hurt, spawn, strike, tickHooks } from '../core/game';
import { open } from '../core/grid';
import type { Entity, Game } from '../core/types';
import { fx } from '../fx/attacks';

export interface ShotData {
  shot: true;
  vx: number;
  vy: number;
  dmg: number;
  /** cells it still flies */
  left: number;
  /** fired by an enemy (hurts you) or by you (hurts them) */
  foe: boolean;
  /** who fired it: id and enemy type, for the ward's return and the death line */
  src: number;
  type?: string;
  /** its look (src/fight/bolts.ts: bolt, slag, ...) and how close it must pass to hit; old shots have neither */
  kind?: string;
  r?: number;
  /** your weapon's name, for the miss line ("your nail psalm strikes stone") */
  name?: string;
}

export function fire(g: Game, o: { x: number; y: number; vx: number; vy: number; dmg: number; range: number; src: Entity | null; foe: boolean; kind?: string; r?: number; name?: string }): Entity {
  const data: ShotData = { shot: true, vx: o.vx, vy: o.vy, dmg: o.dmg, left: o.range, foe: o.foe, src: o.src?.id ?? 0, type: o.src?.enemy?.type };
  if (o.name) data.name = o.name;
  if (o.kind) data.kind = o.kind;
  if (o.r) data.r = o.r;
  return spawn(g, { kind: 'prop', x: o.x, y: o.y, data: data as unknown as Record<string, unknown> });
}

export const shots = (g: Game): Entity[] => g.ents.filter((e) => e.kind === 'prop' && e.data?.shot);

const HIT = 0.45;

/** v2r6 newcomer (half his shots in the bell-ringer's room struck its pillars): low stone your shots fly over.
 *  src/fight/bosses.ts sets it to the pillars of the floor 1-2 keepers' rooms; foes' shots still break on them */
export const low: { at: (g: Game, x: number, y: number) => boolean } = { at: () => false };
/** open to your shots */
export const openShot = (g: Game, x: number, y: number): boolean => open(g, x, y) || low.at(g, x, y);
/** a clear line for your shots (src/core/grid.ts clear, low stone counted open) */
export function clearShot(g: Game, ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (!openShot(g, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/** the last foe shot that reached you: when, whose, which way it flew (src/fight/aim.ts names an unseen one's way) */
export const bolted = new WeakMap<Game, { t: number; from: Entity; vx: number; vy: number }>();

export function tickShots(g: Game, dt: number): void {
  for (const s of shots(g)) {
    const d = s.data as unknown as ShotData;
    const speed = Math.hypot(d.vx, d.vy);
    const n = Math.max(1, Math.ceil((speed * dt) / 0.2));
    let gone = false;
    for (let k = 0; k < n && !gone; k++) {
      s.x += (d.vx * dt) / n;
      s.y += (d.vy * dt) / n;
      d.left -= (speed * dt) / n;
      const free = d.foe ? open(g, s.x, s.y) : openShot(g, s.x, s.y);
      if (!free || d.left <= 0) {
        gone = true;
        // your shot struck nothing: a soft whiff, never the hit sound (Maks 10-18); v2r5 run: on a wall or a
        // pillar it says so (a pillar in the line read as "you miss ×2" for a minute)
        if (!d.foe) fx(g, 'spark', s.x, s.y);
        if (!d.foe) g.events.push({ type: 'miss', at: [s.x, s.y], data: !free ? { stone: true, name: d.name } : undefined });
      }
      else if (d.foe) {
        if (Math.hypot(s.x - g.player.x, s.y - g.player.y) < (d.r ?? HIT)) {
          const from = g.ents.find((e) => e.id === d.src) ?? { id: d.src, kind: 'enemy' as const, x: s.x, y: s.y, enemy: { type: d.type ?? 'seraph', hp: 0, readyAt: 0, data: {} } };
          bolted.set(g, { t: g.t, from, vx: d.vx, vy: d.vy });
          hurt(g, d.dmg, from);
          gone = true;
        }
      } else {
        // a boss is bigger: its own hit radius on top (src/fight/bosses.ts)
        const t = g.ents.find((e) => e.enemy && Math.hypot(e.x - s.x, e.y - s.y) < HIT + Number(e.enemy.data.r ?? 0));
        if (t) {
          fx(g, 'spark', t.x, t.y);
          strike(g, t, d.dmg);
          gone = true;
        }
      }
    }
    if (gone) g.ents = g.ents.filter((e) => e !== s);
    if (g.ended) return;
  }
}

tickHooks.push(tickShots);

/** foe shots flying at you within `r` cells that will pass within `wide` cells of you, nearest first */
export function incoming(g: Game, r = 3, wide = 0.8): Entity[] {
  const p = g.player;
  const near = (s: Entity) => Math.hypot(p.x - s.x, p.y - s.y);
  return shots(g)
    .filter((s) => {
      const d = s.data as unknown as ShotData;
      const [rx, ry] = [p.x - s.x, p.y - s.y];
      const v = Math.hypot(d.vx, d.vy) || 1;
      return d.foe && near(s) < r && rx * d.vx + ry * d.vy > 0 && Math.abs(rx * d.vy - ry * d.vx) / v < wide;
    })
    .sort((a, b) => near(a) - near(b));
}

/** the way `at` lies from you, as a compass word */
export const compass = (g: Game, at: { x: number; y: number }): string => {
  const deg = ((Math.atan2(at.x - g.player.x, -(at.y - g.player.y)) * 180) / Math.PI + 360) % 360;
  return ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round(deg / 45) % 8];
};

/** the way `at` lies from where you face: ahead, right, behind, left (the FPS view's words) */
export const sideOf = (g: Game, at: { x: number; y: number }): string => {
  let a = Math.atan2(at.x - g.player.x, -(at.y - g.player.y)) - g.player.dir;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return ['behind', 'the left', 'ahead', 'the right', 'behind'][Math.round((a + Math.PI) / (Math.PI / 2))];
};

/** the HUD's bolt warning: how many come, from where ('' when none); `facing` names the way from your view */
export function boltWarn(g: Game, r = 3, facing = false): string {
  const c = incoming(g, r);
  if (!c.length) return '';
  return `bolt${c.length > 1 ? `s ×${c.length}` : ''} from ${facing ? sideOf(g, c[0]) : compass(g, c[0])}: step aside`;
}
