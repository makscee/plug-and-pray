// snap, arm, view, optics, cam: looking (DESIGN 8).
// The model doesn't render: snap asks an eye which things are in view. The browser sets the
// scene's eye (src/scene/frame.ts); without one, everything at the place is in view.

import { reachable, say, tok, tokenize, verb } from '../commands';
import type { Line, Output, Seg, World } from '../world';
import { where } from './drive';

export const DIRS: Record<string, number> = { n: 0, e: 90, s: 180, w: 270 };
const DIR_NAME: Record<number, string> = { 0: 'n', 90: 'e', 180: 's', 270: 'w' };

export type Eye = (v: { place: string; heading: number; res: 64 | 160; blur?: boolean; at?: [number, number] }) => string[];


let eye: Eye | null = null;
export function setEye(fn: Eye): void {
  eye = fn;
}

const atPlace = (w: World, place: string) =>
  Object.values(w.nodes)
    .filter((n) => n.thing?.at === place)
    .map((n) => n.id);

export const dirName = (h: number) => DIR_NAME[((h % 360) + 360) % 360] ?? `${h}`;

/** a thing's token: `?` until armed, then its name */
export const thingTok = (w: World, id: string): Seg => ({ text: w.state.armed.includes(id) ? w.nodes[id].name : '?', kind: 'thing', nodeId: id });

const open = (w: World, out: Output): Output => {
  if (!w.state.windows.includes('frame')) w.state.windows.push('frame');
  return { ...out, open: ['frame'] };
};

verb('snap', {
  takes: 'noun',
  args: ['n', 'e', 's', 'w'],
  fits: (_w, t) => t.kind === 'dir',
  run(w, d = 'n') {
    const s = w.state;
    const heading = DIRS[d] ?? s.heading;
    const res: 64 | 160 = s.bar.includes('optics') ? 160 : 64;
    s.heading = heading;
    // mid-road (DESIGN 8): from where the trip has got to, with the horizontal smear
    const view = s.trip ? { place: s.position, heading, res, blur: true, at: where(w) } : { place: s.position, heading, res };
    const things = eye ? eye(view) : s.trip ? [] : atPlace(w, s.position);
    s.frame = { ...view, things };
    const n = things.length;
    return open(w, {
      lines: [[`snap ${dirName(heading)}  ${res} px`], [n ? `${n} in view: ` : 'nothing in view', ...things.flatMap((id, i): Seg[] => (i ? [' ', thingTok(w, id)] : [thingTok(w, id)]))]],
      header: true,
      cues: ['snap'],
    });
  },
});

verb('arm', {
  takes: 'noun',
  fits: (w, t) => t.kind === 'thing' && !!w.state.frame?.things.includes(t.nodeId!),
  run(w, id) {
    const s = w.state;
    const n = id ? w.nodes[id] : undefined;
    if (!n?.thing) return say(`arm: nothing there`);
    if (!s.frame?.things.includes(n.id)) return say('arm: not in the frame');
    const fresh = !s.armed.includes(n.id);
    if (fresh) {
      s.armed.push(n.id);
      if (s.sol) s.sol++;
    }
    const lines: Line[] = [[`arm ${n.name}`], tokenize(w, n.thing.says)];
    const d = n.thing.device ? w.nodes[n.thing.device] : undefined;
    if (d) lines.push(['on the bus: ', tok(w, d)]);
    return { lines, header: true, cues: ['arm'] };
  },
});

const isStill = (w: World, id?: string) => !!id && !!w.nodes[id]?.lines?.frame;

verb('view', {
  takes: 'optional',
  fits: (w, t) => isStill(w, t.nodeId),
  run(w, id) {
    const frames = Object.values(w.nodes).filter((n) => n.lines?.frame && n.id.startsWith('IMG/'));
    if (!id) {
      const why = frames[0] ? reachable(w, frames[0].id) : 'no frames';
      if (why) return say(`view: ${why}`);
      return { lines: [[`frames  ${frames.length} stored`], frames.flatMap((n, i): Seg[] => (i ? ['  ', tok(w, n)] : [tok(w, n)]))], header: true };
    }
    const n = w.nodes[id];
    if (!n?.lines?.frame) return say(`view: no frame ${id}`);
    const why = reachable(w, n.id);
    if (why) return say(`view: ${why}`);
    w.state.frame = { place: w.state.position, heading: w.state.heading, res: 64, things: [], still: n.lines.frame };
    return open(w, { lines: [[`view ${n.name}`], ...n.lines.lines.map((l) => tokenize(w, l))], header: true });
  },
});

verb('optics', {
  takes: 'none',
  run: (w) => say(w.state.bar.includes('optics') ? 'optics fitted. frames at 160 px, 32 colours.' : 'optics: not fitted'),
});

verb('cam', {
  takes: 'none',
  run(w) {
    const s = w.state;
    if (s.windows.includes('cam')) {
      s.windows = s.windows.filter((x) => x !== 'cam');
      return say('cam closed');
    }
    s.windows.push('cam');
    return { lines: [['cam open'], ['look around. the mouse turns the head.']], header: true, cues: ['cam'] };
  },
});
