// The game's data. Pure data, no DOM: the core runs under vitest and in the browser alike.
//
// Coordinates: x grows east, y grows south, one unit is one cell. A cell's centre is (i + 0.5, j + 0.5).
// Facing `dir` is in radians, 0 = north, clockwise: forward is (sin dir, -cos dir).

export type Res = 'bone' | 'glass' | 'copper' | 'ichor';
export const RES: Res[] = ['bone', 'glass', 'copper', 'ichor'];

/** a find's light roll: one parameter better (attuned) or worse (cracked) */
export interface Roll {
  key: string;
  mult: number;
  tag: 'attuned' | 'cracked';
}

export type Item =
  | { kind: 'mod'; mod: string; roll?: Roll }
  | { kind: 'res'; res: Res; n: number }
  | { kind: 'card'; card: string };

/** an installed module */
export interface Inst {
  uid: number;
  mod: string;
  roll?: Roll;
  on: boolean;
  /** game time (s) when it is warm and works; meaningless while off */
  readyAt: number;
  /** the family's own state (cooldowns, last frame time...) */
  data: Record<string, unknown>;
}

export interface Enemy {
  type: string;
  hp: number;
  /** game time (s) its next strike can land */
  readyAt: number;
  data: Record<string, unknown>;
}

export interface Entity {
  id: number;
  kind: 'item' | 'enemy' | 'printer' | 'prop';
  x: number;
  y: number;
  item?: Item;
  enemy?: Enemy;
  /** free-form per kind: a printer's stock, a prop's look */
  data?: Record<string, unknown>;
}

export interface Player {
  x: number;
  y: number;
  dir: number;
  hp: number;
  maxHp: number;
  /** slots on the motherboard, 3 to 8 */
  slots: number;
  /** the core's power, before power modules */
  core: number;
  installed: Inst[];
  inv: Item[];
  /** cell centres still to walk through, from a gait command */
  path: [number, number][];
  /** cells per second along the path: crawling 0.5, the stepper 2.5 */
  pace: number;
  /** free movement from the gyro heart: wanted velocity in cells/s, east and south */
  move: [number, number] | null;
  /** game time (s) the player last took damage */
  hurtAt: number;
  /** max hp bought at altars, on top of START_HP and body modules */
  flesh?: number;
}

/** a vector from a memory card: a thing placed at a cell */
export interface Vector {
  card: string;
  x: number;
  y: number;
  what: string;
  found: boolean;
}

export interface Chunk {
  cx: number;
  cy: number;
  /** CHUNK*CHUNK cells, row by row; see Cell */
  cells: Uint8Array;
  /** which zone it lies in (src/world/zones.ts): the sight layer reads it for the look */
  zone?: number;
}

/** a console line: text, and buttons that type a command */
export type Seg = string | { text: string; cmd: string };
export type Line = Seg[];

export interface Game {
  seed: number;
  /** game time in seconds */
  t: number;
  player: Player;
  ents: Entity[];
  chunks: Map<string, Chunk>;
  vectors: Vector[];
  /** cards read, by id */
  cards: string[];
  /** cells seen by any sight, "x,y" (the map spool draws them) */
  seen: Set<string>;
  /** console output, oldest first */
  log: Line[];
  nextId: number;
  ended: null | 'dead' | 'thaw';
  stats: { mods: string[]; far: number; kills: number };
  /** events this tick for UI and sound: 'hit', 'hurt', 'take', 'install', 'warm', 'die', ... */
  events: { type: string; at?: [number, number]; data?: unknown }[];
}
