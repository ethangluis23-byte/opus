// Model sheets for hero props and wild animals.
//   node scripts/model_props.mjs [a|b|c|d|wild|wild2|all] [t]   -> build/sheets/model_props_*.jpg, model_wild_*.jpg
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt } from '../src/engine/draw.js';

loadFonts();
const which = process.argv[2] || 'all';
const T = +(process.argv[3] || 1.3);
const on = (k) => which === 'all' || which === k;

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y) => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 18, color: '#2a3550' });
const times = {};
const timed = (name, fn) => { const t0 = performance.now(); fn(); const d = performance.now() - t0; (times[name] ||= []).push(d); };
const report = () => console.log(Object.entries(times).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}ms(max ${Math.max(...v).toFixed(1)})`).join(' | '));

const P = await import('../src/sets/props.js');

if (on('a')) {
  const { cv, c } = board();
  [0, 0.5, 1].forEach((age, i) => { const x = 200 + i * 330; timed('plush', () => P.drawPlush(c, { x, y: 470, s: 6, age })); label(c, `plush age ${age}`, x, 500); });
  timed('plush', () => P.drawPlush(c, { x: 1190, y: 470, s: 6, age: 1, leaves: 1 })); label(c, 'age 1 leaves 1', 1190, 500);
  timed('plush', () => P.drawPlush(c, { x: 1500, y: 470, s: 5, squash: 1 })); label(c, 'squash 1', 1500, 500);
  timed('plush', () => P.drawPlush(c, { x: 1760, y: 470, s: 5, squash: -1 })); label(c, 'squash -1', 1760, 500);
  [0, 0.25, 0.5, 0.75, 1].forEach((age, i) => { const x = 110 + i * 150; P.drawPlush(c, { x, y: 720, s: 2.2, age, leaves: age * 0.6 }); label(c, `s2.2 age ${age}`, x, 742); });
  [0, 1].forEach((age, i) => [0.7, -1.3, 2.6].forEach((rot, j) => { const x = 900 + (i * 3 + j) * 150; P.drawPlush(c, { x, y: 680, s: 2.2, age, rot, shadow: 0 }); }));
  label(c, 'tossed (rot), shadow 0', 1270, 742);
  [0, 0.5, 1].forEach((age, i) => { for (let k = 0; k < 3; k++) { const s = [1, 0.7, 0.45][k], x = 110 + i * 330 + k * 100; P.drawPlush(c, { x, y: 960, s, age, leaves: age }); } label(c, `s 1 / 0.7 / 0.45 age ${age}`, 200 + i * 330, 990); });
  [0, 0.5, 1].forEach((age, i) => { const x = 1180 + i * 250; timed('collar', () => P.drawCollar(c, { x, y: 940, s: 2.6, age })); label(c, `collar age ${age}`, x, 990); P.drawCollar(c, { x: x + 110, y: 860, s: 1, age }); });
  console.log(save(cv, 'build/sheets/model_props_a.jpg', 90));
}

if (on('b')) {
  const { cv, c } = board();
  [0, 0.5, 1].forEach((age, i) => { const x = 240 + i * 440; timed('photo', () => P.drawPhoto(c, { x, y: 400, s: 3.4, age, glint: [0.35, -1, 0.6][i] })); label(c, `photo age ${age}`, x, 425); });
  timed('photo', () => P.drawPhoto(c, { x: 1620, y: 180, s: 1, age: 0 })); P.drawPhoto(c, { x: 1800, y: 180, s: 1, age: 1 }); label(c, 's 1', 1710, 200);
  P.drawPhoto(c, { x: 1640, y: 400, s: 1.6, age: 1, flat: 1, rot: -0.1 }); label(c, 'flat 1', 1640, 425); P.drawPhoto(c, { x: 1820, y: 330, s: 0.5, age: 0 });
  const bowls = [[{ label: 'MAX', food: 1 }, 'food 1'], [{ label: 'MAX', food: 0.5 }, 'food .5'], [{ label: 'MAX', food: 0.12 }, 'food .12'], [{ water: 0.8, color: '#e9a23b' }, 'water'], [{ label: 'MAX', age: 0.5 }, 'age .5'], [{ label: 'MAX', age: 1 }, 'age 1'], [{ color: '#c9d2d8', crack: 1 }, 'crack 1']];
  bowls.forEach(([o, n], i) => { const x = 150 + i * 255; timed('bowl', () => P.drawBowl(c, { x, y: 640, s: 2.5, ...o })); label(c, `bowl ${n}`, x, 665); });
  [0, 0.5, 1].forEach((age, i) => { P.drawBowl(c, { x: 80 + i * 110, y: 760, s: 1, label: 'MAX', food: 1 - age, age }); });
  [0, 0.5, 1].forEach((age, i) => { const x = 480 + i * 130; timed('ball', () => P.drawBall(c, { x, y: 800, r: 44, rot: i * 0.9, age })); label(c, `ball age ${age}`, x, 822); P.drawBall(c, { x: 880 + i * 40, y: 800, r: 11, rot: i * 2, age }); });
  [0, 0.5, 1].forEach((age, i) => { const x = 1130 + i * 290; timed('leash', () => P.drawLeash(c, x - 110, 730, x + 100, 790, { slack: age })); label(c, `leash slack ${age}`, x, 852); });
  P.drawLeash(c, 1050, 1000, 1400, 1000, { slack: 1, ground: 1000, loop: 1 }); label(c, 'leash on ground (ground, loop 1)', 1220, 1030);
  P.drawLeash(c, 1500, 900, 1800, 1000, { slack: 0.7, ground: 1000, color: '#3b6fb5', w: 5 }); label(c, 'falling, w 5', 1660, 1030);
  [0, 0.5, 1].forEach((b, i) => { const x = 110 + i * 190; timed('carrot', () => P.drawCarrot(c, { x, y: 960, s: 3, bite: b })); label(c, `carrot bite ${b}`, x, 990); });
  P.drawCarrot(c, { x: 660, y: 960, s: 1 }); timed('seed', () => P.drawSeed(c, { x: 760, y: 940, s: 6, rot: -0.4 })); P.drawSeed(c, { x: 840, y: 950, s: 1.5 }); label(c, 'seed', 790, 990);
  console.log(save(cv, 'build/sheets/model_props_b.jpg', 90));
}

if (on('c')) {
  const { cv, c } = board();
  [0, 0.5, 1].forEach((age, i) => { const x = 250 + i * 470; timed('bed', () => P.drawDogBed(c, { x, y: 250, s: 2.1, age })); label(c, `dog bed age ${age}`, x, 280); });
  P.drawDogBed(c, { x: 1700, y: 150, s: 1, age: 0 }); P.drawDogBed(c, { x: 1700, y: 260, s: 1, age: 1 });
  const fd = [[{ led: 1, food: 0.8 }, 'led 1 food .8'], [{ led: 0, food: 0.3 }, 'led 0 food .3'], [{ age: 0.5, food: 0.1 }, 'age .5'], [{ age: 1, food: 0 }, 'age 1']];
  fd.forEach(([o, n], i) => { const x = 150 + i * 250; timed('feeder', () => P.drawFeeder(c, { x, y: 620, s: 2.4, ...o })); P.feederGlow(c, { x, y: 620, s: 2.4, ...o }); label(c, `feeder ${n}`, x, 648); });
  P.drawFeeder(c, { x: 1090, y: 620, s: 1, led: 1 }); P.feederGlow(c, { x: 1090, y: 620, s: 1, led: 1 });
  const cups = [0, 0.3, 0.6, 1];
  cups.forEach((sp, i) => { const x = 1260 + i * 150; timed('cup', () => P.drawCup(c, { x, y: 620, s: 2.4, spill: sp })); label(c, `cup spill ${sp}`, x + 20, 648); });
  const bags = [[{ torn: 0 }, 'torn 0'], [{ torn: 0.5 }, 'torn .5'], [{ torn: 1 }, 'torn 1'], [{ torn: 1, age: 1 }, 'torn 1 age 1']];
  bags.forEach(([o, n], i) => { const x = 220 + i * 470; timed('bag', () => P.drawKibbleBag(c, { x, y: 960, s: 1.9, ...o })); label(c, `kibble bag ${n}`, x, 990); });
  P.drawKibbleBag(c, { x: 1760, y: 760, s: 0.8, torn: 1 });
  console.log(save(cv, 'build/sheets/model_props_c.jpg', 90));
}

if (on('d')) {
  const { cv, c } = board();
  const bins = [[{}, 'tip 0'], [{ tip: 0.35 }, 'tip .35'], [{ tip: 0.7 }, 'tip .7'], [{ tip: 1 }, 'tip 1'], [{ age: 1 }, 'age 1']];
  bins.forEach(([o, n], i) => { const x = 110 + i * 300 + (i === 4 ? 260 : 0); timed('bin', () => P.drawBin(c, { x, y: 300, s: 2, ...o })); label(c, `bin ${n}`, x + 30, 328); });
  P.drawBin(c, { x: 1830, y: 300, s: 0.8 });
  [0, 0.5, 1].forEach((age, i) => { const x = 330 + i * 600; timed('bench', () => P.drawBench(c, { x, y: 620, s: 2, age })); label(c, `bench age ${age}`, x, 648); });
  P.drawBench(c, { x: 1780, y: 420, s: 0.7, age: 0 });
  timed('cage', () => P.drawCageRelic(c, { x: 230, y: 1010, s: 2.3 })); label(c, 'cage relic', 230, 1040); P.drawCageRelic(c, { x: 540, y: 1010, s: 0.9 });
  const tvs = [[{ on: 1 }, 'on'], [{ noise: 1 }, 'noise'], [{ age: 0.5 }, 'age .5'], [{ age: 1 }, 'age 1']];
  tvs.forEach(([o, n], i) => { const x = 800 + i * 310; timed('tv', () => P.drawTV(c, { x, y: 1010, s: 1.15, t: T, ...o })); P.tvGlow(c, { x, y: 1010, s: 1.15, t: T, ...o }); label(c, `tv ${n}`, x, 1040); });
  console.log(save(cv, 'build/sheets/model_props_d.jpg', 90));
}

if (on('wild') || on('wild2')) {
  const { drawDeer, drawFox, deerStride, foxStride } = await import('../src/chars/wild.js');
  if (on('wild')) {
    const { cv, c } = board();
    const cells = [
      ['doe stand', { v: 'doe' }], ['doe graze', { v: 'doe', pose: 'graze' }], ['doe alert', { v: 'doe', pose: 'alert', mood: 'alert' }], ['stag stand', { v: 'stag' }],
      ['stag lower (threat)', { v: 'stag', pose: 'lower', mood: 'angry' }], ['stag alert', { v: 'stag', pose: 'alert' }], ['fawn stand', { v: 'fawn' }], ['fawn graze / scared', { v: 'fawn', pose: 'alert', mood: 'scared' }],
    ];
    cells.forEach(([name, o], i) => { const col = i % 4, row = Math.floor(i / 4), x = 230 + col * 470, y = 400 + row * 420; timed('deer', () => drawDeer(c, { x, y, s: 1.45, t: T, seed: i, ...o })); label(c, name, x, y + 30); });
    for (let i = 0; i < 6; i++) { drawDeer(c, { x: 150 + i * 320, y: 1040, s: 0.62, t: T, v: ['doe', 'stag', 'fawn'][i % 3], flip: i > 2 ? -1 : 1, pose: i === 4 ? 'graze' : 'stand' }); }
    console.log(save(cv, 'build/sheets/model_wild_deer.jpg', 90));
  }
  if (on('wild2')) {
    const { cv, c } = board();
    for (let i = 0; i < 6; i++) { const x = 170 + i * 315; timed('deer', () => drawDeer(c, { x, y: 250, s: 0.95, t: T, v: 'doe', gait: 'walk', phase: i / 6 })); label(c, `walk ${(i / 6).toFixed(2)}`, x, 276); }
    for (let i = 0; i < 6; i++) { const x = 170 + i * 315; timed('deer', () => drawDeer(c, { x, y: 540, s: 0.95, t: T, v: i % 2 ? 'stag' : 'doe', gait: 'bound', phase: i / 6, mood: 'scared' })); label(c, `bound ${(i / 6).toFixed(2)}`, x, 566); }
    const fx = [['stand', {}], ['sit', { pose: 'sit' }], ['crouch', { pose: 'crouch', mood: 'alert' }], ['alert', { mood: 'alert', look: [0.8, -0.3] }], ['flip', { flip: -1, mood: 'happy' }]];
    fx.forEach(([n, o], i) => { const x = 180 + i * 380; timed('fox', () => drawFox(c, { x, y: 800, s: 2.1, t: T, ...o })); label(c, `fox ${n}`, x, 826); });
    for (let i = 0; i < 6; i++) { const x = 150 + i * 240; timed('fox', () => drawFox(c, { x, y: 1010, s: 1.25, t: T, gait: 'trot', phase: i / 6 })); label(c, `trot ${(i / 6).toFixed(2)}`, x, 1036); }
    drawFox(c, { x: 1640, y: 1010, s: 0.6, t: T }); drawFox(c, { x: 1760, y: 1010, s: 0.6, t: T, pose: 'sit', flip: -1 });
    console.log('strides', deerStride('walk', 'doe', 1).toFixed(1), deerStride('bound', 'stag', 1).toFixed(1), foxStride('trot', 1).toFixed(1));
    console.log(save(cv, 'build/sheets/model_wild_gaits.jpg', 90));
  }
}
report();
