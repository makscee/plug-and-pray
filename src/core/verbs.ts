// Console commands: `verb(name, def)`. A module family adds its verbs in its own file and makes them
// available only while a module of it is on (`when`). Buttons anywhere type these same commands.

import { dist, itemName, reach, say, spawn } from './game';
import { def, label, MODS, powerMax, powerUsed, switchOff, switchOn } from './mods';
import type { Game, Inst, Item, Line } from './types';

export interface VerbDef {
  help: string;
  /** usable now? (a gait verb needs a gait on); hidden from help when not */
  when?: (g: Game) => boolean;
  run: (g: Game, args: string[]) => void;
}
export const VERBS: Record<string, VerbDef> = {};
export function verb(name: string, d: VerbDef): void {
  VERBS[name] = d;
}

/** run a typed line: echo it, then the verb; every line the game prints goes to g.log */
export function exec(g: Game, line: string): void {
  const words = line.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return;
  say(g, [{ text: '> ' + words.join(' '), cmd: '' }]);
  if (g.ended) return say(g, 'nothing answers.');
  const [v, ...args] = words;
  const d = VERBS[v];
  if (!d) return say(g, `${v}: unknown. try `, [{ text: 'help', cmd: 'help' }]);
  if (d.when && !d.when(g)) return say(g, `${v}: nothing installed can do that.`);
  d.run(g, args);
}

/** an inventory item whose name contains the words, e.g. "pinhole", "pinhole eye" */
export function findItem(g: Game, args: string[]): number {
  const q = args.join(' ');
  if (!q) return -1;
  return g.player.inv.findIndex((it) => itemName(it).includes(q));
}
export function findInst(g: Game, args: string[]): Inst | undefined {
  const q = args.join(' ');
  if (!q) return undefined;
  return g.player.installed.find((i) => label(i).includes(q));
}

/** the button for an inventory item: what a click on it does */
function itemButton(it: Item): Line {
  const n = itemName(it);
  if (it.kind === 'mod') return [{ text: n, cmd: `install ${def(it).name}` }, `  ${def(it).family}`];
  if (it.kind === 'card') return [{ text: n, cmd: `read card` }];
  return [n];
}

export function addItem(g: Game, it: Item): void {
  if (it.kind === 'res') {
    const have = g.player.inv.find((x) => x.kind === 'res' && x.res === it.res);
    if (have && have.kind === 'res') return void (have.n += it.n);
  }
  g.player.inv.push(it);
}

verb('help', {
  help: 'what you can do',
  run(g) {
    const ok = Object.keys(VERBS).filter((v) => !VERBS[v].when || VERBS[v].when!(g));
    say(g, ok.flatMap((v, k) => (k ? ['  ', { text: v, cmd: v }] : [{ text: v, cmd: v }])) as Line);
  },
});

verb('inv', {
  help: 'what you carry',
  run(g) {
    if (!g.player.inv.length) return say(g, 'you carry nothing.');
    for (const it of g.player.inv) say(g, itemButton(it));
  },
});

verb('take', {
  help: 'take what is within reach: take, take pinhole',
  run(g, args) {
    const q = args.join(' ');
    const near = reach(g).filter((e) => !q || itemName(e.item!).includes(q));
    if (!near.length) return say(g, q ? `no ${q} within reach.` : 'nothing within reach.');
    for (const e of near) {
      if (e.data?.mimic) continue; // a mimic is an enemy dressed as loot (fight slice wakes it)
      g.ents = g.ents.filter((x) => x !== e);
      addItem(g, e.item!);
      g.events.push({ type: 'take', at: [e.x, e.y] });
      const it = e.item!;
      if (it.kind === 'mod') say(g, ['you take: ', ...itemButton(it)], `  ${def(it).text}`);
      else say(g, ['you take: ', ...itemButton(it)]);
    }
  },
});

verb('drop', {
  help: 'leave an item here',
  run(g, args) {
    const k = findItem(g, args);
    if (k < 0) return say(g, 'you carry no such thing.');
    const [it] = g.player.inv.splice(k, 1);
    spawn(g, { kind: 'item', x: g.player.x, y: g.player.y, item: it });
    say(g, `dropped ${itemName(it)}.`);
  },
});

verb('install', {
  help: 'put a module in a free slot: install pinhole eye',
  run(g, args) {
    const p = g.player;
    const k = findItem(g, args);
    const it = p.inv[k];
    if (!it || it.kind !== 'mod') return say(g, 'no such module in your inventory. ', [{ text: 'inv', cmd: 'inv' }]);
    if (p.installed.length >= p.slots) return say(g, `no free slot (${p.slots}). remove something first.`);
    p.inv.splice(k, 1);
    const inst: Inst = { uid: g.nextId++, mod: it.mod, roll: it.roll, on: false, readyAt: 0, data: {} };
    p.installed.push(inst);
    if (!g.stats.mods.includes(it.mod)) g.stats.mods.push(it.mod);
    g.events.push({ type: 'install', data: inst.uid });
    const err = switchOn(g, inst);
    say(g, `installed ${label(inst)}.` + (err ? ` it stays off: ${err}.` : def(inst).warm ? ' warming up.' : ''));
  },
});

verb('remove', {
  help: 'take a module out of its slot',
  run(g, args) {
    const inst = findInst(g, args);
    if (!inst) return say(g, 'nothing installed by that name.');
    switchOff(g, inst);
    g.player.installed = g.player.installed.filter((i) => i !== inst);
    addItem(g, { kind: 'mod', mod: inst.mod, roll: inst.roll });
    g.events.push({ type: 'remove', data: inst.uid });
    say(g, `removed ${label(inst)}.`);
  },
});

verb('on', {
  help: 'switch a module on (it warms up first)',
  run(g, args) {
    const inst = findInst(g, args);
    if (!inst) return say(g, 'nothing installed by that name.');
    const err = switchOn(g, inst);
    say(g, err ?? `${label(inst)} warming up.`);
  },
});

verb('off', {
  help: 'switch a module off: frees its power',
  run(g, args) {
    const inst = findInst(g, args);
    if (!inst) return say(g, 'nothing installed by that name.');
    switchOff(g, inst);
    say(g, `${label(inst)} off.`);
  },
});

verb('status', {
  help: 'your body: hp, slots, power',
  run(g) {
    const p = g.player;
    say(g, `hp ${Math.ceil(p.hp)}/${p.maxHp}   slots ${p.installed.length}/${p.slots}   power ${powerUsed(g)}/${powerMax(g)}`);
    for (const i of p.installed) say(g, [{ text: label(i), cmd: `${i.on ? 'off' : 'on'} ${def(i).name}` }, `  ${i.on ? (g.t >= i.readyAt ? 'on' : 'warming') : 'off'}  ${def(i).power}p`]);
  },
});

verb('listen', {
  help: 'what you hear around you',
  run(g) {
    const p = g.player;
    const near = g.ents.filter((e) => dist(e, p) < 10).sort((a, b) => dist(a, p) - dist(b, p));
    if (!near.length) return say(g, 'only the slow drip of something warm.');
    for (const e of near.slice(0, 4)) {
      const r = dist(e, p);
      const how = r < 2 ? 'right by you' : r < 5 ? 'near' : 'far';
      const ang = Math.atan2(e.x - p.x, -(e.y - p.y));
      const side = ['ahead', 'to the right', 'behind', 'to the left'][Math.round((((ang - p.dir) / (Math.PI / 2)) % 4) + 4) % 4];
      const what = e.enemy ? 'something moving' : e.kind === 'printer' ? 'a machine humming' : 'something lying still';
      say(g, `${what}, ${how}, ${side}.`);
    }
  },
});

/** for tests and the play script: every module in the table by id */
export const allMods = () => Object.keys(MODS);
