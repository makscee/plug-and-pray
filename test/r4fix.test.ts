import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/tune/hints';
import { newGame } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game } from '../src/core/types';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');

describe('r4 fixes', () => {
  it('a verb waiting on a warming module says it is warming up', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'stepper-relay' });
    exec(g, 'install stepper relay');
    exec(g, 'go n 3');
    expect(text(g)).toMatch(/warming up \(\d+ s\)/);
    expect(text(g)).not.toMatch(/nothing installed can do that/);
  });
  it('names match with spaces or hyphens', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'bone-listener' });
    exec(g, 'install bone listener');
    expect(g.player.installed.some((i) => i.mod === 'bone-listener')).toBe(true);
  });
});
