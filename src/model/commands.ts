// Commands: run(world, verb, noun?) => Output. The terminal only renders Output and sends clicks
// back as (verb, noun). A noun is a node id, or for value and direction tokens the argument text.
//
// Verbs live in ./verbs/*.ts, one file per area, each calling `verb(name, def)`. A slice adds or
// replaces its verbs in its own file.

import { isToken, type Kind, type Line, type Node, type Output, type Seg, type Token, type World } from './world';

export interface VerbDef {
  /** 'none' runs at once; 'noun' waits for a fitting click; 'optional' runs at once from the bar, takes a noun from a click */
  takes: 'none' | 'noun' | 'optional';
  /** does this token fit as the noun? (only for 'noun' and 'optional') */
  fits?: (w: World, t: Token) => boolean;
  /** argument tokens shown after the waiting verb, like snap's n e s w */
  args?: string[];
  run: (w: World, noun?: string) => Output;
  /** hidden verbs (install, set) never sit in the bar */
  hidden?: boolean;
}

export const verbs: Record<string, VerbDef> = {};

export function verb(name: string, def: VerbDef): void {
  verbs[name] = def;
}

/** verbs a text teaches just by naming them (DESIGN 4: the readme names tail and mount) */
export const TEXT_VERBS = ['ls', 'read', 'tail', 'mount', 'dev'];

/** the default verb for a click on a token with no verb waiting */
export function defaultVerb(w: World, t: Token): string | null {
  switch (t.kind) {
    case 'verb':
      return t.arg ?? t.text;
    case 'value':
      return 'set';
    case 'more':
      return 'more';
    case 'dir':
      return 'snap';
    case 'folder':
      return 'ls';
    case 'file':
      return w.nodes[t.nodeId!]?.lines?.frame ? 'view' : 'read';
    case 'tool':
      return 'install';
    case 'device': {
      const n = w.nodes[t.nodeId!];
      if (!isOn(w, n)) return 'power';
      return w.state.mounted.includes(n.id) ? 'ls' : 'mount';
    }
    case 'subsystem':
      return 'power';
    case 'place':
      // an unknown place line first goes on the map; a known one drives (#1320)
      return w.state.bar.includes('drive') && w.state.places.includes(t.nodeId!) ? 'drive' : 'map';
    case 'thing':
      return 'arm';
    case 'fact':
      return 'pick';
  }
  return null;
}

/** the command a click types: "read readme", "set rows 20" */
export function typed(w: World, v: string, t?: Token): string {
  if (!t) return v;
  if (t.kind === 'value') return t.arg!;
  if (t.kind === 'dir') return `${v} ${t.arg}`;
  if (t.kind === 'place') return `${v} ${w.nodes[t.nodeId!]?.name ?? t.text}`;
  return `${v} ${t.text.replace(/[/*]$/, '')}`;
}

/** the noun a token passes to run() */
export function nounOf(t: Token): string | undefined {
  if (t.kind === 'value' || t.kind === 'dir') return t.arg;
  return t.nodeId;
}

/** run a verb; also marks the names it shows as known and the verbs it names as in the bar */
export function run(w: World, v: string, noun?: string): Output {
  const def = verbs[v];
  let out: Output;
  if (!def) out = { lines: [[`${v}: not found`]] };
  else out = def.run(w, noun);
  learn(w, out);
  w.state.lastOutput = out;
  return out;
}

/** what a click on token t does: [verb, noun] or null when nothing fits */
export function resolve(w: World, waiting: string | null, t: Token): [string, string | undefined] | null {
  if (t.kind === 'verb') return [t.arg ?? t.text, undefined];
  if (waiting) {
    const def = verbs[waiting];
    if (def?.fits?.(w, t)) return [waiting, nounOf(t)];
    return null;
  }
  const v = defaultVerb(w, t);
  if (!v) return null;
  return [v, nounOf(t)];
}

function learn(w: World, out: Output): void {
  const s = w.state;
  for (const line of out.lines)
    for (const seg of line) {
      if (!isToken(seg)) continue;
      if (seg.nodeId && !s.known.includes(seg.nodeId)) s.known.push(seg.nodeId);
      if (seg.kind === 'verb') addVerb(w, seg.arg ?? seg.text);
    }
}

export function addVerb(w: World, v: string): boolean {
  if (w.state.bar.includes(v) || verbs[v]?.hidden) return false;
  w.state.bar.push(v);
  return true;
}

// ---- helpers the verbs share ----

export const COLS = 48;

export function isOn(w: World, n: Node): boolean {
  const d = n.device;
  if (!d) return false;
  if (d.bus !== 'internal') return true;
  return !d.offAtBoot || w.state.powered.includes(n.id);
}

/** devices on the bus right now, in listing order */
export function bus(w: World): Node[] {
  const s = w.state;
  return Object.values(w.nodes).filter((n) => {
    const d = n.device;
    if (!d) return false;
    if (d.bus === 'internal') return isOn(w, n);
    if (d.bus === 'ext') return d.at === s.position;
    return !!d.at && s.armed.includes(d.at);
  });
}

/** the device whose drive holds node id (undefined for your own root) */
export function driveOf(w: World, id: string): Node | undefined {
  let n: Node | undefined = w.nodes[id];
  while (n?.parent) n = w.nodes[n.parent];
  return n?.kind === 'device' ? n : undefined;
}

/** is this node readable right now: own root, or on a mounted drive */
export function reachable(w: World, id: string): string | null {
  const d = driveOf(w, id);
  if (!d) return null;
  if (!w.state.mounted.includes(d.id)) return `${d.name} not mounted`;
  return null;
}

let nameIndex: Map<string, string> | null = null;
let indexFor: World | null = null;

/** names that are keys in a text: unique names of devices, folders, files */
export function names(w: World): Map<string, string> {
  if (nameIndex && indexFor === w) return nameIndex;
  const count = new Map<string, number>();
  const id = new Map<string, string>();
  for (const n of Object.values(w.nodes)) {
    if (!['device', 'folder', 'file'].includes(n.kind)) continue;
    count.set(n.name, (count.get(n.name) ?? 0) + 1);
    id.set(n.name, n.id);
  }
  nameIndex = new Map([...id].filter(([name]) => count.get(name) === 1 && name !== '/'));
  indexFor = w;
  return nameIndex;
}

export function tok(w: World, n: Node): Token {
  const text = n.kind === 'folder' ? n.name + '/' : n.kind === 'tool' ? n.name + '*' : n.name;
  return { text, kind: n.kind as Kind, nodeId: n.id };
}

/** a place line, "HAB 3.0 km bearing 040": the whole line is one place token */
const PLACE = /([A-Z][A-Z0-9-]*) (\d+(?:\.\d+)?) km bearing (\d{3})/g;

const WORD = /\{([^|}]+)\|([^}]+)\}|[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]|[A-Za-z0-9]/g;

/** turn a line of text into segments: names become tokens, `{5|set rows 20}` a value token,
 *  a place line `HAB 3.0 km bearing 040` a place token */
export function tokenize(w: World, text: string): Line {
  const out: Seg[] = [];
  let at = 0;
  for (const m of text.matchAll(PLACE)) {
    const id = '@' + m[1];
    if (w.nodes[id]?.kind !== 'place') continue;
    out.push(...words(w, text.slice(at, m.index)), { text: m[0], kind: 'place', nodeId: id });
    at = m.index! + m[0].length;
  }
  out.push(...words(w, text.slice(at)));
  return out;
}

function words(w: World, text: string): Line {
  const out: Seg[] = [];
  const idx = names(w);
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    let t: Token | null = null;
    if (m[1] !== undefined) t = { text: m[1], kind: 'value', arg: m[2] };
    else if (TEXT_VERBS.includes(m[0]) || w.state.bar.includes(m[0])) t = { text: m[0], kind: 'verb', arg: m[0] };
    else if (idx.has(m[0])) {
      const n = w.nodes[idx.get(m[0])!];
      t = { text: m[0], kind: n.kind as Kind, nodeId: n.id };
    }
    if (!t) continue;
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(t);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** flow tokens across lines of COLS, two spaces apart */
export function flow(items: Seg[], width = COLS): Line[] {
  const lines: Line[] = [];
  let line: Seg[] = [];
  let len = 0;
  for (const it of items) {
    const t = typeof it === 'string' ? it : it.text;
    if (len && len + 2 + t.length > width) {
      lines.push(line);
      line = [];
      len = 0;
    }
    if (len) {
      line.push('  ');
      len += 2;
    }
    line.push(it);
    len += t.length;
  }
  if (line.length) lines.push(line);
  return lines;
}

export const say = (...lines: string[]): Output => ({ lines: lines.map((l) => [l]) });

/** a page of `body` under `header`, fitting the rows; returns the output and how many body lines it showed */
export function page(w: World, header: Line, body: Line[], from: number, total: number): { out: Output; shown: number } {
  const room = w.state.rows - 1;
  const shown = Math.min(room, body.length - from);
  const rest = total - from - shown;
  const head: Line = [...header];
  if (rest > 0) {
    head.push('  ');
    head.push(w.state.bar.includes('more') ? { text: `+${rest} more`, kind: 'more' } : `+${rest} more`);
  }
  return { out: { lines: [head, ...body.slice(from, from + shown)], header: true }, shown };
}

/** the prompt before the cursor: ">", "sol 1 >", "sol 18/22 · cold >" */
export function prompt(w: World): string {
  const s = w.state;
  if (!s.sol) return '>';
  let p = `sol ${s.sol}`;
  if (s.light) p += `/${s.light}`;
  if (s.light && s.sol >= s.light - 4) p += ' · cold';
  return p + ' >';
}
