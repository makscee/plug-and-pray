// The stairs down, one look per floor (src/world/floors.ts STAIRS), each built from a few low-poly parts so
// they read apart at a glance on any eye: the cradle's rope pit (a black hole, a chain hanging into it), the
// nave's candle stair (steps winding round a post, a candle on each), the ossuary's bone chute (ribs sloping
// down into the dark), the furnace's lift (a cage on two rails, light rising through it). Sealed, a red lid
// lies over the way down; the keeper's death lifts it. The scene leaves the floor tile out under the stairs, so
// each looks down into a black pit (`pit`).

import * as THREE from 'three';
import type { Entity } from '../core/types';
import type { Stairs } from '../world/floors';

/** a part's colours: [colour, glow, warmth on a heat eye 0..1] */
export type Paint = [number, number, number];
/** the scene's material for a paint in the current eye mode; null hides the part (a cold part on a heat eye) */
export type Pick = (p: Paint) => THREE.Material | null;

const IRON: Paint = [0x5a5650, 0x201810, 0.05];
const RIM: Paint = [0x3a2c22, 0x100804, 0.05];
const WOOD: Paint = [0x6a4a30, 0x180c04, 0.1];
const WAX: Paint = [0xe8e0c8, 0x403828, 0.2];
const FLAME: Paint = [0xffc860, 0xffa030, 1];
const BONE: Paint = [0xe8dcc0, 0x504430, 0.1];
const RAIL: Paint = [0x807868, 0x302010, 0.2];
const BEAM: Paint = [0xfff0c0, 0xffe8a0, 0.9];
const SEAL: Paint = [0x601010, 0xc02020, 0.5];

const geos = {
  pit: new THREE.BoxGeometry(0.999, 1.6, 0.999),
  rim: new THREE.RingGeometry(0.44, 0.52, 4, 1),
  link: new THREE.TorusGeometry(0.04, 0.012, 4, 6),
  post: new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5),
  step: new THREE.BoxGeometry(0.34, 0.04, 0.13),
  candle: new THREE.CylinderGeometry(0.02, 0.02, 0.09, 4),
  flame: new THREE.OctahedronGeometry(0.025),
  rib: new THREE.TorusGeometry(0.3, 0.035, 3, 7, Math.PI),
  trough: new THREE.BoxGeometry(0.5, 0.03, 1.1),
  rail: new THREE.BoxGeometry(0.05, 1, 0.05),
  deck: new THREE.BoxGeometry(0.78, 0.04, 0.78),
  bar: new THREE.BoxGeometry(0.8, 0.03, 0.03),
  beam: new THREE.CylinderGeometry(0.3, 0.34, 1, 6, 1, true),
  lid: new THREE.BoxGeometry(0.86, 0.04, 0.86),
};
const pitMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
const beamMat = new THREE.MeshBasicMaterial({ color: BEAM[0], transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });

/** the stairs as a group at their cell, in the current eye's materials */
export function stairsObject(e: Entity, t: number, pick: Pick, mode: string): THREE.Group {
  const grp = new THREE.Group();
  grp.position.set(e.x, 0, e.y);
  const add = (geo: THREE.BufferGeometry, paint: Paint, x: number, y: number, z: number, f?: (m: THREE.Mesh) => void) => {
    const mat = pick(paint);
    if (!mat) return;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    f?.(m);
    grp.add(m);
  };
  const style = e.data!.stairs as Stairs;
  const open = !!e.data!.open;
  // the pit itself: black inside, seen through the missing floor tile
  if (mode === 'color') {
    const pit = new THREE.Mesh(geos.pit, pitMat);
    pit.position.set(0, -0.8, 0);
    grp.add(pit);
  }
  if (style === 'rope') {
    // a black pit with a chain hanging from the dark above, swaying a little
    add(geos.rim, RIM, 0, 0.006, 0, (m) => ((m.rotation.x = -Math.PI / 2), (m.rotation.z = Math.PI / 4)));
    const sway = Math.sin(t * 0.9) * 0.04;
    for (let k = 0; k < 14; k++) add(geos.link, IRON, sway * (k / 14), 1 - k * 0.075, 0, (m) => (m.rotation.y = k % 2 ? Math.PI / 2 : 0));
  } else if (style === 'spiral') {
    // steps winding down round a post, a candle burning on the outer end of each upper step
    add(geos.post, WOOD, 0, 0.2, 0);
    for (let k = 0; k < 9; k++) {
      const a = k * 0.75;
      const y = 0.02 - k * 0.06;
      add(geos.step, WOOD, Math.cos(a) * 0.2, y, Math.sin(a) * 0.2, (m) => (m.rotation.y = -a));
      if (k < 5) {
        const [cx, cz] = [Math.cos(a) * 0.36, Math.sin(a) * 0.36];
        add(geos.candle, WAX, cx, y + 0.065, cz);
        const flick = 1 + Math.sin(t * 9 + k * 2.1) * 0.25;
        add(geos.flame, FLAME, cx, y + 0.13, cz, (m) => m.scale.set(1, 1.6 * flick, 1));
      }
    }
  } else if (style === 'chute') {
    // a trough of polished bone ribs sloping down into the dark
    add(geos.trough, BONE, 0, -0.2, 0, (m) => (m.rotation.x = 0.45));
    for (let k = 0; k < 5; k++) add(geos.rib, BONE, 0, 0.18 - k * 0.11, -0.4 + k * 0.2, (m) => (m.rotation.x = 0.45));
  } else if (style === 'lift') {
    // a cage on two rails, its deck open, light rising through it
    for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) add(geos.rail, RAIL, x, 0.5, z);
    add(geos.bar, RAIL, 0, 0.96, -0.38);
    add(geos.bar, RAIL, 0, 0.96, 0.38);
    add(geos.deck, RAIL, 0, -0.25 + Math.sin(t * 0.7) * 0.03, 0);
    if (mode === 'color') {
      const b = new THREE.Mesh(geos.beam, beamMat);
      b.position.set(0, 0.5, 0);
      grp.add(b);
    } else add(geos.beam, BEAM, 0, 0.5, 0);
  }
  // sealed: a red lid over the way down until its keeper falls
  if (!open) add(geos.lid, SEAL, 0, 0.03, 0);
  return grp;
}
