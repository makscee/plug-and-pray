// HP and the body: slow regeneration after a few quiet seconds, body modules on top of it
// (more hp, faster regen, armour off each hit), and the mirror ward that returns the next hit.
import { say, START_HP, strike, tickHooks, hurtHooks, ENEMIES } from '../core/game';
import { active, family, param } from '../core/mods';
import type { Game, Inst } from '../core/types';

/** hp per second with no body module, once you have gone QUIET seconds without damage */
export const REGEN = 0.1;
export const QUIET = 4;

const body = (g: Game): Inst[] => active(g, 'body');
const sum = (g: Game, key: string) => body(g).reduce((s, i) => s + param<number>(i, key, 0), 0);

export function tickBody(g: Game, dt: number): void {
  const p = g.player;
  p.maxHp = START_HP + sum(g, 'hp');
  if (p.hp > p.maxHp) p.hp = p.maxHp;
  if (g.t - p.hurtAt >= QUIET && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + (REGEN + sum(g, 'regen')) * dt);
}
tickHooks.push(tickBody);

const wardReady = (g: Game, i: Inst) => g.t >= ((i.data.wardAt as number) ?? 0);

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
hurtHooks.push((g, n) => (n > 0 ? Math.max(0, n - sum(g, 'armour')) : n));

family('body', {
  status: (g, inst) => (param(inst, 'ward', false) ? [[wardReady(g, inst) ? 'ward: ready' : 'ward: recharging']] : []),
});
