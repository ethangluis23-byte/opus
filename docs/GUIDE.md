# Production guide — The Last Pets on Earth

A 10-minute animated documentary rendered entirely from code (Node + `@napi-rs/canvas`, Skia). Every frame is a pure
function of time. This guide is the contract for anyone adding characters, props, sets or shots.

## Story in one paragraph

All humans vanish. We follow one city and its pets — a **golden retriever** (red collar), an **orange tabby cat**,
a **scarlet macaw**, a **sandy-brown rabbit with a white blaze**, a **golden hamster** and a **tricolour guinea pig** —
from day 0 through 24 hours, 7 days, 1, 5, 20, 50, 100 and 200 years, ending on a puppy (a descendant of the retriever)
finding an old plush toy in the ruined apartment where the story began. Tone: natural-history documentary, emotional,
biologically realistic (no monsters, no talking animals, no anthropomorphic posing).

## Art direction (match these exactly)

Approved references: `build/sheets/model_dog_poses.jpg`, `build/sheets/model_dog_faces.jpg` (characters) and
`build/sheets/lookdev.jpg` (environment, lighting, UI). Read them before drawing anything.

- **Flat vector illustration with soft gradients.** No photo textures, no 3D, no sketchy lines.
- **Characters and hero props have a dark outline** in a dark tint of their own hue (never pure black), width from
  `inkW(scale)` in `src/chars/rig.js`. **Environments have no outlines**: separate shapes by value and colour.
- **Light comes from the upper left.** Fills are top-light to bottom-dark gradients; add a soft form shadow underneath,
  a thin rim light along top edges (see `drawDog`), and a soft contact shadow on the ground (`shadow()`).
- **Eyes carry the emotion**: big white eyeballs, coloured iris, large pupil, two catch-lights — always use `eye()` and
  `blink()` from `rig.js`. Moods must read at a glance from eyes + brows + ears + tail + posture.
- **Shape language**: rounded, appealing, slightly enlarged heads (about 30% over real proportions), clean readable
  silhouettes. Real species, real anatomy, simplified.
- **Palette**: rich but harmonious. Anchors — navy `#0b1030`, gold `#f7c35f` / `#ffc247` (UI only), golden coat `#eaa63f`,
  cat orange `#f08a24`, foliage greens from `LEAF` in `src/env/nature.js`. Pure white only for eye whites and highlights.
- **Detail**: three levels (silhouette, markings, small accents) so close-ups at 1080p hold up, but nothing noisy at
  small sizes.
- **Everything is alive**: breathing, blinking, ear/tail/whisker motion, wind sway, easing, anticipation and overshoot.
  Feet never slide: advance a gait phase by `distance / stride`.

## Hard rules

- ESM modules, no new dependencies. Drawing functions take the 2D context `c` first, then an options object.
- **Deterministic**: no `Math.random()`, no `Date.now()`. Use `RNG(seed)`, `hash`, `noise1` from `util.js`.
- **Fast**: a full 1080p frame should stay under about 150 ms. Cache static geometry in module-level `Map`s keyed by
  seed/size; never allocate canvases per frame.
- Stay inside your write set. Do not edit `src/engine/**`, `src/env/nature.js`, `src/env/fx.js`, `src/chars/rig.js` or
  `src/chars/dog.js`; if you need a change there, say so in your final report.
- Never commit or push. Never pipe a heredoc into an interpreter (`node - <<EOF` is blocked): write a script file and run it.
- Verify visually: render, open the image with the Read tool, critique it against the references, fix, repeat.

## Coordinates and units

Logical frame is **1920 x 1080**, y grows downward. Characters are drawn in their own units (the adult dog is about
100 units to the shoulder, 150 to the top of the head) and placed with `{x, y, s, flip}`: `(x, y)` is the ground point
under the body, `s` the scale, `flip` 1 = facing right, -1 = facing left. Every character accepts `t` (seconds) for its
idle life and a `seed` to de-synchronise individuals.

## Engine API

`src/engine/util.js` — `TAU, DEG, clamp, lerp, invLerp, remap, smooth, ss(a,b,x)` (smoothstep), `wrap`, `ease.{lin,in,out,io,
in3,out3,io3,out5,back,elastic,bounce,hold}`, `K(t, [[t0,v0],[t1,v1,'out3'],...])` keyframes (numbers or arrays),
`win(t,t0,t1,fadeIn,fadeOut)` 0-1-0 window, `RNG(seed)` → `r()`, `r.range(a,b)`, `r.int(a,b)`, `r.pick(arr)`, `r.chance(p)`,
`r.sign()`, `hash(n,seed)`, `noise1(x,seed)`, `fbm1`, `noise2`, `ramp(x, table)`, colours: `rgb, css, mix(a,b,t,alpha),
tone(c,±k), alpha(c,a), sat(c,k)`.

`src/engine/draw.js` — paths: `poly(pts, closed)`, `blob(pts, closed, k)` (smooth curve through points; `[x,y,1]` = sharp
corner), `capsule(ax,ay,ra,bx,by,rb)`, `circle`, `oval(x,y,rx,ry,rot)`, `rrect(x,y,w,h,r)`, `rect`, `union(...paths)`
(boolean union: build one silhouette, outline it once), `join`. Painting: `fill(c,path,style)`, `line(c,path,style,w)`,
`ink(c,path,fill,stroke,w)`, `clipped(c,path,fn)`, gradients `lin(c,x0,y0,x1,y1,stops)`, `rad(c,x,y,r,stops)`,
`glow(c,x,y,r,color,a)` (screen-blended light), `shadow(c,x,y,rx,ry,a)` (ground contact shadow), `ik2(ax,ay,tx,ty,l1,l2,bend)`
two-bone IK → `{jx,jy,ex,ey}`, `txt(c,str,x,y,{size,font,weight,color,align,base,track,a,glow,outline,shadow})`.

`src/engine/stage.js` — `W, H, FPS, Gfx`. A shot receives `g` (a `Gfx`):
- `g.camera(x, y, zoom, roll)` — look at world point (x, y) on the main plane; zoom 1 shows the 1920x1080 world rect.
- `g.layer(depth, (c) => {...}, opts)` — draw in world coordinates on a parallax plane. depth 0 = fixed backdrop,
  0.1–0.6 = distant, 1 = main action plane, 1.2–2 = foreground. `opts` (optional): `fog: [color, amt]` (atmospheric
  perspective — use `look.haze`), `tint: [color, amt]`, `alpha`, `blend`, `blur` (depth of field).
- `g.screen((c) => {...})` — draw in screen space (UI, full-frame effects).
- `g.grade(look)` — colour grade + vignette. Call once after the scene layers; draw emissive things (glows, light
  shafts, eye shine, fireflies) and UI after it.
- `g.toScreen(x, y, depth)` world → screen (to pin callouts to things), `g.view(depth, pad)` visible world rect,
  `g.wash(color, a, blend)`, `g.vignette(a)`, plus `g.t` (seconds since the shot started), `g.T` (film time), `g.dur`.

`src/engine/sky.js` — `LOOKS.{day, morning, golden, dusk, night, overcast, rain, dawn, forest}` (each has `sky`, `haze`,
`key` light colour, `sun`/`moon`, `cloud`, `stars`, `dark` 0..1, `grade`, `vig`), `mixLooks(a, b, t)`,
`drawSky(g, look, {clouds: {n, seed, y0, y1, speed, size} | false, horizon})`, `cloud`, `drawStars`, `drawSun`, `drawMoon`.
Use `look.dark` to decide lit windows / lamps / eye shine. Override e.g. the sun with `{...LOOKS.golden, sun: {...}}`.

`src/engine/overlays.js` (the film's graphic language, gold on navy) — `callout(c, {x, y, lx, ly, text, p, a})` label with
leader line (animate `p` 0→1), `tag(c, text, x, y, a)`, `bigTitle(c, {text, sub, t, dur})`, `bubble(c, {x, y, text, p, side})`
speech bubble, `counter(c, label, value, a)`, constants `GOLD, GOLD_HOT, NAVY, CREAM, PANEL, F_COND, F_SEMI`.
The time pill, corner badge, captions and grain are added by the renderer — do not draw them in shots.

`src/env/nature.js` — `LEAF` palette, `wind(t, x)`, `grass(c,x0,x1,y,{h,density,seed,t,colors,yVar})`,
`tree(c,x,y,{h,seed,kind:'round'|'poplar'|'pine'|'birch'|'willow'|'sapling',t,grow,spread})`, `bush(c,x,y,{w,h,seed,t,flowers})`,
`ivy(c,x,y,w,h,{cover,seed,t,density,hang})` (grows up a wall rect as cover goes 0→1), `vines(c,x0,x1,y,{len,n,seed,t})`,
`flowers`, `moss`, `litter`, `bough(c,x,y,angle,{len,seed,t})` (foreground framing branch), and
**`aging(years)` → `{weeds, vines, trees, grime, broken, collapse}`** (all 0..1): every set must derive its decay and
overgrowth from this so locations age consistently and can be animated continuously in time-lapses.

`src/env/fx.js` — `godRays(c,x,y,{ang,spread,len,n,color,a,t})`, `lightShaft(c,quad,{color,a})`, `dust(c,x,y,w,h,{n,t})`,
`rain(c,{t,n,wind})`, `splashes`, `fog(c,x0,x1,y,{h,color,a,t})`, `fallingLeaves`, `fireflies`, `farBirds`.

`src/chars/rig.js` — `eye(c, {...})`, `blink(t, seed)`, `GAITS`, `gaitFoot(phase, gait)`, `inkW(scale)`.
`src/chars/dog.js` — `drawDog(c, {...})`, `DOGS` variants, `dogStride(gait, variant, s)`: **the reference implementation
for every character rig** (merged-silhouette outline via `union`, gradient coat, markings clipped to the trunk, rim
light, form shadow, mood table, pose table, gait-driven IK legs, life from `t`). Read it before writing a rig.

## Sets

A set draws a whole location: `nameSet(g, t, o)` with `o = {years, look, actors: (c) => {}, front: (c) => {}, ...}`.
The shot calls `g.camera(...)` first; the set draws sky, distant planes, the main plane (calling `o.actors(c)` at the
depth where characters stand, and `o.front(c)` for things in front of them) and foreground planes. A set does **not**
call `g.grade` or draw UI. It exports an anchors object (ground line, doors, windows, seats, bowls...) so shots can
place characters precisely. `years` is continuous (0, 1/365, 7/365, 1, 5, 20, 50, 100, 200 and anything between).
`o.power` (boolean) says whether electricity still works (lit windows, lamps, screens, when `look.dark` is high).

## Shots

A scene file `src/film/sceneNN.js` default-exports `{n, shots: [...]}`; a shot is
`{id, at, pill, trans, draw(g, t)}`: `at` = seconds from the scene start (scenes are exactly 60 s), `pill` = time marker
text (e.g. `'+7 DAYS'`), `trans` = `{type: 'fade'|'dip'|'dipwhite'|'flash'|'wipe', dur}` from the previous shot.
Narration timing: `import { nar } from './narration.js'` → `nar.rel('3.2')` (line start, seconds from scene start),
`nar('3.2').start/.end/.dur` (absolute), `nar.word('3.2', n)`. Typical `draw`:

```js
draw(g, t) {
  const look = LOOKS.golden;
  g.camera(K(t, [[0, 900], [6, 1040]]), 540, K(t, [[0, 1], [6, 1.1]]));   // slow push-in
  someSet(g, t, { years: 5, look, actors: (c) => { drawDog(c, {...}); } });
  g.grade(look);
  g.screen((c) => godRays(c, look.sun.x, look.sun.y, { t, color: look.key }));
  g.screen((c) => callout(c, { x: sx, y: sy, lx: sx + 220, ly: sy - 110, text: 'FERAL IN 5 YEARS', p: (t - 1) / 0.8 }));
}
```

## Tools

- `node src/cli/still.js --t 12.5 --scale 0.5 --out build/stills/x.jpg` — one frame (add `--clean` to hide UI).
- `node src/cli/still.js --scene 3 --out build/sheets/scene03.jpg` — contact sheet of every shot in a scene.
- `node src/cli/still.js --times 3,8,15 --tw 960 --cols 2 --out build/sheets/a.jpg` — chosen times, larger tiles.
- `node src/cli/still.js --list` — the shot list with start times and durations.
- Model sheets: write `scripts/model_<name>.mjs` (see `scripts/model.mjs`) that renders your work on a neutral board
  into `build/sheets/`, then look at it.
