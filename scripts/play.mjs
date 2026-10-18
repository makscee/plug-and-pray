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
  [0, 'g.player.installed.length === 0 && g.player.inv.filter((i) => i.kind === "mod").length === 4 && document.querySelector("[data-cmd=\'install pinhole eye\']") !== null'],
  ['install pinhole eye'], ['install map spool'], ['install stepper relay'], ['install spark finger', 'g.player.installed.length === 4'],
  ['take', 'g.player.inv.some(i => i.mod === "halo")'],
  [1.5, 'document.querySelector("canvas.eye") && document.querySelector(".facing").textContent === "facing north" && document.querySelector("canvas.map") && document.querySelector("[data-cmd=\'go n 1\']")'],
  ['face e'], [0.1, 'document.querySelector("[data-cmd=\'go e 1\']") !== null'],
  // console (Maks's playtest): the actions bar lists what you can do now; go and unstuck from the start
  [0, '[...document.querySelectorAll(".acts button")].some(b => b.dataset.cmd.startsWith("go ")) && [...document.querySelectorAll(".acts button")].some(b => b.dataset.cmd === "unstuck")'],
  // panels (Maks's second playtest): install and remove by click in the modules / inventory windows, take by click in nearby; slots in the HUD
  // the inventory is a grid of icons: click one, its detail pane carries the buttons (Maks's fourth playtest)
  [0.1, '(document.querySelector(".panel-inv .cell[data-mod=\'halo\'] img.icon").closest("button").click(), true)'],
  [0.05, '!!document.querySelector(".panel-inv [data-cmd=\'install halo\']") && document.querySelector(".panel-inv .detail").innerText.includes("lights 3 cells")'],
  [0, '(document.querySelector(".panel-inv [data-cmd=\'install halo\']").click(), g.player.installed.some(i => i.mod === "halo"))'],
  [0.1, 'document.querySelector(".panel-modules .cell[data-mod=\'halo\']") !== null && document.querySelectorAll(".panel-modules .cell").length === 6 && document.querySelector(".hpbar").innerText.includes("slots 5/6")'],
  [0, '(document.querySelector(".panel-modules .cell[data-mod=\'halo\']").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })), !g.player.installed.find(i => i.mod === "halo").on)'],
  [0.1, '(document.querySelector(".panel-modules .cell[data-mod=\'halo\']").click(), document.querySelector(".panel-modules .cell.st-off[data-mod=\'halo\']") !== null)'],
  [0.05, '!!document.querySelector(".panel-modules [data-cmd=\'remove halo\']")'],
  [0, '(document.querySelector(".panel-modules [data-cmd=\'remove halo\']").click(), !g.player.installed.some(i => i.mod === "halo"))'],
  [0, '(g.ents.push({ id: g.nextId++, kind: "item", x: g.player.x + 1, y: g.player.y, item: { kind: "res", res: "glass", n: 2 } }), true)'],
  [0.1, '!!document.querySelector(".panel-near [data-cmd=\'take 2 glass\']")'],
  [0, '(document.querySelector(".panel-near [data-cmd=\'take 2 glass\']").click(), g.player.inv.some(i => i.res === "glass"))'],
  [0.1, 'document.querySelector(".panel-near").innerText.includes("nothing here") && document.querySelector(".panel-inv .cell[data-key^=\'glass\'] .badge")?.textContent === "2"'],
  [0, '(g.player.inv = g.player.inv.filter(i => i.mod !== "halo" && i.res !== "glass"), true)'],
  ['go e 3'], [2, 'g.player.x >= 11.5 && g.player.path.length === 0'],
  ['status', 'g.log.some(l => l.join && JSON.stringify(l).includes("power 3/4"))'],
  // unstuck: out of a wall at once; otherwise home to where you woke after 3 s
  [0, '(Object.assign(g.player, { x: 1.5, y: 1.5, path: [] }), true)'], ['unstuck', 'JSON.stringify(g.log).includes("wrench") && !(g.player.x === 1.5 && g.player.y === 1.5)'],
  ['unstuck'], [3.2, 'g.player.x === 8.5 && g.player.y === 8.5'],
  // tuning (#1328): the legs' first hint names the card reader; listen gives cells and a compass word
  [0, '(g.ents.push({ id: 99999, kind: "item", x: 12.5, y: 8.5, item: { kind: "res", res: "bone", n: 1 } }), true)'], // the chamber holds only the halo now
  ['listen', 'JSON.stringify(g.log).includes("a card reader ticks") && /cells, (n|ne|e|se|s|sw|w|nw)\\./.test(JSON.stringify(g.log.slice(-4)))'],
  // console: scrolled up, new lines from the world leave the reader where they are; a command you
  // type shows its answer (playtest r2)
  [0, '(document.querySelector(".win-console .out").scrollTop = 0, true)'],
  [0, '(g.log.push(["a far drip."]), true)'], [0.1, 'document.querySelector(".win-console .out").scrollTop === 0'],
  ['status', '(o => o.scrollHeight - o.scrollTop - o.clientHeight < 4)(document.querySelector(".win-console .out"))'],
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
  ['read card', 'g.vectors.length === 1 && g.vectors[0].what === "way down"'],
  ['vectors', 'g.log.some(l => JSON.stringify(l).includes("bearing"))'],
  // fight: an hp bar always; a nail psalm (handed over here) shoots a mite down your facing
  [0, 'document.querySelector(".hpbar")?.textContent.includes("10/10")'],
  [0, '(g.player.core = 20, g.player.slots = 8, g.player.inv.push({ kind: "mod", mod: "nail-psalm" }), true)'],
  ['install nail'], [1.2, 'document.querySelector("[data-cmd=shoot]") !== null'],
  ['face w'], [0, '(g.ents.push({ id: 9999, kind: "enemy", x: g.player.x - 3, y: g.player.y, enemy: { type: "mite", hp: 1.5, readyAt: 0, data: {} } }), true)'],
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
  // pilots and waypoints (playtest 3): back in the start chamber with a moth, a log and the map; the room is seen
  [0, '(Object.assign(g.player, { x: 8.5, y: 8.5, path: [], core: 20, installed: [], slots: 8 }), ["wayfinder-moth","waystone-log","survey-spool"].forEach(m => g.player.inv.push({ kind: "mod", mod: m })), true)'],
  [0, '(Array.from({ length: 49 }, (_, k) => g.seen.add(`${5 + (k % 7)},${5 + Math.floor(k / 7)}`)), g.ents.push({ id: 9998, kind: "printer", x: 6.5, y: 6.5, data: { far: 0, made: 0 } }), true)'],
  ['install wayfinder moth'], ['install waystone log'], ['install survey spool'], [2, 'document.querySelector(".waypoints")?.innerText.includes("printer")'],
  ['goto 10 10', 'g.player.path.length > 0'], [3, 'Math.floor(g.player.x) === 10 && Math.floor(g.player.y) === 10 && JSON.stringify(g.log).includes("the pilot sets you down")'],
  ['mark den'], [0.5, 'document.querySelector(".waypoints")?.innerText.includes("den")'],
  [0, '(() => { const c = document.querySelector("canvas.map"); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent("click", { clientX: r.left + r.width / 2 - r.width * 4 / 37, clientY: r.top + r.height / 2, bubbles: true })); return JSON.stringify(g.log).includes("goto 6 10"); })()'],
  [3, 'Math.floor(g.player.x) === 6 && Math.floor(g.player.y) === 10'],
  // finish (#1325): the Thaw Engine ends the run; light, melting windows, the end card, wake again
  [0, '(g.player.slots++, g.player.inv.push({ kind: "mod", mod: "thaw-engine" }), true)'],
  ['install thaw engine'], [0.2, 'g.ended === "thaw" && document.querySelector(".thaw-end .thaw-heart") !== null'],
  [3, 'document.querySelector(".win.melting") !== null'],
  [6, 'document.querySelector(".thaw-card")?.textContent.includes("modules found")'],
  [0, '(document.querySelector(".thaw-card button").click(), true)'],
  [0.5, 'window.thaw.g.ended === null && !document.querySelector(".thaw-end") && window.thaw.g.player.installed.length === 0 && window.thaw.g.player.inv.filter((i) => i.kind === "mod").length === 4 && document.querySelector(".win-console")?.innerText.includes("core ok")'],
  // descriptions, reliquary (shop), recycling (playtest 3)
  ['info pinhole', 'JSON.stringify(g.log).includes("eye · 24 px")'],
  ['install pinhole eye'], [0.2, 'document.querySelector(".win .does")?.textContent.startsWith("eye · 24 px")'],
  [0, '(g.ents.push({ id: 9998, kind: "printer", x: g.player.x + 0.6, y: g.player.y, data: { far: 0, shop: true } }), ["bone","glass","copper"].forEach(r => g.player.inv.push({ kind: "res", res: r, n: 20 })), g.player.inv.push({ kind: "res", res: "ichor", n: 5 }), true)'],
  [0.2, 'document.querySelector(".panel-near [data-cmd=\'buy 1\']") !== null && JSON.stringify(g.log).includes("reliquary")'],
  ['buy 1', 'g.ents.find(e => e.id === 9998).data.offers[0] === null && g.player.inv.filter(i => i.kind === "mod").length === 4'],
  ['reroll', 'g.ents.find(e => e.id === 9998).data.offers.every(Boolean)'],
  ['recycle stepper', '!g.player.inv.some(i => i.mod === "stepper-relay") && JSON.stringify(g.log).includes("you grind stepper relay down")'],
  [0.2, '(document.querySelector(".panel-inv .cell[data-mod]").click(), true)'],
  [0.05, 'document.querySelector(".panel-inv [data-cmd^=\'recycle\']") !== null'],
  // eyes and map on a long walk (Maks's third playtest: an eye went dark or froze, the map stayed dark):
  // walk out over the floor (v2: a bounded floor, so the walk heads for the farthest cell it can reach, then the next);
  // every eye stays lit and keeps changing, and the map spool unrolls as you go
  [0, `(document.querySelectorAll(".dead, .thaw-end").forEach(e => e.remove()), thaw.restart(1), true)`],
  [0, `(g.player.slots = 12, g.player.core = 20, g.player.hp = g.player.maxHp = 999, g.ents = g.ents.filter(e => !e.enemy), true)`],
  ...['pinhole-eye', 'dawn-eye', 'map-spool', 'stepper-relay'].flatMap((id) => [[0, `(g.player.installed.some(i => i.mod === "${id}") || (g.player.inv.some(i => i.mod === "${id}") || g.player.inv.push({ kind: "mod", mod: "${id}" }), thaw.send("install " + "${id}".replace("-", " "))), true)`]]),
  [2, `(window.__eye = () => [...document.querySelectorAll("canvas.eye")].map(c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let s = 0, h = 0; for (let i = 0; i < d.length; i += 4) { s += d[i] + d[i + 1] + d[i + 2]; h = (h * 31 + d[i] + 7 * d[i + 1]) | 0; } return [s / (d.length / 4) / 3, h]; }), window.__walk = { seen: g.seen.size, x: g.player.x, y: g.player.y, rows: [], last: "" }, document.querySelectorAll("canvas.eye").length >= 2)`],
  ...Array.from({ length: 40 }, () => [
    [0, `(() => { const P = g.player, W = window.__walk; g.ents = g.ents.filter(e => !e.enemy); P.hp = P.maxHp; if (P.path.length) return true; const op = (x, y) => { const c = g.chunks.get(Math.floor(x / 16) + "," + Math.floor(y / 16)); return !!c && c.cells[((y % 16) + 16) % 16 * 16 + ((x % 16) + 16) % 16] === 1; }; const bfs = (sx, sy) => { const prev = new Map([[sx + "," + sy, null]]), q = [[sx, sy]]; for (let h = 0; h < q.length; h++) { const [x, y] = q[h]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + "," + (y + dy); if (prev.has(k) || !op(x + dx, y + dy)) continue; prev.set(k, [x, y]); q.push([x + dx, y + dy]); } } return { prev, q }; }; const px = Math.floor(P.x), py = Math.floor(P.y); if (!W.goal || (px === W.goal[0] && py === W.goal[1])) { const { q } = bfs(px, py); W.goal = q.reduce((a, b) => (Math.hypot(b[0] - W.x, b[1] - W.y) > Math.hypot(a[0] - W.x, a[1] - W.y) ? b : a)); } const { prev } = bfs(px, py); let c = W.goal, path = []; while (c && !(c[0] === px && c[1] === py)) { path.unshift(c); c = prev.get(c[0] + "," + c[1]); } if (!path.length) { W.goal = null; return true; } const d0 = [path[0][0] - px, path[0][1] - py]; let n = 0; while (n < path.length && n < 6 && path[n][0] - (n ? path[n - 1][0] : px) === d0[0] && path[n][1] - (n ? path[n - 1][1] : py) === d0[1]) n++; const d = d0[0] === 1 ? "e" : d0[0] === -1 ? "w" : d0[1] === 1 ? "s" : "n"; thaw.send("go " + d + " " + n); return true; })()`],
    [1.5, `(window.__walk.rows.push([...window.__eye(), [Math.floor(g.player.x * 2), Math.floor(g.player.y * 2), g.player.dir].join() + (thaw.g.chunks && [1, 2].every(k => { const x = Math.floor(g.player.x + Math.sin(g.player.dir) * k), y = Math.floor(g.player.y - Math.cos(g.player.dir) * k), c = g.chunks.get(Math.floor(x / 16) + ',' + Math.floor(y / 16)); return c && c.cells[(y % 16 + 16) % 16 * 16 + (x % 16 + 16) % 16] === 1; }) ? '' : ' wall')]), true)`],
  ]).flat(),
  [0, `(() => { const W = window.__walk, n = W.rows[0].length - 1; for (let k = 0; k < n; k++) { const means = W.rows.map(r => r[k][0]); let stuck = 0; for (let j = 1; j < W.rows.length; j++) if (W.rows[j][n] !== W.rows[j - 1][n] && !W.rows[j][n].endsWith('wall') && W.rows[j][k][1] === W.rows[j - 1][k][1]) stuck++; if (Math.min(...means) < 20 || stuck > 2) return false; } return Math.hypot(g.player.x - W.x, g.player.y - W.y) > 20 && g.seen.size - W.seen > 300; })()`],
  // a lost GL context (a GPU reset) comes back: the eyes are lit again a moment later
  [0, `(thawGL().getContext("webgl2").getExtension("WEBGL_lose_context").loseContext(), true)`],
  ['face s'], [1.2], ['face e'], [1.2, `window.__eye().every(([m]) => m > 20)`],
  // the fight shows (Maks 10-18: "no way to see the fight"): a mite in front and a walker behind;
  // the HUD names what is on you, an eye points behind at the walker, and blows are told in few lines
  // (v2: back in the start chamber first: the walk can end in a floor's corner, by its boss room)
  [0, `(g.ents = g.ents.filter(e => !e.enemy), Object.assign(g.player, { x: 8.5, y: 8.5, path: [] }), g.player.hp = g.player.maxHp, g.player.dir = 0, [["mite", 0, -1.2], ["walker", 0, 1.6]].forEach(([t, dx, dy]) => g.ents.push({ id: g.nextId++, kind: "enemy", x: g.player.x + dx, y: g.player.y + dy, enemy: { type: t, hp: 3, readyAt: 0, data: { noticed: true } } })), window.__log = g.log.length, true)`],
  [0.6, `/⚔ (choir )?mite/.test(document.querySelector(".hpbar .fight")?.textContent ?? "")`],
  [0, `[...document.querySelectorAll(".foe-arrow")].some(a => a.style.display !== "none" && /walker behind/.test(a.textContent))`],
  [3, `(() => { const lines = g.log.slice(window.__log).map(l => l.map(s => typeof s === "string" ? s : s.text).join("")); return lines.some(l => /hits you/.test(l)) && lines.filter(l => /hits you|you hit/.test(l)).length <= 4; })()`],
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
      if (!pass) throw new Error(`step ${ok + 1} (${cmd}): expected ${check}\nwalk: ${await p.evaluate(() => window.__walk ? JSON.stringify({ d: Math.hypot(thaw.g.player.x - __walk.x, thaw.g.player.y - __walk.y), seen: thaw.g.seen.size - __walk.seen, eyes: __walk.rows[0].slice(0, -1).map((_, k) => [Math.round(Math.min(...__walk.rows.map(r => r[k][0]))), __walk.rows.filter((r, j) => j && r.at(-1) !== __walk.rows[j - 1].at(-1) && !r.at(-1).endsWith('wall') && r[k][1] === __walk.rows[j - 1][k][1]).length, __walk.rows.length]) }) : '')}\nlog: ${await p.evaluate(() => JSON.stringify(thaw.g.log.slice(-8)))}`);
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
