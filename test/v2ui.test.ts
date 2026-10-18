import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, spawnEnemy, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { ear, listen } from '../src/audio/listen';
import { lineKind } from '../src/ui/kinds';
import { armFix, armed, AGAIN } from '../src/fight/unarmed';
import { startKit } from '../src/tune/start';
import type { Game, Line } from '../src/core/types';

const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 30; k++) tick(g, 1 / 30);
};
const text = (l: Line) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('');
const lines = (g: Game) => g.log.map(text);
const warns = (g: Game) => lines(g).filter((t) => t.includes('no weapon on: you hit nothing'));
const btns = (l: Line) => l.filter((s) => typeof s !== 'string').map((s) => (s as { cmd: string }).cmd);

describe('no weapon on (Maks 10-18)', () => {
  it('shoot with no weapon says so, with an install button for the carried spark finger, and clicks dully', () => {
    const g = newGame(1);
    startKit(g);
    exec(g, 'install pinhole');
    run(g, 2);
    expect(armed(g)).toBe(false);
    exec(g, 'shoot');
    const last = g.log[g.log.length - 1];
    expect(text(last)).toContain('no weapon on: you hit nothing');
    expect(btns(last)).toContain('install spark finger');
    expect(g.events.some((e) => e.type === 'noweapon')).toBe(true);
    const e = ear();
    listen(e, g);
    g.events = [{ type: 'noweapon' }, { type: 'miss' }];
    expect(listen(e, g).map((p) => p.cue)).toEqual(['dud', 'miss']);
  });

  it('the fix: on when off, swap in when short of power, warming says so', () => {
    const g = newGame(1);
    startKit(g);
    exec(g, 'install spark finger');
    expect(text(armFix(g))).toContain('warming up');
    run(g, 3);
    expect(armed(g)).toBe(true);
    exec(g, 'off spark finger');
    expect(btns(armFix(g))).toEqual(['on spark finger']);
    g.player.core = 0;
    expect(btns(armFix(g))).toEqual(['swap in spark finger']);
  });

  it('foes closing on an unarmed body: warned once, again only after a while', () => {
    const g = newGame(1);
    g.ents = [];
    run(g, 1);
    const m = spawnEnemy(g, 'mite', 11.5, 8.5);
    m.enemy!.data.noticed = true;
    m.enemy!.hp = 999;
    run(g, 1);
    expect(warns(g)).toHaveLength(1);
    run(g, AGAIN - 3);
    expect(warns(g)).toHaveLength(1);
    run(g, 4);
    expect(warns(g).length).toBeGreaterThanOrEqual(2);
  });

  it('an armed body is never warned; a shot into a wall is a miss, told as one', () => {
    const g = newGame(1);
    g.ents = [];
    g.player.inv.push({ kind: 'mod', mod: 'nail-psalm' });
    exec(g, 'install nail');
    run(g, 3);
    g.player.dir = 0; // north, at a wall
    exec(g, 'shoot');
    let missed = false;
    for (let k = 0; k < 60 && !missed; k++) {
      tick(g, 1 / 30);
      missed = g.events.some((e) => e.type === 'miss');
    }
    expect(missed).toBe(true);
    run(g, 2);
    expect(lines(g).some((t) => t.startsWith('you miss'))).toBe(true);
    expect(warns(g)).toHaveLength(0);
  });
});

describe('console line kinds', () => {
  it('sorts lines by what they are', () => {
    expect(lineKind([{ text: '> go n 3', cmd: '' }])).toBe('cmd');
    expect(lineKind(['⚠ no weapon on: you hit nothing. ', { text: 'install x', cmd: 'install x' }])).toBe('warn');
    expect(lineKind(['look: unknown. try ', { text: 'help', cmd: 'help' }])).toBe('warn');
    expect(lineKind(['you hit choir mite ×3 · choir mite hits you ×2 · hp 7/10.'])).toBe('combat');
    expect(lineKind(['the mite bursts.'])).toBe('combat');
    expect(lineKind(['+2 bone, +1 glass'])).toBe('loot');
    expect(lineKind(['you take: ', { text: 'nail psalm', cmd: 'info nail psalm' }])).toBe('loot');
    expect(lineKind(['◆ first sight · choir mite: a beetle'])).toBe('info');
    expect(lineKind(["the saint's lens: a vein of glass glints, 6 cells s."])).toBe('info');
    expect(lineKind(['the walls bend; the map marks them.'])).toBe('say');
    expect(lineKind(['installed halo. warming up.'])).toBe('say');
    expect(lineKind(['stepper relay is warming up (1 s).'])).toBe('warn');
  });
});
