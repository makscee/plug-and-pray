// v2-view: what the screen shows (src/sight/layers.ts), and the reins (src/body/fps.ts)
import { describe, expect, it } from 'vitest';
import { newGame, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { MODS } from '../src/core/mods';
import '../src/mods';
import '../src/world';
import { plan } from '../src/sight/layers';
import { bigOn, mark, reins } from '../src/body/fps';
import type { Game } from '../src/core/types';

function wearing(...mods: string[]): Game {
  const g = newGame(2);
  g.player.slots = 12;
  g.player.core = 20;
  for (const m of mods) {
    g.player.inv.push({ kind: 'mod', mod: m });
    exec(g, 'install ' + MODS[m].name);
  }
  for (let k = 0; k < 120; k++) tick(g, 1 / 30);
  return g;
}

describe('the view (v2-view)', () => {
  it('no eye: the map is the screen', () => {
    const g = wearing('map-spool', 'thread-bell');
    expect(plan(g).base).toBeNull();
    expect(plan(g).layers).toHaveLength(0);
  });

  it('the best colour or grey eye is the base; the others add their layers', () => {
    const g = wearing('pinhole-eye', 'dawn-eye', 'ember-iris', 'bat-psalter');
    const p = plan(g);
    expect(p.base?.mod).toBe('dawn-eye');
    const by = Object.fromEntries(p.layers.map((l) => [l.inst.mod, l.layer]));
    expect(by).toEqual({ 'pinhole-eye': 'rest', 'ember-iris': 'heat', 'bat-psalter': 'sonar' });
  });

  it('only a layer eye on: it is the base, in its own look; a warming eye shows static', () => {
    expect(plan(wearing('ember-iris')).base?.mod).toBe('ember-iris');
    const g = newGame(2);
    g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'install pinhole eye');
    expect(plan(g).base).toBeNull();
    expect(plan(g).warming?.mod).toBe('pinhole-eye');
  });

  it('the reins, not a scope, give the fps; martyr\'s are mk2', () => {
    const g = wearing('pilgrim-scope');
    expect(reins(g)).toBeUndefined();
    exec(g, 'big');
    expect(bigOn(g)).toBe(false);
    const h = wearing('martyrs-reins');
    expect(mark(h)).toBe(2);
    exec(h, 'big');
    expect(bigOn(h)).toBe(true);
    exec(h, 'big');
    expect(bigOn(h)).toBe(false);
  });
});
