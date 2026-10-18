// The sight slice: camera windows. Each camera renders the world at its own resolution and fps,
// then its filter decides what the pixels mean: color, gray, 1bit (ordered dither), heat (warm
// things through walls), sonar (distance bands and a pulse), edge (outlines). Every camera also
// takes noise (static, torn rows), lag (ghost trails, s) and blur (px). Scanners and lamps live
// next door (scanner.ts, lamp.ts).

import { ENEMIES, say } from '../core/game';
import { Cell, cell, ensure } from '../core/grid';
import { active, family, MODS, param } from '../core/mods';
import type { Game } from '../core/types';
import { addItem, exec, verb } from '../core/verbs';
import { frameHooks } from '../ui';
import { view } from '../ui/views';
import { near, see, shoot, type Mode } from './scene';
import { engaged } from './foes';
import './lamp';
import './scanner';
import { clean } from '../tune/start';

/** the facing as a compass word, and the turn to its left and right */
export const WORDS = ['n', 'e', 's', 'w'];
export const facing = (dir: number) => ((Math.round(dir / (Math.PI / 2)) % 4) + 4) % 4;

// every eye can turn you and step you forward once your legs answer (Maks 10-18: the camera alone
// told him nothing about where he was facing)
family('camera', {
  buttons: (g) => {
    if (!active(g, 'gait').some((i) => param(i, 'go', false))) return [];
    const f = facing(g.player.dir);
    return [
      { label: '◀ turn', cmd: `face ${WORDS[(f + 3) % 4]}` },
      { label: '▲ step', cmd: `go ${WORDS[f]} 1` },
      { label: 'turn ▶', cmd: `face ${WORDS[(f + 1) % 4]}` },
    ];
  },
});

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

/** quantize to `levels` steps with a 4x4 ordered dither */
const q = (v: number, levels: number, x: number, y: number) => {
  const s = 255 / (levels - 1);
  return Math.max(0, Math.min(255, Math.round(v / s + BAYER[(y & 3) * 4 + (x & 3)]) * s));
};

/** a cheap eye's auto-gain: the frame's bright end (the 92nd percentile of luminance) is lifted
 * to `to`, at most `max` times; a dark chamber reads dim but whole instead of black (tuning #1328) */
export function expose(px: Uint8Array, res: number, to = 210, max = 6): void {
  const hist = new Uint32Array(256);
  for (let i = 0; i < res * res; i++) hist[Math.round(px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11)]++;
  let n = 0, top = 255;
  for (let v = 255; v >= 0; v--) if ((n += hist[v]) > res * res * 0.08) { top = v; break; }
  const gain = Math.min(max, to / Math.max(1, top));
  if (gain <= 1) return;
  for (let i = 0; i < res * res * 4; i++) if ((i & 3) !== 3) px[i] = Math.min(255, px[i] * gain);
}

/** the few colours a cheap colour eye has: picked in this order from the dusk palette, so 4 colours
 * are shadow, cream, rust, slate (Maks 10-17: amber, rust, slate, cream) */
const DUSK = [0x0a0807, 0xe2b47c, 0x84492a, 0x6a6c78, 0x2e2e36, 0xc4823e, 0x52301c, 0xf0e4c8].map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);

export type Filter = (px: Uint8Array, res: number, opts: { colors: number; noise: number; t: number; range?: number }) => void;
export const FILTERS: Record<string, Filter> = {
  color(px, res, { colors }) {
    // full colour eyes lift a dark frame a little too (10-18: the first corridor read as black)
    if (!colors) return expose(px, res, 200, 2.5);
    expose(px, res);
    if (colors <= DUSK.length) {
      // nearest palette colour after a Bayer nudge: flat areas stay one colour, edges cross-hatch
      const pal = DUSK.slice(0, Math.max(2, colors));
      for (let i = 0; i < res * res; i++) {
        const t = BAYER[((i / res) & 3) * 4 + (i % res & 3)] * 56;
        let best = 0, bd = Infinity;
        for (let k = 0; k < pal.length; k++) {
          const d = 3 * (px[i * 4] + t - pal[k][0]) ** 2 + 4 * (px[i * 4 + 1] + t - pal[k][1]) ** 2 + 2 * (px[i * 4 + 2] + t - pal[k][2]) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
        for (let c = 0; c < 3; c++) px[i * 4 + c] = pal[best][c];
      }
      return;
    }
    const levels = Math.max(2, Math.round(Math.cbrt(colors)) + 1);
    for (let i = 0; i < res * res; i++) {
      const x = i % res, y = (i / res) | 0;
      for (let c = 0; c < 3; c++) px[i * 4 + c] = q(px[i * 4 + c], levels, x, y);
    }
  },
  gray(px, res, { colors }) {
    const levels = colors || 16;
    expose(px, res);
    // a tiny eye can't afford dither: at 24 px the cross-hatch drowns the walls, so it posterizes
    // flat (walls, floor and the dark of an opening each one grey) and only bigger eyes dither
    const flat = res < 48 && levels > 2;
    for (let i = 0; i < res * res; i++) {
      const x = i % res, y = (i / res) | 0;
      const l = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = flat ? Math.round(Math.round((l / 255) * (levels - 1)) * (255 / (levels - 1))) : q(l, Math.max(2, levels), x, y);
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

/** what an eye shows while it warms up or sits off: static, faint when off, filling in as it warms
 * (Maks 10-18: a fresh eye showing plain black read as broken) */
export function staticFrame(px: Uint8Array, res: number, level: number, rand = Math.random): void {
  for (let i = 0; i < res * res; i++) {
    const v = rand() < 0.5 ? 0 : Math.round((0.35 + rand() * 0.65) * 255 * level);
    px[i * 4] = v;
    px[i * 4 + 1] = Math.round(v * 0.85);
    px[i * 4 + 2] = Math.round(v * 0.7);
    px[i * 4 + 3] = 255;
  }
}

/** a frame with no light in it at all: a failed read, never a real view (the body always glows) */
export const blank = (px: Uint8Array): boolean => {
  for (let i = 0; i < px.length; i += 4) if (px[i] | px[i + 1] | px[i + 2]) return false;
  return true;
};

view('camera', (el, inst, g) => {
  const res = Math.round(param<number>(inst, 'res', 32));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  canvas.className = 'eye';
  const label = document.createElement('div');
  label.className = 'facing';
  // the frame flashes red when you are hit; an arrow on the edge points at what is after you
  const frame = document.createElement('div');
  frame.style.cssText = 'position:relative;line-height:0';
  const arrow = document.createElement('div');
  arrow.className = 'foe-arrow';
  arrow.style.cssText = 'position:absolute;display:none;color:#ff5a3c;font-size:22px;line-height:1;padding:2px 4px;background:#000a;pointer-events:none;white-space:nowrap';
  frame.append(canvas, arrow);
  el.append(label, frame);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(res, res);
  const prev = new Float32Array(res * res * 4);
  let next = 0;
  let shown = false;
  let held = false;
  return {
    update(g) {
      const warm = inst.on && g.t >= inst.readyAt;
      const f = !inst.on ? 'off' : !warm ? 'warming up…' : 'facing ' + ['north', 'east', 'south', 'west'][facing(g.player.dir)];
      if (label.textContent !== f) label.textContent = f;
      const hurt = g.t - g.player.hurtAt < 0.3;
      canvas.style.outline = hurt ? '3px solid #e03828' : '';
      canvas.style.outlineOffset = hurt ? '-3px' : '';
      pointAt(g, arrow, param<number>(inst, 'fov', 60), MODES[param<string>(inst, 'filter', 'color')] === 'heat');
      if (!warm) {
        // static instead of black: faint when off, brighter as the warm-up runs out
        const d = MODS[inst.mod]?.warm || 1;
        const level = inst.on ? 0.25 + 0.5 * Math.min(1, Math.max(0, 1 - (inst.readyAt - g.t) / d)) : 0.12;
        staticFrame(img.data as unknown as Uint8Array, res, level);
        ctx.putImageData(img, 0, 0);
        shown = false;
        next = 0;
        return;
      }
      if (g.t < next) return;
      const step = 1 / param<number>(inst, 'fps', 1);
      next = g.t + step;
      const range = param<number>(inst, 'range', 8);
      const name = param<string>(inst, 'filter', 'color');
      const px = shoot(g, { res, fov: param<number>(inst, 'fov', 60), range, mode: MODES[name] ?? 'color' });
      see(g, range);
      // a failed read (a lost GL context, a frame the GPU dropped) comes back all zero: hold the
      // last good frame for one read only, never longer (Maks 10-18: held frames froze an eye)
      if (!MODES[name] && blank(px) && shown && !held) {
        held = true;
        return;
      }
      held = false;
      const filter = FILTERS[name] ?? FILTERS.color;
      const noise = param<number>(inst, 'noise', 0);
      if (!MODES[name]) addBlur(px, res, Math.round(param<number>(inst, 'blur', 0)));
      filter(px, res, { colors: param<number>(inst, 'colors', 0), noise, t: g.t, range });
      addNoise(px, res, noise);
      addLag(px, prev, param<number>(inst, 'lag', 0), step);
      img.data.set(px);
      ctx.putImageData(img, 0, 0);
      shown = true;
    },
  };
  void g;
});

/** the edge arrow: the nearest enemy after you outside this eye's view: left, right or behind */
function pointAt(g: Game, el: HTMLElement, fov: number, heat: boolean): void {
  const p = g.player;
  // its bearing from your facing, -pi..pi, positive to the right
  const bearing = (e: { x: number; y: number }) => {
    const a = Math.atan2(e.x - p.x, -(e.y - p.y)) - p.dir;
    return Math.atan2(Math.sin(a), Math.cos(a));
  };
  const half = (fov / 2) * (Math.PI / 180);
  const foe = engaged(g, 7, heat).find((e) => Math.abs(bearing(e)) > half);
  let text = '';
  let pos = '';
  if (foe) {
    const rel = bearing(foe);
    const name = (ENEMIES[foe.enemy!.type]?.name ?? 'it').replace(/^(a|an|the) /, '').split(' ').pop();
    if (Math.abs(rel) > Math.PI * 0.75) [text, pos] = [`▼ ${name} behind`, 'left:50%;bottom:4px;transform:translateX(-50%)'];
    else if (rel > half) [text, pos] = [`${name} ▶`, 'right:4px;top:50%;transform:translateY(-50%)'];
    else [text, pos] = [`◀ ${name}`, 'left:4px;top:50%;transform:translateY(-50%)'];
  }
  const key = text + pos;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
  el.style.left = el.style.right = el.style.top = el.style.bottom = el.style.transform = '';
  if (pos) for (const kv of pos.split(';')) {
    const [k, v] = kv.split(':');
    el.style.setProperty(k, v);
  }
}

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

/** ?scene=sight: a staged look for judging the slice: six eyes and senses on, three cells from the
 * nearest choir mite, facing it, halo lit, the spark finger on for when they come */
export function stageSight(g: Game): void {
  clean(g);
  ensure(g, g.player.x, g.player.y, 3);
  const foe = g.ents.filter((e) => e.enemy).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
  const p = g.player;
  p.slots = 8;
  p.core = 12;
  for (const id of ['saints-lens', 'ember-iris', 'lattice-eye', 'bat-psalter', 'heat-choir', 'halo', 'spark-finger']) {
    addItem(g, { kind: 'mod', mod: id });
    exec(g, `install ${MODS[id].name}`);
  }
  if (!foe) return;
  const steps: [number, number][] = [[0, 3], [0, -3], [3, 0], [-3, 0], [0, 2], [0, -2], [2, 0], [-2, 0]];
  const [dx, dy] = steps.find(([dx, dy]) => cell(g, foe.x + dx, foe.y + dy) === Cell.floor && cell(g, foe.x + dx / 2, foe.y + dy / 2) === Cell.floor) ?? [0, 0.8];
  p.x = foe.x + dx;
  p.y = foe.y + dy;
  p.dir = Math.atan2(-dx, dy);
}

let staged = false;
frameHooks.push((g) => {
  if (staged || !/[?&]scene=sight/.test(globalThis.location?.search ?? '')) return;
  staged = true;
  stageSight(g);
});
