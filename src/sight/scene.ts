// The 3D world around you, rendered once per camera frame at that camera's resolution.
// Low poly and dark: boxes for walls, the god's veins glowing faintly, a dim glow around you.
// The sight slice gives it the PS1 look (vertex snapping, affine textures, fog) and the lamps.

import * as THREE from 'three';
import { CHUNK, Cell, cell, veinOf } from '../core/grid';
import { ENEMIES } from '../core/game';
import type { Game } from '../core/types';

/** cells drawn around you in each direction */
const R = 14;
const VEIN: Record<string, number> = { bone: 0xd8c8a8, glass: 0x7fd8d0, copper: 0xd08040, ichor: 0xc02040 };

let renderer: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 40);
const wallGeo = new THREE.BoxGeometry(1, 1, 1);
const tileGeo = new THREE.PlaneGeometry(1, 1);
const wallMat = new THREE.MeshLambertMaterial({ color: 0x6a5a4c });
const floorMat = new THREE.MeshLambertMaterial({ color: 0x2a2220, side: THREE.DoubleSide });
const ceilMat = new THREE.MeshLambertMaterial({ color: 0x1a1414, side: THREE.DoubleSide });
const N = (2 * R + 1) ** 2;
const walls = new THREE.InstancedMesh(wallGeo, wallMat, N);
const floors = new THREE.InstancedMesh(tileGeo, floorMat, N);
const ceils = new THREE.InstancedMesh(tileGeo, ceilMat, N);
const veins: Record<string, THREE.InstancedMesh> = {};
const glow = new THREE.PointLight(0xffd8a0, 4, 5, 1);
const ents = new THREE.Group();
scene.add(walls, floors, ceils, glow, ents, new THREE.AmbientLight(0x403440, 1.2));
for (const [res, c] of Object.entries(VEIN)) {
  veins[res] = new THREE.InstancedMesh(wallGeo, new THREE.MeshLambertMaterial({ color: 0x302020, emissive: c, emissiveIntensity: 0.35 }), N);
  scene.add(veins[res]);
}
scene.background = new THREE.Color(0x000000);

let builtFor = '';
const m = new THREE.Matrix4();

/** rebuild the cells around (cx, cy) when you entered another cell */
function build(g: Game, px: number, py: number): void {
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const key = `${g.seed}:${cx},${cy}:${g.chunks.size}`;
  if (key === builtFor) return;
  builtFor = key;
  let nw = 0, nf = 0;
  const nv: Record<string, number> = { bone: 0, glass: 0, copper: 0, ichor: 0 };
  for (let y = cy - R; y <= cy + R; y++)
    for (let x = cx - R; x <= cx + R; x++) {
      const c = cell(g, x, y);
      if (c === Cell.floor) {
        m.makeRotationX(-Math.PI / 2).setPosition(x + 0.5, 0, y + 0.5);
        floors.setMatrixAt(nf, m);
        m.makeRotationX(Math.PI / 2).setPosition(x + 0.5, 1, y + 0.5);
        ceils.setMatrixAt(nf++, m);
        continue;
      }
      // only walls that touch a floor are drawn
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cell(g, x + dx, y + dy) === Cell.floor)) continue;
      m.makeTranslation(x + 0.5, 0.5, y + 0.5);
      const v = veinOf(c);
      if (v) veins[v].setMatrixAt(nv[v]++, m);
      else walls.setMatrixAt(nw++, m);
    }
  walls.count = nw;
  floors.count = ceils.count = nf;
  for (const k of Object.keys(veins)) veins[k].count = nv[k];
  for (const mesh of [walls, floors, ceils, ...Object.values(veins)]) mesh.instanceMatrix.needsUpdate = true;
}

const itemGeo = new THREE.OctahedronGeometry(0.12);
const foeGeo = new THREE.IcosahedronGeometry(0.22, 0);
const itemMat = new THREE.MeshLambertMaterial({ color: 0x806040, emissive: 0xc08040, emissiveIntensity: 0.6 });
const shotGeo = new THREE.IcosahedronGeometry(0.1, 0);
const orbMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });
const nailMat = new THREE.MeshBasicMaterial({ color: 0xd0e0ff });
const foeMat = new THREE.MeshLambertMaterial({ color: 0x8a8070, emissive: 0x401818, emissiveIntensity: 0.5 });

/** entities near you as simple shapes; the slices give enemies their own look */
function place(g: Game): void {
  ents.clear();
  const p = g.player;
  for (const e of g.ents) {
    if (Math.abs(e.x - p.x) > R || Math.abs(e.y - p.y) > R) continue;
    if (e.kind === 'enemy') {
      if (ENEMIES[e.enemy!.type]?.hidden) continue; // the hum: no camera shows it
      const o = new THREE.Mesh(foeGeo, foeMat);
      o.position.set(e.x, 0.3 + Math.sin(g.t * 4 + e.id) * 0.04, e.y);
      o.rotation.y = g.t * 2 + e.id;
      ents.add(o);
    } else if (e.data?.shot) {
      const o = new THREE.Mesh(shotGeo, e.data.foe ? orbMat : nailMat);
      o.position.set(e.x, 0.35, e.y);
      ents.add(o);
    } else if (e.kind === 'item') {
      const o = new THREE.Mesh(itemGeo, itemMat);
      o.position.set(e.x, 0.15, e.y);
      o.rotation.y = g.t + e.id;
      ents.add(o);
    }
  }
}

export interface Shot {
  res: number;
  fov: number;
  /** cells: things past it fade into black */
  range: number;
}

const targets = new Map<number, THREE.WebGLRenderTarget>();

/** render the view from your eyes; returns RGBA rows top to bottom, res*res*4 */
export function shoot(g: Game, s: Shot): Uint8Array {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: false });
    renderer.setPixelRatio(1);
  }
  const p = g.player;
  build(g, p.x, p.y);
  place(g);
  glow.position.set(p.x, 0.6, p.y);
  scene.fog = new THREE.Fog(0x000000, s.range * 0.3, s.range);
  camera.fov = s.fov;
  camera.updateProjectionMatrix();
  camera.position.set(p.x, 0.5, p.y);
  camera.lookAt(p.x + Math.sin(p.dir), 0.5, p.y - Math.cos(p.dir));
  let rt = targets.get(s.res);
  if (!rt) {
    rt = new THREE.WebGLRenderTarget(s.res, s.res);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    targets.set(s.res, rt);
  }
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  const buf = new Uint8Array(s.res * s.res * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, s.res, s.res, buf);
  renderer.setRenderTarget(null);
  // GL rows are bottom up
  const out = new Uint8Array(buf.length);
  const row = s.res * 4;
  for (let y = 0; y < s.res; y++) out.set(buf.subarray((s.res - 1 - y) * row, (s.res - y) * row), y * row);
  return out;
}

/** mark the cells within sight as seen (the map spool draws them) */
export function see(g: Game, range: number): void {
  const p = g.player;
  const r = Math.ceil(range);
  for (let y = Math.floor(p.y) - r; y <= Math.floor(p.y) + r; y++)
    for (let x = Math.floor(p.x) - r; x <= Math.floor(p.x) + r; x++) if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= range) g.seen.add(`${x},${y}`);
}
export { CHUNK };
