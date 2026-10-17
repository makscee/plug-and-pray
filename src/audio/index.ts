// Sound (DESIGN 9): everything synthesized in Web Audio, no files, started on the first key or click.
// One-shot cues for what the body does (steps, hits, modules clacking in, warm-up whines) over one
// loop: the low drone of the god's body, which drifts slowly and sinks as you go deeper.
// Quiet by default, and no loud noise beds (Maks 10-17: a white-noise wind came in harsh).
// What plays when is decided in listen.ts; hook.ts wires it to the game.

export const CUES = [
  'step', // the stepper relay clicks a leg forward
  'drag', // crawling: the body scrapes along
  'take', // something picked up
  'install', // a module clacks into its slot
  'remove', // and back out
  'warm', // a module warming up: a rising whine (secs = the warm-up)
  'ready', // warm: it works now
  'off', // power off: the whine sinks away
  'hit', // you strike
  'hurt', // you are struck
  'kill', // something put down
  'die', // you stop
  'printer', // a printer chatters
  'card', // a memory card is read
  'heart', // one beat of the god's heart (the end)
] as const;
export type Cue = (typeof CUES)[number];

/** master level: the whole mix stays under the game's feel */
const LEVEL = 0.5;
/** the drone's own level under the master */
const DRONE = 0.11;

let ctx: BaseAudioContext | null = null;
let out: GainNode;
let noise: AudioBuffer;
type Drone = { g: GainNode; pitch: OscillatorNode[]; base: number[]; srcs: AudioScheduledSourceNode[] };
let drone: Drone | null = null;
/** how deep the drone sits, 0 (the start) to 1 (far below); applied once audio starts */
let depthWanted = 0;
/** a module's warm-up whine, by uid, so power off can cut it */
const whines = new Map<number, { g: GainNode; o: OscillatorNode[] }>();

/** called on the first key or click: browsers start audio only after a gesture */
export function start(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void (ctx as AudioContext).resume();
    return;
  }
  const AC = typeof window !== 'undefined' ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
  if (!AC) return;
  wire(new AC());
  drone = body();
  depth(depthWanted);
}

function wire(c: BaseAudioContext): void {
  ctx = c;
  out = c.createGain();
  out.gain.value = LEVEL;
  out.connect(c.destination);
  noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

/** loudness of a cue (or 'drone', 12 s of it) rendered offline, in dBFS: for tuning the mix */
export async function measure(name: string): Promise<{ peak: number; rms: number }> {
  const live = { ctx, out, noise, drone };
  const secs = name === 'drone' ? 12 : 3;
  const off = new OfflineAudioContext(1, 44100 * secs, 44100);
  wire(off);
  if (name === 'drone') body();
  else cue(name, { secs: 1.5 });
  ({ ctx, out, noise, drone } = live);
  const d = (await off.startRendering()).getChannelData(0);
  let peak = 0;
  let sum = 0;
  for (const v of d) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const db = (x: number) => Math.round(20 * Math.log10(x + 1e-9));
  // rms over the cue's own length, not the silence after it
  const loud = d.filter((v) => Math.abs(v) > 1e-4).length || 1;
  return { peak: db(peak), rms: db(Math.sqrt(sum / loud)) };
}

export function started(): boolean {
  return !!ctx;
}

/** the drone sinks as you go deeper (0..1); it glides there over half a minute */
export function depth(d: number): void {
  depthWanted = Math.max(0, Math.min(1, d));
  if (!ctx || !drone) return;
  const k = Math.pow(2, -depthWanted * 0.6); // down to about a major sixth lower
  drone.pitch.forEach((o, i) => o.frequency.setTargetAtTime(drone!.base[i] * k, ctx!.currentTime, 12));
}

/** the drone on or off (the soundboard toggles it) */
export function droneOn(on: boolean): void {
  if (!ctx) return;
  if (on && !drone) {
    drone = body();
    depth(depthWanted);
  } else if (!on && drone) {
    const d = drone;
    drone = null;
    fade(d.g, 0, 1.5);
    for (const o of d.srcs) o.stop(ctx.currentTime + 1.6);
  }
}

/** play a cue; `uid` ties a warm-up whine to its module, `secs` is how long it warms */
export function cue(name: Cue | string, opt: { secs?: number; uid?: number } = {}): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'step':
      tick(t, 0.3, 2400);
      thump(t, 0.18, 120, 0.05);
      tick(t + 0.07, 0.2, 1700);
      return;
    case 'drag':
      return scrape(t, 0.45, 0.35);
    case 'take':
      tick(t, 0.4, 3000);
      return tone(t + 0.02, 'triangle', 520, 780, 0.12, 0.03);
    case 'install':
      clack(t);
      return clack(t + 0.11, 0.7);
    case 'remove':
      clack(t, 0.7);
      return clack(t + 0.09, 0.45, 0.8);
    case 'warm':
      return whine(t, Math.max(0.2, opt.secs ?? 1), opt.uid);
    case 'ready':
      return tone(t, 'sine', 880, 880, 0.09, 0.03, 2000);
    case 'off':
      if (opt.uid !== undefined) cut(opt.uid);
      return tone(t, 'sine', 420, 55, 0.6, 0.035, 900);
    case 'hit':
      burst(t, 0.4, 3500, 0.06);
      return tone(t, 'square', 1400, 300, 0.09, 0.025, 4000);
    case 'hurt':
      thump(t, 0.45, 90, 0.18);
      burst(t, 0.35, 600, 0.12);
      return tone(t, 'sawtooth', 110, 70, 0.22, 0.04, 700);
    case 'kill':
      burst(t, 0.6, 1200, 0.2);
      return tone(t + 0.03, 'triangle', 300, 60, 0.5, 0.05, 1200);
    case 'die':
      for (const uid of [...whines.keys()]) cut(uid);
      thump(t, 0.5, 70, 0.4);
      return tone(t, 'sawtooth', 220, 30, 2.5, 0.05, 500);
    case 'printer':
      for (let k = 0; k < 14; k++) tick(t + k * 0.055 + (k % 4 === 3 ? 0.03 : 0), 0.35 + (k % 2) * 0.15, 1800 + (k % 3) * 500);
      return thump(t + 0.85, 0.3, 160, 0.05);
    case 'card':
      for (let k = 0; k < 6; k++) {
        const f = [1320, 990, 1760, 1175, 1480, 880][k];
        tone(t + k * 0.06, 'square', f, f, 0.045, 0.04, 3000);
      }
      return;
    case 'heart':
      thump(t, 0.7, 65, 0.25);
      return thump(t + 0.28, 0.45, 58, 0.22);
  }
}

function fade(g: GainNode, to: number, secs: number): void {
  const t = ctx!.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(to, t + secs);
}

function noiseSrc(loop = false): AudioBufferSourceNode {
  const s = ctx!.createBufferSource();
  s.buffer = noise;
  s.loop = loop;
  return s;
}

function filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = ctx!.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function env(t: number, vol: number, secs: number, attack = 0.002): GainNode {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
  g.connect(out);
  return g;
}

/** a very short burst of band-passed noise: a relay contact */
function tick(t: number, vol: number, freq: number): void {
  const s = noiseSrc();
  s.playbackRate.value = 0.9 + Math.random() * 0.2;
  s.connect(filter('bandpass', freq, 1.2)).connect(env(t, vol, 0.025, 0.001));
  s.start(t, Math.random(), 0.04);
}

/** a noise burst of `secs`, band-passed at `freq` */
function burst(t: number, vol: number, freq: number, secs: number): void {
  const s = noiseSrc();
  s.connect(filter('bandpass', freq, 0.8)).connect(env(t, vol, secs, 0.003));
  s.start(t, Math.random(), secs + 0.05);
}

/** a low knock: a sine falling from `f` */
function thump(t: number, vol: number, f: number, secs: number): void {
  const o = ctx!.createOscillator();
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.4, t + secs);
  o.connect(env(t, vol, secs, 0.003));
  o.start(t);
  o.stop(t + secs + 0.05);
}

/** one stage of a relay: a hard click over a low thump */
function clack(t: number, vol = 1, pitch = 1): void {
  tick(t, 1.1 * vol, 1500 * pitch);
  thump(t, 0.4 * vol, 140 * pitch, 0.08);
}

/** crawling: dull noise that swells and drags, its band sliding down */
function scrape(t: number, secs: number, vol: number): void {
  const s = noiseSrc();
  const f = filter('bandpass', 900, 2);
  f.frequency.setValueAtTime(900 + Math.random() * 300, t);
  f.frequency.exponentialRampToValueAtTime(380, t + secs);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + secs * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
  g.connect(out);
  s.connect(f).connect(filter('lowpass', 1400)).connect(g);
  s.start(t, Math.random(), secs + 0.05);
}

function tone(t: number, type: OscillatorType, f0: number, f1: number, secs: number, vol: number, lowpass = 3000): void {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + secs);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.setValueAtTime(vol, t + secs * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
  o.connect(filter('lowpass', lowpass)).connect(g).connect(out);
  o.start(t);
  o.stop(t + secs + 0.05);
}

/** a warm-up: a thin whine climbing over `secs`, a faint flutter on it, gone when warm */
function whine(t: number, secs: number, uid?: number): void {
  if (uid !== undefined) cut(uid);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.018, t + Math.min(0.3, secs / 2));
  g.gain.setValueAtTime(0.018, t + secs * 0.85);
  g.gain.linearRampToValueAtTime(0, t + secs + 0.15);
  g.connect(out);
  const os: OscillatorNode[] = [];
  for (const [type, m] of [['sine', 1], ['triangle', 1.5]] as const) {
    const o = ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(260 * m, t);
    o.frequency.exponentialRampToValueAtTime(1100 * m, t + secs);
    o.connect(filter('lowpass', 2500)).connect(g);
    o.start(t);
    o.stop(t + secs + 0.2);
    os.push(o);
  }
  const fl = lfo(11, 12, os[0].frequency);
  fl.start(t);
  fl.stop(t + secs + 0.2);
  os.push(fl);
  if (uid !== undefined) {
    whines.set(uid, { g, o: os });
    os[0].onended = () => whines.get(uid)?.g === g && whines.delete(uid);
  }
}

/** stop a module's warm-up whine at once (switched off mid-warm) */
function cut(uid: number): void {
  const w = whines.get(uid);
  if (!w) return;
  whines.delete(uid);
  fade(w.g, 0, 0.08);
  for (const o of w.o) o.stop(ctx!.currentTime + 0.1);
}

/** the god's body: two low saws a fifth apart, beating slowly, under a lowpass that breathes */
function body(): Drone {
  const g = ctx!.createGain();
  g.gain.value = 0;
  g.connect(out);
  fade(g, DRONE, 6);
  const lp = filter('lowpass', 170, 3);
  lp.connect(g);
  const base = [41.2, 61.7, 41.2 * 2.01];
  const pitch: OscillatorNode[] = [];
  base.forEach((f, i) => {
    const o = ctx!.createOscillator();
    o.type = i === 2 ? 'triangle' : 'sawtooth';
    o.frequency.value = f;
    const og = ctx!.createGain();
    og.gain.value = [0.5, 0.3, 0.25][i];
    o.connect(og).connect(lp);
    o.start();
    pitch.push(o);
  });
  // slow changes: the filter breathes, the fifth drifts against the root, the level swells
  const lfos = [lfo(0.031, 70, lp.frequency), lfo(0.017, 0.6, pitch[1].frequency), lfo(0.047, DRONE * 0.35, g.gain)];
  for (const o of lfos) o.start();
  // a faint rumble under it, far below a hiss
  const s = noiseSrc(true);
  const rg = ctx!.createGain();
  rg.gain.value = 0.25;
  s.connect(filter('lowpass', 90, 0.7)).connect(rg).connect(g);
  s.start();
  return { g, pitch, base, srcs: [...pitch, ...lfos, s] };
}

/** a slow oscillator wobbling `param` by ±depth; the caller starts it */
function lfo(rate: number, depth: number, param: AudioParam): OscillatorNode {
  const o = ctx!.createOscillator();
  o.frequency.value = rate;
  const d = ctx!.createGain();
  d.gain.value = depth;
  o.connect(d).connect(param);
  return o;
}

/** `?sounds`: a row of buttons that plays every cue, plus the drone and its depth, to judge the mix */
export function soundboard(): void {
  const el = document.createElement('div');
  el.className = 'soundboard';
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;display:flex;flex-wrap:wrap;gap:6px;max-width:90vw;align-items:center';
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.cue = label;
    b.style.cssText = 'font:inherit;background:#111;color:#9f9;border:1px solid #393;padding:2px 8px;cursor:pointer';
    b.onclick = (e) => {
      e.stopPropagation();
      start();
      fn();
    };
    el.append(b);
  };
  for (const c of CUES) btn(c, () => cue(c, { secs: 1.5 }));
  let on = true;
  btn('drone on/off', () => droneOn((on = !on)));
  const r = document.createElement('input');
  r.type = 'range';
  r.min = '0';
  r.max = '1';
  r.step = '0.05';
  r.value = '0';
  r.title = 'drone depth';
  r.oninput = () => depth(Number(r.value));
  el.append(r);
  document.body.append(el);
}
