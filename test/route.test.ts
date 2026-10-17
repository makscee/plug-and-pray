// The real route, model only (#1320): every step clicks a token the last output showed, or a verb
// in the bar, from the boot to the best ending. No state is set by hand.
import { beforeEach, describe, expect, it } from 'vitest';
import { isToken, resolve, run, tok as tokOf, type Line, type Output, type Token, type World } from '../src/model';
import { world } from '../src/content';
import { ending } from '../src/model/verbs/send';

let w: World;
let o: Output;
let clicks = 0;
beforeEach(() => {
  w = world();
  clicks = 0;
});

const text = (l: Line) => l.map((s) => (isToken(s) ? s.text : s)).join('');
const all = (x: Output) => x.lines.map(text).join('\n');
/** a token on the screen: the last output, else the MAP forest (mounted drives and what was listed) */
const find = (t: string): Token => {
  const k = o.lines.flat().filter(isToken).find((x) => x.text === t || x.nodeId === t);
  if (k) return k;
  const s = w.state;
  const n = [...s.mounted, ...s.listed].map((id) => w.nodes[id]).find((x) => x.id === t || x.name === t);
  if (!n) throw new Error(`no token ${t} in\n${all(o)}`);
  return tokOf(w, n);
};
/** click a token on screen, with `waiting` the verb clicked first when the click needs one */
const tok = (t: string, see?: string, waiting: string | null = null) => {
  const r = resolve(w, waiting, find(t));
  if (!r) throw new Error(`nothing to do for ${t}`);
  clicks++;
  o = run(w, r[0], r[1]);
  if (see) expect(all(o)).toContain(see);
};
/** click a verb in the bar */
const verb = (v: string, see?: string) => {
  expect(w.state.bar).toContain(v);
  clicks++;
  o = run(w, v);
  if (see) expect(all(o)).toContain(see);
};
/** click a verb that waits, then the token it takes */
const then = (v: string, t: string, see: string) => {
  expect(w.state.bar).toContain(v);
  clicks++;
  tok(t, see, v);
};
const snap = (d: string, see: string) => {
  expect(w.state.bar).toContain('snap');
  clicks += 2;
  o = run(w, 'snap', d);
  expect(all(o)).toContain(see);
};
/** a drive ends by itself; the terminal runs arrive */
const arrive = () => {
  o = run(w, 'arrive');
  expect(all(o)).toContain('arrived');
};

/** boot to the habitat: the first ring, the screen, the crate, NAV, the drive */
function toHabitat() {
  verb('ls', 'readme');
  tok('readme', 'mount PWR');
  tok('PWR', 'tools:');
  tok('power*', 'installed');
  verb('power', '? off');
  tok('ARM', 'arm*');
  then('tail', 'log', 'DSP');
  tok('DSP', 'DSP on');
  tok('DSP', 'term.conf');
  tok('term.conf', 'rows=');
  tok('5', 'display ok');
  verb('ls', 'readme');
  tok('readme', 'MEM');
  tok('MEM', 'map*');
  tok('map*', 'installed');
  verb('dev', 'WX');
  tok('WX', 'almanac');
  tok('almanac', '+41y');
  tok('WX', 'exposure.log');
  then('tail', 'exposure.log', 'IMG');
  tok('IMG', 'IMG on');
  tok('IMG', 'snap*');
  tok('snap*', 'installed');
  verb('dev', 'ARM');
  tok('ARM', 'arm*');
  tok('arm*', 'installed');
  snap('n', 'in view');
  tok('?crate', 'INS');
  tok('INS', 'manifest');
  tok('optics*', 'installed');
  tok('manifest', 'NAV');
  tok('NAV', 'NAV on');
  verb('dev', 'NAV');
  tok('NAV', 'drive*');
  tok('drive*', 'installed');
  verb('dev');
  tok('NAV', 'waypoints');
  tok('waypoints', 'HAB 3.0 km bearing 040');
  tok('HAB 3.0 km bearing 040', 'on the map');
  tok('@HAB', 'driving');
  arrive();
  // the habitat: the outbox, the key, the pods, the radio's send, a home file
  verb('dev', 'habitat');
  tok('HAB', 'pods/');
  tok('radio/', 'outbox');
  tok('outbox', '12.4S 103.7E');
  verb('dev');
  tok('HAB');
  tok('keys/', 'uplink*');
  tok('uplink*', 'installed');
  verb('dev');
  tok('HAB');
  tok('pods/', 'telemetry');
  tok('telemetry', '3 nominal');
  verb('dev');
  tok('RADIO', 'send*');
  tok('send*', 'installed');
  verb('dev');
  tok('HAB');
  tok('home/');
  tok('ilya/');
  tok('card', 'RLY 3.1 km bearing 138');
  tok('RLY 3.1 km bearing 138', 'on the map');
}

function lander() {
  verb('drive', 'LDR');
  tok('@LDR', 'driving');
  arrive();
  snap('s', 'in view');
  tok('?lander', 'on the bus: LDR');
  tok('LDR', 'relay.fw*');
  tok('relay.fw*', 'installed');
}

function relayAndSend() {
  // RLY went on the map at the habitat, so drive lists it
  verb('drive', 'RLY');
  tok('@RLY', 'driving');
  arrive();
  snap('e', 'in view');
  tok('?mast', 'on the bus: RLY');
  verb('send', 'packet  0/64 bytes');
  tok('habitat at 12.4S 103.7E', '18/64');
  tok('4 pods 3 nominal', '36/64');
  tok('transmit', 'waiting for ack');
}

describe('the route a player takes', () => {
  it('wins with clicks only on the necessary route, about twelve sols', () => {
    toHabitat();
    lander();
    relayAndSend();
    expect(w.state.ended).toBe('rescue');
    expect(ending(w)!.ack.join(' ')).toContain('rescue launched');
    expect(w.state.sol).toBe(13);
    expect(clicks).toBeLessThan(90);
  });

  it('wins through the sibling for cam, about four sols more', () => {
    toHabitat();
    // the good camera: T-2, named in the habitat's cam/
    verb('dev');
    tok('HAB');
    tok('cam/', 'module');
    tok('module', 'T-2 3.9 km bearing 250');
    tok('T-2 3.9 km bearing 250', 'on the map');
    tok('@T-2', 'driving');
    arrive();
    snap('w', 'in view');
    tok('?sibling', 'on the bus: T-2');
    tok('T-2', 'cam*');
    tok('cam*', 'installed');
    lander();
    verb('cam', 'cam open');
    relayAndSend();
    expect(w.state.ended).toBe('rescue');
    expect(w.state.sol).toBe(16);
  });

  it('wins with the habitat\'s cam when the sibling is cut', () => {
    toHabitat();
    verb('dev');
    tok('HAB');
    tok('cam/', 'module');
    tok('HAB/cam/cam', 'installed');
    lander();
    verb('cam', 'cam open');
    relayAndSend();
    expect(w.state.armed).not.toContain('?sibling');
    expect(w.state.ended).toBe('rescue');
    expect(w.state.sol).toBe(13);
  });
});

describe('a place line', () => {
  /** to the crate's NAV with drive installed, the waypoints on screen */
  function toWaypoints() {
    toHabitat();
    verb('dev');
    tok('NAV');
    tok('waypoints', 'LDR 1.5 km bearing 200');
  }

  it('goes on the map when the place is unknown, and does not drive', () => {
    toWaypoints();
    expect(w.state.places).not.toContain('@T-2');
    tok('HAB');
    tok('cam/');
    tok('module', 'T-2 3.9 km bearing 250');
    tok('T-2 3.9 km bearing 250', 'on the map');
    expect(w.state.trip).toBeNull();
    expect(w.state.places).toContain('@T-2');
    expect(w.state.layer).toBe('terrain');
  });

  it('drives once the place is known, and drive lists it', () => {
    toHabitat();
    // ilya's card put RLY on the map at the habitat; drive lists it, the line now drives
    expect(w.state.places).toContain('@RLY');
    verb('drive', 'RLY  3.1 km  bearing 138');
    tok('HAB/home/ilya/card', 'RLY 3.1 km bearing 138');
    tok('RLY 3.1 km bearing 138', 'driving');
    expect(w.state.trip?.to).toBe('@RLY');
  });
});
