// Model sheets for the bird rigs.  node scripts/model_birds.mjs [t]  -> build/sheets/model_birds_*.jpg
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt } from '../src/engine/draw.js';
import { drawMacaw, drawParrot, drawHawk, hawkShadow, drawPigeon, flock, drawButterfly, drawNest } from '../src/chars/birds.js';

loadFonts();
const T = +(process.argv[2] || 1.3);

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y, size = 20) => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size, color: '#2a3550' });
const perch = (c, x, y, w = 70, th = 9) => {
  c.fillStyle = '#5b4030'; c.beginPath(); c.roundRect(x - w, y - 1, w * 2, th, th / 2); c.fill();
  c.fillStyle = '#8a6648'; c.beginPath(); c.roundRect(x - w, y - 1, w * 2, th * 0.4, th / 2); c.fill();
};
const time = (fn, n = 40) => { fn(); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(i); return (performance.now() - t0) / n; };

// ---- sheet 1: macaw poses, flap strip, ages
{
  const { cv, c } = board();
  const cells = [
    ['perch neutral', {}],
    ['happy + bob', { mood: 'happy', bob: 1 }],
    ['sad', { mood: 'sad' }],
    ['alert', { mood: 'alert' }],
    ['asleep', { mood: 'asleep' }],
    ['talk', { talk: 0.9, tilt: -0.3 }],
    ['tilt', { tilt: 0.9, look: [0.6, -0.4] }],
    ['headTurn', { headTurn: 1 }],
    ['preen', { preen: 1 }],
    ['eat', { eat: 1, talk: 0.4 }],
    ['shuffle', { shuffle: 0.25, mood: 'happy' }],
    ['wings 1', { wings: 1, mood: 'happy' }],
    ['land', { pose: 'land', flap: 0.1 }],
  ];
  cells.forEach(([name, o], i) => {
    const col = i % 7, row = Math.floor(i / 7), x = 130 + col * 262, y = 215 + row * 330;
    if (o.pose !== 'land') perch(c, x, y, 60);
    else perch(c, x, y, 40);
    drawMacaw(c, { x, y, s: 1.3, t: T, ...o });
    label(c, name, x + 40, y + 34);
  });
  // flap cycle
  for (let i = 0; i < 8; i++) {
    const x = 150 + i * 232, y = 870;
    drawMacaw(c, { x, y, s: 0.82, t: T, pose: 'fly', flap: i / 8 });
    label(c, `fly flap ${(i / 8).toFixed(3)}`, x, y + 110, 17);
  }
  // ages
  [0, 0.5, 1].forEach((age, i) => {
    const x = 1700 - 0 + (i - 2) * 0, y = 0;
  });
  console.log(save(cv, 'build/sheets/model_birds_macaw.jpg', 90));
}

// ---- sheet 2: close-ups (moods, talk, age) and small sizes
{
  const { cv, c } = board();
  const faces = [
    ['neutral', {}], ['happy', { mood: 'happy' }], ['sad', { mood: 'sad' }], ['alert', { mood: 'alert' }], ['asleep', { mood: 'asleep' }],
    ['talk 0.8', { talk: 0.8 }], ['old (age 1) sad', { age: 1, mood: 'sad' }], ['old talk', { age: 1, talk: 0.6 }],
  ];
  faces.forEach(([name, o], i) => {
    const col = i % 4, row = Math.floor(i / 4), x = 130 + col * 330, y = 30 + row * 300;
    c.save(); c.beginPath(); c.rect(x - 120, y, 310, 262); c.clip();
    drawMacaw(c, { x: x - 30, y: y + 520, s: 4, t: T, ...o });
    c.restore();
    label(c, name, x + 35, y + 278);
  });
  // ages, full body
  [0, 0.5, 1].forEach((age, i) => {
    const x = 1480 + i * 150, y = 300;
    perch(c, x, y, 50);
    drawMacaw(c, { x, y, s: 1.15, t: T + i, age, mood: age === 1 ? 'sad' : 'neutral' });
    label(c, `age ${age}`, x + 30, y + 26);
  });
  [0, 1].forEach((age, i) => { drawMacaw(c, { x: 1560 + i * 190, y: 560, s: 0.6, t: T, pose: 'fly', flap: 0.1 + i * 0.45, age }); });
  label(c, 'fly age 0 / 1', 1640, 610);
  // small sizes
  [0.6, 0.4, 0.25, 0.15].forEach((s, i) => {
    const x = 120 + i * 150, y = 800;
    perch(c, x, y, 60 * s, 6 * s + 2);
    drawMacaw(c, { x, y, s, t: T, mood: i % 2 ? 'happy' : 'neutral' });
    drawMacaw(c, { x: x + 10, y: y + 190, s, t: T, pose: 'fly', flap: 0.12 + i * 0.3 });
    label(c, `s ${s}`, x, y + 240, 17);
  });
  // landing sequence + glide
  [0, 0.25, 0.5, 0.75].forEach((f, i) => { perch(c, 780 + i * 190, 880, 36); drawMacaw(c, { x: 780 + i * 190, y: 880, s: 0.8, t: T, pose: 'land', flap: f }); });
  label(c, 'land flap 0 / .25 / .5 / .75', 1060, 930, 17);
  drawMacaw(c, { x: 1700, y: 800, s: 0.8, t: T, pose: 'fly', glide: 1, flip: -1 }); label(c, 'glide, flip -1', 1700, 880, 17);
  drawMacaw(c, { x: 1700, y: 980, s: 0.7, t: T, pose: 'fly', flap: 0.5, pitch: 0.5 }); label(c, 'pitch 0.5', 1700, 1050, 17);
  console.log(save(cv, 'build/sheets/model_birds_faces.jpg', 90));
}

// ---- sheet 3: variants, hawk, pigeons, flock, butterfly, nest
{
  const { cv, c } = board();
  ['parakeet', 'amazon', 'budgie', 'conure'].forEach((v, i) => {
    const x = 110 + i * 250, y = 230;
    perch(c, x, y, 50, 7);
    drawParrot(c, { x, y, s: 2, t: T + i, v, mood: i === 1 ? 'happy' : 'neutral', talk: i === 3 ? 0.6 : 0 });
    label(c, v, x + 20, y + 28);
    drawParrot(c, { x: x + 10, y: 480, s: 1.6, t: T, v, pose: 'fly', flap: 0.08 + i * 0.27 });
    drawParrot(c, { x: x + 100, y: 360, s: 1, t: T, v, pose: 'land', flap: 0.2 });
    // peek out of a hole
    c.fillStyle = '#7a5a3c'; c.fillRect(x - 70, 560, 150, 120);
    c.fillStyle = '#1a110c'; c.beginPath(); c.ellipse(x, 628, 42, 44, 0, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.ellipse(x, 628, 42, 44, 0, 0, Math.PI * 2); c.clip();
    drawParrot(c, { x: x - 6, y: 672, s: 1.9, t: T, v, pose: 'peek', mood: i % 2 ? 'alert' : 'neutral', tilt: i === 2 ? 0.5 : 0 });
    c.restore();
  });
  label(c, 'perch (s 2) / land (s 1) / fly (s 1.6) / peek (s 1.9, clipped to hole by the sheet)', 500, 706, 17);
  // same-scale lineup
  perch(c, 330, 990, 300, 7);
  drawMacaw(c, { x: 90, y: 990, s: 1, t: T });
  ['amazon', 'parakeet', 'conure', 'budgie'].forEach((v, i) => drawParrot(c, { x: 210 + i * 95, y: 990, s: 1, t: T + i, v, flip: i % 2 ? -1 : 1, mood: 'happy', preen: i === 2 ? 1 : 0, headTurn: i === 1 ? 1 : 0 }));
  label(c, 'same s = 1', 600, 950, 17);
  // hawk + shadow
  c.fillStyle = '#9fbf7a'; c.fillRect(1120, 330, 800, 150);
  hawkShadow(c, 1280, 420, 0.8, 0.3); hawkShadow(c, 1650, 400, 0.45, 0.3, 0.3);
  drawHawk(c, { x: 1270, y: 150, s: 1.1, t: T }); label(c, 'hawk', 1270, 300);
  drawHawk(c, { x: 1560, y: 110, s: 0.6, t: T, bank: 0.8 }); label(c, 'bank .8', 1560, 200, 17);
  drawHawk(c, { x: 1780, y: 110, s: 0.6, t: T, bank: -0.8, flip: -1 }); label(c, 'bank -.8 flip', 1780, 200, 17);
  [0.25, 0.75].forEach((f, i) => { drawHawk(c, { x: 1560 + i * 220, y: 262, s: 0.5, t: T, flap: f }); });
  label(c, 'flap .25 / .75 + hawkShadow', 1670, 316, 17);
  // pigeons
  const pg = [['stand', {}], ['peck', { pose: 'peck', t: 0.25 }], ['peck', { pose: 'peck', t: 0.48 }], ['walk', { walk: 0.3 }], ['fly', { pose: 'fly', flap: 0.05 }], ['fly', { pose: 'fly', flap: 0.5 }]];
  pg.forEach(([name, o], i) => {
    const x = 1170 + i * 132, y = o.pose === 'fly' ? 580 : 620;
    drawPigeon(c, { x, y, s: 1.5, t: T, seed: i, v: ['blue', 'dark', 'blue', 'pale', 'red', 'blue'][i], ...o });
    label(c, name, x, 648, 17);
  });
  // flock panel
  c.fillStyle = lin(c, 0, 700, 0, 1060, [[0, '#f6c98a'], [1, '#f3e3c0']]); c.fillRect(760, 720, 1140, 340);
  flock(c, { x: 760, y: 720, w: 700, h: 340, n: 200, t: T + 3, seed: 3, dir: 1, spread: 0.55 });
  flock(c, { x: 1480, y: 740, w: 400, h: 300, n: 90, t: T + 3, seed: 5, dir: -1, wheel: 1, size: 0.8 });
  label(c, 'flock n 200 (stream)                                                       n 90 wheel 1', 1300, 734, 17);
  // butterflies + nest
  ['#f29a2e', '#6aa8f0', '#f4e04d', '#f0f0f0'].forEach((color, i) => drawButterfly(c, { x: 1150 + i * 70, y: 520, s: 2 - i * 0.4, t: T + i * 0.37, seed: i, color }));
  drawNest(c, { x: 1560, y: 560, s: 1.2, eggs: 3, seed: 2 }); drawNest(c, { x: 1740, y: 560, s: 0.8, eggs: 0, seed: 4 });
  console.log(save(cv, 'build/sheets/model_birds_others.jpg', 90));
}

// ---- timings
{
  const cv = createCanvas(1920, 1080), c = cv.getContext('2d');
  const r = (name, ms) => console.log(`${name.padEnd(26)} ${ms.toFixed(2)} ms`);
  r('macaw perch s1', time((i) => drawMacaw(c, { x: 400, y: 600, s: 1, t: i * 0.04 })));
  r('macaw perch s4 talk', time((i) => drawMacaw(c, { x: 400, y: 1500, s: 4, t: i * 0.04, talk: 0.5, mood: 'happy' })));
  r('macaw fly s1', time((i) => drawMacaw(c, { x: 400, y: 600, s: 1, t: i * 0.04, pose: 'fly' })));
  r('macaw land s1', time((i) => drawMacaw(c, { x: 400, y: 600, s: 1, t: i * 0.04, pose: 'land' })));
  r('parakeet perch s1', time((i) => drawParrot(c, { x: 400, y: 600, s: 1, t: i * 0.04 })));
  r('budgie peek s2', time((i) => drawParrot(c, { x: 400, y: 600, s: 2, v: 'budgie', pose: 'peek', t: i * 0.04 })));
  r('hawk s1', time((i) => drawHawk(c, { x: 900, y: 500, s: 1, t: i * 0.04 })));
  r('hawkShadow', time(() => hawkShadow(c, 900, 500, 1, 0.3)));
  r('pigeon stand', time((i) => drawPigeon(c, { x: 400, y: 600, s: 1, t: i * 0.04 })));
  r('pigeon fly', time((i) => drawPigeon(c, { x: 400, y: 600, s: 1, t: i * 0.04, pose: 'fly' })));
  r('flock 200', time((i) => flock(c, { x: 0, y: 0, w: 1920, h: 600, n: 200, t: i * 0.04, seed: 2 })));
  r('flock 300 wheel', time((i) => flock(c, { x: 0, y: 0, w: 1920, h: 600, n: 300, t: i * 0.04, seed: 2, wheel: 1 })));
  r('butterfly', time((i) => drawButterfly(c, { x: 400, y: 600, s: 1, t: i * 0.04 })));
  r('nest', time(() => drawNest(c, { x: 400, y: 600, s: 1, eggs: 3 })));
  // robustness: junk options must not throw
  for (const fn of [drawMacaw, drawParrot, drawHawk, drawPigeon, flock, drawButterfly, drawNest]) {
    fn(c); fn(c, {}); fn(c, { x: NaN, s: 'a', v: 'nope', pose: 'zzz', mood: 'grumpy', look: 'x', t: -1e4, flap: -3.7, age: 9, talk: -2, colors: [], n: 1e6 > 0 ? 50 : 0, eggs: 99, shuffle: 1e3, headTurn: -5 });
  }
  hawkShadow(c); hawkShadow(c, 1, 2);
  for (let t = -5; t < 40; t += 0.37) for (const pose of ['perch', 'fly', 'land', 'peek']) drawParrot(c, { x: 300, y: 300, t, pose, v: 'amazon', headTurn: Math.sin(t), preen: (t % 1 + 1) % 1, eat: Math.abs(Math.cos(t)), wings: Math.abs(Math.sin(t * 2)) });
  console.log('robustness ok');
}
