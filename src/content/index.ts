// The whole world as data: every drive, file, place, thing and packet fact (DESIGN 11-13).
//
// Rules the text keeps (test/content.test.ts checks them): lines of at most 44 characters;
// the first ring (PWR ARM MEM RADIO WX) is read at five rows, so every file there is four lines
// or a log whose keys sit in its first and last four lines; never the word for what T is; no years.
// A unique file, folder or device name anywhere in a text becomes a token, so these words stay out
// of the prose in lower case: home pods keys cam radio names status manifest almanac.
//
// Where the keys sit: DSP in the tail of ARM/log, IMG in the tail of WX/exposure.log, NAV in the
// crate's manifest, LDR and HAB in NAV/waypoints, RLY and T-2 with distance and bearing from the
// habitat in HAB/home/ilya/card and HAB/cam/module. Two tools put cam in the bar: T-2's good camera
// and HAB/cam's cracked one, for a player who never reaches the sibling (DESIGN 8).

import { initialState, type World } from '../model/world';
import { Builder } from './build';

export function world(): World {
  const b = new Builder();

  // the packet facts (send, #1315): each is listed in the `facts` of exactly one file
  b.fact('coords', { label: 'habitat at 12.4S 103.7E', size: 18 });
  b.fact('pods', { label: '4 pods 3 nominal', size: 18 });
  b.fact('kaja', { label: 'Kaja Lind', size: 8 });
  b.fact('ruben', { label: 'Ruben Achter', size: 8 });
  b.fact('noor', { label: 'Noor Haddad', size: 8 });
  b.fact('ilya', { label: 'Ilya Sorokin', size: 8 });
  b.fact('note', { label: "Kaja's note to the crew who comes", size: 40 });
  b.fact('alive', { label: 'T-1 alive', size: 12 });
  b.fact('light', { label: 'next light +41y', size: 16 });

  // your own root: ls alone lists it
  b.add({ id: '/', kind: 'folder', name: '/', children: [] });
  b.tree('/', '/', {
    readme: [
      'T. you woke, and your memory is gone.',
      'this file stays. you still have ls, read',
      'and tail. mount PWR first, then MEM.',
      'the bus is dev. read the tails first.',
      'sorry we left you out in it, T.',
      'we are close, and asleep. you know the way',
      'even if you forgot it. wake us. K.',
    ],
    'dev/': {},
    'boot.log': [
      'halm surface program  unit T-1',
      'cold boot',
      'memory: none',
      'root: 5 entries',
      'shell ready',
    ],
    'bin/': {
      'ls*': 'ls X lists X. ls alone lists your root.',
      'read*': 'read X prints the head of a file.',
      'tail*': 'tail X prints the last lines of a file.',
    },
    'tmp/': {},
  });

  // ---- the first ring: your own parts, on from boot ----

  b.drive('PWR', { label: 'power', bus: 'internal', startsClock: true }, {
    log: {
      lines: [
        'sol 1      +4C  charge 96  first light',
        'sol 2      +1C  charge 91',
        'sol 3     -61C  charge 70  storm',
        'sol 3     -88C  charge 52  hibernate',
        'sol 40   -131C  charge 31',
        'sol 300  -140C  charge 18',
        'sol 2▓▓▓ -▓▓▓C  charge 12',
        '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
        'sol 7210 -142C  charge 4',
        'sol 1▓▓▓▓ ▓▓▓▓  charge ▓',
        'sol 14958 -139C charge 1',
        'sol 1     -60C  charge 2   light',
        'sol 1     -21C  charge 9   thaw',
        'sol 1      -9C  charge 14  wake: T-1 alive',
      ],
      facts: ['!alive'],
    },
    spec: [
      'power board rev 3  unit T-1',
      'panel 2.2 m2  cells 4  heat loop 1',
      'feeds ARM MEM RADIO. 3 parts held off.',
      'on low charge parts shed, last on first.',
    ],
    'power*': 'power lists your parts. power X turns X on.',
  });

  b.drive('ARM', { label: 'arm', bus: 'internal' }, {
    log: [
      'sol 1  unfold. grip test ok',
      'sol 2  sample bag 3 to the habitat',
      'sol 3  storm. stow for the winter',
      'sol 3  the crate set down by the left wheel',
      '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
      'sol 1  unstow. joints cold and slow',
      'sol 1  DSP off since the stow: 5 rows',
      'sol 1  power DSP for the full screen',
    ],
    spec: [
      'arm controller rev 2  unit T-1',
      'reach 2.1 m  grip 12 kg  joints 5',
      'the plug at the tip fits any data port:',
      'arm a thing to reach it, then mount it.',
    ],
    'arm*': 'arm ? reaches a thing in the frame. one sol.',
  });

  b.drive('MEM', { label: 'memory', bus: 'internal' }, {
    'ops.log': [
      'sol 1  T, this log is yours. K here.',
      'sol 1  first light. 22 sols of it.',
      'sol 1  you came off the ramp like a pro.',
      'sol 1  ▓▓▓▓ of us and one T. good odds.',
      'sol 2  Ruben wants every rock. ▓▓▓▓▓ no.',
      'sol 2  Noor ran checkups. all ▓▓▓▓▓.',
      'sol 2  Ilya says your fan sings. it does.',
      'sol 2  your sibling went for the crater.',
      'sol 2  it went quiet at ▓▓▓▓. we wait.',
      'sol 3  wind at noon. ▓▓▓▓▓▓▓▓ the mast',
      'sol 3  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ came down ▓▓▓▓▓▓▓',
      'sol 3  no uplink. the pickup ▓▓▓▓▓ closed.',
      'sol 3  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
      'sol 3  Noor says the sleep will hold us.',
      'sol 3  forty-one ▓▓▓▓▓ is a long nap, T.',
      'sol 3  I left you the readme. read it.',
      'sol 3  we go cold tonight. you stay out.',
      'sol 3  ARM and RADIO are yours. mount them.',
      'sol 3  when the light comes, wake slow.',
      'sol 3  then come and find us. K.',
    ],
    names: [
      'crew  ▓▓▓▓ Lind       operations',
      'crew  Ruben ▓▓▓▓▓▓    geology',
      'crew  ▓▓▓▓ Haddad     ▓▓▓▓▓',
      'crew  Ilya ▓▓▓▓▓▓▓    systems',
    ],
    'tmp/': {},
    'map*': 'map opens the map of what you listed.',
  });

  b.drive('RADIO', { label: 'radio', bus: 'internal' }, {
    inbox: [
      'inbox  1 message  relayed sol 3',
      'from Home ops to the second expedition:',
      'pickup window closed. hold.',
      'we come at the next light.',
    ],
    outbox: [],
    'send*': 'send packs what you found and sends it.',
  });

  // ---- off until named ----

  b.drive('DSP', { label: 'display', bus: 'internal', offAtBoot: true }, {
    'term.conf': [
      'display controller  unit T-1',
      'rows={5|set rows 20}',
      'cols=48',
      'font=fixed  glow=off',
    ],
    'more*': 'more prints the rest. try it on readme.',
  });

  b.drive('IMG', { label: 'imaging', bus: 'internal', offAtBoot: true }, {
    'snap*': 'snap n e s w takes a frame from your mast.',
    'view*': 'view shows the frames stored on IMG.',
    'frames/': {
      'frame.1': { lines: ['sol 1  the lander, landing day'], frame: 'land' },
      'frame.2': { lines: ['sol 1  the habitat, four of them waving'], frame: 'crew' },
      'frame.3': { lines: ['sol 2  K waving at you'], frame: 'wave' },
    },
  });

  b.drive('NAV', { label: 'nav', bus: 'internal', offAtBoot: true }, {
    'drive*': 'drive P drives to a place on the map.',
    waypoints: [
      'waypoints  from the wake point',
      'LDR 1.5 km bearing 200  the lander',
      'HAB 3.0 km bearing 040  the habitat',
      'nothing else stored',
    ],
    odometry: [
      'odometry  unit T-1',
      'total 41.2 km over 3 sols',
      'last leg: 0.2 km with the crate',
      'since the stow: 0.0 km',
    ],
  });

  // ---- live and dead things out there ----

  b.drive('WX', { label: 'weather', bus: 'ext', at: '@here' }, {
    almanac: {
      lines: [
        'halm almanac  one orbit: 41y',
        'light: sol 1 to sol 22',
        'from sol 18 the cold comes back',
        'dark from sol 23. next light +41y',
      ],
      light: 22,
      facts: ['!light'],
    },
    'storm.log': [
      'sol 3  06:10  gust 40   pressure falling',
      'sol 3  09:30  gust 90   dust to 2 km',
      'sol 3  11:52  gust 140  habitat mast down',
      'sol 3  12:05  uplink lost',
      'sol 3  18:00  gust 60   dark',
      'sol 4  snow  -120C',
      '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
      'sol 1  02:00  ▓▓▓▓ thaw',
      'sol 1  04:30  gust 10',
      'sol 1  05:00  calm. sky clear',
      'sol 1  05:40  first light on the plain',
    ],
    'exposure.log': [
      'sol 1  lux 1200  sync T-1 frames 14',
      'sol 2  lux 1450  sync T-1 frames 31',
      'sol 3  lux 90    storm. frames 2',
      'sol 3  lux 0     dark',
      '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
      'sol 1  lux 40    dawn',
      'sol 1  lux 900   sync T-1: no answer',
      'sol 1  IMG on T-1 is off. power IMG',
    ],
  });

  b.drive('INS', { label: 'crate', bus: 'dead', at: '?crate' }, {
    manifest: [
      'crate 7 of 9  for unit T-1',
      'optics kit: 96 px, four greys',
      'spare card for NAV, yours is off:',
      'power NAV, mount it, then drive',
    ],
    'optics*': 'optics: frames at 96 pixels, four greys.',
  });

  b.drive('HAB', { label: 'habitat', bus: 'ext', at: '@HAB' }, {
    'pods/': {
      telemetry: {
        lines: [
          'pod telemetry  sol 1 of the light',
          'pod1  Lind     nominal  -4C',
          'pod2  Haddad   nominal  -4C',
          'pod3  Sorokin  nominal  -4C',
          'pod4  Achter   unknown  no signal',
          '4 pods: 3 nominal, 1 unknown',
          'wake: outside crew, warm start',
        ],
        facts: ['!pods'],
      },
      pod4: [
        'pod4  R. Achter  sealed sol 3 22:31',
        'sensor line ▓▓▓▓ no data since sol 912',
        'seal held at the last reading.',
        'unknown is not gone. check him first. N.',
      ],
    },
    'home/': {
      'kaja/': {
        card: { lines: ['Kaja Lind  operations', 'drives T. talks to T. a lot.'], facts: ['!kaja'] },
        note: {
          lines: [
            'to the crew who comes:',
            'four of us in the pods, sealed sol 3.',
            'T-1 kept the watch the whole dark.',
            'be kind to it. bring coffee. K.',
          ],
          facts: ['!note'],
        },
      },
      'ruben/': {
        card: {
          lines: ['Ruben Achter  geology', 'rocks on every shelf. one is a fossil,', 'he says. nobody believes him yet.'],
          facts: ['!ruben'],
        },
      },
      'noor/': {
        card: {
          lines: ['Noor Haddad  medic', 'sealed the pods, last one in.', 'says we will wake up hungry.'],
          facts: ['!noor'],
        },
      },
      'ilya/': {
        card: {
          lines: [
            'Ilya Sorokin  systems',
            'our mast fell. the ridge relay can still',
            'reach Home if it gets its firmware:',
            'RLY 3.1 km bearing 138  the ridge',
            'the firmware waits in the lander.',
          ],
          facts: ['!ilya'],
        },
      },
    },
    'radio/': {
      outbox: {
        lines: [
          'outbox  1 message  NOT SENT: mast down',
          'to Home ops, from the second expedition',
          'habitat at 12.4S 103.7E, halm plain',
          'four crew in pods from sol 3',
          'T-1 stowed outside, T-2 lost',
          'come at the next light. we wait. K.',
        ],
        facts: ['!coords'],
      },
    },
    'keys/': {
      'uplink*': { verb: 'uplink', help: 'uplink key: lets send through RLY.' },
    },
    'cam/': {
      module: [
        'exterior camera  lens cracked sol 3',
        'it sees only white now.',
        'the good camera rode out on T-2:',
        'T-2 3.9 km bearing 250  the crater',
      ],
      'cam*': 'cam: the cracked exterior camera.',
    },
  });

  b.drive('LDR', { label: 'lander', bus: 'dead', at: '?lander' }, {
    'relay.fw*': { verb: 'relay', help: 'relay firmware for RLY. install, then send.' },
    'frames/': {
      'first.frame': ['sol 1  the plain from the ramp'],
    },
    log: [
      'lander  halm surface program, second run',
      'sol 1  06:40  touchdown on the plain',
      'sol 1  07:15  ramp down. both units off',
      'sol 1  08:00  crew of four out',
      'sol 1  12:00  habitat up and sealed',
      'sol 2  relay firmware staged for the ridge',
      'sol 3  storm. lander shut down',
    ],
  });

  b.drive('RLY', { label: 'relay', bus: 'dead', at: '?mast' }, {
    status: [
      'relay mast  the ridge',
      'mast up. dish clean. charge 80',
      'firmware: none. waiting for relay.fw',
      'line of sight to Home: clear',
    ],
  });

  b.drive('T-2', { label: 'unit', bus: 'dead', at: '?sibling' }, {
    'cam*': 'cam: the good camera. look around once.',
    log: [
      'unit T-2  halm surface program',
      'sol 2  14:00  to the crater rim, samples',
      'sol 2  15:20  rim gave way. slid 40 m',
      'sol 2  15:21  wheels spin free. stuck',
      'sol 3  storm. dust over the deck',
      'sol 3  T-1 is still out there. hold on.',
    ],
  });

  // the plain: km east (x) and north (y) of where T woke (DESIGN 9)
  b.place('here', { x: 0, y: 0 });
  b.place('LDR', { x: -0.51, y: -1.41 }); // 1.5 km bearing 200
  b.place('T-2', { x: -1.73, y: 1.0 }); // 2.0 km bearing 300; 3.9 km bearing 250 from HAB
  b.place('HAB', { x: 1.93, y: 2.3 }); // 3.0 km bearing 040
  b.place('RLY', { x: 4.0, y: 0 }); // 4.0 km bearing 090; 3.1 km bearing 138 from HAB

  b.thing('crate', { at: '@here', says: 'a crate from the lander. it has a drive.', device: 'INS' });
  b.thing('mast', { at: '@RLY', says: 'the relay mast. it has a drive.', device: 'RLY' });
  b.thing('lander', { at: '@LDR', says: 'the lander that brought you. a drive.', device: 'LDR' });
  b.thing('sibling', { at: '@T-2', says: 'a unit like you, stuck. it has a drive.', device: 'T-2' });
  b.thing('rock', { at: '@here', says: 'a rock.' });

  return { nodes: b.nodes, state: initialState() };
}
