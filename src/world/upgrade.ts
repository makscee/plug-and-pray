// v3 modules (Maks 10-18: "let's introduce module upgrading"): at a printer or an altar, `upgrade <module>` pays
// bone, copper and glass (more each level) and raises an owned module one level, I → II → III. A duplicate find
// does the same for free (src/core/verbs.ts addItem).
import { say } from '../core/game';
import { label, levelKey, maxLevel, moduleLevel, ROMAN, type Modish } from '../core/mods';
import { bagMods, flat, levelUp, verb } from '../core/verbs';
import type { Game, Line } from '../core/types';
import { altarNear } from './altar';
import { affords, fmt, glassTip, pay, printerNear, type Cost } from './printer';

/** what raising it to level 2 and to level 3 costs */
export const UPGRADE_COST: Record<number, Cost> = { 2: { bone: 3, copper: 1, glass: 1 }, 3: { bone: 6, copper: 3, glass: 2 } };
/** what the next level costs, or null at the top */
export const upgradeCost = (m: Modish): Cost | null => (moduleLevel(m) >= maxLevel(m) ? null : UPGRADE_COST[moduleLevel(m) + 1]);

/** everything you own that can still rise: installed first */
export const upgradable = (g: Game): Modish[] => [...g.player.installed, ...bagMods(g)].filter((m) => upgradeCost(m));
const atMachine = (g: Game): boolean => !!printerNear(g) || !!altarNear(g);

/** the buttons a printer or altar lists: one per module that can rise (the first few) */
export function upgradeLines(g: Game, n = 4): Line[] {
  return upgradable(g)
    .slice(0, n)
    .map((m): Line => [{ text: `upgrade ${label(m)}`, cmd: `upgrade ${label(m)}` }, `  → ${ROMAN[moduleLevel(m) + 1]} (${levelKey(m)} +35%): ${fmt(upgradeCost(m)!)}`]);
}

verb('upgrade', {
  help: 'at a printer or altar: raise a module you own one level (I → II → III): upgrade nail psalm',
  when: atMachine,
  whenFail: () => 'upgrades are made at a printer or an altar: step up to one.',
  run(g, args) {
    if (!atMachine(g)) return say(g, 'upgrades are made at a printer or an altar: step up to one.');
    const q = args.join(' ').replace(/^the /, '');
    const all = [...g.player.installed, ...bagMods(g)];
    const m = q ? all.find((i) => flat(label(i)) === flat(q)) ?? all.find((i) => flat(label(i)).includes(flat(q))) : undefined;
    if (!m) {
      const lines = upgradeLines(g, 8);
      return say(g, lines.length ? 'upgrade what?' : 'nothing you own can rise further.', ...lines);
    }
    const c = upgradeCost(m);
    if (!c) return say(g, `${label(m)} is at its top level.`);
    if (!affords(g, c)) return say(g, `${ROMAN[moduleLevel(m) + 1]} wants ${fmt(c)}.${glassTip(g, c, !printerNear(g))}`);
    pay(g, c);
    levelUp(g, m);
  },
});
