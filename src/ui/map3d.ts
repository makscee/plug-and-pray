// The upper map tiers' pictures (v2, Maks 10-18: "some might have icons and show info on hover, some maps could
// show actual level with actual 3d models"):
//   the illuminated atlas draws each thing as its 16 px icon (src/ui/icons.ts) and each radar mark as a little
//   picture: ore, a chest, a heart, the stairs, a crown;
//   the glass diorama draws the halls you know as a tiny isometric model: floor tiles, walls standing up, the
//   seen-through parts as glass, and the things in them as their own sprites (src/sight/sprites.ts) and icons.

import { CHUNK, Cell, cell } from '../core/grid';
import { ENEMIES } from '../core/game';
import { param } from '../core/mods';
import { RES, type Entity, type Game, type Inst, type Res } from '../core/types';
import { know, marks, type Mark } from '../sight/know';
import { frames, SPRITES } from '../sight/sprites';
import { isNamed } from '../world/secrets';
import { diorama, MARK_INK, mapCell, mapHooks, markIcon, thingIcon } from '../world/mind';
import { draw, key, sprite, type Of, type Px } from './icons';
import type { View } from './views';
import { infoAt } from './maptips';

// --- icons on a canvas -------------------------------------------------------------------------------

const pics = new Map<string, HTMLCanvasElement>();
/** an icon as a small canvas, drawn once (no image loading, so the first frame has it) */
function icon(of: Of): HTMLCanvasElement {
  const k = key(of);
  let c = pics.get(k);
  if (!c) pics.set(k, (c = pxCanvas(draw(of))));
  return c;
}

const pxCanvas = (px: Px): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d')!;
  for (let y = 0; y < 16; y++)
    for (let k = 0; k < 16; k++) {
      const col = px.get(k, y);
      if (!col) continue;
      x.fillStyle = col;
      x.fillRect(k, y, 1, 1);
    }
  return c;
};

/** a radar mark's own pictures: a chest, a heart, stairs going down, a crown */
const MARKS: Partial<Record<Mark['kind'], HTMLCanvasElement>> = {};
function markArt(kind: Mark['kind']): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (MARKS[kind]) return MARKS[kind]!;
  const art: Partial<Record<Mark['kind'], [string[], Record<string, string>]>> = {
    cache: [['................', '................', '...##########...', '..#yyyyyyyyyy#..', '..#yYYYYYYYYy#..', '..############..', '..#bbbbyybbbb#..', '..#bbbbYYbbbb#..', '..#bbbbyybbbb#..', '..#bbbbbbbbbb#..', '..############..'], { '#': '#0b0807', y: '#c09040', Y: '#ffd070', b: '#6a4420' }],
    life: [['................', '................', '...###...###....', '..#rrr#.#rrr#...', '.#rRRrr#rrrrr#..', '.#rRrrrrrrrrr#..', '.#rrrrrrrrrrr#..', '..#rrrrrrrrr#...', '...#rrrrrrr#....', '....#rrrrr#.....', '.....#rrr#......', '......#r#.......', '.......#........'], { '#': '#0b0807', r: '#e03828', R: '#ff9070' }],
    stairs: [['................', '..############..', '..#wwwwwwwwww#..', '..#w########w#..', '..#w#ggggggg#w#.', '..#w#g#####g#w#.', '..#w#g#ddd#g#w#.', '..#w#g#d.d#g#w#.', '..#w#g#ddd#g#w#.', '..#w#g#####g#w#.', '..#w#ggggggg#w#.', '..#w########w#..', '..#wwwwwwwwww#..', '..############..'], { '#': '#0b0807', w: '#f0f0ff', g: '#8a90a8', d: '#3a3a50' }],
    boss: [['................', '................', '..#..#..#..#....', '.#p##p##p##p#...', '.#pPpppPpppP#...', '.#ppppppppppp#..', '.#pp#pp#pp#pp#..', '.#ppppppppppp#..', '..###########...'], { '#': '#0b0807', p: '#a030d0', P: '#e0a0ff' }],
  };
  const a = art[kind];
  if (!a) return null;
  return (MARKS[kind] = pxCanvas(sprite(a[0], a[1])));
}

const resOf = (m: Mark): Res | null => (RES as string[]).find((r) => m.what.startsWith(r)) as Res | null;

markIcon.draw = (ctx, m, x, y, size) => {
  const pic: CanvasImageSource | null = m.kind === 'vein' ? (resOf(m) ? icon({ vein: resOf(m)! }) : null) : markArt(m.kind);
  if (!pic) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(x - size / 2 - 1, y - size / 2 - 1, size + 2, size + 2);
  ctx.drawImage(pic, x - size / 2, y - size / 2, size, size);
  ctx.strokeStyle = MARK_INK[m.kind];
  ctx.lineWidth = 1;
  ctx.strokeRect(x - size / 2 - 0.5, y - size / 2 - 0.5, size + 1, size + 1);
  return true;
};

const ofThing = (e: Entity): Of | null => (e.kind === 'printer' ? { thing: e.data?.shop ? 'shop' : 'printer' } : e.item ?? null);
thingIcon.draw = (ctx, e, x, y, size) => {
  const of = ofThing(e);
  const pic = of && icon(of);
  if (!pic) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pic, x - size / 2, y - size / 2, size, size);
  return true;
};

// --- the glass diorama ---------------------------------------------------------------------------------

const looks = new Map<string, HTMLCanvasElement>();
const look = (type: string): HTMLCanvasElement | null => {
  if (!SPRITES[type]) return null;
  let c = looks.get(type);
  if (!c) looks.set(type, (c = frames(SPRITES[type]).color[0]));
  return c;
};

const INK = { floor: '#6a5444', floorD: '#56443a', top: '#3a2e27', left: '#2a201b', right: '#1e1714', you: '#f0a050' };
const VEIN: Record<string, string> = { bone: '#d8c8a8', glass: '#7fd8d0', copper: '#e08a40', ichor: '#e02848' };

diorama.make = (el: HTMLElement, inst: Inst, game: Game): View => {
  const span = Math.round(param<number>(inst, 'span', 23));
  const canvas = document.createElement('canvas');
  canvas.className = 'map diorama';
  canvas.dataset.detail = '3';
  el.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let next = 0;
  let tw = 0;
  let [ox, oy, cx0, cy0] = [0, 0, 0, 0];
  const th = () => tw / 2;
  const wallH = () => tw * 0.6;
  /** a cell's top corner on screen, relative to the cell you stand in */
  const at = (x: number, y: number): [number, number] => [cx0 + (x - y) * (tw / 2), cy0 + (x + y) * (th() / 2)];
  const cellUnder = (ev: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * canvas.width - cx0;
    const sy = ((ev.clientY - r.top) / r.height) * canvas.height - cy0;
    const a = sx / (tw / 2);
    const b = sy / (th() / 2);
    return [ox + Math.floor((a + b) / 2), oy + Math.floor((b - a) / 2)];
  };
  canvas.addEventListener('click', (ev) => {
    const [x, y] = cellUnder(ev);
    for (const f of mapHooks.click) f(game, x, y);
  });
  canvas.addEventListener('mousemove', (ev) => {
    const [x, y] = cellUnder(ev);
    const t = infoAt(game, x, y).join('\n');
    if (canvas.title !== t) canvas.title = t;
  });
  return {
    update(g: Game) {
      if (!(inst.on && g.t >= inst.readyAt)) return;
      const want = Math.max(8, Math.floor((mapCell.px(33) * 33 * 1.6) / span));
      if (want !== tw) {
        tw = want;
        canvas.width = Math.round(span * tw * 0.75);
        canvas.height = Math.round(span * th() * 0.75 + wallH() + 8);
        next = 0;
      }
      if (g.t < next) return;
      next = g.t + 0.25;
      const p = g.player;
      [ox, oy] = [Math.floor(p.x), Math.floor(p.y)];
      cx0 = canvas.width / 2;
      cy0 = canvas.height / 2 - th() / 2;
      ctx.fillStyle = '#050404';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const R = span >> 1;
      const made = (wx: number, wy: number) => g.chunks.has(`${Math.floor(wx / CHUNK)},${Math.floor(wy / CHUNK)}`);
      // the things standing in each cell, drawn with the cell so nearer walls cover them
      const byCell = new Map<string, Entity[]>();
      for (const e of g.ents) {
        const k = `${Math.floor(e.x)},${Math.floor(e.y)}`;
        if (!g.seen.has(k) || e.data?.mimic || (e.enemy && ENEMIES[e.enemy.type]?.hidden)) continue;
        if (Math.abs(e.x - p.x) > R || Math.abs(e.y - p.y) > R) continue;
        (byCell.get(k) ?? byCell.set(k, []).get(k)!).push(e);
      }
      const ms = marks(g);
      // back to front: by x + y
      for (let s = -2 * R; s <= 2 * R; s++)
        for (let dx = -R; dx <= R; dx++) {
          const dy = s - dx;
          if (dy < -R || dy > R) continue;
          const [wx, wy] = [ox + dx, oy + dy];
          if (!made(wx, wy)) continue;
          const k = know(g, wx, wy);
          if (k === 'unseen') continue;
          const c = cell(g, wx, wy);
          const [sx, sy] = at(dx, dy);
          const glass = k === 'through';
          ctx.globalAlpha = glass ? 0.35 : 1;
          if (c === Cell.floor) tile(ctx, sx, sy, (wx + wy) & 1 ? INK.floor : INK.floorD, glass);
          else block(ctx, sx, sy, glass, c >= Cell.vein && isNamed(g, wx, wy) ? VEIN[['bone', 'glass', 'copper', 'ichor'][c - Cell.vein]] : null);
          ctx.globalAlpha = 1;
          for (const e of byCell.get(`${wx},${wy}`) ?? []) {
            const [ex, ey] = at(e.x - ox - 0.5, e.y - oy - 0.5);
            const fy = ey + th() / 2;
            if (e.enemy) {
              const pic = look(e.enemy.type);
              const h = tw * 1.2 * (SPRITES[e.enemy.type]?.size ?? 1);
              if (pic) ctx.drawImage(pic, ex - h / 2, fy - h, h, h);
            } else {
              const of = ofThing(e);
              const pic = of && icon(of);
              const h = tw * (e.kind === 'printer' ? 1.3 : 0.9);
              if (pic) ctx.drawImage(pic, ex - h / 2, fy - h, h, h);
            }
          }
          if (dx === 0 && dy === 0) {
            // you: a small glowing figure, a pointer for your facing
            const [yx, yy] = at(p.x - ox - 0.5, p.y - oy - 0.5);
            ctx.fillStyle = INK.you;
            ctx.beginPath();
            ctx.ellipse(yx, yy + th() / 2 - tw * 0.35, tw * 0.22, tw * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            const [fx, fy] = [Math.sin(p.dir), -Math.cos(p.dir)];
            const [ax, ay] = [(fx - fy) * (tw / 2) * 0.9, (fx + fy) * (th() / 2) * 0.9];
            ctx.strokeStyle = INK.you;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(yx, yy + th() / 2);
            ctx.lineTo(yx + ax, yy + th() / 2 + ay);
            ctx.stroke();
          }
        }
      // radar marks float above their place, as the atlas draws them
      for (const m of ms) {
        if (Math.abs(m.x - p.x) > R + m.r || Math.abs(m.y - p.y) > R + m.r) continue;
        const [mx, my] = at(m.x - ox - 0.5, m.y - oy - 0.5);
        ctx.globalAlpha = m.ttl ? Math.max(0.25, 1 - (g.t - m.at) / m.ttl) : 1;
        if (m.r) {
          ctx.strokeStyle = MARK_INK[m.kind];
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.ellipse(mx, my + th() / 2, m.r * tw * 0.7, m.r * th() * 0.7, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (!markIcon.draw!(ctx, m, mx, my - tw * 0.4, Math.max(10, tw))) {
          ctx.fillStyle = MARK_INK[m.kind];
          ctx.font = `bold ${Math.round(tw * 1.2)}px VT323, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('?', mx, my);
        }
        ctx.globalAlpha = 1;
      }
    },
  };

  /** a floor tile: a flat diamond */
  function tile(ctx: CanvasRenderingContext2D, x: number, y: number, ink: string, glass: boolean): void {
    ctx.fillStyle = glass ? '#6a6088' : ink;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tw / 2, y + th() / 2);
    ctx.lineTo(x, y + th());
    ctx.lineTo(x - tw / 2, y + th() / 2);
    ctx.closePath();
    ctx.fill();
  }
  /** a wall: a block standing up from its tile, lit from the top left; a named vein shows its ore on the faces */
  function block(ctx: CanvasRenderingContext2D, x: number, y: number, glass: boolean, ore: string | null): void {
    const h = wallH();
    const face = (pts: number[][], ink: string) => {
      ctx.fillStyle = ink;
      ctx.beginPath();
      pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
      ctx.closePath();
      ctx.fill();
    };
    face([[x - tw / 2, y + th() / 2 - h], [x, y + th() - h], [x, y + th()], [x - tw / 2, y + th() / 2]], glass ? '#4a4460' : ore ?? INK.left);
    face([[x + tw / 2, y + th() / 2 - h], [x, y + th() - h], [x, y + th()], [x + tw / 2, y + th() / 2]], glass ? '#3a3450' : INK.right);
    face([[x, y - h], [x + tw / 2, y + th() / 2 - h], [x, y + th() - h], [x - tw / 2, y + th() / 2 - h]], glass ? '#8a80b0' : INK.top);
  }
};
