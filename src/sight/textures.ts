// Procedural textures, drawn in code at 32 px: the god's ribbed walls with bone-iron inlay, grated
// floor plates, a vaulted ceiling, and the vein pattern that glows. No files.

import * as THREE from 'three';

const S = 32;

/** a cheap hash noise 0..1 for pixel (x, y) and a salt */
export function noise(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Paint = (x: number, y: number) => [number, number, number];

function tex(paint: Paint): THREE.DataTexture {
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * S + x) * 4;
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
      d[i + 3] = 255;
    }
  const t = new THREE.DataTexture(d, S, S);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const shade = (c: [number, number, number], k: number): [number, number, number] => [c[0] * k, c[1] * k, c[2] * k];

/** ribs run up the wall like a ribcage; a bone-iron stud sits between them */
export const wallPaint: Paint = (x, y) => {
  const base: [number, number, number] = [92, 74, 62];
  const rib = x % 8;
  let k = rib === 0 ? 0.45 : rib === 1 ? 1.35 : rib === 2 ? 1.15 : 0.85;
  // a seam across the wall, a little below the middle
  if (y === 20 || y === 21) k *= y === 20 ? 0.5 : 1.2;
  k *= 0.85 + noise(x, y, 1) * 0.3;
  // bone-iron inlay: a pale diamond between ribs
  const dx = Math.abs((x % 8) - 5);
  const dy = Math.abs((y % 16) - 9);
  if (dx + dy <= 1) return shade([200, 186, 160], 0.8 + noise(x, y, 2) * 0.3);
  return shade(base, k);
};

export const floorPaint: Paint = (x, y) => {
  const groove = x % 16 === 0 || y % 16 === 0;
  const grate = (x + y) % 4 === 0 && x % 16 > 3 && x % 16 < 13 && y % 16 > 3 && y % 16 < 13;
  const k = groove ? 0.35 : grate ? 0.6 : 0.9 + noise(x, y, 3) * 0.25;
  return shade([58, 46, 42], k);
};

export const ceilPaint: Paint = (x, y) => {
  const k = (y % 8 < 2 ? 1.3 : 0.7) * (0.85 + noise(x, y, 4) * 0.3);
  return shade([38, 30, 32], k);
};

/** where a vein runs in its wall: a wandering line with a branch */
function veinAt(x: number, y: number): boolean {
  const main = Math.round(16 + Math.sin(y * 0.35) * 6 + Math.sin(y * 0.9) * 2);
  const branch = y > 8 && y < 26 && Math.abs(x - (main + Math.round((y - 8) * 0.6))) <= 0;
  return Math.abs(x - main) <= 1 || branch;
}

export const veinPaint: Paint = (x, y) => (veinAt(x, y) ? [255, 255, 255] : shade(wallPaint(x, y), 0.6));
/** the emissive mask: only the vein glows */
export const veinGlow: Paint = (x, y) => (veinAt(x, y) ? [255, 255, 255] : [0, 0, 0]);

let made: Record<string, THREE.DataTexture> | null = null;
export function textures(): Record<'wall' | 'floor' | 'ceil' | 'vein' | 'glow', THREE.DataTexture> {
  made ??= { wall: tex(wallPaint), floor: tex(floorPaint), ceil: tex(ceilPaint), vein: tex(veinPaint), glow: tex(veinGlow) };
  return made as Record<'wall' | 'floor' | 'ceil' | 'vein' | 'glow', THREE.DataTexture>;
}
