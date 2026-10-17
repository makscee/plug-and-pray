// The fight slice: the enemy roster and their behaviours, shots in flight, aimed weapons, hp and
// the body modules, drops and the console's account of a fight. src/fight/ui.ts is the screen side.
import { chase, ENEMIES, enemy, hurt, say } from '../core/game';
import { clear } from '../core/grid';
import type { Entity, Game } from '../core/types';
import { fire } from './shots';
import './shots';
import './aim';
import './body';
import './mimic';
import './spawn';
import './drops';
import './report';

const near = (a: Entity, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** the seraph lamp stays put; when you stand in its row or column it sends a slow orb down the line */
function seraph(g: Game, e: Entity): void {
  const d = ENEMIES[e.enemy!.type];
  const p = g.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const inLine = Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6;
  if (!inLine || near(e, p) > d.sense || !clear(g, e.x, e.y, p.x, p.y) || g.t < e.enemy!.readyAt) return;
  e.enemy!.readyAt = g.t + d.cooldown;
  const [vx, vy] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  if (!e.enemy!.data.noticed) {
    e.enemy!.data.noticed = true;
    say(g, 'a seraph lamp turns its light on you.');
  }
  fire(g, { x: e.x, y: e.y, vx: vx * 2.2, vy: vy * 2.2, dmg: d.damage, range: d.sense + 2, src: e, foe: true });
}

/** the walker: slow, heavy; it winds up before it hits, so you can step away */
function walker(g: Game, e: Entity, dt: number): void {
  const p = g.player;
  const en = e.enemy!;
  if (near(e, p) <= 1.1 && g.t >= en.readyAt && !en.data.windup) {
    en.data.windup = g.t + 0.8;
    say(g, 'the ossuary walker lifts its arm.');
    return;
  }
  if (en.data.windup) {
    if (g.t < (en.data.windup as number)) return;
    en.data.windup = 0;
    en.readyAt = g.t + ENEMIES[en.type].cooldown;
    if (near(e, p) <= 1.3) hurt(g, ENEMIES[en.type].damage, e);
    else say(g, 'its arm comes down on nothing.');
    return;
  }
  if (near(e, p) > 1.1) chase(g, e, dt);
}

enemy('mite', { name: 'a choir mite', hp: 2, speed: 2, damage: 1, cooldown: 1.5, sense: 6 });
enemy('seraph', { name: 'a seraph lamp', hp: 3, speed: 0, damage: 2, cooldown: 3, sense: 8, ai: seraph });
enemy('walker', { name: 'an ossuary walker', hp: 8, speed: 0.7, damage: 3, cooldown: 2.5, sense: 7, ai: walker });
enemy('hum', { name: 'the hum', hp: 4, speed: 1.1, damage: 1, cooldown: 2, sense: 5, hidden: true });
enemy('mimic', { name: 'a mimic', hp: 4, speed: 1.4, damage: 2, cooldown: 1.6, sense: 8 });
