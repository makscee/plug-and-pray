// The reins (v2-view, floors 3 and 4: Maks 10-18 ~10:50 "later you get a control module which when enabled
// allows true fps controls, should be easy to go back to cursor controls"): with them on, `big` (Tab, or V) takes
// them: the eye's view is the screen already (src/sight/backdrop.ts), and now mouse-look turns you on a continuous angle, W/S walk and A/D strafe relative to the view, a click fires every
// ready aimed weapon down the crosshair as a hitscan (as far as the weapon reaches, never farther), and a
// melee lunge (F, right click, or a click with no aimed weapon) throws you forward into what you face.
// Tab again (or Esc) gives the cursor back. The mk2 reins add a dash (Shift) and hit markers. Pure core, no DOM:
// the screen side is src/sight/fps.ts.
import { dist, ENEMIES, say, strike, tickHooks } from '../core/game';
import { open } from '../core/grid';
import { active, def, families, family, param } from '../core/mods';
import { verb, VERBS } from '../core/verbs';
import type { Entity, Game, Inst } from '../core/types';
import { aimed, shotCooldown, volley } from '../fight/aim';
import { haste } from '../mods/weapon';
import { mouseAims } from '../fight/eye';
import { armed, warnUnarmed } from '../fight/unarmed';
import { SPRITES } from '../sight/sprites';

/** the reins that are on and warm: the ones with the highest mark */
export function reins(g: Game): Inst | undefined {
  return active(g, 'mind')
    .filter((i) => param<string>(i, 'what', '') === 'reins')
    .sort((a, b) => param<number>(b, 'big', 0) - param<number>(a, 'big', 0))[0];
}
/** the old name (the sims): the reins */
export const fpsEye = reins;
/** its mark: 0 none, 1 mk1, 2 mk2 */
export const mark = (g: Game): number => (fpsEye(g) ? param<number>(fpsEye(g)!, 'big', 0) : 0);

export interface Fps {
  /** the reins are taken: mouse-look, view-relative keys, click shoots (else the cursor is yours) */
  big: boolean;
  /** game time a dash ends, and its velocity (cells/s, east and south) */
  dashUntil: number;
  dashV: [number, number];
  /** game time the next dash is ready */
  dashReady: number;
  /** the last shot: when, and whether it hit, killed, or ran out of reach */
  shotAt: number;
  hitAt: number;
  killAt: number;
  /** where the last shot ended (cells from you along the view) */
  shotLen: number;
  lungeAt: number;
  /** walking velocity (cells/s, east and south) from the keys; src/core/game.ts's gyro walk is not used */
  move: [number, number] | null;
}
const state = new WeakMap<Game, Fps>();
export function fps(g: Game): Fps {
  let s = state.get(g);
  if (!s) state.set(g, (s = { big: false, dashUntil: -99, dashV: [0, 0], dashReady: 0, shotAt: -99, hitAt: -99, killAt: -99, shotLen: 0, lungeAt: -99, move: null }));
  return s;
}
/** the reins are taken and work: mouse-look and view-relative keys apply */
export const bigOn = (g: Game): boolean => fps(g).big && !!reins(g);
// the eye's snap to threats never turns the view under the mouse
mouseAims.push(bigOn);

/** walking speed in the big view (cells/s) */
export const WALK = 2.6;
export const DASH = { cells: 2.2, secs: 0.16, cooldown: 1.1 };
export const LUNGE = { cells: 0.6, secs: 0.12, reach: 0.7 };

/** forward and side in -1..1 (W/S, D/A): free movement relative to the view */
export function fpsMove(g: Game, fwd: number, side: number): void {
  const p = g.player;
  const s = fps(g);
  if (!fwd && !side) {
    s.move = null;
    return;
  }
  p.path = p.path.slice(0, 1);
  const fx = Math.sin(p.dir), fy = -Math.cos(p.dir);
  let vx = fwd * fx - side * fy;
  let vy = fwd * fy + side * fx;
  const r = Math.hypot(vx, vy) || 1;
  const r0 = reins(g);
  const speed = r0 ? param<number>(r0, 'speed', WALK) : WALK;
  vx = (vx / r) * speed;
  vy = (vy / r) * speed;
  s.move = [vx, vy];
}

/** turn by `by` radians (positive: to the right), any angle */
export function fpsTurn(g: Game, by: number): void {
  const p = g.player;
  p.dir = (((p.dir + by) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/** a body's hit radius for a ray: about the width of its sprite */
export const radius = (e: Entity): number => Math.max(0.25, (SPRITES[e.enemy?.type ?? '']?.size ?? 0.6) * 0.4);

/** where a ray from you along `dir` stops: the first enemy it passes within its radius, or the wall, or `range` */
export function ray(g: Game, dir: number, range: number): { foe: Entity | null; len: number } {
  const p = g.player;
  const fx = Math.sin(dir), fy = -Math.cos(dir);
  // the wall first: march in small steps
  let wall = range;
  for (let d = 0.05; d <= range; d += 0.05)
    if (!open(g, p.x + fx * d, p.y + fy * d)) {
      wall = d;
      break;
    }
  let best: Entity | null = null;
  let bestD = wall;
  for (const e of g.ents) {
    if (!e.enemy) continue;
    const ex = e.x - p.x, ey = e.y - p.y;
    const along = ex * fx + ey * fy;
    if (along <= 0 || along > bestD + radius(e)) continue;
    const off = Math.abs(ex * fy - ey * fx);
    if (off > radius(e)) continue;
    // the near face of its body
    const d = Math.max(0, along - Math.sqrt(Math.max(0, radius(e) ** 2 - off ** 2)));
    if (d <= bestD) {
      best = e;
      bestD = d;
    }
  }
  return { foe: best, len: bestD };
}

/** a shot down the crosshair lands harder (v2 r1 fight: the FPS floors were balanced without it; +25% feels better than −20% boss hp) */
export const FPS_DAMAGE = 1.25;

/** fire every ready aimed weapon down the view: a hitscan as far as each one reaches. Returns hits. */
export function fpsFire(g: Game): number {
  const ready = volley(g);
  const s = fps(g);
  if (!ready.length) {
    if (!aimed(g).length) return lunge(g) ? 1 : 0;
    return 0;
  }
  let hits = 0;
  s.shotAt = g.t;
  for (const i of ready) {
    const until = g.t + shotCooldown(g, i);
    for (const c of aimed(g).filter((x) => x.mod === i.mod)) c.data.readyAt = until;
    const { foe, len } = ray(g, g.player.dir, param<number>(i, 'range', 6));
    s.shotLen = len;
    g.events.push({ type: 'shoot', data: i.uid });
    if (!foe) continue;
    hits++;
    foe.enemy!.data.noticed = true;
    strike(g, foe, param<number>(i, 'damage', 1) * FPS_DAMAGE);
    s.hitAt = g.t;
    if (!g.ents.includes(foe)) s.killAt = g.t;
  }
  return hits;
}

/** the melee lunge: a short throw forward, and every ready auto weapon strikes what is in front */
export function lunge(g: Game): boolean {
  const s = fps(g);
  const p = g.player;
  if (g.t - s.lungeAt < 0.35) return false;
  // nothing to strike with: say so plainly (v2-ui), once a moment, and still throw yourself forward
  if (!armed(g) && g.t - s.lungeAt > 2) warnUnarmed(g);
  s.lungeAt = g.t;
  const fx = Math.sin(p.dir), fy = -Math.cos(p.dir);
  push(g, fx, fy, LUNGE.cells / LUNGE.secs, LUNGE.secs);
  let hit = false;
  for (const w of active(g, 'weapon').filter((i) => param<string>(i, 'aim', 'auto') === 'auto')) {
    if (g.t < ((w.data.readyAt as number) ?? 0)) continue;
    const reach = param<number>(w, 'range', 1.3) + LUNGE.reach;
    // what is in front: within reach, inside a 40° cone of the view
    const front = g.ents
      .filter((e) => e.enemy && dist(e, p) <= reach)
      .filter((e) => {
        const a = Math.atan2(e.x - p.x, -(e.y - p.y)) - p.dir;
        return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < (40 * Math.PI) / 180 || dist(e, p) < 0.6;
      })
      .sort((a, b) => dist(a, p) - dist(b, p));
    if (!front.length) continue;
    w.data.readyAt = g.t + param<number>(w, 'cooldown', 1) / haste(g);
    for (const t of param(w, 'sweep', false) ? front : front.slice(0, 1)) {
      strike(g, t, param<number>(w, 'damage', 1));
      hit = true;
      s.hitAt = g.t;
      if (!g.ents.includes(t)) s.killAt = g.t;
    }
  }
  g.events.push({ type: 'lunge' });
  return hit;
}

/** a short burst of movement (the dash and the lunge): it slides along walls like walking */
function push(g: Game, vx: number, vy: number, speed: number, secs: number): void {
  const s = fps(g);
  s.dashUntil = g.t + secs;
  s.dashV = [vx * speed, vy * speed];
}

/** mk2: dash the way you are moving (or forward) */
export function dash(g: Game): boolean {
  const s = fps(g);
  const p = g.player;
  if (mark(g) < 2 || g.t < s.dashReady) return false;
  const [mx, my] = s.move ?? [Math.sin(p.dir), -Math.cos(p.dir)];
  const r = Math.hypot(mx, my) || 1;
  push(g, mx / r, my / r, DASH.cells / DASH.secs, DASH.secs);
  s.dashReady = g.t + DASH.cooldown;
  g.events.push({ type: 'dash' });
  return true;
}

// walking and the burst (dash, lunge) move you, sliding along walls; leaving the big view or the eye stops you
tickHooks.push((g, dt) => {
  const s = state.get(g);
  if (!s) return;
  if (!bigOn(g)) {
    s.big = s.big && !!reins(g);
    s.move = null;
    s.dashUntil = -99;
    return;
  }
  if (s.move) slide(g, s.move[0], s.move[1], dt);
  if (g.t < s.dashUntil) slide(g, s.dashV[0], s.dashV[1], dt);
});

/** move by (vx, vy)·dt with the body's radius, sliding along walls */
function slide(g: Game, vx: number, vy: number, dt: number): void {
  const p = g.player;
  const R = 0.25;
  const nx = p.x + vx * dt;
  if (open(g, nx + Math.sign(vx) * R, p.y - R) && open(g, nx + Math.sign(vx) * R, p.y + R)) p.x = nx;
  const ny = p.y + vy * dt;
  if (open(g, p.x - R, ny + Math.sign(vy) * R) && open(g, p.x + R, ny + Math.sign(vy) * R)) p.y = ny;
}

// the reins' window: one button, take them or give the cursor back (src/body/input.ts locks the mouse on its click)
const mind = families.mind;
family('mind', {
  ...mind,
  buttons: (g, inst) => (param<string>(inst, 'what', '') === 'reins' ? [{ label: bigOn(g) ? 'cursor (tab)' : 'take the reins (tab)', cmd: 'big' }] : mind?.buttons?.(g, inst) ?? []),
});

/** said once per run: taking the reins and letting go teach their keys the first time only */
const taught = new WeakMap<Game, Set<string>>();
verb('big', {
  help: 'the reins: take them (the mouse looks, a click shoots, wasd walks) or give the cursor back (key tab)',
  when: (g) => !!reins(g),
  whenFail: () => "no reins on. the saint's reins (floor 3) give you the eye to turn with the mouse.",
  run(g) {
    const s = fps(g);
    s.big = !s.big;
    s.move = null;
    let t = taught.get(g);
    if (!t) taught.set(g, (t = new Set()));
    const k = s.big ? 'on' : 'off';
    if (t.has(k)) return;
    t.add(k);
    say(g, s.big ? 'you take the reins. the mouse turns you, a click shoots, wasd walks the way you look. tab gives the cursor back.' : 'you let the reins go: the cursor is yours, for the windows. tab takes them again.');
  },
});

verb('lunge', {
  help: 'the reins: throw yourself forward; melee weapons strike what you face (key f)',
  when: (g) => !!reins(g),
  run(g) {
    if (!lunge(g) && armed(g) && !active(g, 'weapon').some((i) => param<string>(i, 'aim', 'auto') === 'auto')) say(g, 'you lunge, but nothing you wear strikes up close: click shoots.');
  },
});

verb('dash', {
  help: "the martyr's reins: a quick dash the way you move (key shift)",
  when: (g) => mark(g) >= 2,
  run(g) {
    if (!dash(g)) say(g, 'the dash is still winding.');
  },
});

// `shoot` typed with the big view up fires down the crosshair too, never turning you
const shoot = VERBS.shoot;
if (shoot) {
  const run = shoot.run;
  shoot.run = (g, args) => (bigOn(g) ? void fpsFire(g) : run(g, args));
}

/** a weapon's name, its reach and how soon it fires: the HUD's line */
export function weaponState(g: Game): { name: string; range: number; wait: number; cool: number }[] {
  return active(g, 'weapon').map((i) => {
    const aim = param<string>(i, 'aim', 'auto') === 'aimed';
    const cool = aim ? shotCooldown(g, i) : param<number>(i, 'cooldown', 1) / haste(g);
    return { name: def(i).name, range: param<number>(i, 'range', aim ? 6 : 1.3), wait: Math.max(0, ((i.data.readyAt as number) ?? 0) - g.t), cool };
  });
}

/** the boss or elite after you, for the HUD's bar */
export function bossOf(g: Game): Entity | undefined {
  return g.ents
    .filter((e) => (e.enemy?.data.boss || e.enemy?.data.elite) && e.enemy.data.noticed && dist(e, g.player) < 14)
    .sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];
}
export const nameOf = (e: Entity): string => (ENEMIES[e.enemy!.type]?.name ?? 'something').replace(/^(a|an|the) /, '');
