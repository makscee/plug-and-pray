import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { CHUNK, open } from '../src/core/grid';
import { powerMax, powerUsed, working } from '../src/core/mods';
import type { Game } from '../src/core/types';
import { inside } from '../src/world/floors';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};

describe('the spine', () => {
  it('a bare game starts blind with a halo at your feet (the page adds the starting kit)', () => {
    const g = newGame(1);
    exec(g, 'take');
    expect(text(g)).toContain('halo');
    g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'install pinhole');
    expect(g.player.installed).toHaveLength(1);
    expect(working(g, g.player.installed[0])).toBe(false);
    run(g, 1.1);
    expect(working(g, g.player.installed[0])).toBe(true);
  });

  it('walks with the stepper relay only', () => {
    const g = newGame(1);
    exec(g, 'go e 2');
    expect(text(g)).toContain('nothing installed');
    exec(g, 'take');
    exec(g, 'go n 2');
    exec(g, 'face n');
    // the relay lies at (10,6): walk there and take it
    exec(g, 'install pinhole');
    expect(text(g)).toContain('installed');
  });

  it('power caps what is on', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'saints-lens' }, { kind: 'mod', mod: 'ember-cell' });
    exec(g, 'install saint');
    expect(powerUsed(g)).toBe(4);
    exec(g, 'install vidicon');
    g.player.inv.push({ kind: 'mod', mod: 'vidicon-tube' });
    exec(g, 'install vidicon');
    expect(g.player.installed[1].on).toBe(false);
    exec(g, 'remove vidicon');
    exec(g, 'install ember');
    expect(powerMax(g)).toBe(6);
    exec(g, 'off ember');
    expect(powerMax(g)).toBe(4);
  });

  it('every chunk connects to its neighbours', () => {
    const g = newGame(7);
    // breadth-first from the start over the floor's 3x3 chunks east and south of the landing (v2: the floor ends at chunk 2)
    const N = CHUNK * 3;
    const seen = new Set<string>(['8,8']);
    const q: [number, number][] = [[8, 8]];
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const k = `${nx},${ny}`;
        if (seen.has(k) || !open(g, nx, ny)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    for (let cy = 0; cy < 3; cy++)
      for (let cx = 0; cx < 3; cx++) {
        let any = false;
        if (!inside(cx, cy)) continue; // v3: the cradle is a diamond
        for (const k of seen) {
          const [x, y] = k.split(',').map(Number);
          if (Math.floor(x / CHUNK) === cx && Math.floor(y / CHUNK) === cy) { any = true; break; }
        }
        expect(any, `chunk ${cx},${cy}`).toBe(true);
      }
  });

  it('a mite comes to you and hurts', () => {
    const g = newGame(1);
    g.ents.push({ id: 999, kind: 'enemy', x: 10.5, y: 8.5, enemy: { type: 'mite', hp: 2, readyAt: 0, data: {} } });
    run(g, 4);
    expect(g.player.hp).toBeLessThan(10);
  });

  it('the spark finger kills a mite', () => {
    const g = newGame(1);
    g.player.inv.push({ kind: 'mod', mod: 'spark-finger' });
    exec(g, 'install spark');
    g.ents.push({ id: 999, kind: 'enemy', x: 10.5, y: 8.5, enemy: { type: 'mite', hp: 2, readyAt: 0, data: {} } });
    run(g, 6);
    expect(g.ents.find((e) => e.id === 999)).toBeUndefined();
  });
});
