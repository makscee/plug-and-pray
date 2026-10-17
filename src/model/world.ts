// The world: every node the game knows about, and the run's state.
// Content (src/content) builds the nodes; commands (./commands) read and change the state.

export type Kind = 'folder' | 'file' | 'tool' | 'device' | 'subsystem' | 'place' | 'thing' | 'fact';

export interface FileData {
  lines: string[];
  /** fact ids collected the moment this file is read or tailed */
  facts?: string[];
  /** reading this file sets the light window shown in the prompt (the almanac: 22) */
  light?: number;
  /** a stored frame in IMG: clicking the file views it (the scene slice: 8) */
  frame?: string;
}

export interface ToolData {
  /** the verb this tool puts in the bar */
  verb: string;
  /** one line printed when it is installed */
  help: string;
}

export interface DeviceData {
  /** what `dev` prints after the name: "power", "memory", "weather" */
  label: string;
  /** own part on the internal bus, live thing nearby (ext), or a dead thing reached by the arm */
  bus: 'internal' | 'ext' | 'dead';
  /** internal parts only: off until named and powered (DSP, IMG, NAV) */
  offAtBoot?: boolean;
  /** ext devices: the place where it is on the bus; dead devices: the thing that holds the drive */
  at?: string;
  /** mounting it starts the sol counter (PWR) */
  startsClock?: boolean;
}

export interface PlaceData {
  /** km east and north of where T woke */
  x: number;
  y: number;
}

export interface ThingData {
  /** place id where this thing stands */
  at: string;
  /** what `arm ?` prints */
  says: string;
  /** device id it puts on the bus, if it has a drive */
  device?: string;
}

export interface FactData {
  /** the packet label shown in the send form */
  label: string;
  /** bytes it takes of the 64 byte packet */
  size: number;
}

export interface Node {
  /** unique id; a drive's nodes are "<DEV>/<path>", own root's are "/<path>" */
  id: string;
  kind: Kind;
  /** the name on screen */
  name: string;
  /** parent folder or device id; undefined for roots, places, things, facts */
  parent?: string;
  /** folders and devices: child ids in listing order */
  children?: string[];
  lines?: FileData;
  tool?: ToolData;
  device?: DeviceData;
  place?: PlaceData;
  thing?: ThingData;
  fact?: FactData;
}

export interface State {
  rows: number;
  /** current sol; 0 until PWR is mounted */
  sol: number;
  /** the light window once the almanac was read, else 0 */
  light: number;
  /** place id where T is */
  position: string;
  /** degrees, 0 = north */
  heading: number;
  /** node ids the player has listed (drawn on the map) */
  listed: string[];
  mounted: string[];
  powered: string[];
  /** names the player has seen on screen (node ids) */
  known: string[];
  /** verbs in the bar, in order */
  bar: string[];
  facts: string[];
  /** places visited (terrain layer) */
  visited: string[];
  /** places known (terrain layer dots) */
  places: string[];
  /** things armed (named), by thing id */
  armed: string[];
  /** windows open, by name */
  windows: string[];
  /** the last output, re-rendered on reload */
  lastOutput: Output | null;
  /** what `more` continues: a file read from line `from`, or a listing from entry `from` */
  more: { id: string; from: number; mode: 'read' | 'ls' } | null;
  /** set once the game ended: the ending id */
  ended: string | null;
  /** tool node ids installed */
  installed: string[];
  /** the packet form: fact ids picked, null while the form is closed */
  packet: string[] | null;
  /** the drive under way: from and to place ids, started at `at` (ms since epoch), lasting `ms` */
  trip: { from: string; to: string; at: number; ms: number } | null;
  /** every point T has driven through, km east/north of the wake point, oldest first */
  path: [number, number][];
  /** which MAP layer shows */
  layer: 'forest' | 'terrain';
  /** what FRAME shows: the last snap, or a stored frame; `things` are the ids in view, left to right */
  frame: { place: string; heading: number; res: 64 | 160; blur?: boolean; at?: [number, number]; things: string[]; still?: string } | null;
}

export interface World {
  nodes: Record<string, Node>;
  state: State;
}

/** A clickable word. `kind` decides what a click does (see commands.ts `defaultVerb`). */
export interface Token {
  text: string;
  kind: Kind | 'verb' | 'value' | 'dir' | 'more';
  /** the node it names, for node kinds */
  nodeId?: string;
  /** kind 'verb': the verb; kind 'value': the full command it runs ("set rows 20"); kind 'dir': n e s w */
  arg?: string;
}

export type Seg = string | Token;
export type Line = Seg[];

export interface Output {
  lines: Line[];
  /** the first line is a header (drawn brighter) */
  header?: boolean;
  /** windows to open after printing */
  open?: string[];
  /** sound cues to play */
  cues?: string[];
}

export function initialState(): State {
  return {
    rows: 5,
    sol: 0,
    light: 0,
    position: '@here',
    heading: 0,
    listed: [],
    mounted: [],
    powered: [],
    known: [],
    bar: ['ls'],
    facts: [],
    visited: ['@here'],
    places: ['@here'],
    armed: [],
    windows: [],
    lastOutput: null,
    more: null,
    ended: null,
    installed: [],
    packet: null,
    trip: null,
    path: [[0, 0]],
    layer: 'forest',
    frame: null,
  };
}

export const isToken = (s: Seg): s is Token => typeof s !== 'string';
