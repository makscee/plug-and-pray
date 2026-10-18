// Printers: machines in some chambers that turn resources into a slot board (+1 slot, up to 8)
// or a random module of the area's tier. `print` at a printer lists both with their costs.
// Reliquaries are shop printers: three modules on show, each with its price; `buy 1`, `reroll`.
// `recycle <module>` anywhere grinds a carried module back into resources. Every price lives in
// PRICES below, so balance can tune them in one place.

import { dist, say, tickHooks } from '../core/game';
import { def, label } from '../core/mods';
import { does } from '../mods/describe';
import { hash, rng } from '../core/rng';
import { addItem, findInst, findItem, goThere, verb, VERBS } from '../core/verbs';
import type { Entity, Game, Item, Line, Res } from '../core/types';
import { lootMod } from './spawn';
import { cradleEye } from './secrets';
import { ZONES, zoneFar } from './zones';

export const MAX_SLOTS = 8;
export type Cost = Partial<Record<Res, number>>;

/** every price and yield in one place: by module tier 0, 1, 2 (uniques never sell or recycle) */
export const PRICES = {
  // r1 econ: copper comes early now (2 at the start, 1 from each tier-0 recycle), so it carries the later prices and glass stops gating
  print: [{ bone: 2, glass: 1 }, { bone: 2, glass: 1, copper: 2 }, { bone: 3, glass: 1, copper: 3, ichor: 1 }] as Cost[],
  shop: [{ bone: 2, copper: 1 }, { bone: 3, glass: 2, copper: 1 }, { bone: 4, glass: 3, copper: 2, ichor: 1 }] as Cost[],
  reroll: { bone: 1, glass: 1 } as Cost,
  scrap: [{ bone: 1, copper: 1 }, { bone: 2, glass: 1, copper: 1 }, { bone: 2, glass: 2, copper: 1, ichor: 1 }] as Cost[],
};

export function slotCost(g: Game): Cost {
  // balance pass: the run starts with 6 slots, so the price starts there
  const n = Math.max(0, g.player.slots - 6);
  const c: Cost = { bone: 6 + 3 * n, glass: n ? 3 + n : 2, copper: 2 + 2 * n }; // r2 econ: slot 7 wants 2 glass, not 3
  if (n >= 1) c.ichor = n;
  return c;
}

export const tierAt = (far: number) => ZONES[zoneFar(far)].tier;
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

/** r2 decide: out of reach, say where the printer or reliquary is */
function noMachine(g: Game, shop: boolean): Line {
  const name = shop ? 'reliquary' : 'printer';
  const e = g.ents.filter((o) => o.kind === 'printer' && !!o.data?.shop === shop && dist(o, g.player) < 10).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];
  if (!e) return [`no ${name} here.`];
  const [far, go] = goThere(g, e.x, e.y, true);
  return [`no ${name} within reach: step closer, it stands ${far}. `, go];
}

export const printerNear = (g: Game): Entity | undefined =>
  g.ents.filter((e) => e.kind === 'printer' && !e.data?.shop && dist(e, g.player) < 1.6).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];

/** r2 econ: aimed prints, a module of one family for 2 copper more than a random one ("print eye") */
export const AIMED: Record<string, string> = { weapon: 'weapon', eye: 'camera', body: 'body', lamp: 'lamp', scanner: 'scanner', legs: 'gait', mind: 'mind', tool: 'tool' };
export const AIM_COPPER = 2;
export const aimedCost = (far: number): Cost => {
  const c = { ...modCost(far) };
  c.copper = (c.copper ?? 0) + AIM_COPPER;
  return c;
};

function menu(g: Game, e: Entity): Line[] {
  const far = (e.data?.far as number) ?? 0;
  const slot: Line = g.player.slots >= MAX_SLOTS ? ['  slots: the board is full (8).'] : [{ text: 'print slot', cmd: 'print slot' }, `  +1 slot: ${fmt(slotCost(g))}`];
  const aimed: Line = ['  or one kind: ', ...Object.keys(AIMED).flatMap((k, n) => [...(n ? [' '] : []), { text: k, cmd: `print ${k}` }]), `: ${fmt(aimedCost(far))}`];
  return [slot, [{ text: 'print module', cmd: 'print module' }, `  a module: ${fmt(modCost(far))}`], aimed];
}

verb('print', {
  help: 'at a printer: print slot, print module, or one kind for 2 copper more: print weapon, eye, body, lamp, scanner, legs, mind, tool',
  run(g, [what]) {
    const e = printerNear(g);
    if (!e) return say(g, noMachine(g, false));
    // r4: plurals work (print eyes, print weapons)
    if (what?.endsWith('s') && (AIMED[what.slice(0, -1)] || what === 'slots' || what === 'modules')) what = what.slice(0, -1);
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
    const fam = AIMED[what];
    if (what === 'module' || fam) {
      const c = fam ? aimedCost(far) : modCost(far);
      if (!affords(g, c)) return say(g, `the printer wants ${fmt(c)}.`);
      pay(g, c);
      const made = ((e.data!.made as number) ?? 0) + 1;
      e.data!.made = made;
      const it: Item = lootMod(rng(hash(g.seed, 51, e.id, made)), far, fam);
      addItem(g, it);
      g.events.push({ type: 'print', at: [e.x, e.y] });
      if (it.kind === 'mod') say(g, ['the printer spits out: ', { text: label(it), cmd: `install ${label(it)}` }]);
      return;
    }
    say(g, what ? `no kind called ${what}.` : 'a printer. it is warm, and it waits.', ...menu(g, e));
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

/** what a module costs at a reliquary (r5 balance: generators lost their +1 copper +1 glass; the sim wanted power 66% of the time) */
export const priceOf = (it: Item): Cost => {
  if (it.kind !== 'mod') return {};
  const c = { ...PRICES.shop[Math.min(2, def(it).tier)] };
  return c;
};
/** the reliquary by the start (it stands at 1 chunk) always prices one relic in bone and glass alone */
const firstShop = (e: Entity) => ((e.data?.far as number) ?? 0) < 1.5;
const noCopper = (c: Cost): Cost => {
  const { copper = 0, ...rest } = c;
  return copper ? { ...rest, glass: (rest.glass ?? 0) + 2 * copper } : c;
};
/** the price of the k-th relic at this reliquary */
export function priceAt(e: Entity, k: number, it: Item): Cost {
  // r2 hook: its layer eye costs the copper you wake with, so the first hidden layer is a choice in the first minute
  if (firstShop(e) && !e.data?.rolls && it.kind === 'mod' && e.data?.layer === it.mod) return { copper: 2 };
  const c = priceOf(it);
  return firstShop(e) && k === 0 ? noCopper(c) : c;
}

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
      // playtest r3: not one you carry or wear already
      const owned = (m: string) => g.player.inv.some((o) => o.kind === 'mod' && o.mod === m) || g.player.installed.some((o) => o.mod === m);
      if (it.kind === 'mod' && !out.some((o) => o.kind === 'mod' && o.mod === it.mod) && (k >= 14 || !owned(it.mod))) out.push(it);
    }
    // r2 hook: the reliquary by the start keeps a layer eye on its middle shelf until its first reroll
    if (firstShop(e) && !d.rolls) {
      const eye = cradleEye(g.seed);
      out.splice(0, out.length, ...out.filter((o) => o.kind !== 'mod' || o.mod !== eye).slice(0, 2));
      out.splice(1, 0, { kind: 'mod', mod: eye });
      d.layer = eye;
    }
    d.offers = out;
  }
  return d.offers as (Item | null)[];
}

function shopMenu(g: Game, e: Entity): Line[] {
  const lines: Line[] = offers(g, e).map((it, k) =>
    it && it.kind === 'mod'
      ? [{ text: `buy ${k + 1}`, cmd: `buy ${k + 1}` }, `  ${label(it)}${def(it).family === 'power' || !def(it).power ? '' : ` (${def(it).power}p)`}: ${fmt(priceAt(e, k, it))}. ${does(it)}`]
      : [`  ${k + 1}: an empty niche.`],
  );
  lines.push([{ text: 'reroll', cmd: 'reroll' }, `  new relics: ${fmt(PRICES.reroll)}`]);
  return lines;
}

verb('buy', {
  help: 'at a reliquary: buy 1, buy 2, buy 3, or by name: buy bone lance',
  run(g, args) {
    const e = shopNear(g);
    if (!e) return say(g, noMachine(g, true));
    const list = offers(g, e);
    // r4 final: `buy <name>` too
    const q = args.join(' ').replace(/-/g, ' ');
    const named = list.findIndex((it) => !!q && !!it && it.kind === 'mod' && label(it).replace(/-/g, ' ').includes(q));
    const k = /^\d+$/.test(q) ? Number(q) - 1 : named;
    const it = list[k];
    if (!it) return say(g, 'the reliquary shows:', ...shopMenu(g, e));
    const c = priceAt(e, k, it);
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
  whenFail: (g) => noMachine(g, true),
  run(g) {
    const e = shopNear(g);
    if (!e) return say(g, noMachine(g, true));
    if (!affords(g, PRICES.reroll)) return say(g, `a reroll wants ${fmt(PRICES.reroll)}.`);
    pay(g, PRICES.reroll);
    e.data!.rolls = ((e.data!.rolls as number) ?? 0) + 1;
    delete e.data!.offers;
    say(g, 'the reliquary turns its shelves.', ...shopMenu(g, e));
  },
});

// ---- recycling: a carried module back to resources

/** the chance a tier-0 module grinds out one glass besides */
export const SCRAP_GLASS = 0.5;
/** modules ground so far, per game: seeds the glass roll */
const ground = new WeakMap<Game, number>();
export const scrapOf = (it: Item): Cost => (it.kind === 'mod' && def(it).family !== 'unique' ? PRICES.scrap[Math.min(2, def(it).tier)] : {});

/** r4 final: why this card reader may not leave you (the last one, with floors still to find the way down on), or null */
export function lastReader(g: Game, it: Item | undefined): string | null {
  if (!it || it.kind !== 'mod' || it.mod !== 'card-reader') return null;
  const p = g.player;
  const readers = p.inv.filter((i) => i.kind === 'mod' && i.mod === 'card-reader').length + p.installed.filter((i) => i.mod === 'card-reader').length;
  // v2 floors: each floor's first card points the way down; past the furnace no card is left to read
  const left = Math.max(0, 3 - (g.floor ?? 0));
  return readers === 1 && left > 0 ? `that is your only card reader, and the cards below still point the way down. no other reader lies out there.` : null;
}

// the last card reader does not leave the bag by `drop` either
const drop = VERBS.drop;
if (drop)
  VERBS.drop = {
    ...drop,
    run(g, args) {
      const why = lastReader(g, g.player.inv[findItem(g, args)]);
      if (why) return say(g, why);
      drop.run(g, args);
    },
  };

/** when the last card-reader warning was given, per game */
const warned = new WeakMap<Game, number>();

verb('recycle', {
  help: 'grind a carried module into resources: recycle pinhole',
  run(g, args) {
    // playtest r3: bare `recycle` lists what you can grind
    const mods = g.player.inv.filter((i): i is Extract<Item, { kind: 'mod' }> => i.kind === 'mod' && Object.keys(scrapOf(i)).length > 0);
    if (!args.length) return say(g, mods.length ? 'recycle what?' : 'you carry nothing that grinds.', ...mods.map((i): Line => [{ text: `recycle ${label(i)}`, cmd: `recycle ${label(i)}` }, `  ${fmt(scrapOf(i))}`]));
    const k = findItem(g, args);
    const it = g.player.inv[k];
    if (!it || it.kind !== 'mod') return say(g, findInst(g, args) ? 'remove it from its slot first.' : 'no such module in your inventory.');
    const c = { ...scrapOf(it) };
    if (!Object.keys(c).length) return say(g, 'this one will not break. it is waiting for something.');
    // r2: your only card reader, with a card still unread: ask once (a playtester ground both and had to buy one back)
    const p = g.player;
    const readers = p.inv.filter((i) => i.kind === 'mod' && i.mod === 'card-reader').length + p.installed.filter((i) => i.mod === 'card-reader').length;
    const why = lastReader(g, it);
    if (why) return say(g, why);
    if (it.mod === 'card-reader' && readers === 1 && p.inv.some((i) => i.kind === 'card') && (warned.get(g) ?? -99) < g.t - 20) {
      warned.set(g, g.t);
      return say(g, ['that is your only card reader, and you carry a card no one has read. ', { text: 'recycle it anyway', cmd: 'recycle card reader' }]);
    }
    // r2 econ: a tier-0 module grinds out a glass half the time (glass was the early lock)
    const made = (ground.get(g) ?? 0) + 1;
    ground.set(g, made);
    if (def(it).tier === 0 && rng(hash(g.seed, 57, made)).chance(SCRAP_GLASS)) c.glass = (c.glass ?? 0) + 1;
    g.player.inv.splice(k, 1);
    for (const [r, n] of Object.entries(c)) addItem(g, { kind: 'res', res: r as Res, n: n! });
    g.events.push({ type: 'recycle' });
    say(g, `you grind ${label(it)} down: ${fmt(c)}.`);
  },
});
