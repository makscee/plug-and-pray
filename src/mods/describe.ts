// What a module does, in plain words, built from its family and params (with the find's roll applied),
// so every module and every attuned/cracked variant explains itself without a hand-written line.

import { def, param } from '../core/mods';
import type { Roll } from '../core/types';

type Modish = { mod: string; roll?: Roll };

const n = (v: number) => (Math.round(v * 10) / 10).toString();
const FILTER: Record<string, string> = {
  color: 'colour', gray: 'grey', '1bit': 'black & white', heat: 'heat only', sonar: 'sonar', edge: 'outlines only',
};
/** where an eye works (src/mods/sense.ts) */
const SIGHT: Record<string, string> = {
  color: 'needs light in the dark', gray: 'needs light in the dark', '1bit': 'half the light it needs; reads scratched walls, sees mimics breathe',
  heat: 'warm things only, through walls, the hidden too; shows warm handprints; blind in the furnace', sonar: 'sees in the dark and the hidden; hears hollow walls', edge: 'sees in the dark; reads scratched walls',
};
const SEES: Record<string, string> = {
  heat: 'warm things', metal: 'metal', flesh: 'hidden flesh', doors: 'passages', cards: 'memory cards', enemies: 'enemies', veins: 'veins',
};

/** one line: what it does */
export function does(m: Modish): string {
  const d = def(m);
  const p = <T extends number | string | boolean | string[]>(k: string) => param<T>(m, k);
  switch (d.family) {
    case 'camera': {
      const colors = p<number>('colors');
      const parts = [`${Math.round(p<number>('res'))} px`, FILTER[p<string>('filter')] ?? p<string>('filter')];
      if (colors) parts.push(`${colors} shades`);
      parts.push(`${n(p<number>('fps'))} fps`, `sees ${n(p<number>('range'))} cells`);
      if (p<number>('noise')) parts.push('noisy');
      parts.push(SIGHT[p<string>('filter')] ?? 'needs light in the dark');
      if (p<number>('lag')) parts.push('smears');
      return 'eye · ' + parts.join(' · ');
    }
    case 'scanner':
      return `scanner · shows ${(p<string[]>('sees') ?? []).map((s) => SEES[s] ?? s).join(', ')}${(p<string[]>('sees') ?? []).includes('metal') ? ' (mimics wake early)' : ''}${(p<string[]>('sees') ?? []).includes('doors') ? ' (onto your map)' : ''} through walls · ${n(p<number>('range'))} cells · ${p<string>('shape') === 'cone' ? 'ahead' : 'all round'} · every ${n(p<number>('refresh'))} s`;
    case 'lamp':
      return `lamp · lights ${n(p<number>('radius'))} cells · things see you farther`;
    case 'gait':
      if (p('pilot')) return `pilot · walks you to a spot: click the map or goto, ${n(p<number>('pace'))} cells/s, plans ${n(p<number>('plan'))} cells${p('avoid') ? ', around enemies' : ''}`;
      if (p('go')) return 'legs · walk cells: go <dir> <n>, or the n e s w buttons';
      if (p('keys')) return `legs · arrow keys, ${n(p<number>('pace'))} cells/s`;
      if (p('free')) return `legs · free walking, wasd + mouse, ${n(p<number>('speed'))} cells/s`;
      if (p('dig')) return `digger · dig: eats the wall in front, every ${n(p<number>('cooldown'))} s`;
      return 'legs';
    case 'weapon':
      return `weapon · ${n(p<number>('damage'))} dmg every ${n(p<number>('cooldown'))} s · ${p<string>('aim') === 'aimed' ? `shoot, ${n(p<number>('range'))} cells` : `hits ${p('sweep') ? 'everything' : 'whatever'} you see within ${n(p<number>('range'))} cells`}${p<number>('glow') ? ` · glows ${n(p<number>('glow'))} cells (warmth in the cold)` : ''}`;
    case 'body': {
      if (p('hp')) return `body · +${n(p<number>('hp'))} max hp`;
      if (p('regen')) return `body · mend ${n(p<number>('regen'))} hp/s more`;
      if (p('armour')) return `body · takes ${n(p<number>('armour'))} off every hit`;
      if (p('ward')) return `body · throws the next hit back, then rests ${n(p<number>('recharge'))} s`;
      if (p('haste')) return `body · weapons cool ${Math.round(p<number>('haste') * 100)}% faster`;
      if (p('mend')) return `body · +${n(p<number>('mend'))} hp when you drop below half, every ${n(p<number>('recharge'))} s`;
      if (p('heatproof')) return `body · keeps ${Math.round(Math.min(1, p<number>('heatproof')) * 100)}% of the furnace's heat off${p<number>('chill') ? ' · elsewhere you are cold: no mending without light' : ''}`;
      if (p('thorns')) return `body · ${n(p<number>('thorns'))} dmg back at whatever strikes you up close`;
      return 'body';
    }
    case 'mind': {
      const w = p<string>('what');
      if (w === 'map') return `map · unrolls what lies in sight ${n(p<number>('reveal'))} cells around you, ${n(p<number>('span'))} cells across`;
      if (w === 'log') return `log · keeps ${n(p<number>('keep'))} places that matter, noted within ${n(p<number>('range'))} cells, each with go`;
      if (w === 'reader') return 'reader · reads memory cards: read card';
      if (w === 'ledger') return `ledger · kills pay out ${n(p<number>('tithe') || 1)}× as often`;
      if (w === 'compass') return 'compass · points to what the cards promised';
      if (w === 'clock') return `clock · shows where enemies will be ${n(p<number>('ahead'))} s ahead, ${n(p<number>('range'))} cells`;
      return 'mind · ' + w;
    }
    case 'power':
      if (p('slots')) return `slot board · install it: +${n(p<number>('slots'))} slot, used up`;
      return `power · +${n(p<number>('power'))} power while on · takes a slot`;
    case 'tool':
      return `tool · drains a vein beside you ×${n(p<number>('drain'))} every ${n(p<number>('cooldown'))} s · loud: wakes ${n(p<number>('noise'))} cells`;
    case 'unique':
      return 'the thaw engine · install it to end the run';
    default:
      return d.family;
  }
}

/** the cost line: power, warm-up, and what the roll changed */
export function costs(m: Modish): string {
  const d = def(m);
  const parts = [d.family === 'power' ? 'draws no power' : `uses ${d.power} power`];
  if (d.warm) parts.push(`warms ${n(d.warm)} s`);
  const loud = param<number>(m, 'loud', 0);
  if (loud) parts.push(`loud: things notice you ${n(loud)} cells farther`);
  if (m.roll) parts.push(`${m.roll.tag}: ${m.roll.key} ×${m.roll.mult}`);
  return parts.join(' · ');
}

/** the full description: does, costs, flavour */
export const describe = (m: Modish): string[] => [does(m), costs(m), def(m).text];
