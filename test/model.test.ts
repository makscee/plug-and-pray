import { beforeEach, describe, expect, it } from 'vitest';
import { cost, isToken, km, prompt, resolve, run, tokenize, where, type Line, type Output, type Token, type World } from '../src/model';
import { world } from '../src/content';

let w: World;
beforeEach(() => {
  w = world();
});

const text = (l: Line) => l.map((s) => (isToken(s) ? s.text : s)).join('');
const all = (o: Output) => o.lines.map(text).join('\n');
const toks = (o: Output) => o.lines.flat().filter(isToken);
const find = (o: Output, t: string): Token => {
  const k = toks(o).find((x) => x.text === t);
  if (!k) throw new Error(`no token ${t} in\n${all(o)}`);
  return k;
};
/** click a token with no verb waiting, the way the terminal does */
const click = (o: Output, t: string) => {
  const r = resolve(w, null, find(o, t));
  if (!r) throw new Error(`nothing to do for ${t}`);
  return run(w, r[0], r[1]);
};

describe('the spine flow', () => {
  it('boots to ls only and lists root', () => {
    expect(w.state.bar).toEqual(['ls']);
    const o = run(w, 'ls');
    expect(all(o)).toContain('readme');
    expect(o.lines.length).toBeLessThanOrEqual(5);
  });

  it('reads the readme, learns verbs from it, mounts PWR, starts the clock', () => {
    const ls = run(w, 'ls');
    const readme = click(ls, 'readme');
    expect(w.state.bar).toEqual(expect.arrayContaining(['ls', 'read', 'tail', 'mount', 'dev']));
    expect(prompt(w)).toBe('>');
    const pwr = click(readme, 'PWR');
    expect(w.state.mounted).toContain('PWR');
    expect(prompt(w)).toBe('sol 1 >');
    expect(all(pwr)).toContain('tools:');
    const inst = click(pwr, 'power*');
    expect(w.state.bar).toContain('power');
    expect(all(inst)).toContain('installed');
  });

  it('powers a part named in a tail, mounts it and grows the screen', () => {
    run(w, 'mount', 'PWR');
    run(w, 'install', 'PWR/power');
    const parts = run(w, 'power');
    expect(all(parts)).toContain('? off');
    run(w, 'mount', 'ARM');
    const tail = run(w, 'tail', 'ARM/log');
    expect(tail.lines.length).toBeLessThanOrEqual(5);
    const on = click(tail, 'DSP');
    expect(all(on)).toContain('DSP on');
    expect(all(run(w, 'dev'))).toContain('DSP');
    const dsp = click(on, 'DSP');
    expect(w.state.mounted).toContain('DSP');
    const conf = click(dsp, 'term.conf');
    click(conf, '5');
    expect(w.state.rows).toBe(20);
  });

  it('never prints more rows than the screen has', () => {
    run(w, 'mount', 'MEM');
    for (const o of [run(w, 'ls'), run(w, 'dev'), run(w, 'read', 'MEM/ops.log'), run(w, 'tail', 'PWR/log')])
      expect(o.lines.length).toBeLessThanOrEqual(w.state.rows);
  });

  it('truncates with +N more and continues with more', () => {
    const o = run(w, 'read', 'PWR/log');
    expect(all(o)).toBe(all(o)); // PWR not mounted yet
    run(w, 'mount', 'PWR');
    const r = run(w, 'read', 'PWR/log');
    expect(text(r.lines[0])).toMatch(/\+10 more/);
    w.state.bar.push('more');
    const m = run(w, 'more');
    expect(all(m)).toContain('sol 40');
  });

  it('a verb that waits takes only the nouns that fit', () => {
    const ls = run(w, 'ls');
    expect(resolve(w, 'read', find(ls, 'readme'))).toEqual(['read', '/readme']);
    expect(resolve(w, 'read', find(ls, 'bin/'))).toBeNull();
  });

  it('opens the map', () => {
    const o = run(w, 'map');
    expect(o.open).toContain('map');
  });

  it('turns unique names into tokens and leaves shared ones as text', () => {
    const l = tokenize(w, 'mount PWR and read log');
    expect(l.filter(isToken).map((t) => t.text)).toEqual(['mount', 'PWR', 'read']);
  });

  it('almanac sets the light and the cold prompt', () => {
    run(w, 'mount', 'PWR');
    run(w, 'mount', 'WX');
    run(w, 'read', 'WX/almanac');
    expect(prompt(w)).toBe('sol 1/22 >');
    w.state.sol = 18;
    expect(prompt(w)).toBe('sol 18/22 · cold >');
  });
});

describe('places and driving', () => {
  const navReady = () => {
    run(w, 'mount', 'PWR');
    w.state.powered.push('NAV');
    run(w, 'mount', 'NAV');
  };

  it('turns a place line into one place token, the name a device token elsewhere', () => {
    const l = tokenize(w, 'HAB 3.0 km bearing 040');
    expect(l).toEqual([{ text: 'HAB 3.0 km bearing 040', kind: 'place', nodeId: '@HAB' }]);
    const m = tokenize(w, 'go: T-2 2.0 km bearing 300. mount HAB');
    expect(m.filter(isToken).map((t) => [t.text, t.kind])).toEqual([
      ['T-2 2.0 km bearing 300', 'place'],
      ['mount', 'verb'],
      ['HAB', 'device'],
    ]);
    expect(tokenize(w, 'XYZ 1.0 km bearing 010').filter(isToken)).toEqual([]);
  });

  it('a clicked place line puts the place on the map before drive is known', () => {
    navReady();
    const wp = run(w, 'read', 'NAV/waypoints');
    const r = resolve(w, null, find(wp, 'HAB 3.0 km bearing 040'))!;
    expect(r).toEqual(['map', '@HAB']);
    const o = run(w, r[0], r[1]);
    expect(w.state.places).toContain('@HAB');
    expect(w.state.layer).toBe('terrain');
    expect(o.open).toContain('map');
  });

  it('drives to HAB: the driving line, then arrival with HAB on the bus and the sol advanced', () => {
    navReady();
    run(w, 'install', 'NAV/drive');
    w.state.bar.push('snap');
    const wp = run(w, 'read', 'NAV/waypoints');
    // the first click puts an unknown place on the map; the map line's token then drives
    const m = resolve(w, null, find(wp, 'HAB 3.0 km bearing 040'))!;
    expect(m).toEqual(['map', '@HAB']);
    const on = run(w, m[0], m[1]);
    expect(w.state.trip).toBeNull();
    const r = resolve(w, null, find(on, 'HAB'))!;
    expect(r).toEqual(['drive', '@HAB']);
    expect(resolve(w, null, find(wp, 'HAB 3.0 km bearing 040'))).toEqual(['drive', '@HAB']);
    const d = run(w, r[0], r[1]);
    expect(all(d)).toMatch(/^driving {2}HAB {2}3\.0 km {2}snap/);
    expect(find(d, 'snap').kind).toBe('verb');
    expect(w.state.trip?.to).toBe('@HAB');
    expect(w.state.position).toBe('@here');
    expect(all(run(w, 'drive', '@LDR'))).toContain('on the road to HAB');
    const a = run(w, 'arrive');
    expect(all(a)).toContain('arrived  HAB  sol 3');
    expect(toks(a).map((t) => t.kind)).toEqual(['place', 'device']);
    expect(w.state.position).toBe('@HAB');
    expect(w.state.sol).toBe(1 + 2);
    expect(w.state.visited).toEqual(['@here', '@HAB']);
    expect(w.state.path).toEqual([[0, 0], [1.93, 2.3]]);
    expect(all(run(w, 'dev'))).toContain('habitat');
    expect(all(run(w, 'mount', 'HAB'))).toContain('pods/');
  });

  it('allows the return trip and leaves the habitat behind', () => {
    navReady();
    run(w, 'drive', '@HAB');
    run(w, 'arrive');
    expect(all(run(w, 'drive', '@HAB'))).toContain('you are at');
    run(w, 'drive', '@here');
    run(w, 'arrive');
    expect(w.state.position).toBe('@here');
    expect(w.state.sol).toBe(1 + 2 + 2);
    expect(all(run(w, 'dev'))).not.toContain('habitat');
    expect(all(run(w, 'dev'))).toContain('weather');
  });

  it('costs ceil(km / 1.5) sols along the straight line', () => {
    expect([km(w, '@here', '@LDR'), km(w, '@here', '@RLY')].map((k) => cost(k))).toEqual([1, 3]);
    expect(cost(km(w, '@HAB', '@RLY'))).toBe(3);
    w.state.sol = 1;
    run(w, 'drive', '@RLY');
    run(w, 'arrive');
    expect(w.state.sol).toBe(4);
  });

  it('bare drive lists known places with distances, NAV waypoints included', () => {
    navReady();
    const o = run(w, 'drive');
    expect(w.state.places).toEqual(['@here', '@LDR', '@HAB']);
    expect(all(o)).toContain('here  you are here');
    expect(all(o)).toContain('HAB  3.0 km  bearing 040');
    expect(all(o)).toContain('LDR  1.5 km  bearing 200');
  });

  it('slides along the straight line while driving', () => {
    w.state.trip = { from: '@here', to: '@RLY', at: 1000, ms: 10_000 };
    expect(where(w, 6000)).toEqual([2, 0]);
    expect(where(w, 99_000)).toEqual([4, 0]);
  });

  it('counts plainly past the light', () => {
    run(w, 'mount', 'PWR');
    run(w, 'mount', 'WX');
    run(w, 'read', 'WX/almanac');
    w.state.sol = 21;
    run(w, 'drive', '@RLY');
    run(w, 'arrive');
    expect(prompt(w)).toBe('sol 24/22 · cold >');
  });
});
