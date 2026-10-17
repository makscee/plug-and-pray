// Printers: machines in some chambers that turn resources into a slot board (+1 slot, up to 8)
// or a random module of the area's tier. `print` at a printer lists both with their costs.

import { dist, say, tickHooks } from '../core/game';
import { label } from '../core/mods';
import { hash, rng } from '../core/rng';
import { addItem, verb } from '../core/verbs';
import type { Entity, Game, Item, Line, Res } from '../core/types';
import { lootMod } from './spawn';

export const MAX_SLOTS = 8;
type Cost = Partial<Record<Res, number>>;

export function slotCost(g: Game): Cost {
  const n = g.player.slots - 3;
  const c: Cost = { bone: 3 + 2 * n, copper: 2 + n };
  if (g.player.slots >= 5) c.glass = 2;
  if (g.player.slots >= 6) c.ichor = 1;
  return c;
}

export const tierAt = (far: number) => (far < 2 ? 0 : far < 4 ? 1 : 2);
export function modCost(far: number): Cost {
  return [{ bone: 2, glass: 1 }, { bone: 2, glass: 2, copper: 1 }, { bone: 3, glass: 2, copper: 2, ichor: 1 }][tierAt(far)];
}

const have = (g: Game, res: Res) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === res ? i.n : 0), 0);
const fmt = (c: Cost) => Object.entries(c).map(([r, n]) => `${n} ${r}`).join(', ');
const affords = (g: Game, c: Cost) => Object.entries(c).every(([r, n]) => have(g, r as Res) >= n!);

function pay(g: Game, c: Cost): void {
  for (const [r, n] of Object.entries(c)) {
    const it = g.player.inv.find((i) => i.kind === 'res' && i.res === r);
    if (it && it.kind === 'res') it.n -= n!;
  }
  g.player.inv = g.player.inv.filter((i) => i.kind !== 'res' || i.n > 0);
}

export const printerNear = (g: Game): Entity | undefined =>
  g.ents.filter((e) => e.kind === 'printer' && dist(e, g.player) < 1.6).sort((a, b) => dist(a, g.player) - dist(b, g.player))[0];

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
  if (!e || e.data?.greeted) return;
  e.data = { ...e.data, greeted: true };
  say(g, 'a printer hums here, warm.', ...menu(g, e));
});
