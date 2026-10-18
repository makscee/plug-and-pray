// Shots in flight: props with `data.shot`, ticked every step. An enemy's orb hurts you on contact;
// yours strikes the first enemy it touches (the hum too: it hides from cameras, not from nails).
import { hurt, spawn, strike, tickHooks } from '../core/game';
import { open } from '../core/grid';
import type { Entity, Game } from '../core/types';

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
}

export function fire(g: Game, o: { x: number; y: number; vx: number; vy: number; dmg: number; range: number; src: Entity | null; foe: boolean }): Entity {
  const data: ShotData = { shot: true, vx: o.vx, vy: o.vy, dmg: o.dmg, left: o.range, foe: o.foe, src: o.src?.id ?? 0, type: o.src?.enemy?.type };
  return spawn(g, { kind: 'prop', x: o.x, y: o.y, data: data as unknown as Record<string, unknown> });
}

export const shots = (g: Game): Entity[] => g.ents.filter((e) => e.kind === 'prop' && e.data?.shot);

const HIT = 0.45;

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
      if (!open(g, s.x, s.y) || d.left <= 0) {
        gone = true;
        // your shot struck nothing: a soft whiff, never the hit sound (Maks 10-18)
        if (!d.foe) g.events.push({ type: 'miss', at: [s.x, s.y] });
      }
      else if (d.foe) {
        if (Math.hypot(s.x - g.player.x, s.y - g.player.y) < HIT) {
          const from = g.ents.find((e) => e.id === d.src) ?? { id: d.src, kind: 'enemy' as const, x: s.x, y: s.y, enemy: { type: d.type ?? 'seraph', hp: 0, readyAt: 0, data: {} } };
          hurt(g, d.dmg, from);
          gone = true;
        }
      } else {
        // a boss is bigger: its own hit radius on top (src/fight/bosses.ts)
        const t = g.ents.find((e) => e.enemy && Math.hypot(e.x - s.x, e.y - s.y) < HIT + Number(e.enemy.data.r ?? 0));
        if (t) {
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
