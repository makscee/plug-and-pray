// Every module, one line each: family, power, warm-up, tier, parameters, flavour.
// Adding a module is adding a line here; a family's code reads only its params.
// Parameters per family (the slices read these; unknown keys are ignored):
//   camera   res (px), colors (0 = full), fps, fov (deg), range (cells), noise (0..1), lag (s), filter: color|gray|1bit|heat|sonar|edge
//   scanner  range (cells), sees: heat|metal|flesh|doors|cards|enemies|veins (list), refresh (s), shape: ring|cone
//   lamp     radius (cells), color (hex string), flicker (0..1)
//   gait     go (typed cell moves), keys (arrow keys cell to cell), free (WASD + mouse), dig
//   weapon   damage, cooldown (s), range (cells), aim: auto|aimed
//   body     hp (+max), regen (hp/s), armour (damage off each hit)
//   mind     what (ledger|map|reader|compass|clock)
//   power    power (+cap)

import { mods } from '../core/mods';

mods([
  // body slice: gaits, power, slot boards, ledger, clock of hours. Its own keys: gait pace, speed (cells/s),
  // cooldown (s); power slots (a slot board: installing it adds slots and uses it up); mind clock range, ahead (s)
  { id: 'servo-gait', name: 'servo gait', family: 'gait', power: 1, warm: 1, tier: 0, params: { keys: true, pace: 4 }, text: 'pistons that answer the arrow keys. esc leaves the console, enter goes back.' },
  { id: 'gyro-heart', name: 'gyro heart', family: 'gait', power: 2, warm: 2, tier: 1, params: { free: true, speed: 2.5 }, text: 'a spinning heart: wasd to walk, click the eye to turn with the mouse.' },
  { id: 'tunnel-tongue', name: 'tunnel tongue', family: 'gait', power: 2, warm: 1.5, tier: 1, params: { dig: true, cooldown: 1 }, text: 'a rasp of bone-iron. it eats plain wall, not ore.' },
  { id: 'votive-battery', name: 'votive battery', family: 'power', power: 0, warm: 1, tier: 1, params: { power: 3 }, text: 'a jar of prayers that still hold a charge.' },
  { id: 'heart-shard', name: 'heart-shard', family: 'power', power: 0, warm: 2, tier: 2, params: { power: 5 }, text: 'a splinter of the god\'s heart. it beats against your board.' },
  { id: 'slot-board', name: 'slot board', family: 'power', power: 0, warm: 0, tier: 1, params: { slots: 1 }, text: 'a spare socket. install it: one more slot.' },
  { id: 'ledger', name: 'ledger', family: 'mind', power: 1, warm: 0.5, tier: 0, params: { what: 'ledger' }, text: 'a clerk\'s memory: everything you carry, in rows.' },
  { id: 'clock-of-hours', name: 'clock of hours', family: 'mind', power: 2, warm: 1.5, tier: 1, params: { what: 'clock', range: 8, ahead: 1 }, text: 'it ticks a second ahead of the world.' },
  { id: 'pinhole-eye', name: 'pinhole eye', family: 'camera', power: 1, warm: 1, tier: 0, params: { res: 24, colors: 4, fps: 1, fov: 60, range: 6, filter: 'gray' }, text: 'a bead of black glass. it remembers light, slowly.' },
  { id: 'vidicon-tube', name: 'vidicon tube', family: 'camera', power: 2, warm: 1.5, tier: 0, params: { res: 64, colors: 4, fps: 4, fov: 70, range: 9, lag: 0.4, filter: 'color' }, text: 'a glass tube that drags its ghosts behind it.' },
  { id: 'saints-lens', name: "saint's lens", family: 'camera', power: 4, warm: 3, tier: 2, params: { res: 200, colors: 0, fps: 15, fov: 80, range: 14, filter: 'color' }, text: 'ground from a saint, they say. it sees as he did.' },
  { id: 'stepper-relay', name: 'stepper relay', family: 'gait', power: 1, warm: 0.5, tier: 0, params: { go: true }, text: 'clicks your legs forward one cell at a time. go n 3.' },
  { id: 'spark-finger', name: 'spark finger', family: 'weapon', power: 1, warm: 0.5, tier: 0, params: { damage: 1, cooldown: 1.2, range: 1.3, aim: 'auto' }, text: 'it bites whatever comes close.' },
  { id: 'ember-cell', name: 'ember cell', family: 'power', power: 0, warm: 0, tier: 0, params: { power: 2 }, text: 'a coal that will not go out.' },
]);
