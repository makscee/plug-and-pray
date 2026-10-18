// ?icons: a sheet of every icon the game draws (every module, a rolled pair, resources, cards, world
// things), over the game, for judging the icons at a glance.

import { MODS } from '../core/mods';
import { RES } from '../core/types';
import { img, type Of } from './icons';

if (/[?&]icons\b/.test(globalThis.location?.search ?? '')) {
  const show = () => {
    const sheet = document.createElement('div');
    sheet.className = 'icon-sheet';
    const add = (of: Of, name: string) => {
      const c = document.createElement('figure');
      c.append(img(of, 3));
      const t = document.createElement('figcaption');
      t.textContent = name;
      c.append(t);
      sheet.append(c);
    };
    const mods = Object.values(MODS).sort((a, b) => a.family.localeCompare(b.family) || a.tier - b.tier);
    for (const m of mods) add({ mod: m.id }, m.name);
    const rolled = mods.find((m) => m.family === 'weapon')!;
    add({ mod: rolled.id, roll: { key: 'damage', mult: 1.4, tag: 'attuned' } }, `attuned ${rolled.name}`);
    add({ mod: rolled.id, roll: { key: 'damage', mult: 0.7, tag: 'cracked' } }, `cracked ${rolled.name}`);
    for (const r of RES) add({ kind: 'res', res: r, n: 1 }, r);
    for (const r of RES) add({ vein: r }, `${r} vein`);
    add({ kind: 'card', card: 'log-surveyor' }, 'log card');
    add({ kind: 'card', card: 'shard-1' }, 'scripture');
    add({ thing: 'printer' }, 'printer');
    add({ thing: 'shop' }, 'reliquary');
    add({ thing: 'altar' }, 'altar');
    document.body.append(sheet);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', show);
  else setTimeout(show, 0);
}
