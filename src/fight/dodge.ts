// The choir nave's foes dodge (v2 variety, floor 2): a seraph lamp or a mimic there is "poised" (a pale ◇
// over it, src/sight/variety.ts) and sidesteps the first shot of yours that would hit it: it flinches and
// slides a cell aside, and the shot flies on. Then it is spent for DODGE.every seconds (no ◇): shoot again.
// So the nave's new ranged weapon is played in pairs: draw the sidestep, then hit. Only your shots in
// flight (aimed weapons) are dodged; an auto weapon's bite is too close to step from.
import { say, tickHooks } from '../core/game';
import { open } from '../core/grid';
import type { Entity, Game } from '../core/types';
import { shots, type ShotData } from './shots';
import { floorAt } from '../world/floors';

export const DODGE = {
  /** floors where foes dodge, and who */
  floors: [1],
  who: ['seraph', 'mimic'],
  /** seconds spent after a sidestep */
  every: 3,
  /** how far it slides (cells), over how long */
  step: 1,
  secs: 0.2,
  /** it sees a shot coming this far off (cells), and steps if it would pass this close */
  sees: 3.5,
  close: 0.75,
};

/** this foe sidesteps shots here */
export const dodger = (e: Entity): boolean => !!e.enemy && DODGE.who.includes(e.enemy.type) && DODGE.floors.includes(floorAt(e.x)) && !e.enemy.data.boss;
/** poised: it will sidestep the next shot */
export const poised = (g: Game, e: Entity): boolean => dodger(e) && g.t >= Number(e.enemy!.data.dodgeAt ?? 0);

const told = new WeakMap<Game, number>();

tickHooks.push((g, dt) => {
  // slides under way
  for (const e of g.ents) {
    const s = e.enemy?.data.slide as [number, number, number] | undefined;
    if (!s) continue;
    if (g.t >= s[2]) {
      e.enemy!.data.slide = undefined;
      continue;
    }
    const [nx, ny] = [e.x + (s[0] * dt) / DODGE.secs, e.y + (s[1] * dt) / DODGE.secs];
    if (open(g, nx, ny)) [e.x, e.y] = [nx, ny];
  }
  const mine = shots(g).filter((s) => !(s.data as unknown as ShotData).foe);
  if (!mine.length) return;
  for (const e of g.ents) {
    if (!poised(g, e)) continue;
    for (const s of mine) {
      const d = s.data as unknown as ShotData;
      const v = Math.hypot(d.vx, d.vy) || 1;
      const [ux, uy] = [d.vx / v, d.vy / v];
      const [rx, ry] = [e.x - s.x, e.y - s.y];
      const ahead = rx * ux + ry * uy;
      const off = rx * uy - ry * ux;
      if (ahead <= 0 || ahead > Math.min(DODGE.sees, d.left + 0.5) || Math.abs(off) > DODGE.close) continue;
      // step to the side it already leans to, else the other, if a cell is open there
      const sides = (off >= 0 ? [1, -1] : [-1, 1]).map((k) => [uy * k, -ux * k] as [number, number]);
      const side = sides.find(([px, py]) => open(g, e.x + px * DODGE.step, e.y + py * DODGE.step) && open(g, e.x + px * DODGE.step * 0.5, e.y + py * DODGE.step * 0.5));
      if (!side) continue;
      const en = e.enemy!;
      en.data.slide = [side[0] * DODGE.step, side[1] * DODGE.step, g.t + DODGE.secs];
      en.data.dodgeAt = g.t + DODGE.every;
      en.data.flinch = g.t + 0.35;
      en.data.noticed = true;
      g.events.push({ type: 'dodge', at: [e.x, e.y], data: e.id });
      // said the first two times, then only now and then
      const n = (told.get(g) ?? 0) + 1;
      told.set(g, n);
      if (n <= 2 || n % 6 === 0) say(g, `${en.type === 'mimic' ? 'the mimic' : 'the seraph lamp'} sidesteps your shot: shoot twice.`);
      break;
    }
  }
});
