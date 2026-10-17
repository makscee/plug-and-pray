// Sound (DESIGN 14): everything synthesized in Web Audio, no files, started on the first click.
// One-shot cues (ticks, clacks, beeps, the chord) plus three loops: the fan hum from the first
// click, wind from the first snap on, a low motor while a drive is under way. Quiet by default.

export type Cue =
  | 'click' // a click
  | 'key' // a typed character
  | 'mount' // two-stage relay clack
  | 'power' // a part comes on
  | 'install' // a tool joins the bar
  | 'grow' // the screen grows
  | 'hum' // the fan hum, from boot
  | 'wind' // from the first snap on
  | 'motor' // during a drive
  | 'chord' // cam opens
  | 'beep' // the acknowledgment arrives
  | 'snap' // a frame is taken: starts the wind
  | 'arm' // the arm reaches
  | 'cam'; // cam opens: the chord

/** master level: the whole mix stays under the game's feel */
const LEVEL = 0.5;

let ctx: AudioContext | null = null;
let out: GainNode;
let noise: AudioBuffer;
/** what the loops should be doing; applied as soon as audio starts */
const want = { wind: false, motor: false };
type Loop = { g: GainNode; srcs: AudioScheduledSourceNode[] };
const loops: Partial<Record<'hum' | 'wind' | 'motor', Loop>> = {};

/** called on the first click: browsers start audio only after a gesture */
export function start(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = typeof window !== 'undefined' ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
  if (!AC) return;
  ctx = new AC();
  out = ctx.createGain();
  out.gain.value = LEVEL;
  out.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  hum();
  apply();
}

/** keep the loops in step with the game: wind once a frame was taken, motor while driving */
export function ambient(s: { wind?: boolean; motor?: boolean }): void {
  if (s.wind) want.wind = true; // the wind never stops once it started
  if (s.motor !== undefined) want.motor = s.motor;
  apply();
}

export function cue(name: Cue | string): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'click':
      return tick(t, 1, 3200);
    case 'key':
      return tick(t, 0.3, 4200 + Math.random() * 1200);
    case 'mount':
      clack(t);
      return clack(t + 0.11, 0.7);
    case 'power':
      return tone(t, 'sine', 180, 360, 0.25, 0.06);
    case 'install':
      tone(t, 'square', 660, 660, 0.05, 0.025);
      return tone(t + 0.07, 'square', 990, 990, 0.06, 0.025);
    case 'grow':
      return tone(t, 'triangle', 220, 440, 0.45, 0.04);
    case 'snap':
      tick(t, 0.6, 2000);
      tick(t + 0.05, 0.4, 2600);
      return ambient({ wind: true });
    case 'wind':
      return ambient({ wind: true });
    case 'arm':
      return tone(t, 'sawtooth', 140, 220, 0.35, 0.02, 600);
    case 'motor':
      return ambient({ motor: true });
    case 'cam':
    case 'chord':
      return chord(t);
    case 'beep':
      tone(t, 'square', 1046, 1046, 0.08, 0.03, 2500);
      return tone(t + 0.13, 'square', 1046, 1046, 0.08, 0.03, 2500);
  }
}

function apply(): void {
  if (!ctx) return;
  if (want.wind && !loops.wind) loops.wind = wind();
  if (want.motor && !loops.motor) loops.motor = motor();
  if (!want.motor && loops.motor) {
    const m = loops.motor;
    delete loops.motor;
    fade(m.g, 0, 0.8);
    for (const s of m.srcs) s.stop(ctx.currentTime + 0.9);
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
  if (loop) s.loopStart = Math.random();
  return s;
}

function filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = ctx!.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** a short burst of high noise: the key switch */
function tick(t: number, vol: number, freq: number): void {
  const s = noiseSrc();
  s.playbackRate.value = 0.9 + Math.random() * 0.2;
  const f = filter('bandpass', freq, 1);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random(), 0.04);
}

/** one stage of the relay: a hard click over a low thump */
function clack(t: number, vol = 1): void {
  tick(t, 1.2 * vol, 1500);
  const o = ctx!.createOscillator();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.06);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.4 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.1);
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

/** one slow chord, an open minor ninth that swells and fades */
function chord(t: number): void {
  for (const f of [110, 164.8, 261.6, 246.9]) {
    const o = ctx!.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.detune.value = Math.random() * 8 - 4;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 1.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
    o.connect(filter('lowpass', 1200)).connect(g).connect(out);
    o.start(t);
    o.stop(t + 7.1);
  }
}

/** a looped layer that fades in to `vol`; its sources start now */
function layer(vol: number, secs: number): Loop {
  const g = ctx!.createGain();
  g.gain.value = 0;
  g.connect(out);
  fade(g, vol, secs);
  return { g, srcs: [] };
}

function run(l: Loop, ...srcs: AudioScheduledSourceNode[]): void {
  for (const s of srcs) s.start();
  l.srcs.push(...srcs);
}

/** the fan: low rumbling noise and a faint mains whine, under everything */
function hum(): void {
  const l = layer(0.3, 3);
  const s = noiseSrc(true);
  s.connect(filter('lowpass', 400, 0.7)).connect(l.g);
  run(l, s);
  for (const [f, v] of [[120, 0.06], [240, 0.04]] as const) {
    const o = ctx!.createOscillator();
    o.frequency.value = f;
    const og = ctx!.createGain();
    og.gain.value = v;
    o.connect(og).connect(l.g);
    run(l, o);
  }
  loops.hum = l;
}

/** wind: band-passed noise whose pitch and strength drift on slow LFOs */
function wind(): Loop {
  // quiet and dark: a breath under the hum, never a hiss (Maks 10-17: it came in as loud white noise)
  const l = layer(0.07, 6);
  const s = noiseSrc(true);
  const f = filter('bandpass', 280, 1.4);
  const soft = filter('lowpass', 600, 0.7);
  const gust = ctx!.createGain();
  gust.gain.value = 0.6;
  s.connect(f).connect(soft).connect(gust).connect(l.g);
  run(l, s, lfo(0.07, 90, f.frequency), lfo(0.13, 0.25, gust.gain));
  return l;
}

/** the motor: a low growl with a wobble, plus road noise */
function motor(): Loop {
  const l = layer(0.08, 0.6);
  const o = ctx!.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 48;
  o.connect(filter('lowpass', 500, 2)).connect(l.g);
  const s = noiseSrc(true);
  const rg = ctx!.createGain();
  rg.gain.value = 0.4;
  s.connect(filter('lowpass', 500)).connect(rg).connect(l.g);
  run(l, o, lfo(3.1, 3, o.frequency), s);
  return l;
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

/** `?sounds`: a row of buttons that plays each cue and toggles the loops, to judge the mix */
export function soundboard(): void {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;display:flex;flex-wrap:wrap;gap:6px;max-width:90vw';
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:inherit;background:#111;color:#9f9;border:1px solid #393;padding:2px 8px;cursor:pointer';
    b.onclick = (e) => {
      e.stopPropagation();
      start();
      fn();
    };
    el.append(b);
  };
  for (const c of ['click', 'key', 'mount', 'power', 'install', 'grow', 'snap', 'arm', 'chord', 'beep']) btn(c, () => cue(c));
  btn('wind', () => ambient({ wind: true }));
  btn('motor on/off', () => ambient({ motor: !want.motor }));
  document.body.append(el);
}
