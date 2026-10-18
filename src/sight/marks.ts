// What only some eyes see (src/world/secrets.ts), drawn into the scene per shot: warm handprints and a
// warm plate for heat, scratched scripture on a wall for black & white and outlines, a hollow wall
// ringing on sonar. And the floor grid that gives the dark zones their shape on a colour eye.

import * as THREE from 'three';
import type { Game } from '../core/types';
import { secrets } from '../world/secrets';
import { Cell, cell } from '../core/grid';
import { hash, rng } from '../core/rng';
import type { Mode } from './scene';

type U = { value: number };

const canvasTex = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture => {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
};

/** a hand, fingers up: a palm, four fingers and a thumb */
let handTex: THREE.Texture | null = null;
const hand = () =>
  (handTex ??= canvasTex(16, 16, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.ellipse(8, 11, 4, 3.6, 0, 0, Math.PI * 2);
    c.fill();
    for (const [x, len] of [[4.5, 5], [7, 6.5], [9.5, 6], [12, 4.5]]) c.fillRect(x - 1, 9 - len, 2, len);
    c.fillRect(1, 9, 3, 2);
  }));

/** scripture: three rows of runes cut pale through a dark slab, the strokes picked by the salt */
const scriptTex = new Map<number, THREE.Texture>();
function script(salt: number): THREE.Texture {
  let t = scriptTex.get(salt);
  if (t) return t;
  const r = rng(hash(salt, 5));
  t = canvasTex(32, 24, (c) => {
    const strokes: [number, number, number, number][] = [];
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 5; k++) {
        const x = 2 + k * 6, y = 2 + row * 7;
        // a rune: a stave and one or two branches
        strokes.push([x + 2, y, x + 2, y + 5]);
        for (let b = r.int(1, 2); b > 0; b--) strokes.push([x + 2, y + r.int(0, 3), x + (r.chance(0.5) ? 0 : 4), y + r.int(0, 5)]);
      }
    const line = (w: number, col: string) => {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.lineCap = 'square';
      for (const [a, b, cc, d] of strokes) {
        c.beginPath();
        c.moveTo(a + 0.5, b + 0.5);
        c.lineTo(cc + 0.5, d + 0.5);
        c.stroke();
      }
    };
    // a soot-dark slab the strokes are cut through, ragged at the edge: black & white reads it as a tablet
    c.fillStyle = '#000';
    for (let y = 0; y < 24; y++) {
      const a = r.int(0, 2), b = r.int(0, 2);
      c.fillRect(a, y, 32 - a - b, 1);
    }
    line(1, '#fff');
  });
  scriptTex.set(salt, t);
  return t;
}

const flat = new THREE.PlaneGeometry(1, 1);
const heatMat = new Map<string, THREE.Material>();
/** a warm thing on a heat eye: drawn over the cold world, but behind its walls */
function warm(t: THREE.Texture, heat: number): THREE.Material {
  const k = `${t.id}:${heat.toFixed(2)}`;
  let m = heatMat.get(k);
  if (!m) heatMat.set(k, (m = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, color: new THREE.Color().setHSL(0.08 - heat * 0.08, 1, 0.1 + heat * 0.85), fog: false, side: THREE.DoubleSide, depthTest: true })));
  return m;
}
let plateTex: THREE.Texture | null = null;
const plate = () => (plateTex ??= canvasTex(8, 8, (c) => {
  c.fillStyle = '#fff';
  c.fillRect(1, 1, 6, 6);
}));

const depthVert = `
  uniform float uSnap;
  varying float vDist;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
    gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;
  }`;
let hollowMat: THREE.ShaderMaterial | null = null;
const cutMats = new Map<THREE.Texture, THREE.Material>();
const scratchMats = new Map<THREE.Texture, THREE.Material>();
/** outlines: a stroke reads as a hole (nothing there), so the edge eye draws a line round it */
function cut(u: { snap: U }, t: THREE.Texture): THREE.Material {
  let m = cutMats.get(t);
  if (!m)
    cutMats.set(t, (m = new THREE.ShaderMaterial({
      uniforms: { uSnap: u.snap, uMask: { value: t } },
      side: THREE.DoubleSide,
      vertexShader: depthVert,
      fragmentShader: `
        uniform sampler2D uMask;
        varying vec2 vUv;
        void main() {
          vec4 m = texture2D(uMask, vUv);
          if (m.a < 0.5 || m.r < 0.5) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }`,
    })));
  return m;
}
/** black & white: the strokes pale, their rims dark, on the wall */
function scratch(t: THREE.Texture): THREE.Material {
  let m = scratchMats.get(t);
  if (!m) scratchMats.set(t, (m = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide })));
  return m;
}
/** sonar: the shell's distance as usual, flagged in blue so the filter makes it ring */
const hollow = (u: { snap: U; range: U }) =>
  (hollowMat ??= new THREE.ShaderMaterial({
    uniforms: { uSnap: u.snap, uRange: u.range },
    side: THREE.DoubleSide,
    vertexShader: depthVert,
    fragmentShader: `
      uniform float uRange;
      varying float vDist;
      void main() {
        float v = clamp(1.0 - vDist / uRange, 0.0, 1.0) * 255.0;
        gl_FragColor = vec4(floor(v) / 255.0, fract(v), 1.0, 1.0);
      }`,
  }));

/** a plane standing on a wall's face, facing the floor (a hair out, so it never fights the wall) */
function onWall(o: THREE.Mesh, x: number, y: number, fx: number, fy: number, w: number, h: number): THREE.Mesh {
  o.scale.set(w, h, 1);
  o.position.set(x + 0.5 + fx * 0.52, 0.5, y + 0.5 + fy * 0.52);
  o.rotation.y = Math.atan2(fx, fy);
  return o;
}

/** add the secrets this filter shows, near you, to the group */
export function addMarks(g: Game, group: THREE.Group, mode: Mode, filter: string, u: { snap: U; range: U }, R: number): void {
  const p = g.player;
  for (const s of secrets(g)) {
    if (Math.abs(s.x - p.x) > R || Math.abs(s.y - p.y) > R) continue;
    if (s.kind === 'hands' && filter === 'heat' && !s.done) {
      // the prints: left, right, left along the way to the plate, warmer as they near it
      const path = [...s.trail, [s.x, s.y] as [number, number]];
      for (let k = 0; k < s.trail.length; k++) {
        const [x, y] = path[k];
        const [nx, ny] = path[k + 1];
        const a = Math.atan2(nx - x, -(ny - y));
        const side = k % 2 ? 0.16 : -0.16;
        const o = new THREE.Mesh(flat, warm(hand(), 0.12 + (0.22 * k) / s.trail.length));
        // a print never shrinks below a smudge a cheap eye can show
        const sz = 0.3 * Math.max(1, Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / 2.5);
        o.scale.set(sz, sz, 1);
        // flat on the floor, fingers along the way
        o.rotation.set(-Math.PI / 2, -a, 0, 'YXZ');
        o.position.set(x + 0.5 + Math.cos(a) * side, 0.06, y + 0.5 + Math.sin(a) * side);
        o.renderOrder = 2;
        group.add(o);
      }
      // and on the walls along the way, at the height of a crawling thing's reach: "the wall was covered in handprints"
      for (let k = 0; k < s.trail.length; k++) {
        const [x, y] = s.trail[k];
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const h = hash(s.salt, x, y, dx * 3 + dy);
          if (h % 3 === 0 || cell(g, x + dx, y + dy) === Cell.floor) continue;
          const sz = 0.3 * Math.max(1, Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / 2.5);
          const o = onWall(new THREE.Mesh(flat, warm(hand(), 0.16 + (0.22 * k) / s.trail.length)), x + dx, y + dy, -dx, -dy, sz, sz);
          o.position.y = 0.22 + ((h >> 4) % 40) / 100;
          o.rotateZ((((h >> 8) % 90) - 45) / 60);
          o.renderOrder = 2;
          group.add(o);
        }
      }
      const o = new THREE.Mesh(flat, warm(plate(), Math.round((0.4 + 0.08 * Math.sin(g.t * 4)) * 20) / 20));
      o.scale.set(0.6, 0.6, 1);
      o.rotation.x = -Math.PI / 2;
      o.position.set(s.x + 0.5, 0.05, s.y + 0.5);
      o.renderOrder = 2;
      group.add(o);
    } else if (s.kind === 'script' && (filter === '1bit' || filter === 'edge')) {
      if (cell(g, s.x, s.y) === Cell.floor) continue;
      const t = script(s.salt);
      const mat = mode === 'depth' ? cut(u, t) : scratch(t);
      group.add(onWall(new THREE.Mesh(flat, mat), s.x, s.y, s.fx, s.fy, 0.8, 0.6));
    } else if (s.kind === 'hollow' && filter === 'sonar' && !s.done) {
      group.add(onWall(new THREE.Mesh(flat, hollow(u)), s.x, s.y, s.fx, s.fy, 1, 1));
    }
  }
}

/** a flag a hollow wall leaves in a depth shot's blue channel (src/sight/index.ts sonar) */
export const HOLLOW = 200;

// ---- the floor grid: on a colour eye in the dark zones, cell seams on the floor and a brighter line
// where floor meets wall, fading with distance, so the space reads where the light does not reach

const gridGeo = new THREE.BufferGeometry();
let gridMat: THREE.ShaderMaterial | null = null;
export const gridLight = { value: 0 };
export function gridMesh(u: { snap: U }): THREE.LineSegments {
  gridMat ??= new THREE.ShaderMaterial({
    uniforms: { uSnap: u.snap, uLight: gridLight },
    vertexShader: `
      uniform float uSnap;
      attribute float aK;
      varying float vDist;
      varying float vK;
      void main() {
        vK = aK;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;
      }`,
    fragmentShader: `
      uniform float uLight;
      varying float vDist;
      varying float vK;
      void main() {
        float f = clamp(1.0 - vDist / 7.0, 0.0, 1.0);
        gl_FragColor = vec4(vec3(0.62, 0.48, 0.34) * vK * f * f * uLight, 1.0);
      }`,
  });
  return new THREE.LineSegments(gridGeo, gridMat);
}

/** rebuild the grid around (cx, cy) */
export function buildGrid(g: Game, cx: number, cy: number, R: number): void {
  const pos: number[] = [];
  const ks: number[] = [];
  const seg = (x0: number, y0: number, x1: number, y1: number, k: number) => {
    pos.push(x0, 0.003, y0, x1, 0.003, y1);
    ks.push(k, k);
  };
  for (let y = cy - R; y <= cy + R; y++)
    for (let x = cx - R; x <= cx + R; x++) {
      if (cell(g, x, y) !== Cell.floor) continue;
      // each floor cell draws its north and west seams; any side on a wall is the bright skirting line
      const n = cell(g, x, y - 1) === Cell.floor, w = cell(g, x - 1, y) === Cell.floor;
      const s = cell(g, x, y + 1) === Cell.floor, e = cell(g, x + 1, y) === Cell.floor;
      seg(x, y, x + 1, y, n ? 0.25 : 0.6);
      seg(x, y, x, y + 1, w ? 0.25 : 0.6);
      if (!s) seg(x, y + 1, x + 1, y + 1, 0.6);
      if (!e) seg(x + 1, y, x + 1, y + 1, 0.6);
    }
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  gridGeo.setAttribute('aK', new THREE.Float32BufferAttribute(ks, 1));
  gridGeo.computeBoundingSphere();
}
