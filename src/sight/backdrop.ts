// The screen behind the windows (v2-view, Maks 10-18 ~10:50: "make it the background of the screen by default ...
// on the very start you only have a map ... radar could render on top of map to show dots update as scanner spins").
// What it shows is layers.ts's plan:
//   map     no eye yet: your best map fills the screen, you in the middle, and a click on it walks you there.
//           Every radar sweeps round you; its dots light as the sweep passes and fade until it comes round again
//   static  an eye warming up and none warm: static, filling in
//   view    the base eye's picture, full screen at its own low resolution, upscaled crisp; each other eye on adds
//           its layer over it on its own canvas (heat, sonar, outlines, scripture), and the radars' dots and a
//           colour eye's vein glints are drawn over that. An arrow on the edge points at what is after you.
// One shot per eye per its own frame (the base every frame while the reins are taken), so it stays cheap.

import { cell, clear, veinOf } from '../core/grid';
import { def, MODS, param } from '../core/mods';
import { cells, say } from '../core/game';
import { verb } from '../core/verbs';
import type { Game, Inst } from '../core/types';
import { frameHooks } from '../ui';
import { consoleAt, mapBack, resettle, TOP } from '../ui/windows';
import { hintTargets } from '../ui/maptips';
import { bestMap, bigMapOpen, closeBigMap, toggleBigMap } from '../ui/bigmap';
import { mapView, MARK_INK } from '../world/mind';
import type { View } from '../ui/views';
import { eyeRange } from '../mods/sense';
import { perk } from '../mods/uniques';
import { radars } from '../mods/radar';
import { marks } from './know';
import { firstSight } from './codex';
import { near, shoot } from './scene';
import { HOLLOW } from './marks';
import { secrets } from '../world/secrets';
import { bossRoom } from '../world/floors';
import { bossesNear } from '../fight/bosses';
import { addBlur, addLag, addNoise, blank, creases, FILTERS, foeOutside, heatRamp, MODES, staticFrame } from './index';
import { baseLook, fovAcross, plan, rowsOf, shownLayers, turnLayers, type Layer } from './layers';
import { bigOn, reins } from '../body/fps';
import './backdrop.css';

interface Pic {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  w: number;
  h: number;
  /** game time of the next frame, and of the last (a hit since then flashes) */
  next: number;
  last: number;
  prev?: Float32Array;
}
interface Bd {
  g: Game;
  root: HTMLElement;
  mapBox: HTMLElement;
  map: { view: View; inst: Inst } | null;
  base: Pic | null;
  /** the eye the base canvas shows */
  baseOf: number;
  layers: Map<number, Pic>;
  over: HTMLCanvasElement;
  oc: CanvasRenderingContext2D;
  tag: HTMLElement;
  /** vein glints a colour layer eye sees: cells, refreshed at its own fps */
  glints: { x: number; y: number; res: string }[];
  glintNext: number;
  /** which windows the screen lets show (the map's, all): a change lays them out again */
  shown: string;
  /** the overlay has something on it */
  drawn: boolean;
  /** v2r2 ux: the map fading out over the first eye's static (performance.now() it is gone by) */
  fadeUntil: number;
  /** a boss fight was on last frame */
  boss: boolean;
}
let bd: Bd | null = null;

/** what the screen shows: 'map' | 'static' | 'view' (the tests and the CSS read it off body) */
export let mode: 'map' | 'static' | 'view' = 'map';

function canvas(cls: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = cls;
  return c;
}

function make(g: Game): Bd {
  document.getElementById('backdrop')?.remove();
  const root = document.createElement('div');
  root.id = 'backdrop';
  const mapBox = document.createElement('div');
  mapBox.className = 'bd-map';
  const over = canvas('bd-over');
  const tag = document.createElement('div');
  tag.className = 'bd-tag';
  root.append(mapBox, over, tag);
  document.body.prepend(root);
  return { g, root, mapBox, map: null, base: null, baseOf: -1, layers: new Map(), over, oc: over.getContext('2d')!, tag, glints: [], glintNext: 0, shown: '', drawn: true, fadeUntil: 0, boss: false };
}

/** a picture canvas w×h (made again when the size changes), placed under the overlay */
function pic(b: Bd, have: Pic | null | undefined, w: number, h: number, cls: string): Pic {
  if (have && have.w === w && have.h === h && have.cv.isConnected) return have;
  have?.cv.remove();
  const cv = canvas(cls);
  cv.width = w;
  cv.height = h;
  b.root.insertBefore(cv, b.over);
  const ctx = cv.getContext('2d')!;
  return { cv, ctx, img: ctx.createImageData(w, h), w, h, next: 0, last: -99 };
}

/** the picture's width for `h` rows: the screen's shape */
const across = (h: number) => Math.max(h, Math.round((h * innerWidth) / Math.max(1, innerHeight)));

frameHooks.push((g) => {
  if (!bd || bd.g !== g || !bd.root.isConnected) {
    bd?.root.remove();
    bd = make(g);
  }
  const b = bd;
  const t0 = performance.now();
  const pl = plan(g);
  mode = pl.base ? 'view' : pl.warming ? 'static' : 'map';
  if (document.body.dataset.view !== mode) document.body.dataset.view = mode;
  // the map window shown again, or the windows back from the reins: laid out where they cover nothing
  const shown = `${mode === 'map'}:${bigOn(g)}`;
  if (b.shown !== shown) {
    if (b.shown) requestAnimationFrame(resettle);
    b.shown = shown;
  }
  // v2r2 ux: the first eye is a moment, not a loss: the map fades into the eye's static, then the edge flashes
  // gold and one line says what happened (once a run)
  if (mode !== 'map' && b.map && !leftMap.has(g)) {
    leftMap.add(g);
    b.fadeUntil = performance.now() + 1400;
  }
  const fading = mode !== 'map' && performance.now() < b.fadeUntil;
  b.mapBox.hidden = mode !== 'map' && !fading;
  // a boss wakes: the map comes back out of the dock (it outranks everything in a boss fight)
  // (v2r4 run: the body's class can still be the last life's on a wake-again: ask this game too)
  const boss = document.body.classList.contains('boss-on') && bossesNear(g).some((e) => e.enemy!.data.noticed);
  if (boss && !b.boss) {
    requestAnimationFrame(mapBack);
    // v2r2 fight: on floors 1 and 2 a coarse eye can hide the keeper: the big map comes up once, its radar dots the fight
    const f = g.floor ?? 0;
    const coarse = !pl.base || rowsOf(pl.base) < 64 || param<string>(pl.base, 'filter', 'color') !== 'color';
    // v2r3 fight: with no map module too (map modules are rare in floor 1-2 kits): the room as you have seen it
    if (f <= 1 && coarse && !mappedOn(g).has(f) && !bigOn(g) && !bigMapOpen()) {
      mappedOn(g).add(f);
      const own = !!bestMap(g);
      // no map of your own: the room you fight in, its walls known (you stand in it)
      if (!own) {
        const [x0, y0, x1, y1] = bossRoom(g.seed, f);
        for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) g.seen.add(`${x},${y}`);
      }
      toggleBigMap(g, true);
      say(g, own ? 'the keeper wakes. your map comes up big, so you can see it move: m or esc puts it away.' : 'the keeper wakes. the room comes up as a map, so you can see it move: esc puts it away.');
    }
  }
  if (!boss && b.boss && bigMapOpen() && mappedOn(g).has(g.floor ?? 0)) closeBigMap();
  b.boss = boss;
  b.mapBox.classList.toggle('bd-fade', fading);
  if (mode === 'view' && !firstView.has(g)) {
    firstView.add(g);
    if (!g.floor) {
      pl.base!.data.flashAt = g.t;
      say(g, `◆ first sight. coarse and close, but yours; it sharpens as you find better eyes. the map stays: M, and a click on it still walks you.`);
    }
  }
  if (mode === 'map' || fading) drawMap(g, b);
  else if (b.map) {
    b.map.view.dispose?.();
    b.map = null;
    b.mapBox.replaceChildren();
  }
  // the base picture
  if (mode === 'static') {
    const h = rowsOf(pl.warming!);
    const w = across(h);
    b.base = pic(b, b.base, w, h, 'eye bd-base');
    b.baseOf = -1;
    const d = MODS[pl.warming!.mod]?.warm || 1;
    const level = 0.25 + 0.5 * Math.min(1, Math.max(0, 1 - (pl.warming!.readyAt - g.t) / d));
    staticFrame(b.base.img.data as unknown as Uint8Array, h, level, Math.random, w);
    b.base.ctx.putImageData(b.base.img, 0, 0);
  } else if (mode === 'view') drawBase(g, b, pl.base!);
  if (b.base) b.base.cv.hidden = mode === 'map';
  // the layers: one canvas each, the rest hidden
  const keep = new Set<number>();
  if (mode === 'view')
    for (const { inst, layer } of shownLayers(g, pl.layers)) {
      if (layer === 'glint') glintsOf(g, b, inst, pl.base!);
      if (layer === 'glint' || layer === 'rest') continue;
      keep.add(inst.uid);
      drawLayer(g, b, inst, layer, pl.base!);
    }
  for (const [uid, l] of b.layers)
    if (!keep.has(uid)) {
      l.cv.remove();
      b.layers.delete(uid);
    }
  if (mode !== 'view' || !shownLayers(g, pl.layers).some((l) => l.layer === 'glint')) b.glints = [];
  overlay(g, b, pl.base);
  tag(g, b, pl.base, pl.layers.filter((l) => l.layer !== 'rest').length);
  cost = cost * 0.9 + (performance.now() - t0) * 0.1;
});

/** per run: the screen has left the map once (the fade), and shown a view once (the line) */
const leftMap = new WeakSet<Game>();
/** the floors whose keeper the big map came up for (once a floor) */
const bigMapped = new WeakMap<Game, Set<number>>();
const mappedOn = (g: Game): Set<number> => bigMapped.get(g) ?? (bigMapped.set(g, new Set()), bigMapped.get(g)!);
const firstView = new WeakSet<Game>();

/** the screen's cost a frame, ms (smoothed): the test hook reads it */
let cost = 0;
(globalThis as unknown as { backdropCost: () => number }).backdropCost = () => cost;

// ---- map mode

/** the map's cells across and down, and px a cell: its span fills the screen's height */
function mapSize(inst: Inst): [number, number, number] {
  const span = Math.round(param<number>(inst, 'span', 33));
  const px = Math.max(12, Math.floor(innerHeight / span));
  const rows = Math.ceil(innerHeight / px) | 1;
  const cols = Math.ceil(innerWidth / px) | 1;
  return [cols, rows, px];
}

function drawMap(g: Game, b: Bd): void {
  const inst = bestMap(g);
  if (b.map && b.map.inst !== inst) {
    b.map.view.dispose?.();
    b.map = null;
    b.mapBox.replaceChildren();
  }
  if (!inst) return;
  // v2r2 ux: you sit at 40% of the height, so the console hides less of what lies south
  if (!b.map) b.map = { inst, view: mapView(b.mapBox, inst, g, undefined, { size: () => mapSize(inst), hz: 20, at: 0.4 }) };
  b.map.view.update(g, 0);
}

/** where world (x, y) sits on the screen-filling map, from its canvas's own top-left cell */
function onMap(b: Bd, x: number, y: number): [number, number] | null {
  const c = b.mapBox.querySelector<HTMLCanvasElement>('canvas.map');
  if (!c || !b.map) return null;
  const px = mapSize(b.map.inst)[2];
  const r = c.getBoundingClientRect();
  return [r.left + (x - Number(c.dataset.ox)) * px, r.top + (y - Number(c.dataset.oy)) * px];
}

// ---- the base view

function drawBase(g: Game, b: Bd, inst: Inst): void {
  const h = rowsOf(inst);
  const w = across(h);
  const fresh = b.baseOf !== inst.uid;
  if (fresh) b.base?.cv.remove();
  b.base = pic(b, fresh ? null : b.base, w, h, 'eye bd-base');
  b.baseOf = inst.uid;
  const p = b.base;
  // the reins taken: every frame, so the mouse turns a live view; else at the eye's own fps
  const step = bigOn(g) ? 0 : 1 / Math.max(1, param<number>(inst, 'fps', 1));
  if (!fresh && g.t < p.next) return;
  p.next = g.t + step;
  const range = eyeRange(g, inst);
  const name = param<string>(inst, 'filter', 'color');
  const px = shoot(g, { res: h, w, fov: fovAcross(inst), range, mode: MODES[name] ?? 'color', hidden: name === 'sonar' || name === 'heat' || perk(inst) === 'hidden', filter: name, xray: perk(inst) === 'xray', since: p.last });
  p.last = g.t;
  if (firstSight(g, inst, range)) inst.data.flashAt = g.t;
  // a failed read (a lost GL context) comes back all zero: keep the last frame for this one read
  if (!MODES[name] && blank(px) && !fresh) return;
  if (!MODES[name]) addBlur(px, h, Math.round(param<number>(inst, 'blur', 0)), w);
  // v2r2 fight: a noisy eye steadies with a foe after you near (the carrion eye hid the bell at 5 cells)
  const noise = engagedWithin(g, 6) ? 0 : param<number>(inst, 'noise', 0);
  const look = baseLook(inst);
  (FILTERS[look.filter] ?? FILTERS.color)(px, h, { colors: look.colors, noise, t: g.t, range, w });
  addNoise(px, h, noise, Math.random, w);
  const lag = param<number>(inst, 'lag', 0);
  if (lag > 0) {
    if (!p.prev || p.prev.length !== px.length) p.prev = new Float32Array(px.length);
    addLag(px, p.prev, lag, step || 1 / 60);
  }
  p.img.data.set(px);
  p.ctx.putImageData(p.img, 0, 0);
}

// ---- layers: each eye's own look, transparent where it has nothing to add

/** each layer's own ink, so they read apart: heat its ramp, sonar cyan, outlines bone green, scripture white */
const SONAR = [96, 224, 255];
const EDGE = [214, 240, 170];
const SCRIPT = [255, 255, 255];

function drawLayer(g: Game, b: Bd, inst: Inst, layer: Layer, base: Inst): void {
  const h = rowsOf(inst);
  const w = across(h);
  const p = pic(b, b.layers.get(inst.uid), w, h, `bd-layer bd-${layer}`);
  b.layers.set(inst.uid, p);
  if (g.t < p.next) return;
  p.next = g.t + 1 / Math.max(1, param<number>(inst, 'fps', 1));
  const range = eyeRange(g, inst);
  // fused with the base view: the same fov, so a layer sits on what it marks
  const fov = fovAcross(base);
  const out = p.img.data;
  out.fill(0);
  if (firstSight(g, inst, range)) inst.data.flashAt = g.t;
  if (layer === 'heat') {
    const px = shoot(g, { res: h, w, fov, range, mode: 'heat', hidden: true, filter: 'heat', since: p.last });
    const levels = param<number>(inst, 'colors', 0) || 8;
    for (let i = 0; i < w * h; i++) {
      const l = Math.round((Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) / 255) * (levels - 1)) / (levels - 1);
      if (l < 0.25) continue;
      // warm, never white: red to amber, so a blob reads as heat on any base
      const [r, gg, bb] = heatRamp(0.42 + 0.4 * l);
      out[i * 4] = r;
      out[i * 4 + 1] = gg;
      out[i * 4 + 2] = bb;
      out[i * 4 + 3] = Math.min(200, 80 + l * 120);
    }
  } else if (layer === 'sonar' || layer === 'edge') {
    const px = shoot(g, { res: h, w, fov, range, mode: 'depth', hidden: layer === 'sonar', filter: layer, since: p.last });
    const rim = creases(px, h, range, w);
    const pulse = (g.t * 5) % (range + 2);
    const ink = layer === 'sonar' ? SONAR : EDGE;
    for (let i = 0; i < w * h; i++) {
      const n = near(px, i);
      let a = 0;
      if (layer === 'sonar' && px[i * 4 + 2] >= HOLLOW) a = Math.sin(g.t * 9 - (1 - n) * range * 5 + ((i / w) | 0) * 0.9) > 0 ? 250 : 110;
      else if (rim[i]) a = layer === 'sonar' ? 120 + 120 * n : 220;
      else if (layer === 'sonar' && n && Math.abs((1 - n) * range - pulse) < 0.3) a = 70;
      if (!a) continue;
      out[i * 4] = ink[0];
      out[i * 4 + 1] = ink[1];
      out[i * 4 + 2] = ink[2];
      out[i * 4 + 3] = a;
    }
  } else if (layer === 'script') {
    // what only black & white shows (scratched scripture, a mimic's breath): the shot with them less the shot without
    const p0 = g.player;
    const any = secrets(g).some((s) => s.kind === 'script' && !s.done && Math.hypot(s.x + 0.5 - p0.x, s.y + 0.5 - p0.y) < range + 1) || g.ents.some((e) => e.data?.mimic && Math.hypot(e.x - p0.x, e.y - p0.y) < range);
    if (any) {
      const a = shoot(g, { res: h, w, fov, range, mode: 'color', filter: '1bit' });
      const z = shoot(g, { res: h, w, fov, range, mode: 'color', filter: 'gray' });
      for (let i = 0; i < w * h; i++) {
        const d = Math.abs(a[i * 4] - z[i * 4]) + Math.abs(a[i * 4 + 1] - z[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - z[i * 4 + 2]);
        if (d < 60) continue;
        const lit = a[i * 4] + a[i * 4 + 1] + a[i * 4 + 2] > 300;
        out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = lit ? SCRIPT[0] : 20;
        out[i * 4 + 3] = 235;
      }
    }
  }
  p.last = g.t;
  p.ctx.putImageData(p.img, 0, 0);
}

/** the veins a colour layer eye sees: wall cells of ore within its range with a clear line to their face */
function glintsOf(g: Game, b: Bd, inst: Inst, base: Inst): void {
  if (g.t < b.glintNext) return;
  b.glintNext = g.t + 1 / Math.min(6, Math.max(1, param<number>(inst, 'fps', 1)));
  const p = g.player;
  const R = Math.ceil(eyeRange(g, inst));
  const half = ((fovAcross(base) / 2 + 6) * Math.PI) / 180;
  const out: { x: number; y: number; res: string }[] = [];
  for (let y = Math.floor(p.y) - R; y <= Math.floor(p.y) + R; y++)
    for (let x = Math.floor(p.x) - R; x <= Math.floor(p.x) + R; x++) {
      const res = veinOf(cell(g, x, y));
      if (!res) continue;
      // the nearest point of its face, a hair out of the wall
      const cx = Math.max(x, Math.min(x + 1, p.x)), cy = Math.max(y, Math.min(y + 1, p.y));
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d > R || d < 0.2) continue;
      let a = Math.atan2(cx - p.x, -(cy - p.y)) - p.dir;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > half) continue;
      const [fx, fy] = [cx + ((p.x - cx) / d) * 0.05, cy + ((p.y - cy) / d) * 0.05];
      if (clear(g, p.x, p.y, fx, fy)) out.push({ x: fx, y: fy, res });
    }
  b.glints = out;
}

// ---- the overlay: radar sweeps and dots, glints, the edge arrow, the first-sight flash

/** world (x, y) at height `up` (0 floor, 1 ceiling) on the screen, through a view `fov` degrees across; null behind you */
export function project(g: Game, x: number, y: number, up: number, fov: number, W: number, H: number): [number, number, number] | null {
  const p = g.player;
  const dx = x - p.x, dz = y - p.y;
  const fwd = dx * Math.sin(p.dir) - dz * Math.cos(p.dir);
  if (fwd < 0.15) return null;
  const right = dx * Math.cos(p.dir) + dz * Math.sin(p.dir);
  const focal = W / 2 / Math.tan((fov * Math.PI) / 360);
  return [W / 2 + (right / fwd) * focal, H / 2 - ((up - 0.5) / fwd) * focal, fwd];
}

/** where a radar's sweep points now (radians, 0 north, clockwise), and how far past a bearing it is (0..1 of a turn) */
const sweepAt = (g: Game, inst: Inst): number => (((g.t % sweepT(inst)) / sweepT(inst)) * Math.PI * 2);
const sweepT = (inst: Inst): number => Math.max(0.8, Math.min(4, param<number>(inst, 'every', 2)));
const past = (sweep: number, bearing: number): number => ((((sweep - bearing) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
/** a radar's own ink: the kind of thing it finds */
const INK: Record<string, string> = { thing: MARK_INK.thing, cache: MARK_INK.cache, vein: MARK_INK.vein, life: MARK_INK.life, deep: MARK_INK.stairs };

function overlay(g: Game, b: Bd, base: Inst | null): void {
  const W = innerWidth, H = innerHeight;
  if (b.over.width !== W || b.over.height !== H) [b.over.width, b.over.height] = [W, H];
  const c = b.oc;
  const p = g.player;
  const rs = radars(g);
  // nothing to draw now and nothing drawn last frame: leave the canvas be (a full-screen clear is not free)
  const busy = mode === 'map' || rs.length || b.glints.length || engagedNear(g) || g.player.installed.some((i) => g.t - ((i.data.flashAt as number) ?? -99) < 1.6);
  if (!busy && !b.drawn) return;
  b.drawn = !!busy;
  c.clearRect(0, 0, W, H);
  if (mode === 'map') {
    const me = onMap(b, p.x, p.y);
    if (!me) {
      c.fillStyle = '#7a6a5a';
      c.font = '22px VT323, monospace';
      c.textAlign = 'center';
      const warming = g.player.installed.some((i) => i.on && param<string>(i, 'what', '') === 'map');
      c.fillText(warming ? 'the map warms…' : g.player.installed.length ? 'no eye and no map: you are blind. install one.' : 'you wake blind. install your kit: the map will be your sight.', W / 2, H * 0.4);
      return;
    }
    chevrons(g, b, c, W);
    const px = mapSize(b.map!.inst)[2];
    for (const r of rs) {
      const ink = INK[param<string>(r, 'finds', '')] ?? MARK_INK.thing;
      const R = Math.min(Math.hypot(W, H), param<number>(r, 'range', 10) * px);
      const a = sweepAt(g, r);
      // the reach, faint, and the arm with a fading wake behind it
      c.strokeStyle = ink;
      c.globalAlpha = 0.18;
      c.lineWidth = 1;
      c.setLineDash([4, 6]);
      c.beginPath();
      c.arc(me[0], me[1], R, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      for (let k = 0; k < 14; k++) {
        const t = a - k * 0.035;
        c.globalAlpha = 0.5 * (1 - k / 14);
        c.lineWidth = k ? 2 : 2.5;
        c.beginPath();
        c.moveTo(me[0], me[1]);
        c.lineTo(me[0] + Math.sin(t) * R, me[1] - Math.cos(t) * R);
        c.stroke();
      }
      c.globalAlpha = 1;
      for (const m of marks(g)) {
        if (m.by !== r.mod) continue;
        const at = onMap(b, m.x, m.y);
        if (!at) continue;
        const since = past(a, Math.atan2(m.x - p.x, -(m.y - p.y)));
        dot(c, at[0], at[1], m.kind === 'life' ? Math.max(4, px * 0.3) : Math.max(3, px * 0.22), MARK_INK[m.kind], since, m.kind === 'life');
      }
    }
    return;
  }
  if (mode !== 'view' || !base) return;
  const fov = fovAcross(base);
  // radar dots through the walls, lit as the sweep passes; the sweep a faint line where it crosses your view
  for (const r of rs) {
    const a = sweepAt(g, r);
    let rel = a - p.dir;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const ink = INK[param<string>(r, 'finds', '')] ?? MARK_INK.thing;
    if (Math.abs(rel) < (fov * Math.PI) / 360) {
      const x = W / 2 + Math.tan(rel) * (W / 2 / Math.tan((fov * Math.PI) / 360));
      c.strokeStyle = ink;
      c.globalAlpha = 0.22;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, H * 0.3);
      c.lineTo(x, H * 0.7);
      c.stroke();
      c.globalAlpha = 1;
    }
    for (const m of marks(g)) {
      if (m.by !== r.mod) continue;
      const at = project(g, m.x, m.y, m.kind === 'life' ? 0.45 : 0.25, fov, W, H);
      if (!at || at[0] < -20 || at[0] > W + 20) continue;
      const since = past(a, Math.atan2(m.x - p.x, -(m.y - p.y)));
      dot(c, at[0], at[1], Math.max(4, Math.min(14, 40 / at[2])), MARK_INK[m.kind], since, true);
    }
  }
  // a colour layer eye: veins glint in their ore's colour, a twinkle each
  for (const v of b.glints) {
    const at = project(g, v.x, v.y, 0.5, fov, W, H);
    if (!at) continue;
    const tw = 0.5 + 0.5 * Math.sin(g.t * 5 + v.x * 1.7 + v.y * 2.3);
    const s = Math.max(4, Math.min(12, 30 / at[2])) * (0.6 + 0.6 * tw);
    c.strokeStyle = GLINT[v.res] ?? '#fff';
    c.globalAlpha = 0.5 + 0.5 * tw;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(at[0] - s, at[1]);
    c.lineTo(at[0] + s, at[1]);
    c.moveTo(at[0], at[1] - s);
    c.lineTo(at[0], at[1] + s);
    c.stroke();
    c.globalAlpha = 1;
  }
  // what is after you outside the view: an arrow on that edge
  const out = foeOutside(g, fov, param<string>(base, 'filter', 'color') === 'heat' || [...b.layers.keys()].some((uid) => g.player.installed.find((i) => i.uid === uid && param<string>(i, 'filter', '') === 'heat')));
  if ((b.root.dataset.arrow ?? '') !== (out?.text ?? '')) b.root.dataset.arrow = out?.text ?? '';
  if (out) {
    c.font = '24px VT323, monospace';
    const tw = c.measureText(out.text).width;
    const [x, y] = out.side === 'behind' ? [W / 2 - tw / 2, Math.round(H * 0.58)] : out.side === 'right' ? [W - tw - 300, H / 2] : [300, H / 2];
    c.fillStyle = '#000b';
    c.fillRect(x - 6, y - 20, tw + 12, 26);
    c.fillStyle = '#ff5a3c';
    c.textAlign = 'left';
    c.fillText(out.text, x, y);
  }
  // a first sight or a secret found: the screen's edge flashes gold, a few times
  const flashAt = Math.max(...g.player.installed.filter((i) => def(i).family === 'camera').map((i) => (i.data.flashAt as number) ?? -99), -99);
  const since = g.t - flashAt;
  if (since >= 0 && since < 1.5 && Math.floor(since / 0.25) % 2 === 0) {
    c.strokeStyle = '#e2b47c';
    c.lineWidth = 4;
    c.strokeRect(2, 2, W - 4, H - 4);
  }
}

/** a foe after you within r cells */
const engagedWithin = (g: Game, r: number): boolean => g.ents.some((e) => e.enemy?.data.noticed && Math.hypot(e.x - g.player.x, e.y - g.player.y) < r);

/** anything after you near enough for the edge arrow to name */
const engagedNear = (g: Game): boolean => g.ents.some((e) => e.enemy?.data.noticed && Math.abs(e.x - g.player.x) < 8 && Math.abs(e.y - g.player.y) < 8);

const GLINT: Record<string, string> = { bone: '#d8c8a8', glass: '#7fe8e0', copper: '#ff9a48', ichor: '#ff3858' };

/** a radar dot: bright as the sweep passes (since 0), fading to a glow until it comes round */
function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, since: number, glow: boolean): void {
  const a = Math.max(0.15, 1 - since * 1.1);
  c.globalAlpha = a;
  if (glow) {
    c.fillStyle = ink;
    c.globalAlpha = a * 0.35;
    c.beginPath();
    c.arc(x, y, r * 2.2, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = a;
  }
  c.fillStyle = '#000';
  c.beginPath();
  c.arc(x, y, r + 1.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = ink;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  // a ping ring right after the sweep crosses it
  if (since < 0.12) {
    c.strokeStyle = ink;
    c.lineWidth = 1.5;
    c.globalAlpha = 1 - since / 0.12;
    c.beginPath();
    c.arc(x, y, r + 4 + since * 120, 0, Math.PI * 2);
    c.stroke();
  }
  c.globalAlpha = 1;
}

// ---- the chevrons: what the goal and `where` point at, off the open part of the map

/** v2r2 ux: the goal's ◆ lay under the console or off the screen. Each hint target outside the part of the map no
 *  window covers (left of the panels, under the goal line, above the console) gets a chevron on that part's edge,
 *  pointing at it, with its name and how far */
function chevrons(g: Game, b: Bd, c: CanvasRenderingContext2D, W: number): void {
  const me = onMap(b, g.player.x, g.player.y);
  if (!me) return;
  const con = document.querySelector<HTMLElement>('.win-console')?.getBoundingClientRect();
  const [l, t, r, bt] = [14, TOP + 14, W - 284 - 14, (con && con.height ? con.top : consoleAt()[1]) - 14];
  c.font = '18px VT323, monospace';
  for (const tg of hintTargets(g)) {
    const at = onMap(b, tg.x, tg.y);
    if (!at || (at[0] >= l && at[0] <= r && at[1] >= t && at[1] <= bt)) continue;
    // where the line from you to it leaves the open part
    const [dx, dy] = [at[0] - me[0], at[1] - me[1]];
    const k = Math.min(1, dx > 0 ? (r - me[0]) / dx : dx < 0 ? (l - me[0]) / dx : 1, dy > 0 ? (bt - me[1]) / dy : dy < 0 ? (t - me[1]) / dy : 1);
    const [x, y] = [me[0] + dx * k, me[1] + dy * k];
    const a = Math.atan2(dy, dx);
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = '#f0a050';
    c.strokeStyle = '#000';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(9, 0);
    c.lineTo(-7, -9);
    c.lineTo(-3, 0);
    c.lineTo(-7, 9);
    c.closePath();
    c.stroke();
    c.fill();
    c.restore();
    const txt = `◆ ${tg.name.replace(/^(a|an|the) /, '')} ${cells(Math.round(Math.hypot(tg.x - g.player.x, tg.y - g.player.y)))}`;
    const tw = c.measureText(txt).width;
    // the label inward of the chevron, kept inside the open part
    const lx = Math.max(l, Math.min(r - tw, x - Math.cos(a) * 26 - tw / 2));
    const ly = Math.max(t + 12, Math.min(bt - 4, y - Math.sin(a) * 22 + 5));
    c.fillStyle = 'rgba(10, 8, 7, 0.88)';
    c.fillRect(lx - 4, ly - 14, tw + 8, 18);
    c.fillStyle = '#f0a050';
    c.textAlign = 'left';
    c.fillText(txt, lx, ly);
  }
}

// ---- the tag in the corner: what the screen is, and the reins' mode

function tag(g: Game, b: Bd, base: Inst | null, all: number): void {
  const r = reins(g);
  let t: string;
  let cls = '';
  // v2r2 ux: what is layered stays said, the reins text beside it
  const n = mode === 'view' ? all : 0;
  const more = n ? ` · +${n} layer${n > 1 ? 's' : ''}${n > 2 ? ' (2 shown, L turns)' : ''}` : '';
  if (r) {
    const on = bigOn(g);
    t = (on ? '◉ reins · tab: cursor' : '○ cursor · tab or click the view: reins') + more;
    cls = on ? 'reins' : 'cursor';
  } else if (mode === 'map') t = b.map ? 'no eye: the map is your sight · click to walk' : 'no eye, no map';
  else if (mode === 'static') t = 'an eye warms up…';
  else t = `${def(base!).name} · ${rowsOf(base!)} px${more}`;
  if (b.tag.textContent !== t) b.tag.textContent = t;
  if (b.tag.className !== `bd-tag ${cls}`) b.tag.className = `bd-tag ${cls}`;
}

// v2r2 ux: three or more layers were noise; two draw at once and this turns which
verb('layers', {
  help: 'with three or more layer eyes on, show the next two of them over the view (key l)',
  when: (g) => plan(g).layers.filter((l) => l.layer !== 'rest').length > 2,
  whenFail: () => 'layers: fewer than three layer eyes are on; they all show already.',
  run(g) {
    turnLayers(g);
    const pl = plan(g);
    const names = shownLayers(g, pl.layers).map((l) => `${def(l.inst).name} (${l.layer})`);
    say(g, `the view now layers: ${names.join(' and ')}.`);
  },
});
