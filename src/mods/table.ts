// Every module, one line each: family, power, warm-up, tier, parameters, flavour.
// Adding a module is adding a line here; a family's code reads only its params.
// Parameters per family (the slices read these; unknown keys are ignored):
//   camera   res (px), colors (0 = full), fps, fov (deg), range (cells), noise (0..1), lag (s), filter: color|gray|1bit|heat|sonar|edge
//   scanner  range (cells), sees: heat|metal|flesh|doors|cards|enemies|veins (list), refresh (s), shape: ring|cone
//   lamp     radius (cells), color (hex string), flicker (0..1)
//   gait     go (typed cell moves), keys (arrow keys cell to cell), free (WASD + mouse), dig
//   weapon   damage, cooldown (s), range (cells), aim: auto|aimed
//   body     hp (+max), regen (hp/s), armour (damage off each hit), ward (returns the next hit), recharge (s)
//   mind     what (ledger|map|reader|compass|clock)
//   power    power (+cap)

import { mods } from '../core/mods';

mods([
  { id: 'pinhole-eye', name: 'pinhole eye', family: 'camera', power: 1, warm: 1, tier: 0, params: { res: 24, colors: 4, fps: 1, fov: 60, range: 6, filter: 'gray' }, text: 'a bead of black glass. it remembers light, slowly.' },
  { id: 'vidicon-tube', name: 'vidicon tube', family: 'camera', power: 2, warm: 1.5, tier: 0, params: { res: 64, colors: 4, fps: 4, fov: 70, range: 9, lag: 0.4, filter: 'color' }, text: 'a glass tube that drags its ghosts behind it.' },
  { id: 'saints-lens', name: "saint's lens", family: 'camera', power: 4, warm: 3, tier: 2, params: { res: 200, colors: 0, fps: 15, fov: 80, range: 14, filter: 'color' }, text: 'ground from a saint, they say. it sees as he did.' },
  { id: 'stepper-relay', name: 'stepper relay', family: 'gait', power: 1, warm: 0.5, tier: 0, params: { go: true }, text: 'clicks your legs forward one cell at a time. go n 3.' },
  { id: 'spark-finger', name: 'spark finger', family: 'weapon', power: 1, warm: 0.5, tier: 0, params: { damage: 1, cooldown: 1.2, range: 1.3, aim: 'auto' }, text: 'it bites whatever comes close.' },
  { id: 'ember-cell', name: 'ember cell', family: 'power', power: 0, warm: 0, tier: 0, params: { power: 2 }, text: 'a coal that will not go out.' },
  // fight: weapons and body
  { id: 'nail-psalm', name: 'nail psalm', family: 'weapon', power: 1, warm: 1, tier: 0, params: { damage: 2, cooldown: 0.8, range: 8, aim: 'aimed' }, text: 'a verse that ends in a nail. shoot.' },
  { id: 'ember-spit', name: 'ember spit', family: 'weapon', power: 1, warm: 0.5, tier: 1, params: { damage: 1, cooldown: 0.35, range: 6, aim: 'aimed' }, text: 'it coughs sparks as fast as you ask.' },
  { id: 'bone-lance', name: 'bone lance', family: 'weapon', power: 2, warm: 2, tier: 1, params: { damage: 5, cooldown: 2.2, range: 5, aim: 'aimed' }, text: 'a rib sharpened by a patient god.' },
  { id: 'choir-bell', name: 'choir bell', family: 'weapon', power: 2, warm: 1.5, tier: 1, params: { damage: 2, cooldown: 1.6, range: 2.4, aim: 'auto' }, text: 'it rings at anything that comes near.' },
  { id: 'lead-lung', name: 'lead lung', family: 'body', power: 1, warm: 1, tier: 0, params: { regen: 0.2 }, text: 'heavy breath. you mend three times as fast.' },
  { id: 'frost-coat', name: 'frost coat', family: 'body', power: 1, warm: 1.5, tier: 1, params: { armour: 0.5 }, text: 'rime that takes the edge off every blow.' },
  { id: 'mirror-ward', name: 'mirror ward', family: 'body', power: 2, warm: 2, tier: 1, params: { ward: true, recharge: 8 }, text: 'it gives the next blow back. then it rests.' },
  { id: 'reliquary-ribs', name: 'reliquary ribs', family: 'body', power: 1, warm: 1, tier: 2, params: { hp: 5 }, text: 'a cage of holy bone around your core.' },
]);
