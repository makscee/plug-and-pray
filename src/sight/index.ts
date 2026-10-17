// The sight slice: camera windows. Each camera renders the world at its own resolution and fps,
// then its filter decides what the pixels mean. The spine ships color, gray and 1bit with ordered
// dither; heat, sonar, edge, scanners and lamps come with the sight slice.

import { family, param } from '../core/mods';
import { view } from '../ui/views';
import { see, shoot } from './scene';

family('camera', {});

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

/** quantize to `levels` steps with a 4x4 ordered dither */
const q = (v: number, levels: number, x: number, y: number) => {
  const s = 255 / (levels - 1);
  return Math.max(0, Math.min(255, Math.round(v / s + BAYER[(y & 3) * 4 + (x & 3)]) * s));
};

export type Filter = (px: Uint8Array, res: number, opts: { colors: number; noise: number; t: number }) => void;
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
};

view('camera', (el, inst, g) => {
  const res = Math.round(param<number>(inst, 'res', 32));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  canvas.className = 'eye';
  el.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(res, res);
  let next = 0;
  return {
    update(g) {
      const warm = inst.on && g.t >= inst.readyAt;
      if (!warm) {
        if (!inst.on) ctx.clearRect(0, 0, res, res);
        return;
      }
      if (g.t < next) return;
      next = g.t + 1 / param<number>(inst, 'fps', 1);
      const range = param<number>(inst, 'range', 8);
      const px = shoot(g, { res, fov: param<number>(inst, 'fov', 60), range });
      const filter = FILTERS[param<string>(inst, 'filter', 'color')] ?? FILTERS.color;
      filter(px, res, { colors: param<number>(inst, 'colors', 0), noise: param<number>(inst, 'noise', 0), t: g.t });
      img.data.set(px);
      ctx.putImageData(img, 0, 0);
      see(g, range);
    },
  };
  void g;
});
