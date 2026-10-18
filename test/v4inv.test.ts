import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/world';
import '../src/tune/hints';
import { newGame, tickHooks } from '../src/core/game';
import { exec } from '../src/core/verbs';
import type { Game } from '../src/core/types';
import { startKit } from '../src/tune/start';
import { cacheProp, cardOpen, hideCard, wasOpened } from '../src/world/cache';
import { goDown } from '../src/world/floors';
import { switchCmd } from '../src/ui/panels';

const text = (g: Game) => g.log.map((l) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('')).join('\n');
const tick = (g: Game) => tickHooks.forEach((f) => f(g, 0.1));

describe('v4 inv: the reliquary opens on purpose', () => {
  it('stays shut on arrival; walking into it or `open` opens it; walking off shuts it', () => {
    const g = newGame(4);
    startKit(g);
    goDown(g, 1);
    tick(g);
    expect(cardOpen(g)).toBe(false);
    expect(text(g)).toMatch(/reliquary stands two cells south/);
    exec(g, 'open');
    expect(cardOpen(g)).toBe(true);
    expect(wasOpened(g)).toBe(true);
    expect(text(g)).toMatch(/a reliquary of the old machines: take what you need/);
    hideCard(g, true);
    expect(cardOpen(g)).toBe(false);
    // walk into it
    const e = cacheProp(g)!;
    [g.player.x, g.player.y] = [e.x, e.y - 1];
    tick(g);
    expect(cardOpen(g)).toBe(true);
    hideCard(g, true);
    tick(g);
    expect(cardOpen(g)).toBe(false); // `later` while standing by keeps it shut
    [g.player.x, g.player.y] = [e.x + 10, e.y];
    tick(g);
    [g.player.x, g.player.y] = [e.x, e.y - 1];
    tick(g);
    expect(cardOpen(g)).toBe(true);
  });

  it('`where` names an unopened reliquary once', () => {
    const g = newGame(4);
    startKit(g);
    goDown(g, 1);
    exec(g, 'where');
    exec(g, 'where');
    expect(text(g).match(/waits where you landed/g)?.length).toBe(1);
  });
});

describe('v4 inv: a double-click on a bag module', () => {
  it('installs when it fits, never trades the map away', () => {
    const g = newGame(4);
    startKit(g);
    g.player.inv.push({ kind: 'mod', mod: 'choir-bell' });
    const it = g.player.inv.at(-1) as { kind: 'mod'; mod: string };
    const cmd = switchCmd(g, it);
    expect(cmd).toMatch(/choir bell/);
    expect(cmd).not.toMatch(/map/);
  });
});
