// Enemy sprites: procedural pixel art, drawn into small canvases once at load (LD Compo: all art made
// in code). Each type has frames: two idle, one attack, one white hit flash, plus a mask of each
// (white where opaque) that the heat and sonar eyes use as a silhouette. Drawn symmetric about the
// middle, outlined in near black so they read on the 4-shade pinhole too.

export const SIZE = 32;

/** one frame's pixels: a colour per cell, or 0 for clear */
type Px = (x: number, y: number, c: string) => void;
/** draws one frame: `f` is 0/1 for idle, 2 for attack */
type Art = (px: Px, f: number) => void;

export interface SpriteDef {
  art: Art;
  /** height on screen in cells (a wall is 1) */
  size: number;
  /** the sprite's bottom above the floor (floaters hover) */
  lift: number;
  /** warmth on a heat eye 0..1 */
  heat: number;
}

const disc = (px: Px, cx: number, cy: number, r: number, c: string) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) px(x, y, c);
};
const ell = (px: Px, cx: number, cy: number, rx: number, ry: number, c: string) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) px(x, y, c);
};
const rect = (px: Px, x0: number, y0: number, w: number, h: number, c: string) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, c);
};
const line = (px: Px, x0: number, y0: number, x1: number, y1: number, c: string) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) px(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), c);
};
/** left half only: the frame is mirrored, so draw x < 16 */
const both = (px: Px): Px => (x, y, c) => {
  px(x, y, c);
  px(SIZE - 1 - x, y, c);
};

export const SPRITES: Record<string, SpriteDef> = {
  // a choir mite: a low rust beetle, six legs, two red eyes; it opens its mandibles to bite
  mite: {
    size: 0.6, lift: 0, heat: 0.7,
    art(p, f) {
      const s = both(p);
      for (let k = 0; k < 3; k++) {
        const y = 18 + k * 4 + (f === 1 ? (k % 2 ? 1 : -1) : 0);
        line(s, 7, y + 4, 11, y, '#5a3424');
        line(s, 4, y + 7, 7, y + 4, '#5a3424');
      }
      ell(p, 16, 21, 8, 7, '#7a4630');
      ell(p, 16, 19, 6, 4, '#a0603c');
      rect(p, 15, 14, 2, 14, '#4a2a1c');
      disc(p, 16, 13, 4.2, '#6a3a28');
      s(13, 12, '#ff3020');
      s(14, 12, '#ff9070');
      const open = f === 2 ? 3 : 1;
      line(s, 14, 16, 15 - open, 18 + open, '#e0c8a0');
    },
  },
  // a seraph lamp: a floating golden eye in a wheel of feathered rays; it flares white to fire
  seraph: {
    size: 0.6, lift: 0.25, heat: 1,
    art(p, f) {
      wheel(p, f, ['#f0d080', '#c08030', '#fff0c0', '#ffffff', '#402010']);
    },
  },
  pyre: {
    size: 0.6, lift: 0.25, heat: 1,
    art(p, f) {
      wheel(p, f, ['#ff8030', '#a02010', '#ffd060', '#fff4c0', '#300808']);
    },
  },
  // an ossuary walker: a tall thing of bone, a skull and ribs on two long legs; it raises its arms
  walker: {
    size: 0.85, lift: 0, heat: 0.8,
    art(p, f) {
      bones(p, f, '#d8c8a8', '#8a7a60', '#ff5030', false);
    },
  },
  abbot: {
    size: 0.95, lift: 0, heat: 0.9,
    art(p, f) {
      bones(p, f, '#e8dcc0', '#7a5a8a', '#c060ff', true);
    },
  },
  // the hum: a knot of dark smoke with violet eyes (only warm-seeing eyes ever find it)
  hum: {
    size: 0.8, lift: 0.15, heat: 0.9,
    art(p, f) {
      const w = f === 1 ? 1 : 0;
      for (let k = 0; k < 7; k++) disc(p, 16 + Math.sin(k * 2.1 + w) * 7, 16 + Math.cos(k * 1.7 + w) * 6, 5 + (k % 3), k % 2 ? '#241830' : '#3a2848');
      disc(p, 16, 16, 7, '#120a18');
      const e = f === 2 ? '#ffffff' : '#c080ff';
      rect(p, 12, 14, 2, 2, e);
      rect(p, 18, 14, 2, 2, e);
    },
  },
  // a mimic: a reliquary box that was never a module; teeth, a tongue, an eye in the lid
  mimic: {
    size: 0.55, lift: 0, heat: 0.5,
    art(p, f) {
      const gape = f === 2 ? 6 : f === 1 ? 3 : 2;
      rect(p, 6, 18, 20, 12, '#6a4428');
      rect(p, 6, 18, 20, 2, '#c08040');
      rect(p, 6, 28, 20, 2, '#3a2214');
      rect(p, 6, 18 - gape - 8, 20, 8, '#7a5030');
      rect(p, 6, 18 - gape - 8, 20, 2, '#d09050');
      rect(p, 7, 18 - gape, 18, gape, '#200808');
      for (let x = 7; x < 25; x += 3) {
        p(x, 18 - gape, '#f0e8d0');
        p(x + 1, 17, '#f0e8d0');
      }
      if (f === 2) rect(p, 14, 18 - gape + 1, 4, gape + 2, '#d03050');
      disc(p, 16, 18 - gape - 4, 2, '#f0e0a0');
      p(16, 18 - gape - 4, '#200808');
    },
  },
  // the choir warden: a mite grown huge and haloed, purple carapace; elite of the nave
  warden: {
    size: 0.8, lift: 0, heat: 0.8,
    art(p, f) {
      const s = both(p);
      ring(p, 16, 7, 6, '#f0d080');
      for (let k = 0; k < 3; k++) line(s, 9, 20 + k * 3 + (f === 1 && k === 1 ? 1 : 0), 2, 26 + k * 2, '#3a2040');
      ell(p, 16, 21, 9, 8, '#5a3070');
      ell(p, 16, 19, 6, 5, '#8a50a0');
      rect(p, 15, 13, 2, 15, '#2a1830');
      disc(p, 16, 13, 4.5, '#4a2858');
      s(13, 12, '#ffd040');
      s(14, 13, '#ffd040');
      const open = f === 2 ? 4 : 1;
      line(s, 13, 16, 13 - open, 18 + open, '#f0e0c0');
    },
  },
  // the furnace saint: a burning figure, arms wide, a halo of fire
  saint: {
    size: 0.95, lift: 0, heat: 1,
    art(p, f) {
      const s = both(p);
      const flick = f === 1 ? 1 : 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + flick * 0.3;
        line(p, 16 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, 16 + Math.cos(a) * (8 + (k % 2) * 2), 8 + Math.sin(a) * (8 + (k % 2) * 2), k % 2 ? '#ffd060' : '#ff7020');
      }
      ring(p, 16, 8, 5, '#ffe080');
      disc(p, 16, 8, 3, '#401808');
      s(15, 8, f === 2 ? '#ffffff' : '#ff9030');
      rect(p, 12, 12, 8, 14, '#702010');
      rect(p, 13, 12, 6, 12, '#a03818');
      ell(p, 16, 30, 7 + flick, 2, '#ff8030');
      const arm = f === 2 ? -6 : 0;
      line(s, 12, 14, 5, 20 + arm, '#a03818');
      line(s, 11, 14, 4, 20 + arm, '#702010');
      s(4, 19 + arm, '#ffe080');
      rect(p, 14, 20, 4, 3, '#ffd060');
    },
  },
};

function ring(p: Px, cx: number, cy: number, r: number, c: string) {
  for (let k = 0; k < 48; k++) p(Math.round(cx + Math.cos((k / 48) * Math.PI * 2) * r - 0.5), Math.round(cy + Math.sin((k / 48) * Math.PI * 2) * r - 0.5), c);
}

/** a seraph: rays, a wheel, an eye; colours [rays, wheel, iris, flare, pupil] */
function wheel(p: Px, f: number, [ray, rim, iris, flare, pupil]: string[]) {
  const turn = f === 1 ? 0.2 : 0;
  const len = f === 2 ? 15 : 13;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + turn;
    line(p, 16 + Math.cos(a) * 6, 16 + Math.sin(a) * 6, 16 + Math.cos(a) * (k % 2 ? len - 3 : len), 16 + Math.sin(a) * (k % 2 ? len - 3 : len), ray);
  }
  ring(p, 16, 16, 7, rim);
  ring(p, 16, 16, 6.4, rim);
  disc(p, 16, 16, 5, f === 2 ? flare : iris);
  disc(p, 16, 16, 2, f === 2 ? flare : pupil);
}

/** a bone walker; the abbot wears a mitre */
function bones(p: Px, f: number, bone: string, shade: string, eye: string, mitre: boolean) {
  const s = both(p);
  const step = f === 1 ? 2 : 0;
  // legs
  for (const d of [0, 1]) {
    line(p, 13 + d, 20, 11 + d - step, 31, d ? bone : shade);
    line(p, 18 + d, 20, 20 + d + step, 31, d ? shade : bone);
  }
  // pelvis and spine
  rect(p, 11, 19, 10, 3, bone);
  rect(p, 14, 10, 4, 10, shade);
  // ribs: a cage, filled dark between
  ell(p, 16, 14, 5, 4, '#2a2018');
  for (let k = 0; k < 4; k++) {
    line(s, 15, 11 + k * 2, 10 + k * 0.5, 12 + k * 2, bone);
  }
  // arms: down, or raised to strike
  if (f === 2) {
    line(s, 11, 10, 6, 3, bone);
    line(s, 10, 10, 5, 3, bone);
    line(s, 6, 3, 5, 1, shade);
  } else {
    line(s, 11, 10, 8, 18, bone);
    line(s, 10, 10, 7, 18, bone);
    line(s, 8, 18, 8, 22, shade);
  }
  // skull
  disc(p, 16, 6, 4, bone);
  rect(p, 14, 9, 4, 2, bone);
  s(14, 6, '#100808');
  s(13, 6, '#100808');
  s(14, 6, eye);
  p(15, 9, '#100808');
  p(16, 9, '#100808');
  if (mitre) {
    for (let y = 0; y < 4; y++) rect(p, 13 + (y >> 1), y - 1, 6 - (y >> 1) * 2, 1, shade);
    p(16, 0, '#f0d080');
  }
}

export interface Frames {
  /** idle 0, idle 1, attack, hit flash */
  color: HTMLCanvasElement[];
  /** the same frames as white silhouettes */
  mask: HTMLCanvasElement[];
}

/** draw a type's four frames (and masks); a dark outline goes round every opaque pixel */
export function frames(def: SpriteDef): Frames {
  const color: HTMLCanvasElement[] = [];
  const mask: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const grid: (string | 0)[] = new Array(SIZE * SIZE).fill(0);
    def.art((x, y, c) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y * SIZE + x] = c;
    }, f === 3 ? 0 : f);
    const out: (string | 0)[] = grid.slice();
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        if (grid[y * SIZE + x]) continue;
        const touch = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const xx = x + dx, yy = y + dy;
          return xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE && grid[yy * SIZE + xx];
        });
        if (touch) out[y * SIZE + x] = '#0a0807';
      }
    const c = paint(out, f === 3 ? '#ffffff' : null);
    const m = paint(out, '#ffffff');
    color.push(c);
    mask.push(m);
  }
  return { color, mask };
}

function paint(grid: (string | 0)[], solid: string | null): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d')!;
  for (let i = 0; i < grid.length; i++) {
    const c = grid[i];
    if (!c) continue;
    ctx.fillStyle = solid ?? c;
    ctx.fillRect(i % SIZE, Math.floor(i / SIZE), 1, 1);
  }
  return cv;
}

/** a ring of dust for a death: frame k of 4 grows and thins */
export function puff(k: number, c: string): HTMLCanvasElement {
  const grid: (string | 0)[] = new Array(SIZE * SIZE).fill(0);
  const r = 4 + k * 3;
  for (let a = 0; a < 24; a++) {
    if ((a + k) % (k + 1)) continue;
    const t = (a / 24) * Math.PI * 2;
    for (let d = 0; d < 2; d++) {
      const x = Math.round(16 + Math.cos(t) * (r - d));
      const y = Math.round(16 + Math.sin(t) * (r - d) * 0.8);
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y * SIZE + x] = c;
    }
  }
  return paint(grid, null);
}

/** test runs (?still): a sheet of every enemy's frames, for judging the art */
if (/[?&]still/.test(globalThis.location?.search ?? ''))
  (globalThis as unknown as { thawSheet?: () => HTMLElement }).thawSheet = () => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#100d0c;padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;color:#d8c8b0;font:18px VT323,monospace';
    for (const [type, def] of Object.entries(SPRITES)) {
      const box = document.createElement('div');
      box.textContent = type;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px';
      const f = frames(def);
      for (const cv of [...f.color, f.mask[0]]) {
        cv.style.cssText = 'width:72px;height:72px;image-rendering:pixelated;background:#2a201c';
        row.append(cv);
      }
      box.append(row);
      el.append(box);
    }
    document.body.append(el);
    return el;
  };
