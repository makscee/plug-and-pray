// Set pieces with a choice (v2r2 fun: the 24 pieces were named loot piles; none asked anything). Seven of
// them offer one deal with a price, once: take it, or leave it. The console says it when you walk up, and
// src/ui/choice.ts shows it as a small card in the door card's style. `choose 1` takes the first deal.
import { dist, say, tickHooks } from '../core/game';
import { def, label, rarityKey } from '../core/mods';
import { hash, rng } from '../core/rng';
import { addItem, verb } from '../core/verbs';
import type { Entity, Game, Item, Line } from '../core/types';
import { foe } from '../fight/spawn';
import { dealUnique } from '../mods/uniques';
import { bossDown, farAt, floorAt, stairsAt } from './floors';
import { pieceOf, pieceProps } from './piecefill';
import { lootMod } from './spawn';
import { bearing } from './vectors';

export interface Deal {
  /** the button: what you do */
  label: string;
  /** what it costs, plain words */
  price: string;
  /** why not now, or null */
  why?: (g: Game, e: Entity) => string | null;
  run: (g: Game, e: Entity) => void;
}
export interface Choice {
  /** the question, under the piece's name */
  ask: string;
  deals: Deal[];
}

const boneOf = (g: Game) => g.player.inv.reduce((s, i) => s + (i.kind === 'res' && i.res === 'bone' ? i.n : 0), 0);
function payBone(g: Game, n: number): boolean {
  const pile = g.player.inv.find((i) => i.kind === 'res' && i.res === 'bone');
  if (!pile || pile.kind !== 'res' || pile.n < n) return false;
  pile.n -= n;
  if (!pile.n) g.player.inv = g.player.inv.filter((i) => i !== pile);
  return true;
}
/** a module one tier deeper than the place, rare when it can be */
function rare(g: Game, e: Entity, salt: number): Item {
  const it = lootMod(rng(hash(g.seed, 149, e.id, salt)), farAt(e.x, e.y) + 1, undefined, floorAt(e.x) === 0);
  if (it.kind === 'mod' && rarityKey(it)) it.rarity = 'rare';
  return it;
}
/** into your bag; its name for the line */
function give(g: Game, it: Item): string {
  addItem(g, it);
  return it.kind === 'mod' ? label(it) : '';
}
/** foes round the centrepiece, already awake */
function wake(g: Game, e: Entity, type: string, n: number): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    for (const r of [3, 2.5, 2, 3.5]) {
      const [x, y] = [Math.floor(e.x + Math.cos(a) * r) + 0.5, Math.floor(e.y + Math.sin(a) * r) + 0.5];
      if (dist({ x, y }, g.player) < 1.5) continue;
      const f = foe(g, type, x, y);
      if (!f.enemy) continue;
      f.enemy.data.noticed = true;
      f.enemy.data.set = 'piece';
      break;
    }
  }
}
const hpWhy = (n: number) => (g: Game) => (g.player.hp <= n + 0.5 ? `you have ${Math.ceil(g.player.hp)} hp; it wants ${n} and would leave you nothing` : null);
/** the module in your bag worth least: what the sarcophagus and the anvil take */
const spare = (g: Game) =>
  g.player.inv
    .filter((i): i is Item & { kind: 'mod' } => i.kind === 'mod')
    .sort((a, b) => ({ common: 0, fine: 1, rare: 2, unique: 3 })[a.rarity ?? 'common'] - ({ common: 0, fine: 1, rare: 2, unique: 3 })[b.rarity ?? 'common'] || def(a).tier - def(b).tier)
    .find((i) => i.rarity !== 'unique');

/** the carried module the anvil tempers: the deepest common or fine one */
const temperable = (g: Game) =>
  g.player.inv
    .filter((i): i is Item & { kind: 'mod' } => i.kind === 'mod' && !!rarityKey(i) && i.rarity !== 'rare' && i.rarity !== 'unique')
    .sort((a, b) => def(b).tier - def(a).tier)[0];

export const CHOICES: Record<string, Choice> = {
  loom: {
    ask: 'the loom could weave a rib into you.',
    deals: [{
      label: 'weave', price: '3 bone: +2 max hp',
      why: (g) => (boneOf(g) < 3 ? `you carry ${boneOf(g)} bone` : null),
      run(g) {
        payBone(g, 3);
        g.player.flesh = (g.player.flesh ?? 0) + 2;
        g.player.hp += 2;
        say(g, 'the loom stitches a rib into your frame: +2 max hp.');
      },
    }],
  },
  nest: {
    ask: 'burn the nest, and what it guards drops: but every egg hatches at once.',
    deals: [{
      label: 'burn it', price: '4 mites wake: a rare module',
      run(g, e) {
        wake(g, e, 'mite', 4);
        say(g, `⚠ the nest bursts. four mites, and in the ash: ${give(g, rare(g, e, 1))}.`);
      },
    }],
  },
  lectern: {
    ask: 'read the last page, or break the lectern for its bone.',
    deals: [
      {
        label: 'read it', price: 'the way down, on your map',
        why: (g) => (bossDown(g) ? 'the way down stands open already' : null),
        run(g) {
          const f = g.floor ?? 0;
          const [x, y] = stairsAt(g.seed, f);
          if (!g.vectors.some((v) => v.what === 'way down' && v.x === x && v.y === y)) g.vectors.push({ card: 'lectern', x, y, what: 'way down', found: false });
          say(g, `the page is a map. vector: ${bearing(g, x, y)}. the way down, past its keeper. the page crumbles.`);
        },
      },
      {
        label: 'break it', price: '+5 bone',
        run(g) {
          addItem(g, { kind: 'res', res: 'bone', n: 5 });
          say(g, 'the lectern splits. +5 bone. the page burns before you can read it.');
        },
      },
    ],
  },
  saint: {
    ask: 'its palms are cupped for an offering. it takes from you.',
    deals: [{
      label: 'kneel', price: '3 hp: a rare module',
      why: hpWhy(3),
      run(g, e) {
        g.player.hp -= 3;
        g.player.hurtAt = g.t;
        say(g, `the saint drinks 3 hp. something warm settles in its palms: ${give(g, rare(g, e, 2))}.`);
      },
    }],
  },
  sarcophagus: {
    ask: 'lay a thing of yours in it, and something old comes back.',
    deals: [{
      label: 'lay one in', price: 'your weakest carried module: a unique',
      why: (g) => (spare(g) ? null : 'carry a module (not a unique) to lay in'),
      run(g) {
        const it = spare(g)!;
        g.player.inv = g.player.inv.filter((i) => i !== it);
        say(g, `you lay ${label(it)} in the coffin. the lid slides back by itself: ${give(g, dealUnique(g))}.`);
      },
    }],
  },
  charnel: {
    ask: 'the empty shelf holds something. the sleepers on the others would notice.',
    deals: [{
      label: 'take it', price: '2 walkers wake: a rare module',
      run(g, e) {
        wake(g, e, 'walker', 2);
        say(g, `⚠ you lift it off the shelf. two sleepers sit up. you hold ${give(g, rare(g, e, 3))}.`);
      },
    }],
  },
  forge: {
    ask: 'the anvil takes one thing and gives it back better: it wants you to hold it there.',
    deals: [{
      label: 'temper', price: '4 hp: a carried module comes back rare',
      why: (g) => hpWhy(4)(g) ?? (temperable(g) ? null : 'carry a common or fine module to temper'),
      run(g) {
        const it = temperable(g)!;
        g.player.hp -= 4;
        g.player.hurtAt = g.t;
        const was = label(it);
        it.rarity = 'rare';
        say(g, `the hammer falls, and you hold it there: 4 hp. ${was} comes off the anvil ${label(it)}.`);
      },
    }],
  },
};

/** the choice at a set piece you stand at (within 3 cells), not yet taken or left */
export function choiceNear(g: Game): { e: Entity; c: Choice } | null {
  for (const e of pieceProps(g)) {
    const pc = pieceOf(e);
    const c = pc && CHOICES[pc.id];
    if (c && !e.data!.chose && dist(e, g.player) < 3 && floorAt(e.x) === floorAt(g.player.x)) return { e, c };
  }
  return null;
}

/** the console's lines for it: the question, a button per deal (greyed ones say why), and leave */
export function choiceLines(g: Game, e: Entity, c: Choice): Line[] {
  const btns: Line = [];
  c.deals.forEach((d, k) => {
    const why = d.why?.(g, e);
    btns.push(k ? '   ' : '', why ? `${d.label} (${d.price}): ${why}` : { text: `${d.label}: ${d.price}`, cmd: `choose ${k + 1}` });
  });
  return [[c.ask], [...btns, '   ', { text: 'leave it', cmd: 'choose leave' }]];
}

verb('choose', {
  help: 'at a set piece that asks: choose 1 takes its deal, choose leave walks on',
  when: (g) => !!choiceNear(g),
  whenFail: () => 'nothing here asks you to choose.',
  run(g, [what]) {
    const n = choiceNear(g);
    if (!n) return say(g, 'nothing here asks you to choose.');
    const { e, c } = n;
    if (what === 'leave' || what === 'no') {
      e.data!.chose = 'left';
      return say(g, 'you leave it as it is.');
    }
    const d = c.deals[Math.max(0, Number(what || 1) - 1)];
    if (!d) return say(g, ...choiceLines(g, e, c));
    const why = d.why?.(g, e);
    if (why) return say(g, `not now: ${why}.`);
    e.data!.chose = d.label;
    g.events.push({ type: 'choose', at: [e.x, e.y], data: d.label });
    d.run(g, e);
  },
});

/** walking up to one: the question, once */
const asked = new WeakMap<Game, Set<number>>();
tickHooks.push((g) => {
  if (g.ended) return;
  const n = choiceNear(g);
  if (!n) return;
  let s = asked.get(g);
  if (!s) asked.set(g, (s = new Set()));
  if (s.has(n.e.id)) return;
  s.add(n.e.id);
  say(g, ...choiceLines(g, n.e, n.c));
});
