// A headless player for balance sims (scripts/sim.mjs): plays a seed by console commands only, the way a
// careful player would. It keeps the best loadout its slots and power allow, buys at printers and altars,
// reads cards for vectors, fights (auto weapons on their own, aimed ones when a foe stands in a line),
// steps out of a seraph's line and away from a walker's swing, folds home (`unstuck`) when nearly dead and
// rests. A "careful" player waits for its gear to match the zone a shard lies in; a "rusher" does not.
import '../../src/mods';
import { dist, ENEMIES, newGame, tick } from '../../src/core/game';
import { CHUNK, Cell } from '../../src/core/grid';
import { active, def, MODS, param, powerMax, powerUsed } from '../../src/core/mods';
import { exec } from '../../src/core/verbs';
import type { Entity, Game, Res, Roll } from '../../src/core/types';
import * as printer from '../../src/world/printer';
import * as zones from '../../src/world/zones';
import * as altar from '../../src/world/altar';
import { dpsOf } from '../../src/world/zonemath';
import { startKit } from '../../src/tune/start';

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
function worth(g: Game, it: { mod: string; roll?: any }, zone: number, wantReader: boolean): number {
  const m = MODS[it.mod];
  const p = (k: string, f = 0) => param<number>(it, k, f);
  switch (m.family) {
    case 'gait':
      return param(it, 'go', false) ? 1000 : 0;
    case 'camera':
      return 200 + p('res') / 10 + p('fps');
    case 'weapon': {
      const v = (p('damage', 1) / p('cooldown', 1)) * 40;
      return param(it, 'aim', 'auto') === 'aimed' ? v * 0.6 : v + p('range', 1.3) * 2;
    }
    case 'body':
      return p('hp') * 5 + p('regen') * 120 + p('armour') * 45 + (param(it, 'ward', false) ? 25 : 0) + p('mend') * 6 + p('thorns') * 30 + p('heatproof') * 30 + p('haste') * 60;
    case 'power':
      return 0; // power modules are chosen for what they let you run
    case 'lamp':
      return zones.needsLamp(zone) ? 150 : 0;
    case 'mind': {
      const what = param<string>(it, 'what', '');
      if (what === 'reader') return wantReader ? 300 : 0;
      if (what === 'map') return 8;
      return 0;
    }
    default:
      return 0;
  }
}

/** the best loadout: greedy by worth, one camera, power modules added when the rest needs them */
function bestLoadout(g: Game, zone: number, wantReader: boolean): Set<object> {
  const P = g.player;
  const all: { ref: object; mod: string; roll?: any }[] = [
    ...P.installed.map((i) => ({ ref: i as object, mod: i.mod, roll: i.roll })),
    ...P.inv.filter((i) => i.kind === 'mod' && MODS[i.mod].family !== 'unique').map((i) => ({ ref: i as object, mod: (i as any).mod, roll: (i as any).roll })),
  ];
  const slotBoards = all.filter((a) => param(a, 'slots', 0) > 0);
  const powers = all.filter((a) => MODS[a.mod].family === 'power' && param(a, 'power', 0) > 0).sort((a, b) => param<number>(b, 'power', 0) - param<number>(a, 'power', 0));
  const rest = all
    .filter((a) => MODS[a.mod].family !== 'power')
    .map((a) => ({ ...a, w: worth(g, a, zone, wantReader) }))
    .filter((a) => a.w > 0)
    .sort((a, b) => b.w - a.w);
  const pick = new Set<object>();
  let slots = P.slots;
  let cap = P.core;
  let used = 0;
  let cams = 0;
  const fams = new Map<string, number>();
  for (const a of rest) {
    const m = MODS[a.mod];
    if (m.family === 'camera' && cams >= 1) continue;
    if (m.family === 'lamp' && (fams.get('lamp') ?? 0) >= 1) continue;
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
    pick.add(a.ref);
    slots--;
    used += m.power;
    if (m.family === 'camera') cams++;
    fams.set(m.family, (fams.get(m.family) ?? 0) + 1);
  }
  for (const s of slotBoards) pick.add(s.ref); // slot boards always: they add a slot and use themselves up
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
  const run: Run = { seed, style: o.style, ended: 'time', t: 0, marks: {}, snaps: [], steps: [], bought: [], resPeak: 0, resEnd: 0, kills: 0, homes: 0, recycled: 0, log: [] };
  const seen = new Set<string>();
  const banned = new Set<object>();
  const visits = new Map<string, number>();
  let goalRef: object | null = null;
  let lastPow = powerMax(g);
  let lastSlots = P.slots;
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
  let cur: { ref: object; until: number } | null = null;
  let explore: { x: number; y: number; until: number } | null = null;
  let fightSig = '';
  let fightSince = 0;
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
    if (hpFrac < (outOfDepth ? 0.5 : 0.3) && close.length) {
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
      if (e.enemy!.data.windup && dist(e, P) < 1.4) {
        const away = stepAway(e);
        if (away) return away;
      }
    }
    // a seraph has you in its line: step out
    const lamps = foes.filter((e) => e.enemy!.type === 'seraph' || e.enemy!.type === 'furnace-saint');
    const inLine = (x: number, y: number) => lamps.some((e) => (Math.abs(e.x - x - 0.5) < 0.6 || Math.abs(e.y - y - 0.5) < 0.6) && dist(e, { x: x + 0.5, y: y + 0.5 }) > 1.5);
    if (lamps.length && inLine(px, py) && !close.length) {
      for (const [d, ox, oy] of [['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]] as const)
        if (cellAt(g, px + ox, py + oy) === Cell.floor && !inLine(px + ox, py + oy)) return `go ${d} 1`;
    }
    // aimed weapons: shoot a foe standing in a straight line
    const aimed = active(g, 'weapon').filter((i) => param(i, 'aim', 'auto') === 'aimed' && g.t >= ((i.data.readyAt as number) ?? 0));
    if (aimed.length) {
      for (const e of foes) {
        const dx = e.x - P.x;
        const dy = e.y - P.y;
        if (dist(e, P) > Math.max(...aimed.map((i) => param<number>(i, 'range', 6)))) continue;
        if (Math.abs(dx) < 0.45 || Math.abs(dy) < 0.45) {
          const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
          const want = { n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 }[d];
          if (Math.abs(Math.atan2(Math.sin(P.dir - want), Math.cos(P.dir - want))) > 0.2) return `face ${d}`;
          return 'shoot';
        }
      }
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
      return 0.3;
    }
    if (close.length && P.path.length) {
      P.path = P.path.slice(0, 1);
      return 0.2;
    }
    if (P.path.length) { why = 'path ' + P.path.length + ' ' + JSON.stringify(P.path[0]) + ' at ' + P.x.toFixed(2) + ',' + P.y.toFixed(2) + ' pace ' + P.pace; return 0.3; }
    // rest: after a fold home, to full; otherwise to 70% when nothing is near
    if (restUntilFull && hpFrac < 0.95 && !foes.length) return 2;
    restUntilFull = false;
    if (hpFrac < 0.6 && !foes.some((e) => dist(e, P) < 6)) return 2;
    // take what is in reach
    if (g.ents.some((e) => e.kind === 'item' && dist(e, P) < 1.6)) return 'take';
    // install / remove toward the best loadout
    const zt = targetZone();
    const wantReader = g.cards.length < 4 || P.inv.some((i) => i.kind === 'card');
    if (P.inv.some((i) => i.kind === 'mod' && i.mod === 'thaw-engine')) {
      if (P.installed.length < P.slots) return 'install thaw engine';
      const out = P.installed.find((i) => MODS[i.mod].family !== 'gait');
      if (out) return 'remove ' + words(out.mod);
    }
    const pick = bestLoadout(g, Math.max(zt, zoneHere()), wantReader);
    for (const i of P.installed) if (!pick.has(i)) return 'remove ' + labelOf(i);
    for (const i of P.inv) if (i.kind === 'mod' && pick.has(i) && P.installed.length < P.slots) return 'install ' + labelOf(i);
    for (const i of P.installed) if (!i.on && MODS[i.mod].power + powerUsed(g) <= powerMax(g)) return 'on ' + labelOf(i);
    if (active(g, 'mind').some((i) => param(i, 'what', '') === 'reader') && P.inv.some((i) => i.kind === 'card')) return 'read card';
    // grind what the loadout leaves out (keep spare power modules: they come in when power runs short)
    const spare = P.inv.find((i) => i.kind === 'mod' && !pick.has(i) && MODS[i.mod].family !== 'unique' && MODS[i.mod].family !== 'power' && !(MODS[i.mod].family === 'mind' && param(i, 'what', '') === 'reader') && !(MODS[i.mod].family === 'lamp' && !P.inv.concat(P.installed as any).some((x: any) => x !== i && MODS[x.mod]?.family === 'lamp')));
    if (spare && 'mod' in spare) {
      run.recycled++;
      return 'recycle ' + labelOf(spare);
    }
    // buy at a machine in reach
    const buy = buyHere();
    if (buy) return buy;
    // where to go
    return walkTo(goal());
  }

  const labelOf = (i: { mod: string; roll?: any }) => (i.roll ? i.roll.tag + ' ' : '') + MODS[i.mod].name;

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
    const v = g.vectors.filter((v) => !v.found && (v.what === 'scripture shard' || v.what === 'thaw engine')).sort((a, b) => dist(a, P) - dist(b, P))[0];
    return v ?? null;
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
      if ((m.data!.tried as number) === g.t) return null;
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
        out.push({ cmd: `buy ${k + 1}`, ok: good && afford(printer.priceOf(it)) });
      });
    } else if (m.kind === 'printer') {
      const pr = printer;
      {
        if (P.slots < pr.MAX_SLOTS) out.push({ cmd: 'print slot', ok: afford(pr.slotCost(g)) });
        // a module only with plenty to spare
        const mc = pr.modCost((m.data?.far as number) ?? 0);
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
    const items = g.ents.filter((e) => e.kind === 'item' && !banned.has(e) && dist(e, P) < 24 && zones.zoneAt(e.x, e.y) <= Math.max(roam, zoneHere()));
    const machines = g.ents.filter((e) => (e.kind === 'printer' || e.data?.altar) && !banned.has(e) && dist(e, P) < 30 && zones.zoneAt(e.x, e.y) <= Math.max(roam, zoneHere()) && machineOffers(e).some((x) => x.ok));
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
        if (d.has(k) || cellAt(g, nx, ny) !== Cell.floor) continue;
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
    else {
      let best = Infinity;
      for (const [x, y] of q) {
        const c = Math.hypot(x - t.x, y - t.y) + (seen.has(key(x, y)) ? 2 : 0) + d.get(key(x, y))! * 0.05;
        if (c < best) {
          best = c;
          target = [x, y];
        }
      }
    }
    if (!target || (target[0] === px && target[1] === py)) {
      if (t.ref) banned.add(t.ref);
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
    run.snaps.push({ t: Math.round(g.t), zone: zoneHere(), hp: Math.round(P.hp), maxHp: P.maxHp, power: powerMax(g), slots: P.slots, dps: +dpsOf(active(g, 'weapon')).toFixed(2), armour: active(g, 'body').reduce((s, i) => s + param<number>(i, 'armour', 0), 0), res: r, mods: P.installed.length + P.inv.filter((i) => i.kind === 'mod').length });
  };

  let last = '';
  let same = 0;
  while (!g.ended && g.t < o.limit) {
    if (g.t >= nextSnap) {
      snap();
      nextSnap += 60;
    }
    for (const i of [...P.inv, ...P.installed]) if ('mod' in i && i.mod === 'thaw-engine') mark('engine found');
    g.cards.forEach((c, k) => c.startsWith('shard') && mark('shard ' + c));
    const pw = powerMax(g);
    if (pw > lastPow) run.steps.push({ t: Math.round(g.t), what: `power ${lastPow}→${pw}` });
    if (P.slots > lastSlots) run.steps.push({ t: Math.round(g.t), what: `slots ${lastSlots}→${P.slots}` });
    lastPow = Math.max(lastPow, pw);
    lastSlots = P.slots;
    const c = decide();
    if (o.debug && (process.env.ALL || typeof c === 'string' || run.log.length === 0 || !run.log[run.log.length - 1].endsWith('wait'))) run.log.push(`${g.t.toFixed(1)} ${Math.floor(P.x)},${Math.floor(P.y)} hp${P.hp.toFixed(1)} > ${typeof c === 'number' ? 'wait' : c}${typeof c === 'number' ? ' ' + why + ' wait' : ''}`);
    if (typeof c === 'number') advance(c);
    else {
      send(c);
      same = c === last ? same + 1 : 0;
      last = c;
      advance(same > 2 ? 1 : 0.2);
    }
  }
  snap();
  run.ended = g.ended ?? 'time';
  run.t = Math.round(g.t);
  run.kills = g.stats.kills;
  run.resEnd = resAll(g);
  if (g.ended === 'dead') {
    const line = g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).reverse().find((l) => l.includes('took you'));
    run.killer = line?.replace(/^you stop\. /, '').replace(/ took you\.$/, '');
    run.deathZone = zoneHere();
  }
  if ((o as any).keep) (run as any).g = g;
  return run;
}

