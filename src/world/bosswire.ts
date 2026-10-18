// Joins the floors (src/world/floors.ts) and the bosses (src/fight/bosses.ts): the floors wake a boss in its
// room with the bosses' spawnBoss, and a boss's death opens its floor's stairs (or, in the heart, thaws the god).
import { bossHooks as fightHooks, spawnBoss } from '../fight/bosses';
import { bossHooks, floorAt, onBossDown } from './floors';

bossHooks.spawn = (g, f, x, y) => spawnBoss(g, f, x, y);
fightHooks.down = (g, e) => onBossDown(g, floorAt(e.x));
