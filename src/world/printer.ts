// Printers: machines in some chambers that turn resources into a slot board (+1 slot, up to 8)
// or a random module of the area's tier. `print` at a printer lists both with their costs.
// Reliquaries are shop printers: three modules on show, each with its price; `buy 1`, `reroll`.
// `recycle <module>` anywhere grinds a carried module back into resources. Every price lives in
// PRICES below, so balance can tune them in one place.

import { dist, say, tickHooks } from '../core/game';
import { def, label } from '../core/mods';
import { does } from '../mods/describe';
import { hash, rng } from '../core/rng';
import { addItem, findInst, findItem, verb } from '../core/verbs';
import type { Entity, Game, Item, Line, Res } from '../core/types';
import { lootMod } from './spawn';

export const MAX_SLOTS = 8;
export type Cost = Partial<Record<Res, number>>;

/** every price and yield in one place: by module tier 0, 1, 2 (uniques never sell or recycle) */
export const PRICES = {
  print: [{ bone: 2, glass: 1 }, { bone: 2, glass: 2, copper: 1 }, { bone: 3, glass: 2, copper: 2, ichor: 1 }] as Cost[],
  shop: [{ bone: 2, copper: 1 }, { bone: 3, glass: 2, copper: 1 }, { bone: 4, glass: 3, copper: 2, ichor: 1 }] as Cost[],
  reroll: { bone: 1, glass: 1 } as Cost,
  scrap: [{ bone: 1, glass: 1 }, { bone: 2, glass: 1, copper: 1 }, { bone: 2, glass: 2, copper: 1, ichor: 1 }] as Cost[],
};

export function slotCost(g: Game): Cost {
  const n = g.player.slots - 3;
  const c: Cost = { bone: 3 + 2 * n, copper: 2 + n };
  if (g.player.slots >= 5) c.glass = 2;
  if (g.player.slots >= 6) c.ichor = 1;
  return c;
}

export const tierAt = (far: number) => (far < 2 ? 0 : far < 4 ? 1 : 2);
export function modCost(far: number): Cost {
  return PRICES.print[tierAt(far)];
}

const have = (g: Game, res: Res) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === res ? i.n : 0), 0);
export const fmt = (c: Cost) => Object.entries(c).map(([r, n]) => `${n} ${r}`).join(', ');
export const affords = (g: Game, c: Cost) => Object.entries(c).every(([r, n]) => have(g, r as Res) >= n!);

function pay(g: Game, c: Cost): void {
  for (const [r, n] of Object.entries(c)) {
    const it = g.player.inv.find((i) => i.kind === 'res' && i.res === r);
    if (it && it.kind === 'res') it.n -= n!;
  }
  g.player.inv = g.player.inv.filter((i) => i.kind !== 'res' || i.n > 0);
}

export const printerNear = (g: Game): Entity | undefined =>
  g.ents.filter((e) => e.kind === 'printer' && !e.data?.shop && dist(e, g.player) < 1.6).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];

function menu(g: Game, e: Entity): Line[] {
  const far = (e.data?.far as number) ?? 0;
  const slot: Line = g.player.slots >= MAX_SLOTS ? ['  slots: the board is full (8).'] : [{ text: 'print slot', cmd: 'print slot' }, `  +1 slot: ${fmt(slotCost(g))}`];
  return [slot, [{ text: 'print module', cmd: 'print module' }, `  a module: ${fmt(modCost(far))}`]];
}

verb('print', {
  help: 'at a printer: print slot, print module',
  run(g, [what]) {
    const e = printerNear(g);
    if (!e) return say(g, 'no printer within reach.');
    const far = (e.data?.far as number) ?? 0;
    if (what === 'slot') {
      if (g.player.slots >= MAX_SLOTS) return say(g, 'the board is full: eight slots.');
      const c = slotCost(g);
      if (!affords(g, c)) return say(g, `the printer wants ${fmt(c)}.`);
      pay(g, c);
      g.player.slots++;
      g.events.push({ type: 'print', at: [e.x, e.y] });
      return say(g, `the printer grinds out a slot board. slots: ${g.player.slots}.`);
    }
    if (what === 'module') {
      const c = modCost(far);
      if (!affords(g, c)) return say(g, `the printer wants ${fmt(c)}.`);
      pay(g, c);
      const made = ((e.data!.made as number) ?? 0) + 1;
      e.data!.made = made;
      const it: Item = lootMod(rng(hash(g.seed, 51, e.id, made)), far);
      addItem(g, it);
      g.events.push({ type: 'print', at: [e.x, e.y] });
      if (it.kind === 'mod') say(g, ['the printer spits out: ', { text: label(it), cmd: `install ${label(it)}` }]);
      return;
    }
    say(g, 'a printer. it is warm, and it waits.', ...menu(g, e));
  },
});

/** walking up to a printer shows what it makes, once per printer */
tickHooks.push((g) => {
  const e = printerNear(g);
  if (e && !e.data?.greeted) {
    e.data = { ...e.data, greeted: true };
    say(g, 'a printer hums here, warm.', ...menu(g, e));
  }
  const s = shopNear(g);
  if (s && !s.data?.greeted) {
    s.data = { ...s.data, greeted: true };
    say(g, 'a reliquary opens its glass doors. three relics wait inside.', ...shopMenu(g, s));
  }
});

// ---- reliquaries: shop printers

export const shopNear = (g: Game): Entity | undefined =>
  g.ents.filter((e) => e.kind === 'printer' && e.data?.shop && dist(e, g.player) < 1.6).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];

/** what a module costs at a reliquary */
export const priceOf = (it: Item): Cost => (it.kind === 'mod' ? PRICES.shop[Math.min(2, def(it).tier)] : {});

/** the reliquary's three relics: seeded per reliquary and per reroll; a sold one leaves an empty niche */
export function offers(g: Game, e: Entity): (Item | null)[] {
  const d = (e.data ??= {});
  if (!d.offers) {
    const far = (d.far as number) ?? 0;
    const r = rng(hash(g.seed, 53, e.id, (d.rolls as number) ?? 0));
    const out: Item[] = [];
    for (let k = 0; k < 20 && out.length < 3; k++) {
      // a reliquary reaches one tier past its printer neighbours: that is what it is for
      const it = lootMod(r, far + 2);
      if (it.kind === 'mod' && !out.some((o) => o.kind === 'mod' && o.mod === it.mod)) out.push(it);
    }
    d.offers = out;
  }
  return d.offers as (Item | null)[];
}

function shopMenu(g: Game, e: Entity): Line[] {
  const lines: Line[] = offers(g, e).map((it, k) =>
    it && it.kind === 'mod'
      ? [{ text: `buy ${k + 1}`, cmd: `buy ${k + 1}` }, `  ${label(it)}: ${fmt(priceOf(it))}. ${does(it)}`]
      : [`  ${k + 1}: an empty niche.`],
  );
  lines.push([{ text: 'reroll', cmd: 'reroll' }, `  new relics: ${fmt(PRICES.reroll)}`]);
  return lines;
}

verb('buy', {
  help: 'at a reliquary: buy 1, buy 2, buy 3',
  run(g, [which]) {
    const e = shopNear(g);
    if (!e) return say(g, 'no reliquary within reach.');
    const list = offers(g, e);
    const k = Number(which) - 1;
    const it = list[k];
    if (!it) return say(g, 'the reliquary shows:', ...shopMenu(g, e));
    const c = priceOf(it);
    if (!affords(g, c)) return say(g, `the reliquary wants ${fmt(c)}.`);
    pay(g, c);
    list[k] = null;
    addItem(g, it);
    g.events.push({ type: 'print', at: [e.x, e.y] });
    say(g, ['the glass slides open: ', it.kind === 'mod' ? { text: label(it), cmd: `install ${label(it)}` } : '']);
  },
});

verb('reroll', {
  help: 'at a reliquary: new relics for a price',
  when: (g) => !!shopNear(g),
  run(g) {
    const e = shopNear(g);
    if (!e) return say(g, 'no reliquary within reach.');
    if (!affords(g, PRICES.reroll)) return say(g, `a reroll wants ${fmt(PRICES.reroll)}.`);
    pay(g, PRICES.reroll);
    e.data!.rolls = ((e.data!.rolls as number) ?? 0) + 1;
    delete e.data!.offers;
    say(g, 'the reliquary turns its shelves.', ...shopMenu(g, e));
  },
});

// ---- recycling: a carried module back to resources

export const scrapOf = (it: Item): Cost => (it.kind === 'mod' && def(it).family !== 'unique' ? PRICES.scrap[Math.min(2, def(it).tier)] : {});

verb('recycle', {
  help: 'grind a carried module into resources: recycle pinhole',
  run(g, args) {
    const k = findItem(g, args);
    const it = g.player.inv[k];
    if (!it || it.kind !== 'mod') return say(g, findInst(g, args) ? 'remove it from its slot first.' : 'no such module in your inventory.');
    const c = scrapOf(it);
    if (!Object.keys(c).length) return say(g, 'this one will not break. it is waiting for something.');
    g.player.inv.splice(k, 1);
    for (const [r, n] of Object.entries(c)) addItem(g, { kind: 'res', res: r as Res, n: n! });
    g.events.push({ type: 'recycle' });
    say(g, `you grind ${label(it)} down: ${fmt(c)}.`);
  },
});
