// Wires the sound to the game: a frame hook plays what listen() hears; `?sounds` opens the soundboard.
// main.ts imports this file once; start() on the first key or click is main's.

import { frameHooks } from '../ui';
import { CUES, cue, depth, soundboard, start, started } from '.';
import { deep, ear, listen } from './listen';

const e = ear();
let deepNow = -1;
frameHooks.push((g) => {
  const plays = listen(e, g); // listen even before audio starts, so the first click hears no backlog
  if (!started()) return;
  for (const p of plays) cue(p.cue, p);
  const d = Math.round(deep(g) * 20) / 20;
  if (d !== deepNow) depth((deepNow = d));
});

if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('sounds')) {
  if (document.body) soundboard();
  else addEventListener('DOMContentLoaded', soundboard);
}

// for the play-through: start audio and fire every cue without a real gesture
if (typeof window !== 'undefined') (window as unknown as { thawAudio: unknown }).thawAudio = { start, started, cue, CUES };
