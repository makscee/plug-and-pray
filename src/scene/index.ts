// The 3D world and the camera (DESIGN 8, 12): one Three.js plain, seen three ways:
// render() for the frames (colour, dithered to a dusk palette, plus an object-id pass for the `?` masks),
// still() for the stored frames, cam() full screen at the end.

import * as THREE from 'three';
import { dither, DUSK, DUSK32, shrink, smear } from './dither';
import { figure, height, KM, off, plain, PLACES, type Plain } from './plain';

export interface Thing {
  /** thing node id, "?crate" */
  id: string;
  /** res*res, 1 where the thing covers the pixel */
  mask: Uint8Array;
}

export interface Shot {
  /** res*res*3 RGB, every pixel a colour of the frame's palette */
  pixels: Uint8Array;
  /** things in view, left to right */
  things: Thing[];
}

export interface View {
  /** place node id, "@here" */
  place: string;
  /** degrees, 0 = north */
  heading: number;
  res: 64 | 160;
  /** mid-road smear */
  blur?: boolean;
  /** km east/north, instead of the place's own position (a snap mid-road) */
  at?: [number, number];
}

const FOV = 60;
const EYE = 1.95;
const PITCH = -9;
/** frames are rendered this many times larger, then averaged down */
const SS = 4;

let P: Plain | null = null;
let gl: THREE.WebGLRenderer | null = null;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 9000);
camera.rotation.order = 'YXZ';

function setup(): { p: Plain; r: THREE.WebGLRenderer } {
  if (!P) P = plain();
  if (!gl) {
    gl = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    // the same look as cam, so a frame's colours are the colours the player later sees
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
  }
  return { p: P, r: gl };
}

/** put T and the camera at metres east, north, looking along heading */
function stand(p: Plain, e: number, n: number, heading: number, pitch = PITCH): void {
  p.ground(e, n);
  const y = height(e, n);
  // T turns under its mast, so the deck, the panel edge and the wheels sit in every frame
  p.self.position.set(e, y, -n);
  p.self.rotation.set(0, (-heading * Math.PI) / 180, 0);
  // the mast stands at the left rear of the deck: the left front wheel is in the corner of every frame
  const back = 0.75;
  const left = 0.42;
  const h = (heading * Math.PI) / 180;
  camera.position.set(e - Math.sin(h) * back - Math.cos(h) * left, y + EYE, -(n - Math.cos(h) * back + Math.sin(h) * left));
  camera.rotation.set((pitch * Math.PI) / 180, -h, 0);
}

function where(v: View): [number, number] {
  const [x, y] = v.at ?? PLACES[v.place] ?? [0, 0];
  return [x * KM, y * KM];
}

const targets = new Map<number, THREE.WebGLRenderTarget>();
function target(size: number): THREE.WebGLRenderTarget {
  let t = targets.get(size);
  if (!t) {
    t = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType });
    targets.set(size, t);
  }
  return t;
}

/** read a target as rows top to bottom */
function read(r: THREE.WebGLRenderer, t: THREE.WebGLRenderTarget, size: number): Uint8Array {
  const buf = new Uint8Array(size * size * 4);
  r.readRenderTargetPixels(t, 0, 0, size, size, buf);
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) out.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  return out;
}

/** the scene as the cam sees it (tone mapped, sRGB), shrunk to res*res*3 */
function colours(r: THREE.WebGLRenderer, p: Plain, res: number): Uint8Array {
  const size = res * SS;
  // tone mapping only reaches the drawing buffer, not a render target: render there and read it back
  r.setRenderTarget(null);
  r.setSize(size, size, false);
  r.render(p.scene, camera);
  const c = r.getContext();
  const buf = new Uint8Array(size * size * 4);
  c.readPixels(0, 0, size, size, c.RGBA, c.UNSIGNED_BYTE, buf);
  const rgb = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = ((size - 1 - y) * size + x) * 4;
      rgb.set(buf.subarray(i, i + 3), (y * size + x) * 3);
    }
  return shrink(rgb, size, res);
}

/** a frame's palette and dither spread: eight dusk colours at 64, thirty-two and a light dither at 160;
 * the colours are pushed a little apart first, so the palette's amber and rust both come out */
function look(rgb: Uint8Array, res: number): Uint8Array {
  const c = new Uint8Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const l = 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
    for (let k = 0; k < 3; k++) c[i + k] = Math.max(0, Math.min(255, l + (rgb[i + k] - l) * SAT));
  }
  return res >= 160 ? dither(c, res, DUSK32, 16) : dither(c, res, DUSK, 36);
}
const SAT = 1.35;

/** the object-id pass: every thing in a flat colour of its own, the rest black */
function ids(r: THREE.WebGLRenderer, p: Plain, res: number): Thing[] {
  const things: string[] = [];
  const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  p.scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const m = o as THREE.Mesh;
    let a: THREE.Object3D | null = m;
    while (a && !a.userData.thing) a = a.parent;
    saved.set(m, m.material);
    if (!a) {
      m.material = black;
      return;
    }
    let i = things.indexOf(a.userData.thing);
    if (i < 0) i = things.push(a.userData.thing) - 1;
    m.material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(((i + 1) * 20) / 255, 0, 0), fog: false, toneMapped: false });
  });
  const bg = p.scene.background;
  const shadows = r.shadowMap.enabled;
  r.shadowMap.enabled = false;
  const t = target(res);
  r.setRenderTarget(t);
  r.setClearColor(0x000000, 1);
  r.clear();
  r.render(p.scene, camera);
  r.setRenderTarget(null);
  r.shadowMap.enabled = shadows;
  p.scene.background = bg;
  for (const [m, mat] of saved) {
    if (m.material !== black) (m.material as THREE.Material).dispose();
    m.material = mat;
  }
  const rgba = read(r, t, res);
  const found: { id: string; mask: Uint8Array; x: number }[] = [];
  things.forEach((id, i) => {
    const mask = new Uint8Array(res * res);
    let n = 0;
    let sx = 0;
    for (let k = 0; k < mask.length; k++)
      if (Math.round(rgba[k * 4] / 20) === i + 1) {
        mask[k] = 1;
        n++;
        sx += k % res;
      }
    if (n) found.push({ id, mask, x: sx / n });
  });
  return found.sort((a, b) => a.x - b.x).map(({ id, mask }) => ({ id, mask }));
}

export function render(v: View): Shot {
  const { p, r } = setup();
  const [e, n] = where(v);
  p.habMast(false);
  p.figures.clear();
  p.self.visible = true;
  stand(p, e, n, v.heading);
  let c = colours(r, p, v.res);
  if (v.blur) c = smear(c, v.res, Math.round(v.res / 10));
  const pixels = look(c, v.res);
  return { pixels, things: ids(r, p, v.res) };
}

// ---- the stored frames in IMG (DESIGN 8): the same plain, before the storm ----

interface Still {
  /** metres east, north */
  at: [number, number];
  heading: number;
  pitch?: number;
  /** figures: metres east, north, waving */
  figures: [number, number, boolean?][];
}

const STILLS: Record<string, () => Still> = {
  // landing day: the lander upright, two figures by its legs
  land: () => {
    const l = off('@LDR', 200, 22);
    return { at: [l[0] + 8, l[1] + 8], heading: 225, pitch: 6, figures: [[l[0] + 4, l[1] + 3], [l[0] + 5.5, l[1] + 1.5]] };
  },
  // the habitat with its mast up and the four in front of it, waving
  crew: () => {
    const h = off('@HAB', 20, 26);
    return { at: [h[0] - 1, h[1] - 14], heading: 0, pitch: 2, figures: [[h[0] - 3, h[1] - 6, true], [h[0] - 1.5, h[1] - 6.4], [h[0], h[1] - 6.2, true], [h[0] + 1.5, h[1] - 5.8, true]] };
  },
  // the operator waving at T, close
  wave: () => {
    const h = off('@HAB', 20, 26);
    return { at: [h[0] + 4.2, h[1] - 15.5], heading: 345, pitch: 4, figures: [[h[0] + 3.3, h[1] - 12.5, true]] };
  },
};

export const STILL_NAMES = Object.keys(STILLS);

/** a stored frame by name, at 64 by 64 in the dusk palette */
export function still(name: string): Shot {
  const { p, r } = setup();
  const s = (STILLS[name] ?? STILLS.land)();
  p.habMast(true);
  p.figures.clear();
  for (const [e, n, wave] of s.figures) {
    const f = figure(!!wave);
    f.position.set(e, height(e, n), -n);
    f.rotation.y = Math.random() * 0.4;
    p.figures.add(f);
  }
  stand(p, s.at[0], s.at[1], s.heading, s.pitch ?? 0);
  p.self.visible = false;
  const pixels = look(colours(r, p, 64), 64);
  p.self.visible = true;
  p.figures.clear();
  p.habMast(false);
  return { pixels, things: [] };
}

// ---- cam (DESIGN 8): full screen behind the windows, slow pan and tilt only ----

let camGl: THREE.WebGLRenderer | null = null;
let camRaf = 0;

/** open the full-screen camera at a place and heading; resolves when it is showing */
export async function cam(place: string, heading: number): Promise<void> {
  const p = setup().p;
  if (!camGl) {
    camGl = new THREE.WebGLRenderer({ antialias: true });
    camGl.shadowMap.enabled = true;
    camGl.shadowMap.type = THREE.PCFSoftShadowMap;
    camGl.outputColorSpace = THREE.SRGBColorSpace;
    camGl.toneMapping = THREE.ACESFilmicToneMapping;
    camGl.domElement.id = 'cam';
  }
  const r = camGl;
  document.body.prepend(r.domElement);
  document.body.classList.add('cam-on');
  const [e, n] = where({ place, heading, res: 64 });
  const eye = new THREE.PerspectiveCamera(55, 1, 0.1, 9000);
  eye.rotation.order = 'YXZ';
  let mx = 0.5;
  let my = 0.5;
  const move = (ev: MouseEvent) => {
    mx = ev.clientX / innerWidth;
    my = ev.clientY / innerHeight;
  };
  addEventListener('mousemove', move);
  let yaw = heading;
  let pitch = -4;
  const t0 = performance.now();
  cancelAnimationFrame(camRaf);
  await new Promise<void>((ok) => {
    let first = true;
    const frame = () => {
      if (!document.body.classList.contains('cam-on')) {
        removeEventListener('mousemove', move);
        return;
      }
      r.setSize(innerWidth, innerHeight, false);
      eye.aspect = innerWidth / innerHeight;
      eye.updateProjectionMatrix();
      // the mouse steers where the head turns; it turns slowly, and drifts on its own
      const drift = Math.sin((performance.now() - t0) / 9000) * 12;
      const wantYaw = heading + (mx - 0.5) * 160 + drift;
      const wantPitch = -4 + (0.5 - my) * 30;
      yaw += (wantYaw - yaw) * 0.015;
      pitch += (wantPitch - pitch) * 0.015;
      stand(p, e, n, heading);
      eye.position.copy(camera.position);
      eye.rotation.set((pitch * Math.PI) / 180, (-yaw * Math.PI) / 180, 0);
      r.render(p.scene, eye);
      if (first) {
        first = false;
        ok();
      }
      camRaf = requestAnimationFrame(frame);
    };
    frame();
  });
}

export function closeCam(): void {
  document.body.classList.remove('cam-on');
  cancelAnimationFrame(camRaf);
  camGl?.domElement.remove();
}
