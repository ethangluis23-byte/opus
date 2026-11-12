// Model sheets for the hero apartment and its props.
//   node scripts/model_home.mjs props   -> build/sheets/model_props.jpg
//   node scripts/model_home.mjs room    -> build/sheets/model_home.jpg (+ model_home_close.jpg)
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts, Gfx, W, H } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt } from '../src/engine/draw.js';
import { LOOKS, mixLooks } from '../src/engine/sky.js';
import * as PR from '../src/sets/props.js';

loadFonts();
const which = process.argv[2] || 'props';
const label = (c, s, x, y) => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 20, color: '#2a3550' });

if (which === 'props') {
  const cv = createCanvas(1920, 1080), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, 1080, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]); c.fillRect(0, 0, 1920, 1080);
  const rows = [[0, 'new'], [1, 'age 1']];
  rows.forEach(([age, name], r) => {
    const y = 430 + r * 460;
    label(c, name, 60, y - 360);
    PR.drawPlush(c, { x: 130, y, s: 2.2, age });
    PR.drawPhoto(c, { x: 400, y, s: 1.5, age });
    PR.drawCollar(c, { x: 660, y, s: 1.6, age });
    PR.drawBowl(c, { x: 870, y, s: 1.6, age, sapling: age });
    PR.drawFeeder(c, { x: 1060, y, s: 1.4, led: 1 - age, age });
    PR.drawPerchStand(c, { x: 1250, y, s: 0.9, age });
    PR.drawDogBed(c, { x: 1500, y, s: 0.9, age });
    PR.drawBall(c, { x: 1680, y, s: 2, age });
    PR.drawCage(c, { x: 1810, y, s: 0.75, age, open: age, fern: age });
  });
  PR.drawPlush(c, { x: 130, y: 1060, s: 1.4, squash: 0.8, look: 0.8 });
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) { PR.drawPlush(c, { x: -500, y: 0, s: 1.5 }); PR.drawPhoto(c, { x: -500, y: 0, age: 0.5 }); }
  console.log(`plush+photo: ${((performance.now() - t0) / 200).toFixed(2)} ms`);
  console.log(save(cv, 'build/sheets/model_props.jpg', 90));
}

if (which === 'room') {
  const { apartmentSet, APT } = await import('../src/sets/home.js');
  const shots = [
    ['day 0 wide', 0, LOOKS.day, 960, 540, 1, {}],
    ['door + bed 0', 0, LOOKS.golden, -260, 640, 1.6, {}],
    ['dusk 0 lamp on', 0, LOOKS.dusk, 960, 540, 1, { power: true, lampOn: true, tvOn: true }],
    ['night power off', 1 / 365, LOOKS.night, 1300, 540, 1, { power: false }],
    ['5 years', 5, LOOKS.day, 960, 540, 1, {}],
    ['100 years', 100, LOOKS.morning, 700, 540, 1, {}],
    ['150 years', 150, LOOKS.morning, 700, 540, 1, {}],
    ['200 years', 200, LOOKS.morning, 700, 540, 1, {}],
    ['200 door', 200, LOOKS.golden, -260, 640, 1.5, {}],
  ];
  const tw = 640, th = 360, cols = 3, sheet = createCanvas(tw * cols, th * Math.ceil(shots.length / cols)), sc = sheet.getContext('2d');
  const g = new Gfx(1);
  let tot = 0;
  shots.forEach(([name, years, look, x, y, z, o], i) => {
    const t0 = performance.now();
    g.begin(); g.t = 2; g.camera(x, y, z);
    apartmentSet(g, 2.0, { years, look, ...o });
    g.grade(look);
    tot += performance.now() - t0;
    sc.drawImage(g.canvas, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
    txt(sc, name, (i % cols) * tw + 10, Math.floor(i / cols) * th + 18, { align: 'left', size: 20, color: '#ffe08a', shadow: ['#000', 4, 1] });
  });
  console.log(`apartmentSet avg ${(tot / shots.length).toFixed(1)} ms`);
  console.log(save(sheet, 'build/sheets/model_home.jpg', 88));
  if (process.argv[3]) {
    const [x, y, z, years, lk] = process.argv[3].split(',');
    const look = LOOKS[lk || 'day'];
    g.begin(); g.camera(+x, +y, +z); apartmentSet(g, 2, { years: +years, look }); g.grade(look);
    console.log(save(g.canvas, 'build/sheets/model_home_close.jpg', 90));
  }
}
