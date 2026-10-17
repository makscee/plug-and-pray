// MAP (DESIGN 3, 5, 9): the filesystem forest, and from `drive` on the terrain layer.

import { km, save, tok, where } from '../model';
import type { Line, Token, World } from '../model';
import * as windows from '../windows';
import { renderLine, tokenEl } from '../term/render';
import { CHAR, LINE, fit, placeLabels } from './labels';

/** the forest: one tree per machine (your root, then every mounted drive), drawn from what was listed */
export function forest(w: World): HTMLElement {
  const el = document.createElement('div');
  el.className = 'forest';
  const s = w.state;
  const roots = ['/', ...s.mounted];
  for (const r of roots) {
    const lines: Line[] = [];
    const walk = (id: string, pre: string, last: boolean, top: boolean) => {
      const n = w.nodes[id];
      lines.push(top ? [r === '/' ? 'T  /' : '', ...(r === '/' ? [] : [tok(w, n)])] : [pre + (last ? '└ ' : '├ '), tok(w, n)]);
      const kids = (n.children ?? []).filter((c) => s.listed.includes(c));
      if (!s.listed.includes(id)) return;
      kids.forEach((c, i) => walk(c, top ? '' : pre + (last ? '  ' : '│ '), i === kids.length - 1, false));
    };
    walk(r, '', true, true);
    const tree = document.createElement('div');
    tree.className = 'tree';
    for (const l of lines) tree.append(renderLine(l));
    el.append(tree);
  }
  return el;
}

/** the MAP body for the layer in state, with the forest/terrain toggle in the title once drive is known */
export function mapView(w: World): HTMLElement {
  const s = w.state;
  const title = windows.win('map').querySelector('.title') as HTMLElement;
  title.replaceChildren('MAP');
  if (s.layer === 'terrain' || s.bar.includes('drive') || s.places.length > 1) {
    for (const layer of ['forest', 'terrain'] as const) {
      const el = document.createElement('span');
      el.textContent = layer;
      el.dataset.tok = layer;
      // a view toggle, not a command: it never types into TERM
      if (layer === s.layer) el.className = 'layer on';
      else {
        el.className = 'tok layer';
        el.onclick = () => {
          s.layer = layer;
          save(w);
          windows.update('map', mapView(w));
        };
      }
      title.append('  ', el);
    }
  }
  if (s.layer !== 'terrain') return forest(w);
  return terrain(w, s.places, s.trip ? [...s.path, where(w)] : s.path);
}

const SIZE = 300;
/** km seen around every visited place and along the path */
const SEEN = 0.8;
const NS = 'http://www.w3.org/2000/svg';
let maskId = 0;

export type TerrainEl = HTMLElement & { track?: (path: [number, number][]) => void };

function svg(name: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.append(el);
  return el;
}

/** the terrain layer: you at the center (the trip's start while driving), fog over the unseen, a seen
 *  disc around every visited place and along the path, known places as labeled dots with distances.
 *  `path` ends at where you are; `track(path)` moves you along it without redrawing the labels. */
export function terrain(w: World, places: string[], path: [number, number][]): TerrainEl {
  const s = w.state;
  const at = (id: string): [number, number] => {
    const p = w.nodes[id]?.place;
    return p ? [p.x, p.y] : [0, 0];
  };
  const [cx, cy] = at(s.trip ? s.trip.from : s.position);
  const { scale, px } = fit(places.map(at), [cx, cy], SIZE);
  const pts = (p: [number, number][]) => p.map((q) => px(q).map((n) => n.toFixed(1)).join(',')).join(' ');
  const id = `fog${++maskId}`;

  const el: TerrainEl = document.createElement('div');
  el.className = 'terrain';
  const root = svg('svg', { width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}` }, el);
  const defs = svg('defs', {}, root);
  const ground = svg('pattern', { id: id + 'g', width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, defs);
  svg('rect', { width: 8, height: 8, fill: '#141415' }, ground);
  svg('rect', { x: 3.5, y: 3.5, width: 1.5, height: 1.5, fill: '#5a5a54' }, ground);
  const hatch = svg('pattern', { id: id + 'h', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#1c1c1f', 'stroke-width': 2 }, hatch);
  const mask = svg('mask', { id }, defs);
  svg('rect', { width: SIZE, height: SIZE, fill: 'white' }, mask);
  const r = SEEN * scale;
  for (const v of s.visited) {
    const [x, y] = px(at(v));
    svg('circle', { cx: x, cy: y, r, fill: 'black' }, mask);
  }
  const seen = svg('polyline', { points: pts(path), fill: 'none', stroke: 'black', 'stroke-width': 2 * r, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mask);

  svg('rect', { width: SIZE, height: SIZE, fill: `url(#${id}g)` }, root);
  const fog = svg('g', { mask: `url(#${id})` }, root);
  svg('rect', { width: SIZE, height: SIZE, fill: '#0b0b0c' }, fog);
  svg('rect', { width: SIZE, height: SIZE, fill: `url(#${id}h)` }, fog);
  const trail = svg('polyline', { class: 'path', points: pts(path), fill: 'none', stroke: '#9a9a93', 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }, root);
  for (const p of places) {
    const [x, y] = px(at(p));
    const visited = s.visited.includes(p);
    svg('circle', { cx: x, cy: y, r: 3.5, fill: visited ? '#9a9a93' : '#0b0b0c', stroke: '#9a9a93', 'stroke-width': 1.5 }, root);
  }
  const you = svg('rect', { class: 'you', width: 8, height: 8, fill: '#ffb000' }, root);

  // the scale: one km, bottom left
  svg('line', { x1: 8, y1: SIZE - 8, x2: 8 + scale, y2: SIZE - 8, stroke: '#9a9a93', 'stroke-width': 1 }, root);
  const kmLabel = document.createElement('div');
  kmLabel.className = 'tlabel';
  kmLabel.textContent = '1 km';
  Object.assign(kmLabel.style, { left: `${12 + scale}px`, top: `${SIZE - 19}px` });
  el.append(kmLabel);

  const texts = places.map((p) => {
    const t: Token = { ...tok(w, w.nodes[p]), kind: 'place' };
    return { t, dist: p !== s.position ? ` ${km(w, s.position, p).toFixed(1)} km` : '' };
  });
  const scaleBox = { x: 4, y: SIZE - 20, w: 22 + scale + 4 * CHAR, h: LINE };
  const boxes = placeLabels(
    places.map((p, i) => {
      const [x, y] = px(at(p));
      return { x, y, w: (texts[i].t.text.length + texts[i].dist.length) * CHAR };
    }),
    SIZE,
    [scaleBox],
  );
  places.forEach((_, i) => {
    const label = document.createElement('div');
    label.className = 'tlabel';
    label.append(tokenEl(texts[i].t));
    if (texts[i].dist) label.append(texts[i].dist);
    Object.assign(label.style, { left: `${boxes[i].x.toFixed(1)}px`, top: `${boxes[i].y.toFixed(1)}px` });
    el.append(label);
  });

  el.track = (p) => {
    seen.setAttribute('points', pts(p));
    trail.setAttribute('points', pts(p));
    const [x, y] = px(p[p.length - 1]);
    you.setAttribute('x', (x - 4).toFixed(1));
    you.setAttribute('y', (y - 4).toFixed(1));
  };
  el.track(path);
  return el;
}
