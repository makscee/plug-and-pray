// Every module, one line each: family, power, warm-up, tier, parameters, flavour.
// Adding a module is adding a line here; a family's code reads only its params.
// Parameters per family (the slices read these; unknown keys are ignored):
//   camera   res (px), colors (0 = full), fps, fov (deg), range (cells), noise (0..1), lag (s), blur (px), filter: color|gray|1bit|heat|sonar|edge
//   scanner  range (cells), sees: heat|metal|flesh|doors|cards|enemies|veins (list), refresh (s), shape: ring|cone
//            radars instead: finds: thing|cache|vein|life|deep, every (s), spread (cells), names
//   lamp     radius (cells), color (hex string), flicker (0..1)
//   gait     go (typed cell moves), keys (arrow keys cell to cell), free (WASD + mouse), dig
//   weapon   damage, cooldown (s), range (cells), aim: auto|aimed
//   body     hp (+max), regen (hp/s), armour (damage off each hit), ward (returns the next hit), recharge (s)
//   mind     what (ledger|map|reader|compass|clock); a map: span (cells), detail 0..3, click
//   power    power (+cap)
//   tool     drain (yield multiplier), cooldown (s), noise (cells it wakes)
// Any family (module pass, docs/modules.md): loud (cells farther things notice you while it is on),
// glow (light it gives, cells: counts as a lamp for the cold and for eyes in the dark); body chill (the
// ossuary's cold follows you everywhere but the furnace); mind tithe (kills pay out this many times as often)

import { mods } from '../core/mods';

mods([
  // body slice: gaits, power, slot boards, ledger, clock of hours. Its own keys: gait pace, speed (cells/s),
  // cooldown (s); power slots (a slot board: installing it adds slots and uses it up); mind clock range, ahead (s)
  { id: 'servo-gait', name: 'servo gait', family: 'gait', power: 1, warm: 1, tier: 0, params: { keys: true, pace: 4 }, text: 'pistons that answer the arrow keys. esc leaves the console, enter goes back.' },
  { id: 'gyro-heart', name: 'gyro heart', family: 'gait', power: 2, warm: 2, tier: 1, params: { free: true, speed: 2.5 }, text: 'a spinning heart: wasd to walk, click the eye to turn with the mouse.' },
  { id: 'tunnel-tongue', name: 'tunnel tongue', family: 'gait', power: 2, warm: 1.5, tier: 1, params: { dig: true, cooldown: 1 }, text: 'a rasp of bone-iron. it eats plain wall, not ore.' },
  { id: 'votive-battery', name: 'votive battery', family: 'power', power: 0, warm: 1, tier: 1, params: { power: 3, loud: 1 }, text: 'a jar of prayers that still hold a charge. they whisper.' },
  { id: 'heart-shard', name: 'heart-shard', family: 'power', power: 0, warm: 2, tier: 2, params: { power: 5, loud: 3 }, text: 'a splinter of the god\'s heart. it beats against your board, and everything hears it.' },
  { id: 'slot-board', name: 'slot board', family: 'power', power: 0, warm: 0, tier: 1, params: { slots: 1 }, text: 'a spare socket. install it: one more slot.' },
  { id: 'ledger', name: 'tithe ledger', family: 'mind', power: 1, warm: 0.5, tier: 0, params: { what: 'ledger', tithe: 2 }, text: 'a clerk of the dead counts every kill: twice as many pay out.' },
  { id: 'clock-of-hours', name: 'clock of hours', family: 'mind', power: 2, warm: 1.5, tier: 1, params: { what: 'clock', range: 8, ahead: 1 }, text: 'it ticks a second ahead of the world.' },
  { id: 'dawn-eye', name: 'dawn eye', family: 'camera', power: 2, warm: 0.5, tier: 0, params: { res: 96, colors: 0, fps: 8, fov: 75, range: 9, filter: 'color' }, text: 'a clear colour eye. honest, but it needs light to see far.' },
  { id: 'pinhole-eye', name: 'pinhole eye', family: 'camera', power: 0, warm: 1, tier: 0, params: { res: 24, colors: 4, fps: 3, fov: 60, range: 6, filter: 'gray' }, text: 'a bead of black glass. it remembers light, slowly.' },
  { id: 'vidicon-tube', name: 'vidicon tube', family: 'camera', power: 1, warm: 1.5, tier: 0, params: { res: 64, colors: 4, fps: 4, fov: 70, range: 8, lag: 0.4, filter: 'color' }, text: 'a glass tube that drags its ghosts behind it.' },
  { id: 'saints-lens', name: "saint's lens", family: 'camera', power: 4, warm: 3, tier: 2, params: { size: 2, res: 200, colors: 0, fps: 15, fov: 80, range: 14, filter: 'color' }, text: 'ground from a saint, they say. it sees as he did.' },
  { id: 'stepper-relay', name: 'stepper relay', family: 'gait', power: 1, warm: 0.5, tier: 0, params: { go: true }, text: 'clicks your legs forward one cell at a time. go n 3.' },
  { id: 'spark-finger', name: 'spark finger', family: 'weapon', power: 1, warm: 0.5, tier: 0, params: { damage: 1, cooldown: 1.2, range: 1.5, aim: 'auto' }, text: 'it bites whatever comes close.' },
  // sight (#1321): eyes that trade sharpness, speed and colour; scanners through walls; lamps that draw things
  { id: 'carrion-eye', name: 'carrion eye', family: 'camera', power: 2, warm: 0.5, tier: 0, params: { res: 96, fps: 12, fov: 70, range: 8, filter: '1bit', noise: 0.1 }, text: 'a crow saw the world in two colours and never blinked.' }, // r2 decide: was 1 power; it reads scripture, its reach costs
  { id: 'bat-psalter', name: 'bat psalter', family: 'camera', power: 2, warm: 1, tier: 0, params: { res: 64, fps: 6, fov: 90, range: 10, colors: 8, filter: 'sonar', loud: 3 }, text: 'it sings into the dark and reads the answer. everything hears it sing.' },
  { id: 'ember-iris', name: 'ember iris', family: 'camera', power: 2, warm: 2, tier: 1, params: { res: 48, fps: 3, fov: 60, range: 12, colors: 6, filter: 'heat', noise: 0.15 }, text: 'it sees only what is warm. walls are rumours.' },
  { id: 'lattice-eye', name: 'lattice eye', family: 'camera', power: 3, warm: 1, tier: 1, params: { res: 128, fps: 10, fov: 75, range: 11, filter: 'edge' }, text: 'a lacemaker\'s eye: every thing is its outline.' },
  { id: 'fog-of-saints', name: 'fog of saints', family: 'camera', power: 1, warm: 2.5, tier: 1, params: { res: 96, fps: 2, fov: 80, range: 12, blur: 1, lag: 0.8, filter: 'color' }, text: 'colour, the old way: slow, soft, kind.' },
  { id: 'heat-choir', name: 'heat choir', family: 'scanner', power: 1, warm: 1, tier: 0, params: { range: 7, sees: ['heat'], refresh: 1.5, shape: 'ring' }, text: 'small throats that hum when something warm draws near.' },
  { id: 'lodestone', name: 'lodestone', family: 'scanner', power: 1, warm: 0.5, tier: 0, params: { range: 8, sees: ['metal', 'cards'], refresh: 2, shape: 'ring' }, text: 'a black stone that leans toward iron.' },
  { id: 'bone-listener', name: 'bone-listener', family: 'scanner', power: 1, warm: 1, tier: 1, params: { range: 10, sees: ['flesh'], refresh: 0.8, shape: 'cone' }, text: 'a jawbone pressed to the wall. it hears the hidden.' },
  { id: 'conduit-dowser', name: 'conduit dowser', family: 'scanner', power: 1, warm: 1, tier: 0, params: { range: 9, sees: ['doors'], refresh: 3, shape: 'ring' }, text: 'a forked rib that twitches over passages.' },
  { id: 'marrow-rod', name: 'marrow rod', family: 'scanner', power: 1, warm: 1.5, tier: 1, params: { range: 8, sees: ['veins'], refresh: 3, shape: 'cone' }, text: 'it drinks a little of every vein it finds.' },
  // v2 radars (src/mods/radar.ts): each finds one kind of thing across the floor and marks it on your map, as
  // sure as it can tell (spread: cells it may be off; names: it says what). Without the right one, those stay unmarked
  { id: 'sounding-knell', name: 'sounding knell', family: 'scanner', power: 1, warm: 1, tier: 0, params: { finds: 'thing', range: 26, every: 8, spread: 3, loud: 2 }, text: 'a knell rung into the stone. what rings back is "something", somewhere near there.' },
  { id: 'hollow-tap', name: 'hollow tap', family: 'scanner', power: 1, warm: 1, tier: 0, params: { finds: 'cache', range: 14, every: 4 }, text: 'a little hammer that taps the walls. it hears where they are hollow, not what is inside.' },
  { id: 'vein-fork', name: 'vein fork', family: 'scanner', power: 1, warm: 1, tier: 0, params: { finds: 'vein', range: 22, every: 5, names: true }, text: 'a tuning fork that hums the note of ore, and knows which ore.' },
  { id: 'pulse-choir', name: 'pulse choir', family: 'scanner', power: 2, warm: 1, tier: 1, params: { finds: 'life', range: 22, every: 2, spread: 1.5 }, text: 'it hears every heart within a long throw. not whose.' },
  { id: 'plumb-line', name: 'plumb line', family: 'scanner', power: 1, warm: 2, tier: 1, params: { finds: 'deep', range: 999, every: 10, names: true }, text: 'a weight on a thread. it leans toward the way down, and toward what keeps it.' },
  { id: 'bone-glass', name: 'bone glass', family: 'scanner', power: 2, warm: 1.5, tier: 2, params: { finds: 'cache', range: 24, every: 4, names: true }, text: 'a lens of bone that sees into sealed places, and names what is kept there.' },
  { id: 'watchers-bell', name: "watcher's bell", family: 'scanner', power: 2, warm: 1.5, tier: 2, params: { range: 12, sees: ['enemies', 'cards'], refresh: 1, shape: 'ring' }, text: 'it rings for every eye that turns to you.' },
  { id: 'halo', name: 'halo', family: 'lamp', power: 1, warm: 0.5, tier: 0, params: { radius: 3, color: 'ffe0a8', flicker: 0 }, text: 'a ring of light. it was meant for a head.' },
  { id: 'censer', name: 'censer of embers', family: 'lamp', power: 1, warm: 1, tier: 0, params: { radius: 4, color: 'ff9040', flicker: 0.5 }, text: 'smoke and coal on a chain. it gutters, it breathes.' },
  { id: 'cold-star', name: 'cold star', family: 'lamp', power: 2, warm: 2, tier: 2, params: { radius: 7, color: 'a8c8ff', flicker: 0.05 }, text: 'a shard of a star, still cold. everything sees it.' },
  { id: 'ember-cell', name: 'ember cell', family: 'power', power: 0, warm: 0, tier: 0, params: { power: 2 }, text: 'a coal that will not go out.' },
  // world slice: veins, cards, maps, uniques (tier 3 never rolls as loot: vectors place them)
  { id: 'leech-needle', name: 'leech needle', family: 'tool', power: 1, warm: 1, tier: 0, params: { drain: 1, cooldown: 1.5, noise: 8 }, text: 'a hollow needle. it drinks the walls. loudly.' },
  { id: 'bone-auger', name: 'bone auger', family: 'tool', power: 2, warm: 1.5, tier: 1, params: { drain: 2, cooldown: 1, noise: 12 }, text: 'it chews veins to the root. everything hears.' },
  { id: 'card-reader', name: 'card reader', family: 'mind', power: 1, warm: 0.5, tier: 0, params: { what: 'reader' }, text: 'a slot for memory cards. it reads what the dead wrote.' },
  // v2 maps (src/world/mind.ts): each draws what your eyes and scanners know, in more detail a tier up.
  // detail 0 three inks, no clicks; 1 veins and finds in their own inks, a click walks you there; 2 a picture
  // for every thing and a note on hover; 3 the known halls in glass, with the things in them
  { id: 'map-spool', name: 'map spool', family: 'mind', power: 1, warm: 1, tier: 0, params: { what: 'map', span: 33, detail: 0 }, text: 'a reel of tape that remembers what your eyes saw, in three inks. it takes no clicks.' },
  { id: 'survey-spool', name: 'survey spool', family: 'mind', power: 2, warm: 1.5, tier: 2, params: { what: 'map', span: 37, detail: 1, click: true }, text: 'a surveyor\'s reel: veins and finds in their own inks. click it and your legs go there.' },
  { id: 'illuminated-atlas', name: 'illuminated atlas', family: 'mind', power: 2, warm: 1.5, tier: 2, params: { what: 'map', span: 33, detail: 2, click: true }, text: 'a monk\'s map: every thing a little picture, and a note when you point at it.' },
  { id: 'glass-diorama', name: 'glass diorama', family: 'mind', power: 3, warm: 2, tier: 2, params: { what: 'map', span: 23, detail: 3, click: true }, text: 'the halls you know, in glass, small enough to hold, with every thing in them.' },
  { id: 'drowned-compass', name: 'drowned compass', family: 'mind', power: 0, warm: 1, tier: 1, params: { what: 'compass' }, text: 'it pulls toward what the cards promised.' },
  { id: 'ninth-eye', name: 'the ninth eye', family: 'camera', power: 3, warm: 2, tier: 3, params: { res: 160, colors: 0, fps: 10, fov: 100, range: 16, filter: 'color' }, text: 'eight were made for the god. this one stayed.' },
  { id: 'thaw-engine', name: 'thaw engine', family: 'unique', power: 0, warm: 0, tier: 3, params: {}, text: 'a cold heart the size of a fist. it wants a breast.' },
  // fight: weapons and body
  { id: 'nail-psalm', name: 'nail psalm', family: 'weapon', power: 1, warm: 1, tier: 0, params: { damage: 1.5, cooldown: 0.9, range: 8, aim: 'aimed' }, text: 'a verse that ends in a nail. shoot.' }, // r1 econ: was 2 / 0.8; bone armour (1.2) eats most of it
  { id: 'ember-spit', name: 'ember spit', family: 'weapon', power: 2, warm: 0.5, tier: 1, params: { damage: 0.8, cooldown: 0.35, range: 6, aim: 'aimed' }, text: 'it coughs sparks as fast as you ask.' },
  { id: 'bone-lance', name: 'bone lance', family: 'weapon', power: 2, warm: 2, tier: 1, params: { damage: 6, cooldown: 2.2, range: 5, aim: 'aimed' }, text: 'a rib sharpened by a patient god.' },
  { id: 'choir-bell', name: 'choir bell', family: 'weapon', power: 2, warm: 1.5, tier: 1, params: { damage: 1.5, cooldown: 1.6, range: 2.4, aim: 'auto', sweep: true }, text: 'it rings at anything that comes near.' },
  { id: 'lead-lung', name: 'lead lung', family: 'body', power: 1, warm: 1, tier: 0, params: { regen: 0.3 }, text: 'heavy breath. you mend faster, and still mend in the cold.' },
  { id: 'frost-coat', name: 'frost coat', family: 'body', power: 1, warm: 1.5, tier: 1, params: { armour: 0.5 }, text: 'rime that takes the edge off every blow.' },
  { id: 'mirror-ward', name: 'mirror ward', family: 'body', power: 2, warm: 2, tier: 1, params: { ward: true, recharge: 8 }, text: 'it gives the next blow back. then it rests.' },
  { id: 'reliquary-ribs', name: 'reliquary ribs', family: 'body', power: 1, warm: 1, tier: 2, params: { hp: 5 }, text: 'a cage of holy bone around your core.' },
  // pilots and waypoint logs (playtest 3): pilot gaits walk a seen path to a point (plan: longest path, pace,
  // avoid: around what they see); logs note points of interest (keep: how many, auto: which kinds, range: cells)
  { id: 'wayfinder-moth', name: 'wayfinder moth', family: 'gait', power: 1, warm: 1, tier: 0, params: { pilot: true, plan: 40, pace: 2.5 }, text: 'a moth that remembers every lamp. goto a waypoint, or click a surveyor\'s map.' },
  { id: 'psalm-of-roads', name: 'psalm of roads', family: 'gait', power: 2, warm: 1.5, tier: 1, params: { pilot: true, plan: 120, pace: 3.2, avoid: true }, text: 'a hymn for long roads. it walks you far, around what it sees.' },
  { id: 'sleepwalker', name: 'sleepwalker', family: 'gait', power: 0, warm: 2, tier: 0, params: { pilot: true, plan: 20, pace: 1.6 }, text: 'it walks for you while you dream. slowly, not far.' },
  { id: 'waystone-log', name: 'waystone log', family: 'mind', power: 1, warm: 0.5, tier: 0, params: { what: 'log', keep: 8, range: 8, auto: ['start', 'printer', 'reader', 'card', 'vector'] }, text: 'a pilgrim\'s tally of the places that matter.' },
  { id: 'pilgrims-rosary', name: "pilgrim's rosary", family: 'mind', power: 1, warm: 1, tier: 1, params: { what: 'log', keep: 16, range: 12, auto: ['start', 'printer', 'reader', 'card', 'vector', 'mods', 'veins'] }, text: 'a bead for every thing you passed. it forgets nothing it can hold.' },
  // zones (balance pass): modules that change how you play deeper in. Their own keys: weapon sweep (hits all
  // in reach); body haste (weapons cool faster), mend (hp when below half, every recharge s), heatproof (0..1 of
  // the furnace's heat kept off), thorns (damage back at whatever strikes you up close)
  { id: 'rivet-sling', name: 'rivet sling', family: 'weapon', power: 1, warm: 0.5, tier: 0, params: { damage: 1, cooldown: 1.6, range: 4, aim: 'auto' }, text: 'it flicks iron at anything that comes in sight.' },
  { id: 'censer-flail', name: 'censer flail', family: 'weapon', power: 2, warm: 1, tier: 1, params: { damage: 1.5, cooldown: 1.5, range: 1.8, aim: 'auto', sweep: true, glow: 2.5 }, text: 'a burning censer on a chain. it swings at all of them, and keeps you warm.' },
  { id: 'heat-lance', name: 'heat lance', family: 'weapon', power: 3, warm: 2, tier: 2, params: { damage: 7, cooldown: 1.8, range: 8, aim: 'aimed' }, text: 'a needle of the furnace. it goes through what it finds.' },
  { id: 'reliquary-saw', name: 'reliquary saw', family: 'weapon', power: 3, warm: 1, tier: 2, params: { damage: 3, cooldown: 0.9, range: 1.6, aim: 'auto' }, text: 'teeth taken from a hundred saints. it never tires.' },
  { id: 'ossuary-plate', name: 'ossuary plate', family: 'body', power: 2, warm: 1.5, tier: 2, params: { armour: 1 }, text: 'a breastplate of knitted bone. heavy. good.' },
  { id: 'overclock-coil', name: 'overclock coil', family: 'body', power: 3, warm: 2, tier: 1, params: { haste: 0.4, loud: 2 }, text: 'it runs your weapons hot, and whines for it.' },
  { id: 'suture-moth', name: 'suture moth', family: 'body', power: 1, warm: 1, tier: 1, params: { mend: 4, recharge: 18 }, text: 'a moth that sews. it waits until you are torn.' },
  { id: 'rime-hood', name: 'rime hood', family: 'body', power: 1, warm: 1, tier: 1, params: { heatproof: 1, chill: 1 }, text: 'frost that keeps a head cool in the furnace, and cold everywhere else.' },
  { id: 'thorn-mantle', name: 'thorn mantle', family: 'body', power: 1, warm: 1, tier: 1, params: { thorns: 1 }, text: 'whatever bites you bleeds for it.' },
]);
