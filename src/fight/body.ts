// HP and the body: slow regeneration after a few quiet seconds, body modules on top of it
// (more hp, faster regen, armour off each hit), and the mirror ward that returns the next hit.
import { dist, hurt, REACH, say, START_HP, strike, tickHooks, hurtHooks, ENEMIES } from '../core/game';
import { clear } from '../core/grid';
import { COLD, HEAT, SEAR, zoneAt } from '../world/zones';
import { active, family, param } from '../core/mods';
import { light } from '../sight/lamp';
import type { Game, Inst } from '../core/types';

/** hp per second with no body module, once you have gone QUIET seconds without damage */
export const REGEN = 0.5; // r1 econ: was 0.2 after 4 s; now no mending in a fight (6 s quiet), then a short rest
export const QUIET = 6;

const body = (g: Game): Inst[] => active(g, 'body');

/** no mending mid-fight (r2: dancing with the abbot mended 10 → 14 between sweeps): a foe after you within
 *  FIGHT cells in plain sight, or an elite you hit in the last ELITE_FIGHT s */
export const FIGHT = 6;
export const ELITE_FIGHT = 10;
export function fighting(g: Game): boolean {
  const p = g.player;
  return g.ents.some((e) => {
    const d = e.enemy?.data;
    if (!d) return false;
    if (d.elite && g.t - ((d.hitAt as number) ?? -99) < ELITE_FIGHT) return true;
    return !!d.noticed && !ENEMIES[e.enemy!.type]?.hidden && dist(e, p) <= FIGHT && clear(g, p.x, p.y, e.x, e.y);
  });
}
const sum = (g: Game, key: string) => body(g).reduce((s, i) => s + param<number>(i, key, 0), 0);

export function tickBody(g: Game, dt: number): void {
  const p = g.player;
  p.maxHp = START_HP + (p.flesh ?? 0) + sum(g, 'hp');
  if (p.hp > p.maxHp) p.hp = p.maxHp;
  const z = zoneAt(p.x, p.y);
  // the ossuary's cold: no mending without light (a lamp, or a glowing module; body modules still mend,
  // at half). A rime hood carries that chill everywhere: the furnace's answer costs you elsewhere.
  const cold = (z === COLD || (z !== HEAT && sum(g, 'chill') > 0)) && !light(g);
  const regen = cold ? sum(g, 'regen') / 2 : REGEN + sum(g, 'regen');
  if (g.t - p.hurtAt >= QUIET && p.hp < p.maxHp && !fighting(g)) p.hp = Math.min(p.maxHp, p.hp + regen * dt);
  // the furnace's heat sears unless something keeps it off
  if (z === HEAT) {
    const sear = SEAR * Math.max(0, 1 - sum(g, 'heatproof')) * dt;
    if (sear > 0) {
      if (p.hp - sear <= 0) {
        say(g, 'the furnace burns you down.');
        hurt(g, p.hp + 1);
      } else p.hp -= sear;
    }
  }
  // the suture moth: a quick stitch when you are below half, then it rests
  for (const i of body(g)) {
    const mend = param<number>(i, 'mend', 0);
    if (!mend || p.hp >= p.maxHp / 2 || g.t < ((i.data.mendAt as number) ?? 0)) continue;
    i.data.mendAt = g.t + param<number>(i, 'recharge', 20);
    p.hp = Math.min(p.maxHp, p.hp + mend);
    say(g, `the suture moth stitches you: +${mend} hp.`);
  }
}
tickHooks.push(tickBody);

const wardReady = (g: Game, i: Inst) => g.t >= ((i.data.wardAt as number) ?? 0);

// a foe's zone first: the deep ones hit harder (src/world/zones.ts FOE)
hurtHooks.unshift((g, n, from) => {
  const src = from && (g.ents.find((e) => e.id === from.id) ?? from);
  const mult = (src?.enemy?.data.mult as number) ?? 1;
  return n * mult;
});

// the ward first: it takes the whole hit and sends it back; then armour softens what is left
hurtHooks.push((g, n, from) => {
  if (n <= 0) return n;
  const ward = body(g).find((i) => param(i, 'ward', false) && wardReady(g, i));
  if (!ward) return n;
  ward.data.wardAt = g.t + param<number>(ward, 'recharge', 8);
  const src = from && g.ents.find((e) => e === from || e.id === from.id);
  say(g, src?.enemy ? `the mirror ward throws the hit back at ${ENEMIES[src.enemy.type]?.name ?? 'it'}.` : 'the mirror ward drinks the hit.');
  if (src?.enemy) strike(g, src, n);
  return 0;
});
hurtHooks.push((g, n) => (n > 0 ? Math.max(n > 0.5 ? 0.25 : 0, n - sum(g, 'armour')) : n));
// thorns: whatever strikes you up close takes some back
hurtHooks.push((g, n, from) => {
  const thorns = sum(g, 'thorns');
  const src = from && g.ents.find((e) => e.id === from.id);
  if (thorns > 0 && n > 0 && src?.enemy && dist(src, g.player) <= REACH + 0.2) strike(g, src, thorns);
  return n;
});

family('body', {
  status: (g, inst) => (param(inst, 'ward', false) ? [[wardReady(g, inst) ? 'ward: ready' : 'ward: recharging']] : []),
});
