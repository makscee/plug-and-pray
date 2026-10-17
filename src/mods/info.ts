// `info <module>`: what a module does, for one carried, installed or lying within reach.

import { itemName, reach, say } from '../core/game';
import { label } from '../core/mods';
import { verb } from '../core/verbs';
import { describe } from './describe';

verb('info', {
  help: 'what a module does: info pinhole',
  run(g, args) {
    const q = args.join(' ');
    const all = [
      ...g.player.installed,
      ...g.player.inv.filter((i) => i.kind === 'mod'),
      ...reach(g).map((e) => e.item!).filter((i) => i.kind === 'mod'),
    ] as { mod: string; roll?: import('../core/types').Roll }[];
    const m = all.find((i) => label(i).includes(q) || (q && itemName({ kind: 'mod', ...i }).includes(q)));
    if (!q || !m) return say(g, 'info on what? a module you carry, wear or stand by.');
    const [does, costs, text] = describe(m);
    say(g, [label(m) + ': ' + does], '  ' + costs, '  ' + text);
  },
});
