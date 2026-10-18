// The arrival cache as a choice (v2 variety): where you land on a floor, a cache offers five of the floor's
// kit (src/world/floors.ts KIT: its headline always, the rest by seed) and you take two for nothing. Each
// pick goes straight into your body (or swaps in, the lightest module giving way). Every pick after the
// second costs bone, more each time; what you leave folds into scrap (bone) when you `scrap` it. So the
// "new toys" beat of each floor is a decision, and the bag does not fill with twenty modules you never run.
//   pick <name>   take one (free while picks are left, then bone)
//   scrap         fold the rest into bone and close the cache
//   cache         what it holds, and the card again
import { dist, say, spawn } from '../core/game';
import { CHUNK } from '../core/grid';
import { def, label, MODS, rarityKey } from '../core/mods';
import { hash, rng } from '../core/rng';
import { addItem, instRef, verb, VERBS } from '../core/verbs';
import type { Entity, Game, Item, Line } from '../core/types';
import { lightest, makeRoom } from '../body';
import { floorOf, KIT } from './floors';
import { RARITY_ODDS, ranged } from './spawn';

/** modules on offer, picks that cost nothing, what each later pick costs (bone), bone per module scrapped */
export const OFFER = 5;
export const FREE = 2;
export const COST = [3, 5, 8];
export const SCRAP = 2;
/** the card and the verbs work this close to the cache */
export const NEAR = 4;
/** where the cache stands in the landing chunk (local cells; every landing shape keeps it open, src/world/gen.ts) */
export const SPOT: [number, number] = [8, 10];

export interface Cache {
  floor: number;
  /** what is still on offer */
  offer: Item[];
  /** how many it has given (free ones too) */
  taken: number;
  /** scrapped: nothing left to take */
  done: boolean;
}

/** the floor's offer: its headline (the kit's first module; on floor 3 its first two) always, then the rest of the kit in a seed order, five at most.
 *  Each rolls its rarity as loot does on that floor */
export function offerOf(seed: number, f: number): Item[] {
  const kit = (KIT[f] ?? []).filter((m) => MODS[m]);
  if (!kit.length) return [];
  const r = rng(hash(seed, 12, f));
  // v2-view: on floor 3 the reins and the scope after them both stay on offer (the fps was one module there before)
  // (v2r3 fun: and the second on floors 1 and 2 too, the frost coat and the dawn eye, now that their kits turn
  // with the seed: without the coat the cradle's keeper killed 3 sim runs of 40)
  const head = f <= 2 ? 2 : 1;
  const rest = kit.slice(head);
  for (let k = rest.length - 1; k > 0; k--) {
    const j = r.int(0, k);
    [rest[k], rest[j]] = [rest[j], rest[k]];
  }
  // v2r3 fun: the ossuary wants aim and shooting: its offer always holds a weapon that reaches (seed 9 had none)
  const shown = OFFER - head;
  const far = (m: string) => ranged(MODS[m]);
  if (f === 2 && !rest.slice(0, shown).some(far)) {
    const k = rest.findIndex(far);
    if (k >= 0) [rest[shown - 1], rest[k]] = [rest[k], rest[shown - 1]];
  }
  // v2-balance3 (v2r3 fight: floors 3-5 took 17 s with a lance, 100-140 s without): the ossuary and the
  // furnace always offer a lance
  const lance = (m: string) => /lance/.test(m);
  if (f >= 2 && !rest.slice(0, shown).some(lance)) {
    const k = rest.findIndex(lance);
    const at = rest.slice(0, shown).findIndex((m) => !far(m));
    if (k >= 0) [rest[at >= 0 ? at : shown - 1], rest[k]] = [rest[k], rest[at >= 0 ? at : shown - 1]];
  }
  const [fine, rare] = RARITY_ODDS[Math.min(f, RARITY_ODDS.length - 1)];
  return [...kit.slice(0, head), ...rest].slice(0, OFFER).map((mod) => {
    const it: Item = { kind: 'mod', mod };
    const k = r();
    if (rarityKey(it) && k < fine + rare) it.rarity = k < rare ? 'rare' : 'fine';
    return it;
  });
}

const caches = new WeakMap<Game, Map<number, Cache>>();
/** the cache of a floor (made on first ask, from the seed) */
export function cacheOf(g: Game, f = floorOf(g)): Cache {
  let m = caches.get(g);
  if (!m) caches.set(g, (m = new Map()));
  let c = m.get(f);
  if (!c) m.set(f, (c = { floor: f, offer: offerOf(g.seed, f), taken: 0, done: false }));
  return c;
}

/** the cache's prop on your floor, if its chunk exists */
export const cacheProp = (g: Game, f = floorOf(g)): Entity | undefined => g.ents.find((e) => e.kind === 'prop' && e.data?.cache === f + 1);
/** the cache you stand by, still holding something */
export function cacheNear(g: Game): Cache | undefined {
  const e = cacheProp(g);
  if (!e || dist(e, g.player) > NEAR) return undefined;
  const c = cacheOf(g);
  return c.done || !c.offer.length ? undefined : c;
}

/** what the next pick costs in bone (0 while free picks are left) */
export const costOf = (c: Cache): number => (c.taken < FREE ? 0 : COST[Math.min(COST.length - 1, c.taken - FREE)]);
export const freeLeft = (c: Cache): number => Math.max(0, FREE - c.taken);
export const boneOf = (g: Game): number => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === 'bone' ? i.n : 0), 0);

/** spend bone from the pile; false if short */
function payBone(g: Game, n: number): boolean {
  const pile = g.player.inv.find((i) => i.kind === 'res' && i.res === 'bone');
  if (n <= 0) return true;
  if (!pile || pile.kind !== 'res' || pile.n < n) return false;
  pile.n -= n;
  if (!pile.n) g.player.inv = g.player.inv.filter((i) => i !== pile);
  return true;
}

/** an offered module by words: "choir bell", "fine choir bell", or its place on the card (1-5) */
export function findOffer(c: Cache, words: string): number {
  const q = words.trim().replace(/^the /, '');
  if (/^\d$/.test(q)) return Number(q) - 1 < c.offer.length ? Number(q) - 1 : -1;
  const named = (it: Item) => (it.kind === 'mod' ? [label(it), def(it).name] : []);
  const exact = c.offer.findIndex((it) => named(it).includes(q));
  return exact >= 0 ? exact : c.offer.findIndex((it) => named(it).some((n) => n.includes(q)));
}

/** where a pick would go: in, swapped in (and what gives way), or the bag */
export function fitOf(g: Game, it: Item): string {
  if (it.kind !== 'mod') return '';
  const room = makeRoom(g, it, false);
  if (typeof room === 'string') return 'to your bag: nothing gives way';
  const out = [...(room.remove ? [room.remove, ...(room.more ?? [])] : [])].map((o) => `${label(o)} out`);
  const off = room.off.map((o) => `${label(o)} off`);
  return out.length || off.length ? `goes in: ${[...out, ...off].join(', ')}` : 'goes straight in';
}

/** take offer k: pay if it costs, into the body (swapping in), else the bag. Returns why not, or null */
export function pick(g: Game, k: number): string | null {
  const c = cacheOf(g);
  const it = c.offer[k];
  if (!it || it.kind !== 'mod') return 'the cache holds no such thing.';
  const cost = costOf(c);
  if (!payBone(g, cost)) return `that pick costs ${cost} bone; you carry ${boneOf(g)}. scrap the rest instead, or come back with bone.`;
  c.offer.splice(k, 1);
  c.taken++;
  g.events.push({ type: 'cache-pick', data: it.mod });
  addItem(g, it);
  g.stats.mods.push(it.mod);
  const name = label(it);
  // a free install: straight in, or in with the lightest giving way (as `swap in` does)
  const room = makeRoom(g, it, false);
  const before = new Set(g.player.installed);
  if (typeof room !== 'string' && VERBS.swap) VERBS.swap.run(g, ['in', name]);
  const added = g.player.installed.find((i) => !before.has(i));
  // v2r2 fun: nothing gave way (legs, the map, a better eye stay): it waits, and a button makes room by hand
  const out = added ? undefined : lightest(g);
  const ask: Line = out ? [' ', { text: `take out ${label(out)} for it`, cmd: `remove ${instRef(g, out)}; install ${name}` }] : [];
  say(g, [`you take ${name} from the cache${cost ? ` for ${cost} bone` : ''}. `, added ? '' : `it waits in your bag${typeof room === 'string' ? `: ${room.replace(/\.$/, '')}` : ''}.`, ...ask], `  ${def(it).text}`);
  if (!c.offer.length) c.done = true;
  else tell(g, c);
  return null;
}

/** fold what is left into bone and close the cache */
export function scrap(g: Game): number {
  const c = cacheOf(g);
  const n = c.offer.length * SCRAP;
  c.offer = [];
  c.done = true;
  if (n) addItem(g, { kind: 'res', res: 'bone', n });
  g.events.push({ type: 'cache-scrap', data: n });
  say(g, n ? `the rest of the cache folds into scrap: +${n} bone.` : 'the cache is empty.');
  return n;
}

/** the next-pick line: free picks left, or the price */
function tell(g: Game, c: Cache): void {
  const free = freeLeft(c);
  const left = c.offer.length;
  const buttons: Line = [];
  c.offer.forEach((it, k) => it.kind === 'mod' && buttons.push(k ? '  ' : '', { text: `pick ${label(it)}`, cmd: `pick ${k + 1}` }));
  const head = free ? `${free} free pick${free > 1 ? 's' : ''} left. ` : `the next pick costs ${costOf(c)} bone (you carry ${boneOf(g)}). `;
  say(g, [head, ...buttons], [`or `, { text: `scrap the rest (+${left * SCRAP} bone)`, cmd: 'scrap' }]);
}

/** a floor's landing gets its cache prop (src/world/spawn.ts calls this from the arrival chunk) */
export function placeCache(g: Game, cx: number, cy: number, f: number): void {
  if (!offerOf(g.seed, f).length) return;
  spawn(g, { kind: 'prop', x: cx * CHUNK + SPOT[0] + 0.5, y: cy * CHUNK + SPOT[1] + 0.5, data: { cache: f + 1 } });
}

/** the card's state for the screen (src/ui/cache.ts): hidden by `later` until you walk off and back */
const hidden = new WeakMap<Game, boolean>();
export const cardHidden = (g: Game): boolean => !!hidden.get(g);
export const hideCard = (g: Game, v: boolean): void => void hidden.set(g, v);

const atCache = (g: Game): boolean => !!cacheNear(g);
const notHere = (g: Game): string => {
  const e = cacheProp(g);
  if (!e) return 'there is no cache on this floor.';
  if (cacheOf(g).done) return 'the cache is empty.';
  return 'the cache is where you landed: go back to it.';
};

verb('cache', {
  help: 'the floor\'s kit cache where you land: what it offers, two picks free',
  when: atCache,
  whenFail: notHere,
  run(g) {
    const c = cacheNear(g);
    if (!c) return say(g, notHere(g));
    hideCard(g, false);
    say(g, `the cache holds this floor's kit. take ${FREE} for nothing; each pick after costs bone; the rest folds into scrap.`);
    tell(g, c);
  },
});
verb('pick', {
  help: 'pick choir bell: take a module from the kit cache where you land (2 free, then bone)',
  when: atCache,
  whenFail: notHere,
  run(g, args) {
    const c = cacheNear(g)!;
    if (!args.length) return tell(g, c);
    const k = findOffer(c, args.join(' '));
    if (k < 0) return say(g, `the cache holds no ${args.join(' ')}.`);
    const why = pick(g, k);
    if (why) say(g, why);
  },
});
verb('scrap', {
  help: 'fold what is left in the kit cache into bone',
  when: atCache,
  whenFail: notHere,
  run(g) {
    scrap(g);
  },
});
