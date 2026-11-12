// Model sheets for src/sets/interiors.js.  node scripts/model_interiors.mjs [pet|hall|stairs|ruin|time|all]
//   -> build/sheets/model_interiors_{pet,hall,stairs,ruin}.jpg (+ draw times at 1080p on stdout)
import { createCanvas } from '@napi-rs/canvas';
import { Gfx } from '../src/engine/stage.js';
import { LOOKS } from '../src/engine/sky.js';
import { txt } from '../src/engine/draw.js';
import { save } from '../src/cli/common.js';
import { drawDog } from '../src/chars/dog.js';
import * as I from '../src/sets/interiors.js';

const which = process.argv[2] || 'all';
const opt = async (f, n) => { try { return (await import(f))[n]; } catch (e) { console.log('missing', f, String(e).slice(0, 80)); return null; } };
const drawRabbit = await opt('../src/chars/rabbit.js', 'drawRabbit'), drawHamster = await opt('../src/chars/small.js', 'drawHamster');
const drawGuineaPig = await opt('../src/chars/small.js', 'drawGuineaPig'), drawCat = await opt('../src/chars/cat.js', 'drawCat'), drawHuman = await opt('../src/chars/human.js', 'drawHuman');
const safe = (fn) => { try { fn(); } catch (e) { console.log('actor error', String(e).slice(0, 120)); } };

const g = new Gfx(0.5);
function sheet(name, cols, tiles) {
  const rows = Math.ceil(tiles.length / cols), out = createCanvas(960 * cols, 540 * rows), o = out.getContext('2d');
  tiles.forEach(([label, fn], i) => {
    g.begin(); fn();
    const x = (i % cols) * 960, y = Math.floor(i / cols) * 540;
    o.drawImage(g.canvas, x, y);
    txt(o, label, x + 14, y + 22, { size: 22, align: 'left', color: '#ffffff', outline: ['#000000', 4], font: 'Barlow Semi Condensed', weight: 600 });
  });
  console.log(save(out, `build/sheets/model_interiors_${name}.jpg`, 88));
}
const P = I.PETROOM, T = 1.3;
function pet(look, cam, o = {}, pets = {}) {
  g.t = T; g.T = T; g.camera(...cam);
  I.petRoomSet(g, T, {
    years: 0, look, power: !look.dark, ...o,
    actors: (c) => {
      if (pets.dog) drawDog(c, { x: 150, y: P.floorY, s: P.s, t: T, pose: 'sit', mood: 'happy' });
      if (pets.girl && drawHuman) safe(() => drawHuman(c, { who: 'girl', x: P.girlStand.x, y: P.girlStand.y, s: P.s, flip: 1, t: T, pose: 'stand' }));
      if (drawRabbit) safe(() => drawRabbit(c, { x: P.hutch.x + (pets.rabX || 0), y: P.hutch.y, s: P.s, flip: -1, t: T, pose: 'sit', mood: pets.mood || 'neutral' }));
      if (drawHamster) safe(() => (pets.grip
        ? drawHamster(c, { x: P.bars.x, y: P.bars.y, s: P.s, flip: 1, t: T, pose: 'grip', mood: 'scared' })
        : drawHamster(c, { x: P.wheel.x, y: P.wheel.y + P.wheel.r, s: P.s, flip: 1, t: T, pose: 'run', phase: 0.3 })));
      if (drawGuineaPig) safe(() => drawGuineaPig(c, { x: P.gpig.x, y: P.gpig.y, s: P.s, flip: 1, t: T, pose: pets.grip ? 'call' : 'stand' }));
    },
  });
  g.grade(look); I.petRoomLight(g, T, { look });
}
function hall(look, cam, o = {}, t = T) {
  g.t = t; g.T = t; g.camera(...cam);
  const d = I.HALL.at(6.5, -0.2);
  I.hallwaySet(g, t, { years: 0.003, look, ...o, actors: (c) => drawDog(c, { x: d.x, y: d.y, s: d.s, t, mood: 'sad', flip: 1 }) });
  g.grade(look); I.hallwayLight(g, t, { look, ...o });
  g.screen((c) => { for (const q of I.HALL.doors) { const [x, y] = g.toScreen(q.x, q.y); c.fillStyle = '#ffc247'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); } });
}
function stairs(look, cam, years = 5) {
  g.t = T; g.T = T; g.camera(...cam);
  const S = I.STAIRS, cx = 700;
  I.stairwellSet(g, T, { years, look, actors: (c) => {
    if (drawCat) { safe(() => drawCat(c, { x: cx, y: I.stairY(cx, 'upper'), s: 1.5, flip: 1, t: T, v: 'orange20', gait: 'stalk', phase: 0.2, mood: 'hunting' })); safe(() => drawCat(c, { x: S.landing.x + 150, y: S.landing.y, s: 1.5, flip: -1, t: T, v: 'tuxedo', pose: 'arch', mood: 'angry' })); safe(() => drawCat(c, { x: 760, y: I.stairY(760, 'lower'), s: 1.5, flip: -1, t: T, gait: 'walk', phase: 0.4 })); }
    drawDog(c, { x: 150, y: S.ground.y, s: 1.5, t: T });
  } });
  g.grade(look); I.stairwellLight(g, T, { look, years });
}
function ruin(look, cam, years = 20, catX = 500, air = null) {
  g.t = T; g.T = T; g.camera(...cam);
  const F = I.RUINFLOORS;
  I.ruinFloorsSet(g, T, { years, look, actors: (c) => {
    if (drawCat) safe(() => (air == null ? drawCat(c, { x: catX, y: F.floorY, s: 1.5, flip: 1, t: T, v: 'orange20', gait: 'run', phase: 0.3 }) : drawCat(c, { x: catX, y: F.floorY, s: 1.5, flip: 1, t: T, v: 'orange20', pose: 'leap', air, lift: 90 })));
    drawDog(c, { x: 1500, y: F.rightY, s: 1.5, t: T, flip: -1 });
  } });
  g.grade(look);
}

if (which === 'pet' || which === 'all') sheet('pet', 2, [
  ['petRoom wide, day', () => pet(LOOKS.day, P.cams.wide, { hutchDoor: 0, latch: 0 }, { dog: 1, girl: 1 })],
  ['petRoom wide, night (no power)', () => pet(LOOKS.night, P.cams.wide, { hutchDoor: 0, latch: 0.5 }, { grip: 1, mood: 'scared' })],
  ['cams.girl, hutchDoor 1', () => pet(LOOKS.day, P.cams.girl, { hutchDoor: 1 }, { girl: 1, rabX: -40 })],
  ['cams.latch (zoom 5), latch 0.55, hutchDoor 0.12', () => pet(LOOKS.night, P.cams.latch, { hutchDoor: 0.12, latch: 0.55 }, { rabX: -56, mood: 'alert' })],
  ['cams.hamster, night, grip', () => pet(LOOKS.night, P.cams.hamster, {}, { grip: 1 })],
  ['cams.gpig day / hutchDoor 0.5 inset n/a', () => pet(LOOKS.day, P.cams.gpig, { wheel: 1.1 }, {})],
]);
if (which === 'hall' || which === 'all') sheet('hall', 2, [
  ['hallway powered', () => hall(LOOKS.day, I.HALL.cams.wide, { power: true })],
  ['hallway flicker 0.7 (dusk)', () => hall(LOOKS.dusk, I.HALL.cams.wide, { power: true, flicker: 0.7 }, 2.37)],
  ['hallway dark: night, power false', () => hall(LOOKS.night, I.HALL.cams.wide, { power: false })],
  ['cams.deep, flicker 1 (night)', () => hall(LOOKS.night, I.HALL.cams.deep, { power: true, flicker: 1 }, 4.1)],
]);
if (which === 'stairs' || which === 'all') sheet('stairs', 2, [
  ['stairwell wide, 5 years', () => stairs(LOOKS.day, I.STAIRS.cams.wide)],
  ['cams.upper, golden', () => stairs(LOOKS.golden, I.STAIRS.cams.upper)],
  ['cams.landing', () => stairs(LOOKS.day, I.STAIRS.cams.landing)],
  ['years 0 (robustness)', () => stairs(LOOKS.morning, I.STAIRS.cams.wide, 0)],
]);
if (which === 'ruin' || which === 'all') sheet('ruin', 2, [
  ['ruinFloors wide, 20 years', () => ruin(LOOKS.day, I.RUINFLOORS.cams.wide)],
  ['cams.leap, golden, mid-air', () => ruin(LOOKS.golden, I.RUINFLOORS.cams.leap, 20, 960, 0.5)],
  ['cams.drop', () => ruin(LOOKS.forest, I.RUINFLOORS.cams.drop)],
  ['night, 60 years', () => ruin(LOOKS.night, I.RUINFLOORS.cams.wide, 60)],
]);
if (which === 'time' || which === 'all') {
  const G = new Gfx(1), look = LOOKS.day;
  const time = (name, fn) => { for (let i = 0; i < 2; i++) { G.begin(); fn(i); } const t0 = performance.now(); for (let i = 0; i < 6; i++) { G.begin(); fn(i * 0.2); } console.log(name, ((performance.now() - t0) / 6).toFixed(1), 'ms'); };
  time('petRoom wide', (t) => { G.camera(...P.cams.wide); I.petRoomSet(G, t, { look, wheel: t }); });
  time('petRoom latch cu', (t) => { G.camera(...P.cams.latch); I.petRoomSet(G, t, { look, latch: 0.5 }); });
  time('petRoomLight', (t) => { G.camera(...P.cams.wide); I.petRoomLight(G, t, { look }); });
  time('hallway', (t) => { G.camera(...I.HALL.cams.wide); I.hallwaySet(G, t, { look, flicker: 0.5 }); });
  time('hallwayLight', (t) => { G.camera(...I.HALL.cams.wide); I.hallwayLight(G, t, { look, flicker: 0.5 }); });
  time('stairwell', (t) => { G.camera(...I.STAIRS.cams.wide); I.stairwellSet(G, t, { look, years: 5 }); });
  time('stairwellLight', (t) => { G.camera(...I.STAIRS.cams.wide); I.stairwellLight(G, t, { look, years: 5 }); });
  time('ruinFloors', (t) => { G.camera(...I.RUINFLOORS.cams.wide); I.ruinFloorsSet(G, t, { look, years: 20 }); });
  // robustness: odd options must not throw
  for (const f of [I.petRoomSet, I.petRoomLight, I.hallwaySet, I.hallwayLight, I.stairwellSet, I.stairwellLight, I.ruinFloorsSet])
    for (const o of [undefined, null, {}, { years: 'x', look: {}, hutchDoor: 9, latch: -3, wheel: NaN, flicker: 7, actors: 3, front: null }, { years: 200, look: LOOKS.rain, power: false }, { years: 1e9, look: LOOKS.dusk }])
      for (const t of [0, -5, 1e6, NaN]) { G.begin(); f(G, t, o); }
  console.log('robustness ok', I.stairY(NaN), I.stairY(700), I.stairY(700, 'lower'), JSON.stringify(I.HALL.at()), I.hallLights(1, { flicker: 1 }).map((v) => v.toFixed(2)).join(','));
}
