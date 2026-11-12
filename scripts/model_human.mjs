// Model sheets for the human figures.  node scripts/model_human.mjs [t]
//   -> build/sheets/model_human.jpg (every who × key poses), model_human_poses.jpg (story poses with props),
//      model_human_fx.jpg (vanish 0 / 0.5 / 0.9 + fx, leash drop, bike, close-up hands); prints ms per draw.
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt, rrect, fill, line } from '../src/engine/draw.js';
import { drawHuman, drawVanishFx, drawLeash, drawBike, drawHand, drawCup, PEOPLE, humanStride, seatHeight } from '../src/chars/human.js';
import { drawDog } from '../src/chars/dog.js';

loadFonts();
const T = +(process.argv[2] || 1.3);

function board(w = 1920, h = 1080, dark = false) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = dark ? lin(c, 0, 0, 0, h, [[0, '#2a3346'], [1, '#141a26']]) : lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y, col = '#2a3550') => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 18, color: col });
// A simple bench / café chair for seated poses (the scene's set draws the real one).
function bench(c, x, y, s, who, w = 150) {
  const sh = seatHeight(who, 1) * s;
  const seat = rrect(x - w * s * 0.5, y - sh - 6 * s, w * s, 9 * s, 3 * s);
  c.fillStyle = '#6b4a32'; c.fillRect(x - w * s * 0.42, y - sh, 7 * s, sh); c.fillRect(x + w * s * 0.36, y - sh, 7 * s, sh);
  fill(c, seat, '#9a6a44'); line(c, seat, '#4a2e1c', 2);
  c.fillStyle = '#8a5d3b'; c.fillRect(x - w * s * 0.5, y - sh - 70 * s, 8 * s, 64 * s);
}

// ---------------------------------------------------------------- sheet 1: every who × key poses
{
  const { cv, c } = board();
  const whos = ['boy', 'girl', 'mom', 'dad', 'grandma', 'man', 'woman', 'jogger', 'elder'];
  const poses = [
    ['stand', {}], ['walk', { pose: 'walk', phase: 0.15 }], ['run', { pose: 'run', phase: 0.42 }],
    ['wave', { pose: 'wave' }], ['sit + hold', { pose: 'sit', arm: 'hold' }],
  ];
  const s = 0.44, colW = 1920 / whos.length;
  poses.forEach(([pn, po], row) => {
    const y = 185 + row * 170;
    label(c, pn, 50, y - 130, '#55617a');
    whos.forEach((who, i) => {
      const x = colW * (i + 0.5) + 14;
      if (po.pose === 'sit') bench(c, x - 4, y, s, who, 120);
      drawHuman(c, { x, y, s, t: T + i * 0.37, seed: i ? 0 : 0, who, ...po });
      if (row === 0) label(c, who, x, 26);
    });
  });
  // seeded extras strip
  const ex = ['man', 'woman', 'jogger', 'elder', 'man', 'woman', 'man', 'woman', 'elder', 'jogger', 'man', 'woman', 'man', 'woman', 'elder', 'man', 'woman', 'jogger'];
  ex.forEach((who, i) => drawHuman(c, { x: 60 + i * 105, y: 1065, s: 0.36, t: T + i, seed: i + 1, who, pose: i % 3 === 1 ? 'walk' : 'stand', phase: i * 0.21 }));
  label(c, 'seeded extras (seed 1..18)', 1780, 905, '#55617a');
  console.log(save(cv, 'build/sheets/model_human.jpg', 90));
}

// ---------------------------------------------------------------- sheet 2: story poses at size
{
  const { cv, c } = board();
  const s = 0.95, gy = 470;
  // throw sequence
  [0, 0.38, 0.6, 1].forEach((k, i) => {
    const x = 120 + i * 190;
    const A = drawHuman(c, { x, y: gy, s, who: 'boy', pose: 'throw', k, ball: true, t: T });
    if (k >= 0.6) { c.fillStyle = '#d4e83a'; c.beginPath(); c.arc(A.hand[0] + 40 + (k - 0.6) * 300, A.hand[1] - 20 - (k - 0.6) * 60, 5, 0, 7); c.fill(); }
    label(c, `throw k ${k}`, x, gy + 26);
  });
  // mom waving on a bench
  bench(c, 960, gy, s, 'mom');
  drawHuman(c, { x: 950, y: gy, s, who: 'mom', pose: 'sit', arm: 'wave', t: T });
  label(c, 'mom sit + wave', 960, gy + 26);
  // café customer
  bench(c, 1190, gy, s, 'woman', 90);
  drawHuman(c, { x: 1180, y: gy, s, who: 'woman', seed: 3, pose: 'sit', arm: 'hold', k: 0.2, t: T });
  label(c, 'café: sit + hold', 1190, gy + 26);
  // grandma reach
  drawHuman(c, { x: 1390, y: gy, s, who: 'grandma', pose: 'reach', t: T });
  label(c, 'grandma reach', 1390, gy + 26);
  // girl standing, dad, elder hold
  drawHuman(c, { x: 1560, y: gy, s, who: 'girl', pose: 'wave', t: T + 0.4 });
  label(c, 'girl wave', 1560, gy + 26);
  drawHuman(c, { x: 1760, y: gy, s, who: 'elder', pose: 'hold', t: T, look: [0.3, 0.2] });
  label(c, 'elder hold', 1760, gy + 26);

  // walker with leashed dog (leash drawn in mid so the fist closes over it)
  const g2 = 1010;
  const dogX = 330, ph = 0.3;
  drawDog(c, { x: dogX, y: g2, s: 0.95, v: 'beagle', gait: 'walk', phase: ph, t: T, mood: 'happy' });
  drawHuman(c, { x: 150, y: g2, s, who: 'man', seed: 4, pose: 'walk', arm: 'leash', phase: 0.4, t: T,
    mid: (cc, A) => drawLeash(cc, A.hand[0], A.hand[1], dogX + 52, g2 - 95, { s, slack: 0.4, t: T, groundY: g2 }) });
  label(c, 'walk + leash', 240, g2 + 26);
  // jogger running, kneel hug (memory), cyclist
  drawHuman(c, { x: 560, y: g2, s, who: 'jogger', pose: 'run', phase: 0.15, t: T });
  label(c, 'jogger run', 560, g2 + 26);
  drawDog(c, { x: 860, y: g2, s: 1.0, flip: -1, pose: 'sit', mood: 'happy', t: T });
  drawHuman(c, { x: 720, y: g2, s, who: 'boy', pose: 'kneel', k: 0.15, t: T, mood: 'happy' });
  label(c, 'boy kneel (k 0.15) + Max', 790, g2 + 26);
  drawHuman(c, { x: 1060, y: g2, s, who: 'boy', pose: 'kneel', k: 1, t: T, mood: 'calm',
    mid: (cc) => drawDog(cc, { x: 1150, y: g2, s: 1.0, flip: -1, pose: 'sit', mood: 'happy', t: T }) });
  label(c, 'kneel hug k 1 (dog via mid)', 1090, g2 + 26);
  drawBike(c, { x: 1400, y: g2, s, phase: 0.1, t: T, who: 'man', seed: 7, color: '#2f7fbf' });
  label(c, 'drawBike rider', 1400, g2 + 26);
  drawBike(c, { x: 1700, y: g2, s: 0.95, phase: 0.6, t: T, who: 'girl', color: '#e2577c' });
  drawHuman(c, { x: 1850, y: g2, s, who: 'dad', pose: 'leash', t: T });
  label(c, 'kid bike / dad leash', 1760, g2 + 26);
  console.log(save(cv, 'build/sheets/model_human_poses.jpg', 90));
}

// ---------------------------------------------------------------- sheet 3: vanish, leash drop, hands
{
  const { cv, c } = board(1920, 1080);
  const gy = 470, s = 1.0;
  // street-ish ground strip so the vanish reads against a background
  c.fillStyle = '#b9b2a6'; c.fillRect(0, gy - 4, 1060, 70);
  [0, 0.25, 0.5, 0.7, 0.9].forEach((k, i) => {
    const x = 110 + i * 210, who = i % 2 ? 'mom' : 'boy';
    drawHuman(c, { x, y: gy, s, who, pose: i === 3 ? 'walk' : 'stand', phase: 0.3, t: T, vanish: k });
    drawVanishFx(c, { x, y: gy, s, k, t: T, who });
    label(c, `vanish ${k}`, x, gy + 40);
  });
  // leash drop: walker vanishes, handle falls, rope settles
  const lg = 1010;
  [0, 0.4, 0.8, 1].forEach((f, i) => {
    const x = 120 + i * 250, dx = x + 120;
    drawDog(c, { x: dx, y: lg, s: 0.75, v: 'terrier', t: T, mood: f > 0.5 ? 'sad' : 'happy', look: [-0.6, 0] });
    const A = drawHuman(c, { x, y: lg, s: 0.85, who: 'woman', seed: 5, pose: 'leash', t: T, vanish: Math.min(1, f * 1.4) });
    drawVanishFx(c, { x, y: lg, s: 0.85, k: Math.min(1, f * 1.4), t: T, who: 'woman', seed: 5 });
    drawLeash(c, A.hand[0], A.hand[1], dx + 40, lg - 72, { s: 0.85, fall: f, groundY: lg, t: T });
    label(c, `leash fall ${f}`, x + 60, lg + 30);
  });
  drawCup(c, { x: 1060, y: lg - 14, s: 1.2, rot: 1.4 });
  label(c, 'drawCup', 1060, lg + 30);
  // close-up hands
  c.save(); c.beginPath(); c.rect(1100, 20, 800, 500); c.clip();
  c.fillStyle = '#e9dfcf'; c.fillRect(1100, 20, 800, 500);
  drawHand(c, { x: 1520, y: 300, s: 1.1, rot: -0.35, skin: PEOPLE.grandma.skin, sleeve: PEOPLE.grandma.top.color, age: 1, ring: true, holding: 'seed', t: T });
  c.restore();
  label(c, 'grandma hand: seed', 1500, 540);
  c.save(); c.beginPath(); c.rect(1100, 570, 800, 490); c.clip();
  c.fillStyle = '#e6eadf'; c.fillRect(1100, 570, 800, 490);
  drawHand(c, { x: 1420, y: 840, s: 0.95, rot: -0.15, skin: PEOPLE.girl.skin, sleeve: null, holding: 'carrot', open: 0, bite: 0.3, t: T });
  drawHand(c, { x: 1700, y: 1000, s: 0.55, rot: -1.2, skin: PEOPLE.mom.skin, sleeve: PEOPLE.mom.top.color, open: 1, t: T });
  c.restore();
  label(c, 'girl hand: carrot (bite 0.3) · open hand', 1500, 1068);
  console.log(save(cv, 'build/sheets/model_human_fx.jpg', 90));
}

// ---------------------------------------------------------------- timing
{
  const cv = createCanvas(1920, 1080), c = cv.getContext('2d');
  const cases = [
    ['stand boy', { who: 'boy' }], ['walk man', { who: 'man', pose: 'walk', seed: 3 }], ['run jogger', { who: 'jogger', pose: 'run' }],
    ['sit+hold woman', { who: 'woman', pose: 'sit', arm: 'hold', seed: 2 }], ['throw boy', { who: 'boy', pose: 'throw', ball: true }],
    ['grandma reach', { who: 'grandma', pose: 'reach' }], ['vanish 0.5', { who: 'mom', vanish: 0.5 }],
  ];
  for (const [name, o] of cases) {
    for (let i = 0; i < 20; i++) drawHuman(c, { x: 600, y: 900, s: 1, t: i * 0.1, phase: i * 0.05, k: (i % 10) / 10, ...o });
    const n = 200, t0 = performance.now();
    for (let i = 0; i < n; i++) drawHuman(c, { x: 400 + (i % 10) * 100, y: 900, s: 1, t: i * 0.033, phase: i * 0.031, k: (i % 50) / 50, ...o });
    console.log(`${name.padEnd(16)} ${((performance.now() - t0) / n).toFixed(2)} ms/draw`);
  }
  const n = 100;
  let t0 = performance.now();
  for (let i = 0; i < n; i++) drawBike(c, { x: 900, y: 900, s: 1, phase: i * 0.03, t: i * 0.03 });
  console.log(`${'drawBike+rider'.padEnd(16)} ${((performance.now() - t0) / n).toFixed(2)} ms/draw`);
  t0 = performance.now();
  for (let i = 0; i < n; i++) drawHand(c, { x: 900, y: 600, s: 1, holding: 'seed', t: i * 0.03, age: 1, sleeve: '#a98bc6' });
  console.log(`${'drawHand'.padEnd(16)} ${((performance.now() - t0) / n).toFixed(2)} ms/draw`);
  t0 = performance.now();
  for (let i = 0; i < n; i++) drawVanishFx(c, { x: 900, y: 900, s: 1, k: (i % 100) / 100, t: i * 0.03 });
  console.log(`${'drawVanishFx'.padEnd(16)} ${((performance.now() - t0) / n).toFixed(2)} ms/draw`);
  t0 = performance.now();
  for (let i = 0; i < n; i++) drawLeash(c, 500, 700, 700, 800, { fall: (i % 100) / 100, t: i * 0.03 });
  console.log(`${'drawLeash'.padEnd(16)} ${((performance.now() - t0) / n).toFixed(2)} ms/draw`);
  console.log('walk stride man', humanStride('man').toFixed(1), 'run', humanStride('man', 1, 'run').toFixed(1), 'boy walk', humanStride('boy').toFixed(1));
}
