// Altars: old machines that take an offering. `offer power` grows the core's power for good and `offer
// flesh` your max hp (the prices climb with each one), `offer mend` buys a full mend. They are the steady sink for what you gather:
// one near where you woke (chunk 1,1), then now and then farther out.
import { chunkHook } from '../core/grid';
import { dist, ENEMIES, say, spawn, tickHooks } from '../core/game';
import { hash, rng } from '../core/rng';
import { goThere, verb } from '../core/verbs';
import { def, label, MODS } from '../core/mods';
import { findInst } from '../core/verbs';
import type { Chunk, Entity, Game, Inst, Line, Res } from '../core/types';
import { spot } from './gen';
import { farOf, floorOfChunk, isArrival, stairsChunk } from './floors';
import { affords, fmt, glassTip, type Cost } from './printer';
import { BETTER, rollMult } from './spawn';
import { upgradeLines } from './upgrade';

/** the core's power can grow to this at altars */
export const MAX_CORE = 10; // r5 balance: was 9 (sims: power-bound 66% → 60%, finish not lower). r1 econ: was 12; past 9 power comes from generators, so power binds all run (docs/modules.md)

/** the price of the next point of power: it climbs steeply with every one */
export function powerCost(g: Game): Cost {
  // r2 econ: the first point is bone and copper (glass was the early lock); glass joins from the second, ichor the fourth
  const n = Math.max(0, g.player.core - 4);
  if (n === 0) return { bone: 4, copper: 2 };
  const c: Cost = { bone: 4 + 2 * n, glass: n, copper: n };
  if (n >= 3) c.ichor = n - 2;
  return c;
}
export const MEND: Cost = { bone: 2 };
/** v2 r1 fun (bone-starved on floors 1–2, copper piling up): an altar takes copper for bone, 2 for 1 */
export const TITHE: Cost = { copper: 2 };
/** v2r4 run (20 bone and no glass on floor 2, every print and buy wanting glass): an altar grinds bone into glass, 4 for 1 */
export const GRIND: Cost = { bone: 4 };
/** v2r5 newcomer (14 bone, 0 copper at the floor-2 altar: flesh, attune and temper all locked): 3 bone for 1 copper */
export const SMELT: Cost = { bone: 3 };
/** max hp an altar can add, two at a time */
export const MAX_FLESH = 18; // v2 balance: was 12; the keepers' ember hearts add 2 each (src/fight/bosses.ts)
export function fleshCost(g: Game): Cost {
  const n = (g.player.flesh ?? 0) / 2;
  const c: Cost = { bone: 4 + 2 * n, copper: 1 + Math.floor(n / 2) };
  if (n >= 4) c.ichor = 1;
  return c;
}

export const altarNear = (g: Game): Entity | undefined => g.ents.find((e) => e.data?.altar && dist(e, g.player) < 1.6);
/** r2 decide: out of reach, say where the altar is (it read "nothing installed can do that", and a run died of it) */
export function noAltar(g: Game): Line {
  const e = g.ents.filter((o) => o.data?.altar && dist(o, g.player) < 10).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];
  if (!e) return ['no altar here. find one: it takes offerings.'];
  const [far, go] = goThere(g, e.x, e.y, true);
  return [`no altar within reach: step closer, it stands ${far}. `, go];
}

/** the parameter an altar attunes: a weapon's damage, an eye's range, a lamp's radius, else the first number
 *  that rolls (src/world/spawn.ts BETTER: the mirror ward's recharge gets shorter) */
export function attuneKey(m: { mod: string }): string | null {
  const d = MODS[m.mod];
  if (!d || d.family === 'unique' || d.family === 'power') return null;
  const first = ({ weapon: 'damage', camera: 'range', lamp: 'radius' } as Record<string, string>)[d.family];
  if (first && typeof d.params[first] === 'number') return first;
  const nums = Object.entries(d.params).filter(([k, v]) => typeof v === 'number' && BETTER[k]).map(([k]) => k);
  return nums[0] ?? null;
}
/** how an attune changes its number: "damage ×1.4", "recharge ×0.7" */
const attuneText = (i: Inst, key = attuneKey(i)!) => `${key} ×${rollMult(key, true)}`;
/** attuning a module: dearer by tier; resources' late sink once power and flesh are full */
export const attuneCost = (m: { mod: string }): Cost => {
  const t = Math.min(2, MODS[m.mod].tier) + 1;
  const c: Cost = { bone: 3 * t, glass: t === 1 ? 1 : 2 * t, copper: 2 * t }; // r2 econ: tier 0 wants 1 glass, not 2
  if (t > 1) c.ichor = t - 1;
  return c;
};
/** installed modules an altar can attune (not attuned or tempered already) */
const ORDER = ['weapon', 'body', 'lamp', 'scanner', 'camera', 'mind', 'gait', 'tool'];
const byFamily = (a: Inst, b: Inst) => ORDER.indexOf(def(a).family) - ORDER.indexOf(def(b).family);
export const attunable = (g: Game): Inst[] =>
  g.player.installed.filter((i) => attuneKey(i) && i.roll?.tag !== 'attuned' && i.roll?.tag !== 'tempered').sort(byFamily);

/** the late sink (docs/modules.md): an attuned module tempers up to three times, its rolled number a step
 *  further each time (×1.2, or ×0.85 for a number that is better low), dearer each time */
export const MAX_TEMPER = 3;
export const temperStep = (key: string): number => (BETTER[key] === 'down' ? 0.85 : 1.2);
const tempered = (i: Inst) => (i.roll?.tag === 'tempered' ? i.roll.n ?? 1 : 0);
export const temperable = (g: Game): Inst[] =>
  g.player.installed.filter((i) => (i.roll?.tag === 'attuned' || (i.roll?.tag === 'tempered' && tempered(i) < MAX_TEMPER)) && attuneKey(i)).sort(byFamily);
/** r2 econ: a temper always works the altar's key (an eye's range, a weapon's damage); a module found attuned on
 *  another number (an eye's fov) is set to the altar's key at the attune step first, then tempers from there */
export function temperTo(i: Inst): { key: string; mult: number } {
  const key = attuneKey(i)!;
  if (i.roll!.key !== key) return { key, mult: rollMult(key, true) };
  return { key, mult: Math.round(i.roll!.mult * temperStep(key) * 100) / 100 };
}
export const temperCost = (m: Inst): Cost => {
  const t = Math.min(2, MODS[m.mod].tier) + 1;
  const k = tempered(m) + 1;
  const c: Cost = { bone: 2 * t + k, glass: k, copper: 3 * t + 3 * k }; // copper carries it: recycling pays copper all run
  if (k > 1) c.ichor = k - 1; // r2 econ: the first temper wants no ichor
  return c;
};

/** v2r5 newcomer ("offer copper: 2 copper" read as buying copper): what each exchange gives back */
export const GIVES: Record<string, string> = { 'offer copper': '1 bone', 'offer bone': '1 glass', 'offer bone for copper': '1 copper' };

/** what an altar offers now: [command, price] */
export function offers(g: Game, _e: Entity): [string, Cost][] {
  const out: [string, Cost][] = [];
  if (g.player.core < MAX_CORE) out.push(['offer power', powerCost(g)]);
  if ((g.player.flesh ?? 0) < MAX_FLESH) out.push(['offer flesh', fleshCost(g)]);
  for (const i of attunable(g)) out.push([`attune ${def(i).name}`, attuneCost(i)]);
  for (const i of temperable(g)) out.push([`temper ${def(i).name}`, temperCost(i)]);
  if (g.player.hp < g.player.maxHp * 0.7) out.push(['offer mend', MEND]);
  out.push(['offer copper', TITHE]);
  out.push(['offer bone', GRIND]);
  out.push(['offer bone for copper', SMELT]);
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
  [{ text: 'offer copper', cmd: 'offer copper' }, `  give ${fmt(TITHE)} → 1 bone`],
  [{ text: 'offer bone', cmd: 'offer bone' }, `  give ${fmt(GRIND)} → 1 glass`],
  [{ text: 'offer bone for copper', cmd: 'offer bone for copper' }, `  give ${fmt(SMELT)} → 1 copper`],
  ...attunable(g).map((i) => [{ text: `attune ${def(i).name}`, cmd: `attune ${def(i).name}` }, `  ${attuneText(i)} for good: ${fmt(attuneCost(i))}`]),
  ...temperable(g).map((i) => {
    const to = temperTo(i);
    const what = to.key === i.roll!.key ? `${to.key} ×${temperStep(to.key)} more` : `${to.key} ×${to.mult} (for its ${i.roll!.key})`;
    return [{ text: `temper ${def(i).name}`, cmd: `temper ${def(i).name}` }, `  ${what}: ${fmt(temperCost(i))}`];
  }),
];

verb('offer', {
  help: 'at an altar: offer power, offer flesh, offer mend, offer copper (give 2 copper → 1 bone), offer bone (give 4 bone → 1 glass), offer bone for copper (give 3 bone → 1 copper)',
  when: (g) => !!altarNear(g),
  whenFail: noAltar,
  run(g, [what, ...rest]) {
    const e = altarNear(g);
    if (!e) return say(g, noAltar(g));
    const p = g.player;
    if (what === 'power') {
      if (p.core >= MAX_CORE) return say(g, 'the altar is quiet. your core can hold no more.');
      const c = powerCost(g);
      if (!affords(g, c)) return say(g, `the altar wants ${fmt(c)}.${glassTip(g, c, true)}`);
      pay(g, c);
      p.core++;
      g.events.push({ type: 'print', at: [e.x, e.y] });
      return say(g, `the altar drinks it. your core runs warmer: power ${p.core} at the core.`);
    }
    if (what === 'flesh') {
      if ((p.flesh ?? 0) >= MAX_FLESH) return say(g, 'the altar has no more to give you.');
      const c = fleshCost(g);
      if (!affords(g, c)) return say(g, `the altar wants ${fmt(c)}.${glassTip(g, c, true)}`);
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
    if (what === 'copper') {
      if (!affords(g, TITHE)) return say(g, `the altar wants ${fmt(TITHE)}.`);
      pay(g, TITHE);
      const b = p.inv.find((i) => i.kind === 'res' && i.res === 'bone');
      if (b && b.kind === 'res') b.n++;
      else p.inv.push({ kind: 'res', res: 'bone', n: 1 });
      return say(g, 'the altar melts the copper down and gives back bone: +1 bone.');
    }
    if (what === 'bone' && rest.includes('copper')) {
      if (!affords(g, SMELT)) return say(g, `the altar wants ${fmt(SMELT)} for a copper.`);
      pay(g, SMELT);
      const cu = p.inv.find((i) => i.kind === 'res' && i.res === 'copper');
      if (cu && cu.kind === 'res') cu.n++;
      else p.inv.push({ kind: 'res', res: 'copper', n: 1 });
      return say(g, 'the altar burns the bone down to a green bead: +1 copper.');
    }
    if (what === 'bone') {
      if (!affords(g, GRIND)) return say(g, `the altar wants ${fmt(GRIND)} for a glass.`);
      pay(g, GRIND);
      const gl = p.inv.find((i) => i.kind === 'res' && i.res === 'glass');
      if (gl && gl.kind === 'res') gl.n++;
      else p.inv.push({ kind: 'res', res: 'glass', n: 1 });
      return say(g, 'the altar grinds the bone fine and fires it: +1 glass.');
    }
    // r4: `offer bone` says what the altar takes rather than the bare menu again
    if (what) return say(g, `the altar takes no single ${what}. it takes these, and pays in power, flesh or mending:`, ...menu(g));
    say(g, 'an altar. it wants an offering.', ...menu(g), ...upgradeLines(g, 2));
  },
});

verb('attune', {
  help: 'at an altar: attune an installed module (one number 40% better): attune spark finger',
  when: (g) => !!altarNear(g),
  whenFail: noAltar,
  run(g, args) {
    if (!altarNear(g)) return say(g, noAltar(g));
    // of two alike, the one not attuned yet
    const q = args.join(' ');
    const inst = (q && attunable(g).find((i) => label(i).toLowerCase().includes(q))) || findInst(g, args);
    if (!inst) return say(g, 'attune what? an installed module.', ...menu(g));
    const key = attuneKey(inst);
    if (!key) return say(g, 'the altar will not touch that.');
    if (inst.roll?.tag === 'attuned' || inst.roll?.tag === 'tempered') return say(g, `${label(inst)} is attuned already.`, ...(inst.roll.tag === 'attuned' ? [[{ text: `temper ${def(inst).name}`, cmd: `temper ${def(inst).name}` }]] : []));
    const c = attuneCost(inst);
    if (!affords(g, c)) return say(g, `the altar wants ${fmt(c)}.${glassTip(g, c, true)}`);
    pay(g, c);
    inst.roll = { key, mult: rollMult(key, true), tag: 'attuned' };
    g.events.push({ type: 'print' });
    say(g, `the altar hums over it: ${label(inst)}, ${attuneText(inst, key)}.`);
  },
});

verb('temper', {
  help: 'at an altar: temper an attuned module (its number 20% better again, three times): temper bone lance',
  when: (g) => !!altarNear(g),
  whenFail: noAltar,
  run(g, args) {
    if (!altarNear(g)) return say(g, noAltar(g));
    const q = args.join(' ');
    // of two alike, the one you can pay for (the less tempered)
    const alike = q ? temperable(g).filter((i) => label(i).toLowerCase().includes(q)).sort((a, b) => tempered(a) - tempered(b)) : [];
    const inst = alike.find((i) => affords(g, temperCost(i))) ?? alike[0] ?? findInst(g, args);
    if (!inst) return say(g, 'temper what? an installed, attuned module.', ...menu(g));
    if (tempered(inst) >= MAX_TEMPER) return say(g, `${label(inst)} is as true as it gets.`);
    if (!inst.roll || inst.roll.tag === 'cracked' || !BETTER[inst.roll.key] || !attuneKey(inst)) return say(g, `attune it first: ${def(inst).name}.`);
    const c = temperCost(inst);
    if (!affords(g, c)) return say(g, `the altar wants ${fmt(c)}.${glassTip(g, c, true)}`);
    pay(g, c);
    const { key, mult } = temperTo(inst);
    inst.roll = { key, mult, tag: 'tempered', n: tempered(inst) + 1 };
    g.events.push({ type: 'print' });
    say(g, `the altar sings it truer: ${label(inst)}, ${key} ×${inst.roll.mult}.`);
  },
});

chunkHook((g: Game, c: Chunk) => {
  const far = farOf(c.cx, c.cy);
  const [sx, sy] = stairsChunk(g.seed, floorOfChunk(c.cx));
  if ((c.cx === sx && c.cy === sy) || isArrival(c.cx, c.cy)) return;
  const r = rng(hash(g.seed, 71, c.cx, c.cy));
  if (!((c.cx === 1 && c.cy === 1) || (far >= 2 && r.chance(far >= 3.5 ? 0.35 : 0.2)))) return; // r1 econ: deep, more altars to spend at (temper)
  const [x, y] = spot(g.seed, c.cx, c.cy, 7, c);
  spawn(g, { kind: 'prop', x, y, data: { altar: true } });
});

/** walking up to an altar shows its offers, once per altar */
tickHooks.push((g) => {
  const e = altarNear(g);
  if (!e || e.data!.greeted) return;
  e.data!.greeted = true;
  say(g, 'an altar stands here, stained and patient.', ...menu(g), ...upgradeLines(g, 2));
});


/** r2 decide: machines draw packs (a run died at an altar with no word). PACK_NEAR+ foes that noticed you within
 *  PACK_CELLS while a machine is within MACHINE_CELLS: one line, at most once per machine every PACK_QUIET s */
export const PACK_NEAR = 3;
export const PACK_CELLS = 6;
export const MACHINE_CELLS = 3;
const PACK_QUIET = 20;
tickHooks.push((g) => {
  if (g.ended) return;
  const p = g.player;
  const m = g.ents.filter((e) => (e.data?.altar || e.kind === 'printer') && dist(e, p) < MACHINE_CELLS).sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (!m) return;
  const foes = g.ents.filter((e) => e.enemy && e.enemy.data.noticed && !ENEMIES[e.enemy.type]?.hidden && dist(e, p) <= PACK_CELLS);
  const d = (m.data ??= {});
  if (foes.length < PACK_NEAR || g.t - ((d.packAt as number) ?? -PACK_QUIET) < PACK_QUIET) return;
  d.packAt = g.t;
  const kinds = new Set(foes.map((e) => e.enemy!.type));
  const what = kinds.size === 1 ? `${foes.length} ${(ENEMIES[[...kinds][0]]?.name ?? 'foe').replace(/^(a|an|the) /, '')}s` : `${foes.length} foes`;
  const name = m.data?.altar ? 'altar' : m.data?.shop ? 'reliquary' : 'printer';
  const mend = m.data?.altar && p.hp < p.maxHp && affords(g, MEND);
  say(g, mend ? [`⚠ ${what} close on the ${name}. `, { text: 'offer mend', cmd: 'offer mend' }, ' now, or back off.'] : `⚠ ${what} close on the ${name}. back off, or fight them here.`);
  g.events.push({ type: 'warn', at: [foes[0].x, foes[0].y] });
});
