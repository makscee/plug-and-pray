// The fight slice: the enemy roster and their behaviours, shots in flight, aimed weapons, hp and
// the body modules, drops and the console's account of a fight. src/fight/ui.ts is the screen side.
import { chase, ENEMIES, enemy, hurt, LEASH, REACH, say, tickHooks } from '../core/game';
import { clear, open } from '../core/grid';
import { hash } from '../core/rng';
import type { Entity, Game, Line } from '../core/types';
import { fire } from './shots';
import { zoneAt } from '../world/zones';
import './shots';
import './aim';
import './body';
import './mimic';
import './spawn';
import './drops';
import './report';
import './eye';
import './warn';
import './shard';
import './death';

const near = (a: Entity, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** orb speed (cells/s) for the lamp kind: the furnace's burn faster */
const ORB: Record<string, number> = { seraph: 2.2, pyre: 3.6, saint: 4 };

/** the seraph lamp stays put; when you stand in its row or column it sends a slow orb down the line */
function seraph(g: Game, e: Entity): void {
  const d = ENEMIES[e.enemy!.type];
  const p = g.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const inLine = Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6;
  if (!inLine || near(e, p) > d.sense || !clear(g, e.x, e.y, p.x, p.y) || g.t < e.enemy!.readyAt) return;
  e.enemy!.readyAt = g.t + d.cooldown;
  const [vx, vy] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  if (!e.enemy!.data.noticed) {
    e.enemy!.data.noticed = true;
    say(g, 'a seraph lamp turns its light on you.');
  }
  const speed = ORB[e.enemy!.type] ?? 2.2;
  fire(g, { x: e.x, y: e.y, vx: vx * speed, vy: vy * speed, dmg: d.damage, range: d.sense + 2, src: e, foe: true });
}

/** a melee blow that winds up first, so you can step away: the walker's arm, the abbot's sweep.
 *  `data.windup` (game time it lands) shows on camera as the attack frame; `data.move` names it in the HUD */
function swing(g: Game, e: Entity, o: { windup: number; reach: number; say: string; move: string; miss: string; hit?: number; opens?: boolean }): boolean {
  const p = g.player;
  const en = e.enemy!;
  if (!en.data.windup) {
    if (near(e, p) > o.reach || g.t < en.readyAt) return false;
    en.data.windup = g.t + o.windup;
    en.data.windAt = g.t; // when it began: the sim's player reacts a moment after (scripts/sim/brain.ts)
    en.data.move = o.move;
    en.data.wide = o.reach > 2; // a reach this wide shows as a wider pose and a ring on the map
    say(g, o.say);
    return true;
  }
  if (g.t < (en.data.windup as number)) return true;
  en.data.windup = 0;
  en.data.move = '';
  en.data.wide = false;
  en.readyAt = g.t + ENEMIES[en.type].cooldown;
  if (near(e, p) <= o.reach + 0.2) hurt(g, ENEMIES[en.type].damage * (o.hit ?? 1), e);
  else if (o.opens) opened(g, e, o.miss);
  else say(g, o.miss);
  return true;
}

/** a dodged big move leaves an elite open: OPEN.secs of OPEN.mult damage taken (strike, src/core/game.ts) */
export const OPEN = { secs: 2, mult: 1.5 };
function opened(g: Game, e: Entity, line: string): void {
  e.enemy!.data.open = g.t + OPEN.secs;
  say(g, `${line} it is open: hit it now.`);
}

/** the walker: slow, heavy; it winds up before it hits, so you can step away */
function walker(g: Game, e: Entity, dt: number): void {
  const arm = { windup: 0.8, reach: REACH, say: 'the ossuary walker lifts its arm.', move: 'walker lifts its arm', miss: 'its arm comes down on nothing.' };
  if (swing(g, e, arm)) return;
  if (near(e, g.player) > 1.1) chase(g, e, dt);
}

/** the bone abbot: a walker's arm, and every third blow a slow sweep that reaches two cells round it
 *  (wide, so it lands softer: SWEEP of a blow) */
export const SWEEP = 0.5;
function abbot(g: Game, e: Entity, dt: number): void {
  const en = e.enemy!;
  const sweep = ((en.data.blows as number) ?? 0) % 3 === 2;
  const o = sweep
    ? { windup: 1.2, reach: 2.3, say: '⚠ the bone abbot raises both arms. it will sweep: get two cells away.', move: 'abbot raises both arms', miss: 'the sweep cuts the air.', hit: SWEEP, opens: true }
    : { windup: 0.8, reach: REACH, say: 'the bone abbot lifts its arm.', move: 'abbot lifts its arm', miss: 'its arm comes down on nothing.' };
  const was = en.data.windup;
  if (swing(g, e, o)) {
    if (was && !en.data.windup) en.data.blows = ((en.data.blows as number) ?? 0) + 1;
    return;
  }
  if (near(e, g.player) > 1.1) chase(g, e, dt);
}

/** a mite rears up for a moment before it bites (it used to bite on contact). Each rear is REAR plus up to
 *  REAR_RAND, and each cooldown is off by up to ±JITTER, so a swarm bites in a stream, not in volleys of six
 *  (playtest r2: ×6 bites at once, 10 → 0 hp in 8.5 s) */
export const REAR = 0.3;
export const REAR_RAND = 0.3;
export const JITTER = 0.4;
/** a steady 0..1 for this mite's nth bite: the sim stays repeatable */
const roll = (e: Entity, salt: number) => hash(e.id, Number(e.enemy!.data.bites ?? 0), salt) / 2 ** 32;
function mite(g: Game, e: Entity, dt: number): void {
  const en = e.enemy!;
  const p = g.player;
  if (en.data.windup) {
    if (g.t < (en.data.windup as number)) return;
    en.data.windup = 0;
    en.data.move = '';
    en.data.bites = Number(en.data.bites ?? 0) + 1;
    en.readyAt = g.t + ENEMIES[en.type].cooldown + (roll(e, 2) * 2 - 1) * JITTER;
    if (near(e, p) <= REACH + 0.2) hurt(g, ENEMIES[en.type].damage, e);
    return;
  }
  // walk like any chaser, but keep its bite for after the rear
  const ready = en.readyAt;
  en.readyAt = Infinity;
  chase(g, e, dt);
  en.readyAt = ready;
  if (en.data.noticed && near(e, p) <= REACH && g.t >= ready) {
    // the first bite spreads wider: a swarm arrives together, it should not bite together
    en.data.windup = g.t + REAR + roll(e, 1) * (REAR_RAND + (en.data.bites ? 0 : JITTER));
    en.data.move = 'mite rears';
  }
}

/** the choir warden: a chaser that draws breath, then dashes three cells down the line it saw you on.
 *  Step aside and it overshoots and reels for a moment: your free hits. */
export const DASH = { windup: 1, cells: 3.5, speed: 9, cooldown: 8, stun: 1.5, hit: 1, min: 1.2, back: 2 };
function warden(g: Game, e: Entity, dt: number): void {
  const en = e.enemy!;
  const p = g.player;
  const d = en.data;
  if (g.t < ((d.stun as number) ?? 0)) return;
  // the windup holds the line it saw you on (`dash`); then it goes
  if (d.windup) {
    // in a corridor it backs off down the line first: room for you to step back round a corner
    const back = (d.back as number) ?? 0;
    if (back > 0 && d.dash) {
      const [vx, vy] = d.dash as [number, number];
      const step = Math.min(back, DASH.back * 2 * dt);
      const [nx, ny] = [e.x - vx * step, e.y - vy * step];
      if (open(g, nx - vx * 0.3, ny - vy * 0.3)) [e.x, e.y] = [nx, ny];
      d.back = back - step;
      d.backed = ((d.backed as number) ?? 0) + step;
    }
    if (g.t < (d.windup as number)) return;
    d.windup = 0;
    d.move = '';
    d.left = DASH.cells + ((d.backed as number) ?? 0);
    d.back = 0;
    d.backed = 0;
    return;
  }
  if (d.dash) {
    const [vx, vy] = d.dash as [number, number];
    const step = DASH.speed * dt;
    const nx = e.x + vx * step;
    const ny = e.y + vy * step;
    d.left = (d.left as number) - step;
    const blocked = !open(g, nx + vx * 0.3, ny + vy * 0.3);
    if (!blocked) [e.x, e.y] = [nx, ny];
    if (near(e, p) < 0.75) {
      d.dash = null;
      en.readyAt = g.t + ENEMIES[en.type].cooldown;
      hurt(g, ENEMIES[en.type].damage * DASH.hit, e);
    } else if (blocked || (d.left as number) <= 0) {
      d.dash = null;
      d.stun = g.t + DASH.stun;
      say(g, 'the warden\'s rush misses. it reels: hit it now.');
    }
    return;
  }
  chase(g, e, dt);
  const post = d.post as [number, number] | undefined;
  const leashed = post && Math.hypot(p.x - post[0], p.y - post[1]) > LEASH;
  const r = near(e, p);
  if (!d.noticed || leashed || r < DASH.min || r > 4.5 || g.t < ((d.dashAt as number) ?? 0) || !clear(g, e.x, e.y, p.x, p.y)) return;
  d.dashAt = g.t + DASH.cooldown;
  const [vx, vy] = [(p.x - e.x) / r, (p.y - e.y) / r];
  d.dash = [vx, vy];
  // a corridor (walls both sides of its line): no side to step to, so it backs off first
  const [sx, sy] = Math.abs(vx) > Math.abs(vy) ? [0, 1] : [1, 0];
  const corridor = !open(g, e.x + sx, e.y + sy) && !open(g, e.x - sx, e.y - sy);
  d.back = corridor ? DASH.back : 0;
  d.windup = g.t + DASH.windup + (corridor ? 0.5 : 0);
  d.windAt = g.t;
  d.move = 'warden draws breath';
  say(g, corridor ? '⚠ the choir warden backs off and draws breath. no room to step aside: get round a corner.' : '⚠ the choir warden draws breath. step aside.');
}

/** the furnace saint: a seraph's line, and every few seconds a telegraphed cross down all four lines */
/** `near`: it only bothers when you come within this many cells */
export const CROSS = { windup: 1, cooldown: 7, speed: 4, hit: 0.5, near: 5 };
function saint(g: Game, e: Entity, dt: number): void {
  const en = e.enemy!;
  const p = g.player;
  const d = en.data;
  if (d.windup) {
    if (g.t < (d.windup as number)) return;
    d.windup = 0;
    d.move = '';
    const dmg = ENEMIES[en.type].damage * CROSS.hit;
    // down all four of its lines at once, wherever you are: crossing its lines is never safe
    for (const [vx, vy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      fire(g, { x: e.x, y: e.y, vx: vx * CROSS.speed, vy: vy * CROSS.speed, dmg, range: ENEMIES[en.type].sense + 2, src: e, foe: true });
    en.readyAt = g.t + ENEMIES[en.type].cooldown;
    // you were off all four lines when it let go: its light is spent a moment
    if (Math.abs(p.x - e.x) >= 0.6 && Math.abs(p.y - e.y) >= 0.6) opened(g, e, 'the cross burns past you.');
    return;
  }
  if (near(e, p) <= CROSS.near && g.t >= ((d.crossAt as number) ?? 0) && clear(g, e.x, e.y, p.x, p.y)) {
    d.crossAt = g.t + CROSS.cooldown;
    d.windup = g.t + CROSS.windup;
    d.windAt = g.t;
    d.move = 'saint gathers a cross';
    say(g, '⚠ the furnace saint gathers its light into a cross. get off its lines.');
    return;
  }
  seraph(g, e);
}

/** the hum: hidden, and it keeps to the deep (zone 2 on): walk out of the ossuary and it lets you go */
function hum(g: Game, e: Entity, dt: number): void {
  const p = g.player;
  if (zoneAt(p.x, p.y) < 2) {
    e.enemy!.data.noticed = false;
    // it lets you go: it backs off into the deep instead of hanging at your shoulder unseen
    const r = near(e, p);
    if (r < 3 && r > 0.01) {
      const step = ENEMIES.hum.speed * dt;
      const [nx, ny] = [e.x - ((p.x - e.x) / r) * step, e.y - ((p.y - e.y) / r) * step];
      if (open(g, nx, ny)) [e.x, e.y] = [nx, ny];
    }
    return;
  }
  chase(g, e, dt);
}

enemy('mite', { name: 'a choir mite', hp: 1, speed: 2, damage: 0.5, cooldown: 1.8, sense: 6, ai: mite }); // playtest 10-18: many more mites early, each bites softer (was 1)
enemy('seraph', { name: 'a seraph lamp', hp: 3, speed: 0, damage: 1.5, cooldown: 3.5, sense: 8, ai: seraph });
enemy('walker', { name: 'an ossuary walker', hp: 5, speed: 0.7, damage: 2, cooldown: 2.5, sense: 7, ai: walker, armour: 1.2 }); // r1 econ: was 0.6; bone armour wants big hits (bone lance, saw, heat lance), not nail stacks
enemy('hum', { name: 'the hum', hp: 4, speed: 1.1, damage: 1, cooldown: 2, sense: 5, hidden: true, ai: hum });
enemy('mimic', { name: 'a mimic', hp: 3, speed: 1.4, damage: 1.5, cooldown: 1.6, sense: 8 });
// zones (balance pass): the furnace's lamp, and one elite per zone guarding its shard (src/world/vectors.ts)
enemy('pyre', { name: 'a pyre seraph', hp: 3, speed: 0, damage: 1.5, cooldown: 2.4, sense: 9, ai: seraph });
enemy('warden', { name: 'the choir warden', hp: 10, speed: 1.7, damage: 1.5, cooldown: 1.3, sense: 7, ai: warden }); // r4 final: 10 (seed 42 lost by 1-2 hp). r2 loop: hp ×1.4 (was 8, 13, 20): long enough for its telegraphs to matter
enemy('abbot', { name: 'the bone abbot', hp: 18, speed: 0.8, damage: 4, cooldown: 2.2, sense: 8, ai: abbot, armour: 1.2 });
enemy('saint', { name: 'the furnace saint', hp: 28, speed: 0, damage: 3.5, cooldown: 1.8, sense: 10, ai: saint });
/** the elite that guards each zone's shard (zone 3's also guards the engine) */
export const ELITE = ['', 'warden', 'abbot', 'saint'];

/** what the shard's guard is like, for the card that points at it (src/world/vectors.ts) */
export const GUARD_HINT: Record<string, string> = {
  warden: 'the choir warden keeps it. it draws breath, then rushes: step aside.',
  abbot: 'the bone abbot keeps it. bone shrugs off small hits. it lifts its arm: step back; it raises both arms: get two cells away.',
  saint: 'the furnace saint keeps it. it burns down its lines, and crosses all four at once: come at it on a diagonal.',
};

/** an elite back at its post with you gone is whole again: walking off to mend no longer wins for free */
tickHooks.push((g) => {
  const p = g.player;
  for (const e of g.ents) {
    const d = e.enemy?.data;
    const post = d?.post as [number, number] | undefined;
    if (!d?.elite || !post) continue;
    const max = Number(d.maxHp ?? e.enemy!.hp);
    const home = Math.hypot(e.x - post[0], e.y - post[1]) < 0.3;
    // past its leash is gone (r2: standing at 7.5–9 cells let you mend while it stayed hurt)
    const gone = Math.hypot(p.x - post[0], p.y - post[1]) > LEASH;
    const quiet = g.t - ((d.hitAt as number) ?? -99) > 3;
    // far off again: the next approach is a new encounter, warned of again (src/fight/warn.ts)
    if (Math.hypot(p.x - post[0], p.y - post[1]) > 16) d.warned = false;
    if (!home || !gone || !quiet) continue;
    if (e.enemy!.hp >= max) continue;
    e.enemy!.hp = max;
    say(g, `${ENEMIES[e.enemy!.type].name} settles at its post, whole again.`);
  }
});

/** struck while walking: you stop where you are (r2: `go n 9` walked on through a swarm, ×6 bites at a time),
 *  with the way back as a button */
const halted = new WeakMap<Game, number>();
tickHooks.push((g) => {
  const p = g.player;
  if (g.ended || p.hurtAt !== g.t || p.path.length < 2) return;
  const [tx, ty] = p.path[p.path.length - 1];
  const [dx, dy] = [tx - p.x, ty - p.y];
  const back = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'w' : 'e') : dy > 0 ? 'n' : 's';
  p.path = [[Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5]];
  if (g.t - (halted.get(g) ?? -99) < 3) return;
  halted.set(g, g.t);
  const by = g.ents.find((e) => e.enemy && Math.hypot(e.x - p.x, e.y - p.y) <= REACH + 0.3)?.enemy?.type;
  const line: Line = [`${by === 'mite' ? 'bitten' : 'struck'}. you stop. `, { text: `go ${back} 3`, cmd: `go ${back} 3` }, ' back the way you came'];
  say(g, line);
});
