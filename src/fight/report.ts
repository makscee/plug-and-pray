// The console's account of a fight: your hits, kills, and what hits you.
import { ENEMIES, hurtHooks, say, tickHooks } from '../core/game';

const KILL: Record<string, string> = {
  mite: 'the mite bursts.',
  seraph: 'the seraph lamp gutters out.',
  walker: 'the ossuary walker folds into its bones.',
  hum: 'the hum goes quiet.',
  mimic: 'the mimic splits. it was never a module.',
};

tickHooks.push((g) => {
  const killed = new Set(g.events.filter((e) => e.type === 'kill').map((e) => e.at!.join()));
  for (const ev of g.events) {
    if (ev.type === 'kill') say(g, KILL[ev.data as string] ?? 'it stops.');
    else if (ev.type === 'hit' && !killed.has(ev.at!.join())) {
      const e = g.ents.find((x) => x.id === ev.data);
      if (e?.enemy) say(g, `you hit ${ENEMIES[e.enemy.type]?.name ?? 'it'}.`);
    }
  }
});

// last of the hurt hooks (registered after the body's): say what got through
hurtHooks.push((g, n, from) => {
  if (n <= 0) return n;
  const p = g.player;
  const who = from?.enemy ? ENEMIES[from.enemy.type]?.name ?? 'something' : 'something';
  say(g, `${who} hits you. hp ${hpText(p.hp - n)}/${p.maxHp}`);
  return n;
});

/** hp as shown: whole numbers, or halves after armour (9.5) */
export const hpText = (hp: number): string => String(Math.max(0, Math.ceil(hp * 2) / 2));
