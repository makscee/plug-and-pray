// Console line kinds (pure, so vitest reads it): how each printed line looks (src/style.css .ln-*).
import type { Line } from '../core/types';

const sig = (l: Line) => l.map((s) => (typeof s === 'string' ? s : s.text)).join('');

/** what a printed line is, for its look (Maks 10-18: "everything blends"): your typed command, a fight
 *  line, loot, a warning or refusal, a codex/guide line, else plain narration. Read off the words, so
 *  every `say` in the game sorts itself without each one being tagged. */
export type Kind = 'cmd' | 'combat' | 'loot' | 'warn' | 'info' | 'say';
export function lineKind(l: Line): Kind {
  const first = l[0];
  if (first && typeof first !== 'string' && !first.cmd && first.text.startsWith('> ')) return 'cmd';
  const t = sig(l).trim().toLowerCase();
  if (/^⚠|no weapon on|not enough power|nothing installed|: unknown|no free slot|is full|still cooling|is warming up \(|refuse|too hard|will not|you carry no|can't|cannot|wants \d|short \d/.test(t)) return 'warn';
  if (/\bhits? you\b|^you hit |you miss|^you stop|took you|burns you|open: hit it|a mimic|turns its light on you|bursts\.|gutters out|burns down|folds into|comes apart|falls silent|goes out\.|goes quiet|splits\.|^it stops\./.test(t)) return 'combat';
  if (/^\+\d|^you take|^conjured|drinks the vein|^you grind|shard|^the printer grinds out|knits you|core runs warmer|stitches you|closes your wounds/.test(t)) return 'loot';
  if (/^◆|^the [a-z' ]+ (eye|lens)\b|a vein of|handprints|vector:|the engine:|^you hear/.test(t)) return 'info';
  return 'say';
}
