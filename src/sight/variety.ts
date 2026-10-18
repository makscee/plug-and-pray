// The v2 variety things in the eye, built from a few low-poly parts like the stairs (stairs.ts) so each reads
// apart at a glance on any eye: the kit cache where you land (an open chest, its kit glowing in it), each set
// piece's centrepiece (src/world/pieces.ts: a crib of bars, a kiln, a loom, an organ, pews, a saint, a forge...),
// the ◇ over a choir foe poised to sidestep (src/fight/dodge.ts), the cradle's cracking floor and the furnace's
// vents breathing on the beat (src/world/gimmicks.ts).

import * as THREE from 'three';
import type { Entity, Game } from '../core/types';
import { paint, placeHooks, type Mode } from './scene';
import { SPRITES } from './sprites';
import type { Paint } from './stairs';
import { cacheOf } from '../world/cache';
import { pieceOf } from '../world/piecefill';
import { poised } from '../fight/dodge';
import { cracksOf, CRUMBLE, ventPhase } from '../world/gimmicks';

const P = (c: number, glow: number, heat: number): Paint => [c, glow, heat];
const IRON = P(0x5a5650, 0x201810, 0.1);
const WOOD = P(0x6a4a30, 0x180c04, 0.1);
const BRASS = P(0xc09040, 0x402808, 0.2);
const GOLD = P(0xffd060, 0xffb020, 0.8);
const OIL = P(0xffc040, 0xff9010, 0.7);
const EMBER = P(0xff7030, 0xff4010, 1);
const FIRE = P(0xffe080, 0xffc040, 1);
const BONE = P(0xe8dcc0, 0x504430, 0.1);
const PALE = P(0xc8d0d8, 0x404850, 0.05);
const STONE = P(0x8a8478, 0x201c18, 0.05);
const DARK = P(0x2a2420, 0x080604, 0.05);
const WAX = P(0xe8e0c8, 0x403828, 0.2);
const FLESH = P(0xa05048, 0x401010, 0.6);
const RIME = P(0xa0e0ff, 0x60a0d0, 0);
const VIOLET = P(0xb080e0, 0x6030a0, 0.4);
const SLAG = P(0x403028, 0x401808, 0.6);

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n);
const geo = {
  unit: box(1, 1, 1),
  ball: new THREE.SphereGeometry(1, 8, 6),
  dome: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: cyl(1, 1, 1),
  ring: new THREE.TorusGeometry(1, 0.08, 4, 12),
  octa: new THREE.OctahedronGeometry(1),
  link: new THREE.TorusGeometry(0.05, 0.015, 4, 6),
  bowl: cyl(1, 0.55, 1, 10),
};

type Add = (g: THREE.BufferGeometry, p: Paint, x: number, y: number, z: number, sx?: number, sy?: number, sz?: number, ry?: number) => void;

/** a set piece's centrepiece, about a cell or two wide; t is game time (for flicker and sway) */
const PROPS: Record<string, (add: Add, t: number, used: boolean) => void> = {
  // the cradle
  crib(add) {
    add(geo.unit, WOOD, 0, 0.1, 0, 1.4, 0.06, 0.9);
    for (let k = -3; k <= 3; k++) for (const z of [-0.45, 0.45]) add(geo.unit, IRON, k * 0.2, 0.35, z, 0.03, 0.5, 0.03);
    for (const x of [-0.7, 0.7]) for (let k = -2; k <= 2; k++) add(geo.unit, IRON, x, 0.35, k * 0.18, 0.03, 0.5, 0.03);
    for (const z of [-0.45, 0.45]) add(geo.unit, IRON, 0, 0.6, z, 1.42, 0.04, 0.04);
  },
  kiln(add, t) {
    add(geo.dome, STONE, 0, 0, 0, 0.75, 0.9, 0.75);
    add(geo.unit, DARK, 0, 0.2, 0.62, 0.36, 0.34, 0.2);
    add(geo.unit, EMBER, 0, 0.17, 0.66, 0.26 + Math.sin(t * 3) * 0.02, 0.22, 0.14);
    add(geo.cyl, STONE, 0.2, 0.95, -0.1, 0.1, 0.4, 0.1);
  },
  loom(add) {
    for (const x of [-0.65, 0.65]) add(geo.unit, BONE, x, 0.55, 0, 0.08, 1.1, 0.08);
    add(geo.unit, BONE, 0, 1.08, 0, 1.4, 0.07, 0.07);
    add(geo.unit, BONE, 0, 0.12, 0, 1.4, 0.06, 0.06);
    for (let k = -5; k <= 5; k++) add(geo.unit, FLESH, k * 0.11, 0.6, 0, 0.015, 0.95, 0.015);
    add(geo.unit, BONE, -0.1, 0.65, 0.03, 0.4, 0.5, 0.05);
  },
  font(add, t, used) {
    add(geo.cyl, STONE, 0, 0.2, 0, 0.6, 0.4, 0.6);
    add(geo.cyl, STONE, 0, 0.42, 0, 0.75, 0.06, 0.75);
    if (!used) add(geo.cyl, OIL, 0, 0.44 + Math.sin(t * 2) * 0.005, 0, 0.62, 0.02, 0.62);
  },
  nest(add, t) {
    const at: [number, number, number][] = [[0, 0.18, 0], [0.3, 0.14, 0.2], [-0.28, 0.15, 0.18], [0.1, 0.13, -0.32], [-0.3, 0.12, -0.25], [0.38, 0.1, -0.15]];
    at.forEach(([x, y, z], k) => add(geo.ball, FLESH, x, y, z, 0.16, 0.2 + Math.sin(t * 3 + k) * 0.015, 0.16));
    add(geo.cyl, DARK, 0, 0.02, 0, 0.7, 0.04, 0.7);
  },
  bellframe(add, t) {
    for (const x of [-0.7, 0.7]) add(geo.unit, WOOD, x, 0.8, 0, 0.1, 1.6, 0.1);
    add(geo.unit, WOOD, 0, 1.6, 0, 1.5, 0.1, 0.12);
    const sw = Math.sin(t * 0.8) * 0.06;
    add(geo.cone, BRASS, sw, 1.05, 0, 0.5, 0.7, 0.5);
    add(geo.ball, IRON, sw * 1.6, 0.66, 0, 0.08, 0.08, 0.08);
  },
  // the nave
  organ(add) {
    [0.9, 1.3, 1.7, 2.1, 1.7, 1.3, 0.9].forEach((h, k) => add(geo.cyl, BONE, (k - 3) * 0.2, h / 2, -0.2, 0.08, h, 0.08));
    add(geo.unit, WOOD, 0, 0.25, 0.15, 1.5, 0.5, 0.35);
    add(geo.unit, WAX, 0, 0.52, 0.1, 1.2, 0.04, 0.2);
  },
  pews(add) {
    for (const z of [-0.5, 0, 0.5]) {
      add(geo.unit, WOOD, 0, 0.2, z, 1.6, 0.06, 0.2);
      add(geo.unit, WOOD, 0, 0.35, z - 0.1, 1.6, 0.3, 0.04);
    }
    add(geo.cyl, GOLD, 0, 0.9, -0.9, 0.02, 0.6, 0.02);
    add(geo.unit, GOLD, 0, 1.05, -0.9, 0.3, 0.03, 0.03);
  },
  lectern(add) {
    add(geo.cyl, WOOD, 0, 0.4, 0, 0.06, 0.8, 0.06);
    add(geo.unit, WOOD, 0, 0.82, 0, 0.5, 0.05, 0.38, 0);
    add(geo.unit, WAX, -0.1, 0.86, 0, 0.22, 0.03, 0.3);
    add(geo.unit, WAX, 0.12, 0.86, 0, 0.22, 0.03, 0.3);
    add(geo.cyl, WOOD, 0, 0.03, 0, 0.3, 0.06, 0.3);
  },
  saint(add) {
    add(geo.unit, STONE, 0, 0.12, 0, 0.8, 0.24, 0.8);
    add(geo.cone, PALE, 0, 0.6, 0, 0.32, 0.75, 0.32);
    add(geo.ball, PALE, 0, 1.08, 0, 0.14, 0.16, 0.14);
    add(geo.ring, GOLD, 0, 1.3, 0, 0.16, 0.16, 0.16);
    for (const x of [-0.18, 0.18]) add(geo.unit, PALE, x, 0.72, 0.2, 0.1, 0.06, 0.25);
    add(geo.octa, GOLD, 0, 0.82, 0.3, 0.07, 0.07, 0.07);
  },
  candles(add, t) {
    for (let k = 0; k < 24; k++) {
      const a = k * 2.4;
      const r = 0.2 + (k % 6) * 0.11;
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      const h = 0.08 + (k % 4) * 0.05;
      add(geo.cyl, WAX, x, h / 2, z, 0.025, h, 0.025);
      add(geo.octa, FIRE, x, h + 0.04, z, 0.02, 0.04 * (1 + Math.sin(t * 9 + k) * 0.25), 0.02);
    }
  },
  loft(add) {
    for (let k = -2; k <= 2; k++) add(geo.unit, WOOD, k * 0.3, 0.3, -0.5, 0.26, 0.6, 0.2);
    add(geo.unit, WOOD, 0, 0.65, -0.5, 1.6, 0.06, 0.26);
    add(geo.cyl, VIOLET, 0, 0.45, 0.2, 0.03, 0.9, 0.03);
    add(geo.unit, WAX, 0, 0.9, 0.2, 0.3, 0.02, 0.22);
  },
  // the ossuary
  bonepile(add) {
    add(geo.cone, BONE, 0, 0.35, 0, 0.75, 0.7, 0.75);
    for (let k = 0; k < 7; k++) add(geo.ball, PALE, Math.cos(k) * 0.45, 0.15 + (k % 3) * 0.12, Math.sin(k * 1.3) * 0.45, 0.1, 0.09, 0.1);
  },
  skullwall(add) {
    add(geo.unit, STONE, 0, 0.7, -0.4, 1.6, 1.4, 0.15);
    for (let y = 0; y < 4; y++) for (let x = -3; x <= 3; x++) add(geo.ball, PALE, x * 0.2, 0.2 + y * 0.32, -0.3, 0.08, 0.09, 0.07);
  },
  sarcophagus(add) {
    add(geo.unit, STONE, 0, 0.25, 0, 0.7, 0.5, 1.5);
    add(geo.unit, RIME, 0, 0.52, 0, 0.6, 0.04, 1.4);
    add(geo.ball, PALE, 0, 0.42, -0.5, 0.12, 0.1, 0.12);
  },
  chandelier(add, t, used) {
    const sw = Math.sin(t * 0.7) * 0.03;
    for (let k = 0; k < 4; k++) add(geo.unit, IRON, sw, 1.7, 0, 0.02, 0.6, 0.02, (k * Math.PI) / 4);
    add(geo.ring, BONE, sw, 1.35, 0, 0.6, 0.6, 0.6);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(geo.cyl, WAX, sw + Math.cos(a) * 0.6, 1.42, Math.sin(a) * 0.6, 0.03, 0.12, 0.03);
      if (!used) add(geo.octa, FIRE, sw + Math.cos(a) * 0.6, 1.53, Math.sin(a) * 0.6, 0.025, 0.05, 0.025);
    }
  },
  well(add) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      add(geo.unit, STONE, Math.cos(a) * 0.5, 0.25, Math.sin(a) * 0.5, 0.3, 0.5, 0.16, -a);
    }
    add(geo.cyl, DARK, 0, 0.02, 0, 0.42, 0.03, 0.42);
    for (const x of [-0.55, 0.55]) add(geo.unit, WOOD, x, 0.75, 0, 0.06, 1, 0.06);
    add(geo.cyl, WOOD, 0, 1.2, 0, 0.04, 1.2, 0.04);
  },
  charnel(add) {
    for (let y = 0; y < 3; y++) {
      add(geo.unit, WOOD, 0, 0.15 + y * 0.45, -0.3, 1.5, 0.05, 0.5);
      add(geo.unit, PALE, -0.25 + y * 0.2, 0.25 + y * 0.45, -0.3, 0.6, 0.1, 0.15);
    }
    for (const x of [-0.75, 0.75]) add(geo.unit, WOOD, x, 0.6, -0.3, 0.06, 1.2, 0.5);
  },
  // the furnace
  forge(add, t) {
    add(geo.unit, IRON, 0, 0.2, 0, 0.5, 0.4, 0.4);
    add(geo.unit, IRON, 0, 0.47, 0, 1, 0.16, 0.45);
    add(geo.cone, IRON, 0.62, 0.47, 0, 0.12, 0.3, 0.12, 0);
    add(geo.unit, EMBER, -0.2, 0.57, 0, 0.3, 0.04, 0.2);
    add(geo.unit, IRON, 0.15, 0.62 + Math.abs(Math.sin(t * 2)) * 0.1, 0.1, 0.12, 0.1, 0.24);
  },
  crucible(add, t) {
    add(geo.bowl, IRON, 0, 0.25, 0, 0.7, 0.45, 0.7);
    add(geo.cyl, EMBER, 0, 0.47, 0, 0.62, 0.02, 0.62);
    add(geo.ball, FIRE, Math.sin(t) * 0.2, 0.5, Math.cos(t * 1.3) * 0.2, 0.08, 0.03, 0.08);
  },
  bellows(add, t) {
    const b = 0.5 + Math.sin(t * 1.5) * 0.12;
    add(geo.unit, WOOD, 0, 0.6 + b / 2, 0, 1, 0.06, 1.2);
    add(geo.unit, WOOD, 0, 0.2, 0, 1, 0.06, 1.2);
    add(geo.unit, FLESH, 0, 0.4 + b / 4, 0, 0.9, b, 1.1);
    add(geo.cone, IRON, 0, 0.4, 0.8, 0.1, 0.4, 0.1);
  },
  slag(add) {
    add(geo.cone, SLAG, 0, 0.3, 0, 0.8, 0.6, 0.8);
    for (let k = 0; k < 6; k++) add(geo.octa, BRASS, Math.cos(k * 1.7) * 0.4, 0.15 + (k % 2) * 0.12, Math.sin(k * 1.7) * 0.4, 0.05, 0.05, 0.05);
  },
  chains(add, t) {
    for (let c = 0; c < 5; c++) {
      const [x, z] = [Math.cos(c * 1.3) * 0.5, Math.sin(c * 1.3) * 0.5];
      const sw = Math.sin(t * 0.9 + c) * 0.05;
      for (let k = 0; k < 14; k++) add(geo.link, IRON, x + sw * (k / 14), 1.9 - k * 0.09, z, 1, 1, 1, k % 2 ? Math.PI / 2 : 0);
    }
  },
  frost(add, t, used) {
    add(geo.unit, STONE, 0, 0.1, 0, 0.9, 0.2, 0.9);
    for (let k = 0; k < 5; k++) add(geo.cone, RIME, Math.cos(k * 1.26) * 0.25, 0.45, Math.sin(k * 1.26) * 0.25, 0.1, 0.7 - (k % 2) * 0.2, 0.1);
    if (!used) add(geo.octa, RIME, 0, 1 + Math.sin(t * 2) * 0.05, 0, 0.12, 0.18, 0.12);
  },
};

/** the kit cache where you land: an open chest, its kit glowing in it while anything is left */
function cacheProp(add: Add, t: number, full: boolean): void {
  // v2r4 ux: taken or scrapped, the box is gone: a few dark staves on the floor where it stood (it stayed the same
  // flat orange box with its brass line, in the middle of every landing's view)
  if (!full) {
    for (const [x, z, ry] of [[-0.18, 0.05, 0.4], [0.12, -0.1, -0.7], [0.05, 0.18, 1.3]]) add(geo.unit, SLAG, x, 0.015, z, 0.5, 0.03, 0.07, ry);
    return;
  }
  add(geo.unit, WOOD, 0, 0.16, 0, 0.7, 0.32, 0.45);
  add(geo.unit, BRASS, 0, 0.33, 0, 0.74, 0.03, 0.49);
  add(geo.unit, WOOD, 0, 0.5, -0.25, 0.7, 0.32, 0.04, 0);
  if (full) for (let k = 0; k < 3; k++) add(geo.octa, GOLD, (k - 1) * 0.2, 0.38 + Math.sin(t * 2 + k) * 0.02, 0, 0.06, 0.08, 0.06);
}

/** a centrepiece group at its cell */
function build(e: Entity, mode: Mode, f: (add: Add) => void): THREE.Group {
  const grp = new THREE.Group();
  grp.position.set(e.x, 0, e.y);
  const pick = paint(mode);
  f((g, p, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => {
    const mat = pick(p);
    if (!mat) return;
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.y = ry;
    grp.add(m);
  });
  return grp;
}

const R = 14;
placeHooks.push((g: Game, group: THREE.Group, mode: Mode) => {
  const p = g.player;
  const near = (e: { x: number; y: number }) => Math.abs(e.x - p.x) <= R && Math.abs(e.y - p.y) <= R;
  for (const e of g.ents) {
    if (e.kind !== 'prop' || !near(e)) continue;
    if (typeof e.data?.cache === 'number') {
      const c = cacheOf(g, (e.data.cache as number) - 1);
      group.add(build(e, mode, (add) => cacheProp(add, g.t, !c.done && c.offer.length > 0)));
    } else if (typeof e.data?.piece === 'string') {
      const pc = pieceOf(e);
      const f = pc && PROPS[pc.id];
      if (f) group.add(build(e, mode, (add) => f(add, g.t, !!e.data!.used)));
    } else if (e.data?.vent) {
      const ph = ventPhase(g);
      group.add(
        build(e, mode, (add) => {
          for (let k = -2; k <= 2; k++) add(geo.unit, IRON, k * 0.14, 0.015, 0, 0.05, 0.03, 0.7);
          add(geo.unit, ph === 'rest' ? SLAG : EMBER, 0, 0.005, 0, 0.7, 0.01, 0.7);
          if (ph === 'burst') add(geo.cone, FIRE, 0, 0.6, 0, 0.32, 1.2, 0.32);
          if (ph === 'glow') add(geo.cone, EMBER, 0, 0.12, 0, 0.2, 0.2 + ((g.t % 1) * 0.2), 0.2);
        }),
      );
    }
  }
  // the ◇ over a choir foe poised to sidestep your shot
  if (mode !== 'depth')
    for (const e of g.ents) {
      if (!e.enemy || !near(e) || !poised(g, e)) continue;
      const mat = paint(mode)(RIME_TELL);
      if (!mat) continue;
      const m = new THREE.Mesh(geo.octa, mat);
      m.scale.set(0.09, 0.14, 0.09);
      const sp = SPRITES[e.enemy.type] ?? SPRITES.mite;
      m.position.set(e.x, sp.lift + sp.size + 0.14 + Math.sin(g.t * 3 + e.id) * 0.03, e.y);
      m.rotation.y = g.t * 2;
      group.add(m);
    }
  // the cradle's cracking floor: dark cracks over the patch, flashing as it goes
  for (const c of cracksOf(g)) {
    if (!near({ x: c.x, y: c.y })) continue;
    const grp = new THREE.Group();
    grp.position.set(c.x + 0.5, 0, c.y + 0.5);
    const ink = paint(mode)(Math.floor(g.t * 6) % 2 ? CRACK_HOT : CRACK);
    if (!ink) continue;
    const s = CRUMBLE.r * 2 + 1;
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(geo.unit, ink);
      m.scale.set(s * 0.9, 0.012, 0.05);
      m.rotation.y = k * 0.9 + c.x;
      m.position.set(Math.cos(k * 2.1) * 0.6, 0.01, Math.sin(k * 1.7) * 0.6);
      grp.add(m);
    }
    group.add(grp);
  }
});
const RIME_TELL = P(0x60e0ff, 0x20b0ff, 0.5);
const CRACK = P(0x100804, 0x000000, 0.4);
const CRACK_HOT = P(0xff8030, 0xff5010, 0.9);
