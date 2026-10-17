// npm run package: the submission package from a real run of the latest build.
// Builds dist/ (npm run package runs `npm run build` first), plays the whole game at normal speed with
// play.mjs's STEPS, saves five 1280x720 screenshots into submission/ along the way, and zips dist/
// into submission/thaw.zip with index.html at its root for the itch.io HTML5 upload.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { play, STEPS } from './play.mjs';

const OUT = 'submission';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** the step after which each screenshot is taken: [kind, text, expect] as in STEPS, the first match */
const SHOTS = [
  { file: '1-boot.png', after: ['tok', '5', 'display ok'], before: true, settle: 500 },
  { file: '2-first-frame.png', after: ['tok', 'n', 'in view'], settle: 1500 },
  { file: '3-terrain-drive.png', after: ['tok', 'HAB 3.0 km bearing 040', 'driving'], settle: 4500 },
  { file: '4-packet.png', after: ['tok', '4 pods 3 nominal', '36/64'], settle: 500 },
  { file: '5-cam.png', after: ['verb', 'cam', 'cam open'], settle: 3000 },
];

const index = (step) => STEPS.findIndex((s) => s[0] === step[0] && s[1] === step[1] && s[2] === step[2]) + 1;
const at = new Map();
for (const s of SHOTS) {
  const n = index(s.after);
  if (!n) throw new Error(`package: no step ${JSON.stringify(s.after)} in play.mjs`);
  // `before`: the shot is taken after the step before it, while the screen is still five rows
  at.set(s.before ? n - 1 : n, s);
}

if (!existsSync('dist/index.html')) throw new Error('package: no dist/, run npm run build first');
mkdirSync(OUT, { recursive: true });

await play({
  fast: false,
  shot: async (n, page) => {
    const s = at.get(n);
    if (!s) return;
    await wait(s.settle);
    await page.screenshot({ path: `${OUT}/${s.file}` });
    console.log(`package: ${OUT}/${s.file}`);
  },
});

rmSync(`${OUT}/thaw.zip`, { force: true });
execFileSync('zip', ['-qrX', `../${OUT}/thaw.zip`, '.'], { cwd: 'dist', stdio: 'inherit' });
console.log(`package: ${OUT}/thaw.zip`);
process.exit(0);
