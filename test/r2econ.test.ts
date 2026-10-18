import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { newGame, tick } from '../src/core/game';
import { MODS, param } from '../src/core/mods';
import { exec } from '../src/core/verbs';
import { powerCost, temperCost } from '../src/world/altar';
import { slotCost } from '../src/world/printer';
import { gradeOf, offeringOf, tallyShown, weigh, CARD, TALLY_AT, TALLY_STEP } from '../src/end/timeline';
import { secrets } from '../src/world/secrets';
import type { Game, Inst, Res } from '../src/core/types';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const res = (g: Game, r: Res) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === r ? i.n : 0), 0);
const give = (g: Game, n = 99) => {
  for (const r of ['bone', 'glass', 'copper', 'ichor'] as const) g.player.inv.push({ kind: 'res', res: r, n });
};
const altarBy = (g: Game, dx = 0.5) => g.ents.push({ id: 998, kind: 'prop', x: g.player.x + dx, y: g.player.y, data: { altar: true, greeted: true } });

describe('r2 econ', () => {
  it('glass unlocks early: the first power is bone and copper, slot 7 wants 2 glass', () => {
    const g = newGame(1);
    g.player.core = 4;
    expect(powerCost(g)).toEqual({ bone: 4, copper: 2 });
    g.player.core = 5;
    expect(powerCost(g).glass).toBe(1);
    g.player.slots = 6;
    expect(slotCost(g).glass).toBe(2);
  });

  it('a temper works the altar key: a found fov roll on an eye tempers range, and the first wants no ichor', () => {
    const g = newGame(1);
    altarBy(g);
    give(g);
    const eye: Inst = { uid: 501, mod: 'vidicon-tube', on: false, readyAt: 0, data: {}, roll: { key: 'fov', mult: 1.4, tag: 'attuned' } };
    g.player.installed.push(eye);
    expect(temperCost(eye).ichor).toBeUndefined();
    const range = param<number>(eye, 'range');
    exec(g, 'temper vidicon tube');
    expect(eye.roll).toMatchObject({ key: 'range', tag: 'tempered', n: 1 });
    expect(param<number>(eye, 'range')).toBeGreaterThan(range);
    expect(temperCost(eye).ichor).toBe(1);
  });

  it('an aimed print rolls within its family for 2 copper more', () => {
    const g = newGame(1);
    give(g);
    g.ents.push({ id: 997, kind: 'printer', x: g.player.x + 0.5, y: g.player.y, data: { far: 0, made: 0, greeted: true } });
    const c0 = res(g, 'copper');
    for (let k = 0; k < 6; k++) exec(g, 'print eye');
    const mods = g.player.inv.filter((i) => i.kind === 'mod');
    expect(mods.length).toBe(6);
    for (const m of mods) expect(m.kind === 'mod' && MODS[m.mod].family).toBe('camera');
    expect(c0 - res(g, 'copper')).toBe(6 * 2);
  });

  it('the Engine drinks what you carry and grades the thaw', () => {
    expect(gradeOf(0)).toBe('a cold waking');
    expect(gradeOf(15)).toBe('the god stirs');
    expect(gradeOf(40)).toBe('spring');
    const g = newGame(1);
    g.player.inv.push({ kind: 'res', res: 'bone', n: 12 }, { kind: 'res', res: 'glass', n: 5 }, { kind: 'mod', mod: 'thaw-engine' });
    expect(weigh(g)).toMatchObject({ total: 17, grade: 'the god stirs' });
    exec(g, 'install thaw engine');
    for (let k = 0; k < 60; k++) tick(g, 1 / 30);
    expect(g.ended).toBe('thaw');
    expect(offeringOf(g)).toMatchObject({ lines: [['bone', 12], ['glass', 5]], total: 17 });
    expect(g.player.inv.some((i) => i.kind === 'res')).toBe(false);
    expect(tallyShown(CARD, 2)).toBe(0);
    expect(tallyShown(CARD + TALLY_AT, 2)).toBe(1);
    expect(tallyShown(CARD + TALLY_AT + 5 * TALLY_STEP, 2)).toBe(3);
  });

  it('a carried card reader reads for a bone; installed it reads free', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'card-reader' }, { kind: 'card', card: 'log-cantor' }, { kind: 'card', card: 'log-ferry' });
    exec(g, 'read card');
    expect(text(g)).toContain('wants a bone');
    g.player.inv.push({ kind: 'res', res: 'bone', n: 1 });
    exec(g, 'read card');
    expect(text(g)).toContain('feed it a bone');
    expect(res(g, 'bone')).toBe(0);
    expect(g.cards).toContain('log-cantor');
    expect(g.player.inv.some((i) => i.kind === 'mod' && i.mod === 'card-reader')).toBe(true);
  });

  it('an offer out of reach says where the altar is, not "nothing installed"', () => {
    const g = newGame(1);
    altarBy(g, 3);
    exec(g, 'offer mend');
    expect(text(g)).toContain('no altar within reach: step closer, it stands 3 cells e');
    expect(text(g)).not.toContain('nothing installed');
    expect(g.log[g.log.length - 1].some((s) => typeof s !== 'string' && s.cmd === 'go e 2')).toBe(true);
  });

  it('break from the wrong cell names the cell to stand on', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'spark-finger' });
    exec(g, 'install spark finger');
    for (let k = 0; k < 60; k++) tick(g, 1 / 30);
    const [i, j] = [Math.floor(g.player.x), Math.floor(g.player.y)];
    // a found shell whose face looks onto the cell 2 east of you, the wall to its north
    secrets(g).push({ kind: 'hollow', x: i + 2, y: j - 1, fx: 0, fy: 1, trail: [[i + 2, j - 2]], found: true, done: false, salt: 0 });
    exec(g, 'break');
    expect(text(g)).toContain('no hollow wall beside you: stand 2 cells e, the shell is the wall to its n.');
  });

  it('a carrion eye costs 2 power and scripture names only caches', () => {
    expect(MODS['carrion-eye'].power).toBe(2);
  });
});
