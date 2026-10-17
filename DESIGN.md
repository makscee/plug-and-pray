# thaw: design

Ludum Dare 60 Compo entry, theme **Old Tech**. Maks's concept of 2026-10-18, settled in a grilling round with the seat (page: https://m1.twin-pogona.ts.net/r/thaw-delve.html). The first game, the plain and the packet, is tagged `v1-plain`.

## 1. In one line

You are an old machine waking blind inside a dead god's body, an endless divine machinery of chambers and conduits. You start with a console and nothing else. Everything you become is a **module** you find, print and install into a slot on your motherboard. Each module is a window on the screen and changes what you see, how you move, how you fight or what you know.

## 2. The run

- You wake blind: the console says what you hear. A **pinhole eye** lies within reach (`take`, `install`). A **stepper relay** lies in the first chamber. No weapon until a later chamber.
- You explore, loot, install, swap setups, follow **vectors** from memory cards, get deeper.
- Three memory cards are **scripture shards**; together they point to the **Thaw Engine**. Installing it warms the god's heart: the screen floods with light, every window melts, an end card shows the run (distance reached, modules found, time).
- Death: a full restart on a new seed. Runs are short, 20 to 40 minutes.

## 3. The body: slots and power

- The console is built in. You start with **3 slots** and a core of **4 power**.
- A module is **installed** (in a slot, its window on screen) or **in the inventory**. Installing or removing takes about a second.
- An installed module is **on** (draws its power, works) or **off** (draws nothing). Its window has a power dot. Turning it on takes a **warm-up** (0.5 to 3 s, longer for big modules), so a battle setup and an explore setup are planned before the corner, not spammed.
- Power is a cap on what can be on at once, never a fuel. Power modules (ember cell, votive battery, heart-shard) take a slot and add power: every slot pulls three ways, eyes, weapons, power.
- **Printers** turn resources into a slot board (+1 slot, up to 8) or a random module.

## 4. Modules

About **40 hand-named modules**, each a **family** plus a parameter block, all in one table (`src/mods/table.ts`). Adding one is one line. A find sometimes comes **attuned** (one parameter better) or **cracked** (one worse).

| Family | Parameters | Examples |
|---|---|---|
| camera | resolution, colours, fps, fov, range, noise, lag, **filter**: color, gray, 1bit, heat, sonar, edge | pinhole eye (24 px, 1 fps), vidicon tube (64 px, 4 colours, ghosting), saint's lens (240 px, colour, bloom), a sharp fast 1-bit eye, a sonar eye |
| scanner | range, what it sees (heat, metal, flesh, doors, cards, enemies, veins), refresh, shape (cone, ring) | heat choir, lodestone, bone-listener |
| lamp | radius, colour, flicker; light draws enemies | halo, censer of embers, cold star |
| gait | how you move | stepper relay (`go n 3`), servo gait (arrow keys, cell to cell), gyro heart (free WASD and mouse aim) |
| weapon | damage, cooldown, range, auto or aimed | spark finger (auto melee), nail psalm (aimed shot) |
| body | hp, regeneration, armour | lead lung, frost coat |
| mind | what it knows | ledger (inventory window), map spool (top-down map), card reader, drowned compass, clock of hours |
| power | power it adds | ember cell, votive battery, heart-shard |
| unique | vector targets | the ninth eye, Thaw Engine |

Every module window can be dragged. A module that adds actions puts buttons in its window; the buttons type the same commands the console takes.

## 5. Time and control

Real time from the start, Barony style. Early on it feels turn based anyway: you move by commands over cells (`go n 3` glides three cells), enemies are drawn to you, and early weapons strike on their own cooldown when something is adjacent. The **gyro heart** brings free movement inside the cells with WASD and mouse aim, so aimed weapons let you dodge, kite and shoot.

## 6. The world

- An endless grid in 16×16 chunks generated from a seed as you approach: chambers joined by conduits one cell wide. Every chunk connects to its neighbours.
- Look: low poly, super simple, PS1 (vertex snapping, affine textures, fog, point lights), dark. Divine machinery inside a dead god: ribbed walls, inlaid bone-iron, the god's veins glowing faintly. Lamps are modules.
- Farther from the start: rarer loot, meaner enemies.
- You see the world only through camera windows (first person). The map spool is a top-down window.

## 7. Enemies

- **Choir mites**: in threes, fast, weak, melee.
- **Seraph lamp**: stays put, fires a slow orb down its line; dodge it.
- **Ossuary walker**: slow, heavy, hits hard; kite it.
- **The hum**: invisible to cameras, seen only by heat or flesh scanners.
- **Mimic**: looks like a module lying on the floor; a scanner can tell.

HP, damage, slow regeneration (faster with body modules).

## 8. Loot and vectors

- Resources: **bone-iron**, **glass**, **copper**, **ichor** (the god's frozen blood, rare). They lie around, drop from enemies and are mined from glowing veins in walls (a module; mining makes noise).
- Inventory is console text (`inv`, each item a button) until the **ledger** gives it a window.
- **Memory cards**, read with a card reader, give a vector: distance and bearing to a cache, a printer or a unique module. The world puts that thing in the chunk the vector points at. Most cards are last logs of earlier machines who came down before you; the three Engine shards are scripture.

## 9. Sound

Synthesized cues: steps, hits, hum of modules, warm-up, the heart at the end. Maks opts out of the Audio and Graphics categories and submits himself.
