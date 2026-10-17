# thaw

A click-only terminal game for Ludum Dare 60, theme "Old Tech". You are a machine that froze for forty-one years and just woke with its memory gone. You have a filesystem, five rows of screen and two commands. You mount the drives of your own parts, then of the things next to you, then of the things out on the plain, and what you find tells you what you are and what you must do before the light goes: send one message so the four people in the cryo pods get found.

Everything the player does is a click. Every click types a command into the terminal, character by character, and runs it. Tools found on drives open new views: a bigger screen, a map, a 64-pixel camera, driving, a real 3D camera at the very end. The 3D world exists from the first second; the game is about earning ways to see it.

This page is the spec. PLAN.md is how it gets built. Decisions here were made by Maks on 2026-10-17 in a design session; change them only on his word.

## 1. Fixed facts

- **Event:** Ludum Dare 60, the **Compo**. Solo, everything made inside the 48 hours, source public, tools, libraries and content generators allowed. AI tools are allowed in both events; the FAQ asks to opt out of voting categories where a generation tool did most of the work. We **opt out of Graphics and Audio** and stay in Overall, Fun, Innovation, Theme and Mood. Sources: https://ldjam.com/events/ludum-dare/rules and https://ludumdare.com/resources/questions/can-i-use-ai/
- **Deadline:** the Compo ends **Sunday 2026-10-18 22:00 UTC** (Monday 01:00 MSK), with one extra hour to upload, so uploads close 23:00 UTC. A Compo entry that misses the hour can still be submitted to the Jam, which ends Monday 2026-10-19 22:00 UTC. Source: https://ldjam.com/events/ludum-dare/60
- **Submission:** the game is hosted elsewhere and linked from the LD page: an itch.io HTML5 page plus a "Source Code" link to this repo. Maks presses the submit buttons himself on both sites; the build produces the zip, five screenshots and both page texts.
- **Stack:** Vite + TypeScript, a DOM terminal, Three.js for the scene, no UI framework, npm. Sound is synthesized with Web Audio, no audio files. One bundled monospace font with a bitmap feel.
- **Repo:** `makscee/thaw`, public, MIT. Every merge to `main` deploys to GitHub Pages; that URL is where Maks plays during the jam.
- **Target:** one playthrough of 20 to 25 minutes for a rater who reads. Desktop browsers first; no phone layout work. English only. No analytics, no external calls; the page works offline once loaded.

## 2. The player's loop

One cycle, once everything is unlocked:

1. `snap` a frame of what is around you, 64 by 64 pixels in eight colours, scanned in. The things in view are `?` tokens under the frame; you do not know what one is until you reach it.
2. `arm` a `?`: a line of text names it, and if it has a drive, a new device appears on the bus.
3. `mount` it: a new tree on the map, and inside, context, a tool, or a place.
4. A place you have read about becomes a dot on the terrain map. Click it, your dot moves, you wait, you arrive, you snap again.

Before `snap` the bus only has your own parts and the live things next to you, and mounting them is the first third. Before `drive` the things in frame are what you froze next to. After, the same cycle runs over the whole plain.

The arc by share of the playthrough:

| Share | Unlocked | Where it comes from | What it does to the story |
|---|---|---|---|
| 0 to 33 | `tail`, `dev`, `mount`, `power`, `map`, `arm`, the sol counter, a locked `send` | your own parts: power board, memory, arm, radio; the weather mast mounted blind | the wake, the operator's voice, the window of light |
| 33 | `term.conf` and `more`, then `snap` | the display controller and the imaging unit, switched on by learning their names | the screen grows, then the first frame: a pole, a crate, a horizon, your own wheel |
| 33 to 50 | arm the crate: better optics, then `drive` and the terrain map | the dropped crate, then the navigation unit switched on by its name | where you are: three places with names and distances |
| 50 to 90 | drive, snap, arm, mount, repeat | the habitat, the lander, the sibling in the crater | four pods, the plea that never left, the uplink key, the relay firmware, the camera |
| 90 to 100 | `cam`, `send` | the relay mast on the ridge | look around once, send, the end |

## 3. The screen

Windows on a black page. Nothing else: no title screen, no menu; the page boots straight into the terminal.

- **TERM**, the terminal window, centered. 48 columns. Top to bottom: the output rows, 5 at the start and 20 after `term.conf`; the input line with the prompt where the typing is animated; the button bar of known commands. Output is a screen, not a log: each command's output replaces the previous one, and five rows are really five rows.
- **MAP**, opened by `map`. Two layers: the filesystem forest, and from `drive` on the terrain layer, toggled by a token in its title bar. About 320 by 320 px, to the side of TERM.
- **FRAME**, opened by `snap`. The last picture at 64 by 64 shown at 320 by 320 with pixelated rendering, later 160 by 160; the direction and the `?` tokens sit under it.
- **CAM**, opened by `cam` at the end: the Three.js scene fills the whole viewport behind the windows, which turn semi-transparent and float over the landscape.

Look: background `#0b0b0c`; text dim grey `#9a9a93`, headers `#d8d8d0`; one accent, amber `#ffb000`, for everything clickable; hovered token: amber background, black text; a token that does not fit the waiting verb dims to 40%. Cursor: an amber block blinking at 1 Hz. Window borders 1 px `#2a2a2a` with a title at the top left, `TERM`, `MAP`, `FRAME`. No CRT curvature, no scanlines.

Motion: typing 20 ms per character; output prints a line at a time at 30 ms per line; a frame scans in top to bottom over 1 s; the TERM window grows to 20 rows over 0.5 s; the map dot slides for 10 s on a drive. The seat tunes the milliseconds by feel.

## 4. Click grammar

There is no keyboard. Every command is typed by the game when something is clicked.

- **Nouns** are the names on screen: folders, files, tools, devices, subsystems, places, `?` things, numbers in a config. Each kind has a default verb: a folder lists, a file reads, a tool installs, an unmounted device mounts, a mounted device lists, an off subsystem powers on, a place drives, a `?` arms, the number in `term.conf` sets. Clicking a noun with no verb waiting types the default verb, a space, the noun, and enter: a click on `readme` visibly types `read readme`.
- **Verbs** are the buttons in the bar. A verb that takes no noun runs at once: `ls` lists root, `dev` lists the bus, `power` lists subsystems, `map` opens the map, `more` continues the last truncated output, `send` opens the packet form, `cam` opens the camera. A verb that needs a noun leaves the cursor waiting after it, `tail ▮`; while it waits only the nouns that fit stay amber and the rest dim; the next fitting click types the noun and enter. Clicking any verb while one waits cancels it and starts anew. `snap` takes a direction: `n e s w` appear as tokens next to it.
- **The bar grows.** At boot it holds only `ls`. A verb joins the bar the first time it is shown on screen as a word in a text (the readme names `tail` and `mount`) or installed from a drive (a mount's output ends with a `tools:` line; clicking a tool name there installs it and prints its one-line help). Once in the bar a verb stays.
- **Names as keys.** A word inside any text is a token when it names something that exists anywhere in the world: a folder, a file, a device, a subsystem, a place. That is how the player reaches things no listing showed. Every clickable name is therefore unique across the world.

## 5. The filesystem

- No current directory, no `cd`, no `pwd`, no "up". `ls` alone lists your own root. `ls X` lists X. A folder exists for the player once its name has been seen.
- Root at boot: `readme`, `dev/`, `boot.log`, `bin/`, `tmp/`. `dev/` lists the devices on the bus. `bin/` holds the built-ins `ls`, `read`, `tail` as tool files whose help is one line each.
- A listing shows names as tokens: folders end with `/`, tools with `*`, files plain. It shows as many entries as the rows allow and then `+N more`, which is dead text until `more` exists.
- `read X` prints the first lines of X that fit the rows; `tail X` prints the last ones; `more` prints the next page of whatever was truncated last. With 5 rows that is 4 lines of text and a header line.
- Each mounted drive is its own root, listed by the device's name. The MAP's forest layer draws every node the player has listed, one tree per machine; clicking a node there lists it again.
- Garbled text is runs of `▓` inside otherwise readable lines; it is never repaired.

## 6. The row ladder

Five rows from boot. `tail` is named in the readme, so for the first third the player reads the heads and the tails of files, and every key in that ring sits in a head or a tail. At one third the display controller comes on: its drive holds `term.conf`, where `rows=5` has a clickable number that sets 20, one step, and the tool `more`, which opens the long logs. The last step of the ladder is `cam`, which takes the whole screen.

## 7. Devices and the bus

`dev` lists what is on the bus: name, kind, state (`on`, `off`, `mounted`, `ext`). Three kinds of thing:

- **Your own parts**, on the internal bus from boot: `PWR` power board, `ARM` arm controller, `MEM` memory, `RADIO` radio, all on; `DSP` display, `IMG` imaging, `NAV` navigation, all off. An off part is not on the bus yet: `power` lists it as `? off`, unnamed. Its name sits in a text somewhere in the current ring; the first time that name is shown it is a token, clicking it types `power DSP` and the part comes on, appears on the bus and can be mounted. That is the pacing device of the first half.
- **Live things nearby**, broadcasting: the weather mast `WX` is on the bus from boot as `ext`. The player mounts it blind and only learns what it is at the first snap. After `drive`, the live things in range at a place appear on the bus on arrival: the habitat `HAB`.
- **Dead things**, unpowered: they show in a frame as `?` and need the arm. `arm ?` costs one sol, prints what it is and, if it has a drive, puts it on the bus: the crate `INS`, the lander `LDR`, the relay mast `RLY`, the sibling `T-2`. A `?` that is nothing prints one line, "a rock", and that is all.

`mount X` prints X's root listing, so a drive opens in one click, and ends with `tools:` when the drive has any. Anything in the current frame is within the arm's reach; there is no range check.

## 8. Looking

- `snap d`, d one of `n e s w`. The mast camera pans; the first snap defaults to the heading you froze with. The frame is the scene rendered from the mast at your place in that direction, 60 degrees of view, in colour as `cam` sees it, at 64 by 64 in a small dusk palette of eight colours taken from the scene (shadow, slate, rust, amber, cream and their darks), with a 4 by 4 Bayer ordered dither between palette colours, shown at 320 by 320 pixelated and scanned in over a second into the FRAME window. Maks 10-17: "frames are impossible to read: pixels too big, no colour"; this replaced 32 by 32 one-bit.
- **Things:** every object tagged as a thing in view gets a `?` token under the frame, left to right. Hover lights its pixels, through an object-id pass of the same render. `arm ?` names it.
- **Optics ladder:** 64 by 64 in the eight dusk colours from `IMG`; 160 by 160 in 32 colours along the same ramps with a light dither after the crate's optics are installed, also shown at 320 by 320 (Maks 10-17); `cam` from the sibling's camera, or from the habitat's exterior camera module if the sibling is cut.
- **Stored frames:** `view` lists three frames stored in `IMG`: the lander on landing day, the habitat with four figures, the operator waving. They are rendered from the same scene with capsule figures for people, at 64 by 64 in the first step's palette.
- **Mid-road:** a snap while driving renders from the interpolated position with a horizontal smear, one render with blur, nothing more.
- **The reveal:** the game never says "rover". The bottom rows of every forward frame show your own panel edge and a wheel, because the rover model is part of the scene. The operator calls you T. The habitat's files say `T-1` and tell where `T-2` got stuck.
- `cam` at the end is the same scene full screen with slow pan and tilt only, no zoom, no movement.

## 9. Driving

- The terrain layer in MAP: you at the center, fog over everything not yet seen, a seen disc around every visited place and along the path, known places as labeled dots with their distance, the path drawn and kept.
- A place becomes known when its line in a text is clicked, "HAB 3.0 km bearing 040", or from the `NAV` waypoints.
- `drive P`: the dot slides for about ten real seconds; the terminal shows `driving  HAB  2.1 km` with a `snap` token; on arrival the bus is refreshed with the live things in range, the sol counter advances by the drive's cost, and the mast camera is now at the new place. Return trips are allowed; places stay reachable.
- Places and distances from where you woke: `WX` and `INS` next to you; `LDR` 1.5 km bearing 200; `T-2` 2.0 km bearing 300, the crater; `HAB` 3.0 km bearing 040; `RLY` 4.0 km bearing 090, the ridge. A drive costs `ceil(km / 1.5)` sols along the straight line between the two places.

## 10. The clock

Soft pressure, never a wall. The prompt is `>` until `PWR` is mounted, then `sol 1 >`, and once the almanac in `WX` has been read, `sol 1/22 >`. Costs: an arm use one sol, a drive by distance. From sol 18 the prompt reads `sol 18/22 · cold >`. Past 22 nothing stops: the prompt reads `sol 24/22 · cold >` and the ending adds one line about sending late. The necessary route costs about twelve sols; the sibling detour about four more.

## 11. The message

- `send` is in the bar from the radio's drive, and until the end it only prints why not: no uplink key, no relay firmware, no line of sight, each a token when the player already knows where it is. It works at `RLY`, after the arm, with the key from `HAB` and the firmware from `LDR` installed.
- The packet form opens in TERM: `packet 64 bytes`, then every fact the player has found as a token with its size, click to include, a byte counter, and `transmit`. Facts and sizes: habitat coordinates 18; pod status "4 pods 3 nominal" 18; each of the four names 8; the operator's note 40; your own status "T-1 alive" 12; the next light "+41y" 16. A fact is collected the moment the file holding it has been read.
- Four endings by what got through, no fail state: coordinates and pods, rescue launched and the pods located; coordinates without pods, a slow search; no coordinates, a signal heard, origin unknown, they will look; nothing picked, a ping, something is alive.
- The end: `send` is clicked from inside the CAM view; the terminal shrinks to five rows over the landscape; the acknowledgment types in; the landscape fades first, then the rows; then an end card with the ending's name and an `again` link that resets the save.

## 12. The world and the story

**Halm** is a fictional planet on an eccentric orbit: light for 22 sols every 41 years, then a winter that freezes everything. The second expedition of the Halm Surface Program landed at the start of a light and planned a pickup before the dark. The storm that opened the winter dropped the habitat's mast, the pickup window closed, and the four went into the emergency pods, built for exactly this winter and never meant to be used. Their plea never left: it sits in the habitat's outbox. Home is only ever "home". No years anywhere, only sols.

You are **`T-1`**, the expedition's rover. Your operator wrote her ops log to you and called you T. The sibling `T-2` is stuck in a crater. The four: **Kaja Lind**, operations, your operator; **Ruben Achter**, geology; **Noor Haddad**, medic; **Ilya Sorokin**, systems. Pod telemetry: three nominal, pod 4, Ruben's, unknown. The last message from home in your radio buffer: "pickup window closed. hold. we come at the next light." The next light is now. Tone: terse logs, Kaja warm and short, hopeful and not grim.

**The drives.** Each is a root with a handful of short files; what each unlocks is in bold.

- `PWR` power board, on: `log`, temperature and charge per sol over the whole winter, its tail is the wake; `spec`; the tool **`power`**; mounting it starts **the sol counter**.
- `ARM` arm controller, on: the tool **`arm`**; `log`, the last stow; `spec`.
- `MEM` memory, on: the tool **`map`**; `ops.log`, Kaja's log to T, long, garbled in runs, heads and tails readable; `names`, a garbled roster; `tmp/`.
- `RADIO`, on: `inbox`, the last message from home; `outbox`, empty; the tool **`send`**, locked until the end.
- `DSP` display, off until named: **`term.conf`** and the tool **`more`**.
- `IMG` imaging, off until named: the tools **`snap`** and **`view`**; `frames/`, three stored frames.
- `NAV` navigation, off until named: the tool **`drive`**, which also opens **the terrain layer**; `waypoints`, `LDR` and `HAB` with distance and bearing; `odometry`.
- `WX` weather mast, live next to you: `almanac`, light until sol 22 and the next light in 41 years, which sets **the 22 in the prompt**; `storm.log`, the storm; `exposure.log`.
- `INS` the dropped crate, dead next to you: `manifest`; the tool **`optics`**, the 160 pixel step.
- `HAB` the habitat, live in range: `pods/`, the four pods' status; `home/`, one short folder per person; `radio/outbox`, the plea with **the coordinates**; `keys/`, **the uplink key**; `cam/`, the exterior camera, **`cam`** if the sibling is cut.
- `LDR` the lander, dead: **`relay.fw`**, the relay firmware; `frames/`, the mission's first picture; `log`, the landing.
- `RLY` the relay mast on the ridge, dead: `status`, mast up and waiting for firmware; **line of sight**, the only place `send` works.
- `T-2` the sibling, dead, optional: the tool **`cam`**; `log`, its last drive into the crater.

**Where the names sit.** `DSP` and `IMG` are named in tails of the first ring, in different drives, never in the first file a player is likely to open; `NAV` is named in the crate's manifest; `RLY` and `T-2` are named with distance and bearing in the habitat's files; `LDR` and `HAB` are `NAV` waypoints.

**The first five minutes.** Boot prints five lines: program and unit, cold boot, memory none, five entries, shell ready; the bar shows `ls`. `ls` lists root. `readme` is a five-line letter from Kaja: you woke, memory is gone, this file survives, the tools you still have are ls, read and tail, mount PWR first then MEM, the bus is dev, sorry. `dev` lists five devices. `mount PWR`, `tail log`, the freeze and the wake, the prompt gains the sol. `power` shows three unnamed parts off. `mount MEM`, `map` opens the forest, `tail ops.log` is Kaja's last lines. The player mounts the rest of the ring, including `WX` blind, finds `DSP`'s name in a tail, powers it, mounts it, clicks the 5 in `term.conf`, and the window grows: the first reward. `more` then opens the rest of the letter and of the ops log.

## 13. Content rules

- The first ring, `PWR`, `ARM`, `MEM`, `RADIO`, `WX`, is read at five rows: every file there is four lines, or a log whose keys sit in its first four and last four lines.
- Lines are at most 44 characters. Logs are terse, timestamps in sols. Kaja writes short and warm.
- Every name that matters, parts, places, people, is a token somewhere reachable before it is needed, and every clickable name is unique in the world.
- Never the word "rover". No years. English. Hopeful.
- A fact for the packet lives in exactly one file, and reading that file collects it.

## 14. Sound

Synthesized in Web Audio, started on the first click: a tick per click and a softer tick per typed character; a two-stage relay clack on mount; a fan hum under everything from boot; wind, filtered noise, from the first snap on; a low motor during a drive; one slow chord when `cam` opens; short beeps as the acknowledgment arrives. No music.

## 15. Persistence

The whole state is saved to localStorage after every command: listed nodes, mounted drives, powered parts, the bar, known places, position, heading, sol, rows, collected facts, the last output. A refresh continues the run. `again` on the end card clears it.

## 16. Non-goals

No keyboard input. No phone layout. No fail state. No file repair. No seismometer. No CRT shader. No analytics. No music. No movement in `cam`.
