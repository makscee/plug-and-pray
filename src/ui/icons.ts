// Icons: every item, module and thing nearby gets a 16×16 pixel icon drawn in code. A module's
// silhouette comes from its family, details from its params (an eye's tint, a scanner's rings, a lamp's
// glow), the frame from its tier, and a glint or a crack from its roll. Nothing is listed by id, so new
// modules get icons without a line here. `sprite(rows, colours)` draws hand-made pixel art too.

import { def } from '../core/mods';
import { hash } from '../core/rng';
import type { Item, Roll } from '../core/types';

export const ICON = 16;

/** a pixel grid; colours are css strings, '' is clear */
export class Px {
  p: string[] = new Array(ICON * ICON).fill('');
  set(x: number, y: number, c: string): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < ICON && y < ICON) this.p[y * ICON + x] = c;
  }
  get(x: number, y: number): string {
    return this.p[y * ICON + x] ?? '';
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: string): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) this.set(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, c);
  }
  /** a disc (fill) or a ring of width 1, centred on a pixel corner when cx is x.5 */
  circle(cx: number, cy: number, r: number, c: string, fill = false): void {
    for (let y = 0; y < ICON; y++)
      for (let x = 0; x < ICON; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (fill ? d <= r : Math.abs(d - r) < 0.55) this.set(x, y, c);
      }
  }
  /** an arc of a ring between two angles (radians, 0 = east, clockwise because y points down) */
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: string): void {
    for (let y = 0; y < ICON; y++)
      for (let x = 0; x < ICON; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        let a = Math.atan2(dy, dx);
        if (a < a0) a += Math.PI * 2;
        if (Math.abs(Math.hypot(dx, dy) - r) < 0.55 && a >= a0 && a <= a1) this.set(x, y, c);
      }
  }
  /** a one-pixel dark outline around everything drawn so far */
  outline(c = INK): void {
    const src = [...this.p];
    for (let y = 0; y < ICON; y++)
      for (let x = 0; x < ICON; x++) {
        if (src[y * ICON + x]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const [nx, ny] = [x + dx, y + dy];
          return nx >= 0 && ny >= 0 && nx < ICON && ny < ICON && src[ny * ICON + nx] && src[ny * ICON + nx] !== c;
        });
        if (near) this.p[y * ICON + x] = c;
      }
  }
}

// the palette: dark divine machinery: bone, bronze, rust, ember, slate, a little cold blue
const INK = '#0b0807';
const BONE = '#d8c8b0';
const BONE_D = '#8a7a66';
const BRONZE = '#b07838';
const BRONZE_D = '#6a4420';
const EMBER = '#f0a050';
const GOLD = '#ffd070';
const RUST = '#a04428';
const SLATE = '#5a6470';
const COLD = '#a8c8ff';
const GLASS = '#9fd8d0';
const ICHOR = '#e05838';
const FLESH = '#c06070';
/** tier frames: common bronze, then copper, cold silver, gold */
const TIER = ['#4a3a2c', '#8a5030', '#6a7c90', '#c09040'];

/** hand-made pixel art: rows of characters, each a key into `colours` ('.' or ' ' is clear) */
export function sprite(rows: string[], colours: Record<string, string>): Px {
  const px = new Px();
  rows.forEach((row, y) => [...row].forEach((ch, x) => colours[ch] && px.set(x, y, colours[ch])));
  return px;
}

// --- module silhouettes, by family ----------------------------------------------------------------

type Params = Record<string, unknown>;
const num = (p: Params, k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : d);

function eye(px: Px, p: Params, id: string): void {
  const filter = String(p.filter ?? 'color');
  const iris = filter === 'gray' || filter === '1bit' ? BONE_D : filter === 'heat' ? ICHOR : filter === 'sonar' ? GLASS : filter === 'edge' ? COLD : EMBER;
  // the bigger the picture, the bigger the eye; the pinhole is a speck in a plate
  const res = num(p, 'res', 64);
  const R = res <= 32 ? 4.6 : res <= 64 ? 5.6 : 6.6;
  const rim = hash(...[...id].map((c) => c.charCodeAt(0))) % 3;
  if (rim === 1) px.rect(8 - R, 8 - R, 7 + R, 7 + R, BRONZE_D), px.rect(9 - R, 9 - R, 6 + R, 6 + R, BRONZE);
  else px.circle(8, 8, R, BRONZE, true), px.circle(8, 8, R, BRONZE_D);
  if (rim === 2) for (let k = 0; k < 8; k++) px.set(8 + Math.cos((k / 8) * Math.PI * 2) * (R + 0.6) - 0.5, 8 + Math.sin((k / 8) * Math.PI * 2) * (R + 0.6) - 0.5, GOLD);
  const ir = res <= 32 ? 1.6 : R - 2.4;
  px.circle(8, 8, ir + 1, INK, true);
  px.circle(8, 8, ir, iris, true);
  if (res > 32) px.circle(8, 8, Math.max(0.8, ir * 0.35), INK, true);
  px.set(9, 6, BONE);
  if (filter === '1bit') px.rect(6, 7, 7, 8, BONE);
  if (filter === 'sonar') [0, 1].forEach((k) => px.arc(8, 8, R + 1.5 + k * 1.6, -0.7, 0.7, GLASS));
  if (filter === 'heat') [[3, 2], [5, 1], [11, 1], [13, 2]].forEach(([x, y]) => px.set(x, y, EMBER));
  if (filter === 'edge') px.line(8 - R, 8, 7 + R, 8, COLD);
  if (num(p, 'lag') > 0.5 || num(p, 'blur') > 0) [[2, 14], [4, 15], [12, 15], [14, 14]].forEach(([x, y]) => px.set(x, y, BONE_D));
  // fast eyes get lashes: one per 4 fps
  for (let k = 0; k < Math.min(3, Math.floor(num(p, 'fps') / 4)); k++) px.set(5 + k * 3, 0, BONE_D);
}

function dish(px: Px, p: Params): void {
  const sees = (p.sees as string[] | undefined) ?? [];
  const tint = sees.includes('heat') ? ICHOR : sees.includes('veins') ? BRONZE : sees.includes('flesh') ? FLESH : sees.includes('enemies') ? RUST : sees.includes('doors') ? BONE : GLASS;
  const rings = Math.max(1, Math.min(3, Math.round(num(p, 'range', 8) / 4)));
  const cone = p.shape === 'cone';
  for (let k = 0; k < rings; k++) {
    const r = 3 + k * 2.4;
    if (cone) px.arc(3, 13, r, -Math.PI / 2, 0, tint);
    else px.circle(8, 8, r, k === 0 ? tint : BONE_D);
  }
  if (cone) {
    px.rect(1, 12, 4, 14, BRONZE);
    px.set(2, 13, tint);
  } else px.circle(8, 8, 1.3, tint, true);
}

function flame(px: Px, p: Params): void {
  const c = typeof p.color === 'string' ? '#' + p.color : EMBER;
  const r = Math.min(7, 2 + num(p, 'radius', 3) * 0.7);
  px.circle(8, 8, r, BRONZE_D);
  for (let y = 4; y <= 12; y++) {
    const w = Math.max(0, Math.round((y - 4) * 0.45 + (y > 9 ? -(y - 9) * 0.9 : 0)));
    px.rect(8 - w, y, 7 + w + (y > 6 ? 1 : 0), y, c);
  }
  px.set(8, 3, c);
  px.rect(7, 9, 8, 11, GOLD);
  if (num(p, 'flicker') > 0.2) [[3, 5], [12, 4], [13, 10]].forEach(([x, y]) => px.set(x, y, GOLD));
}

function legs(px: Px, p: Params): void {
  if (p.pilot) {
    // a moth: two wings, a body; avoiding pilots get eyespots
    px.circle(5, 7, 3.6, BONE_D, true);
    px.circle(11, 7, 3.6, BONE_D, true);
    px.circle(5, 11.5, 2.2, BRONZE_D, true);
    px.circle(11, 11.5, 2.2, BRONZE_D, true);
    px.rect(7, 4, 8, 13, BRONZE);
    px.set(6, 2, BRONZE);
    px.set(9, 2, BRONZE);
    if (p.avoid) [[5, 7], [10, 7]].forEach(([x, y]) => px.rect(x, y, x + 1, y, EMBER));
    return;
  }
  if (p.dig) {
    // a pick
    px.arc(8, 11, 7, Math.PI * 1.15, Math.PI * 1.85, BONE);
    px.arc(8, 11, 6, Math.PI * 1.15, Math.PI * 1.85, BONE_D);
    px.line(8, 4, 8, 15, BRONZE);
    return;
  }
  if (p.free || p.keys) {
    // a gyro: rings around a heart
    px.circle(8, 8, 6, BRONZE);
    px.arc(8, 8, 4, 0, Math.PI, BONE_D);
    px.arc(8, 8, 4, Math.PI, Math.PI * 2, BONE);
    px.circle(8, 8, 1.8, p.free ? EMBER : GOLD, true);
    return;
  }
  // a stepper: two jointed legs under a hip
  px.rect(4, 2, 11, 4, BRONZE);
  px.line(5, 5, 3, 10, BONE);
  px.line(3, 10, 5, 14, BONE);
  px.line(10, 5, 12, 10, BONE);
  px.line(12, 10, 10, 14, BONE);
  px.set(3, 10, EMBER);
  px.set(12, 10, EMBER);
  px.rect(4, 14, 6, 14, BRONZE_D);
  px.rect(9, 14, 11, 14, BRONZE_D);
}

function blade(px: Px, p: Params): void {
  const dmg = num(p, 'damage', 1);
  const c = dmg >= 5 ? GOLD : dmg >= 2 ? COLD : BONE;
  if (p.aim === 'aimed') {
    const fast = num(p, 'cooldown', 1) < 0.5;
    const long = num(p, 'range', 6) >= 8;
    if (fast) {
      // a volley: three short bolts
      for (const [dx, dy] of [[0, 0], [-4, -1], [-1, 4]]) {
        px.line(5 + dx, 10 + dy, 9 + dx, 6 + dy, BRONZE);
        px.rect(9 + dx, 5 + dy, 10 + dx, 6 + dy, c);
      }
      return;
    }
    // a bolt: a shaft, a head as heavy as it hits, fletching if it flies far
    px.line(long ? 1 : 3, long ? 14 : 12, 12, 3, BRONZE);
    const h = dmg >= 5 ? 2 : dmg >= 2 ? 1 : 0;
    px.rect(12 - h, 3 - 0, 13, 4 + h - 1, c);
    px.rect(12, 2 - h, 13 + h, 3, c);
    px.set(14, 1, c);
    if (long) [[1, 12], [2, 13], [3, 14], [0, 13]].forEach(([x, y]) => px.set(x, y, EMBER));
    else px.line(2, 10, 4, 12, EMBER);
    return;
  }
  if (num(p, 'range', 1.5) >= 3) {
    // a spark that leaps: a star
    px.line(8, 1, 8, 15, c);
    px.line(1, 8, 15, 8, c);
    px.line(3, 3, 13, 13, EMBER);
    px.line(13, 3, 3, 13, EMBER);
    px.circle(8, 8, 1.6, GOLD, true);
    return;
  }
  if (p.sweep || num(p, 'range', 1.5) >= 2.2) {
    // a flail: a handle, a chain, a censer
    px.line(2, 14, 6, 10, BRONZE);
    for (let k = 0; k < 4; k++) px.set(7 + k, 9 - k, k % 2 ? BONE_D : BONE);
    px.circle(12, 4.5, 2.6, c, true);
    px.set(12, 4, EMBER);
    if (p.sweep) px.arc(8, 8, 7, Math.PI * 1.05, Math.PI * 1.5, EMBER);
    return;
  }
  // a blade, broader the harder it cuts, faster ones get a second edge
  const w = dmg >= 3 ? 2 : 1;
  for (let k = 0; k <= w; k++) px.line(3 + k, 13, 12 + k, 4, k === 0 ? BONE : c);
  px.set(13 + w - 1, 3, BONE);
  px.line(3, 10, 6, 13, BRONZE);
  px.line(2, 14, 3, 13, BRONZE_D);
  if (num(p, 'cooldown', 1) < 1) px.line(9, 13, 13, 9, BONE_D);
}

function plate(px: Px, p: Params): void {
  if (p.hp || p.regen || p.mend) {
    // a heart, stitched for mending
    px.circle(5.5, 6, 3, FLESH, true);
    px.circle(10.5, 6, 3, FLESH, true);
    for (let y = 7; y <= 13; y++) px.rect(2 + (y - 7), y, 13 - (y - 7), y, FLESH);
    px.set(5, 4, BONE);
    if (p.regen || p.mend) [[6, 9], [8, 8], [10, 9]].forEach(([x, y]) => px.set(x, y, BONE));
    if (p.hp) px.rect(7, 6, 8, 11, GOLD);
    return;
  }
  if (p.haste) {
    // overclock: a coil with a spark through it
    for (let y = 3; y <= 13; y += 2) px.line(4, y, 11, y + 1, BRONZE);
    px.line(4, 3, 4, 13, BRONZE_D);
    px.line(11, 4, 11, 14, BRONZE_D);
    px.line(9, 1, 6, 8, GOLD);
    px.line(6, 8, 10, 8, GOLD);
    px.line(10, 8, 7, 15, GOLD);
    return;
  }
  if (p.ward) {
    // a mirror: a diamond with a sheen
    for (let y = 1; y <= 14; y++) {
      const w = 7 - Math.abs(y - 7.5);
      px.rect(8 - w, y, 7 + w, y, y < 8 ? COLD : SLATE);
    }
    px.line(5, 7, 8, 4, BONE);
    return;
  }
  // a plate of armour, a rib per point; heatproof is ember-edged, thorns are spiked, haste has wings
  const edge = p.heatproof ? EMBER : p.thorns ? RUST : BONE_D;
  px.rect(3, 2, 12, 9, SLATE);
  for (let y = 10; y <= 14; y++) px.rect(3 + (y - 9), y, 12 - (y - 9), y, SLATE);
  for (let k = 0; k < Math.min(3, Math.ceil(num(p, 'armour', 1) * 2)); k++) px.rect(5, 4 + k * 3, 10, 4 + k * 3, BONE_D);
  px.line(3, 2, 12, 2, edge);
  px.line(3, 2, 3, 9, edge);
  px.line(12, 2, 12, 9, edge);
  if (p.thorns) [[2, 4], [13, 4], [2, 8], [13, 8], [8, 15]].forEach(([x, y]) => px.set(x, y, RUST));
  if (p.haste) [[1, 3], [0, 5], [14, 3], [15, 5]].forEach(([x, y]) => px.set(x, y, GOLD));
}

function mind(px: Px, p: Params): void {
  const what = String(p.what ?? '');
  if (what === 'map') {
    // a spool of map: two rolls and the sheet between
    px.rect(2, 3, 13, 12, BONE);
    px.rect(1, 2, 2, 13, BRONZE);
    px.rect(13, 2, 14, 13, BRONZE);
    px.line(4, 10, 6, 6, RUST);
    px.line(6, 6, 9, 8, RUST);
    px.line(9, 8, 11, 5, RUST);
    px.set(11, 5, EMBER);
    if (num(p, 'span') > 40) px.rect(4, 4, 5, 4, BONE_D);
    return;
  }
  if (what === 'compass') {
    px.circle(8, 8, 6.5, BRONZE, true);
    px.circle(8, 8, 5.2, INK, true);
    px.line(8, 3, 8, 8, EMBER);
    px.line(8, 8, 8, 13, BONE_D);
    px.set(8, 2, GOLD);
    return;
  }
  if (what === 'clock') {
    px.circle(8, 8, 6.5, BONE_D, true);
    px.circle(8, 8, 5.4, INK, true);
    for (let k = 0; k < 12; k += 3) px.set(8 + Math.round(Math.sin((k / 12) * Math.PI * 2) * 4.5), 8 - Math.round(Math.cos((k / 12) * Math.PI * 2) * 4.5), BONE);
    px.line(8, 8, 8, 4, EMBER);
    px.line(8, 8, 11, 9, BONE);
    return;
  }
  if (what === 'reader') {
    // a slot with a card half in
    px.rect(2, 8, 13, 14, BRONZE);
    px.rect(3, 9, 12, 9, INK);
    px.rect(5, 2, 10, 9, BONE);
    px.rect(6, 4, 9, 4, BONE_D);
    px.rect(6, 6, 8, 6, BONE_D);
    px.set(11, 12, EMBER);
    return;
  }
  // a book: a ledger, a log, anything else that minds things; a rosary log gets beads
  px.rect(3, 2, 12, 14, what === 'log' ? RUST : BRONZE_D);
  px.rect(4, 3, 11, 13, BONE);
  px.line(7, 3, 7, 13, BONE_D);
  for (let y = 5; y <= 11; y += 2) px.line(9, y, 10, y, BONE_D);
  if (num(p, 'keep') > 8) for (let y = 3; y <= 13; y += 2) px.set(13, y, GOLD);
  if (what === 'log') px.rect(10, 1, 10, 4, EMBER);
}

function cell(px: Px, p: Params): void {
  if (p.slots) {
    // a slot board: a chip with pins
    px.rect(3, 3, 12, 12, '#2a3a2a');
    px.rect(5, 5, 10, 10, SLATE);
    for (let k = 4; k <= 11; k += 2) {
      px.set(k, 1, BRONZE);
      px.set(k, 14, BRONZE);
      px.set(1, k, BRONZE);
      px.set(14, k, BRONZE);
      px.set(k, 2, BRONZE_D);
      px.set(k, 13, BRONZE_D);
    }
    px.rect(7, 7, 8, 8, EMBER);
    return;
  }
  // a power cell: a jar with a coil, more bars for more power
  const power = num(p, 'power', 2);
  px.rect(4, 1, 11, 2, BRONZE);
  px.rect(3, 3, 12, 14, SLATE);
  px.rect(4, 4, 11, 13, INK);
  const bars = Math.min(5, power);
  for (let k = 0; k < bars; k++) px.rect(5, 12 - k * 2, 10, 12 - k * 2, k === bars - 1 ? GOLD : EMBER);
  px.set(6, 2, GOLD);
}

function needle(px: Px, p: Params): void {
  // a hollow needle with a drop at the tip; a thirstier one is longer
  const len = num(p, 'drain', 1) > 1 ? 12 : 10;
  px.line(13, 2, 13 - len, 2 + len, BONE);
  px.line(13, 3, 14 - len, 3 + len, BONE_D);
  px.rect(11, 1, 14, 4, BRONZE);
  px.circle(2.5 + (12 - len), 13.5, 1.4, ICHOR, true);
}

function shard(px: Px): void {
  for (let y = 1; y <= 14; y++) {
    const w = y < 6 ? (y - 1) * 0.8 : (14 - y) * 0.45;
    px.rect(8 - w, y, 7 + w, y, y < 6 ? GOLD : EMBER);
  }
  px.line(8, 2, 8, 12, '#fff0c0');
  px.set(5, 6, BONE);
}

/** a module family nobody drew yet: a symmetric glyph from the id, so it is still its own */
function glyph(px: Px, id: string): void {
  const h = hash(...[...id].map((c) => c.charCodeAt(0)));
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++)
      if ((h >> (y * 3 + x)) & 1) {
        px.rect(3 + x * 2, 3 + y * 2, 4 + x * 2, 4 + y * 2, BONE);
        px.rect(11 - x * 2, 3 + y * 2, 12 - x * 2, 4 + y * 2, BONE);
      }
}

const FAMILY: Record<string, (px: Px, p: Params, id: string) => void> = {
  camera: eye,
  scanner: dish,
  lamp: flame,
  gait: legs,
  weapon: blade,
  body: plate,
  mind,
  power: cell,
  tool: needle,
  unique: (px) => shard(px),
};

function moduleIcon(id: string, roll?: Roll): Px {
  const d = def({ mod: id });
  const px = new Px();
  (FAMILY[d.family] ?? ((q: Px) => glyph(q, id)))(px, { ...d.params, ...(roll ? { [roll.key]: num(d.params, roll.key) * roll.mult } : {}) }, id);
  px.outline();
  // the frame: a tier-coloured corner bracket
  const t = TIER[Math.min(3, d.tier)];
  for (const [x, y, dx, dy] of [[0, 0, 1, 1], [15, 0, -1, 1], [0, 15, 1, -1], [15, 15, -1, -1]]) {
    if (!px.get(x, y)) px.set(x, y, t);
    if (!px.get(x + dx, y)) px.set(x + dx, y, t);
    if (!px.get(x, y + dy)) px.set(x, y + dy, t);
  }
  if (roll?.tag === 'attuned') [[13, 1], [12, 2], [14, 2], [13, 3]].forEach(([x, y]) => px.set(x, y, '#fff6d0'));
  if (roll?.tag === 'cracked') px.line(2, 4, 7, 9, INK), px.line(7, 9, 5, 13, INK);
  return px;
}

// --- resources, cards, things in the world ---------------------------------------------------------

const RES: Record<string, Px> = {
  bone: sprite([
    '................',
    '..##........##..',
    '.#BB#......#BB#.',
    '.#BBB#....#BBB#.',
    '..#BBB####BBB#..',
    '...#BBBBBBBB#...',
    '....#bbbbbb#....',
    '....#bbbbbb#....',
    '...#BBBBBBBB#...',
    '..#BBB####BBB#..',
    '.#BBB#....#BBB#.',
    '.#BB#......#BB#.',
    '..##........##..',
    '................',
  ], { '#': INK, B: BONE, b: SLATE }),
  glass: sprite([
    '.......##.......',
    '......#gg#......',
    '.....#gWgg#.....',
    '....#gWggGg#....',
    '...#gWggGGgg#...',
    '..#gggggGGggg#..',
    '.#ggggggGGgggg#.',
    '..#GGgggGGgGG#..',
    '...#GGggGGGG#...',
    '....#GGgGGG#....',
    '.....#GGGG#.....',
    '......#GG#......',
    '.......##.......',
  ], { '#': INK, g: GLASS, G: '#5a9890', W: '#e8fff8' }),
  copper: sprite([
    '................',
    '.....####.......',
    '....#cccC##.....',
    '...#cWcccCC#....',
    '..#cWccccCCC##..',
    '..#cccccCCCCCC#.',
    '.#ccccCCCCCCdC#.',
    '.#cccCCCCCCddd#.',
    '.#CCCCCCCCddd#..',
    '..#CCCCCdddd#...',
    '...#ddddddd#....',
    '....#######.....',
  ], { '#': INK, c: '#e08a48', C: BRONZE, d: BRONZE_D, W: GOLD }),
  ichor: sprite([
    '.......#........',
    '......#i#.......',
    '......#i#.......',
    '.....#iii#......',
    '.....#iii#......',
    '....#iWiii#.....',
    '...#iWiiiii#....',
    '...#iiiiiiI#....',
    '..#iiiiiiiII#...',
    '..#iiiiiiIII#...',
    '..#IiiiiIIII#...',
    '...#IIIIIII#....',
    '....#IIIII#.....',
    '.....#####......',
  ], { '#': INK, i: ICHOR, I: '#902818', W: GOLD }),
};

function card(id: string): Px {
  const scripture = !id.startsWith('log');
  const px = new Px();
  px.rect(3, 1, 12, 14, scripture ? '#3a2410' : SLATE);
  px.rect(4, 2, 11, 13, scripture ? '#5a3a18' : '#3a4048');
  if (scripture) {
    // a glyph: the scripture shard's mark
    px.circle(8, 7, 2.6, GOLD);
    px.line(8, 3, 8, 12, GOLD);
    px.set(8, 7, '#fff0c0');
  } else {
    for (let y = 4; y <= 11; y += 2) px.line(5, y, y % 4 ? 10 : 9, y, BONE_D);
    px.rect(9, 11, 10, 12, EMBER);
  }
  px.rect(5, 14, 10, 15, BRONZE);
  px.outline();
  return px;
}

/** world things for the nearby window */
const THINGS: Record<string, Px> = {
  printer: sprite([
    '................',
    '..############..',
    '..#SSSSSSSSSS#..',
    '..#S########S#..',
    '..#S#eeeeee#S#..',
    '..#S########S#..',
    '..#SSSSSSSSSS#..',
    '.##############.',
    '.#ssssssssssss#.',
    '.#s#BBBBBBBB#s#.',
    '.#s#BbbbbbbB#s#.',
    '.#s##########s#.',
    '.#ssssssssssss#.',
    '.##############.',
    '..##........##..',
  ], { '#': INK, S: SLATE, s: '#3a4048', e: EMBER, B: BONE, b: BONE_D }),
  shop: sprite([
    '......####......',
    '....##GGGG##....',
    '...#GG####GG#...',
    '..#G##....##G#..',
    '..#G#......#G#..',
    '.#G#........#G#.',
    '.#G#.e..e..e#G#.',
    '.#G#........#G#.',
    '.#G##########G#.',
    '.#GBBBBBBBBBBG#.',
    '.#G##########G#.',
    '.#GG#......#GG#.',
    '.#GG#......#GG#.',
    '################',
  ], { '#': INK, G: '#c09040', B: BRONZE_D, e: EMBER }),
  altar: sprite([
    '.......#........',
    '......#f#.......',
    '.....#fFf#......',
    '.....#fFf#......',
    '......#f#.......',
    '...##########...',
    '..#BBBBBBBBBB#..',
    '..############..',
    '....#bbbbbb#....',
    '....#b#bb#b#....',
    '....#bbbbbb#....',
    '....#b#bb#b#....',
    '...##########...',
    '..#BBBBBBBBBB#..',
    '..############..',
  ], { '#': INK, B: BONE, b: BONE_D, f: EMBER, F: GOLD }),
  enemy: sprite([
    '................',
    '.....######.....',
    '...##rrrrrr##...',
    '..#rrRRRRRRrr#..',
    '..#rR#RRRR#Rr#..',
    '..#rRRRRRRRRr#..',
    '...#rR####Rr#...',
    '....#rrrrrr#....',
    '...#.#....#.#...',
    '..#...#..#...#..',
  ], { '#': INK, r: RUST, R: ICHOR }),
};

function vein(res: string): Px {
  const c = res === 'bone' ? BONE : res === 'glass' ? GLASS : res === 'copper' ? '#e08a48' : ICHOR;
  const px = new Px();
  px.rect(0, 0, 15, 15, '#2a201a');
  px.rect(0, 0, 15, 0, '#3a2e24');
  for (let k = 0; k < 3; k++) px.line(1 + k * 5, 15, 4 + k * 4, 2 + k * 3, c);
  px.line(2, 6, 13, 9, BONE_D);
  return px;
}

// --- to images ---------------------------------------------------------------------------------------

/** what an icon is of: an inventory item, an installed module, or a thing in the world */
export type Of = Item | { mod: string; roll?: Roll } | { thing: 'printer' | 'shop' | 'altar' | 'enemy' } | { vein: string };

export function key(of: Of): string {
  if ('thing' in of) return 'thing:' + of.thing;
  if ('vein' in of) return 'vein:' + of.vein;
  if ('kind' in of && of.kind === 'res') return 'res:' + of.res;
  if ('kind' in of && of.kind === 'card') return 'card:' + of.card;
  const m = of as { mod: string; roll?: Roll };
  return `mod:${m.mod}:${m.roll ? `${m.roll.key}:${m.roll.tag}` : ''}`;
}

export function draw(of: Of): Px {
  if ('thing' in of) return THINGS[of.thing];
  if ('vein' in of) return vein(of.vein);
  if ('kind' in of && of.kind === 'res') return RES[of.res] ?? glyphOf(of.res);
  if ('kind' in of && of.kind === 'card') return card(of.card);
  const m = of as { mod: string; roll?: Roll };
  return moduleIcon(m.mod, m.roll);
}

function glyphOf(id: string): Px {
  const px = new Px();
  glyph(px, id);
  return px;
}

const urls = new Map<string, string>();

/** a data url of the icon, 16×16 (scale it up in css with image-rendering: pixelated) */
export function url(of: Of): string {
  const k = key(of);
  let u = urls.get(k);
  if (u) return u;
  const c = document.createElement('canvas');
  c.width = c.height = ICON;
  const ctx = c.getContext('2d')!;
  const px = draw(of);
  for (let y = 0; y < ICON; y++)
    for (let x = 0; x < ICON; x++) {
      const col = px.get(x, y);
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  u = c.toDataURL();
  urls.set(k, u);
  return u;
}

/** an <img> of the icon at `scale` × 16 px, crisp */
export function img(of: Of, scale = 2): HTMLImageElement {
  const i = document.createElement('img');
  i.className = 'icon';
  i.src = url(of);
  i.width = i.height = ICON * scale;
  i.draggable = false;
  return i;
}
