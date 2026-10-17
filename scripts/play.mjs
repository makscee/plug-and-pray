// The merge check's play-through: a headless browser types a run on a fixed seed with the clock
// stopped (?still), steps time by hand and fails on the first expectation that does not hold.
// Each step: [command | seconds, check?]. A check is a JS expression over `g` (the game).
// Slices add steps for what they add; keep it a run a player could type.
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const STEPS = [
  // sound slice: audio on (as the first click does), every cue once; the run below then plays through it
  [0, '(thawAudio.start(), thawAudio.CUES.forEach((c) => thawAudio.cue(c, { secs: 0.5, uid: 999 })), thawAudio.started())'],
  // accessible start (10-18): you wake with the dawn eye, the stepper and the map spool on; a halo at your feet
  ['take', 'g.player.inv.some(i => i.mod === "halo") && g.player.installed.length === 3'],
  [1.5, 'document.querySelector("canvas.eye") && document.querySelector(".facing").textContent === "facing north" && document.querySelector("canvas.map") && document.querySelector("[data-cmd=\'go n 1\']")'],
  ['face e'], [0.1, 'document.querySelector("[data-cmd=\'go e 1\']") !== null'],
  // console (Maks's playtest): the actions bar lists what you can do now; go and unstuck from the start
  [0, '[...document.querySelectorAll(".acts button")].some(b => b.dataset.cmd.startsWith("go ")) && [...document.querySelectorAll(".acts button")].some(b => b.dataset.cmd === "unstuck")'],
  ['go e 3'], [2, 'g.player.x >= 11.5 && g.player.path.length === 0'],
  ['status', 'g.log.some(l => l.join && JSON.stringify(l).includes("power 3/6"))'],
  // unstuck: out of a wall at once; otherwise home to where you woke after 3 s
  [0, '(Object.assign(g.player, { x: 1.5, y: 1.5, path: [] }), true)'], ['unstuck', 'JSON.stringify(g.log).includes("wrench") && !(g.player.x === 1.5 && g.player.y === 1.5)'],
  ['unstuck'], [3.2, 'g.player.x === 8.5 && g.player.y === 8.5'],
  // tuning (#1328): the legs' first hint names the card reader; listen gives cells and a compass word
  ['listen', 'JSON.stringify(g.log).includes("a card reader ticks") && /cells, (n|ne|e|se|s|sw|w|nw)\\./.test(JSON.stringify(g.log.slice(-4)))'],
  // console: scrolled up, new lines leave the reader where they are
  [0, '(document.querySelector(".win-console .out").scrollTop = 0, true)'],
  ['status', 'document.querySelector(".win-console .out").scrollTop === 0'],
  [0, '(document.querySelector(".win-console .out").scrollTop = 1e9, true)'],
  // sight (#1321): a lamp, a scanner, a heat eye and an edge eye (conjure works only on test runs)
  ['conjure halo'], ['install halo'], [1, 'g.player.installed.some(i => i.mod === "halo" && i.on)'],
  ['remove halo'], ['conjure heat choir'], ['install heat choir'], [1.5, 'document.querySelector("canvas.scan") !== null'],
  ['remove heat choir'], ['remove dawn'], ['conjure ember iris'], ['install ember iris'], [2.5, 'document.querySelectorAll("canvas.eye").length === 1'],
  ['remove ember iris'], ['conjure lattice eye'], ['install lattice eye'], [1.5, 'document.querySelectorAll("canvas.eye").length === 1'],
  // world: the reader and a card lie a chunk south; this hands them over (the check is the setup)
  [0, '(g.player.slots = 5, g.player.inv.push({ kind: "mod", mod: "card-reader" }, { kind: "mod", mod: "map-spool" }, { kind: "card", card: "log-surveyor" }), true)'],
  ['install card reader'], ['install map spool'], [1.5, 'document.querySelector("canvas.map") !== null'],
  ['read card', 'g.vectors.length === 1 && g.vectors[0].what === "scripture shard"'],
  ['vectors', 'g.log.some(l => JSON.stringify(l).includes("bearing"))'],
  // fight: an hp bar always; a nail psalm (handed over here) shoots a mite down your facing
  [0, 'document.querySelector(".hpbar")?.textContent.includes("10/10")'],
  [0, '(g.player.core = 20, g.player.slots = 8, g.player.inv.push({ kind: "mod", mod: "nail-psalm" }), true)'],
  ['install nail'], [1.2, 'document.querySelector("[data-cmd=shoot]") !== null'],
  ['face w'], [0, '(g.ents.push({ id: 9999, kind: "enemy", x: g.player.x - 3, y: g.player.y, enemy: { type: "mite", hp: 2, readyAt: 0, data: {} } }), true)'],
  ['shoot'], [0.4, '!g.ents.some(e => e.id === 9999) && JSON.stringify(g.log).includes("the mite bursts")'],
  // body slice (self-contained: back in the start chamber, power not under test, every slot full)
  [0, '(Object.assign(g.player, { x: 8.5, y: 8.5, path: [], core: 20, installed: [], slots: 0 }), ["slot-board","slot-board","slot-board","slot-board","ledger","servo-gait","clock-of-hours","gyro-heart"].forEach(m => g.player.inv.push({ kind: "mod", mod: m })), window.full = g.player.slots, true)'],
  ['install slot board'], ['install slot board'], ['install slot board'], ['install slot board', 'g.player.slots === window.full + 4'],
  ['install ledger'], ['install servo'], [2, 'document.querySelectorAll(".ledger-row button").length >= 2'],
  [0, 'document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })) && g.player.path.length === 1'],
  [1, 'g.player.y === 9.5 && g.player.dir === Math.PI'],
  ['install clock'], [2, 'document.querySelector("canvas.clock") !== null'],
  ['save setup battle'], ['off clock'], ['setup battle', 'g.player.installed.find(i => i.mod === "clock-of-hours").on'],
  ['remove servo'], ['install gyro'], [2.5],
  [0, 'document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true }))'], [0.2], [0.4, 'g.player.y > 9.6'],
  [0, 'document.body.dispatchEvent(new KeyboardEvent("keyup", { key: "w", bubbles: true }))'], [0.2, 'g.player.move === null'],
  // finish (#1325): the Thaw Engine ends the run; light, melting windows, the end card, wake again
  [0, '(g.player.slots++, g.player.inv.push({ kind: "mod", mod: "thaw-engine" }), true)'],
  ['install thaw engine'], [0.2, 'g.ended === "thaw" && document.querySelector(".thaw-end .thaw-heart") !== null'],
  [3, 'document.querySelector(".win.melting") !== null'],
  [6, 'document.querySelector(".thaw-card")?.textContent.includes("modules found")'],
  [0, '(document.querySelector(".thaw-card button").click(), true)'],
  [0.5, 'window.thaw.g.ended === null && !document.querySelector(".thaw-end") && window.thaw.g.player.installed.length === 3 && document.querySelector(".win-console")?.innerText.includes("core ok")'],
];

const port = Number(process.env.PLAY_PORT) || 4000 + Math.floor(Math.random() * 1000);
const url = process.env.PLAY_URL;
const srv = url ? null : spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
if (srv) await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
let ok = 0;
try {
  await p.goto((url ?? `http://localhost:${port}/`) + '?seed=1&still');
  await p.waitForFunction(() => window.thaw);
  for (const [cmd, check] of STEPS) {
    if (typeof cmd === 'number') await p.evaluate((s) => window.step(s), cmd);
    else await p.evaluate((c) => window.thaw.send(c), cmd);
    if (check) {
      const pass = await p.evaluate((c) => { const g = window.thaw.g; return !!eval(c); }, check);
      if (!pass) throw new Error(`step ${ok + 1} (${cmd}): expected ${check}`);
    }
    if (errs.length) throw new Error(`step ${ok + 1} (${cmd}): ${errs[0]}`);
    ok++;
  }
  console.log(`play: ${ok} steps ok`);
} catch (e) {
  console.error('play: ' + e.message);
  process.exitCode = 1;
} finally {
  await b.close();
  srv?.kill();
}
