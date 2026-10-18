// The fight on screen: an hp bar always on top, and a red flash when you are hurt.
import { ENEMIES } from '../core/game';
import { active, param, powerMax, powerUsed } from '../core/mods';
import type { Game, Inst } from '../core/types';
import { engaged } from '../sight/foes';
import { frameHooks } from '../ui';
import { pips } from '../ui/panels';
import { hpText } from './report';
import { fanfares } from './shard';
import { clean } from '../tune/start';

let bar: HTMLElement | null = null;
let flash: HTMLElement | null = null;
let seenHurt = -99;
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
  const [su, pu, pm] = [p.installed.length, powerUsed(g), powerMax(g)];
  const fight = fightLine(g);
  const key = `${text} ${su}/${p.slots} ${pu}/${pm} ${fight}`;
  if (b.dataset.text !== key) {
    b.dataset.text = key;
    // hp, then the two resources every choice spends: slots and power
    b.innerHTML = `hp <i><b style="width:${(Math.max(0, p.hp) / p.maxHp) * 100}%"></b></i> ${text}` +
      `<span class="sep">·</span>slots ${su}/${p.slots} ${pips(su, p.slots)}<span class="sep">·</span>power ${pu}/${pm} ${pips(pu, pm)}` +
      (fight ? `<span class="sep">·</span><span class="fight" style="color:#ff6a50">${fight}</span>` : '');
  }
  b.dataset.low = String(p.hp <= p.maxHp * 0.3);
  if (seenGame !== g) {
    seenGame = g;
    seenHurt = p.hurtAt;
  }
  if (p.hurtAt > seenHurt) {
    seenHurt = p.hurtAt;
    f.classList.remove('on');
    void f.offsetWidth; // restart the fade
    f.classList.add('on');
  }
});

/** the fight at a glance: what is on you, its hp, and when your next blow lands */
export function fightLine(g: Game): string {
  const foe = engaged(g, 6)[0];
  if (!foe?.enemy) return '';
  const max = Number(foe.enemy.data.maxHp ?? foe.enemy.hp) || 1;
  const hp = Math.max(0, foe.enemy.hp);
  const n = Math.min(10, Math.ceil(max));
  const filled = Math.round((hp / max) * n);
  const bar = '▮'.repeat(filled) + '▯'.repeat(Math.max(0, n - filled));
  const more = engaged(g, 6).length - 1;
  const name = (ENEMIES[foe.enemy.type]?.name ?? 'something').replace(/^(a|an|the) /, '');
  const r = Math.hypot(foe.x - g.player.x, foe.y - g.player.y);
  const blow = weaponLine(g, r);
  // a big blow coming: the elite's (or a walker's) windup, named
  const big = engaged(g, 8).find((e) => e.enemy!.data.move && g.t < ((e.enemy!.data.windup as number) ?? 0));
  const warn = big ? `⚠ ${big.enemy!.data.move} · ` : '';
  return `${warn}⚔ ${name} ${bar}${more > 0 ? ` +${more}` : ''} · ${blow}`;
}

/** your side of the fight line: auto weapons' next blow, aimed ones' shot, or out of reach (`r` cells off) */
export function weaponLine(g: Game, r: number): string {
  const ws = active(g, 'weapon');
  if (!ws.length) return 'no weapon on';
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
  el.innerHTML = `<div class="shard-pulse"></div><p>SCRIPTURE SHARD ${f.n} of 3</p>`;
  document.body.append(el);
  setTimeout(() => el.remove(), 4200);
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
