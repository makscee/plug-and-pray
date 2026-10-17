// Every module, one line each: family, power, warm-up, tier, parameters, flavour.
// Adding a module is adding a line here; a family's code reads only its params.
// Parameters per family (the slices read these; unknown keys are ignored):
//   camera   res (px), colors (0 = full), fps, fov (deg), range (cells), noise (0..1), lag (s), blur (px), filter: color|gray|1bit|heat|sonar|edge
//   scanner  range (cells), sees: heat|metal|flesh|doors|cards|enemies|veins (list), refresh (s), shape: ring|cone
//   lamp     radius (cells), color (hex string), flicker (0..1)
//   gait     go (typed cell moves), keys (arrow keys cell to cell), free (WASD + mouse), dig
//   weapon   damage, cooldown (s), range (cells), aim: auto|aimed
//   body     hp (+max), regen (hp/s), armour (damage off each hit), ward (returns the next hit), recharge (s)
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
  // sight (#1321): eyes that trade sharpness, speed and colour; scanners through walls; lamps that draw things
  { id: 'carrion-eye', name: 'carrion eye', family: 'camera', power: 1, warm: 0.5, tier: 0, params: { res: 96, fps: 12, fov: 70, range: 8, filter: '1bit', noise: 0.1 }, text: 'a crow saw the world in two colours and never blinked.' },
  { id: 'bat-psalter', name: 'bat psalter', family: 'camera', power: 1, warm: 1, tier: 0, params: { res: 64, fps: 6, fov: 90, range: 10, colors: 8, filter: 'sonar' }, text: 'it sings into the dark and reads the answer.' },
  { id: 'ember-iris', name: 'ember iris', family: 'camera', power: 2, warm: 2, tier: 1, params: { res: 48, fps: 3, fov: 60, range: 12, colors: 6, filter: 'heat', noise: 0.15 }, text: 'it sees only what is warm. walls are rumours.' },
  { id: 'lattice-eye', name: 'lattice eye', family: 'camera', power: 2, warm: 1, tier: 1, params: { res: 128, fps: 10, fov: 75, range: 11, filter: 'edge' }, text: 'a lacemaker\'s eye: every thing is its outline.' },
  { id: 'fog-of-saints', name: 'fog of saints', family: 'camera', power: 2, warm: 2.5, tier: 1, params: { res: 96, fps: 2, fov: 80, range: 12, blur: 1, lag: 0.8, filter: 'color' }, text: 'colour, the old way: slow, soft, kind.' },
  { id: 'heat-choir', name: 'heat choir', family: 'scanner', power: 1, warm: 1, tier: 0, params: { range: 7, sees: ['heat'], refresh: 1.5, shape: 'ring' }, text: 'small throats that hum when something warm draws near.' },
  { id: 'lodestone', name: 'lodestone', family: 'scanner', power: 1, warm: 0.5, tier: 0, params: { range: 8, sees: ['metal', 'cards'], refresh: 2, shape: 'ring' }, text: 'a black stone that leans toward iron.' },
  { id: 'bone-listener', name: 'bone-listener', family: 'scanner', power: 1, warm: 1, tier: 1, params: { range: 10, sees: ['flesh'], refresh: 0.8, shape: 'cone' }, text: 'a jawbone pressed to the wall. it hears the hidden.' },
  { id: 'conduit-dowser', name: 'conduit dowser', family: 'scanner', power: 1, warm: 1, tier: 0, params: { range: 9, sees: ['doors'], refresh: 3, shape: 'ring' }, text: 'a forked rib that twitches over passages.' },
  { id: 'marrow-rod', name: 'marrow rod', family: 'scanner', power: 1, warm: 1.5, tier: 1, params: { range: 8, sees: ['veins'], refresh: 3, shape: 'cone' }, text: 'it drinks a little of every vein it finds.' },
  { id: 'watchers-bell', name: "watcher's bell", family: 'scanner', power: 2, warm: 1.5, tier: 2, params: { range: 12, sees: ['enemies', 'cards'], refresh: 1, shape: 'ring' }, text: 'it rings for every eye that turns to you.' },
  { id: 'halo', name: 'halo', family: 'lamp', power: 1, warm: 0.5, tier: 0, params: { radius: 3, color: 'ffe0a8', flicker: 0 }, text: 'a ring of light. it was meant for a head.' },
  { id: 'censer', name: 'censer of embers', family: 'lamp', power: 1, warm: 1, tier: 0, params: { radius: 4, color: 'ff9040', flicker: 0.5 }, text: 'smoke and coal on a chain. it gutters, it breathes.' },
  { id: 'cold-star', name: 'cold star', family: 'lamp', power: 2, warm: 2, tier: 2, params: { radius: 7, color: 'a8c8ff', flicker: 0.05 }, text: 'a shard of a star, still cold. everything sees it.' },
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
