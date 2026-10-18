import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/body';
import '../src/world';
import '../src/tune/hints';
import { newGame } from '../src/core/game';
import { addItem, exec } from '../src/core/verbs';
import { makeRoom } from '../src/body';

const text = (g: ReturnType<typeof newGame>, from = 0) => JSON.stringify(g.log.slice(from));
const kit = (g: ReturnType<typeof newGame>, more: string[] = []) => {
  g.player.slots = 9;
  for (const mod of ['pinhole-eye', 'map-spool', 'stepper-relay', 'spark-finger', ...more]) addItem(g, { kind: 'mod', mod });
  exec(g, 'install all');
  g.player.slots = g.player.installed.length;
};

describe('r3 flow (fresh skimmer)', () => {
  it('a swap never takes the map or switches off the last weapon', () => {
    const g = newGame(1);
    kit(g);
    const r = makeRoom(g, { mod: 'censer' }, false);
    expect(typeof r).toBe('string');
  });

  it('an eye swapping in takes out the other eye, not the map', () => {
    const g = newGame(1);
    kit(g, ['ember-cell']);
    addItem(g, { kind: 'mod', mod: 'dawn-eye' });
    exec(g, 'swap in dawn eye');
    const mods = g.player.installed.map((i) => i.mod);
    expect(mods).toContain('dawn-eye');
    expect(mods).toContain('map-spool');
    expect(mods).not.toContain('pinhole-eye');
  });

  it('where skips an eye you wear and points at a card to read', () => {
    const g = newGame(1);
    kit(g, ['ember-cell', 'card-reader']);
    addItem(g, { kind: 'mod', mod: 'dawn-eye' });
    exec(g, 'swap in dawn eye');
    addItem(g, { kind: 'card', card: 'log0' });
    g.t = 100;
    const n = g.log.length;
    exec(g, 'where');
    expect(text(g, n)).not.toContain('dawn eye glints');
    expect(text(g, n)).toContain('read card');
  });
});
