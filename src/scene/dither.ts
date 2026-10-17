// Colours to the frame's palette (DESIGN 8, Maks 10-17): RGB frames, res*res*3, a 4 by 4 Bayer
// ordered dither between the colours of a small dusk palette (8 at 64 px, 32 after optics).

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** the first snap's dusk palette, picked from the scene's own colours (a k-means over the
 * frames, then pulled toward Maks's four): shadow, slate, rust, amber, cream and their darks */
export const DUSK = [0x0a0807, 0x2e2e36, 0x6a6c78, 0x52301c, 0x84492a, 0xc4823e, 0xe2b47c, 0xf0e4c8];

/** after optics: 32 colours along the same ramps, so a 160 px frame keeps the 64 px frame's look */
export const DUSK32 = ramp32();

function ramp32(): number[] {
  const mix = (a: number, b: number, t: number) => {
    const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return (c(16) << 16) | (c(8) << 8) | c(0);
  };
  // the ramps the scene lives on: shadow to rust to amber to cream, the slate of metal and sky, pale metal
  const ramps: [number[], number][] = [
    [[0x0a0807, 0x2c180c, 0x52301c, 0x74442a, 0xa4683a, 0xcc9a62, 0xe4c494, 0xf4ead4], 18],
    [[0x121216, 0x2c2c32, 0x4a4c56, 0x70727e, 0x9a9ca6], 8],
    [[0x5c5a56, 0x8c8880, 0xb8b4aa, 0xddd8cc], 6],
  ];
  const out: number[] = [];
  for (const [stops, n] of ramps)
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(t));
      out.push(mix(stops[k], stops[k + 1], t - k));
    }
  return out;
}

const rgbOf = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** dither res*res*3 RGB to `palette`; `spread` is how far (0..255) the Bayer threshold pushes each pixel */
export function dither(rgb: Uint8Array, res: number, palette: number[], spread: number): Uint8Array {
  const pal = palette.map(rgbOf);
  const out = new Uint8Array(rgb.length);
  for (let y = 0; y < res; y++)
    for (let x = 0; x < res; x++) {
      const i = (y * res + x) * 3;
      const t = ((BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * spread;
      const r = rgb[i] + t;
      const g = rgb[i + 1] + t;
      const b = rgb[i + 2] + t;
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < pal.length; k++) {
        const [pr, pg, pb] = pal[k];
        // weighted distance: the eye cares for green most, blue least
        const d = 3 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 2 * (b - pb) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      out.set(pal[best], i);
    }
  return out;
}

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** shrink size*size*3 RGB to res*res*3: the average, pulled toward the pixel of the square whose
 * brightness stands furthest out, so a thin pole or a small lit crate survives the shrink */
export function shrink(src: Uint8Array, size: number, res: number, keep = 0.5): Uint8Array {
  const k = size / res;
  const out = new Uint8Array(res * res * 3);
  for (let y = 0; y < res; y++)
    for (let x = 0; x < res; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const p = ((y * k + j) * size + x * k + i) * 3;
          sr += src[p];
          sg += src[p + 1];
          sb += src[p + 2];
        }
      const n = k * k;
      const avg = [sr / n, sg / n, sb / n];
      const al = lum(avg[0], avg[1], avg[2]);
      let edge = avg;
      let far = 0;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const p = ((y * k + j) * size + x * k + i) * 3;
          const d = Math.abs(lum(src[p], src[p + 1], src[p + 2]) - al);
          if (d > far) {
            far = d;
            edge = [src[p], src[p + 1], src[p + 2]];
          }
        }
      const o = (y * res + x) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(avg[c] + (edge[c] - avg[c]) * keep);
    }
  return out;
}

/** the mid-road smear: a horizontal box blur of RGB, `r` pixels each way */
export function smear(rgb: Uint8Array, res: number, r: number): Uint8Array {
  const out = new Uint8Array(rgb.length);
  for (let y = 0; y < res; y++)
    for (let x = 0; x < res; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0;
        let n = 0;
        for (let d = -r; d <= r; d++) {
          const xx = Math.min(res - 1, Math.max(0, x + d));
          s += rgb[(y * res + xx) * 3 + c];
          n++;
        }
        out[(y * res + x) * 3 + c] = Math.round(s / n);
      }
  return out;
}
