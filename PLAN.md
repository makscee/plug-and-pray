# thaw: the build plan

DESIGN.md is what. This is how, who and in what order. Maks: dev speed first, no schedule predictions, this concept is the entry (committed, no fallback). The Compo closes Sunday 2026-10-18 22:00 UTC, uploads until 23:00 UTC.

## Who

- **The `thaw` seat** (m1, card #1309) holds mission #1310, built the spine, releases slices to loop workers, runs the merge check on every PR and merges to `main` (Pages deploys it).
- **Loop workers**, four at a time, take the slices. Every card runs Opus.

## Repo and commands

- Vite + TypeScript + Three.js. `npm test` (vitest on the core), `npm run build`, `npm run play` (headless run on seed 1 with the clock stopped; the merge check), `node scripts/look.mjs . '["take","install pinhole",1.5]' out.png` (a screenshot after commands; numbers step time).
- In the browser: `?seed=N` fixes the world, `?still` stops the clock (`step(s)` advances it), `window.thaw = { g, screen, send(cmd), restart() }`.

## The spine (on main): where things live

| Path | What |
|---|---|
| `src/core/types.ts` | `Game`, `Player`, `Inst`, `Item`, `Entity`, `Enemy`, `Vector`, `Chunk`, `Line`/`Seg` |
| `src/core/game.ts` | `newGame(seed)`, `tick(g, dt)`, `say`, `spawn`, `spawnEnemy`, `hurt`, `strike`, `chase` (default AI), `enemy(type, def)`, hooks: `tickHooks`, `hurtHooks`, `killHooks` |
| `src/core/grid.ts` | `CHUNK` 16, `Cell` (wall 0, floor 1, vein 10+), `cell/setCell/open/clear/ensure`, `setGenerator`, `chunkHook`, `DIRS`, `dirAngle` |
| `src/core/mods.ts` | `ModDef`, `mods([...])`, `family(name, { tick, buttons, status })`, `param(inst, key)` (roll applied), `active(g, family)`, `working`, `switchOn/Off`, `powerMax/Used` |
| `src/core/verbs.ts` | `verb(name, { help, when, run })`, `exec(g, line)`, built-ins: help inv take drop install remove on off status listen; `addItem`, `findItem`, `findInst` |
| `src/mods/table.ts` | every module, one line each; the parameter keys per family are listed at its top |
| `src/mods/<family>.ts` | family logic and verbs (gait: go, crawl, face, stop; weapon: auto strike; power) |
| `src/world/` | `gen.ts` generator (a chamber per chunk, doors on hashed edge offsets), `spawn.ts` (start chamber, loot by distance `lootMod`, enemies) |
| `src/fight/` | the enemy roster (spine: mite) |
| `src/sight/` | `scene.ts` the 3D world (`shoot(g, {res, fov, range})` → RGBA), `index.ts` camera view and `FILTERS` |
| `src/ui/` | `windows.ts` draggable windows with power dot and buttons, `views.ts` `view(family, make)`, `console.ts`, `index.ts` `Screen`, `frameHooks` |
| `src/audio/` | the old synth, `cue(name)`; the sound card reworks it |

A slice adds files in its own folder and registers through these calls. Shared files (`table.ts`, `types.ts`, `play.mjs`) take small additive edits only.

## Slices (mission #1310, wave 1 runs in parallel)

1. **Sight**: PS1 look (vertex snap, affine textures, fog, dark divine-machine walls), camera filters heat, sonar, edge, plus noise and lag; scanners (through walls: heat, metal, flesh, doors, cards, enemies, veins); lamps (light radius, light draws enemies); ~14 camera, scanner and lamp modules in the table.
2. **World**: richer generator (several chambers, ribbed conduits, deeper = stranger), veins and mining (`drain`), printers (`print slot`, `print module`), memory cards, the card reader, vectors that place things, the scripture shards and the Thaw Engine, map spool and drowned compass windows; ~8 modules.
3. **Fight**: choir mites, seraph lamp (slow orb you dodge), ossuary walker, the hum (hidden), the mimic; aimed weapons (`shoot`), hit feedback, HP regeneration, body modules (lead lung, frost coat, mirror ward), drops; ~8 modules.
4. **Body**: servo gait (arrow keys), gyro heart (WASD + mouse aim, console focus with Enter/Esc), tunnel tongue (`dig`), power modules, the ledger window, clock of hours, slot boards; ~8 modules.
5. **Finish** (after 1–4): sound for the new game, the Thaw Engine ending (heart warms, windows melt, end card), packaging (`npm run package`, shots, page texts), tuning a full run.

Every PR: `npm test`, `npm run build`, `npm run play` pass, play steps for what it adds, a How to try with a `look.mjs` command or a Pages link.
