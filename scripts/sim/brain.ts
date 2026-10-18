// A headless player for balance sims (scripts/sim.mjs): plays a seed by console commands only, the way a
// careful player would. It keeps the best loadout its slots and power allow, buys at printers and altars,
// reads cards for vectors, fights (auto weapons on their own, aimed ones when a foe stands in a line),
// steps out of a seraph's line and away from a walker's swing, folds home (`unstuck`) when nearly dead and
// rests. A "careful" player waits for its gear to match the zone a shard lies in; a "rusher" does not.
import '../../src/mods';
import { dist, ENEMIES, newGame, tick } from '../../src/core/game';
import { CHUNK, Cell, clear } from '../../src/core/grid';
import { active, def, label, MODS, param, powerMax, powerUsed, size, slotsUsed } from '../../src/core/mods';
import { exec } from '../../src/core/verbs';
import type { Entity, Game, Res, Roll } from '../../src/core/types';
import * as printer from '../../src/world/printer';
import { offeringOf } from '../../src/end/timeline';
import * as zones from '../../src/world/zones';
import * as altar from '../../src/world/altar';
import { dpsOf } from '../../src/world/zonemath';
import { startKit } from '../../src/tune/start';
import { light } from '../../src/sight/lamp';

export interface Snap {
  t: number;
  zone: number;
  hp: number;
  maxHp: number;
  power: number;
  slots: number;
  dps: number;
  armour: number;
  res: number;
  mods: number;
  ready: number;
  at: string;
  goal: string;
}
export interface Run {
  seed: number;
  style: string;
  ended: string;
  t: number;
  marks: Record<string, number>;
  killer?: string;
  deathZone?: number;
  snaps: Snap[];
  steps: { t: number; what: string }[];
  bought: string[];
  resPeak: number;
  resEnd: number;
  kills: number;
  homes: number;
  recycled: number;
  log: string[];
  /** loadout pressure, sampled every 10 s: power full with a slot free, slots full with power free, both */
  bound: { power: number; slots: number; both: number; n: number };
  /** power modules ever switched on */
  generators: string[];
  /** what was on when it first walked into each zone, and at the end */
  loadouts: Record<string, string[]>;
  /** times it switched a module off to make room (a setup change) */
  offs: number;
  /** modules on in any 10 s sample */
  everOn: string[];
  /** setup switches (setup explore / setup battle) */
  setups: number;
  /** resources gathered over the run (gains between decisions) */
  income: number;
}

const DT = 0.1;
const key = (x: number, y: number) => x + ',' + y;
const cellAt = (g: Game, x: number, y: number) => {
  const c = g.chunks.get(Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK));
  return c ? c.cells[(y - Math.floor(y / CHUNK) * CHUNK) * CHUNK + (x - Math.floor(x / CHUNK) * CHUNK)] : -1;
};
const resOf = (g: Game, r: Res) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === r ? i.n : 0), 0);
const resAll = (g: Game) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' ? i.n : 0), 0);

/** what a module is worth to this player now (0 = never install) */
function worth(g: Game, it: { mod: string; roll?: any }, zone: number, wantReader: boolean, mode: Mode = 'explore'): number {
  const w = worth0(g, it, zone, wantReader);
  if (mode === 'explore') return w;
  // the battle setup (docs/modules.md): weapons and body up, maps, readers and plain scanners off
  const fam = MODS[it.mod].family;
  if (fam === 'weapon') return w * (param(it, 'aim', 'auto') === 'aimed' && lampNear(g) ? 3 : 1.5);
  if (fam === 'body') return w * 1.2;
  if (fam === 'mind') return 0;
  if (fam === 'scanner') return zone >= 2 && w >= 45 ? w : 0;
  if (fam === 'camera' && zone >= 2 && humNear(g)) {
    const f = param<string>(it, 'filter', 'color');
    return w + (f === 'sonar' || f === 'heat' ? 120 : 0); // the hum: only sonar or heat show it to auto weapons
  }
  return w;
}
type Mode = 'explore' | 'battle';
const lampNear = (g: Game) => g.ents.some((e) => e.enemy && ['seraph', 'pyre', 'saint'].includes(e.enemy.type) && dist(e, g.player) < 10);
const humNear = (g: Game) => g.ents.some((e) => e.enemy && ENEMIES[e.enemy.type]?.hidden && dist(e, g.player) < 9);

function worth0(g: Game, it: { mod: string; roll?: any }, zone: number, wantReader: boolean): number {
  const m = MODS[it.mod];
  const p = (k: string, f = 0) => param<number>(it, k, f);
  const loud = p('loud') * 8;
  const deep = zone >= 2;
  switch (m.family) {
    case 'gait':
      return param(it, 'go', false) ? 1000 : 0;
    case 'camera': {
      // the eye that perceives in the zone ahead (src/mods/sense.ts): dark ossuary, the hum, the furnace's glare
      const f = param<string>(it, 'filter', 'color');
      let v = 200 + p('res') / 10 + p('fps');
      if (zone === 2) v += f === 'sonar' || f === 'edge' || f === 'heat' ? 60 : f === '1bit' ? 30 : 0;
      if (deep && (f === 'sonar' || f === 'heat')) v += 25;
      if (zone === 3 && f === 'heat') v -= 90;
      return v - loud;
    }
    case 'weapon': {
      // armour (walkers, the abbot) takes 1.2 off each hit; deep, about 4 in 10 foes wear it; a sweep pays against swarms
      const d0 = p('damage', 1);
      const dmg = deep ? 0.6 * d0 + 0.4 * Math.max(d0 * 0.2, d0 - 1.2) : d0;
      let v = (dmg / p('cooldown', 1)) * 40;
      if (param(it, 'sweep', false) && zone >= 1) v *= 1.4;
      if (p('glow') && zone === 2) v += 100;
      // aimed: you line up, but only they reach a seraph lamp (and the furnace saint) down its own line
      return (param(it, 'aim', 'auto') === 'aimed' ? v * 0.6 + (zone >= 1 ? p('range', 6) * 3 : 0) : v + p('range', 1.3) * 2) - loud;
    }
    case 'body': {
      // the rime hood: worth it in the furnace, a chill anywhere else (it is taken off on the way home)
      const inFurnace = zones.zoneAt(g.player.x, g.player.y) === 3 || (zone === 3 && zones.zoneAt(g.player.x, g.player.y) === 2);
      const heat = inFurnace ? p('heatproof') * 200 : p('chill') ? -60 : 0;
      return p('hp') * 5 + p('regen') * (zone === 2 ? 60 : 120) + p('armour') * 45 + (param(it, 'ward', false) ? 25 : 0) + p('mend') * 6 + p('thorns') * 30 + heat + p('haste') * 60 - loud;
    }
    case 'power':
      return 0; // power modules are chosen for what they let you run
    case 'lamp':
      return zones.needsLamp(zone) || zones.needsLamp(zones.zoneAt(g.player.x, g.player.y)) ? 150 + p('radius') * 5 : 0;
    case 'scanner': {
      const sees = param<string[]>(it, 'sees', []);
      if (sees.includes('metal') && zone >= 1) return 25; // mimics wake early
      if ((sees.includes('flesh') || sees.includes('heat')) && deep) return 45; // the hum
      return 0;
    }
    case 'mind': {
      const what = param<string>(it, 'what', '');
      if (what === 'reader') return wantReader ? 300 : 0;
      if (what === 'map') return 8;
      if (what === 'ledger') return 30; // the tithe: kills pay out twice as often
      return 0;
    }
    default:
      return 0;
  }
}

/** the best loadout: greedy by worth, one camera, power modules added when the rest needs them */
function bestLoadout(g: Game, zone: number, wantReader: boolean, lift: { power?: number; slots?: number } = {}, mode: Mode = 'explore'): Set<object> {
  const P = g.player;
  const all: { ref: object; mod: string; roll?: any }[] = [
    ...P.installed.map((i) => ({ ref: i as object, mod: i.mod, roll: i.roll, rarity: i.rarity })),
    ...P.inv.filter((i) => i.kind === 'mod' && MODS[i.mod].family !== 'unique').map((i) => ({ ref: i as object, mod: (i as any).mod, roll: (i as any).roll, rarity: (i as any).rarity })),
  ];
  const slotBoards = all.filter((a) => param(a, 'slots', 0) > 0);
  const powers = all.filter((a) => MODS[a.mod].family === 'power' && param(a, 'power', 0) > 0).sort((a, b) => param<number>(b, 'power', 0) - param<number>(a, 'power', 0));
  const rest = all
    .filter((a) => MODS[a.mod].family !== 'power')
    .map((a) => ({ ...a, w: worth(g, a, zone, wantReader, mode) }))
    .filter((a) => a.w > 0)
    // power is the scarce thing (docs/modules.md): rank by worth per power; an eye pays 15 a point
    .map((a) => {
      const pw = MODS[a.mod].power;
      const fam = MODS[a.mod].family;
      return { ...a, rank: fam === 'gait' ? a.w : fam === 'camera' ? a.w - 15 * pw + 1000 : a.w / Math.max(1, pw) };
    })
    .sort((a, b) => b.rank - a.rank);
  // the first weapon comes before everything but legs: an unarmed body dies to the first mites
  const firstWeapon = rest.find((a) => MODS[a.mod].family === 'weapon');
  if (firstWeapon) rest.splice(rest.indexOf(firstWeapon), 1), rest.splice(rest.findIndex((a) => MODS[a.mod].family !== 'gait') < 0 ? rest.length : rest.findIndex((a) => MODS[a.mod].family !== 'gait'), 0, firstWeapon);
  const pick = new Set<object>();
  let slots = lift.slots ?? P.slots;
  let cap = lift.power ?? P.core;
  let used = 0;
  let cams = 0;
  const fams = new Map<string, number>();
  for (const a of rest) {
    const m = MODS[a.mod];
    if (m.family === 'camera' && cams >= 1) continue;
    if (m.family === 'lamp' && (fams.get('lamp') ?? 0) >= 1) continue;
    if (m.family === 'scanner' && (fams.get('scanner') ?? 0) >= 1) continue;
    // one of each module but weapons: a second rime hood or lead lung adds nothing worth its power
    if (m.family !== 'weapon' && all.some((x) => pick.has(x.ref) && x.mod === a.mod)) continue;
    if (m.family === 'gait' && (fams.get('gait') ?? 0) >= 1) continue;
    if (m.family === 'mind' && all.filter((x) => pick.has(x.ref) && MODS[x.mod].family === 'mind' && param(x, 'what', '') === param(a, 'what', '')).length) continue;
    if (slots < 1) break;
    // power short: take the strongest spare power module first, if a slot is left for both
    while (used + m.power > cap) {
      const pw = powers.find((x) => !pick.has(x.ref));
      if (!pw || slots < 2) break;
      pick.add(pw.ref);
      slots--;
      cap += param<number>(pw, 'power', 0);
    }
    if (used + m.power > cap) continue;
    if (slots < size(a)) continue;
    pick.add(a.ref);
    slots -= size(a);
    used += m.power;
    if (m.family === 'camera') cams++;
    fams.set(m.family, (fams.get(m.family) ?? 0) + 1);
  }
  if (P.slots < printer.MAX_SLOTS) for (const s of slotBoards) pick.add(s.ref); // slot boards: they add a slot and use themselves up
  return pick;
}

const words = (mod: string) => MODS[mod].name;

export interface Opts {
  style: 'careful' | 'rusher';
  limit: number;
  debug?: boolean;
}

export function play(seed: number, o: Opts): Run {
  const g = newGame(seed);
  startKit(g);
  const P = g.player;
  const run: Run = { seed, style: o.style, ended: 'time', t: 0, marks: {}, snaps: [], steps: [], bought: [], resPeak: 0, resEnd: 0, kills: 0, homes: 0, recycled: 0, log: [], bound: { power: 0, slots: 0, both: 0, n: 0 }, generators: [], loadouts: {}, offs: 0, everOn: [], setups: 0, income: 0 };
  const seen = new Set<string>();
  // things given up on, for a minute (a corner it could not get round, a lamp it could not reach)
  const bans = new Map<object, number>();
  const banned = { has: (o: object) => (bans.get(o) ?? -1) > g.t, add: (o: object) => void bans.set(o, g.t + 60) };
  const visits = new Map<string, number>();
  let goalRef: object | null = null;
  let lastPow = powerMax(g);
  let lastSlots = P.slots;
  let lastFlesh = 0;
  let nextSnap = 0;
  let restUntilFull = false;
  const mark = (what: string) => {
    if (!(what in run.marks)) run.marks[what] = Math.round(g.t);
  };
  const advance = (s: number) => {
    for (let k = 0; k < Math.round(s / DT) && !g.ended; k++) tick(g, DT);
  };
  const zoneHere = () => zones.zoneAt(P.x, P.y);
  const send = (cmd: string) => exec(g, cmd);

  /** one decision: a command (then a short wait) or a wait */
  let why = '';
  let toward: { x: number; y: number; tx: number; ty: number; until: number } | null = null;
  const stall = { at: 0, x: 8.5, y: 8.5, n: 0 };
  let lastGoalRef: object | null = null;
  const hunts = new Map<object, { since: number; hp: number }>();
  let avoid: ((x: number, y: number) => boolean) | null = null;
  let cur: { ref: object; until: number } | null = null;
  let explore: { x: number; y: number; until: number } | null = null;
  let fightSig = '';
  let fightSince = 0;
  // a person needs a moment to see a telegraph before they move (r2: the sim dodged every one at once)
  const REACT = 0.35;
  const reacted = (e: Entity) => g.t - Number(e.enemy!.data.windAt ?? -99) >= REACT;
  /** a telegraph seen but not yet reacted to: decide again soon */
  const pending = (e: Entity) => !!e.enemy!.data.windup && g.t < Number(e.enemy!.data.windup) && !reacted(e) && e.enemy!.type !== 'mite';
  function decide(): string | number {
    why = '';
    const px = Math.floor(P.x);
    const py = Math.floor(P.y);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) seen.add(key(px + dx, py + dy));
    const foes = g.ents.filter((e) => e.enemy && dist(e, P) < 9 && (!ENEMIES[e.enemy.type]?.hidden || dist(e, P) < 2.2)).sort((a, b) => dist(a, P) - dist(b, P));
    const close = foes.filter((e) => dist(e, P) < 1.6 || (dist(e, P) < 2.2 && e.enemy!.data.noticed));
    const hpFrac = P.hp / P.maxHp;
    // nearly dead with something on you: fold home
    const outOfDepth = !ready(zoneHere());
    // slow foes (walkers, the abbot) a person just walks away from, then mends out of their reach
    const slow = (e: Entity) => ENEMIES[e.enemy!.type].speed < 1.5;
    if (hpFrac < (outOfDepth ? 0.55 : 0.4) && close.length && close.every(slow) && !P.path.length) {
      const away = stepAway(close[0]);
      if (away) {
        restUntilFull = true;
        why = 'walk off a slow foe';
        return away.replace(/ 1$/, ' 3');
      }
    }
    if (hpFrac < (outOfDepth ? 0.55 : 0.4) && close.length) {
      if (!(P as any)._homing || g.t > (P as any)._homing) {
        (P as any)._homing = g.t + 3.2;
        run.homes++;
        restUntilFull = true;
        return 'unstuck';
      }
    }
    if ((P as any)._homing && g.t < (P as any)._homing) return 0.3;
    // a walker winding up next to you: step away
    for (const e of close) {
      if (e.enemy!.data.windup && e.enemy!.type !== 'mite' && dist(e, P) < 1.75 && reacted(e)) {
        const away = stepAway(e);
        if (away) return away;
      }
    }
    // mending after a walk-off: keep away from what is after you until it gives up
    if (restUntilFull && hpFrac < 0.95 && !P.path.length) {
      const after = foes.filter((e) => e.enemy!.data.noticed && dist(e, P) < 6);
      if (after.length && after.every(slow)) {
        const away = stepAway(after[0]);
        if (away) { why = 'keep off to mend'; return away.replace(/ 1$/, ' 3'); }
      }
      if (!after.length && !close.length) { why = 'mend'; return 2; }
    }
    // the elites' telegraphs (src/fight/index.ts): two cells from the abbot's sweep, aside from the warden's dash
    for (const e of foes) {
      const d = e.enemy!.data;
      if (!d.windup || g.t >= (d.windup as number) || !reacted(e)) continue;
      if (/both arms/.test(String(d.move)) && dist(e, P) < 2.6 && !P.path.length) {
        const away = stepAway(e);
        if (away) return away.replace(/ 1$/, ' 2');
      }
      // the saint's cross: off its rows and columns
      if (/cross/.test(String(d.move))) {
        const onStar = (x: number, y: number) => Math.abs(x + 0.5 - e.x) < 0.6 || Math.abs(y + 0.5 - e.y) < 0.6;
        if (onStar(px, py)) {
          const off = ([['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]] as const).find(([, ox, oy]) => cellAt(g, px + ox, py + oy) === Cell.floor && !onStar(px + ox, py + oy));
          if (off) return `go ${off[0]} 1`;
        }
      }
      if (d.dash) {
        const [vx, vy] = d.dash as [number, number];
        // already off its line: stay
        if (Math.abs((P.x - e.x) * vy - (P.y - e.y) * vx) > 0.9 || P.path.length) continue;
        const side = ([['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]] as const)
          .filter(([, ox, oy]) => cellAt(g, px + ox, py + oy) === Cell.floor)
          .sort((a, b) => Math.abs((px + b[1] + 0.5 - e.x) * vy - (py + b[2] + 0.5 - e.y) * vx) - Math.abs((px + a[1] + 0.5 - e.x) * vy - (py + a[2] + 0.5 - e.y) * vx))[0];
        if (side) return `go ${side[0]} 1`;
      }
    }
    // a seraph has you in its line: step out
    const lamps = foes.filter((e) => ['seraph', 'pyre', 'saint'].includes(e.enemy!.type));
    const inLine = (x: number, y: number) => lamps.some((e) => (Math.abs(e.x - x - 0.5) < 0.6 || Math.abs(e.y - y - 0.5) < 0.6) && dist(e, { x: x + 0.5, y: y + 0.5 }) > 1.5 && dist(e, { x: x + 0.5, y: y + 0.5 }) <= ENEMIES[e.enemy!.type].sense && clear(g, e.x, e.y, x + 0.5, y + 0.5));
    const lampReady = lamps.some((e) => g.t >= e.enemy!.readyAt - 0.6);
    // an aimed weapon ready and the lamp down your line: trade the shot rather than step out (hp allowing)
    const aimedNow = active(g, 'weapon').filter((i) => param(i, 'aim', 'auto') === 'aimed' && g.t >= ((i.data.readyAt as number) ?? 0));
    const shotAt = (e: Entity) => (Math.abs(e.x - P.x) < 0.45 || Math.abs(e.y - P.y) < 0.45) && clear(g, P.x, P.y, e.x, e.y) && aimedNow.some((i) => dist(e, P) <= param<number>(i, 'range', 6));
    const trade = hpFrac > 0.5 && lamps.some(shotAt);
    if (lamps.length && lampReady && !trade && inLine(px, py) && !lamps.every((e) => banned.has(e))) {
      for (const [d, ox, oy] of [['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]] as const)
        if (cellAt(g, px + ox, py + oy) === Cell.floor && !inLine(px + ox, py + oy)) { why = 'out of line'; return `go ${d} 1`; }
    }
    // aimed weapons: shoot a foe standing in a straight line
    const aimed = active(g, 'weapon').filter((i) => param(i, 'aim', 'auto') === 'aimed' && g.t >= ((i.data.readyAt as number) ?? 0));
    if (aimed.length) {
      for (const e of foes) {
        const dx = e.x - P.x;
        const dy = e.y - P.y;
        if (dist(e, P) > Math.max(...aimed.map((i) => param<number>(i, 'range', 6)))) continue;
        if ((Math.abs(dx) < 0.45 || Math.abs(dy) < 0.45) && clear(g, P.x, P.y, e.x, e.y)) {
          const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
          const want = { n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 }[d];
          if (Math.abs(Math.atan2(Math.sin(P.dir - want), Math.cos(P.dir - want))) > 0.2) return `face ${d}`;
          return 'shoot';
        }
      }
    }
    // a fight coming: switch to the battle setup (once saved, one command; the first time by hand, then saved)
    if (foes.some((e) => dist(e, P) < 7 && (!ENEMIES[e.enemy!.type]?.hidden || dist(e, P) < 2.2))) battleUntil = g.t + 5;
    if (g.t < battleUntil) {
      const sw = setupStep('battle', bestLoadout(g, Math.max(targetZone(), zoneHere()), false, {}, 'battle'));
      if (sw) return sw;
    }
    // something on you: hold still and let the weapons work
    if (close.length && P.path.length === 0) {
      // a foe that neither hits nor gets hit for a while (a corner between you): step to face it squarely
      const sig = close.map((e) => e.id + ':' + e.enemy!.hp).join(',') + '|' + P.hp.toFixed(1);
      if (sig !== fightSig) {
        fightSig = sig;
        fightSince = g.t;
      } else if (g.t - fightSince > 2.5) {
        fightSince = g.t;
        const e = close[0];
        const opts = (Math.abs(e.x - P.x) > Math.abs(e.y - P.y) ? [['e', 1, 0], ['w', -1, 0], ['s', 0, 1], ['n', 0, -1]] : [['s', 0, 1], ['n', 0, -1], ['e', 1, 0], ['w', -1, 0]]) as [string, number, number][];
        const toward = opts.filter(([, ox, oy]) => cellAt(g, px + ox, py + oy) === Cell.floor).sort((a, b) => Math.hypot(px + a[1] + 0.5 - e.x, py + a[2] + 0.5 - e.y) - Math.hypot(px + b[1] + 0.5 - e.x, py + b[2] + 0.5 - e.y))[0];
        if (toward) return `go ${toward[0]} 1`;
      }
      why = 'fight ' + close.map((e) => e.enemy!.type + ':' + e.enemy!.hp + '@' + dist(e, P).toFixed(1)).join(',');
      return foes.some(pending) ? Math.max(0.05, REACT - (g.t - Math.max(...foes.filter(pending).map((e) => Number(e.enemy!.data.windAt))))) : 0.3;
    }
    if (close.length && P.path.length) {
      P.path = P.path.slice(0, 1);
      return 0.2;
    }
    if (P.path.length) { why = 'path ' + P.path.length + ' ' + JSON.stringify(P.path[0]) + ' at ' + P.x.toFixed(2) + ',' + P.y.toFixed(2) + ' pace ' + P.pace; return 0.3; }
    // rest: after a fold home, to full; otherwise to 70% when nothing is near
    const canMend = !((zones.needsLamp(zoneHere()) || active(g, 'body').some((i) => param<number>(i, 'chill', 0) > 0)) && !light(g)) || active(g, 'body').some((i) => param<number>(i, 'regen', 0) > 0);
    // a rime hood outside the furnace only chills: off with it before anything else
    const hood = zoneHere() !== 3 && P.installed.find((i) => param<number>(i, 'chill', 0) > 0);
    if (hood && !canMend) return 'remove ' + labelOf(hood);
    if (!canMend && hpFrac < 0.6 && !foes.some((e) => dist(e, P) < 6) && !(g.t < ((P as any)._homing ?? -1))) {
      (P as any)._homing = g.t + 3.2;
      why = 'cold: home to mend';
      return 'unstuck';
    }
    if (restUntilFull && hpFrac < 0.95 && !foes.length) return 2;
    // an elite ahead that has not seen you yet: mend to full first (r2: no mending once it is on you)
    if (hpFrac < 0.95 && foes.some((e) => e.enemy!.data.elite && !e.enemy!.data.noticed) && !foes.some((e) => e.enemy!.data.noticed && dist(e, P) < 6)) {
      why = 'mend before the elite';
      return 2;
    }
    restUntilFull = false;
    if (hpFrac < 0.6 && !foes.some((e) => dist(e, P) < 6)) return 2;
    // stalled (pacing, a corner, a goal it cannot reach): give up the goal; twice running, fold home
    if (g.t >= stall.at + 30) {
      const moved = Math.hypot(P.x - stall.x, P.y - stall.y);
      if (moved < 4 && hpFrac > 0.9) {
        stall.n++;
        if (cur) banned.add(cur.ref);
        if (lastGoalRef) banned.add(lastGoalRef);
        explore = null;
        seen.clear();
        if (stall.n >= 2) {
          stall.n = 0;
          Object.assign(stall, { at: g.t, x: P.x, y: P.y });
          why = 'stalled';
          return 'unstuck';
        }
      } else stall.n = 0;
      Object.assign(stall, { at: g.t, x: P.x, y: P.y });
    }
    // take what is in reach
    if (g.ents.some((e) => e.kind === 'item' && dist(e, P) < 1.6)) return 'take';
    // install / remove toward the best loadout
    const zt = targetZone();
    // r2 decide: a carried reader reads for a bone; installing it is for when bone runs out
    const handReader = P.inv.some((i) => i.kind === 'mod' && i.mod === 'card-reader') && resOf(g, 'bone') >= 8; // bone to spare
    if (handReader && P.inv.some((i) => i.kind === 'card') && !active(g, 'mind').some((i) => param(i, 'what', '') === 'reader')) return 'read card';
    const wantReader = !handReader && (g.cards.length < 4 || P.inv.some((i) => i.kind === 'card'));
    if (P.inv.some((i) => i.kind === 'mod' && i.mod === 'thaw-engine')) {
      if (slotsUsed(g) < P.slots) return 'install thaw engine';
      const out = P.installed.find((i) => MODS[i.mod].family !== 'gait');
      if (out) return 'remove ' + words(out.mod);
    }
    const pick = bestLoadout(g, Math.max(zt, zoneHere()), wantReader);
    // two setups (docs/modules.md): explore on, battle's extra weapons installed but off while slots allow
    const keep = withBattle(pick, bestLoadout(g, Math.max(zt, zoneHere()), wantReader, {}, 'battle'));
    for (const i of P.installed) if (!keep.has(i)) return run.offs++, 'remove ' + labelOf(i);
    for (const i of P.inv) if (i.kind === 'mod' && pick.has(i) && slotsUsed(g) + size(i) <= P.slots) return 'install ' + labelOf(i);
    for (const i of P.inv) if (i.kind === 'mod' && keep.has(i) && slotsUsed(g) + size(i) <= P.slots) return 'install ' + labelOf(i);
    const sw = g.t < battleUntil ? null : setupStep('explore', pick);
    if (sw) return sw;
    if (active(g, 'mind').some((i) => param(i, 'what', '') === 'reader') && P.inv.some((i) => i.kind === 'card')) return 'read card';
    // grind what the loadout leaves out (keep spare power modules: they come in when power runs short)
    const wouldRun = bestLoadout(g, Math.max(zt, zoneHere()), wantReader, { power: 99 });
    const spare = P.inv.find((i) => i.kind === 'mod' && !pick.has(i) && !wouldRun.has(i) && MODS[i.mod].family !== 'unique' && (MODS[i.mod].family !== 'power' || (param(i, 'slots', 0) > 0 && P.slots >= printer.MAX_SLOTS)) && !(MODS[i.mod].family === 'mind' && param(i, 'what', '') === 'reader') && !(MODS[i.mod].family === 'lamp' && ![...P.inv, ...P.installed].some((x) => x !== i && 'mod' in x && MODS[x.mod].family === 'lamp')));
    if (spare && 'mod' in spare) {
      run.recycled++;
      return 'recycle ' + labelOf(spare);
    }
    // buy at a machine in reach
    const buy = buyHere();
    if (buy) return buy;
    // a lamp that saw you: close in on a diagonal (out of its lines) and bite it
    const lamp = lamps.find((e) => !banned.has(e) && e.enemy!.data.noticed && dist(e, P) < 8 && (e.enemy!.type !== 'saint' || ready(3)));
    if (lamp) {
      const h = hunts.get(lamp) ?? { since: g.t, hp: lamp.enemy!.hp };
      if (h.hp !== lamp.enemy!.hp) Object.assign(h, { since: g.t, hp: lamp.enemy!.hp });
      hunts.set(lamp, h);
      if (g.t - h.since > 8) banned.add(lamp); // it will not come to a corner: leave it
      const fx = Math.floor(lamp.x);
      const fy = Math.floor(lamp.y);
      const diag = ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).map(([ox, oy]) => [fx + ox, fy + oy] as [number, number]).filter(([x, y]) => cellAt(g, x, y) === Cell.floor).sort((a, b) => Math.hypot(a[0] - px, a[1] - py) - Math.hypot(b[0] - px, b[1] - py))[0];
      if (diag && !(diag[0] === px && diag[1] === py)) {
        avoid = (x, y) => inLine(x, y) && !(x === diag[0] && y === diag[1]);
        const c = walkTo({ x: diag[0] + 0.5, y: diag[1] + 0.5, zone: zoneHere() });
        avoid = null;
        if (c !== 'listen') { why = 'hunt lamp ' + lamp.id; return c; }
        // no way round its lines: rush it straight while it cools
        if (lamp.enemy!.readyAt - g.t > 1.2 && !lamp.enemy!.data.windup) {
          const c2 = walkTo({ x: lamp.x, y: lamp.y, zone: zoneHere() });
          if (c2 !== 'listen') { why = 'rush lamp'; return c2; }
        }
        banned.add(lamp);
      } else if (diag) return 0.3;
    }
    // where to go
    const gl = goal();
    const out = walkTo(gl);
    why ||= 'goal ' + (gl?.explore !== undefined ? 'explore z' + gl.explore + ' ' + (explore ? explore.x + ',' + explore.y : '') : gl ? Math.round(gl.x) + ',' + Math.round(gl.y) : '-');
    return out;
  }

  const labelOf = (i: { mod: string; roll?: any; rarity?: any; title?: string }) => label(i);

  // ---- setups: what each saved setup holds (module ids, sorted), and the last `setup` tried
  let battleUntil = -1;
  const saved: Record<string, string> = {};
  let tried = { name: '', at: -99 };
  /** the explore pick plus the battle pick's extras, while slots last (slot boards take none) */
  function withBattle(pick: Set<object>, fight: Set<object>): Set<object> {
    const out = new Set(pick);
    const used = () => [...out].filter((r) => !param(r as any, 'slots', 0)).reduce((s, r) => s + size(r as any), 0);
    for (const r of fight) if (!out.has(r) && used() + size(r as any) <= P.slots) out.add(r);
    return out;
  }
  /** one step toward having exactly `want`'s installed modules on, by `setup name` once it is saved */
  function setupStep(name: Mode, want: Set<object>): string | null {
    const D = P.installed.filter((i) => want.has(i));
    const on = P.installed.filter((i) => i.on);
    const sig = D.map((i) => i.mod).sort().join(',');
    if (D.every((i) => i.on) && on.every((i) => want.has(i))) {
      if (saved[name] === sig || !D.length) return null;
      saved[name] = sig;
      return `save setup ${name}`;
    }
    if (saved[name] === sig && !(tried.name === name && g.t - tried.at < 3)) {
      tried = { name, at: g.t };
      run.setups++;
      return `setup ${name}`;
    }
    const isPow = (i: { mod: string }) => MODS[i.mod].family === 'power';
    const off = on.find((i) => !want.has(i) && !isPow(i));
    if (off) return 'off ' + labelOf(off);
    const pw = D.find((i) => !i.on && isPow(i));
    if (pw) return 'on ' + labelOf(pw);
    const next = D.find((i) => !i.on && MODS[i.mod].power + powerUsed(g) <= powerMax(g));
    if (next) return 'on ' + labelOf(next);
    return null;
  }

  function stepAway(e: Entity): string | null {
    const px = Math.floor(P.x);
    const py = Math.floor(P.y);
    let best: string | null = null;
    let bd = 0;
    for (const [d, ox, oy] of [['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]] as const) {
      if (cellAt(g, px + ox, py + oy) !== Cell.floor) continue;
      const r = Math.hypot(px + ox + 0.5 - e.x, py + oy + 0.5 - e.y);
      if (r > bd) {
        bd = r;
        best = `go ${d} 1`;
      }
    }
    return best;
  }

  /** the zone of the next thing to reach: shard k or the engine */
  function nextTarget(): { x: number; y: number; what: string } | null {
    // the nearest one it is ready for, else the one in the shallowest zone
    // a shard vector reached while its card still lies there (it fled the elite) is still the target
    const open = (v: { x: number; y: number; found: boolean }) => !v.found || g.ents.some((e) => e.item?.kind === 'card' && dist(e, v) < 1.6);
    const vs = g.vectors.filter((v) => open(v) && (v.what === 'scripture shard' || v.what === 'thaw engine'));
    const ok = vs.filter((v) => ready(zones.zoneAt(v.x, v.y))).sort((a, b) => dist(a, P) - dist(b, P));
    return ok[0] ?? vs.sort((a, b) => zones.zoneAt(a.x, a.y) - zones.zoneAt(b.x, b.y) || dist(a, P) - dist(b, P))[0] ?? null;
  }
  function targetZone(): number {
    const v = nextTarget();
    return v ? zones.zoneAt(v.x, v.y) : zoneHere();
  }
  /** is the loadout up to the zone? the careful player waits until it is */
  function ready(z: number): boolean {
    if (o.style === 'rusher') return true;
    return zones.readiness(g) >= zones.ZONES[Math.min(z, zones.ZONES.length - 1)].need;
  }

  function buyHere(): string | null {
    const m = g.ents.find((e) => (e.kind === 'printer' || e.data?.altar) && dist(e, P) < 1.6);
    if (!m) return null;
    for (const offer of machineOffers(m)) {
      if (!offer.ok) continue;
      run.bought.push(`${Math.round(g.t)}s ${offer.cmd}`);
      return offer.cmd;
    }
    return null;
  }
  function machineOffers(m: Entity): { cmd: string; ok: boolean }[] {
    const out: { cmd: string; ok: boolean }[] = [];
    if (m.data?.altar) for (const [cmd, cost] of altar.offers(g, m)) out.push({ cmd, ok: afford(cost) && (cmd !== 'offer mend' || P.hp < P.maxHp * 0.5) });
    if (m.kind === 'printer' && m.data?.shop) {
      const zone = Math.max(targetZone(), zoneHere());
      const pick = bestLoadout(g, zone, true);
      const worst = Math.min(...P.installed.filter((i) => pick.has(i)).map((i) => worth(g, i, zone, false)).filter((w) => w > 0 && w < 900), 999);
      printer.offers(g, m).forEach((it, k) => {
        if (!it || it.kind !== 'mod') return;
        const w = worth(g, it, zone, false);
        const powerShort = MODS[it.mod].family === 'power' && param(it, 'power', 0) > 0 && powerUsed(g) >= powerMax(g) - 1;
        const good = (w > worst * 1.15 && w > 20) || (P.installed.length < P.slots && w > 20) || powerShort;
        out.push({ cmd: `buy ${k + 1}`, ok: good && afford(printer.priceAt(m, k, it)) });
      });
    } else if (m.kind === 'printer') {
      const pr = printer;
      {
        if (P.slots < pr.MAX_SLOTS) out.push({ cmd: 'print slot', ok: afford(pr.slotCost(g)) });
        // a module only with plenty to spare
        const mc = pr.modCost((m.data?.far as number) ?? 0);
        // r2 econ: with R2_AIM=1, an aimed print first once the core is full, at the family whose best piece on is
        // weakest (weapon, body, eye). Off by default: every aiming rule tried cost the sims 1-5 thaws of 40
        const zone = Math.max(targetZone(), zoneHere());
        const best = (f: string) => Math.max(0, ...P.installed.filter((i) => MODS[i.mod].family === f).map((i) => worth(g, i, zone, false)));
        const fam = (['weapon', 'body', 'camera'] as const).slice().sort((a, b) => best(a) - best(b))[0];
        const ac = pr.aimedCost((m.data?.far as number) ?? 0);
        if (process.env.R2_AIM && P.core >= altar.MAX_CORE) out.push({ cmd: `print ${fam === 'camera' ? 'eye' : fam}`, ok: afford(Object.fromEntries(Object.entries(ac).map(([k, v]) => [k, (v as number) * 2]))) });
        out.push({ cmd: 'print module', ok: afford(Object.fromEntries(Object.entries(mc).map(([k, v]) => [k, (v as number) * 2]))) });
      }
    }
    return out;
  }
  const afford = (c: Partial<Record<Res, number>>) => Object.entries(c).every(([r, n]) => resOf(g, r as Res) >= (n as number));

  /** where to go next: an item worth taking, a machine with something affordable, the target, or new floor */
  function goal(): { x: number; y: number; ref?: object; explore?: number; zone?: number } | null {
    const v = nextTarget();
    const zt = v ? zones.zoneAt(v.x, v.y) : 0;
    const go = v && ready(zt);
    // the farthest zone the player is willing to wander in now
    const roam = go ? zt : Math.max(0, Math.min(zones.ZONES.length - 1, bestReadyZone()));
    // heading for a shard it is ready for, it only stops for what lies close to the way
    const near0 = go ? 8 : 24;
    const items = g.ents.filter((e) => e.kind === 'item' && !banned.has(e) && dist(e, P) < near0 && zones.zoneAt(e.x, e.y) <= Math.max(roam, zoneHere()));
    const machines = g.ents.filter((e) => (e.kind === 'printer' || e.data?.altar) && !banned.has(e) && dist(e, P) < (go ? 12 : 30) && zones.zoneAt(e.x, e.y) <= Math.max(roam, zoneHere()) && machineOffers(e).some((x) => x.ok));
    // keep going for what it chose a moment ago (two near things must not pull it back and forth)
    if (cur && g.t < cur.until && !banned.has(cur.ref) && g.ents.includes(cur.ref as Entity) && (items.includes(cur.ref as Entity) || machines.includes(cur.ref as Entity)))
      return { x: (cur.ref as Entity).x, y: (cur.ref as Entity).y, ref: cur.ref, zone: roam };
    const near = [...items, ...machines].sort((a, b) => dist(a, P) - dist(b, P))[0];
    if (near) cur = { ref: near, until: g.t + 20 };
    if (near) return { x: near.x, y: near.y, ref: near, zone: roam };
    if (go) return { x: v!.x, y: v!.y, ref: v as object, zone: zt };
    // no vector yet, or not ready: explore new floor inside the roam zone
    return { x: P.x, y: P.y, explore: roam, zone: roam };
  }
  function bestReadyZone(): number {
    let z = 0;
    for (let k = 0; k < zones.ZONES.length; k++) if (o.style === 'rusher' || zones.readiness(g) >= zones.ZONES[k].need) z = k;
    return z;
  }

  function walkTo(t: ReturnType<typeof goal>): string | number {
    if (!t) return 'listen';
    const allowed = Math.max(t.zone ?? 0, zoneHere());
    const px = Math.floor(P.x);
    const py = Math.floor(P.y);
    const here = key(px, py);
    visits.set(here, (visits.get(here) ?? 0) + 1);
    if ((visits.get(here) ?? 0) > 14 && goalRef) {
      banned.add(goalRef);
      visits.clear();
    }
    goalRef = t.ref ?? null;
    lastGoalRef = goalRef ?? lastGoalRef;
    // BFS over generated floor
    const d = new Map([[here, 0]]);
    const prev = new Map<string, [number, number]>();
    const q: [number, number][] = [[px, py]];
    for (let h = 0; h < q.length && q.length < 30000; h++) {
      const [x, y] = q[h];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox;
        const ny = y + oy;
        const k = key(nx, ny);
        if (d.has(k) || cellAt(g, nx, ny) !== Cell.floor || avoid?.(nx, ny)) continue;
        if (zones.zoneAt(nx + 0.5, ny + 0.5) > allowed && zones.zoneAt(x + 0.5, y + 0.5) <= allowed) continue; // a careful player keeps out of zones it is not ready for
        d.set(k, d.get(key(x, y))! + 1);
        prev.set(k, [x, y]);
        q.push([nx, ny]);
      }
    }
    let target: [number, number] | null = null;
    if (t.explore !== undefined && explore && g.t < explore.until && d.has(key(explore.x, explore.y)) && !(explore.x === px && explore.y === py)) target = [explore.x, explore.y];
    else if (t.explore !== undefined) {
      let best = Infinity;
      for (const [x, y] of q) {
        if (seen.has(key(x, y))) continue;
        const z = zones.zoneAt(x + 0.5, y + 0.5);
        if (z > t.explore) continue;
        const c = d.get(key(x, y))! + 0.3 * Math.hypot(x - 8, y - 8) * (z < t.explore ? 1 : 0.2);
        if (c < best) {
          best = c;
          target = [x, y];
        }
      }
      if (!target) {
        // everything here is seen: forget the far half and look again
        seen.clear();
        return 1;
      }
      explore = { x: target[0], y: target[1], until: g.t + 25 };
    } else if (d.has(key(Math.floor(t.x), Math.floor(t.y)))) target = [Math.floor(t.x), Math.floor(t.y)];
    else if (toward && toward.tx === t.x && toward.ty === t.y && g.t < toward.until && d.has(key(toward.x, toward.y)) && !(toward.x === px && toward.y === py)) target = [toward.x, toward.y];
    else {
      let best = Infinity;
      for (const [x, y] of q) {
        const c = Math.hypot(x - t.x, y - t.y) + (seen.has(key(x, y)) ? 2 : 0) + d.get(key(x, y))! * 0.05;
        if (c < best) {
          best = c;
          target = [x, y];
        }
      }
      // keep heading for that frontier cell until reached (the best one flips as cells get seen)
      if (target) toward = { x: target[0], y: target[1], tx: t.x, ty: t.y, until: g.t + 20 };
    }
    if (!target || (target[0] === px && target[1] === py)) {
      if (t.ref) banned.add(t.ref);
      why = 'no target ' + JSON.stringify({ ...t, ref: !!t.ref }) + ' q' + q.length;
      return 'listen';
    }
    const path: [number, number][] = [];
    let c: [number, number] | undefined = target;
    while (c && !(c[0] === px && c[1] === py)) {
      path.unshift(c);
      c = prev.get(key(c[0], c[1]));
    }
    const d0 = [path[0][0] - px, path[0][1] - py];
    let n = 0;
    while (n < path.length && n < 9 && path[n][0] - (n ? path[n - 1][0] : px) === d0[0] && path[n][1] - (n ? path[n - 1][1] : py) === d0[1]) n++;
    const dir = d0[0] === 1 ? 'e' : d0[0] === -1 ? 'w' : d0[1] === 1 ? 's' : 'n';
    return `go ${dir} ${n}`;
  }

  const snap = () => {
    const r = resAll(g);
    run.resPeak = Math.max(run.resPeak, r);
    run.snaps.push({ t: Math.round(g.t), zone: zoneHere(), hp: Math.round(P.hp), maxHp: P.maxHp, power: powerMax(g), slots: P.slots, dps: +dpsOf(active(g, 'weapon')).toFixed(2), armour: active(g, 'body').reduce((s, i) => s + param<number>(i, 'armour', 0), 0), res: r, mods: P.installed.length + P.inv.filter((i) => i.kind === 'mod').length, ready: Math.round(zones.readiness(g)), at: Math.floor(P.x) + ',' + Math.floor(P.y), goal: (() => { const v = nextTarget(); return v ? `${v.what} ${Math.round(v.x)},${Math.round(v.y)} z${zones.zoneAt(v.x, v.y)}` : '-'; })() });
  };

  let last = '';
  let same = 0;
  let nextBound = 0;
  let deepest = -1;
  const onNow = () => P.installed.filter((i) => i.on).map((i) => labelOf(i));
  while (!g.ended && g.t < o.limit) {
    if (g.t >= nextSnap) {
      snap();
      nextSnap += 60;
    }
    if (g.t >= nextBound) {
      nextBound += 10;
      const pFree = powerMax(g) - powerUsed(g);
      const sFree = P.slots - slotsUsed(g);
      // what it would run with unlimited power, or unlimited slots, against what it can run now
      const zb = Math.max(targetZone(), zoneHere());
      const value = (set: Set<object>) => [...set].reduce((n, r) => n + ('mod' in (r as any) && MODS[(r as any).mod].family !== 'power' ? Math.min(worth(g, r as any, zb, false), 500) : 0), 0);
      const now = value(bestLoadout(g, zb, false));
      const morePower = value(bestLoadout(g, zb, false, { power: 99 })) > now + 1;
      const moreSlots = value(bestLoadout(g, zb, false, { slots: 99 })) > now + 1;
      void pFree, void sFree;
      run.bound.n++;
      for (const l of onNow()) if (!run.everOn.includes(l)) run.everOn.push(l);
      if (morePower && moreSlots) run.bound.both++;
      else if (morePower) run.bound.power++;
      else if (moreSlots) run.bound.slots++;
    }
    for (const i of P.installed) if (i.on && MODS[i.mod].family === 'power' && param<number>(i, 'power', 0) > 0 && !run.generators.includes(labelOf(i))) run.generators.push(labelOf(i));
    if (zoneHere() > deepest && (deepest >= 0 || g.t >= 60)) {
      deepest = zoneHere();
      run.loadouts['z' + deepest] = onNow();
    }
    for (const i of [...P.inv, ...P.installed]) if ('mod' in i && i.mod === 'thaw-engine') mark('engine found');
    g.cards.forEach((c) => (c.startsWith('shard') ? mark('shard ' + c) : mark('card ' + c)));
    if (P.installed.some((i) => i.mod === 'card-reader')) mark('reader');
    for (const v of g.vectors) mark('vector ' + v.what);
    for (const k of zones.ZONES.slice(1).map((z) => z.need)) if (zones.readiness(g) >= k) mark('ready ' + k);
    const pw = powerMax(g);
    if (pw > lastPow) run.steps.push({ t: Math.round(g.t), what: `power ${lastPow}→${pw}` });
    if (P.slots > lastSlots) run.steps.push({ t: Math.round(g.t), what: `slots ${lastSlots}→${P.slots}` });
    if ((P.flesh ?? 0) > lastFlesh) run.steps.push({ t: Math.round(g.t), what: `hp +${P.flesh}` });
    lastFlesh = P.flesh ?? 0;
    lastPow = Math.max(lastPow, pw);
    lastSlots = P.slots;
    const before = resAll(g);
    const c = decide();
    if (o.debug && (process.env.ALL || typeof c === 'string' || run.log.length === 0 || !run.log[run.log.length - 1].endsWith('wait'))) run.log.push(`${g.t.toFixed(1)} ${Math.floor(P.x)},${Math.floor(P.y)} hp${P.hp.toFixed(1)} > ${typeof c === 'number' ? 'wait' : c + ' ' + why}${typeof c === 'number' ? ' ' + why + ' wait' : ''}`);
    if (typeof c === 'number') advance(c);
    else {
      send(c);
      same = c === last ? same + 1 : 0;
      last = c;
      advance(same > 2 ? 1 : 0.2);
    }
    run.income += Math.max(0, resAll(g) - before);
  }
  snap();
  run.loadouts.end = onNow();
  run.ended = g.ended ?? 'time';
  run.t = Math.round(g.t);
  run.kills = g.stats.kills;
  run.resEnd = resAll(g);
  (run as any).offered = offeringOf(g) ?? null; // r2 econ: what the Engine took (it empties your resources)
  (run as any).resBy = Object.fromEntries((['bone', 'glass', 'copper', 'ichor'] as Res[]).map((r) => [r, resOf(g, r)]));
  (run as any).core = P.core;
  (run as any).flesh = P.flesh ?? 0;
  (run as any).slots = P.slots;
  if (g.ended === 'dead') {
    const line = g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).reverse().find((l) => l.includes('took you'));
    run.killer = line?.replace(/^you stop\. /, '').replace(/ took you\.$/, '');
    run.deathZone = zoneHere();
  }
  if ((o as any).keep) (run as any).g = g;
  return run;
}

