import './style.css';
import { load, reset, save, tokenize } from './model';
import { Term } from './term';
import { hook as end } from './end';
import { follow } from './map/trip';
import { hookFrame } from './scene/frame';
import { render, still } from './scene';
import { ambient, soundboard } from './audio';

const params = new URLSearchParams(location.search);

// offline after the first load (sw/sw.js); only where a service worker may run, never in dev
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || local))
  navigator.serviceWorker.register('./sw.js').catch(() => {});
if (params.has('new')) reset();

const w = load();
const term = new Term(w);
follow(term);
hookFrame(term);
(window as unknown as { thaw: unknown }).thaw = { w, term, scene: { render, still } };
end(term);
// sound loops follow the state: wind once a frame was taken, motor while driving
const sound = () => ambient({ wind: !!w.state.frame && !w.state.frame.still, motor: !!w.state.trip });
term.after.push(sound);
sound();
if (params.has('sounds')) soundboard();

if (w.state.lastOutput) {
  void term.print(w.state.lastOutput, false);
} else {
  // boot prints boot.log; the bar shows ls
  const boot = w.nodes['/boot.log'].lines!.lines.map((l) => tokenize(w, l));
  w.state.lastOutput = { lines: boot };
  save(w);
  term.setBusy(true);
  void term.print({ lines: boot }).then(() => term.setBusy(false));
}
