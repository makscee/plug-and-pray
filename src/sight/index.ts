// The sight slice: camera windows. Each camera renders the world at its own resolution and fps,
// then its filter decides what the pixels mean: color, gray, 1bit (ordered dither), heat (warm
// things through walls), sonar (distance bands and a pulse), edge (outlines). Every camera also
// takes noise (static, torn rows), lag (ghost trails, s) and blur (px). Scanners and lamps live
// next door (scanner.ts, lamp.ts).

import { say } from '../core/game';
import { family, MODS, param } from '../core/mods';
import { addItem, verb } from '../core/verbs';
import { view } from '../ui/views';
import { near, see, shoot, type Mode } from './scene';
import './lamp';
import './scanner';

family('camera', {});

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

/** quantize to `levels` steps with a 4x4 ordered dither */
const q = (v: number, levels: number, x: number, y: number) => {
  const s = 255 / (levels - 1);
  return Math.max(0, Math.min(255, Math.round(v / s + BAYER[(y & 3) * 4 + (x & 3)]) * s));
};

export type Filter = (px: Uint8Array, res: number, opts: { colors: number; noise: number; t: number; range?: number }) => void;
export const FILTERS: Record<string, Filter> = {
  color(px, res, { colors }) {
    if (!colors) return;
    const levels = Math.max(2, Math.round(Math.cbrt(colors)) + 1);
    for (let i = 0; i < res * res; i++) {
      const x = i % res, y = (i / res) | 0;
      for (let c = 0; c < 3; c++) px[i * 4 + c] = q(px[i * 4 + c], levels, x, y);
    }
  },
  gray(px, res, { colors }) {
    const levels = colors || 16;
    for (let i = 0; i < res * res; i++) {
      const x = i % res, y = (i / res) | 0;
      // brightened: the dark world needs it on a cheap eye
      const l = Math.min(255, (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) * 1.3);
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = q(l, Math.max(2, levels), x, y);
    }
  },
  '1bit'(px, res, o) {
    FILTERS.gray(px, res, { ...o, colors: 2 });
  },
  /** heat arrives already cold and warm (scene mode heat): a ramp black, violet, red, amber, white */
  heat(px, res, { colors }) {
    const levels = colors || 8;
    for (let i = 0; i < res * res; i++) {
      const x = i % res, y = (i / res) | 0;
      const l = q(Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]), levels, x, y) / 255;
      const [r, g, b] = heatRamp(l);
      px[i * 4] = r;
      px[i * 4 + 1] = g;
      px[i * 4 + 2] = b;
    }
  },
  /** sonar arrives as distance (scene mode depth): bands of distance, a pulse running out, no colour */
  sonar(px, res, { colors, t, range = 8 }) {
    const levels = colors || 6;
    // a pulse runs out from you, 5 cells a second, and starts again past the range
    const pulse = (t * 5) % (range + 2);
    for (let i = 0; i < res * res; i++) {
      const n = near(px, i);
      if (!n) {
        px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 0;
        continue;
      }
      const d = (1 - n) * range;
      // one band per cell of distance, its near edge a bright line
      let v = Math.round(n * (levels - 1)) / (levels - 1);
      v = v * (d % 1 < 0.12 ? 0.9 : 0.55);
      if (Math.abs(d - pulse) < 0.35) v = Math.min(1, v + 0.45);
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = Math.round(v * 255);
    }
  },
  /** edge arrives as distance: a pixel is lit where the distance jumps (an outline), else dark */
  edge(px, res, { range = 8 }) {
    // on a flat face 1/distance runs straight across the screen: where it bends (a crease) or
    // jumps (an edge in front of a far thing), draw a line
    const inv = new Float32Array(res * res);
    for (let i = 0; i < res * res; i++) {
      const n = near(px, i);
      inv[i] = n ? 1 / Math.max(0.05, (1 - n) * range) : 0;
    }
    const at = (x: number, y: number) => inv[Math.min(res - 1, Math.max(0, y)) * res + Math.min(res - 1, Math.max(0, x))];
    // a crease's bend shrinks with the lens's focal length in pixels (about 0.65 res)
    const min = 1 / (2 * 0.65 * res);
    for (let y = 0; y < res; y++)
      for (let x = 0; x < res; x++) {
        const c = at(x, y);
        const lx = Math.abs(at(x + 1, y) + at(x - 1, y) - 2 * c);
        const ly = Math.abs(at(x, y + 1) + at(x, y - 1) - 2 * c);
        const v = c > 0 && x > 0 && y > 0 && x < res - 1 && y < res - 1 && Math.max(lx, ly) > min + c * 0.004 ? 255 : 0;
        const i = (y * res + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = v;
      }
  },
};

/** which scene mode a filter needs */
export const MODES: Record<string, Mode> = { heat: 'heat', sonar: 'depth', edge: 'depth' };

export function heatRamp(l: number): [number, number, number] {
  const stops: [number, number, number][] = [[0, 0, 0], [40, 10, 70], [170, 20, 30], [240, 140, 20], [255, 250, 220]];
  const t = Math.max(0, Math.min(1, l)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(t));
  const f = t - k;
  return [0, 1, 2].map((c) => Math.round(stops[k][c] * (1 - f) + stops[k + 1][c] * f)) as [number, number, number];
}

/** static: each pixel jitters by up to `amount`, and now and then a row slips sideways */
export function addNoise(px: Uint8Array, res: number, amount: number, rand = Math.random): void {
  if (amount <= 0) return;
  for (let i = 0; i < res * res; i++) {
    const n = (rand() - 0.5) * amount * 160;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, px[i * 4 + c] + n));
  }
  for (let y = 0; y < res; y++) {
    if (rand() > amount * 0.15) continue;
    const row = px.slice(y * res * 4, (y + 1) * res * 4);
    const sh = Math.round((rand() - 0.5) * res * amount * 0.3) * 4;
    for (let x = 0; x < res * 4; x++) px[y * res * 4 + x] = row[(x - sh + res * 400) % (res * 4)];
  }
}

/** ghost trails: what was bright fades over `lag` seconds instead of vanishing (keeps prev in place) */
export function addLag(px: Uint8Array, prev: Float32Array, lag: number, dt: number): void {
  if (lag <= 0) return;
  const keep = Math.exp(-dt / lag);
  for (let i = 0; i < px.length; i++) {
    if ((i & 3) === 3) continue;
    const v = Math.max(px[i], prev[i] * keep);
    prev[i] = v;
    px[i] = v;
  }
}

/** a soft box blur, `r` px each way: the slow colour eyes see in smears */
export function addBlur(px: Uint8Array, res: number, r: number): void {
  if (r <= 0) return;
  const src = px.slice();
  for (let y = 0; y < res; y++)
    for (let x = 0; x < res; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0, n = 0;
        for (let j = -r; j <= r; j++)
          for (let i = -r; i <= r; i++) {
            const xx = Math.min(res - 1, Math.max(0, x + i));
            const yy = Math.min(res - 1, Math.max(0, y + j));
            s += src[(yy * res + xx) * 4 + c];
            n++;
          }
        px[(y * res + x) * 4 + c] = s / n;
      }
}

view('camera', (el, inst, g) => {
  const res = Math.round(param<number>(inst, 'res', 32));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  canvas.className = 'eye';
  el.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(res, res);
  const prev = new Float32Array(res * res * 4);
  let next = 0;
  return {
    update(g) {
      const warm = inst.on && g.t >= inst.readyAt;
      if (!warm) {
        if (!inst.on) ctx.clearRect(0, 0, res, res);
        return;
      }
      if (g.t < next) return;
      const step = 1 / param<number>(inst, 'fps', 1);
      next = g.t + step;
      const range = param<number>(inst, 'range', 8);
      const name = param<string>(inst, 'filter', 'color');
      const px = shoot(g, { res, fov: param<number>(inst, 'fov', 60), range, mode: MODES[name] ?? 'color' });
      const filter = FILTERS[name] ?? FILTERS.color;
      const noise = param<number>(inst, 'noise', 0);
      if (!MODES[name]) addBlur(px, res, Math.round(param<number>(inst, 'blur', 0)));
      filter(px, res, { colors: param<number>(inst, 'colors', 0), noise, t: g.t, range });
      addNoise(px, res, noise);
      addLag(px, prev, param<number>(inst, 'lag', 0), step);
      img.data.set(px);
      ctx.putImageData(img, 0, 0);
      see(g, range);
    },
  };
  void g;
});

/** test runs only (?still): put a module in your inventory, so a play-through can try every eye */
verb('conjure', {
  help: 'test runs only: conjure <module id>',
  when: () => /[?&]still/.test(globalThis.location?.search ?? ''),
  run(g, args) {
    const id = args.join('-');
    if (!MODS[id]) return say(g, `no module ${id}.`);
    addItem(g, { kind: 'mod', mod: id });
    say(g, `conjured ${MODS[id].name}.`);
  },
});
