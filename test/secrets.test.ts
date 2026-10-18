import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { newGame, tick } from '../src/core/game';
import { addItem, exec } from '../src/core/verbs';
import { Cell, cell, chunk } from '../src/core/grid';
import type { Game } from '../src/core/types';
import { hide, secrets, type Secret } from '../src/world/secrets';
import { generate } from '../src/world/gen';
import { codexOf, firstSight } from '../src/sight/codex';
import { strikeGap } from '../src/mods/sense';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
const wear = (g: Game, ...mods: string[]) => {
  g.player.slots = 8;
  g.player.core = 12;
  for (const mod of mods) {
    addItem(g, { kind: 'mod', mod });
    exec(g, `install ${mod.replace(/-/g, ' ')}`);
  }
  for (const i of g.player.installed) i.readyAt = g.t - 1;
};
const world = (g: Game, r = 4) => {
  for (let cy = -r; cy <= r; cy++) for (let cx = -r; cx <= r; cx++) chunk(g, cx, cy);
  return secrets(g);
};
/** stand on the floor in front of a wall secret, facing it */
const face = (g: Game, s: Secret, back = 1) => {
  g.player.x = s.x + 0.5 + s.fx * back;
  g.player.y = s.y + 0.5 + s.fy * back;
  g.player.dir = Math.atan2(-s.fx, s.fy);
  g.player.path = [];
  g.ents = g.ents.filter((e) => !e.enemy);
};

describe('secrets', () => {
  it('are the same for a seed, about half the chunks, every kind', () => {
    const a = world(newGame(5));
    const b = world(newGame(5));
    expect(a.map((s) => [s.kind, s.x, s.y])).toEqual(b.map((s) => [s.kind, s.x, s.y]));
    expect(a.length).toBeGreaterThan(20);
    for (const k of ['hands', 'script', 'hollow']) expect(a.filter((s) => s.kind === k).length).toBeGreaterThanOrEqual(4);
    // the start chunk hides nothing
    expect(hide(5, generate(5, 0, 0))).toBeNull();
  });

  it('places a hollow over a sealed niche, scripture on a wall, prints on floor', () => {
    for (const seed of [1, 2, 3]) {
      const g = newGame(seed);
      for (const s of world(g)) {
        expect(cell(g, s.x + s.fx, s.y + s.fy)).toBe(Cell.floor);
        if (s.kind === 'hollow') {
          expect(cell(g, s.x, s.y)).toBe(Cell.wall);
          const [px, py] = s.trail[0];
          expect(cell(g, px, py)).toBe(Cell.wall);
          // nothing open touches the niche but the shell
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (px + dx !== s.x || py + dy !== s.y) expect(cell(g, px + dx, py + dy)).not.toBe(Cell.floor);
        } else if (s.kind === 'script') expect(cell(g, s.x, s.y)).not.toBe(Cell.floor);
        else {
          expect(s.trail.length).toBeGreaterThanOrEqual(4);
          for (const [x, y] of [...s.trail, [s.x, s.y]]) expect(cell(g, x, y)).toBe(Cell.floor);
        }
      }
    }
  });

  it('a hollow wall shows only to sonar; break opens the niche and pays', () => {
    const g = newGame(3);
    const s = world(g).find((x) => x.kind === 'hollow')!;
    face(g, s);
    wear(g, 'dawn-eye', 'lattice-eye', 'spark-finger');
    run(g, 0.2);
    expect(s.found).toBe(false);
    wear(g, 'bat-psalter');
    run(g, 0.2);
    expect(s.found).toBe(true);
    expect(text(g)).toMatch(/comes back hollow/);
    const before = g.ents.length;
    exec(g, 'break');
    expect(s.done).toBe(true);
    expect(cell(g, s.x, s.y)).toBe(Cell.floor);
    expect(cell(g, ...s.trail[0])).toBe(Cell.floor);
    expect(g.ents.length).toBeGreaterThan(before);
  });

  it('scripture reads on black & white, and names a place', () => {
    const g = newGame(3);
    const s = world(g).find((x) => x.kind === 'script')!;
    face(g, s);
    wear(g, 'dawn-eye');
    run(g, 0.2);
    expect(s.found).toBe(false);
    wear(g, 'carrion-eye');
    run(g, 0.2);
    expect(s.done).toBe(true);
    expect(text(g)).toMatch(/reads scripture/);
    expect(g.vectors.some((v) => v.card === 'scratch')).toBe(true);
  });

  it('handprints lead a heat eye to a cache', () => {
    const g = newGame(3);
    const s = world(g).find((x) => x.kind === 'hands')!;
    // standing on the plate without a heat eye: nothing
    g.player.x = s.x + 0.5;
    g.player.y = s.y + 0.5;
    g.ents = g.ents.filter((e) => !e.enemy);
    run(g, 0.2);
    expect(s.done).toBe(false);
    wear(g, 'ember-iris');
    run(g, 0.2);
    expect(s.done).toBe(true);
    expect(text(g)).toMatch(/floor plate/);
  });

  it('every seed hides a scratched wall and a carrion eye by the printer west of the start', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const g = newGame(seed);
      chunk(g, -1, 0);
      const s = secrets(g).find((x) => x.kind === 'script' && Math.floor(x.x / 16) === -1);
      expect(s).toBeTruthy();
      expect(g.ents.some((e) => e.item?.kind === 'mod' && e.item.mod === 'carrion-eye' && Math.floor(e.x / 16) === -1)).toBe(true);
    }
  });

  it('first sight goes in the codex once', () => {
    const g = newGame(1);
    wear(g, 'dawn-eye');
    const inst = g.player.installed[0];
    g.ents = g.ents.filter((e) => !e.enemy);
    const e = { id: 999, kind: 'enemy' as const, x: g.player.x, y: g.player.y - 1.5, enemy: { type: 'mite', hp: 1, readyAt: 0, data: {} } };
    g.ents.push(e);
    expect(firstSight(g, inst, 9)).toBe(true);
    expect(firstSight(g, inst, 9)).toBe(false);
    expect(codexOf(g)).toEqual(['mite']);
    expect(text(g)).toMatch(/first sight · choir mite/);
  });

  it("an eye's fps caps auto strikes past reach, not in touch", () => {
    const g = newGame(1);
    g.ents = [];
    const p = g.player;
    for (let y = 5; y <= 8; y++) expect(cell(g, 8, y)).toBe(Cell.floor);
    const far = { id: 1, kind: 'enemy' as const, x: p.x, y: p.y - 3, enemy: { type: 'mite', hp: 1, readyAt: 0, data: {} } };
    const near = { ...far, id: 2, y: p.y - 1 };
    wear(g, 'pinhole-eye');
    expect(strikeGap(g, far)).toBeCloseTo(2);
    expect(strikeGap(g, near)).toBe(0);
    wear(g, 'dawn-eye');
    expect(strikeGap(g, far)).toBeCloseTo(0.75);
  });
});
