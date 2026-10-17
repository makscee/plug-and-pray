import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, tick } from '../src/core/game';
import { addItem, exec } from '../src/core/verbs';
import { expose, FILTERS } from '../src/sight';

const frame = (res: number, f: (i: number) => [number, number, number]) => {
  const px = new Uint8Array(res * res * 4);
  for (let i = 0; i < res * res; i++) px.set([...f(i), 255], i * 4);
  return px;
};

describe('tuning (#1328)', () => {
  it('a dark frame is lifted so its bright end reads', () => {
    const px = frame(8, (i) => (i % 8 < 2 ? [30, 30, 30] : [5, 5, 5]));
    expose(px, 8);
    expect(px[0]).toBeGreaterThan(150);
    expect(px[2 * 4]).toBeLessThan(60);
  });

  it('a 4-colour eye draws only 4 dusk colours', () => {
    const px = frame(16, (i) => [(i * 7) % 256, (i * 3) % 256, (i * 11) % 256]);
    FILTERS.color(px, 16, { colors: 4, noise: 0, t: 0 });
    const seen = new Set<string>();
    for (let i = 0; i < 256; i++) seen.add(`${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]}`);
    expect(seen.size).toBeLessThanOrEqual(4);
  });

  it('listen gives compass words, cells and a button; the legs hint at the card reader once', () => {
    const g = newGame(1);
    exec(g, 'listen');
    const heard = JSON.stringify(g.log.slice(-1));
    expect(heard).toMatch(/\d+ cells, (n|ne|e|se|s|sw|w|nw)\./);
    expect(heard).toMatch(/"cmd":"crawl [nesw]"/);
    addItem(g, { kind: 'mod', mod: 'stepper-relay' });
    exec(g, 'install stepper');
    for (let k = 0; k < 20; k++) tick(g, 0.1);
    const all = JSON.stringify(g.log);
    expect(all).toContain('a card reader ticks');
    expect(all.split('a card reader ticks').length).toBe(2);
  });
});
