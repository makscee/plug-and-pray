# Modules: situations, answers, costs

Maks, playtest 4 (10-18): many modules had no use ("the bat one is cool but I already have a coloured
camera, so why would I need it"). Everything cost 1 power, so power and slots ran out together and a
generator was never worth a slot. Nothing called for a choice.

## What the good loadout games do

- **FTL:** one reactor feeds every system. You never have enough, so you move power mid-fight: shields
  up, the medbay off. A system without power is dead weight, and that gives every system a moment.
- **Cogmind:** parts fill slots by type, and every part draws energy and adds heat and mass. You carry
  spares and swap them when the situation changes: sensors to explore, armour and guns to fight,
  propulsion to flee. A part is good *for* something, never good in general.
- **Noita / wands:** every upgrade trades something away (speed for damage, spread for range), so
  "better" depends on what you meet next.
- **Barony:** what you see is a resource. Light, darkness and invisible foes make sight a choice.

The shared rule: **each part answers a situation and costs something you also want.** In thaw that
gives three rules.

1. **Power binds before slots.** The core starts at 4. Most good modules draw 2–3, so a typical
   loadout wants about 1.5× what the core gives. A generator trades a slot for power, and the
   motherboard has room for one or two. You cannot run your explore setup and your battle setup
   together, so `save setup explore`, `save setup battle` and `setup <name>` are how you play.
   Switching has a warm-up, so you switch *before* the fight.
2. **Seeing is a mechanic, not a picture.** Auto weapons strike only what you can perceive, except
   bare touch (an adjacent foe you can see, or one that hits you). The ossuary is dark: colour eyes
   see only as far as your light reaches. The hum is hidden: only sonar, heat or a listening scanner
   find it. The furnace is all heat: a heat eye washes out there. Walkers are cold bone, so a heat
   eye never sees them. What each eye draws on screen matches what it lets you hit.
3. **Every module has a drawback.** Each one either draws power, is loud (things notice you farther
   off), is blind somewhere, or costs you something elsewhere.

## Situations × answers

| situation | where | what it asks | best answers (cost) |
|---|---|---|---|
| first steps, blind | cradle | any sight, legs | pinhole eye (0 pwr, 24 px grey), stepper relay (1) |
| reading the room in colour | cradle, nave | a clear eye | dawn eye (2), vidicon tube (1, smeary), saint's lens (4) |
| swarms of mites | nave | hit many at once | choir bell (2, rings everything in 2.4), censer flail (2, sweep and warmth), thorn mantle (1) |
| seraph lamps down a line | nave, ossuary | reach them or dodge | rivet sling (1, auto 4 cells, needs an eye), nail psalm (1, aimed), clock of hours (2, foresight), gyro heart (2) |
| mimics | nave on | know before you reach | lodestone (1, wakes them at 8 cells), bat psalter (sonar wakes them in its range) |
| **dark** | ossuary | sight without light | bat psalter (2, sonar, loud), lattice eye (3, outlines, full range in the dark), carrion eye (1, needs half the light), or a lamp plus a colour eye |
| **cold**: no mending | ossuary | warmth | any lamp (halo 1, censer of embers 1, cold star 2), censer flail (its glow), lead lung (mends at half) |
| the hum: hidden | ossuary, furnace | find it | bat psalter, ember iris (2, heat), bone-listener (1), heat choir (1); aimed nails hit it blind |
| armour: walkers, the abbot | ossuary | big single hits | bone lance (2, 5 dmg aimed), reliquary saw (3), heat lance (3); fast weak weapons lose most of each hit |
| **heat**: the furnace sears | furnace | keep it off | rime hood (1, all of it, but it chills you anywhere else) |
| furnace sight | furnace | not a heat eye | colour or edge eyes (the furnace is bright); ember iris sees almost nothing there |
| elites | each zone's shard | burst and staying power | heat lance, overclock coil (3, loud), mirror ward (2), suture moth (1), ossuary plate (2) |
| getting lost | anywhere | the way back and the way on | map spool (1), survey spool (2), conduit dowser (1, maps passages through walls), drowned compass (0), waystone log (1), pilots |
| long hauls | late | walk without typing | wayfinder moth (1), psalm of roads (2, steers round foes), sleepwalker (0, slow) |
| resources run short | anywhere | more per kill or vein | tithe ledger (1, kills drop twice as often), leech needle (1, loud) / bone auger (2, louder), marrow rod (1, finds veins) |
| low hp, retreat | anywhere | mend fast | lead lung (1), suture moth (1), reliquary ribs (1, +5 max hp) |
| power short | always | more power for a slot | ember cell (+2), votive battery (+3), heart-shard (+5, but loud: it beats) |

## Power curve

- **Start:** core 4 and 6 slots. Your kit draws pinhole 0, stepper 1, map 1 and spark finger 1, for 3
  of 4 power.
- **The dawn eye (2)** one chunk east is the first choice. Run it instead of the pinhole and you are
  at 5 of 4 power, so something goes off or you find an ember cell (+2 for a slot).
- **Altars** add core power (+1, prices climbing steeply, up to 9) and max hp. **Printers** add slots, up to 8.
- **By the ossuary** a careful loadout wants: an eye that sees in the dark (2–3), legs (1), a map (1),
  a lamp or warmth (1–2), two weapons (3–4), a body module (1–2). That is 9–13 power on 7–8 slots,
  with a core of 6–8. One or two generators fill that gap, and setups switch the rest.
- **The furnace** swaps the lamp and the dark eye for a rime hood and a colour or edge eye.

## Weapons: damage per power, and each one's job (r1 econ)

Walkers and the bone abbot wear bone armour 1.2: each hit loses 1.2, and never drops below a fifth of itself
(`strike` in src/core/game.ts). Small fast hits lose almost everything, so "which weapon" becomes "against what".

| weapon | power | dps | dps per power | vs armour 1.2, per power | its job |
|---|---|---|---|---|---|
| nail psalm (t0, aimed) | 1 | 1.67 | 1.67 | 0.33 | the cheap reach: seraph lamps down their line, mites, the hum blind. Useless on bone. |
| spark finger (t0, auto) | 1 | 0.83 | 0.83 | 0.17 | the free bite: mites that reach you, no aiming |
| rivet sling (t0, auto) | 1 | 0.63 | 0.63 | 0.13 | bites at 4 cells on its own: lamps you can see, mites before they bite |
| ember spit (t1, aimed) | 2 | 2.29 | 1.14 | 0.23 | burst against soft things: the warden, mimics |
| bone lance (t1, aimed) | 2 | 2.73 | 1.36 | 1.09 | **the armour answer**: walkers and the abbot |
| choir bell / censer flail (t1, auto, sweep) | 2 | 0.94 / 1.0 per foe | 0.47 / 0.5 per foe | 0.1 | swarms: every mite in reach at once; the flail also warms you in the ossuary |
| reliquary saw (t2, auto) | 3 | 3.33 | 1.11 | 0.67 | hands-free close fighting that still cuts bone |
| heat lance (t2, aimed) | 3 | 3.89 | 1.30 | 1.07 | elites: big hits at 8 cells, through armour |

Was: the nail psalm did 2.5 dps per power and 1.75 against armour, the best everywhere, so it stacked
(18 of 24 winning loadouts). Now it is cheap reach and nothing more.

## Rolls and attunes

A find's roll and an altar's attune move one number its **better** way (src/world/spawn.ts `BETTER`):
attuned is ×1.4 for damage, range, radius, hp and the like, and ×0.7 for cooldown, recharge, noise, lag, blur,
refresh and loud; cracked goes the other way. Picture-only numbers (res, fps, colours) never roll. An altar
attunes a weapon's damage, an eye's **range** (a real buy in the dark), a lamp's radius, and otherwise the first
number that rolls (the mirror ward's recharge gets shorter). `test/econ.test.ts` checks every module and key.

## Copper, power and the late sink (r1 econ)

- **Copper early.** You wake with 2 copper; recycling a tier-0 module gives 1 bone and 1 copper; the reliquary by
  the start prices its first relic in bone and glass only. So the first shop is a pick, not a locked door.
  Later prices lean on copper instead of glass (prints, slots, power), since recycling now pays it.
- **Power binds.** The core grows to 9 at altars (was 12), each point dearer than the last (4b 2g, then 6b 3g 1c,
  8b 4g 2c, 10b 5g 3c 1i, 12b 6g 4c 2i). Past that, power comes from generators, which take a slot, and the
  shop charges a copper and a glass more for them; the votive battery whispers (loud 1). So a generator is a
  slot and a price for power, and two setups (explore, battle) are how a full kit runs.
- **The late sink: temper (option B).** At an altar an attuned module can be tempered up to three times: its
  rolled number moves another step each time (×1.2, or ×0.85 for a number that is better low), so a weapon you
  lean on reaches about ×2.4 damage. Each temper costs more: bone 2t+k, glass k, copper 3t+3k, ichor k (t = tier+1,
  k = the temper's number). Copper carries it because recycling pays copper all run. Deeper rings (3.5 chunks out)
  hold more altars (35% of chunks, was 20%), so there is somewhere to spend. Picked over Balatro-style pacts (option A) because it is one verb in src/world/altar.ts,
  reads the same as attune, and makes the late game a choice of *which* module to invest in (the one your
  build leans on), while pacts would touch power, weapons and regen rules across slices on the deadline day.
- **Regen.** No mending until 6 s after the last hit, then a quick 0.5 hp/s (was 0.2 after 4 s). A fight's
  damage stays with you through the fight, but a rest is short. The ossuary's cold still stops it without light
  (the lead lung, 0.3, still mends at half there).
- **Armoured foes** have a little less hp to make up for armour 1.2: walker 5 (was 6), the bone abbot 13 (was 16).
- **Zone entry** names the carried modules that answer the zone as install buttons (src/world/zones.ts `answers`):
  the ossuary lists lamps, glowing, sonar, edge and heat eyes, listeners, big-hit weapons, armour and regen; the
  furnace lists heat-proofing, or says that a rime hood would.

Sims (`node scripts/sim.mjs 20 both`, 40 runs) before → after: finish 24 → 27, median Engine 24:42 → 22:33,
power binding (power alone or with slots) 21% → 42%, slots alone 1% → 0%; nail psalms per end loadout 1.6 → 1.2 (it stays the lamp answer), bone lance in end loadouts 20–38% → 45–75%.
