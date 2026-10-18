import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import { newGame, tick } from '../src/core/game';
import { addItem, exec } from '../src/core/verbs';
import { Cell, cell, chunk } from '../src/core/grid';
import type { Game } from '../src/core/types';
import { cradleEye, hide, secrets, type Secret } from '../src/world/secrets';
import { offers, priceAt } from '../src/world/printer';
import { generate } from '../src/world/gen';
import { opening } from '../src/world/spawn';
import { codexOf, firstSight } from '../src/sight/codex';

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
/** v2: the cradle's and the nave's 5x5 chunks (src/world/floors.ts) */
const world = (g: Game, r = 2) => {
  for (const ox of [0, 16]) for (let cy = -r; cy <= r; cy++) for (let cx = -r; cx <= r; cx++) chunk(g, ox + cx, cy);
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
    // not the cradle's: the scratched wall beside it names it, so a lattice eye would find it too
    const [sx, sy] = opening(3).shop;
    const s = world(g).find((x) => x.kind === 'hollow' && (Math.floor(x.x / 16) !== sx || Math.floor(x.y / 16) !== sy))!;
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

  it('every seed hides a scratched wall and a hollow wall by the reliquary beside the start, and it sells a layer eye', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const g = newGame(seed);
      const [px, py] = opening(seed).shop;
      chunk(g, px, py);
      const shop = g.ents.find((e) => e.kind === 'printer' && e.data?.shop)!;
      const by = (kind: string) => secrets(g).find((x) => x.kind === kind && Math.hypot(x.x + 0.5 - shop.x, x.y + 0.5 - shop.y) < 7);
      expect(by('script'), `seed ${seed}`).toBeTruthy();
      const eye = cradleEye(seed);
      if (eye === 'bat-psalter') expect(by('hollow'), `seed ${seed}`).toBeTruthy();
      // the layer eye on the middle shelf, for the copper you wake with
      const it = offers(g, shop)[1]!;
      expect(it.kind === 'mod' && it.mod).toBe(eye);
      expect(priceAt(shop, 1, it)).toEqual({ copper: 2 });
    }
  });

  it('a layer eye marks the secret it names on the map and in vectors', () => {
    const g = newGame(2);
    const [px, py] = opening(2).shop;
    chunk(g, px, py);
    // from where you wake: the reliquary's hollow wall lies a chunk off
    g.ents = g.ents.filter((e) => !e.enemy);
    wear(g, 'bat-psalter');
    run(g, 0.2);
    expect(text(g)).toMatch(/marked on your map: hollow wall/);
    expect(g.vectors.some((v) => v.what === 'hollow wall')).toBe(true);
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
});
