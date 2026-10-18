// The console's account of a fight: your hits, kills, and what hits you. Blows are gathered for a
// moment and told as one line ("you hit choir mite ×3 · choir mite hits you ×2 · hp 7/10"), so a
// fight reads as a few lines, not a wall of them (Maks 10-18); a kill is told at once.
import { ENEMIES, hurtHooks, say, tickHooks } from '../core/game';
import type { Game } from '../core/types';

const KILL: Record<string, string> = {
  mite: 'the mite bursts.',
  seraph: 'the seraph lamp gutters out.',
  pyre: 'the pyre seraph burns down to a wick.',
  walker: 'the ossuary walker folds into its bones.',
  abbot: 'the bone abbot kneels, and comes apart.',
  warden: 'the choir warden falls silent.',
  saint: 'the furnace saint goes out.',
  hum: 'the hum goes quiet.',
  mimic: 'the mimic splits. it was never a module.',
};

/** how long blows are gathered before they are told */
export const GATHER = 1.2;

interface Tally { start: number; hit: Map<string, number>; took: Map<string, number> }
const tallies = new WeakMap<Game, Tally>();

const short = (type: string) => (ENEMIES[type]?.name ?? 'it').replace(/^(a|an|the) /, '');
const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const times = (n: number) => (n > 1 ? ` ×${n}` : '');

function tally(g: Game): Tally {
  let t = tallies.get(g);
  if (!t || (!t.hit.size && !t.took.size)) tallies.set(g, (t = { start: g.t, hit: new Map(), took: new Map() }));
  return t;
}

/** tell what was gathered, as one line */
export function flush(g: Game): void {
  const t = tallies.get(g);
  if (!t || (!t.hit.size && !t.took.size)) return;
  const parts = [...[...t.hit].map(([k, n]) => `you hit ${k}${times(n)}`), ...[...t.took].map(([k, n]) => `${k} hits you${times(n)}`)];
  if (t.took.size) parts.push(`hp ${hpText(g.player.hp)}/${g.player.maxHp}`);
  tallies.delete(g);
  say(g, parts.join(' · ') + '.');
}

tickHooks.push((g) => {
  const killed = new Set(g.events.filter((e) => e.type === 'kill').map((e) => e.at!.join()));
  for (const ev of g.events) {
    if (ev.type === 'kill') {
      flush(g);
      say(g, KILL[ev.data as string] ?? 'it stops.');
    } else if (ev.type === 'hit' && !killed.has(ev.at!.join())) {
      const e = g.ents.find((x) => x.id === ev.data);
      if (e?.enemy) count(tally(g).hit, short(e.enemy.type));
    }
  }
  const t = tallies.get(g);
  if (t && g.t - t.start >= GATHER) flush(g);
});

// last of the hurt hooks (registered after the body's): gather what got through
hurtHooks.push((g, n, from) => {
  if (n <= 0) return n;
  count(tally(g).took, from?.enemy ? short(from.enemy.type) : 'something');
  // the blow that ends you is told at once, before the end
  if (g.player.hp - n <= 0) {
    g.player.hp -= n;
    flush(g);
    g.player.hp += n;
  }
  return n;
});

/** hp as shown: whole numbers, or halves after armour (9.5) */
export const hpText = (hp: number): string => String(Math.max(0, Math.ceil(hp * 2) / 2));
