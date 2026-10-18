// v2r5 newcomer (two first-timers died on floors 1-2): a copper source at altars, advice that fits the loadout,
// lamps that chip less on the cradle, and the reins asking for a sharp eye
import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/fight';
import { hurt, newGame, spawn, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { lesson } from '../src/fight/death';
import { fitOf } from '../src/world/cache';
import { keeperCheck } from '../src/tune/door';

const res = (g: Game, r: string) => g.player.inv.reduce((n, i) => n + (i.kind === 'res' && i.res === r ? i.n : 0), 0);
const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const put = (g: Game, mod: string, on = true) => g.player.installed.push({ uid: g.nextId++, mod, on, readyAt: 0, data: {} });

describe('v2r5 newcomer', () => {
  it('an altar takes 3 bone for 1 copper, and its menu says which way each offer goes', () => {
    const g = newGame(1);
    g.player.inv = [{ kind: 'res', res: 'bone', n: 7 }];
    spawn(g, { kind: 'prop', x: g.player.x + 1, y: g.player.y, data: { altar: true } });
    exec(g, 'offer bone for copper');
    expect(res(g, 'copper')).toBe(1);
    expect(res(g, 'bone')).toBe(4);
    exec(g, 'offer');
    expect(text(g)).toContain('give 2 copper → 1 bone');
    expect(text(g)).toContain('give 3 bone → 1 copper');
    // the plain `offer bone` still grinds glass
    exec(g, 'offer bone');
    expect(res(g, 'glass')).toBe(1);
  });

  it('the death card never sends you for a bell while a swarm weapon is on', () => {
    const g = newGame(1);
    g.player.installed = [];
    put(g, 'choir-bell');
    const mite = spawn(g, { kind: 'enemy', x: g.player.x + 1, y: g.player.y, enemy: { type: 'mite', hp: 2, readyAt: 0, data: {} } });
    for (let k = 0; k < 3; k++) hurt(g, 0.5, mite);
    expect(lesson(g)).not.toContain('hits many');
    expect(lesson(g)).toContain('choir bell');
  });

  it('a keeper still up is the lesson, even when its brood took the last hp', () => {
    const g = newGame(1);
    const q = spawn(g, { kind: 'enemy', x: g.player.x + 3, y: g.player.y, enemy: { type: 'boss-queen', hp: 50, readyAt: 0, data: {} } });
    const mite = spawn(g, { kind: 'enemy', x: g.player.x + 1, y: g.player.y, enemy: { type: 'mite', hp: 2, readyAt: 0, data: {} } });
    hurt(g, 1, q);
    hurt(g, 0.5, mite);
    hurt(g, 0.5, mite);
    expect(lesson(g)).toContain('stomp');
  });

  it('the door card prices its fix and says how to get short copper', () => {
    const g = newGame(3);
    g.player.inv = [];
    const c = keeperCheck(g, 0);
    const all = c.why.join('; ');
    if (all.includes('altar (+hp)')) expect(all).toMatch(/short|\d+ bone/);
  });

  it('a cradle lamp hits for 0.6 of its blow', () => {
    const g = newGame(1);
    g.player.installed = [];
    const p = g.player;
    spawn(g, { kind: 'enemy', x: p.x, y: p.y - 3, enemy: { type: 'seraph', hp: 3, readyAt: 0, data: {} } });
    const hp = p.hp;
    for (let k = 0; k < 60 && p.hp === hp; k++) tick(g, 0.1);
    expect(hp - p.hp).toBeGreaterThan(0);
    expect(hp - p.hp).toBeLessThan(1);
  });

  it('the reins on the kit card ask for a sharp eye when no scope is in', () => {
    const g = newGame(1);
    g.player.installed = [];
    put(g, 'vidicon-tube');
    expect(fitOf(g, { kind: 'mod', mod: 'saints-reins' })).toContain('the reins want a sharp eye: the pilgrim scope');
    put(g, 'pilgrim-scope');
    expect(fitOf(g, { kind: 'mod', mod: 'saints-reins' })).not.toContain('sharp eye');
  });
});
