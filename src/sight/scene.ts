// The 3D world around you, rendered once per camera frame at that camera's resolution.
// The PS1 look: low poly, vertices snapped to the camera's own pixel grid, affine (unperspective)
// texture warp, black fog, dark. Ribbed walls with bone-iron inlay, the god's veins glowing faintly,
// a dim body glow; lamps (lamp.ts) add point lights. Modes for the filters: `color` (the world),
// `heat` (the world near black, warm things bright through walls), `depth` (distance as gray).

import * as THREE from 'three';
import { CHUNK, Cell, cell, veinOf } from '../core/grid';
import { ENEMIES } from '../core/game';
import { MODS } from '../core/mods';
import type { Entity, Game } from '../core/types';
import { flame, lamps } from './lamp';
import { textures } from './textures';

/** cells drawn around you in each direction */
const R = 14;
const VEIN: Record<string, number> = { bone: 0xd8c8a8, glass: 0x7fd8d0, copper: 0xd08040, ichor: 0xc02040 };

/** the PS1 shader patch: one uniform for every material, set per camera before it renders */
const snap = { value: 32 };

function ps1<M extends THREE.Material>(mat: M): M {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnap = snap;
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'uniform float uSnap;\nvarying float vAffW;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;
        vAffW = gl_Position.w;
        #ifdef USE_MAP
        vMapUv *= vAffW;
        #endif
        #ifdef USE_EMISSIVEMAP
        vEmissiveMapUv *= vAffW;
        #endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'varying float vAffW;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
        diffuseColor *= texture2D(map, vMapUv / vAffW);
        #endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#ifdef USE_EMISSIVEMAP
        totalEmissiveRadiance *= texture2D(emissiveMap, vEmissiveMapUv / vAffW).rgb;
        #endif`,
      );
  };
  return mat;
}

let renderer: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 40);
const wallGeo = new THREE.BoxGeometry(1, 1, 1);
const tileGeo = new THREE.PlaneGeometry(1, 1);
const tx = textures();
const wallMat = ps1(new THREE.MeshLambertMaterial({ map: tx.wall }));
const floorMat = ps1(new THREE.MeshLambertMaterial({ map: tx.floor, side: THREE.DoubleSide }));
const ceilMat = ps1(new THREE.MeshLambertMaterial({ map: tx.ceil, side: THREE.DoubleSide }));
const N = (2 * R + 1) ** 2;
const walls = new THREE.InstancedMesh(wallGeo, wallMat, N);
const floors = new THREE.InstancedMesh(tileGeo, floorMat, N);
const ceils = new THREE.InstancedMesh(tileGeo, ceilMat, N);
const veins: Record<string, THREE.InstancedMesh> = {};
/** the body's own dim glow: with no lamp, this and the veins are all the light there is */
const glow = new THREE.PointLight(0xffc890, 3, 4.5, 1);
const lights = [0, 1, 2].map(() => new THREE.PointLight(0xffffff, 0, 1, 1));
const ambient = new THREE.AmbientLight(0x3a2e36, 1.5);
const ents = new THREE.Group();
scene.add(walls, floors, ceils, glow, ents, ambient, ...lights);
for (const [res, c] of Object.entries(VEIN)) {
  veins[res] = new THREE.InstancedMesh(wallGeo, ps1(new THREE.MeshLambertMaterial({ map: tx.vein, color: 0x806868, emissive: c, emissiveMap: tx.glow, emissiveIntensity: 0.55 })), N);
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

// ---- how things look: one simple low-poly shape per enemy type and per item kind

export interface Look {
  geo: THREE.BufferGeometry;
  color: number;
  /** emissive colour: what shows in the dark */
  glow: number;
  /** height of its centre above the floor */
  y: number;
  /** spins, bobs */
  spin?: number;
  bob?: number;
  /** how warm it is on a heat camera, 0..1 */
  heat: number;
}

const LOOKS: Record<string, Look> = {};
/** the fight slice gives a new enemy its look here; unknown types fall back to the mite's */
export function look(type: string, l: Look): void {
  LOOKS[type] = l;
}
look('mite', { geo: new THREE.TetrahedronGeometry(0.16), color: 0x8a8070, glow: 0x501818, y: 0.2, spin: 6, bob: 0.06, heat: 0.7 });
look('seraph', { geo: new THREE.IcosahedronGeometry(0.28, 0), color: 0xf0e0b0, glow: 0xffd070, y: 0.6, spin: 0.5, bob: 0.05, heat: 1 });
look('walker', { geo: new THREE.BoxGeometry(0.4, 0.8, 0.3), color: 0xd8c8a8, glow: 0x281810, y: 0.4, heat: 0.8 });
look('mimic', { geo: new THREE.OctahedronGeometry(0.12), color: 0x806040, glow: 0xc08040, y: 0.15, spin: 1, heat: 0.5 });
look('hum', { geo: new THREE.SphereGeometry(0.2, 5, 3), color: 0x000000, glow: 0x000000, y: 0.5, heat: 0.9 });

const FAMILY_GEO: Record<string, THREE.BufferGeometry> = {
  camera: new THREE.SphereGeometry(0.1, 6, 4),
  scanner: new THREE.TorusGeometry(0.1, 0.03, 3, 8),
  lamp: new THREE.OctahedronGeometry(0.1),
  gait: new THREE.CylinderGeometry(0.08, 0.08, 0.14, 6),
  weapon: new THREE.ConeGeometry(0.07, 0.24, 4),
  power: new THREE.CylinderGeometry(0.06, 0.06, 0.2, 5),
};
const resGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const cardGeo = new THREE.BoxGeometry(0.18, 0.02, 0.12);
const printerGeo = new THREE.BoxGeometry(0.6, 0.9, 0.6);
const itemGeo = new THREE.OctahedronGeometry(0.12);

function lookOf(e: Entity): Look | null {
  if (e.enemy) return ENEMIES[e.enemy.type]?.hidden ? null : LOOKS[e.enemy.type] ?? LOOKS.mite;
  if (e.kind === 'printer') return { geo: printerGeo, color: 0x5a4a40, glow: 0x803010, y: 0.45, heat: 0.4 };
  const it = e.item;
  if (!it) return null;
  if (it.kind === 'res') return { geo: resGeo, color: VEIN[it.res] ?? 0x808080, glow: VEIN[it.res] ?? 0, y: 0.08, spin: 0.7, heat: it.res === 'ichor' ? 0.4 : 0.05 };
  if (it.kind === 'card') return { geo: cardGeo, color: 0xe8d8b0, glow: 0x605030, y: 0.03, heat: 0.05 };
  const fam = MODS[it.mod]?.family ?? '';
  return { geo: FAMILY_GEO[fam] ?? itemGeo, color: 0x806040, glow: 0xc08040, y: 0.15, spin: 1, bob: 0.03, heat: 0.15 };
}

const mats = new Map<string, THREE.Material>();
function matOf(l: Look, mode: Mode): THREE.Material {
  const k = mode === 'heat' ? `h${l.heat}` : `${l.color}:${l.glow}`;
  let mat = mats.get(k);
  if (!mat) {
    mat =
      mode === 'heat'
        ? new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.08 - l.heat * 0.08, 1, 0.1 + l.heat * 0.85), depthTest: false, fog: false })
        : ps1(new THREE.MeshLambertMaterial({ color: l.color, emissive: l.glow, emissiveIntensity: 0.6, flatShading: true }));
    mats.set(k, mat);
  }
  return mat;
}

/** entities near you as their shapes; hidden enemies never show on any camera */
function place(g: Game, mode: Mode): void {
  ents.clear();
  const p = g.player;
  for (const e of g.ents) {
    if (Math.abs(e.x - p.x) > R || Math.abs(e.y - p.y) > R) continue;
    const l = lookOf(e);
    if (!l) continue;
    if (mode === 'heat' && l.heat < 0.3) continue;
    const o = new THREE.Mesh(l.geo, mode === 'depth' ? depthMat : matOf(l, mode));
    o.position.set(e.x, l.y + Math.sin(g.t * 4 + e.id) * (l.bob ?? 0), e.y);
    o.rotation.y = g.t * (l.spin ?? 0) + e.id;
    o.renderOrder = mode === 'heat' ? 2 : 0;
    ents.add(o);
  }
}

// ---- modes

export type Mode = 'color' | 'heat' | 'depth';

/** heat: the world is cold, near black, the veins a little warm */
/** depth: nearness 1 at the eye to 0 at `range`, 16 bits in red (high) and green (low): `near(px, i)` */
const range = { value: 8 };
const depthVert = `
    #include <common>
    uniform float uSnap;
    varying float vDist;
    void main() {
      #include <begin_vertex>
      #include <project_vertex>
      vDist = -mvPosition.z;
      gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;
    }`;
const depthMat = new THREE.ShaderMaterial({
  uniforms: { uSnap: snap, uRange: range },
  vertexShader: depthVert,
  fragmentShader: `
    uniform float uRange;
    varying float vDist;
    void main() {
      float v = clamp(1.0 - vDist / uRange, 0.0, 1.0) * 255.0;
      gl_FragColor = vec4(floor(v) / 255.0, fract(v), 0.0, 1.0);
    }`,
});
/** heat: the world is cold, the walls near you a little warm from your own body */
const coldMat = new THREE.ShaderMaterial({
  uniforms: { uSnap: snap },
  vertexShader: depthVert,
  fragmentShader: `
    varying float vDist;
    // the target stores sRGB: undo it, so the bytes read back are the warmth itself
    void main() { float v = pow(clamp(1.0 - vDist / 5.0, 0.0, 1.0) * 0.22, 2.2); gl_FragColor = vec4(v, v, v, 1.0); }`,
});

/** nearness 0..1 of pixel i in a depth shot (0: nothing there, or past the range) */
export const near = (px: Uint8Array, i: number): number => (px[i * 4] + px[i * 4 + 1] / 256) / 255;

export interface Shot {
  res: number;
  fov: number;
  /** cells: things past it fade into black */
  range: number;
  mode?: Mode;
}

const targets = new Map<string, THREE.WebGLRenderTarget>();

/** render the view from your eyes; returns RGBA rows top to bottom, res*res*4 */
export function shoot(g: Game, s: Shot): Uint8Array {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: false });
    renderer.setPixelRatio(1);
  }
  const mode = s.mode ?? 'color';
  const p = g.player;
  build(g, p.x, p.y);
  place(g, mode);
  // snap to half the camera's pixels: the wobble shows even on a big lens
  snap.value = s.res / 2;
  range.value = s.range;
  glow.position.set(p.x, 0.6, p.y);
  const ls = lamps(g);
  lights.forEach((l, k) => {
    const lamp = ls[k];
    l.intensity = lamp ? 6 * flame(lamp, g.t) : 0;
    if (!lamp) return;
    l.color.setHex(lamp.color);
    l.distance = lamp.radius * 1.6;
    l.position.set(p.x, 0.75, p.y);
  });
  scene.overrideMaterial = mode === 'heat' ? coldMat : mode === 'depth' ? depthMat : null;
  scene.fog = mode === 'color' ? new THREE.Fog(0x000000, s.range * 0.45, s.range) : null;
  camera.fov = s.fov;
  camera.updateProjectionMatrix();
  camera.position.set(p.x, 0.5, p.y);
  camera.lookAt(p.x + Math.sin(p.dir), 0.5, p.y - Math.cos(p.dir));
  // depth is data, not colour: its target stores the bytes as written
  const tk = `${s.res}:${mode === 'depth'}`;
  let rt = targets.get(tk);
  if (!rt) {
    rt = new THREE.WebGLRenderTarget(s.res, s.res);
    if (mode !== 'depth') rt.texture.colorSpace = THREE.SRGBColorSpace;
    targets.set(tk, rt);
  }
  renderer.setRenderTarget(rt);
  if (mode === 'heat') {
    // the world first, then warm things over it: heat shows through walls
    ents.visible = false;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    ents.visible = true;
    const hide = [walls, floors, ceils, ...Object.values(veins)];
    for (const o of hide) o.visible = false;
    renderer.autoClear = false;
    renderer.render(scene, camera);
    renderer.autoClear = true;
    for (const o of hide) o.visible = true;
  } else renderer.render(scene, camera);
  scene.overrideMaterial = null;
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
