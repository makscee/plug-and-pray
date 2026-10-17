// Terrain labels (DESIGN 9): each label sits beside its dot, clear of every other dot and label.

/** a label's box in map px: left, top, width, height */
export type Box = { x: number; y: number; w: number; h: number };
export type Spot = { x: number; y: number; w: number };

/** VT323 at 20px: about 8px a character, 22px a line */
export const CHAR = 8;
export const LINE = 22;
const GAP = 7;
const DOT = 5;

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const area = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** the map's km→px for points around a center: the farthest one fits inside the margin */
export function fit(points: [number, number][], [cx, cy]: [number, number], size: number) {
  const far = Math.max(1, ...points.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const scale = Math.min(60, Math.max(18, (size / 2 - 40) / far));
  const px = ([x, y]: [number, number]): [number, number] => [size / 2 + (x - cx) * scale, size / 2 - (y - cy) * scale];
  return { scale, px };
}

/** where each spot's label goes: right of the dot, else left, else above or below, slid sideways.
 *  A small search finds sides that keep every label on the map and clear of every other dot, `also`
 *  and each other; if there are none, each label takes the side that overlaps least. */
export function placeLabels(spots: Spot[], size: number, also: Box[] = []): Box[] {
  const dots: Box[] = spots.map((s) => ({ x: s.x - DOT, y: s.y - DOT, w: 2 * DOT, h: 2 * DOT }));
  const sides = spots.map((s) => {
    const box = (x: number, y: number): Box => ({ x, y, w: s.w, h: LINE });
    const out: Box[] = [box(s.x + GAP, s.y - LINE / 2), box(s.x - GAP - s.w, s.y - LINE / 2)];
    // then above and below, the label slid along the line from centered to either end
    for (const k of [0.5, 0.25, 0.75, 0, 1]) for (const y of [s.y - GAP - LINE, s.y + GAP]) out.push(box(s.x - k * s.w, y));
    return out;
  });
  const cost = (b: Box, i: number, placed: Box[]) => {
    const off = b.x < 0 || b.y < 0 || b.x + b.w > size || b.y + b.h > size ? 1e6 : 0;
    const others = [...dots.filter((_, j) => j !== i), ...also, ...placed];
    return off + others.reduce((a, o) => a + area(b, o), 0);
  };

  const placed: Box[] = [];
  const search = (i: number): boolean => {
    if (i === spots.length) return true;
    for (const b of sides[i]) {
      if (cost(b, i, placed) > 0) continue;
      placed.push(b);
      if (search(i + 1)) return true;
      placed.pop();
    }
    return false;
  };
  if (search(0)) return placed;
  placed.length = 0;
  spots.forEach((_, i) => placed.push(sides[i].reduce((a, b) => (cost(b, i, placed) < cost(a, i, placed) ? b : a))));
  return placed;
}
