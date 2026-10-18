// Shard fanfare (playtest r1: the zone's prize was told as "you take: memory card"). Taking a
// scripture shard says so in big letters: "SCRIPTURE SHARD 1 of 3", a gold pulse on the screen
// (src/fight/ui.ts), and the console names what it opened.
import { say, tickHooks } from '../core/game';
import { active, param } from '../core/mods';
import type { Game } from '../core/types';
import { SHARDS } from '../world/cards';

/** shards held or read; and the last fanfare, per game, for the screen to pick up */
export const shardsHeld = (g: Game): number =>
  SHARDS.filter((s) => g.cards.includes(s.id) || g.player.inv.some((i) => i.kind === 'card' && i.card === s.id)).length;
export const fanfares = new WeakMap<Game, { n: number; t: number }>();

/** what each shard opens, once read */
const OPENS = ["the engine's distance from where you woke", "the engine's bearing", 'the whole way to the thaw engine'];

tickHooks.push((g) => {
  const n = shardsHeld(g);
  const last = fanfares.get(g)?.n ?? 0;
  if (n <= last) return;
  fanfares.set(g, { n, t: g.t });
  g.events.push({ type: 'shard', data: n });
  const reads = active(g, 'mind').some((i) => param<string>(i, 'what', '') === 'reader');
  say(
    g,
    `SCRIPTURE SHARD ${n} of 3.`,
    [`it opens ${OPENS[n - 1]}. `, reads ? { text: 'read card', cmd: 'read card' } : 'a card reader reads it.'],
  );
});
