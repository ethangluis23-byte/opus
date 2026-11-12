# Storyboard — The Last Pets on Earth (10 scenes x 60 s)

Director's shot list. Every shot names its location (set), light, action, camera, on-screen graphics and sound.
Timing is anchored to narration lines (`film/script.json`): a shot that "covers 3.3" starts about 0.35 s before
`nar.rel('3.3')` and runs until the next shot starts. Never hard-code times that depend on narration.

## Rules for every scene

- Exactly 60 s (`at` from 0 to 60). A visual change (cut or a clear reframing) every 5–8 s; never a static frame:
  cameras always drift, push or track; animals always act (walk, sniff, look, eat, play, hunt) and stay alive between
  actions (breathing, blinking, ears, tails).
- Vary shot sizes inside a scene: wide establishing, medium interaction, close-up on a face, an occasional extreme
  close-up or high/low angle. Do not repeat a composition.
- Scenes 2–9 open on an establishing shot with the era title via `eraTitle(g, t, 'x YEARS LATER', sub)` and
  `trans: { type: 'flash', dur: 0.7 }` (the previous scene ended in a white flash). Narration starts about 3.2 s in.
- Scenes 2–8 end with a `timeJump({...})` shot from `src/film/common.js` at `at: 56.6` (narration is over by 56.2).
- `pill` (time marker, top left): scene 1 `TODAY` then `DAY 0` after the vanish; scene 2 `+1 HOUR` … `+24 HOURS`
  (advance it shot by shot); then `+7 DAYS`, `+1 YEAR`, `+5 YEARS`, `+20 YEARS`, `+50 YEARS`, `+100 YEARS`, `+200 YEARS`.
- Graphics: use only the callout texts written here (they are fact-checked). Callouts animate in with `p` and should
  sit over calm areas, never over a face or the captions (keep y between 110 and 880).
- Character continuity: the hero dog is `DOGS.golden` (red collar) for scenes 1–3, collar still on but dirty in 4,
  then descendants `golden20` (scenes 5–6), `golden50` (7), `golden200` (8–10). Hero cat `orange` → `orange20/50/200`.
  Hero rabbit `sandy` → `sandy20/50/200`. Hero parrot `macaw` (with `age` rising through scene 6).
- No on-screen violence: hunts cut away or the prey escapes; standoffs end in retreat.
- Sound: give every shot a `bed` (ambience) and add `sfx` cues for visible actions (see the vocabulary in GUIDE.md).
  Risers/booms at scene boundaries are added automatically.
- After `g.grade(look)` add emissive effects (light shafts, glows, eye shine, fireflies), then UI.

---

## Scene 1 — THE DAY HUMANS DISAPPEARED (0:00–1:00)   pill `TODAY`, then `DAY 0`

Lines 1.1 1.2 1.3 1.4a | vanish at exactly 24.0 | 1.4b 1.5 1.6 1.7 1.8 1.9. Export `markers = { vanish: 24.0, main_title: 55.2 }`.

1. `s01_city` (0 → 1.2 start) — skylineSet, years 0, bright afternoon (`day`), power on. Slow push-in over the living city;
   birds wheel, clouds drift. Graphic: `topLines(c, 'WHAT IF ALL HUMANS', 'SUDDENLY DISAPPEARED?')` from 1.0 s, fading
   out with the shot. Bed `city_alive`.
2. `s01_fetch` (covers 1.2, first half) — parkSet, years 0: the boy throws a ball (`throw`), the golden retriever
   sprints, leaps and catches it; mom waves from a bench; another dog on a leash passes behind. Camera tracks the dog.
   Sfx: `dog_bark` (happy), `ball_bounce`.
3. `s01_sofa` (1.2 second half) — apartmentSet, day, lamp off: the orange cat curled asleep on the sofa in a sunbeam;
   slow push-in; tail tip flicks; dust motes. Sfx `cat_purr`. Bed `room_tone`.
4. `s01_parrot` (covers "We feed them.") — apartment by the window: the macaw on its stand takes a seed from grandma's
   hand and bobs happily. Sfx `parrot_squawk` (soft).
5. `s01_rabbit` ("We protect them.") — petRoomSet close on the hutch: the sandy rabbit nibbling a carrot the girl
   holds out. Sfx `munch`.
6. `s01_hamster` ("We give them names, and a place on the sofa.") — close on the hamster sprinting in its wheel while
   the guinea pig popcorns beside its food dish. Sfx `hamster_wheel`.
7. `s01_street` (covers 1.4a and 1.4b; about 20.0 → 28.4; ONE continuous shot) — streetSet, years 0, traffic 1: an
   ordinary afternoon — walkers with dogs on leashes (retriever with the boy near the hero door, a beagle, a terrier),
   a jogger, a cyclist, café customers, moving cars. At T = 24.0 every human `vanish`es (0 → 1 over about 0.9 s,
   `drawVanishFx` after the grade); leashes drop, the ball bounces away, a cup falls, cars roll to a stop (one nudges a
   lamp post), the dogs look around, confused. Pill switches to `DAY 0` at the vanish. Bed `city_alive` cut dead at 24.0
   (`bedCut`), then `wind_street` from 24.6. Sfx: `vanish` at 24.0, `ball_bounce`, `car_engine_die`, one `dog_whine`.
8. `s01_empty` (covers 1.5) — two images: streetSet wide with abandoned cars and a traffic light changing for nobody
   (`traffic_light_click`), then skylineSet at late afternoon turning `golden`: not a soul, only birds. Bed `wind_street`.
9. `s01_door` (covers 1.6) — apartmentSet, golden light: the retriever sits facing the front door, tail thumping
   slowly, his plush teddy beside the dog bed; ears lift at a sound; slow push-in to his hopeful face; he tilts his
   head. Sfx `dog_whine` (soft). Bed `room_tone` with clock.
10. `s01_cat` (covers 1.7) — apartment, wide pan following the orange cat from room to room (walk), up onto the
    coffee table, looking around, a questioning `cat_meow`.
11. `s01_parrot2` (covers 1.8) — close on the macaw on its perch by the window as the light fades: speech bubbles
    `HELLO!` … `GOOD BOY!` … then a small, uncertain `HELLO?` (sfx `parrot_talk` ids `p_hello`, `p_goodboy`,
    `p_hello_q`); nobody answers; it shuffles and looks toward the door.
12. `s01_title` (covers 1.9; starts about 54.2) — pull back out through the window to the skyline at dusk (`dusk`,
    windows still lit). Main title lockup: `THE LAST PETS` / `ON EARTH` (bigTitle with sub) landing at 55.2
    (sfx `boom` at 55.2). Hold to 60.

## Scene 2 — THE FIRST 24 HOURS (1:00–2:00)   pill `+1 HOUR` → `+3 HOURS` → `+9 HOURS` → `+18 HOURS` → `+24 HOURS`

Lines 2.1–2.7.

1. `s02_title` (0–3.3) — streetSet at dusk, abandoned cars, lit windows; eraTitle `THE FIRST 24 HOURS`, sub
   `NOBODY IS COMING HOME`. Trans: fade 0.8 (no white flash into this scene).
2. `s02_wait` (covers 2.1) — apartment, evening, lamp and TV still on: retriever lying by the door (head on paws,
   eyes following small sounds), cat loafing on the sofa, wall clock ticking. Slow lateral drift. Bed `room_tone` clock.
3. `s02_bowl` (2.2 first sentence) — close-up of the empty bowls: the cat sniffs, taps the bowl with a paw, looks up
   and meows; the dog's nose pushes in. Callout: `EMPTY SINCE THIS MORNING`.
4. `s02_grid` (2.2 second sentence) — skylineSet night, all windows lit; one district flickers and drops out.
   Callout: `POWER STATIONS: UNATTENDED`. Sfx `electric_flicker`.
5. `s02_earth` (2.3 first sentence) — `earthSet` (src/sets/space.js): the night side of Earth; `lit` falls 1 → 0.1,
   cities winking out in waves; slow push-in. Callout: `GRIDS FAILING`. Bed `space`. Sfx `power_down_big`.
6. `s02_feeder` (2.3 second sentence) — apartment in the dark (power off, moonlight): close on the automatic feeder;
   its LED blinks twice and dies (`feeder_beep`, `feeder_power_down`); the cat's eyes shine behind it. Bed `room_dead`.
7. `s02_scratch` (2.4 first sentence) — the retriever up on his hind legs scratching at the front door (`pose: 'up'`,
   animate `paw`), whining, then barking; moonlit panes; fresh scratch marks. Sfx `door_scratch`, `dog_whine`, `dog_bark`.
8. `s02_hall` (2.4 second sentence) — hallwaySet, power failing: slow dolly down the empty corridor; `soundArcs`
   pulse from behind several doors. Sfx `dog_bark` x3 with dist 0.6–0.9 and different pans.
9. `s02_window` (covers 2.5) — apartment: the cat hops from sofa back to the sill, noses the window wider, becomes a
   silhouette against the moonlit city, looks back once, slips out onto the fire escape; then streetSet at night
   (no power) from outside: the cat trots down the fire escape. Sfx `cat_meow`, `paws`. Bed `night`.
10. `s02_cages` (covers 2.6) — petRoomSet at night, slow pan across the three enclosures with a moonlight shaft:
    hamster gripping and gnawing the bars, guinea pig calling, rabbit pushing at the hutch door. Close-up on the
    hamster's worried face. Callouts: `HAMSTER`, `GUINEA PIG`, `RABBIT`. Sfx `cage_rattle`, `scurry`.
11. `s02_latch` (covers 2.7) — extreme close-up on the hutch latch: not quite closed; the door creaks open a few
    centimetres and the rabbit's nose appears. Callout: `ONE OPEN DOOR`. Sfx `metal_creak`.
12. `s02_jump` (56.6) — timeJump from 1 day to 7 days on streetSet: `label: 'TIME WITHOUT HUMANS'`.

## Scene 3 — AFTER 7 DAYS (2:00–3:00)   pill `+7 DAYS`

1. `s03_title` — streetSet, 7 days, overcast morning: litter, dead traffic light; eraTitle `7 DAYS LATER`,
   sub `THE FIRST SURVIVORS`.
2. `s03_walk` (covers 3.1) — the retriever, collar on, a little dirty, walks warily along the empty street, sniffing,
   glancing up at windows; tracking shot. Bed `wind_street`. Sfx `paws`.
3. `s03_same` (covers 3.2) — parkSet, 7 days: a forgotten ball in the long grass; the retriever picks it up, drops
   it, waits for a throw that never comes; cut-in on the empty bench. Sfx `dog_whine`.
4. `s03_hunt` (covers 3.3) — alleySet at dusk: the orange cat crouched low (`mood: 'hunting'`), pupils wide, tail tip
   twitching; a mouse runs along the wall; pounce — cut on the leap. Callout: `HUNTING INSTINCT: INTACT`.
   Sfx `mouse_squeak`, `pounce`.
5. `s03_pack` (covers 3.4) — streetSet: dogs of different breeds meet nose to nose (golden, beagle, shepherd,
   terrier, pug), tails wagging stiffly, then trot off together; then alleySet: one tips a bin over for scraps.
   Callout: `FIRST PACKS FORM`. Sfx `dog_bark`, `sniff`, bin clatter (`metal_creak`).
6. `s03_rabbit` (covers 3.5) — parkSet: the sandy rabbit under a bush nibbling grass, ears swivelling; a shadow
   passes; it freezes and darts into cover. Sfx `grass_rustle`, `rabbit_thump`.
7. `s03_parrots` (covers 3.6) — rooftopSet, golden hour: the macaw flies in calling; two parakeets and an amazon join;
   the small mixed flock wheels and lands on a water tank. Callout: `ESCAPED PARROTS`. Sfx `parrot_squawk`, `wing_flaps`.
8. `s03_contrast` (covers 3.7) — a soft wipe from memory to now: the cat asleep on the sunny sofa (day 0) wipes to
   the same cat huddled under a parked car in night rain, eyes shining; then the retriever sheltering in the hero
   building's doorway, looking up at his own window. Bed `rain`. Sfx `thunder`.
9. `s03_night` — wide rainy night street; eye-shines in the dark; lightning silhouettes the skyline.
10. `s03_jump` (56.6) — timeJump 7 days → 1 year on streetSet.

## Scene 4 — AFTER 1 YEAR (3:00–4:00)   pill `+1 YEAR`

1. `s04_title` — streetSet, 1 year, clear morning: weeds, dusty cars, first vines; eraTitle `1 YEAR LATER`,
   sub `NATURE MOVES IN`.
2. `s04_meadow` (covers 4.1) — parkSet, 1 year: knee-high meadow, wild flowers, butterflies; slow pan. Bed `meadow`.
3. `s04_crack` ("Weeds split the asphalt.") — macro shot (parkingLotSet at zoom ~3, or your own macro drawing): a
   crack widens and a sprout unfurls in an in-shot time-lapse.
4. `s04_vines` ("Vines climb the walls.") — streetSet close on the café façade: ivy `cover` animating upward across
   the sign in an in-shot time-lapse.
5. `s04_lot` ("Young trees take root in empty parking lots.") — parkingLotSet, 1→3 years in-shot: saplings rise
   between faded bays and abandoned trolleys.
6. `s04_breeds` (4.3 up to "are struggling.") — streetSet: a pug and a dachshund panting, falling behind the pack.
   Callouts: `FLAT FACE · HARD TO BREATHE`, `SHORT LEGS · TOO SLOW`. Sfx `dog_pant`.
7. `s04_pack` (rest of 4.3) — the pack (golden, shepherd, mutt, husky) trotting together through the overgrown
   street, flushing pigeons, sharing a find. Callout: `MEDIUM · STURDY · SOCIAL`. Sfx `paws`, `dog_bark`.
8. `s04_cat` (covers 4.4) — rooftopSet at dusk: the orange cat alone, walking the parapet in silhouette, pausing to
   scan the street. Callout: `SOLITARY HUNTER`. Bed `wind_high`.
9. `s04_rabbits` (covers 4.5) — parkSet meadow: the sandy doe and a tumble of kits at a burrow mouth; then a small
   graphic row of rabbit icons multiplying. Callout: `ONE MOTHER · 30+ YOUNG A YEAR`.
10. `s04_colony` (covers 4.6) — rooftopSet, golden hour: dozens of parrots on antennas and the water tank, noisy,
    preening, a few nests. Sfx `parrot_flock`.
11. `s04_map` (covers 4.7) — `mapSet` (src/sets/space.js) with `mapPin`s. Callouts: `LONDON · RING-NECKED PARAKEETS`,
    `LOS ANGELES · RED-CROWNED PARROTS`. Slow drift across the map. Sfx `ui_pop` x2.
12. `s04_jump` (56.6) — timeJump 1 → 5 years on skylineSet.

## Scene 5 — AFTER 5 YEARS (4:00–5:00)   pill `+5 YEARS`

1. `s05_title` — skylineSet, 5 years, bright day, green creeping up the towers; eraTitle `5 YEARS LATER`,
   sub `THE CITY TURNS GREEN`.
2. `s05_decay` (covers 5.1) — three quick images on streetSet/apartment: water dripping through a ceiling
   (`water_drip`); a pane falling from a window and shattering (`glass_break`); saplings on a balcony and gutter.
3. `s05_food` (covers 5.2) — outside the wrecked pet shop: a shepherd-type dog guards a torn kibble bag, growling as
   two others circle. Sfx `dog_growl`.
4. `s05_patrol` (5.3 first sentence) — avenueSet, 5 years: the hero pack (golden20 lead) patrols down the avenue;
   overlay a small top-down block map with gold dashed territory borders. Callout: `PACK TERRITORY`.
5. `s05_standoff` (rest of 5.3) — streetSet intersection: two packs face each other, hackles up (`mood: 'angry'`),
   stiff tails, warning barks; low wide shot, then alternating close-ups of the two leaders; one pack turns away.
   Sfx `dog_growl`, `dog_bark` (urgency high), then calm.
6. `s05_stairs` (covers 5.4) — stairwellSet, 5 years: the orange cat (`orange20`) stalks down a flight through
   shafts of light; a tuxedo cat appears on the landing — arch and hiss — and retreats. Sfx `cat_hiss`. Bed `ruin_interior`.
7. `s05_warren` (covers 5.5) — warrenSet cutaway: rabbits digging, kits in the nest chamber. Callout:
   `WARREN · TUNNELS UP TO 3 M DEEP`.
8. `s05_nests` (covers 5.6) — rooftopSet: parrots squabbling over a nest hole in the water tank; far below, the dog
   pack trots past; a hawk's shadow crosses. Sfx `parrot_squawk`, `wing_flaps`, `hawk_cry`.
9. `s05_door` (covers 5.7) — apartmentSet, 5 years: dust, leaves, the empty dog bed and the plush teddy where it was
   left; slow push-in. Then outside: the ageing retriever line glances up at the building as the pack moves on.
   Bed `room_dead`.
10. `s05_jump` (56.6) — timeJump 5 → 20 years on streetSet.

## Scene 6 — AFTER 20 YEARS (5:00–6:00)   pill `+20 YEARS`

1. `s06_title` — streetSet, 20 years: trees through the pavement, cars as planters; eraTitle `20 YEARS LATER`,
   sub `A NEW GENERATION`.
2. `s06_pups` (covers 6.1) — a den under the collapsed café awning: golden20 puppies tumble out blinking, their
   mother watching. Callouts: `BORN WILD`, `HAS NEVER SEEN A HUMAN`. Sfx `puppy_yip`.
3. `s06_learn` (covers 6.2) — parkSet (young woodland): adults track nose-down, a pup copies and tumbles; the pack
   bursts into a chase after a deer that bounds away; then they meet a stag that lowers its antlers — pups scuttle
   back behind the adults. Sfx `sniff`, `paws`, `dog_bark`.
4. `s06_select` (covers 6.3) — meadow: a line of rabbits — white, black-and-white, grey, sandy; a hawk's shadow
   sweeps; `reticle`s snap onto the white ones (`EASY TO SPOT`); they scatter. Wipe to the colony years later: all
   earthy browns. Small bar graphic: `WHITE`, `PATCHED`, `BROWN` changing from year 1 to year 20 (no numbers).
   Callout: `NATURAL SELECTION`. Sfx `hawk_cry`, `rabbit_thump`.
5. `s06_leap` (covers 6.4) — ruinFloorsSet: the orange cat (`orange20`) runs and leaps a gap between broken slabs,
   lands lightly, trots on; camera follows. Sfx `pounce`.
6. `s06_nests` (covers 6.5) — three vignettes: a parakeet peering from a dead traffic-light housing; a stick nest on
   the faded `ADOPT A FRIEND` billboard; a nest in a letter of the broken `CAFÉ LUNA` sign.
7. `s06_oldparrot` (covers 6.6) — the old macaw (`age: 1`) alone on a balcony rail of the hero building at sunset;
   slow push-in. Callout: `HATCHED BEFORE THE HUMANS VANISHED`. It says `HELLO?` … `GOOD BOY!` (bubbles + `parrot_talk`);
   two wild-born parakeets tilt their heads; one answers with a small bubble `…ELLO?`.
8. `s06_wide` — the flock lifts into a dusk sky over the green city.
9. `s06_jump` (56.6) — timeJump 20 → 50 years on avenueSet.

## Scene 7 — AFTER 50 YEARS (6:00–7:00)   pill `+50 YEARS`

1. `s07_title` — avenueSet, 50 years, misty morning; eraTitle `50 YEARS LATER`, sub `GENERATION AFTER GENERATION`.
2. `s07_clock` (covers 7.1) — infographic on `spaceBackdrop`: a long bar `TIME DOGS HAVE LIVED WITH HUMANS · 15,000+ YEARS`
   with a tiny gold sliver at the end labelled `50 YEARS`. Heading: `NO NEW SPECIES`.
3. `s07_line` (covers 7.2) — the hero lineage in a row on `spaceBackdrop`: `golden` → `golden20` → `golden50`
   joined by gold arrows, labels `DAY 0`, `20 YEARS`, `50 YEARS`. Sub: `ABOUT 20 GENERATIONS`.
4. `s07_plains` (covers 7.3) — openLandSet, golden hour: a pack of big lean dogs (`wildBig`, `golden50`) at full run
   through tall grass after distant deer; fast tracking shot. Callout: `LEAN · STRONG · FAST`. Sfx `paws`, `dog_bark`.
5. `s07_ruins` (covers 7.4) — avenueSet/alleySet at twilight: small fox-like dogs (`wildSmall`) dart between rusted
   cars, freeze, sniff, slip through a gap. Callout: `SMALL · QUICK · WARY`.
6. `s07_blend` (covers 7.5) — infographic: medallions of pug, dachshund, husky, shepherd, beagle and golden flow
   along arrows into one central wild dog. Callouts: `UPRIGHT EARS`, `SLIM BUILD`, `SANDY COAT`.
7. `s07_cat` (covers 7.6) — split frame: the day-0 pet cat and its 50-year descendant side by side
   (`ALMOST UNCHANGED`); then the descendant stalks through ferns and pounces out of frame.
8. `s07_flock` (covers 7.7) — a great parrot flock streaming across a sunset sky above the green skyline
   (skylineSet, 50 years). Sfx `parrot_flock`.
9. `s07_hero` — the wild golden-line dog stands on a car roof on the overpass, wind in its coat, looking over the
   abandoned city at dusk (openLandSet or avenueSet). Slow push-in.
10. `s07_jump` (56.6) — timeJump 50 → 100 years on skylineSet.

## Scene 8 — AFTER 100 YEARS (7:00–8:00)   pill `+100 YEARS`

Export `markers = { photo_start, photo_end }` (absolute seconds): photo_start = start of shot 5 minus 1 s; photo_end = 477.

1. `s08_title` — skylineSet, 100 years, grand morning light; eraTitle `100 YEARS LATER`, sub `ALMOST UNRECOGNISABLE`.
2. `s08_bridge` (covers 8.1–8.2) — slow pan across the skyline: the bridge sags and a span drops into the river
   (`rumble_collapse`); hollow towers wrapped in green. Callouts: `STEEL · RUSTED THROUGH`, `GLASS · GONE`.
3. `s08_animals` (covers 8.3) — four short images: wild dogs trotting down avenueSet (100 years); a cat silhouetted
   on a rooftop ledge; rabbits grazing among ferns in the street; parrots calling from a tree.
4. `s08_climb` — streetSet, 100 years: the camera cranes up the vine-covered hero building to the 2nd-floor window
   and pushes through it. No narration; music thins. Bed `wind_street` → `ruin_interior`.
5. `s08_room` (covers 8.4) — apartmentSet, 100 years: slow dolly across the ruined living room — ferns, fallen shelf,
   light shafts, the door hanging open. Bed `ruin_interior`.
6. `s08_photo` (covers 8.5) — push in on the photograph (`drawPhoto`, age 1) on the floor among leaves; a light shaft
   crosses it; for two seconds its colours return (age → 0, sfx `shimmer`), then fade again.
7. `s08_dog` (covers 8.6) — a wild golden-line dog (`golden200`) pads in through the doorway, sniffs the air, passes
   the photo, stops, sniffs it, tilts its head, moves on. Sfx `paws`, `sniff`.
8. `s08_last` (covers 8.7) — close on the photo in the dust. Small graphic: `15,000+ YEARS TOGETHER`. Slow fade.
9. `s08_jump` (56.6) — timeJump 100 → 200 years on apartmentSet (same room: a tree grows through the floor, the
   wall opens to the forest).

## Scene 9 — AFTER 200 YEARS (8:00–9:00)   pill `+200 YEARS`

1. `s09_title` — forestCitySet, dawn mist, wide; eraTitle `200 YEARS LATER`, sub `A WORLD WITHOUT US`.
2. `s09_pan` (covers 9.1–9.2) — slow majestic pan through the forest city: god rays, the stream, the rusted bus.
   Callout: `FORMER MAIN AVENUE`. Bed `forest`.
3. `s09_belong` (covers 9.3) — one harmonious frame: a wild dog drinking at the stream, a cat on a mossy ledge,
   parrots overhead.
4. `s09_hunt` (9.4 first sentence) — openLandSet, 200 years, golden: deer bounding, the pack in pursuit (no kill).
   Callout: `TOP PREDATOR`.
5. `s09_cat` (9.4 second sentence) — the cat prowling through ferns, eyes bright. Callout: `AMBUSH HUNTER`.
6. `s09_prey` (9.4 third sentence) — meadow: rabbits grazing; a hawk soars, a fox watches; a thump and they vanish
   into burrows. Callout: `PREY FOR MANY`. Sfx `hawk_cry`, `rabbit_thump`.
7. `s09_seeds` (9.4 fourth sentence) — canopy: parrots feeding on fruit; a seed falls and, in an in-shot time-lapse,
   a seedling rises. Callout: `SEED SPREADERS`.
8. `s09_web` (covers 9.5) — infographic on `spaceBackdrop`: an ecosystem web of medallions (plants, rabbits, deer,
   dogs, cats, hawks, foxes, parrots) joined by gold arrows. Heading: `A LIVING ECOSYSTEM`.
9. `s09_relics` (covers 9.6) — three relics in the moss: the red collar with its tarnished tag (`drawCollar`, age 1);
   a rusted cage with its door open and a fern growing through; a cracked bowl lettered `MAX` with a sapling in it.
   Then pull back to the forest, animals moving freely.
10. `s09_dusk` — sunset panorama over the forest city; flocks; a distant `dog_howl`.
11. `s09_home` — the camera drifts toward the vine-covered ruin of the hero building; slow fade (trans into scene 10:
    fade 1.2).

## Scene 10 — THE LAST MEMORY (9:00–10:00)   pill `+200 YEARS`

Narration 10.1–10.10 is the client's text and must stay verbatim. Soft piano; no title boom.

1. `s10_puppy` (0 → 10.1 start) — apartmentSet, 200 years, morning light shafts: a golden puppy (`golden200`, puppy 1)
   clambers in through the broken wall and looks around. Small quiet title lower-left `THE LAST MEMORY`.
   Callouts: `BORN 200 YEARS AFTER THE LAST HUMAN`, then `HAS NEVER SEEN A PERSON`. Bed `ruin_interior`. Sfx `puppy_yip`, `paws`.
2. `s10_ruins` (covers 10.1) — the puppy explores: sniffs a cracked, dead screen overgrown with vines; through the
   broken wall the collapsed towers stand in the forest.
3. `s10_life` (covers 10.2) — it steps into a shaft of sunlight among flowers growing through the floor; a butterfly
   lands near its nose; it sneezes.
4. `s10_find` (covers 10.3) — by the old door: the plush teddy (`drawPlush`, age 1) half under leaves beside what is
   left of the dog bed. The puppy freezes, ears up, head tilted.
5. `s10_sniff` (covers 10.4) — it creeps up, stretches its neck, sniffs (sfx `sniff`), nudges the bear, hops back,
   returns. For about 3 s a warm memory blooms over the frame (soft vignette, sfx `shimmer`): the same spot on day 0 —
   the retriever with this bear and the boy — then it fades.
6. `s10_play` (covers 10.5) — the puppy grabs the bear (`carry`), shakes it (sfx `squeaky_toy`, `plush_rustle`),
   play-bows, tosses and pounces, tail whirling. Camera drifts around it.
7. `s10_question` (covers 10.6–10.7) — `spaceBackdrop`: heading `IF YOU COULD SAVE ONLY ONE…`; four cards pop in on
   the words dog / cat / parrot / rabbit, each with the living hero animal inside (`DOG`, `CAT`, `PARROT`, `RABBIT`).
   Sfx `ui_pop` x4.
8. `s10_comments` (covers 10.8) — the cards stay; tag `TELL US IN THE COMMENTS` with a gently pulsing arrow.
9. `s10_remember` (covers 10.9) — back in the ruin at sunset: the puppy carries the bear to the spot by the door,
   circles, lies down with it between its paws.
10. `s10_world` (covers 10.10 and holds to the end) — close on the puppy's face on the bear, eyes closing; then a
    long slow pull-back through the broken wall to the forest city at sunset, parrots crossing the sky. Final hold;
    the renderer fades to black.
