// The fight on screen: an hp bar always on top, and a red flash when you are hurt.
import { frameHooks } from '../ui';

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
  const hp = Math.max(0, Math.ceil(p.hp));
  const cells = Math.max(1, Math.round(p.maxHp));
  const full = Math.round((Math.max(0, p.hp) / p.maxHp) * cells);
  const text = `hp ${'▮'.repeat(full)}${'▯'.repeat(Math.max(0, cells - full))} ${hp}/${p.maxHp}`;
  if (b.textContent !== text) b.textContent = text;
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
