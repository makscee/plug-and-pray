// v2r4 run (a first-timer's run): bone grinds into glass at an altar, your last legs ask before they come out,
// and power coming back turns back on what went off for want of it
import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import { newGame, spawn } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { BOSS } from '../src/fight/bosses';

const res = (g: Game, r: string) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === r ? i.n : 0), 0);
const put = (g: Game, mod: string) => {
  g.player.inv.push({ kind: 'mod', mod });
  exec(g, `install ${mod.replace(/-/g, ' ')}`);
};

describe('v2r4 first-timer', () => {
  it('an altar grinds 4 bone into 1 glass', () => {
    const g = newGame(1);
    g.player.inv = [{ kind: 'res', res: 'bone', n: 9 }];
    spawn(g, { kind: 'prop', x: g.player.x + 1, y: g.player.y, data: { altar: true } });
    exec(g, 'offer bone');
    expect(res(g, 'glass')).toBe(1);
    expect(res(g, 'bone')).toBe(5);
  });

  it('the last legs ask before they come out; anyway takes them', () => {
    const g = newGame(1);
    g.player.installed = [];
    g.player.inv = [];
    put(g, 'stepper-relay');
    exec(g, 'remove stepper relay');
    expect(g.player.installed.some((i) => i.mod === 'stepper-relay')).toBe(true);
    expect(g.log.flat().some((s) => typeof s === 'string' && /is your legs/.test(s))).toBe(true);
    exec(g, 'remove stepper relay anyway');
    expect(g.player.installed.some((i) => i.mod === 'stepper-relay')).toBe(false);
  });

  it('what went off for power comes back on with more power', () => {
    const g = newGame(1);
    g.player.installed = [];
    g.player.inv = [];
    g.player.core = 1;
    put(g, 'heart-shard');
    put(g, 'survey-spool');
    put(g, 'spark-finger');
    const on = () => g.player.installed.filter((i) => i.on).map((i) => i.mod);
    expect(on()).toContain('survey-spool');
    exec(g, 'off heart shard');
    expect(on()).not.toContain('survey-spool');
    exec(g, 'on heart shard');
    expect(on()).toContain('survey-spool');
  });

  it('the bell drifts off only from under a cell, and its toll starts past the 8 cells round it', () => {
    const d = BOSS['boss-bell'];
    expect(d.near).toBe(1);
    expect(d.phases[0].find((a) => a.id === 'toll')!.warn).toMatch(/1\.8/);
  });
});
