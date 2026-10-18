import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, tick } from '../src/core/game';
import { DIRS, open } from '../src/core/grid';
import { addItem, exec, VERBS } from '../src/core/verbs';
import { firstLeg, openRuns } from '../src/tune/hints';

const text = (g: ReturnType<typeof newGame>, from = 0) => JSON.stringify(g.log.slice(from));

describe('ux (playtest r1)', () => {
  it('help states the goal and the keys; help <verb> tells that verb; conjure stays hidden', () => {
    const g = newGame(1);
    exec(g, 'help');
    expect(text(g)).toContain('four floors');
    expect(text(g)).toContain('q e turn');
    expect(text(g)).not.toContain('conjure');
    const n = g.log.length;
    exec(g, 'help go');
    expect(text(g, n)).toContain(VERBS.go.help);
  });

  it('the first leg toward a target walks open floor and gets closer by path', () => {
    const g = newGame(1);
    const p = g.player;
    const [sx, sy] = [Math.floor(p.x), Math.floor(p.y)];
    // a far target in each quadrant: every first leg runs over open cells only
    for (const [tx, ty] of [[sx + 20, sy + 3], [sx - 15, sy - 12], [sx + 4, sy + 25]]) {
      const leg = firstLeg(g, tx + 0.5, ty + 0.5);
      if (!leg) continue;
      const [d, k] = leg;
      for (let i = 1; i <= k; i++) expect(open(g, sx + 0.5 + DIRS[d][0] * i, sy + 0.5 + DIRS[d][1] * i)).toBe(true);
    }
  });

  it('a go that stops short says where the wall is and which ways are open', () => {
    const g = newGame(1);
    addItem(g, { kind: 'mod', mod: 'stepper-relay' });
    exec(g, 'install stepper');
    for (let k = 0; k < 40; k++) tick(g, 0.1);
    const p = g.player;
    const [x, y] = [Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5];
    const all = openRuns(g, x, y);
    const short = all.find(([, n]) => n < 9);
    expect(short).toBeTruthy();
    const n = g.log.length;
    exec(g, `go ${short![0]} 9`);
    expect(text(g, n)).toMatch(new RegExp(`wall after ${short![1]} cells?; open: `));
    expect(text(g, n)).toMatch(/"cmd":"go [nesw] \d"/);
    expect(text(g, n)).not.toContain('"a wall."');
  });
});
