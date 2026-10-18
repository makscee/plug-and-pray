// The reins on screen (v2-view). Your eye's view is the screen already (src/sight/backdrop.ts); with the reins
// taken (Tab) this lays over it: a crosshair that tells you whether the weapon reaches what is under it, hit
// markers (mk2), arrows on the edge for bolts coming from outside the view, and a slim HUD (hp, power, weapons
// and their cooldowns, the dash, a boss bar). The windows fold away; the console stays as a slim overlay (fps.css).
// Enemy bolts (src/fight/bolts.ts) glow in every colour eye, big or small (placeHooks).
import * as THREE from 'three';
import './fps.css';
import { MODS, powerMax, powerUsed } from '../core/mods';
import type { Game } from '../core/types';
import { addItem, exec } from '../core/verbs';
import { frameHooks } from '../ui';
import { placeHooks, type Mode } from './scene';
import { fovAcross, plan } from './layers';
import { engaged } from './foes';
import { boltWarn, shots, type ShotData } from '../fight/shots';
import { eaten, hpText, lastBlow } from '../fight/report';
import { drawFpsFx, drawWeapon } from '../fx/attacks';
import { bigOn, bossOf, dash, fps, fpsFire, fpsMove, fpsTurn, lunge, mark, nameOf, ray, weaponState } from '../body/fps';

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

// ---- the big view

interface Big { root: HTMLElement; over: HTMLCanvasElement; oc: CanvasRenderingContext2D; hud: HTMLElement; boss: HTMLElement; warn: HTMLElement; lock: HTMLElement }
let big: Big | null = null;

function make(): Big {
  big?.root.remove();
  const root = document.createElement('div');
  root.id = 'bigview';
  root.hidden = true;
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
  lock.textContent = 'click to take the mouse (or the trackpad)';
  const keys = document.createElement('div');
  keys.className = 'big-keys';
  // v2r1 ux: the keys were small grey text; Esc frees the mouse first, then leaves (src/body/input.ts)
  keys.innerHTML = '<b class="reins-on">◉ first person</b><b class="reins-mk"> · reins</b><span class="big-layers"></span><br>wasd walk · ← → or q e turn<br>click/space (hold) shoot · f lunge<b class="dashkey"> · shift dash</b><br>tab or esc: the cursor back<br>[ ] or look 0.5–3: turn speed';
  // v2r1 ux + pace: no map in big view; your map window's picture, in the corner
  const map = document.createElement('canvas');
  map.className = 'big-map';
  map.width = map.height = 168;
  root.append(over, boss, warn, lock, keys, map, hud);
  document.body.append(root);
  return { root, over, oc: over.getContext('2d')!, hud, boss, warn, lock };
}

/** the last big frame's cost in ms (the test hook reads it) */
let cost = 0;

frameHooks.push((g) => {
  const on = bigOn(g);
  document.body.classList.toggle('big', on);
  // dead or done: the mouse is yours again for the card
  if (g.ended && document.pointerLockElement?.id === 'bigview') document.exitPointerLock?.();
  // made at once (hidden), so a key or a click can lock the pointer to it in the same gesture (src/body/input.ts)
  if (!big || !big.root.isConnected) big = make();
  if (!on) {
    big.root.hidden = true;
    if (document.pointerLockElement && big.root.contains(document.pointerLockElement)) document.exitPointerLock?.();
    return;
  }
  big.root.hidden = false;
  const t0 = performance.now();
  big.root.dataset.mk = String(mark(g));
  const pl = plan(g);
  const eye = pl.base;
  // v2r2 ux: what is layered on the view stays said beside the reins
  const n = pl.layers.filter((l) => l.layer !== 'rest').length;
  const lt = n ? ` · +${n} layer${n > 1 ? 's' : ''}${n > 2 ? ' (l turns)' : ''}` : '';
  const ls = big.root.querySelector('.big-layers');
  if (ls && ls.textContent !== lt) ls.textContent = lt;
  overlay(g, big, eye ? fovAcross(eye) : 90);
  hud(g, big);
  miniMap(big);
  big.lock.hidden = document.pointerLockElement === big.root;
  cost = cost * 0.9 + (performance.now() - t0) * 0.1;
});

/** the corner map: the map window's canvas (it keeps drawing while hidden), middle cropped to a square */
function miniMap(b: Big): void {
  const m = b.root.querySelector<HTMLCanvasElement>('.big-map')!;
  const src = document.querySelector<HTMLCanvasElement>('#desk canvas.map, #desk canvas.diorama');
  m.hidden = !src || !src.width;
  if (m.hidden || !src) return;
  const c = m.getContext('2d')!;
  c.fillStyle = '#000';
  c.fillRect(0, 0, m.width, m.height);
  const s = Math.min(src.width, src.height);
  c.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, m.width, m.height);
}

/** how far under the crosshair the name of what is under it sits (px) */
const LABEL_Y = 56;
/** crosshair, hit markers, the shot's flash and arrows for bolts coming from outside the view */
function overlay(g: Game, b: Big, fov: number): void {
  const W = innerWidth, H = innerHeight;
  if (b.over.width !== W || b.over.height !== H) [b.over.width, b.over.height] = [W, H];
  const c = b.oc;
  c.clearRect(0, 0, W, H);
  const s = fps(g);
  const mk = mark(g);
  const [cx, cy] = [W / 2, H / 2];
  const ws = weaponState(g);
  const reach = Math.max(0, ...ws.map((x) => x.range));
  const under = ray(g, g.player.dir, 14);
  const inReach = !!under.foe && under.len <= reach;
  // the crosshair: amber; red with a foe under it in reach; it opens as the weapon cools (mk2: the spread)
  const aimedW = ws.filter((x) => x.range > 2);
  const cool = aimedW.length ? Math.max(...aimedW.map((x) => (x.cool ? x.wait / x.cool : 0))) : 0;
  const gap = 5 + (mk >= 2 ? cool * 12 : 0);
  // v2r2 ux: a dark outline under it, so it shows on tan walls
  const cross = () => {
    c.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.moveTo(cx + dx * gap, cy + dy * gap);
      c.lineTo(cx + dx * (gap + 8), cy + dy * (gap + 8));
    }
    c.stroke();
  };
  c.strokeStyle = '#000';
  c.lineWidth = 4;
  cross();
  c.fillStyle = '#000';
  c.fillRect(cx - 2, cy - 2, 4, 4);
  c.strokeStyle = inReach ? '#ff5a3c' : '#f0c070';
  c.lineWidth = 2;
  cross();
  c.fillStyle = c.strokeStyle;
  c.fillRect(cx - 1, cy - 1, 2, 2);
  // honest about range: what is under it, how far, and whether it reaches
  c.font = '16px VT323, monospace';
  c.textAlign = 'center';
  if (under.foe) {
    // the boss is named once, on its bar: under the crosshair only how far (v2r1 ux: named three times)
    const named = bossOf(g) === under.foe && !b.boss.hidden;
    const txt = `${named ? `${under.len.toFixed(1)} cells` : `${nameOf(under.foe)} ${under.len.toFixed(1)}`}` + (reach ? (inReach ? '' : ` · out of reach (${reach})`) : ' · no weapon');
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
  // your attacks: tracers, sparks, the bell's ring, swings, and the weapon that kicks (src/fx/attacks.ts)
  drawFpsFx(g, c, W, H, fov);
  if (ws.length) drawWeapon(g, c, W, H);
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
  const half = (fov / 2) * (Math.PI / 180);
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

/** ?fps (?fps=2 for the mk2): the reins, a scope and a ranged weapon on, and the reins taken */
let staged = false;
frameHooks.push((g) => {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  if (staged || !q.has('fps')) return;
  staged = true;
  const two = q.get('fps') === '2';
  const p = g.player;
  p.slots = Math.max(p.slots, 8);
  p.core = Math.max(p.core, 12);
  for (const m of [two ? 'martyr-scope' : 'pilgrim-scope', two ? 'martyrs-reins' : 'saints-reins', 'nail-psalm', 'spark-finger', 'map-spool']) {
    if (!p.inv.some((it) => it.kind === 'mod' && it.mod === m)) addItem(g, { kind: 'mod', mod: m });
    exec(g, `install ${MODS[m].name}`);
  }
  // warm at once: a test should not wait
  for (const i of p.installed) if (i.on) i.readyAt = g.t;
  fps(g).big = true;
});
