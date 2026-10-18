import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame } from '../src/core/game';
import { inPlace } from '../src/core/verbs';
import { lineKind } from '../src/ui/kinds';
import { baseLook } from '../src/sight/layers';
import type { Item } from '../src/core/types';

describe('v2r3 ux', () => {
  it('a black & white eye as the base draws grey; others keep their look', () => {
    expect(baseLook({ mod: 'carrion-eye' })).toEqual({ filter: 'gray', colors: 12 });
    expect(baseLook({ mod: 'fog-of-saints' }).filter).toBe('color');
  });

  it('a swap puts what came out in the bag spot of what went in', () => {
    const g = newGame(1);
    const mod = (m: string): Item => ({ kind: 'mod', mod: m });
    const [a, b, c] = [mod('carrion-eye'), mod('heat-choir'), mod('lodestone')];
    g.player.inv = [a, b, c];
    const out = mod('bat-psalter');
    inPlace(g, b, () => {
      g.player.inv = g.player.inv.filter((o) => o !== b);
      g.player.inv.push(out);
    });
    expect(g.player.inv).toEqual([a, out, c]);
  });

  it('door stops and scrap lines are info, never the red fight bar', () => {
    expect(lineKind(["you stop at the keeper's door. ", { text: 'go in', cmd: 'go in' }])).toBe('info');
    expect(lineKind(['the rest of the cache folds into scrap: +6 bone.'])).toBe('info');
    expect(lineKind(['mite queen hits you · hp 3/10'])).toBe('combat');
  });
});
