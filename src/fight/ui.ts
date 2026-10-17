// The fight on screen: an hp bar always on top, and a red flash when you are hurt.
import { ENEMIES } from '../core/game';
import { frameHooks } from '../ui';
import { hpText } from './report';

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
  if (b.dataset.text !== text) {
    b.dataset.text = text;
    b.innerHTML = `hp <i><b style="width:${(Math.max(0, p.hp) / p.maxHp) * 100}%"></b></i> ${text}`;
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

// ?scene=fight stages a fight in the start chamber for judging: lens, stepper, nail psalm, frost coat
// and mirror ward on, a seraph lamp down the row, three mites and an ossuary walker coming.
let staged = new URLSearchParams(location.search).get('scene') !== 'fight';
frameHooks.push((g) => {
  if (staged) return;
  staged = true;
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
