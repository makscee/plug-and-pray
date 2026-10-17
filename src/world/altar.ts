// Altars: old machines that take an offering. `offer power` grows the core's power for good and `offer
// flesh` your max hp (the prices climb with each one), `offer mend` buys a full mend. They are the steady sink for what you gather:
// one near where you woke (chunk 1,1), then now and then farther out.
import { chunkHook } from '../core/grid';
import { dist, say, spawn, tickHooks } from '../core/game';
import { hash, rng } from '../core/rng';
import { verb } from '../core/verbs';
import type { Chunk, Entity, Game, Res } from '../core/types';
import { spot } from './gen';
import { affords, fmt, type Cost } from './printer';

/** the core's power can grow to this at altars */
export const MAX_CORE = 14;

/** the price of the next point of power: it climbs with every one */
export function powerCost(g: Game): Cost {
  const n = Math.max(0, g.player.core - 6);
  const c: Cost = { bone: 3 + 2 * n, glass: 1 + n };
  if (n >= 1) c.copper = n;
  if (n >= 3) c.ichor = 1 + (n >= 6 ? 1 : 0);
  return c;
}
export const MEND: Cost = { bone: 2 };
/** max hp an altar can add, two at a time */
export const MAX_FLESH = 12;
export function fleshCost(g: Game): Cost {
  const n = (g.player.flesh ?? 0) / 2;
  const c: Cost = { bone: 4 + 2 * n, copper: 1 + n };
  if (n >= 2) c.ichor = 1;
  return c;
}

export const altarNear = (g: Game): Entity | undefined => g.ents.find((e) => e.data?.altar && dist(e, g.player) < 1.6);

/** what an altar offers now: [command, price] */
export function offers(g: Game, _e: Entity): [string, Cost][] {
  const out: [string, Cost][] = [];
  if (g.player.core < MAX_CORE) out.push(['offer power', powerCost(g)]);
  if ((g.player.flesh ?? 0) < MAX_FLESH) out.push(['offer flesh', fleshCost(g)]);
  if (g.player.hp < g.player.maxHp * 0.7) out.push(['offer mend', MEND]);
  return out;
}

function pay(g: Game, c: Cost): void {
  for (const [r, n] of Object.entries(c)) {
    const it = g.player.inv.find((i) => i.kind === 'res' && i.res === (r as Res));
    if (it && it.kind === 'res') it.n -= n!;
  }
  g.player.inv = g.player.inv.filter((i) => i.kind !== 'res' || i.n > 0);
}

const menu = (g: Game) => [
  g.player.core < MAX_CORE ? [{ text: 'offer power', cmd: 'offer power' }, `  +1 power for good: ${fmt(powerCost(g))}`] : ['  power: the core is full.'],
  (g.player.flesh ?? 0) < MAX_FLESH ? [{ text: 'offer flesh', cmd: 'offer flesh' }, `  +2 max hp for good: ${fmt(fleshCost(g))}`] : ['  flesh: as much as it can give.'],
  [{ text: 'offer mend', cmd: 'offer mend' }, `  mend fully: ${fmt(MEND)}`],
];

verb('offer', {
  help: 'at an altar: offer power, offer flesh, offer mend',
  when: (g) => !!altarNear(g),
  run(g, [what]) {
    const e = altarNear(g);
    if (!e) return say(g, 'no altar within reach.');
    const p = g.player;
    if (what === 'power') {
      if (p.core >= MAX_CORE) return say(g, 'the altar is quiet. your core can hold no more.');
      const c = powerCost(g);
      if (!affords(g, c)) return say(g, `the altar wants ${fmt(c)}.`);
      pay(g, c);
      p.core++;
      g.events.push({ type: 'print', at: [e.x, e.y] });
      return say(g, `the altar drinks it. your core runs warmer: power ${p.core} at the core.`);
    }
    if (what === 'flesh') {
      if ((p.flesh ?? 0) >= MAX_FLESH) return say(g, 'the altar has no more to give you.');
      const c = fleshCost(g);
      if (!affords(g, c)) return say(g, `the altar wants ${fmt(c)}.`);
      pay(g, c);
      p.flesh = (p.flesh ?? 0) + 2;
      p.hp += 2;
      g.events.push({ type: 'print', at: [e.x, e.y] });
      return say(g, `the altar knits you more of yourself: +2 max hp.`);
    }
    if (what === 'mend') {
      if (!affords(g, MEND)) return say(g, `the altar wants ${fmt(MEND)}.`);
      pay(g, MEND);
      p.hp = p.maxHp;
      return say(g, 'the altar closes your wounds.');
    }
    say(g, 'an altar. it wants an offering.', ...menu(g));
  },
});

chunkHook((g: Game, c: Chunk) => {
  const far = Math.hypot(c.cx, c.cy);
  const r = rng(hash(g.seed, 71, c.cx, c.cy));
  if (!((c.cx === 1 && c.cy === 1) || (far >= 2 && r.chance(0.12)))) return;
  const [x, y] = spot(g.seed, c.cx, c.cy, 7, c);
  spawn(g, { kind: 'prop', x, y, data: { altar: true } });
});

/** walking up to an altar shows its offers, once per altar */
tickHooks.push((g) => {
  const e = altarNear(g);
  if (!e || e.data!.greeted) return;
  e.data!.greeted = true;
  say(g, 'an altar stands here, stained and patient.', ...menu(g));
});

