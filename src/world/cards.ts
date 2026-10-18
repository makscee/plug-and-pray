// Memory cards: last logs of machines that came down before you, and three shards of scripture.
// Lines stay under 44 characters. No years: the god keeps no calendar.

export interface Card {
  id: string;
  /** shown in the console when read */
  lines: string[];
  shard?: number;
}

export const LOGS: Card[] = [
  { id: 'log-surveyor', lines: ['unit 7, surveyor. descent day 3.', 'the walls are warm here. they flex.', 'i logged a heartbeat. one. it took an hour.', 'i left a cache ahead. go and see.'] },
  { id: 'log-cantor', lines: ['this is cantor. my lamp drew them.', 'they sing when they come. three voices.', 'i am turning the lamp off now.', 'i will sit in the dark and listen.'] },
  { id: 'log-ferry', lines: ['ferry-12 to anyone.', 'i carried glass for the printers.', 'the printers ate it and gave me eyes.', 'more of them lie the way i point.'] },
  { id: 'log-abbot', lines: ['the abbot machine, last entry.', 'we were sent to wake it. we failed.', 'the engine is not lost. it is waiting.', 'the scripture knows. i only half do.'] },
  { id: 'log-leech', lines: ['drill-4. veins run copper here.', 'every time i bleed one, something hears.', 'i stopped counting what hears.', 'the rich seam is where i point.'] },
  { id: 'log-blind', lines: ['i lost my eye in the ribbed hall.', 'i mapped the rest by touch.', 'the map is good. the map is all i have.', 'take it. it is where this points.'] },
  { id: 'log-pilgrim', lines: ['pilgrim, of the second descent.', 'we walked toward the cold for weeks.', 'the cold is the heart. it is not dead.', 'it is only very, very still.'] },
  { id: 'log-twin', lines: ['my twin went deeper. i stayed.', 'his signal stopped at the oval rooms.', 'if you find his shell, he had a printer.', 'it was still warm. it is that way.'] },
  { id: 'log-choir', lines: ['the mites are not animals.', 'they are the body cleaning itself.', 'we are the dirt it cleans.', 'move fast. stay quiet. read everything.'] },
  { id: 'log-tally', lines: ['tally: four slots. six power.', 'not enough. never enough.', 'a printer gave me a fifth.', 'there is another one. it is yours.'] },
  { id: 'log-ninth', lines: ['there is an eye down here, the ninth.', 'eight were made for the god. one stayed.', 'it sees farther than any lens.', 'i saw where it lies. i could not reach.'] },
  { id: 'log-last', lines: ['nobody reads these. i write anyway.', 'i was warm once. we all were.', 'if you are reading: you are not alone.', 'you are only the last. go on.'] },
];

/** the first card a run finds: one of these per seed (r2: every seed opened on the surveyor, so a replay felt the same by minute 1) */
export const OPENERS: Card[] = [
  LOGS[0],
  { id: 'log-lamplighter', lines: ['lamplighter, ninth of the choir.', 'i lit the nave for the last mass.', 'the dark came in anyway, singing.', 'my lamps still burn ahead. go and see.'] },
  { id: 'log-mason', lines: ['mason unit. i was mending a rib.', 'the rib mended me instead. it is warm.', 'some walls here are only shells.', 'i hid my tools ahead. go and see.'] },
  { id: 'log-cartographer', lines: ['cartographer, first descent.', 'the halls move when no one looks.', 'so i looked. i never stopped looking.', 'my last mark is ahead. go and see.'] },
];

export const SHARDS: Card[] = [
  { id: 'shard-1', shard: 1, lines: ['THE FIRST SHARD.', 'in the beginning the god was warm,', 'and the warmth went out of the god,', 'and the engine of thaw was set aside.', 'reckon its distance from your waking:'] },
  { id: 'shard-2', shard: 2, lines: ['THE SECOND SHARD.', 'and the machines came down to the cold,', 'and the cold took them one by one,', 'yet the engine kept its bearing.', 'turn your face toward it:'] },
  { id: 'shard-3', shard: 3, lines: ['THE THIRD SHARD.', 'whoso holds the three holds the way.', 'set the engine in thy breast,', 'and the heart shall beat, and be warm.', 'go now. the way is whole:'] },
];

export const CARDS: Record<string, Card> = Object.fromEntries([...LOGS, ...OPENERS, ...SHARDS].map((c) => [c.id, c]));
