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
//   tool     drain (yield multiplier), cooldown (s), noise (cells it wakes)

import { mods } from '../core/mods';

mods([
  { id: 'pinhole-eye', name: 'pinhole eye', family: 'camera', power: 1, warm: 1, tier: 0, params: { res: 24, colors: 4, fps: 1, fov: 60, range: 6, filter: 'gray' }, text: 'a bead of black glass. it remembers light, slowly.' },
  { id: 'vidicon-tube', name: 'vidicon tube', family: 'camera', power: 2, warm: 1.5, tier: 0, params: { res: 64, colors: 4, fps: 4, fov: 70, range: 9, lag: 0.4, filter: 'color' }, text: 'a glass tube that drags its ghosts behind it.' },
  { id: 'saints-lens', name: "saint's lens", family: 'camera', power: 4, warm: 3, tier: 2, params: { res: 200, colors: 0, fps: 15, fov: 80, range: 14, filter: 'color' }, text: 'ground from a saint, they say. it sees as he did.' },
  { id: 'stepper-relay', name: 'stepper relay', family: 'gait', power: 1, warm: 0.5, tier: 0, params: { go: true }, text: 'clicks your legs forward one cell at a time. go n 3.' },
  { id: 'spark-finger', name: 'spark finger', family: 'weapon', power: 1, warm: 0.5, tier: 0, params: { damage: 1, cooldown: 1.2, range: 1.3, aim: 'auto' }, text: 'it bites whatever comes close.' },
  { id: 'ember-cell', name: 'ember cell', family: 'power', power: 0, warm: 0, tier: 0, params: { power: 2 }, text: 'a coal that will not go out.' },
  // world slice: veins, cards, maps, uniques (tier 3 never rolls as loot: vectors place them)
  { id: 'leech-needle', name: 'leech needle', family: 'tool', power: 1, warm: 1, tier: 0, params: { drain: 1, cooldown: 1.5, noise: 8 }, text: 'a hollow needle. it drinks the walls. loudly.' },
  { id: 'bone-auger', name: 'bone auger', family: 'tool', power: 2, warm: 1.5, tier: 1, params: { drain: 2, cooldown: 1, noise: 12 }, text: 'it chews veins to the root. everything hears.' },
  { id: 'card-reader', name: 'card reader', family: 'mind', power: 1, warm: 0.5, tier: 0, params: { what: 'reader' }, text: 'a slot for memory cards. it reads what the dead wrote.' },
  { id: 'map-spool', name: 'map spool', family: 'mind', power: 1, warm: 1, tier: 0, params: { what: 'map', span: 33 }, text: 'a reel of tape that remembers every turn.' },
  { id: 'survey-spool', name: 'survey spool', family: 'mind', power: 2, warm: 1.5, tier: 2, params: { what: 'map', span: 66 }, text: 'a wider reel, wound by a surveyor long gone.' },
  { id: 'drowned-compass', name: 'drowned compass', family: 'mind', power: 1, warm: 1, tier: 1, params: { what: 'compass' }, text: 'it pulls toward what the cards promised.' },
  { id: 'ninth-eye', name: 'the ninth eye', family: 'camera', power: 3, warm: 2, tier: 3, params: { res: 160, colors: 0, fps: 10, fov: 100, range: 16, filter: 'color' }, text: 'eight were made for the god. this one stayed.' },
  { id: 'thaw-engine', name: 'thaw engine', family: 'unique', power: 0, warm: 0, tier: 3, params: {}, text: 'a cold heart the size of a fist. it wants a breast.' },
]);
