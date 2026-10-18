// The fight on screen: an hp bar always on top, and a red flash when you are hurt.
import { ENEMIES } from '../core/game';
import { active, param, powerMax, powerUsed, slotsUsed } from '../core/mods';
import type { Game, Inst } from '../core/types';
import { engaged } from '../sight/foes';
import { frameHooks } from '../ui';
import { pips } from '../ui/panels';
import { hpText } from './report';
import { fanfares } from './shard';
import { turned } from './warn';
import { armed, foesNear } from './unarmed';
import { clean } from '../tune/start';
import { mapHooks } from '../world/mind';
import { BOSS, BOSSES, bossesNear, poolsOf, stageBoss, stunOf, type Zone } from './bosses';

let bar: HTMLElement | null = null;
let flash: HTMLElement | null = null;
let seenHurt = -99;
/** the last moment one of your blows landed, to flash the fight line (src/sight/foes.ts hitAt) */
let seenHit = -99;
let seenGame: unknown = null;

function els(): [HTMLElement, HTMLElement] {
  if (!bar || !bar.isConnected) {
    bar = document.createElement('div');
    bar.className = 'hpbar';
    document.body.append(bar);
  }
  if (!flash || !flash.isConnected) {
    flash = document.createElement('div');
    flash.className = 'hurtflash';
    document.body.append(flash);
  }
  return [bar, flash];
}

frameHooks.push((g) => {
  const [b, f] = els();
  const p = g.player;
  const text = `${hpText(p.hp)}/${p.maxHp}`;
  const [su, pu, pm] = [slotsUsed(g), powerUsed(g), powerMax(g)];
  const fight = fightLine(g);
  // Maks 10-18: no weapon on with foes near is a red tag that stays until you arm
  const bare = !armed(g) && foesNear(g, 8);
  const key = `${text} ${su}/${p.slots} ${pu}/${pm} ${fight} ${bare}`;
  if (b.dataset.text !== key) {
    b.dataset.text = key;
    // hp, then the two resources every choice spends: slots and power
    b.innerHTML = `<span class="hud-k">hp</span> <i><b style="width:${(Math.max(0, p.hp) / p.maxHp) * 100}%"></b></i> ${text}` +
      (bare ? '<span class="sep">·</span><span class="hud-tag">NO WEAPON</span>' : '') +
      // in a fight slots and power give way to the fight line (r2: it ran off the edge at 1280 px)
      (fight ? '' : `<span class="sep">·</span><span class="hud-k">slots</span> ${su}/${p.slots} ${pips(su, p.slots)}<span class="sep">·</span><span class="hud-k">power</span> ${pu}/${pm} ${pips(pu, pm)}`) +
      (fight ? `<span class="sep">·</span><span class="fight">${boxes(fight)}</span>` : '');
  }
  b.dataset.low = String(p.hp <= p.maxHp * 0.3);
  if (seenGame !== g) {
    seenGame = g;
    seenHurt = p.hurtAt;
  }
  // one of your blows landed: the fight line flashes white (a miss does not)
  const hitAt = Math.max(-99, ...g.ents.map((e) => (e.enemy?.data.hitAt as number) ?? -99));
  if (hitAt > seenHit) {
    seenHit = hitAt;
    b.classList.remove('struck');
    void b.offsetWidth;
    b.classList.add('struck');
  }
  if (p.hurtAt > seenHurt) {
    seenHurt = p.hurtAt;
    f.classList.remove('on');
    void f.offsetWidth; // restart the fade
    f.classList.add('on');
  }
});

/** the foe's hp as CSS boxes: the ▮▯ glyphs read as missing-font boxes in VT323 (playtest r1) */
const boxes = (line: string) => line.replace(/[▮▯]+/, (run) => `<span class="fbar">${[...run].map((c) => `<b${c === '▮' ? ' class="on"' : ''}></b>`).join('')}</span>`);

/** the fight at a glance: what is on you, its hp, and when your next blow lands */
export function fightLine(g: Game): string {
  const foe = engaged(g, 6)[0];
  if (!foe?.enemy) return '';
  const max = Number(foe.enemy.data.maxHp ?? foe.enemy.hp) || 1;
  const hp = Math.max(0, foe.enemy.hp);
  const n = Math.min(8, Math.ceil(max));
  const filled = Math.round((hp / max) * n);
  const bar = '▮'.repeat(filled) + '▯'.repeat(Math.max(0, n - filled));
  const all = engaged(g, 6);
  const more = all.length - 1;
  // a swarm of one kind reads as a count (r2: `▮▮ +4` hid six mites)
  const same = all.every((e) => e.enemy!.type === foe.enemy!.type);
  const count = more > 0 ? (same ? ` ×${all.length}` : ` +${more}`) : '';
  const name = (ENEMIES[foe.enemy.type]?.name ?? 'something').replace(/^(a|an|the) /, '');
  const r = Math.hypot(foe.x - g.player.x, foe.y - g.player.y);
  const blow = weaponLine(g, r);
  // a big blow coming: the elite's (or a walker's) windup, named; rearing mites counted
  const winding = engaged(g, 8).filter((e) => e.enemy!.data.move && g.t < ((e.enemy!.data.windup as number) ?? 0));
  const big = winding.find((e) => e.enemy!.type !== 'mite') ?? winding[0];
  const rears = winding.filter((e) => e.enemy!.type === 'mite').length;
  const move = big?.enemy!.type === 'mite' && rears > 1 ? `${rears} mites rear` : String(big?.enemy!.data.move ?? '');
  const warn = big ? `⚠ ${clip(move, MOVE_MAX)} · ` : '';
  // an elite that missed its big move is open (src/fight/index.ts OPEN)
  const open = all.find((e) => g.t < ((e.enemy!.data.open as number) ?? 0));
  const opened = !open ? '' : open === foe ? '✦ open: hit it · ' : `✦ ${ENEMIES[open.enemy!.type].name.replace(/^(a|an|the) /, '')} open · `;
  return `${warn}${opened}⚔ ${name} ${bar}${count} · ${blow}`;
}

/** the longest move text the fight line shows (r2: it ran off the right edge at 1280 px) */
const MOVE_MAX = 22;
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** your side of the fight line: auto weapons' next blow, aimed ones' shot, or out of reach (`r` cells off) */
export function weaponLine(g: Game, r: number): string {
  const ws = active(g, 'weapon');
  if (!ws.length) return 'you hit nothing';
  const wait = (i: Inst) => Math.max(0, ((i.data.readyAt as number) ?? 0) - g.t);
  const range = (i: Inst) => param<number>(i, 'range', param<string>(i, 'aim', 'auto') === 'aimed' ? 6 : 1.3);
  const inReach = ws.filter((i) => range(i) >= r);
  if (!inReach.length) return 'out of reach';
  const soon = (xs: Inst[]) => Math.min(...xs.map(wait));
  const autos = inReach.filter((i) => param<string>(i, 'aim', 'auto') === 'auto');
  const aims = inReach.filter((i) => param<string>(i, 'aim', 'auto') === 'aimed');
  const parts: string[] = [];
  if (autos.length) parts.push(soon(autos) <= 0.05 ? 'your blow ready' : `your blow ${soon(autos).toFixed(1)}s`);
  if (aims.length) parts.push(soon(aims) <= 0.05 ? 'shoot ready' : `shoot ${soon(aims).toFixed(1)}s`);
  return parts.join(' · ');
}

// the shard fanfare (src/fight/shard.ts): a big line and a gold pulse
let seenShard = 0;
let shardGame: unknown = null;
frameHooks.push((g) => {
  const f = fanfares.get(g);
  if (shardGame !== g) {
    shardGame = g;
    seenShard = f?.n ?? 0;
  }
  if (!f || f.n <= seenShard) return;
  seenShard = f.n;
  document.querySelector('.shard-fanfare')?.remove();
  const el = document.createElement('div');
  el.className = 'shard-fanfare';
  // playtest r3: mid-fight it covered the elite still hitting you; then it is a slim line at the top
  if (g.ents.some((e) => e.kind === 'enemy' && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 8)) el.classList.add('live');
  el.innerHTML = `<div class="shard-pulse"></div><p>SCRIPTURE SHARD ${f.n} of 3</p>`;
  document.body.append(el);
  setTimeout(() => el.remove(), 4200);
});

// an elite turning to you (src/fight/warn.ts): a red line under the HUD for 4 s
let seenTurn = -1;
let turnGame: unknown = null;
frameHooks.push((g) => {
  const t = turned.get(g);
  if (turnGame !== g) {
    turnGame = g;
    seenTurn = t?.at ?? -1;
  }
  if (!t || t.at <= seenTurn) return;
  seenTurn = t.at;
  document.querySelector('.elite-warn')?.remove();
  const el = document.createElement('div');
  el.className = 'elite-warn';
  el.textContent = `⚠ ${t.text}`;
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
});

// ?scene=fight stages a fight in the start chamber for judging: lens, stepper, nail psalm, frost coat
// and mirror ward on, a seraph lamp down the row, three mites and an ossuary walker coming.
let staged = new URLSearchParams(location.search).get('scene') !== 'fight';
frameHooks.push((g) => {
  if (staged) return;
  staged = true;
  clean(g);
  const p = g.player;
  g.ents = g.ents.filter((e) => e.kind !== 'item' || Math.hypot(e.x - p.x, e.y - p.y) > 8);
  p.slots = 6;
  p.core = 10;
  for (const mod of ['saints-lens', 'stepper-relay', 'nail-psalm', 'frost-coat', 'mirror-ward']) {
    p.installed.push({ uid: g.nextId++, mod, on: true, readyAt: 0, data: {} });
    g.stats.mods.push(mod);
  }
  p.dir = -Math.PI / 2;
  const foe = (type: string, x: number, y: number) => g.ents.push({ id: g.nextId++, kind: 'enemy', x, y, enemy: { type, hp: ENEMIES[type].hp, readyAt: 0, data: {} } });
  foe('seraph', 5.5, 8.5);
  foe('mite', 6.5, 5.5);
  foe('mite', 5.5, 5.5);
  foe('mite', 6.5, 6.5);
  foe('walker', 10.5, 11.5);
  g.log.push(['a fight, staged. you face west. '], [{ text: 'shoot', cmd: 'shoot' }, '  ', { text: 'face n', cmd: 'face n' }, '  ', { text: 'face w', cmd: 'face w' }, '  ', { text: 'go s 2', cmd: 'go s 2' }, '  ', { text: 'status', cmd: 'status' }]);
});

// a sweep winding up rings its reach on the map spool: get outside the ring (src/fight/index.ts abbot)
mapHooks.draw.push((g, ctx, ox, oy, px) => {
  for (const e of g.ents) {
    const d = e.enemy?.data;
    if (!d?.wide || !(g.t < ((d.windup as number) ?? 0))) continue;
    ctx.strokeStyle = '#ff3a28';
    ctx.lineWidth = Math.max(1, px * 0.25);
    ctx.setLineDash([Math.max(2, px * 0.5), Math.max(2, px * 0.4)]);
    ctx.beginPath();
    ctx.arc((e.x - ox) * px, (e.y - oy) * px, 2.3 * px, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
});

// ---- bosses (src/fight/bosses.ts): a bar with the name and phase at the top, the wind-up named in red
// over it, and the zones a wind-up will hit drawn on the map spool
let bossBar: HTMLElement | null = null;
frameHooks.push((g) => {
  const here = bossesNear(g).filter((e) => e.enemy!.data.noticed);
  if (!bossBar || !bossBar.isConnected) {
    bossBar = document.createElement('div');
    bossBar.className = 'bossbar';
    document.body.append(bossBar);
  }
  document.body.classList.toggle('boss-on', here.length > 0);
  if (!here.length) {
    bossBar.style.display = 'none';
    return;
  }
  bossBar.style.display = '';
  const lead = here[0];
  const def = BOSS[lead.enemy!.type];
  const name = def.mate ? 'the forge twins' : def.name;
  // the twins share one bar: both their hp over both their full
  const all = def.mate ? bossesNear(g, 40) : [lead];
  const max = all.reduce((s, e) => s + Number(e.enemy!.data.maxHp ?? 1), 0) + (def.mate && all.length < 2 ? BOSS[def.mate].hp : 0);
  const hp = all.reduce((s, e) => s + Math.max(0, e.enemy!.hp), 0);
  const phase = Math.max(...all.map((e) => Number(e.enemy!.data.phase ?? 0)));
  const n = def.phases.length;
  const winding = all.find((e) => e.enemy!.data.move && (g.t < Number(e.enemy!.data.windup ?? 0) || e.enemy!.data.zones || e.enemy!.data.under));
  const open = all.some((e) => g.t < Number(e.enemy!.data.open ?? 0));
  const move = winding ? `⚠ ${winding.enemy!.data.move}` : open ? '✦ open: hit it now' : g.t < stunOf(g) ? '⚠ stunned' : '';
  const key = `${name}|${Math.ceil(hp)}|${phase}|${move}`;
  if (bossBar.dataset.key === key) return;
  bossBar.dataset.key = key;
  const marks = def.at.map((a) => `<u style="left:${a * 100}%"></u>`).join('');
  bossBar.innerHTML =
    `<div class="bb-name">${name}<span>phase ${phase + 1}/${n}</span></div>` +
    `<div class="bb-bar"><b style="width:${(hp / Math.max(1, max)) * 100}%"></b>${marks}</div>` +
    `<div class="bb-move${open && !winding ? ' open' : ''}">${move || '&nbsp;'}</div>`;
});

mapHooks.draw.push((g, ctx, ox, oy, px) => {
  const zones: Zone[] = [];
  for (const e of g.ents) zones.push(...(((e.enemy && BOSS[e.enemy.type] && (e.enemy.data.zones as Zone[] | null)) || []) as Zone[]));
  ctx.lineWidth = Math.max(1, px * 0.25);
  for (const z of zones) {
    ctx.strokeStyle = '#ff3a28';
    ctx.fillStyle = '#ff3a2833';
    ctx.beginPath();
    if (z.k === 'ring') {
      ctx.arc((z.x - ox) * px, (z.y - oy) * px, z.r1 * px, 0, Math.PI * 2);
      if (z.r0 > 0) ctx.arc((z.x - ox) * px, (z.y - oy) * px, z.r0 * px, 0, Math.PI * 2, true);
    } else {
      const [nx, ny] = [-z.vy * z.w, z.vx * z.w];
      const [ex, ey] = [z.x + z.vx * z.len, z.y + z.vy * z.len];
      ctx.moveTo((z.x + nx - ox) * px, (z.y + ny - oy) * px);
      ctx.lineTo((ex + nx - ox) * px, (ey + ny - oy) * px);
      ctx.lineTo((ex - nx - ox) * px, (ey - ny - oy) * px);
      ctx.lineTo((z.x - nx - ox) * px, (z.y - ny - oy) * px);
      ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.stroke();
  }
  for (const q of poolsOf(g)) {
    ctx.fillStyle = '#ff8a2055';
    ctx.beginPath();
    ctx.arc((q.x - ox) * px, (q.y - oy) * px, q.r * px, 0, Math.PI * 2);
    ctx.fill();
  }
});

// ?boss=<floor>:<variant> (floor 0..4, variant 0..2 or a name like queen) stages a boss fight next to you
// with that floor's usual loadout, for judging and balance
const bossParam = new URLSearchParams(location.search).get('boss');
let bossStaged: unknown = null;
frameHooks.push((g) => {
  if (!bossParam || bossStaged === g) return;
  bossStaged = g;
  const [f, v] = bossParam.split(':');
  const floor = Math.max(0, Math.min(4, Number(f) || 0));
  const list = BOSSES[floor].filter((b) => !b.mate || b.id < b.mate);
  const byName = list.find((b) => v && b.id === `boss-${v}`);
  const variant = byName ?? list[Math.min(list.length - 1, Number(v) || 0)];
  clean(g);
  stageBoss(g, floor, variant?.id);
});
