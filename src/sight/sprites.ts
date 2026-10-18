// Enemy sprites: procedural pixel art, drawn into small canvases once at load (LD Compo: all art made
// in code). Each type has frames: two idle, one attack, one white hit flash, plus a mask of each
// (white where opaque) that the heat and sonar eyes use as a silhouette. Drawn symmetric about the
// middle, outlined in near black so they read on the 4-shade pinhole too.

export const SIZE = 32;

/** one frame's pixels: a colour per cell, or 0 for clear */
type Px = (x: number, y: number, c: string) => void;
/** draws one frame: `f` is 0/1 for idle, 2 for attack */
type Art = (px: Px, f: number) => void;

export interface SpriteDef {
  art: Art;
  /** height on screen in cells (a wall is 1) */
  size: number;
  /** the sprite's bottom above the floor (floaters hover) */
  lift: number;
  /** warmth on a heat eye 0..1 */
  heat: number;
  /** width over height (bosses are broad); 1 when left out */
  wide?: number;
}

const disc = (px: Px, cx: number, cy: number, r: number, c: string) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) px(x, y, c);
};
const ell = (px: Px, cx: number, cy: number, rx: number, ry: number, c: string) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) px(x, y, c);
};
const rect = (px: Px, x0: number, y0: number, w: number, h: number, c: string) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, c);
};
const line = (px: Px, x0: number, y0: number, x1: number, y1: number, c: string) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) px(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), c);
};
/** left half only: the frame is mirrored, so draw x < 16 */
const both = (px: Px): Px => (x, y, c) => {
  px(x, y, c);
  px(SIZE - 1 - x, y, c);
};

export const SPRITES: Record<string, SpriteDef> = {
  // a choir mite: a low rust beetle, six legs, two red eyes; it opens its mandibles to bite
  mite: {
    size: 0.6, lift: 0, heat: 0.7,
    art(p, f) {
      const s = both(p);
      for (let k = 0; k < 3; k++) {
        const y = 18 + k * 4 + (f === 1 ? (k % 2 ? 1 : -1) : 0);
        line(s, 7, y + 4, 11, y, '#5a3424');
        line(s, 4, y + 7, 7, y + 4, '#5a3424');
      }
      ell(p, 16, 21, 8, 7, '#7a4630');
      ell(p, 16, 19, 6, 4, '#a0603c');
      rect(p, 15, 14, 2, 14, '#4a2a1c');
      disc(p, 16, 13, 4.2, '#6a3a28');
      s(13, 12, '#ff3020');
      s(14, 12, '#ff9070');
      const open = f === 2 ? 3 : 1;
      line(s, 14, 16, 15 - open, 18 + open, '#e0c8a0');
    },
  },
  // a seraph lamp: a floating golden eye in a wheel of feathered rays; it flares white to fire
  seraph: {
    size: 0.6, lift: 0.25, heat: 1,
    art(p, f) {
      wheel(p, f, ['#f0d080', '#c08030', '#fff0c0', '#ffffff', '#402010']);
    },
  },
  pyre: {
    size: 0.6, lift: 0.25, heat: 1,
    art(p, f) {
      wheel(p, f, ['#ff8030', '#a02010', '#ffd060', '#fff4c0', '#300808']);
    },
  },
  // an ossuary walker: a tall thing of bone, a skull and ribs on two long legs; it raises its arms
  walker: {
    size: 0.85, lift: 0, heat: 0.8,
    art(p, f) {
      bones(p, f, '#d8c8a8', '#8a7a60', '#ff5030', false);
    },
  },
  abbot: {
    size: 0.95, lift: 0, heat: 0.9,
    art(p, f) {
      bones(p, f, '#e8dcc0', '#7a5a8a', '#c060ff', true);
    },
  },
  // the hum: a knot of dark smoke with violet eyes (only warm-seeing eyes ever find it)
  hum: {
    size: 0.8, lift: 0.15, heat: 0.9,
    art(p, f) {
      const w = f === 1 ? 1 : 0;
      for (let k = 0; k < 7; k++) disc(p, 16 + Math.sin(k * 2.1 + w) * 7, 16 + Math.cos(k * 1.7 + w) * 6, 5 + (k % 3), k % 2 ? '#241830' : '#3a2848');
      disc(p, 16, 16, 7, '#120a18');
      const e = f === 2 ? '#ffffff' : '#c080ff';
      rect(p, 12, 14, 2, 2, e);
      rect(p, 18, 14, 2, 2, e);
    },
  },
  // a mimic: a reliquary box that was never a module; teeth, a tongue, an eye in the lid
  mimic: {
    size: 0.55, lift: 0, heat: 0.5,
    art(p, f) {
      const gape = f === 2 ? 6 : f === 1 ? 3 : 2;
      rect(p, 6, 18, 20, 12, '#6a4428');
      rect(p, 6, 18, 20, 2, '#c08040');
      rect(p, 6, 28, 20, 2, '#3a2214');
      rect(p, 6, 18 - gape - 8, 20, 8, '#7a5030');
      rect(p, 6, 18 - gape - 8, 20, 2, '#d09050');
      rect(p, 7, 18 - gape, 18, gape, '#200808');
      for (let x = 7; x < 25; x += 3) {
        p(x, 18 - gape, '#f0e8d0');
        p(x + 1, 17, '#f0e8d0');
      }
      if (f === 2) rect(p, 14, 18 - gape + 1, 4, gape + 2, '#d03050');
      disc(p, 16, 18 - gape - 4, 2, '#f0e0a0');
      p(16, 18 - gape - 4, '#200808');
    },
  },
  // the choir warden: a mite grown huge and haloed, purple carapace; elite of the nave
  warden: {
    size: 0.8, lift: 0, heat: 0.8,
    art(p, f) {
      const s = both(p);
      ring(p, 16, 7, 6, '#f0d080');
      for (let k = 0; k < 3; k++) line(s, 9, 20 + k * 3 + (f === 1 && k === 1 ? 1 : 0), 2, 26 + k * 2, '#3a2040');
      ell(p, 16, 21, 9, 8, '#5a3070');
      ell(p, 16, 19, 6, 5, '#8a50a0');
      rect(p, 15, 13, 2, 15, '#2a1830');
      disc(p, 16, 13, 4.5, '#4a2858');
      s(13, 12, '#ffd040');
      s(14, 13, '#ffd040');
      const open = f === 2 ? 4 : 1;
      line(s, 13, 16, 13 - open, 18 + open, '#f0e0c0');
    },
  },
  // the furnace saint: a burning figure, arms wide, a halo of fire
  saint: {
    size: 0.95, lift: 0, heat: 1,
    art(p, f) {
      const s = both(p);
      const flick = f === 1 ? 1 : 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + flick * 0.3;
        line(p, 16 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, 16 + Math.cos(a) * (8 + (k % 2) * 2), 8 + Math.sin(a) * (8 + (k % 2) * 2), k % 2 ? '#ffd060' : '#ff7020');
      }
      ring(p, 16, 8, 5, '#ffe080');
      disc(p, 16, 8, 3, '#401808');
      s(15, 8, f === 2 ? '#ffffff' : '#ff9030');
      rect(p, 12, 12, 8, 14, '#702010');
      rect(p, 13, 12, 6, 12, '#a03818');
      ell(p, 16, 30, 7 + flick, 2, '#ff8030');
      const arm = f === 2 ? -6 : 0;
      line(s, 12, 14, 5, 20 + arm, '#a03818');
      line(s, 11, 14, 4, 20 + arm, '#702010');
      s(4, 19 + arm, '#ffe080');
      rect(p, 14, 20, 4, 3, '#ffd060');
    },
  },
};


// ---- bosses (src/fight/bosses.ts): as tall as a room, broad, each its own shape. Frame 2 is the wind-up.
Object.assign(SPRITES, {
  // the great warden: the nave's warden grown to fill the room, two haloes, a spiked back
  'boss-warden': {
    size: 0.95, lift: 0, heat: 0.85, wide: 1.35,
    art(p: Px, f: number) {
      const s = both(p);
      ring(p, 16, 5, 7, '#f0d080');
      ring(p, 16, 5, 5, '#c09040');
      for (let k = 0; k < 4; k++) line(s, 8, 18 + k * 3 + (f === 1 && k % 2 ? 1 : 0), 0, 24 + k * 2, '#2a1830');
      ell(p, 16, 21, 12, 9, '#4a2860');
      ell(p, 16, 19, 9, 6, '#7a48a0');
      for (let k = 0; k < 5; k++) s(9 + k * 1.4, 13 - (k % 2) * 2, '#c0a0e0');
      disc(p, 16, 12, 5.5, '#3a2048');
      s(12, 11, '#ffd040');
      s(13, 12, '#ffd040');
      s(14, 10, '#ff6020');
      const open = f === 2 ? 6 : 2;
      line(s, 12, 15, 11 - open, 17 + open, '#f0e0c0');
      line(s, 13, 15, 12 - open, 17 + open, '#d0c0a0');
    },
  },
  // the mite queen: a swollen rust abdomen full of eggs, a small crowned head, many legs
  'boss-queen': {
    size: 0.85, lift: 0, heat: 0.8, wide: 1.4,
    art(p: Px, f: number) {
      const s = both(p);
      for (let k = 0; k < 4; k++) line(s, 9, 19 + k * 2, 1 + (f === 1 ? k % 2 : 0), 25 + k * 2, '#4a2a1c');
      ell(p, 16, 22, 13, 8, '#8a4a30');
      ell(p, 16, 21, 11, 6, '#b0683c');
      for (let k = 0; k < 6; k++) disc(p, 8 + k * 3.2, 22 + (k % 2) * 2, 1.4, '#f0d8a0');
      ell(p, 16, 12, 5, 4, '#6a3a28');
      disc(p, 16, 9, 3.5, '#5a3020');
      for (let x = 13; x <= 19; x += 2) p(x, 4 + (x % 4 ? 0 : -1), '#f0d080');
      rect(p, 13, 5, 7, 1, '#f0d080');
      s(14, 9, '#ff3020');
      const open = f === 2 ? 3 : 1;
      line(s, 15, 11, 14 - open, 13 + open, '#e0c8a0');
    },
  },
  // the bell: a bronze bell taller than you, an eye in its waist, the clapper showing under the lip
  'boss-bell': {
    size: 0.95, lift: 0, heat: 0.5, wide: 1.15,
    art(p: Px, f: number) {
      const tilt = f === 2 ? 3 : f === 1 ? 1 : 0;
      for (let y = 4; y < 27; y++) {
        const w = 4 + Math.pow((y - 4) / 23, 1.6) * 11;
        rect(p, Math.round(16 - w + tilt * (1 - (y - 4) / 23)), y, Math.round(w * 2), 1, y % 5 === 0 ? '#e0a040' : '#a87028');
      }
      rect(p, 3, 26, 26, 2, '#704818');
      rect(p, 14, 1, 4, 3, '#704818');
      disc(p, 16 + tilt, 15, 3, '#f0e0a0');
      disc(p, 16 + tilt, 15, 1.4, f === 2 ? '#ffffff' : '#300808');
      disc(p, 16 - tilt * 2, 29, 2.2, '#3a2810');
    },
  },
  // the seraph choir: three lamps wheeling round one great eye
  'boss-choir': {
    size: 0.95, lift: 0, heat: 1, wide: 1.3,
    art(p: Px, f: number) {
      const turn = f === 1 ? 0.3 : 0;
      for (let k = 0; k < 3; k++) {
        const a = turn + (k / 3) * Math.PI * 2 - Math.PI / 2;
        const [cx, cy] = [16 + Math.cos(a) * 10, 15 + Math.sin(a) * 10];
        for (let j = 0; j < 8; j++) line(p, cx, cy, cx + Math.cos(j * 0.8) * 4.5, cy + Math.sin(j * 0.8) * 4.5, '#f0d080');
        disc(p, cx, cy, 2.5, f === 2 ? '#ffffff' : '#fff0c0');
      }
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        line(p, 16 + Math.cos(a) * 6, 15 + Math.sin(a) * 6, 16 + Math.cos(a) * (f === 2 ? 10 : 8.5), 15 + Math.sin(a) * (f === 2 ? 10 : 8.5), k % 2 ? '#c08030' : '#f0d080');
      }
      ring(p, 16, 15, 6, '#c08030');
      disc(p, 16, 15, 5, f === 2 ? '#ffffff' : '#fff0c0');
      disc(p, 16, 15, 2.2, f === 2 ? '#fff4c0' : '#402010');
    },
  },
  // the mimic organ: a bank of pipes over a keyboard of teeth, a tongue for a pedal
  'boss-organ': {
    size: 0.95, lift: 0, heat: 0.5, wide: 1.4,
    art(p: Px, f: number) {
      for (let k = 0; k < 7; k++) {
        const h = 10 + Math.abs(3 - k) * -2 + 10 + (f === 1 && k % 2 ? 1 : 0);
        rect(p, 4 + k * 3.5, 22 - h, 3, h, k % 2 ? '#8a7050' : '#b09060');
        rect(p, 4 + k * 3.5, 22 - h, 3, 1, '#e0c890');
        rect(p, 5 + k * 3.5, 18 - Math.floor(h / 2), 1, 2, '#200808');
      }
      rect(p, 2, 20, 28, 9, '#5a3820');
      rect(p, 2, 20, 28, 2, '#c08040');
      const gape = f === 2 ? 4 : 1;
      rect(p, 4, 23, 24, gape + 1, '#200808');
      for (let x = 4; x < 28; x += 2) p(x, 23, '#f0e8d0');
      if (f === 2) rect(p, 14, 24, 4, gape + 2, '#d03050');
      disc(p, 16, 6, 2.5, '#f0e0a0');
      p(16, 6, '#200808');
    },
  },
  // the bell-ringer: a tall hooded thing with a handbell on a pole, raised to throw
  'boss-ringer': {
    size: 0.95, lift: 0, heat: 0.8, wide: 1,
    art(p: Px, f: number) {
      const s = both(p);
      for (let y = 9; y < 31; y++) rect(p, 16 - Math.round(3 + (y - 9) / 3), y, Math.round((3 + (y - 9) / 3) * 2), 1, y % 6 ? '#3a3048' : '#4a4060');
      disc(p, 16, 7, 4, '#2a2238');
      s(14, 7, '#c0e0ff');
      const up = f === 2 ? -6 : 0;
      line(p, 22, 20, 26, 6 + up, '#806040');
      ell(p, 26, 5 + up, 3, 3, '#e0a040');
      p(26, 8 + up, '#704818');
      line(p, 10, 14, 7, 20 - (f === 1 ? 1 : 0), '#3a3048');
    },
  },
  // the high abbot: a walker of bone in a tall mitre, a crozier in hand
  'boss-abbot': {
    size: 0.97, lift: 0, heat: 0.4, wide: 1.25,
    art(p: Px, f: number) {
      bones(p, f, '#f0e6d0', '#6a4a7a', '#d070ff', true);
      const up = f === 2 ? -4 : 0;
      line(p, 27, 30, 27, 6 + up, '#c0a060');
      ring(p, 27, 5 + up, 2.5, '#f0d080');
      for (let x = 2; x < 30; x += 4) p(x, 31, '#d8c8a8');
    },
  },
  // the ossuary hydra: three skulls on spines over a heap of bone
  'boss-hydra': {
    size: 0.95, lift: 0, heat: 0.4, wide: 1.4,
    art(p: Px, f: number) {
      ell(p, 16, 28, 14, 4, '#8a7a60');
      ell(p, 16, 27, 11, 3, '#c8b898');
      const heads: [number, number][] = [[6, 9], [16, 5], [26, 9]];
      heads.forEach(([hx, hy], k) => {
        const sway = f === 1 ? (k % 2 ? 1 : -1) : 0;
        const lift = f === 2 ? -2 : 0;
        for (let t = 0; t <= 10; t++) {
          const x = 16 + ((hx + sway - 16) * t) / 10;
          const y = 26 + ((hy + lift - 26) * t) / 10;
          disc(p, x, y, 1.3, t % 2 ? '#d8c8a8' : '#8a7a60');
        }
        disc(p, hx + sway, hy + lift, 3, '#e8dcc0');
        p(hx + sway - 1, hy + lift, '#ff5030');
        p(hx + sway + 1, hy + lift, '#ff5030');
        rect(p, hx + sway - 1, hy + lift + 2, 3, f === 2 ? 2 : 1, '#200808');
      });
    },
  },
  // the hollow saint: a pale robed figure with a hole through its chest, a broken halo
  'boss-hollow': {
    size: 0.97, lift: 0, heat: 0.6, wide: 1.1,
    art(p: Px, f: number) {
      const s = both(p);
      for (let k = 0; k < 20; k++) if (k % 5) p(Math.round(16 + Math.cos((k / 20) * Math.PI * 2) * 6.5 - 0.5), Math.round(6 + Math.sin((k / 20) * Math.PI * 2) * 6.5 - 0.5), '#a0c0e0');
      disc(p, 16, 6, 3.5, '#d8dce8');
      s(15, 6, '#202838');
      for (let y = 10; y < 31; y++) rect(p, 16 - Math.round(3 + (y - 10) / 3.5), y, Math.round((3 + (y - 10) / 3.5) * 2), 1, '#c8ccd8');
      ell(p, 16, 16, 2.5, 3, f === 2 ? '#a0e0ff' : '#0a0c14');
      const arm = f === 2 ? -7 : 0;
      line(s, 12, 12, 6, 20 + arm, '#b0b4c4');
      s(6, 20 + arm, '#a0e0ff');
    },
  },
  // the burning saint: the furnace saint with wings of fire, arms wide
  'boss-saint': {
    size: 0.97, lift: 0, heat: 1, wide: 1.4,
    art(p: Px, f: number) {
      const s = both(p);
      const flick = f === 1 ? 1 : 0;
      for (let k = 0; k < 6; k++) line(s, 13, 14, 1 + k, 4 + k * 3 + flick, k % 2 ? '#ffd060' : '#ff7020');
      ring(p, 16, 7, 5, '#ffe080');
      disc(p, 16, 7, 3, '#401808');
      s(15, 7, f === 2 ? '#ffffff' : '#ff9030');
      rect(p, 12, 11, 8, 17, '#702010');
      rect(p, 13, 11, 6, 15, '#a03818');
      rect(p, 14, 18, 4, 4, f === 2 ? '#ffffff' : '#ffd060');
      ell(p, 16, 30, 9 + flick, 2, '#ff8030');
    },
  },
  // the forge twins: the hammer (squat iron, a maul) and the bellows (round, a spout)
  'boss-hammer': {
    size: 0.85, lift: 0, heat: 0.9, wide: 1.25,
    art(p: Px, f: number) {
      const s = both(p);
      rect(p, 8, 10, 16, 16, '#4a4448');
      rect(p, 9, 11, 14, 4, '#6a6468');
      line(s, 11, 26, 10, 31, '#3a3438');
      rect(p, 12, 4, 8, 6, '#3a3438');
      s(14, 7, '#ff8020');
      rect(p, 14, 17, 4, 4, '#ff6010');
      const up = f === 2;
      line(p, 24, 16, up ? 28 : 29, up ? 2 : 22, '#806040');
      rect(p, up ? 24 : 25, up ? 0 : 20, 8, 5, '#2a2428');
    },
  },
  'boss-bellows': {
    size: 0.85, lift: 0, heat: 1, wide: 1.25,
    art(p: Px, f: number) {
      const puff = f === 2 ? 2 : f === 1 ? 1 : 0;
      ell(p, 16, 18, 10 + puff, 9 - puff, '#7a3020');
      ell(p, 16, 18, 8 + puff, 7 - puff, '#a04828');
      for (let k = -2; k <= 2; k++) line(p, 16 + k * 3, 11, 16 + k * 3, 25, '#5a2010');
      rect(p, 13, 5, 6, 5, '#3a3438');
      rect(p, 14, 7, 1, 1, '#ff8020');
      rect(p, 17, 7, 1, 1, '#ff8020');
      line(p, 26, 18, 31, 15, '#3a3438');
      if (f === 2) disc(p, 30, 14, 2, '#ffd060');
      rect(p, 11, 27, 3, 4, '#3a3438');
      rect(p, 18, 27, 3, 4, '#3a3438');
    },
  },
  // the slag worm: a ringed body arching out of the floor, a molten mouth
  'boss-worm': {
    size: 0.95, lift: 0, heat: 1, wide: 1.5,
    art(p: Px, f: number) {
      const rear = f === 2 ? -3 : 0;
      for (let k = 0; k <= 12; k++) {
        const a = Math.PI * (k / 12);
        const x = 16 - Math.cos(a) * 12;
        const y = 29 - Math.sin(a) * (18 - rear) + (k > 8 ? (k - 8) * rear * 0.5 : 0);
        disc(p, x, y, 3.6 - k * 0.08, k % 2 ? '#5a3020' : '#7a4028');
        disc(p, x, y - 1, 1.6, '#ff7020');
      }
      disc(p, 28, 22 + rear, 3.5, '#3a1810');
      disc(p, 28, 22 + rear, 2, f === 2 ? '#ffffff' : '#ffd060');
      ell(p, 16, 30, 14, 1.5, '#ff8030');
    },
  },
  // the thaw engine's heart: a great beating heart caged in pipes, the furnace inside
  'boss-heart': {
    size: 0.98, lift: 0, heat: 1, wide: 1.3,
    art(p: Px, f: number) {
      const beat = f === 1 ? 1 : f === 2 ? 2 : 0;
      disc(p, 11, 12, 7 + beat * 0.5, '#8a1820');
      disc(p, 21, 12, 7 + beat * 0.5, '#8a1820');
      for (let y = 12; y < 30; y++) {
        const w = Math.max(0, 14 + beat * 0.5 - (y - 12) * 0.8);
        rect(p, Math.round(16 - w), y, Math.round(w * 2), 1, '#8a1820');
      }
      disc(p, 12, 11, 4, '#b02830');
      ell(p, 16, 18, 4, 6, f === 2 ? '#ffffff' : '#ffb040');
      ell(p, 16, 18, 2, 4, f === 2 ? '#fff4c0' : '#ff6010');
      for (const x of [6, 26]) line(p, x, 2, x, 30, '#5a5048');
      rect(p, 6, 2, 21, 2, '#5a5048');
      line(p, 13, 4, 13, 0, '#806858');
      line(p, 19, 4, 19, 0, '#806858');
      for (let y = 6; y < 28; y += 5) {
        p(6, y, '#ffd060');
        p(26, y, '#ffd060');
      }
    },
  },
} satisfies Record<string, SpriteDef>);

function ring(p: Px, cx: number, cy: number, r: number, c: string) {
  for (let k = 0; k < 48; k++) p(Math.round(cx + Math.cos((k / 48) * Math.PI * 2) * r - 0.5), Math.round(cy + Math.sin((k / 48) * Math.PI * 2) * r - 0.5), c);
}

/** a seraph: rays, a wheel, an eye; colours [rays, wheel, iris, flare, pupil] */
function wheel(p: Px, f: number, [ray, rim, iris, flare, pupil]: string[]) {
  const turn = f === 1 ? 0.2 : 0;
  const len = f === 2 ? 15 : 13;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + turn;
    line(p, 16 + Math.cos(a) * 6, 16 + Math.sin(a) * 6, 16 + Math.cos(a) * (k % 2 ? len - 3 : len), 16 + Math.sin(a) * (k % 2 ? len - 3 : len), ray);
  }
  ring(p, 16, 16, 7, rim);
  ring(p, 16, 16, 6.4, rim);
  disc(p, 16, 16, 5, f === 2 ? flare : iris);
  disc(p, 16, 16, 2, f === 2 ? flare : pupil);
}

/** a bone walker; the abbot wears a mitre */
function bones(p: Px, f: number, bone: string, shade: string, eye: string, mitre: boolean) {
  const s = both(p);
  const step = f === 1 ? 2 : 0;
  // legs
  for (const d of [0, 1]) {
    line(p, 13 + d, 20, 11 + d - step, 31, d ? bone : shade);
    line(p, 18 + d, 20, 20 + d + step, 31, d ? shade : bone);
  }
  // pelvis and spine
  rect(p, 11, 19, 10, 3, bone);
  rect(p, 14, 10, 4, 10, shade);
  // ribs: a cage, filled dark between
  ell(p, 16, 14, 5, 4, '#2a2018');
  for (let k = 0; k < 4; k++) {
    line(s, 15, 11 + k * 2, 10 + k * 0.5, 12 + k * 2, bone);
  }
  // arms: down, or raised to strike
  if (f === 2) {
    line(s, 11, 10, 6, 3, bone);
    line(s, 10, 10, 5, 3, bone);
    line(s, 6, 3, 5, 1, shade);
  } else {
    line(s, 11, 10, 8, 18, bone);
    line(s, 10, 10, 7, 18, bone);
    line(s, 8, 18, 8, 22, shade);
  }
  // skull
  disc(p, 16, 6, 4, bone);
  rect(p, 14, 9, 4, 2, bone);
  s(14, 6, '#100808');
  s(13, 6, '#100808');
  s(14, 6, eye);
  p(15, 9, '#100808');
  p(16, 9, '#100808');
  if (mitre) {
    for (let y = 0; y < 4; y++) rect(p, 13 + (y >> 1), y - 1, 6 - (y >> 1) * 2, 1, shade);
    p(16, 0, '#f0d080');
  }
}

export interface Frames {
  /** idle 0, idle 1, attack, hit flash */
  color: HTMLCanvasElement[];
  /** the same frames as white silhouettes */
  mask: HTMLCanvasElement[];
}

/** draw a type's four frames (and masks); a dark outline goes round every opaque pixel */
export function frames(def: SpriteDef): Frames {
  const color: HTMLCanvasElement[] = [];
  const mask: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const grid: (string | 0)[] = new Array(SIZE * SIZE).fill(0);
    def.art((x, y, c) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y * SIZE + x] = c;
    }, f === 3 ? 0 : f);
    const out: (string | 0)[] = grid.slice();
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        if (grid[y * SIZE + x]) continue;
        const touch = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const xx = x + dx, yy = y + dy;
          return xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE && grid[yy * SIZE + xx];
        });
        if (touch) out[y * SIZE + x] = '#0a0807';
      }
    const c = paint(out, f === 3 ? '#ffffff' : null);
    const m = paint(out, '#ffffff');
    color.push(c);
    mask.push(m);
  }
  return { color, mask };
}

function paint(grid: (string | 0)[], solid: string | null): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d')!;
  for (let i = 0; i < grid.length; i++) {
    const c = grid[i];
    if (!c) continue;
    ctx.fillStyle = solid ?? c;
    ctx.fillRect(i % SIZE, Math.floor(i / SIZE), 1, 1);
  }
  return cv;
}

/** a ring of dust for a death: frame k of 4 grows and thins */
export function puff(k: number, c: string): HTMLCanvasElement {
  const grid: (string | 0)[] = new Array(SIZE * SIZE).fill(0);
  const r = 4 + k * 3;
  for (let a = 0; a < 24; a++) {
    if ((a + k) % (k + 1)) continue;
    const t = (a / 24) * Math.PI * 2;
    for (let d = 0; d < 2; d++) {
      const x = Math.round(16 + Math.cos(t) * (r - d));
      const y = Math.round(16 + Math.sin(t) * (r - d) * 0.8);
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y * SIZE + x] = c;
    }
  }
  return paint(grid, null);
}

/** test runs (?still): a sheet of every enemy's frames, for judging the art */
if (/[?&]still/.test(globalThis.location?.search ?? ''))
  (globalThis as unknown as { thawSheet?: () => HTMLElement }).thawSheet = () => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#100d0c;padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;color:#d8c8b0;font:18px VT323,monospace';
    for (const [type, def] of Object.entries(SPRITES)) {
      const box = document.createElement('div');
      box.textContent = type;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px';
      const f = frames(def);
      for (const cv of [...f.color, f.mask[0]]) {
        cv.style.cssText = 'width:72px;height:72px;image-rendering:pixelated;background:#2a201c';
        row.append(cv);
      }
      box.append(row);
      el.append(box);
    }
    document.body.append(el);
    return el;
  };
