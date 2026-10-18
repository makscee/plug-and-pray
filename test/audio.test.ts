import { describe, expect, it } from 'vitest';
import '../src/mods';
import { newGame, strike, tick } from '../src/core/game';
import { exec } from '../src/core/verbs';
import { ear, listen } from '../src/audio/listen';
import type { Game } from '../src/core/types';

const run = (g: Game, s: number) => {
  for (let k = 0; k < s * 20; k++) tick(g, 0.05);
};
/** every cue heard while time runs, a frame per tick as the browser does */
const hear = (e: ReturnType<typeof ear>, g: Game, s: number) => {
  const cues: string[] = [];
  for (let k = 0; k < s * 20; k++) {
    tick(g, 0.05);
    cues.push(...listen(e, g).map((p) => p.cue));
  }
  return cues;
};
const now = (e: ReturnType<typeof ear>, g: Game) => listen(e, g).map((p) => p.cue);

describe('sound: what plays when', () => {
  it('a new run is silent on its first frame', () => {
    const e = ear();
    const g = newGame(1);
    exec(g, 'take');
    expect(now(e, g)).toEqual([]);
  });

  it('take, install and the warm-up whine, then a ready blip', () => {
    const e = ear();
    const g = newGame(1);
    listen(e, g);
    g.ents.push({ id: g.nextId++, kind: 'item', x: g.player.x, y: g.player.y, item: { kind: 'res', res: 'bone', n: 1 } }); // v3 econ: nothing fixed at your feet
    exec(g, 'take');
    expect(now(e, g)).toEqual(['take']);
    g.events = [];
    g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' });
    exec(g, 'install pinhole');
    const plays = listen(e, g);
    expect(plays.map((p) => p.cue)).toEqual(['install', 'warm']);
    expect(plays[1].secs).toBeCloseTo(1);
    g.events = [];
    expect(hear(e, g, 1.2)).toEqual(['ready']);
  });

  it('power off sinks, remove clacks', () => {
    const e = ear();
    const g = newGame(1);
    listen(e, g);
    exec(g, 'take');
    g.player.inv.push({ kind: 'mod', mod: 'pinhole-eye' }); // the start chamber holds a halo now (10-18)
    exec(g, 'install pinhole');
    run(g, 1.2);
    listen(e, g);
    exec(g, 'off pinhole');
    expect(now(e, g)).toEqual(['off']);
    exec(g, 'remove pinhole');
    expect(now(e, g)).toEqual(['remove']);
  });

  it('crawling drags twice a cell, the stepper clicks once a cell, arriving is silent', () => {
    const e = ear();
    const g = newGame(1);
    listen(e, g);
    exec(g, 'crawl e');
    expect(hear(e, g, 2.5).filter((c) => c === 'drag')).toHaveLength(2);
    exec(g, 'crawl n');
    hear(e, g, 2.5);
    exec(g, 'take');
    g.player.inv.push({ kind: 'mod', mod: 'stepper-relay' });
    exec(g, 'install stepper');
    hear(e, g, 1);
    exec(g, 'go e 3');
    const cells = g.player.path.length; // a wall may cut the glide short
    expect(cells).toBeGreaterThan(1);
    expect(hear(e, g, 2).filter((c) => c === 'step')).toHaveLength(cells);
  });

  it('hits, kills and hurt; one of each per frame; unknown events are ignored', () => {
    const e = ear();
    const g = newGame(1);
    listen(e, g);
    g.events.push({ type: 'hit' }, { type: 'hit' }, { type: 'kill' }, { type: 'hurt' }, { type: 'wobble' });
    expect(now(e, g)).toEqual(['hit', 'kill', 'hurt']);
    g.events = [{ type: 'print' }, { type: 'card-read' }, { type: 'thaw' }];
    expect(now(e, g)).toEqual(['printer', 'card', 'heart']);
    g.events = [];
    g.cards.push('a');
    expect(now(e, g)).toEqual(['card']);
  });

  it('a real strike is heard', () => {
    const e = ear();
    const g = newGame(1);
    listen(e, g);
    const mite = g.ents.find((x) => x.enemy) ?? { id: -1, kind: 'enemy' as const, x: 9, y: 9, enemy: { type: 'x', hp: 1, readyAt: 0, data: {} } };
    strike(g, mite, 99);
    expect(now(e, g)).toEqual(['hit', 'kill']);
  });

  it('a restart starts a fresh ear', () => {
    const e = ear();
    listen(e, newGame(1));
    const g = newGame(2);
    g.events.push({ type: 'hurt' });
    expect(now(e, g)).toEqual([]);
  });
});
