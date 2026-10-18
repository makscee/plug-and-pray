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
import { near, shoot, type Mode } from './scene';
import { HOLLOW } from './marks';
import { eyeRange } from '../mods/sense';
import { perk } from '../mods/uniques';
import { engaged } from './foes';
import './lamp';
import './scanner';
import './variety';
import { firstSight } from './codex';
import { clean } from '../tune/start';
import './fps';
import { plan, type Layer } from './layers';
import './backdrop';

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
export function expose(px: Uint8Array, res: number, to = 210, max = 6, w = res): void {
  const N = w * res;
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) hist[Math.round(px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11)]++;
  let n = 0, top = 255;
  for (let v = 255; v >= 0; v--) if ((n += hist[v]) > N * 0.08) { top = v; break; }
  const gain = Math.min(max, to / Math.max(1, top));
  if (gain <= 1) return;
  for (let i = 0; i < N * 4; i++) if ((i & 3) !== 3) px[i] = Math.min(255, px[i] * gain);
}

/** the few colours a cheap colour eye has: picked in this order from the dusk palette, so 4 colours
 * are shadow, cream, rust, slate (Maks 10-17: amber, rust, slate, cream) */
const DUSK = [0x0a0807, 0xe2b47c, 0x84492a, 0x6a6c78, 0x2e2e36, 0xc4823e, 0x52301c, 0xf0e4c8].map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);

/** res is the picture's height; opts.w its width (v2-view: the wide backdrop), else it is square */
export type Filter = (px: Uint8Array, res: number, opts: { colors: number; noise: number; t: number; range?: number; w?: number }) => void;
export const FILTERS: Record<string, Filter> = {
  color(px, res, { colors, w = res }) {
    // full colour eyes lift a dark frame a little too (10-18: the first corridor read as black)
    if (!colors) return expose(px, res, 200, 2.5, w);
    expose(px, res, 210, 6, w);
    if (colors <= DUSK.length) {
      // nearest palette colour after a Bayer nudge: flat areas stay one colour, edges cross-hatch
      const pal = DUSK.slice(0, Math.max(2, colors));
      for (let i = 0; i < w * res; i++) {
        const t = BAYER[((i / w) & 3) * 4 + (i % w & 3)] * 56;
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
    for (let i = 0; i < w * res; i++) {
      const x = i % w, y = (i / w) | 0;
      for (let c = 0; c < 3; c++) px[i * 4 + c] = q(px[i * 4 + c], levels, x, y);
    }
  },
  gray(px, res, { colors, w = res }) {
    const levels = colors || 16;
    expose(px, res, 210, 6, w);
    // a tiny eye can't afford dither: at 24 px the cross-hatch drowns the walls, so it posterizes
    // flat (walls, floor and the dark of an opening each one grey) and only bigger eyes dither
    const flat = res < 48 && levels > 2;
    for (let i = 0; i < w * res; i++) {
      const x = i % w, y = (i / w) | 0;
      const l = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = flat ? Math.round(Math.round((l / 255) * (levels - 1)) * (255 / (levels - 1))) : q(l, Math.max(2, levels), x, y);
    }
  },
  '1bit'(px, res, o) {
    FILTERS.gray(px, res, { ...o, colors: 2 });
  },
  /** heat arrives already cold and warm (scene mode heat): a ramp black, violet, red, amber, white */
  heat(px, res, { colors, w = res }) {
    const levels = colors || 8;
    for (let i = 0; i < w * res; i++) {
      const x = i % w, y = (i / w) | 0;
      const l = q(Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]), levels, x, y) / 255;
      const [r, g, b] = heatRamp(l);
      px[i * 4] = r;
      px[i * 4 + 1] = g;
      px[i * 4 + 2] = b;
    }
  },
  /** sonar arrives as distance: walls come back as echoes (their creases and edges bright, a band per
   *  cell of distance), a pulse running out, a hollow wall ringing; no colour */
  sonar(px, res, { colors, t, range = 8, w = res }) {
    const levels = colors || 6;
    // a pulse runs out from you, 5 cells a second, and starts again past the range
    const pulse = (t * 5) % (range + 2);
    const rim = creases(px, res, range, w);
    // nose to a wall: a flat face has no creases and no bands, so it came back one flat grey (playtest r2).
    // The song bounces straight back instead: rings run out from the middle across whatever is that close
    const mid = near(px, (res >> 1) * w + (w >> 1));
    const close = mid > 0 && (1 - mid) * range < 1;
    for (let i = 0; i < w * res; i++) {
      const n = near(px, i);
      if (close && n && (1 - n) * range < 1.3 && px[i * 4 + 2] < HOLLOW) {
        const r = Math.hypot((i % w) - w / 2, ((i / w) | 0) - res / 2) / res;
        if (Math.sin(r * 38 - t * 10) > 0.35) {
          px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = Math.round(((Math.round(0.85 * (levels - 1)) / (levels - 1)) * 255));
          continue;
        }
      }
      if (!n) {
        px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 0;
        continue;
      }
      const d = (1 - n) * range;
      // a dim fill that is brighter near, a faint line each cell of distance, the walls' edges bright
      let v = n * n * 0.4;
      if (d % 1 < 0.12) v += 0.2 * n;
      if (rim[i]) v = Math.max(v, 0.5 + 0.5 * n);
      if (Math.abs(d - pulse) < 0.35) v = Math.min(1, v + 0.45);
      // a hollow wall (marks.ts) rings: bright bars running across it
      if (px[i * 4 + 2] >= HOLLOW) v = Math.sin(t * 9 - d * 5 + ((i / w) | 0) * 0.9) > 0 ? 1 : 0.3 + 0.3 * n;
      v = Math.round(Math.min(1, v) * (levels - 1)) / (levels - 1);
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = Math.round(v * 255);
    }
  },
  /** edge arrives as distance: a pixel is lit where the distance jumps (an outline), else dark */
  edge(px, res, { range = 8, w = res }) {
    const rim = creases(px, res, range, w);
    for (let i = 0; i < w * res; i++) px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = rim[i] ? 255 : 0;
  },
};

/** where a depth shot creases or jumps: 1 per pixel on an outline. On a flat face 1/distance runs
 *  straight across the screen; where it bends (a crease) or jumps (an edge in front of a far thing), a line */
export function creases(px: Uint8Array, res: number, range: number, w = res): Uint8Array {
  const inv = new Float32Array(w * res);
  for (let i = 0; i < w * res; i++) {
    const n = near(px, i);
    inv[i] = n ? 1 / Math.max(0.05, (1 - n) * range) : 0;
  }
  const at = (x: number, y: number) => inv[Math.min(res - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  // a crease's bend shrinks with the lens's focal length in pixels (about 0.65 res)
  const min = 1 / (2 * 0.65 * res);
  const out = new Uint8Array(w * res);
  for (let y = 1; y < res - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const c = at(x, y);
      const lx = Math.abs(at(x + 1, y) + at(x - 1, y) - 2 * c);
      const ly = Math.abs(at(x, y + 1) + at(x, y - 1) - 2 * c);
      if (c > 0 && Math.max(lx, ly) > min + c * 0.004) out[y * w + x] = 1;
    }
  return out;
}

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
export function addNoise(px: Uint8Array, res: number, amount: number, rand = Math.random, w = res): void {
  if (amount <= 0) return;
  for (let i = 0; i < w * res; i++) {
    const n = (rand() - 0.5) * amount * 160;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, px[i * 4 + c] + n));
  }
  for (let y = 0; y < res; y++) {
    if (rand() > amount * 0.15) continue;
    const row = px.slice(y * w * 4, (y + 1) * w * 4);
    const sh = Math.round((rand() - 0.5) * w * amount * 0.3) * 4;
    for (let x = 0; x < w * 4; x++) px[y * w * 4 + x] = row[(x - sh + w * 400) % (w * 4)];
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
export function addBlur(px: Uint8Array, res: number, r: number, w = res): void {
  if (r <= 0) return;
  const src = px.slice();
  for (let y = 0; y < res; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0, n = 0;
        for (let j = -r; j <= r; j++)
          for (let i = -r; i <= r; i++) {
            const xx = Math.min(w - 1, Math.max(0, x + i));
            const yy = Math.min(res - 1, Math.max(0, y + j));
            s += src[(yy * w + xx) * 4 + c];
            n++;
          }
        px[(y * w + x) * 4 + c] = s / n;
      }
}

/** what an eye shows while it warms up or sits off: static, faint when off, filling in as it warms
 * (Maks 10-18: a fresh eye showing plain black read as broken) */
export function staticFrame(px: Uint8Array, res: number, level: number, rand = Math.random, w = res): void {
  for (let i = 0; i < w * res; i++) {
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

/** what an eye on adds to the screen, in its window (v2-view: the eyes draw behind the windows, src/sight/backdrop.ts) */
const ROLE: Record<Layer, string> = {
  heat: 'layer: warm things glow through the walls',
  sonar: 'layer: walls ring as lines; hollow ones sing',
  edge: 'layer: every thing outlined',
  glint: 'layer: veins glint in their ore\'s colour',
  script: 'layer: scripture on the walls',
  rest: 'resting: a sharper eye is your view',
};

// v2-view (Maks 10-18 ~10:50): an eye's window holds no picture any more, only what it is doing: your view behind
// the windows, or the layer it adds over it, and its facing; its buttons (turn, step) stay
view('camera', (el, inst) => {
  const label = document.createElement('div');
  label.className = 'facing';
  const role = document.createElement('div');
  role.className = 'eye-role';
  el.append(label, role);
  return {
    update(g) {
      const warm = inst.on && g.t >= inst.readyAt;
      const f = !inst.on ? 'off' : !warm ? 'warming up…' : 'facing ' + ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][((Math.round(g.player.dir / (Math.PI / 4)) % 8) + 8) % 8];
      if (label.textContent !== f) label.textContent = f;
      const pl = plan(g);
      const lay = pl.layers.find((l) => l.inst === inst);
      const r = !warm ? (inst.on ? 'it will be your view once warm' : 'switch it on to see through it') : pl.base === inst ? 'your view: it fills the screen behind the windows' : lay ? ROLE[lay.layer] : '';
      if (role.textContent !== r) role.textContent = r;
      role.dataset.base = String(pl.base === inst);
      // a first sight or a secret found flashes the window gold, gently, a few times (codex.ts, world/secrets.ts)
      const since = g.t - ((inst.data.flashAt as number) ?? -99);
      const flash = since >= 0 && since < 1.5 && Math.floor(since / 0.25) % 2 === 0;
      const win = el.closest<HTMLElement>('.win');
      if (win) win.style.outline = flash ? '2px solid #e2b47c' : '';
    },
  };
});

/** the edge arrow: the nearest enemy after you outside a view `fov` degrees across: its words and side
 *  (left, right or behind), or null */
export function foeOutside(g: Game, fov: number, heat: boolean): { text: string; side: 'left' | 'right' | 'behind' } | null {
  const p = g.player;
  // its bearing from your facing, -pi..pi, positive to the right
  const bearing = (e: { x: number; y: number }) => {
    const a = Math.atan2(e.x - p.x, -(e.y - p.y)) - p.dir;
    return Math.atan2(Math.sin(a), Math.cos(a));
  };
  const half = (fov / 2) * (Math.PI / 180);
  const foe = engaged(g, 7, heat).find((e) => Math.abs(bearing(e)) > half);
  if (!foe) return null;
  const rel = bearing(foe);
  const name = (ENEMIES[foe.enemy!.type]?.name ?? 'it').replace(/^(a|an|the) /, '').split(' ').pop();
  if (Math.abs(rel) > Math.PI * 0.75) return { text: `▼ ${name} behind`, side: 'behind' };
  return rel > half ? { text: `${name} ▶`, side: 'right' } : { text: `◀ ${name}`, side: 'left' };
}

/** test runs only (?still): put a module in your inventory, so a play-through can try every eye */
verb('conjure', {
  help: 'test runs only: conjure <module id>',
  when: () => /[?&]still/.test(globalThis.location?.search ?? ''),
  run(g, args) {
    const id = args.join('-');
    if (!id) return say(g, 'conjure what? conjure <module id>, e.g. conjure card-reader');
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



