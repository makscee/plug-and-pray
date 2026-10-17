# thaw: the build plan

DESIGN.md is what. This is how, who and in what order. Maks's instruction for the whole plan: build as fast as possible, dev speed first, no schedule predictions. The Compo closes Sunday 2026-10-18 22:00 UTC, uploads until 23:00 UTC.

## Who

- **The `thaw` seat** on m1, pin 7, holds the mission and builds the spine itself (`vf take` on the spine slice), then releases the slices to loop workers, merges each PR after playing it, and keeps pacing, text and the final shot in its own hands. It follows the seat and orchestrator skills in `makscee/void-board`.
- **Loop workers**, four at a time at most, take the released slices. Every card runs Opus.
- **Maks** plays the Pages URL whenever he wants, answers the seat's `You:` lines, and presses the itch.io and LD submit buttons at the end. Two pings to his phone through the `maks` mailbox: when the first full build is playable end to end, and when the submission package is ready.

## Priority

Most essential and fastest first. Read backwards it is the cut order: when time runs out, the bottom goes first.

1. The spine: terminal window, click grammar, filesystem, bus, mount, power, the row ladder, the forest map, the sol clock, autosave, Pages deploy, placeholder content, the interfaces below.
2. The scene, `snap`, `?` things, `arm`.
3. The terrain layer, places, `drive`.
4. The drives' text, the whole story as data.
5. `send`, the packet, the four endings, the end card.
6. `cam`.
7. Sound.
8. The 160 pixel optics step.
9. The three stored frames and `view`.
10. The sibling `T-2`.
11. The mid-road blur.

## Repo and commands

- Vite + TypeScript + Three.js, npm. `npm run dev`, `npm run build`, `npm test` (vitest on the model and the commands), `npm run play` (a Playwright script that clicks through the whole game headless and fails on the first dead end; it is the merge check).
- Layout: `src/main.ts`; `src/model/` the world data model, state and commands; `src/term/` the terminal window, tokens, typing and printing; `src/windows/` the window framework; `src/map/`; `src/scene/`; `src/audio/`; `src/content/` the drives, places and facts as data; `public/` the font.
- Pages: a GitHub Actions workflow builds `main` and deploys `dist/` to Pages on every push. The seat enables Pages on the first run.
- `main` is the mission branch: slices merge straight to `main`, which is what Pages serves. Maks's acceptance is the submission.

## Interfaces the spine fixes

Slices run in parallel only because the spine ships these before they are released. Names are indicative; the seat fixes the exact signatures in code and the slice briefs quote them.

- `src/model/world.ts`: `Node` with `id`, `kind` (`folder | file | tool | device | subsystem | place | thing | fact`), `name`, `parent`, and per kind `lines`, `tool`, `device`, `place`, `fact`; `World` as a map of nodes plus `State`: `rows`, `sol`, `light`, `position`, `heading`, `listed`, `mounted`, `powered`, `known`, `bar`, `facts`, `lastOutput`.
- `src/model/commands.ts`: `run(verb, noun?) => Output`, where `Output` is lines of `string | Token` and `Token` is `{ text, nodeId, kind }`. Default verbs per kind live here. The terminal only renders `Output` and sends clicks back as `(verb, noun)`.
- `src/windows/index.ts`: `open(name: 'map' | 'frame' | 'cam')`, `update(name, data)`, `close(name)`.
- `src/scene/index.ts`: `render({ place, heading, res: 64 | 160, blur? }) => { pixels: Uint8Array /* RGB, res*res*3 */, things: { id, mask: Uint8Array }[] }` and `cam(place, heading)`. The spine ships a stub that returns noise and no things so the terminal flow runs without the scene.
- `src/map/index.ts`: `forest(state)` and `terrain(state, places, path)`.
- `src/content/index.ts`: `world(): World`. The spine ships placeholder drives with the real names and one line each, so every slice can play the full flow.
- `src/audio/index.ts`: `cue(name)` with the cue names from DESIGN.md section 14, no-op in the spine.

## Slices

Each slice is a card under the mission card, filed `--planned`; the seat releases a wave by moving its cards to Ready once the spine is on `main` and plays each PR before merging it. Every slice's note ends with How to try and a Pages link.

1. **Spine** (the seat itself, `vf take`): priority item 1 and the interfaces. How to try: play from boot to the 20-row screen and the forest map with the placeholder drives on Pages.
2. **Scene and sight**: the Three.js plain and objects from DESIGN.md sections 8 and 12 (the rover with its deck in frame, mast, crate, habitat with fallen mast, lander, ridge mast, sibling in a crater, rocks), `render` at 64 in eight dusk colours and 160 in 32 (Maks 10-17) with the object-id pass, `snap` with directions and scan-in, `?` things and hover, `arm`, `view` with the three stored frames, the mid-road blur, and `cam` full screen with pan and tilt. The stored frames, the 160 step and the blur are the last things in the slice and drop first.
3. **Terrain and drive**: the terrain layer with fog, path and labeled dots, places from text lines and `NAV` waypoints, `drive` with the sliding dot, the driving line, arrival, the bus refresh by place, sol costs.
4. **Content**: every drive, file, place and fact in `src/content/` from DESIGN.md sections 12 and 13, the boot lines, the readme, the ops log, the home folders, the plea, the almanac, with the names placed as section 12 says. Delivered as data only; `npm run play` must still pass.
5. **Send and the end**: the locked `send` messages, the packet form, the facts and sizes, the four endings and their acknowledgments, the end sequence, the end card and `again`, the late line past sol 22.
6. **Sound**: the cues of section 14 in Web Audio, started on the first click.
7. **Package**: the production build, the zip of `dist/`, five screenshots at 1280 by 720, the LD page text and the itch page text in `submission/`, the opt-out list, the README with the play link. Filed last, after the game is whole.

Wave 1 is slice 1. Wave 2 is slices 2, 3, 4 and 5 at once. Wave 3 is 6 and 7, plus whatever the full play-through turned up as `Next:` items on one running card under the mission.

## The seat's merge check

For every PR: check out the commit in a clean copy, `npm test`, `npm run build`, `npm run play`, then play the slice's How to try by hand on the Pages preview, and the cases around it. Pass: merge, release what it unblocked. Fail: reopen with the exact failing cases and a repro command.

## Submission checklist

- Pages URL works in a fresh profile, loads offline after the first load, and a full run takes 20 to 25 minutes.
- `submission/thaw.zip` of `dist/` for the itch.io HTML5 upload; five screenshots; the LD page text; the itch page text.
- LD page: title `thaw`, links HTML5 (itch) and Source Code (this repo), opt out of Graphics and Audio.
- Maks uploads to itch.io and submits the LD page before Sunday 23:00 UTC, Monday 02:00 MSK.
