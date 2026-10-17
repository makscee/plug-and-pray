import { beforeEach, describe, expect, it } from 'vitest';
import { isToken, resolve, run, type Output, type World } from '../src/model';
import { world } from '../src/content';
import { dither, DUSK, DUSK32, shrink, smear } from '../src/scene/dither';

let w: World;
beforeEach(() => {
  w = world();
  w.state.sol = 1;
});

const all = (o: Output) => o.lines.map((l) => l.map((s) => (isToken(s) ? s.text : s)).join('')).join('\n');
const things = (o: Output) => o.lines.flat().filter(isToken).filter((t) => t.kind === 'thing');

describe('looking', () => {
  it('snap n frames the things at the place as ? tokens, opens FRAME, keeps the heading', () => {
    const o = run(w, 'snap', 'e');
    expect(w.state.heading).toBe(90);
    expect(o.open).toContain('frame');
    expect(w.state.windows).toContain('frame');
    expect(w.state.frame?.res).toBe(64);
    const t = things(o);
    expect(t.map((x) => x.text)).toEqual(['?', '?']);
    expect(t.map((x) => x.nodeId).sort()).toEqual(['?crate', '?rock']);
  });

  it('arm names a thing in the frame, costs one sol once, puts its drive on the bus', () => {
    const snap = run(w, 'snap', 'n');
    const crate = things(snap).find((t) => t.nodeId === '?crate')!;
    expect(resolve(w, null, crate)).toEqual(['arm', '?crate']);
    expect(resolve(w, 'arm', crate)).toEqual(['arm', '?crate']);
    const o = run(w, 'arm', '?crate');
    expect(all(o)).toContain('crate');
    expect(all(o)).toContain('INS');
    expect(w.state.sol).toBe(2);
    expect(all(run(w, 'dev'))).toContain('INS');
    run(w, 'arm', '?crate');
    expect(w.state.sol).toBe(2);
    expect(all(run(w, 'snap', 'n'))).toContain('crate');
  });

  it('arm reaches only what is in the current frame', () => {
    expect(all(run(w, 'arm', '?crate'))).toContain('not in the frame');
    expect(w.state.armed).toEqual([]);
    expect(resolve(w, 'arm', { text: '?', kind: 'thing', nodeId: '?lander' })).toBeNull();
  });

  it('frames are 160 px once optics are installed', () => {
    w.state.bar.push('optics');
    run(w, 'snap', 's');
    expect(w.state.frame?.res).toBe(160);
  });

  it('view lists the stored frames, a frame file click views it', () => {
    expect(all(run(w, 'view'))).toContain('IMG not mounted');
    w.state.powered.push('IMG');
    run(w, 'mount', 'IMG');
    const list = run(w, 'view');
    const names = list.lines.flat().filter(isToken).map((t) => t.text);
    expect(names).toEqual(['frame.1', 'frame.2', 'frame.3']);
    const crew = list.lines.flat().filter(isToken)[1];
    expect(resolve(w, null, crew)).toEqual(['view', 'IMG/frames/frame.2']);
    const o = run(w, 'view', 'IMG/frames/frame.2');
    expect(o.open).toContain('frame');
    expect(w.state.frame?.still).toBe('crew');
  });

  it('cam opens and closes the full screen camera', () => {
    run(w, 'cam');
    expect(w.state.windows).toContain('cam');
    run(w, 'cam');
    expect(w.state.windows).not.toContain('cam');
  });
});

describe('the frame colours (Maks 10-17)', () => {
  const hex = (d: Uint8Array) => new Set(Array.from({ length: d.length / 3 }, (_, i) => (d[i * 3] << 16) | (d[i * 3 + 1] << 8) | d[i * 3 + 2]));
  const flat = (res: number, c: number) => new Uint8Array(res * res * 3).map((_, i) => (c >> (16 - (i % 3) * 8)) & 255);

  it('the first snap is eight dusk colours, the optics step thirty-two', () => {
    expect(DUSK).toHaveLength(8);
    expect(DUSK32).toHaveLength(32);
    expect(new Set(DUSK32).size).toBe(32);
  });

  it('dithers to the palette only, mixing the two colours around a shade', () => {
    const res = 64;
    const grad = new Uint8Array(res * res * 3).map((_, i) => Math.round(((Math.floor(i / 3) % res) / (res - 1)) * 255));
    for (const c of hex(dither(grad, res, DUSK, 36))) expect(DUSK).toContain(c);
    // a shade halfway between rust and amber comes out as both, in a pattern
    const mid = ((DUSK[4] & 0xfefefe) + (DUSK[5] & 0xfefefe)) >> 1;
    const got = hex(dither(flat(res, mid), res, DUSK, 36));
    expect(got).toContain(DUSK[4]);
    expect(got).toContain(DUSK[5]);
    // a palette colour mostly stays itself under the light dither
    const d = dither(flat(160, DUSK32[20]), 160, DUSK32, 16);
    const same = Array.from({ length: 160 * 160 }, (_, i) => (d[i * 3] << 16) | (d[i * 3 + 1] << 8) | d[i * 3 + 2]).filter((c) => c === DUSK32[20]).length;
    expect(same / (160 * 160)).toBeGreaterThan(0.7);
  });

  it('shrinks by averaging and smears only sideways', () => {
    const big = new Uint8Array(16 * 3).map((_, i) => (Math.floor(i / 3) % 4 < 2 ? 0 : 255));
    expect([...shrink(big, 4, 2)]).toEqual([0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255]);
    const col = new Uint8Array(9 * 3).map((_, i) => (Math.floor(i / 3) % 3 === 1 ? 255 : 0));
    expect([...smear(col, 3, 1)]).toEqual(new Array(27).fill(85));
  });
});

describe('mid-road', () => {
  it('a snap while driving renders from the road with the smear', () => {
    w.state.trip = { from: '@here', to: '@HAB', at: Date.now() - 5000, ms: 10000 };
    run(w, 'snap', 'n');
    expect(w.state.frame).toMatchObject({ blur: true, things: [] });
    const [x, y] = w.state.frame!.at!;
    expect(x).toBeGreaterThan(0.5);
    expect(y).toBeLessThan(2.3);
  });
});
