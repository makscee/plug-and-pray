// The terrain map's labels stay clear of every other dot and label (the 4-packet.png collision).
import { describe, expect, it } from 'vitest';
import { world } from '../src/content';
import { CHAR, fit, overlaps, placeLabels, type Box } from '../src/map/labels';

const SIZE = 300;
const w = world();
const places = Object.values(w.nodes).filter((n) => n.place).map((n) => n.name);
const at = (id: string): [number, number] => [w.nodes['@' + id].place!.x, w.nodes['@' + id].place!.y];

function layout(from: string, known = places) {
  const { px } = fit(known.map(at), at(from), SIZE);
  const spots = known.map((p) => {
    const [x, y] = px(at(p));
    return { x, y, w: (p.length + (p === from ? 0 : ' 4.0 km'.length)) * CHAR };
  });
  return { spots, boxes: placeLabels(spots, SIZE) };
}

describe('terrain labels', () => {
  it('knows the five places', () => {
    expect([...places].sort()).toEqual(['HAB', 'LDR', 'RLY', 'T-2', 'here']);
  });

  for (const from of ['here', 'LDR', 'T-2', 'HAB', 'RLY']) {
    it(`from ${from}: no label runs into another label or dot, all on the map`, () => {
      const { spots, boxes } = layout(from);
      const bad: string[] = [];
      boxes.forEach((b, i) => {
        if (b.x < 0 || b.y < 0 || b.x + b.w > SIZE || b.y + b.h > SIZE) bad.push(`${places[i]} off map`);
        boxes.forEach((o, j) => j > i && overlaps(b, o) && bad.push(`${places[i]} on ${places[j]}'s label`));
        spots.forEach((s, j) => {
          const dot: Box = { x: s.x - 4, y: s.y - 4, w: 8, h: 8 };
          if (j !== i && overlaps(b, dot)) bad.push(`${places[i]} on ${places[j]}'s dot`);
        });
      });
      expect(bad).toEqual([]);
    });
  }

  it('every set of known places, from each of them, lays out clear', () => {
    const bad: string[] = [];
    for (let m = 1; m < 1 << places.length; m++) {
      const known = places.filter((_, i) => m & (1 << i));
      for (const from of known) {
        const { spots, boxes } = layout(from, known);
        boxes.forEach((b, i) => {
          if (b.x < 0 || b.y < 0 || b.x + b.w > SIZE || b.y + b.h > SIZE) bad.push(`${known} from ${from}: ${known[i]} off map`);
          if (boxes.some((o, j) => j !== i && overlaps(b, o))) bad.push(`${known} from ${from}: ${known[i]} on a label`);
          if (spots.some((s, j) => j !== i && overlaps(b, { x: s.x - 4, y: s.y - 4, w: 8, h: 8 }))) bad.push(`${known} from ${from}: ${known[i]} on a dot`);
        });
      }
    }
    expect(bad).toEqual([]);
  });

  it('the old rule (always right of the dot) did collide at RLY: here 4.0 km ran into RLY', () => {
    const { px } = fit(places.map(at), at('RLY'), SIZE);
    const [hx, hy] = px(at('here'));
    const [rx, ry] = px(at('RLY'));
    expect(overlaps({ x: hx + 7, y: hy - 11, w: 11 * CHAR, h: 22 }, { x: rx - 4, y: ry - 4, w: 8, h: 8 })).toBe(true);
  });
});
