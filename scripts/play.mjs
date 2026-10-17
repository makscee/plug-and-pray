// The merge check's play-through: a headless browser types a run on a fixed seed with the clock
// stopped (?still), steps time by hand and fails on the first expectation that does not hold.
// Each step: [command | seconds, check?]. A check is a JS expression over `g` (the game).
// Slices add steps for what they add; keep it a run a player could type.
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const STEPS = [
  // sound slice: audio on (as the first click does), every cue once; the run below then plays through it
  [0, '(thawAudio.start(), thawAudio.CUES.forEach((c) => thawAudio.cue(c, { secs: 0.5, uid: 999 })), thawAudio.started())'],
  // start (playtest 10-18): you wake holding the pinhole, stepper, map spool and spark finger and install them
  [0, 'g.player.installed.length === 0 && g.player.inv.length === 4 && document.querySelector("[data-cmd=\'install pinhole eye\']") !== null'],
  ['install pinhole eye'], ['install map spool'], ['install stepper relay'], ['install spark finger', 'g.player.installed.length === 4'],
  ['take', 'g.player.inv.some(i => i.mod === "halo")'],
  [1.5, 'document.querySelector("canvas.eye") && document.querySelector(".facing").textContent === "facing north" && document.querySelector("canvas.map") && document.querySelector("[data-cmd=\'go n 1\']")'],
  ['face e'], [0.1, 'document.querySelector("[data-cmd=\'go e 1\']") !== null'],
  // console (Maks's playtest): the actions bar lists what you can do now; go and unstuck from the start
  [0, '[...document.querySelectorAll(".acts button")].some(b => b.dataset.cmd.startsWith("go ")) && [...document.querySelectorAll(".acts button")].some(b => b.dataset.cmd === "unstuck")'],
  // panels (Maks's second playtest): install and remove by click in the modules / inventory windows, take by click in nearby; slots in the HUD
  [0.1, '!!document.querySelector(".panel-inv [data-cmd=\'install halo\']")'],
  [0, '(document.querySelector(".panel-inv [data-cmd=\'install halo\']").click(), g.player.installed.some(i => i.mod === "halo"))'],
  [0.1, 'document.querySelector(".panel-modules").innerText.includes("halo") && document.querySelector(".hpbar").innerText.includes("slots 5/6")'],
  [0, '(document.querySelector(".panel-modules [data-cmd=\'remove halo\']").click(), !g.player.installed.some(i => i.mod === "halo"))'],
  [0, '(g.ents.push({ id: g.nextId++, kind: "item", x: g.player.x, y: g.player.y, item: { kind: "res", res: "glass", n: 2 } }), true)'],
  [0.1, '!!document.querySelector(".panel-near [data-cmd=\'take 2 glass\']")'],
  [0, '(document.querySelector(".panel-near [data-cmd=\'take 2 glass\']").click(), g.player.inv.some(i => i.res === "glass"))'],
  [0.1, 'document.querySelector(".panel-near").innerText.includes("nothing here") && document.querySelector(".panel-inv").innerText.includes("glass")'],
  [0, '(g.player.inv = g.player.inv.filter(i => i.mod !== "halo" && i.res !== "glass"), true)'],
  ['go e 3'], [2, 'g.player.x >= 11.5 && g.player.path.length === 0'],
  ['status', 'g.log.some(l => l.join && JSON.stringify(l).includes("power 4/6"))'],
  // unstuck: out of a wall at once; otherwise home to where you woke after 3 s
  [0, '(Object.assign(g.player, { x: 1.5, y: 1.5, path: [] }), true)'], ['unstuck', 'JSON.stringify(g.log).includes("wrench") && !(g.player.x === 1.5 && g.player.y === 1.5)'],
  ['unstuck'], [3.2, 'g.player.x === 8.5 && g.player.y === 8.5'],
  // tuning (#1328): the legs' first hint names the card reader; listen gives cells and a compass word
  [0, '(g.ents.push({ id: 99999, kind: "item", x: 12.5, y: 8.5, item: { kind: "res", res: "bone", n: 1 } }), true)'], // the chamber holds only the halo now
  ['listen', 'JSON.stringify(g.log).includes("a card reader ticks") && /cells, (n|ne|e|se|s|sw|w|nw)\\./.test(JSON.stringify(g.log.slice(-4)))'],
  // console: scrolled up, new lines leave the reader where they are
  [0, '(document.querySelector(".win-console .out").scrollTop = 0, true)'],
  ['status', 'document.querySelector(".win-console .out").scrollTop === 0'],
  [0, '(document.querySelector(".win-console .out").scrollTop = 1e9, true)'],
  // two eyes at once (Maks 10-18: one went dark while the other ran): warming shows static, and
  // both stay lit frame after frame
  ['conjure pinhole eye'], ['conjure vidicon tube'], ['install pinhole eye'], ['install vidicon tube'],
  [0.3, 'document.querySelectorAll(".facing")[1].textContent === "warming up…" && [...document.querySelectorAll("canvas.eye")].every(c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) return true; return false; })'],
  [1.6, '[...document.querySelectorAll("canvas.eye")].every(c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) return true; return false; })'], [0.4, '[...document.querySelectorAll("canvas.eye")].every(c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) return true; return false; })'], [0.4, '[...document.querySelectorAll("canvas.eye")].every(c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) return true; return false; })'], [0.4, '[...document.querySelectorAll("canvas.eye")].every(c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) return true; return false; })'], [0.7, '[...document.querySelectorAll("canvas.eye")].every(c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) return true; return false; })'],
  ['remove pinhole eye'], ['remove vidicon tube'],
  // sight (#1321): a lamp, a scanner, a heat eye and an edge eye (conjure works only on test runs)
  ['conjure halo'], ['install halo'], [1, 'g.player.installed.some(i => i.mod === "halo" && i.on)'],
  ['remove halo'], ['conjure heat choir'], ['install heat choir'], [1.5, 'document.querySelector("canvas.scan") !== null'],
  ['remove heat choir'], ['remove pinhole'], ['conjure ember iris'], ['install ember iris'], [2.5, 'document.querySelectorAll("canvas.eye").length === 1'],
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
  [0.5, 'window.thaw.g.ended === null && !document.querySelector(".thaw-end") && window.thaw.g.player.installed.length === 0 && window.thaw.g.player.inv.length === 4 && document.querySelector(".win-console")?.innerText.includes("core ok")'],
  // descriptions, reliquary (shop), recycling (playtest 3)
  ['info pinhole', 'JSON.stringify(g.log).includes("eye · 24 px")'],
  ['install pinhole eye'], [0.2, 'document.querySelector(".win .does")?.textContent.startsWith("eye · 24 px")'],
  [0, '(g.ents.push({ id: 9998, kind: "printer", x: g.player.x + 0.6, y: g.player.y, data: { far: 0, shop: true } }), ["bone","glass","copper"].forEach(r => g.player.inv.push({ kind: "res", res: r, n: 20 })), g.player.inv.push({ kind: "res", res: "ichor", n: 5 }), true)'],
  [0.2, 'document.querySelector(".panel-near [data-cmd=\'buy 1\']") !== null && JSON.stringify(g.log).includes("reliquary")'],
  ['buy 1', 'g.ents.find(e => e.id === 9998).data.offers[0] === null && g.player.inv.filter(i => i.kind === "mod").length === 4'],
  ['reroll', 'g.ents.find(e => e.id === 9998).data.offers.every(Boolean)'],
  ['recycle stepper', '!g.player.inv.some(i => i.mod === "stepper-relay") && JSON.stringify(g.log).includes("you grind stepper relay down")'],
  [0.2, 'document.querySelector(".panel-inv [data-cmd^=\'recycle\']") !== null'],
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
      if (!pass) throw new Error(`step ${ok + 1} (${cmd}): expected ${check}\nlog: ${await p.evaluate(() => JSON.stringify(thaw.g.log.slice(-8)))}`);
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
