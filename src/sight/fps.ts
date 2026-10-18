// The FPS eye on screen (v2). Its window shows a small wide view and a `go big` button; `big` (key V)
// fills the screen with it: a low-res wide shot every frame, upscaled crisp (the PS1 look), a crosshair
// that tells you whether the weapon reaches what is under it, hit markers (mk2), arrows on the edge for
// bolts coming from outside the view, and a slim HUD (hp, power, weapons and their cooldowns, the dash,
// a boss bar). Everything else folds away; the console stays as a slim overlay (style: fps.css).
// Enemy bolts (src/fight/bolts.ts) glow in every colour eye, big or small (placeHooks).
import * as THREE from 'three';
import './fps.css';
import { families, MODS, param, powerMax, powerUsed } from '../core/mods';
import type { Game, Inst } from '../core/types';
import { addItem, exec } from '../core/verbs';
import { frameHooks } from '../ui';
import { VIEWS, view, type MakeView } from '../ui/views';
import { eyeRange } from '../mods/sense';
import { firstSight } from './codex';
import { see, shoot, placeHooks, type Mode } from './scene';
import { engaged } from './foes';
import { boltWarn, shots, type ShotData } from '../fight/shots';
import { eaten, hpText, lastBlow } from '../fight/report';
import { bigOn, bossOf, dash, fps, fpsEye, fpsFire, fpsMove, fpsTurn, lunge, mark, nameOf, ray, weaponState } from '../body/fps';

// ---- bolts: a hot core and a soft halo, never fogged, so a bolt reads in the dark from across a room

const BOLT_LOOK: Record<string, { core: number; halo: number; size: number }> = {
  // red is danger: a white-hot core in a red halo, never the amber of the world or a seraph's gold
  bolt: { core: 0xffffff, halo: 0xff2040, size: 0.09 },
  slag: { core: 0xffd060, halo: 0xff5000, size: 0.13 },
  ball: { core: 0xf0d0ff, halo: 0xa040ff, size: 0.16 },
  needle: { core: 0xffffff, halo: 0x80d0ff, size: 0.06 },
};
const ball = new THREE.IcosahedronGeometry(1, 1);
const boltMats = new Map<string, THREE.Material>();
function boltMat(color: number, halo: boolean): THREE.Material {
  const k = `${color}:${halo}`;
  let m = boltMats.get(k);
  if (!m)
    boltMats.set(k, (m = halo
      ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      : new THREE.MeshBasicMaterial({ color, fog: false })));
  return m;
}
/** a dark disc behind the glow, a little wider than it: the bolt sits on black with a dark edge, so it reads
 *  on a white boss too (v2r1 fight: white bolts vanished into the white hydra) */
const rimMat = new THREE.MeshBasicMaterial({ color: 0x100004, side: THREE.BackSide, fog: false });
/** the most a bolt's dark disc spans, as an angle (radians from its centre): close up it stops growing, so one
 *  bolt never fills the view (v2r1 fight: point-blank shots were giant blobs) */
export const BOLT_MAX = 0.075;
/** a shot closer than this is in your body already: not drawn */
const BOLT_NEAR = 0.3;
/** the dark disc's size over the core's (the halo is 1.9) */
const RIM = 2.4;
/** the size a bolt's core is drawn at, `r` cells from the eye */
export const boltSize = (size: number, r: number): number => Math.min(size, (r * BOLT_MAX) / RIM);
placeHooks.push((g, group, mode: Mode) => {
  if (mode === 'depth') return;
  const p = g.player;
  for (const s of shots(g)) {
    const d = s.data as unknown as ShotData;
    if (!d.kind || Math.abs(s.x - p.x) > 14 || Math.abs(s.y - p.y) > 14) continue;
    const r = Math.hypot(s.x - p.x, s.y - p.y);
    if (r < BOLT_NEAR) continue;
    const l = BOLT_LOOK[d.kind] ?? BOLT_LOOK.bolt;
    // a bolt throbs, so it reads as alive and coming
    const throb = 1 + 0.25 * Math.sin(g.t * 24 + s.id);
    const size = boltSize(l.size * throb, r);
    const core = new THREE.Mesh(ball, boltMat(mode === 'heat' ? 0xffffff : l.core, false));
    core.scale.setScalar(size);
    core.position.set(s.x, 0.45, s.y);
    const rim = new THREE.Mesh(ball, rimMat);
    rim.scale.setScalar(size * RIM);
    rim.position.copy(core.position);
    const halo = new THREE.Mesh(ball, boltMat(l.halo, true));
    halo.scale.setScalar(size * 1.9);
    halo.position.copy(core.position);
    halo.renderOrder = 3;
    group.add(core, rim, halo);
  }
});

// ---- the picture: a wide shot, auto-gain, and a light ordered dither (mk1 coarser: fewer colours)

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

/** shoot the wide view for `inst` at w×h and grade it in place; returns the pixels */
export function wideShot(g: Game, inst: Inst, w: number, h: number): Uint8Array {
  const range = eyeRange(g, inst);
  const px = shoot(g, { res: h, w, fov: param<number>(inst, 'fov', 90), range, mode: 'color', filter: 'color' });
  see(g, range);
  if (firstSight(g, inst, range)) inst.data.flashAt = g.t;
  grade(px, w, h, param<number>(inst, 'big', 1) >= 2 ? 32 : 12);
  return px;
}

/** auto-gain (a dark room reads dim but whole), then `levels` per channel with a 4x4 dither */
export function grade(px: Uint8Array, w: number, h: number, levels: number): void {
  const n = w * h;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[(px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) | 0]++;
  let c = 0, top = 255;
  for (let v = 255; v >= 0; v--) if ((c += hist[v]) > n * 0.08) { top = v; break; }
  const gain = Math.max(1, Math.min(2.5, 200 / Math.max(1, top)));
  const step = 255 / (levels - 1);
  for (let i = 0; i < n; i++) {
    const b = BAYER[(((i / w) | 0) & 3) * 4 + ((i % w) & 3)];
    for (let k = 0; k < 3; k++) {
      const v = Math.min(255, px[i * 4 + k] * gain);
      px[i * 4 + k] = Math.max(0, Math.min(255, Math.round(v / step + b * 0.7) * step));
    }
    px[i * 4 + 3] = 255;
  }
}

// ---- the scope's own window: a small wide view and the button to go big

const makeScope: MakeView = (el, inst) => {
  const W = 128, H = 72;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'eye scope';
  const label = document.createElement('div');
  label.className = 'facing';
  const hint = document.createElement('div');
  hint.className = 'scope-hint';
  hint.textContent = 'v: go big · mouse turns, click shoots';
  el.append(label, canvas, hint);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  let next = 0;
  return {
    update(g) {
      const warm = inst.on && g.t >= inst.readyAt;
      const f = !inst.on ? 'off' : !warm ? 'warming up…' : bigOn(g) ? 'big: it fills your sight' : `mk${param<number>(inst, 'big', 1)} · ${Math.round(param<number>(inst, 'fov', 90))}° wide`;
      if (label.textContent !== f) label.textContent = f;
      if (!warm) {
        // static, as every eye shows while it warms or sits off
        const px = img.data;
        for (let i = 0; i < W * H; i++) {
          const v = Math.random() < 0.5 ? 0 : (inst.on ? 120 : 30) * Math.random();
          px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
          px[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return;
      }
      // while big, the big view draws: this one rests
      if (bigOn(g) || g.t < next) return;
      next = g.t + 1 / 12;
      img.data.set(wideShot(g, inst, W, H));
      ctx.putImageData(img, 0, 0);
    },
  };
};

/** wrap the camera family: scopes get their own window and a `go big` button; other eyes rest while big
 *  (called once the camera view is registered, src/sight/index.ts) */
export function wrapCamera(): void {
  const base = VIEWS.camera;
  if (!base) return;
  view('camera', (el, inst, g) => {
    if (param<number>(inst, 'big', 0) > 0) return makeScope(el, inst, g);
    const v = base(el, inst, g);
    return { update: (g, dt) => (bigOn(g) ? undefined : v.update(g, dt)), dispose: v.dispose };
  });
  const fam = families.camera;
  if (!fam) return;
  const buttons = fam.buttons;
  fam.buttons = (g, inst) => (param<number>(inst, 'big', 0) > 0 ? [{ label: bigOn(g) ? 'small' : 'go big (v)', cmd: 'big' }] : buttons?.(g, inst) ?? []);
}

// ---- the big view

interface Big { root: HTMLElement; pic: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; over: HTMLCanvasElement; oc: CanvasRenderingContext2D; hud: HTMLElement; boss: HTMLElement; warn: HTMLElement; lock: HTMLElement; w: number; h: number }
let big: Big | null = null;

function make(w: number, h: number): Big {
  big?.root.remove();
  const root = document.createElement('div');
  root.id = 'bigview';
  const pic = document.createElement('canvas');
  pic.width = w;
  pic.height = h;
  pic.className = 'eye big-pic';
  const over = document.createElement('canvas');
  over.className = 'big-over';
  const hud = document.createElement('div');
  hud.className = 'big-hud';
  const boss = document.createElement('div');
  boss.className = 'big-boss';
  const warn = document.createElement('div');
  warn.className = 'big-warn';
  const lock = document.createElement('div');
  lock.className = 'big-lock';
  lock.textContent = 'click to take the mouse';
  const keys = document.createElement('div');
  keys.className = 'big-keys';
  keys.innerHTML = 'wasd walk · click shoot · f lunge · <b class="dashkey">shift dash · </b>esc mouse · [ ] mouse speed · v small';
  root.append(pic, over, boss, warn, lock, keys, hud);
  document.body.append(root);
  const ctx = pic.getContext('2d')!;
  return { root, pic, ctx, img: ctx.createImageData(w, h), over, oc: over.getContext('2d')!, hud, boss, warn, lock, w, h };
}

/** the last big frame's cost in ms (the test hook reads it) */
let cost = 0;

frameHooks.push((g) => {
  const on = bigOn(g);
  document.body.classList.toggle('big', on);
  // dead or done: the mouse is yours again for the card
  if (g.ended && document.pointerLockElement?.id === 'bigview') document.exitPointerLock?.();
  if (!on) {
    if (big) big.root.hidden = true;
    if (document.pointerLockElement && big?.root.contains(document.pointerLockElement)) document.exitPointerLock?.();
    return;
  }
  const inst = fpsEye(g)!;
  const w = Math.round(param<number>(inst, 'wide', 192));
  const h = Math.round(param<number>(inst, 'res', 108));
  if (!big || !big.root.isConnected || big.w !== w || big.h !== h) big = make(w, h);
  big.root.hidden = false;
  const t0 = performance.now();
  big.img.data.set(wideShot(g, inst, w, h));
  big.ctx.putImageData(big.img, 0, 0);
  big.root.dataset.mk = String(mark(g));
  overlay(g, big, inst);
  hud(g, big);
  big.lock.hidden = document.pointerLockElement === big.root;
  cost = cost * 0.9 + (performance.now() - t0) * 0.1;
});

/** how far under the crosshair the name of what is under it sits (px) */
const LABEL_Y = 56;
/** crosshair, hit markers, the shot's flash and arrows for bolts coming from outside the view */
function overlay(g: Game, b: Big, inst: Inst): void {
  const W = innerWidth, H = innerHeight;
  if (b.over.width !== W || b.over.height !== H) [b.over.width, b.over.height] = [W, H];
  const c = b.oc;
  c.clearRect(0, 0, W, H);
  const s = fps(g);
  const mk = param<number>(inst, 'big', 1);
  const [cx, cy] = [W / 2, H / 2];
  const ws = weaponState(g);
  const reach = Math.max(0, ...ws.map((x) => x.range));
  const under = ray(g, g.player.dir, 14);
  const inReach = !!under.foe && under.len <= reach;
  // the crosshair: amber; red with a foe under it in reach; it opens as the weapon cools (mk2: the spread)
  const aimedW = ws.filter((x) => x.range > 2);
  const cool = aimedW.length ? Math.max(...aimedW.map((x) => (x.cool ? x.wait / x.cool : 0))) : 0;
  const gap = 5 + (mk >= 2 ? cool * 12 : 0);
  c.strokeStyle = inReach ? '#ff5a3c' : '#f0c070';
  c.lineWidth = 2;
  c.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    c.moveTo(cx + dx * gap, cy + dy * gap);
    c.lineTo(cx + dx * (gap + 8), cy + dy * (gap + 8));
  }
  c.stroke();
  c.fillStyle = c.strokeStyle;
  c.fillRect(cx - 1, cy - 1, 2, 2);
  // honest about range: what is under it, how far, and whether it reaches
  c.font = '16px VT323, monospace';
  c.textAlign = 'center';
  if (under.foe) {
    const txt = `${nameOf(under.foe)} ${under.len.toFixed(1)}` + (reach ? (inReach ? '' : ` · out of reach (${reach})`) : ' · no weapon');
    c.fillStyle = '#000a';
    const tw = c.measureText(txt).width;
    // well under the crosshair, past its widest spread (v2r1: the name sat on the crosshair)
    c.fillRect(cx - tw / 2 - 4, cy + LABEL_Y - 13, tw + 8, 16);
    c.fillStyle = inReach ? '#ff8a6c' : '#c8b8a0';
    c.fillText(txt, cx, cy + LABEL_Y);
  }
  // the shot: a short flash at the muzzle and a streak toward the crosshair
  const since = g.t - s.shotAt;
  if (since >= 0 && since < 0.08) {
    c.strokeStyle = '#fff0c0';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx + W * 0.08, H);
    c.lineTo(cx + 3, cy + 6);
    c.stroke();
    c.fillStyle = '#fff6d0';
    c.beginPath();
    c.arc(cx + W * 0.08, H - 6, 14, 0, Math.PI * 2);
    c.fill();
  }
  // hit markers, an X on the crosshair: mk1 a plain white one; mk2 red and wider on a kill. A blow armour
  // mostly ate shows grey, with the word (v2r1: nothing said armour turned 1.5 into 0.7)
  const hit = g.t - s.hitAt;
  if (hit >= 0 && hit < 0.22) {
    const kill = mk >= 2 && g.t - s.killAt < 0.22;
    const blow = lastBlow(g);
    const ate = !!blow && blow.t === s.hitAt && eaten(blow);
    const r0 = 7, r1 = kill ? 20 : 14;
    // a dark rim under it, so it reads on a white hit flash too
    for (const [color, width] of [['#000', kill ? 6 : 5], [kill ? '#ff3020' : ate ? '#9a9088' : '#ffffff', kill ? 3 : 2]] as const) {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        c.moveTo(cx + dx * r0, cy + dy * r0);
        c.lineTo(cx + dx * r1, cy + dy * r1);
      }
      c.stroke();
    }
    if (ate) {
      c.fillStyle = '#000a';
      c.fillRect(cx + 18, cy - 30, 60, 16);
      c.fillStyle = '#c8c0b8';
      c.textAlign = 'left';
      c.fillText('armour', cx + 22, cy - 17);
      c.textAlign = 'center';
    }
  }
  // bolts coming at you from outside the view: a red chevron on that edge
  const p = g.player;
  const half = (param<number>(inst, 'fov', 90) / 2) * (Math.PI / 180);
  for (const sh of shots(g)) {
    const d = sh.data as unknown as ShotData;
    if (!d.foe) continue;
    const [rx, ry] = [p.x - sh.x, p.y - sh.y];
    const r = Math.hypot(rx, ry);
    if (r > 6 || rx * d.vx + ry * d.vy <= 0) continue;
    let a = Math.atan2(sh.x - p.x, -(sh.y - p.y)) - p.dir;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) < half * 0.9) continue;
    const side = a > 0 ? 1 : -1;
    const behind = Math.abs(a) > Math.PI * 0.75;
    const [x, y] = behind ? [cx, H - 70] : [side > 0 ? W - 36 : 36, cy];
    c.fillStyle = `rgba(255,80,50,${0.5 + 0.5 * Math.max(0, 1 - r / 6)})`;
    c.beginPath();
    if (behind) { c.moveTo(x - 16, y - 8); c.lineTo(x + 16, y - 8); c.lineTo(x, y + 10); }
    else { c.moveTo(x - side * 10, y - 16); c.lineTo(x - side * 10, y + 16); c.lineTo(x + side * 10, y); }
    c.fill();
  }
}

const bar = (frac: number, cls = '') => `<i class="bar ${cls}"><b style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></b></i>`;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** the slim HUD: hp, power, each weapon and its cooldown, the dash; a boss bar; the coming blow */
function hud(g: Game, b: Big): void {
  const p = g.player;
  const s = fps(g);
  const ws = weaponState(g);
  const weapons = ws.length
    ? ws.map((x) => `<span class="w">${esc(x.name)} <small>${x.range}c</small> ${x.wait <= 0.05 ? '<em>ready</em>' : bar(1 - x.wait / Math.max(0.01, x.cool), 'cool')}</span>`).join('')
    : '<span class="w none">no weapon on: a click only lunges</span>';
  const dashLine = mark(g) >= 2 ? `<span class="w">dash ${g.t >= s.dashReady ? '<em>ready</em>' : bar(1 - (s.dashReady - g.t) / 1.1, 'cool')}</span>` : '';
  const html =
    `<span class="hp${p.hp <= p.maxHp * 0.3 ? ' low' : ''}">hp ${bar(p.hp / p.maxHp)} ${hpText(p.hp)}/${p.maxHp}</span>` +
    `<span class="pw">power ${powerUsed(g)}/${powerMax(g)}</span>` + weapons + dashLine;
  if (b.hud.dataset.html !== html) {
    b.hud.dataset.html = html;
    b.hud.innerHTML = html;
  }
  // the boss (or elite) after you: its name and a wide bar on top
  const boss = bossOf(g);
  const bh = boss ? `<span>${esc(nameOf(boss))}</span>${bar(boss.enemy!.hp / (Number(boss.enemy!.data.maxHp ?? boss.enemy!.hp) || 1))}` : '';
  if (b.boss.dataset.html !== bh) {
    b.boss.dataset.html = bh;
    b.boss.innerHTML = bh;
    b.boss.hidden = !bh;
  }
  // a blow or a bolt winding up, named (the fight HUD's ⚠ line, here big and central)
  const wind = engaged(g, 10).filter((e) => e.enemy!.data.move && g.t < ((e.enemy!.data.windup as number) ?? 0));
  const coming = boltWarn(g, 2.5, true);
  const wt = wind.length ? `⚠ ${String(wind[0].enemy!.data.move)}${wind.length > 1 ? ` +${wind.length - 1}` : ''}` : coming ? `⚠ ${coming.replace('step aside', 'strafe')}` : '';
  if (b.warn.textContent !== wt) b.warn.textContent = wt;
  b.warn.hidden = !wt;
}

// ---- input the screen owns: the test hook (Playwright cannot lock the pointer) and ?fps

/** test runs: drive the big view without a real pointer lock */
const tg = () => (globalThis as unknown as { thaw: { g: Game } }).thaw.g;
(globalThis as unknown as { fpsTest: unknown }).fpsTest = {
  turn: (by: number) => fpsTurn(tg(), by),
  face: (dir: number) => void (tg().player.dir = dir),
  fire: () => fpsFire(tg()),
  lunge: () => lunge(tg()),
  dash: () => dash(tg()),
  move: (fwd: number, side: number) => fpsMove(tg(), fwd, side),
  /** hold keys as if pressed ('w', 'a', 'ArrowUp'...); hold() lets go of all */
  hold: (...keys: string[]) => (globalThis as unknown as { fpsHold: (...k: string[]) => void }).fpsHold(...keys),
  big: (on = true) => void (fps(tg()).big = on),
  state: () => {
    const g = tg();
    return { ...fps(g), on: bigOn(g), mark: mark(g), dir: g.player.dir, x: g.player.x, y: g.player.y, cost };
  },
};

/** ?fps (?fps=2 for the mk2): a scope and a ranged weapon on, and the big view up */
let staged = false;
frameHooks.push((g) => {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  if (staged || !q.has('fps')) return;
  staged = true;
  const id = q.get('fps') === '2' ? 'martyr-scope' : 'pilgrim-scope';
  const p = g.player;
  p.slots = Math.max(p.slots, 8);
  p.core = Math.max(p.core, 12);
  for (const m of [id, 'nail-psalm', 'spark-finger', 'map-spool']) {
    if (!p.inv.some((it) => it.kind === 'mod' && it.mod === m)) addItem(g, { kind: 'mod', mod: m });
    exec(g, `install ${MODS[m].name}`);
  }
  // warm at once: a test should not wait
  for (const i of p.installed) if (i.on) i.readyAt = g.t;
  fps(g).big = true;
});
