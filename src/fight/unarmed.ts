// No weapon on (Maks 10-18: "sounds like I do make hits but I actually don't"). An attack with nothing to
// strike with says so plainly, with a button that arms you; foes closing in on an unarmed body bring it
// up on their own (once every so often), with a dull click instead of a hit sound (src/audio).
import { dist, say, tickHooks } from '../core/game';
import { active, def, label, powerMax, powerUsed } from '../core/mods';
import { verb, VERBS } from '../core/verbs';
import type { Game, Line, Seg } from '../core/types';
import { aimed } from './aim';

/** a weapon is on and warm */
export const armed = (g: Game): boolean => active(g, 'weapon').length > 0;

/** foes this close (that noticed you) make an unarmed body say so */
export const NEAR = 6;
/** and not again within this many seconds */
export const AGAIN = 15;

/** enemies near and after you, the hidden ones too: the HUD's NO WEAPON tag shows while there are any */
export const foesNear = (g: Game, r = NEAR): boolean => g.ents.some((e) => e.enemy?.data.noticed && dist(e, g.player) <= r);

/** what would arm you: a weapon warming, off, or carried; else where to find one */
export function armFix(g: Game): Seg[] {
  const p = g.player;
  const ws = p.installed.filter((i) => def(i).family === 'weapon');
  const warm = ws.find((i) => i.on && g.t < i.readyAt);
  if (warm) return [`${label(warm)} is warming up (${Math.max(1, Math.ceil(warm.readyAt - g.t))} s).`];
  const off = ws.find((i) => !i.on);
  if (off) {
    const fits = powerUsed(g) + def(off).power <= powerMax(g);
    return fits ? [{ text: `on ${label(off)}`, cmd: `on ${label(off)}` }] : [{ text: `swap in ${label(off)}`, cmd: `swap in ${label(off)}` }];
  }
  const it = p.inv.find((x) => x.kind === 'mod' && def(x).family === 'weapon');
  if (it && it.kind === 'mod') {
    const cmd = p.installed.length < p.slots ? 'install' : 'swap in';
    return [{ text: `${cmd} ${label(it)}`, cmd: `${cmd} ${label(it)}` }];
  }
  return ['you carry none: a reliquary or a printer has them. ', { text: 'where', cmd: 'where' }];
}

/** the plain warning: what an attack with nothing on does, and the fix */
export const noWeaponLine = (g: Game): Line => ['⚠ no weapon on: you hit nothing. ', ...armFix(g)];

/** say it, and click dully (the `noweapon` event: src/audio) */
export function warnUnarmed(g: Game): void {
  say(g, noWeaponLine(g));
  g.events.push({ type: 'noweapon' });
  warned.set(g, g.t);
}

// `shoot` with no aimed weapon: unarmed, the warning; an auto weapon, that it strikes by itself
const shoot = VERBS.shoot;
if (shoot) {
  shoot.whenFail = (g) => {
    if (!armed(g)) {
      g.events.push({ type: 'noweapon' });
      return noWeaponLine(g);
    }
    const w = active(g, 'weapon')[0];
    return `shoot: nothing aimed is on. your ${label(w)} strikes by itself whatever comes close.`;
  };
}

verb('attack', {
  help: 'fight: aimed weapons shoot, the rest strike by themselves; with none on, it tells you',
  // on the actions bar only while foes are near and `shoot` is not there already
  when: (g) => foesNear(g, 8) && !aimed(g).length,
  whenFail: (g) => {
    if (armed(g)) return aimed(g).length ? ['attack: nothing near you. ', { text: 'shoot', cmd: 'shoot' }, ' fires anyway.'] : 'attack: nothing near you.';
    g.events.push({ type: 'noweapon' });
    return noWeaponLine(g);
  },
  run(g) {
    if (!armed(g)) return warnUnarmed(g);
    if (aimed(g).length) return VERBS.shoot.run(g, []);
    // v2r4 ux: once a fight, not on every press
    if (tipped.has(g)) return;
    tipped.add(g);
    const w = active(g, 'weapon')[0];
    say(g, `your ${label(w)} strikes by itself whatever comes close. stand by it.`);
  },
});
/** the auto weapon's tip was said in this fight (it ends when nothing is near) */
const tipped = new WeakSet<Game>();
tickHooks.push((g) => void (tipped.has(g) && !foesNear(g, 8) && tipped.delete(g)));

// foes closing on an unarmed body: say it once, then again only after a while
const warned = new WeakMap<Game, number>();
tickHooks.push((g) => {
  if (g.ended || armed(g) || !foesNear(g)) return;
  if (g.t < (warned.get(g) ?? -99) + AGAIN) return;
  warnUnarmed(g);
});
