# Production plan — finishing pass

Why earlier attempts stalled: they built the engine (`src/engine`), the dog rig, the nature kit, the audio library
(`audio/lpaudio`) and the TTS toolchain, but never authored a single scene (`scene01.js` is a look-dev test, scenes
2–10 are placeholder cards), never built a soundtrack mixer or music, and kept their approved reference sheets in the
git-ignored `build/` folder. This pass finishes the film: assets (phase 1) → scenes (phase 2) → audio mix → render.

Read `docs/GUIDE.md` (rules, art direction, engine API) and `docs/STORYBOARD.md` (shot list) first.
References: `build/sheets/model_dog_poses.jpg`, `build/sheets/model_dog_faces.jpg`, `build/sheets/lookdev.jpg`
(regenerate with `node scripts/model.mjs dog` and
`node src/cli/still.js --times 3,9,15,25 --tw 960 --cols 2 --out build/sheets/lookdev.jpg`).

## Ground rules for every contributor

- Stay inside your write set. Never edit `src/engine/**`, `src/env/**`, `src/chars/rig.js`, `src/chars/dog.js`,
  `src/film/index.js`, `src/film/common.js`, `src/film/narration.js`, `src/cli/**`, `film/**`, `docs/**`, `audio/**`,
  `package*.json`, or another contributor's files. Need a change elsewhere? Say so in your final report.
- Never commit, push, or install packages. Never pipe heredocs/stdin into interpreters (`node -e`, `python -`): write a
  script file (scratch files go in `build/tmp/<your-name>/`) and run it.
- Deterministic (no `Math.random`, `Date.now`); fast (a whole 1080p frame ≲ 150 ms; one character ≲ 4 ms; one set
  ≲ 60 ms — cache static geometry/pre-rendered layers in module-level `Map`s keyed by params; never create canvases
  per frame — a small, bounded, keyed cache of offscreen canvases created once is fine).
- Style: flat vector + soft gradients, upper-left light, characters/hero props outlined with `inkW(s)` in a dark tint
  of their own hue, environments without outlines, eyes via `eye()`/`blink()` from `rig.js`. Match the dog sheets.
- Every module starts with a header comment documenting its exports, options and anchors — phase-2 authors rely on it.
- Verify visually: render sheets/stills, open them with Read, fix what looks wrong. Time-box to roughly 45–60 minutes
  of work: complete and solid beats perfect and unfinished.

## Story bible (shared look of hero things)

- Hero dog **MAX**, golden retriever, red collar with a gold bone tag (`DOGS.golden`; descendants `golden20/50/200`).
- Hero apartment: 2nd floor of a 5-storey **red-brick** building with white window frames and a **teal front door**
  (`#2f6f73`) at street level; next door **CAFÉ LUNA** (green/cream striped awning, script sign) and a small
  **PET SHOP**. Across the street a billboard **ADOPT A FRIEND**.
- Living room: warm wooden apartment door (left), big window (right) over the street, mustard sofa, red plaid dog bed
  by the door with a **tan teddy bear with a blue ribbon**, macaw stand by the window, coffee table, floor lamp, TV,
  wall clock, bookshelf with a framed **photo of the boy hugging Max**, cat + dog bowls (dog bowl lettered `MAX`), an
  automatic pet feeder with an LED.
- Family: boy (~9, brown hair, red hoodie, jeans), girl (~7, pigtails, yellow dress), mom (dark hair bun, teal top),
  grandma (grey hair, lilac cardigan).
- Hero cat: orange tabby (`#f08a24`), green eyes. Hero macaw: scarlet macaw. Hero rabbit: sandy-brown with a white
  blaze. Golden hamster. Tricolour guinea pig.

## Phase 1 — asset modules (owner → write set → required exports)

Characters use the dog convention: `drawX(c, {x, y, s, flip, t, seed, v, pose, mood, gait, phase, look, ...})`, `(x,y)`
= ground point, `s` scale (s = 1 ⇒ size matched to the dog at s = 1: cat shoulder ≈ 45 units, rabbit ≈ 30, hamster
≈ 12, macaw perched height ≈ 90, adult human ≈ 330), poses blendable where cheap, gait phase advanced by
distance / `xStride(...)`, and `shadow: false` to skip the contact shadow.

| owner | write set | must export |
|---|---|---|
| cat | `src/chars/cat.js`, `scripts/model_cat.mjs` | `drawCat`, `CATS` (`orange`, `orange20`, `orange50`, `orange200`, `tuxedo`, `grey`), `catStride`; poses `stand sit loaf curl(asleep) crouch(stalking) leap(k 0..1) arch(hiss) lie`; gaits walk/trot/run/stalk; moods `neutral curious alert hunting scared angry sleepy asleep happy`; options `look:[x,y]`, `tilt`, `mouth` (meow/hiss), `paw` (raise/tap 0..1), `eyeShine` (0..1 glowing eyes for night), `tailFlick`. Plus `drawMouse(c,{x,y,s,flip,t,phase,run})`. |
| birds | `src/chars/birds.js`, `scripts/model_birds.mjs` | `drawParrot`, `PARROTS` (`macaw`, `parakeet` ring-necked green, `amazon`, `redcrown`), options `pose: perch walk fly glide`, `flap` phase, `beak` 0..1 (talk/call), `bob`, `preen`, `seed`-held seed (`food: true`), `look`, `tilt`, `age` 0..1 (faded, scruffy, greyer face); `drawHawk(c,{x,y,s,flip,t,bank})` soaring + `hawkShadow(c,...)`; `drawPigeon(c,{pose:'walk'|'peck'|'fly',...})`; `drawButterfly(c,{x,y,s,t,color})`; `drawFlock(c,{x,y,w,h,n,t,seed,kind:'parrot'|'pigeon'|'far', dir})` cheap many-bird flock. |
| small | `src/chars/small.js`, `scripts/model_small.mjs` | `drawRabbit`, `RABBITS` (`sandy` white blaze, `sandy20`, `sandy50`, `sandy200`, `white`, `patched` black-and-white, `grey`, `brown`), `kit` 0..1 (baby proportions), poses `sit graze hop(phase) alert(upright freeze) lie dig`, `rabbitStride`, `thump` 0..1; `drawHamster` (poses `sit run(phase, for the wheel) gnaw(on bars, paws up) eat sleep`, `cheeks` 0..1); `drawGuineaPig` (tricolour; poses `stand walk popcorn(k) call(mouth open) eat`). |
| humans | `src/chars/human.js`, `scripts/model_human.mjs` | `drawHuman(c, {x,y,s,flip,t,seed,who,pose,phase,k,vanish,look})` — `who`: `boy girl mom dad grandma man woman jogger elder` (+ seed-varied clothes for extras); poses `stand walk run throw(k) wave sit reach(hand out, feeding) leash` ; returns `{hand:[x,y]}` (world coords of the leash/front hand). `vanish` 0..1: the figure dissolves upward into light particles and is gone at 1. `drawVanishFx(c, {x,y,s,k,t})` (emissive glow to call after the grade), `drawLeash(c, x0,y0,x1,y1,{slack})`, `drawBike(c,{x,y,s,flip,phase})` + rider via `pose:'cycle'`. Humans are secondary: simple stylised figures (dot eyes, no detailed faces), same outline/gradient style. |
| wild | `src/chars/wild.js`, `scripts/model_wild.mjs` | `drawDeer(c,{x,y,s,flip,t,seed,v:'doe'|'stag',pose:'stand'|'graze'|'alert'|'bound'|'threat'(antlers lowered),phase})`, `deerStride`; `drawFox(c,{x,y,s,flip,t,pose:'stand'|'sit'|'walk'|'watch',phase})`, `foxStride`. |
| city | `src/sets/city.js`, `src/sets/vehicles.js`, `scripts/model_city.mjs` | `streetSet(g,t,o)` (hero building + teal door + 2nd-floor window, café LUNA, pet shop, billboard, lamp posts, traffic light, sidewalk/road; `o.years`, `o.look`, `o.power`, `o.cars:[{x,color,kind,flip}]` for parked/moving cars drawn by the set, `o.light` traffic-light state, `o.actors`, `o.front`); `avenueSet` (wide multi-lane avenue with a long view, rusting cars, overpass); `alleySet` (narrow alley, bins, fire escape, wall); `STREET`, `AVENUE`, `ALLEY` anchors (ground y, door, window, café, awning, bins...). `vehicles.js`: `drawCar(c,{x,y,s,flip,color,kind:'sedan'|'hatch'|'van'|'taxi',years,wheel})`, `drawBus(c,{...years})`, `drawTrolley`. |
| skyline | `src/sets/skyline.js`, `scripts/model_skyline.mjs` | `skylineSet(g,t,o)` (panorama of towers + river + bridge; `o.power`, `o.lit` 0..1 share of lit windows, `o.flicker` for a district dropping out, `o.collapse` 0..1 bridge span falling, aging greens the towers), `rooftopSet` (parapet, water tank, antennas, neighbouring roofs; actors at ledge level), `parkingLotSet` (faded bays, abandoned trolleys, saplings growing with years; supports macro zoom on a crack: `o.crack` 0..1), anchors `SKYLINE`, `ROOFTOP`, `LOT`. |
| park | `src/sets/park.js`, `scripts/model_park.mjs` | `parkSet(g,t,o)` (lawn, path, bench, trees; years 0 tidy → 1 knee-high meadow with wildflowers → 20 young woodland → 100+ forest; `o.ball` position), `openLandSet` (rolling tall-grass plains with a distant ruined skyline, deer-scale), `forestCitySet` (200 years: giant trees, vine-wrapped tower ruins, stream, rusted bus, ferns, god-ray friendly), anchors `PARK`, `OPEN`, `FOREST`. |
| home | `src/sets/home.js`, `src/sets/props.js`, `scripts/model_home.mjs` | `apartmentSet(g,t,o)` (the living room from the bible; `o.years` 0→200: dust, leaves, peeling paper, fallen shelf, ferns, door hanging open, at 100+ a gap in the outer wall, at 200 a tree through the floor and the wall open to the forest; `o.power` lamp/TV/feeder; `o.view` what the window shows; `o.lampOn`, `o.tvOn`), anchors `APT` (floor y, door, dog bed, sofa seat, window sill, perch, bowls, feeder, shelf/photo, coffee table). `props.js`: `drawPlush(c,{x,y,s,rot,age,squash})`, `drawPhoto(c,{x,y,s,rot,age,frame})`, `drawCollar(c,{...age})`, `drawBowl(c,{...name:'MAX',age,sapling})`, `drawFeeder(c,{...led})`, `drawPerchStand`, `drawDogBed`, `drawBall`, `drawCage(c,{...age,open,fern})`. |
| rooms | `src/sets/rooms.js`, `scripts/model_rooms.mjs` | `petRoomSet(g,t,o)` (hamster cage with wheel, guinea-pig pen, rabbit hutch with latch; `o.latch` 0..1 open amount, `o.power`, moonlight), `hallwaySet` (apartment corridor with doors; `soundArcs(c,{x,y,t,a})`), `stairwellSet` (5 years: light shafts, debris), `warrenSet` (cutaway of rabbit tunnels and a nest chamber under a meadow), `ruinFloorsSet` (broken concrete slabs with a gap to leap, greenery), anchors `PETROOM`, `HALL`, `STAIRS`, `WARREN`, `RUIN`. Character contents are drawn by shots through `o.actors(c)` / cage callbacks (`o.inHamster(c)`, `o.inGuinea(c)`, `o.inHutch(c)` drawn behind the bars). |

Every set signature is `xSet(g, t, o)` with `o = {years, look, power, actors, front, ...}`, draws sky/backdrop and all
depth planes via `g.layer`, calls `o.actors(c)` on the main plane and `o.front(c)` in front of actors, never calls
`g.grade`, never draws UI. Use `aging(years)` for decay. Sets must look right at camera zoom 1–2.5 around their
anchors and at `years` 0, 1/365, 7/365, 1, 5, 20, 50, 100, 200 and with looks day, golden, dusk, night, rain.

## Phase 2 — scenes

One author per scene: `src/film/sceneNN.js` (+ optional `src/film/sNN_*.js` helpers). Follow the storyboard; where an
asset is missing or a shot is impractical, simplify while keeping the narration's meaning. Shots anchor to narration
with `nar.rel(id)`; give every shot a `bed`, and `sfx` cues for visible actions (vocabulary below). Scene modules may
export `markers`. Verify with `node src/cli/still.js --scene N` and `--times` sheets.

Audio vocabulary (gain in dB, 0 = as loud as the narrator, −12 present, −24 subtle):
- beds: `city_alive room_tone room_dead wind_street wind_high night rain birds_day forest meadow ruin_interior river space`
- one-shots: `dog_bark dog_whine dog_pant dog_howl dog_growl puppy_yip sniff paws cat_meow cat_purr cat_hiss pounce
  mouse_squeak parrot_squawk parrot_flock parrot_talk({id}) wing_flaps hawk_cry owl_hoot rabbit_thump hop munch
  hamster_wheel cage_rattle scurry door_scratch ball_bounce squeaky_toy plush_rustle feeder_beep feeder_power_down
  electric_flicker power_down_big car_engine_die traffic_light_click glass_break metal_creak rumble_collapse
  leaves_rustle grass_rustle water_drip thunder paper_flutter vanish whoosh riser boom sub_drop shimmer time_tick ui_pop`
  (parameters: see each generator in `audio/lpaudio/*.py`). Parrot voice ids: `p_hello p_morning p_goodboy p_hello_q`.
