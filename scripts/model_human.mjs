// Model sheets for the human rig.  node scripts/model_human.mjs [t]  -> build/sheets/model_human_a.jpg, _b.jpg
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt } from '../src/engine/draw.js';
import { drawDog } from '../src/chars/dog.js';
import { PEOPLE, drawHuman, handPos, humanStride, humanHeight, drawVanishFx, drawCyclist, drawBike, THROW_RELEASE } from '../src/chars/human.js';

loadFonts();
const T = +(process.argv[2] || 1.3);
const WHO = Object.keys(PEOPLE);

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y, col = '#2a3550') => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 18, color: col });
const ground = (c, x0, x1, y) => { c.strokeStyle = 'rgba(40,50,80,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); };
const cross = (c, x, y) => { c.strokeStyle = '#d0202a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x + 7, y); c.moveTo(x, y - 7); c.lineTo(x, y + 7); c.stroke(); };

// ---------------- sheet A: presets, walk, run, small sizes
{
  const { cv, c } = board();
  WHO.forEach((who, i) => {
    const x = 105 + i * 190, y = 320;
    drawHuman(c, { who, x, y, s: 0.8, t: T + i, seed: i, smile: 0.35 + (i % 3) * 0.25 });
    label(c, who, x, y + 24);
  });
  ground(c, 30, 1010, 680);
  const st = humanStride('boy', 0.95);
  for (let i = 0; i < 8; i++) drawHuman(c, { who: 'boy', x: 85 + i * 122, y: 680, s: 0.95, t: T + i * 0.1, pose: 'walk', phase: i / 8, smile: 0.8 });
  label(c, `walk cycle (boy), stride ${st.toFixed(0)} px/cycle`, 500, 704);
  ground(c, 1040, 1900, 680);
  for (let i = 0; i < 6; i++) drawHuman(c, { who: 'jogger', x: 1110 + i * 145, y: 680, s: 0.72, t: T + i * 0.1, pose: 'run', phase: i / 6 });
  label(c, 'run cycle (jogger)', 1470, 704);
  ground(c, 30, 1900, 1030);
  ['mom', 'dad', 'grandma', 'walkerB', 'girl'].forEach((who, i) => {
    drawHuman(c, { who, x: 100 + i * 165, y: 1030, s: 0.8, t: T + i, seed: i + 3, pose: 'walk', phase: 0.1 + i * 0.23, flip: i === 3 ? -1 : 1 });
  });
  label(c, 'walk, s 0.8', 430, 1054);
  WHO.forEach((who, i) => {
    drawHuman(c, { who, x: 930 + i * 68, y: 1030, s: 0.45, t: T + i, seed: i, pose: who === 'jogger' ? 'run' : 'walk', phase: i * 0.17, flip: i % 3 === 1 ? -1 : 1 });
  });
  drawDog(c, { x: 1640, y: 1030, s: 0.45, t: T, gait: 'walk', phase: 0.2 });
  drawCyclist(c, { x: 1800, y: 1030, s: 0.45, t: T, phase: 0.3, who: 'walkerA' });
  label(c, 'street size, s 0.45 (with the dog for scale)', 1380, 1054);
  console.log(save(cv, 'build/sheets/model_human_a.jpg', 90));
}

// ---------------- sheet B: sit, throw, kneel, IK, items, vanish, cyclist
{
  const { cv, c } = board();
  // bench
  const by = 330, seat = 92;
  c.fillStyle = '#8a6a4a'; c.fillRect(40, by - seat * 0.8, 330, 9); c.fillRect(60, by - seat * 0.8, 8, seat * 0.8); c.fillRect(340, by - seat * 0.8, 8, seat * 0.8);
  drawHuman(c, { who: 'mom', x: 110, y: by, s: 0.8, t: T, pose: 'sit', seat, wave: 1, smile: 0.9 });
  drawHuman(c, { who: 'girl', x: 250, y: by, s: 0.8, t: T, pose: 'sit', seat, seed: 4 });
  label(c, 'sit (wave) / sit, feet dangle', 190, by + 24);
  drawHuman(c, { who: 'waiter', x: 470, y: by, s: 0.8, t: T, hold: 'cup', seed: 2 });
  drawHuman(c, { who: 'walkerA', x: 610, y: by, s: 0.8, t: T, hold: 'phone', seed: 5, pose: 'walk', phase: 0.3 });
  label(c, 'hold cup / phone', 540, by + 24);
  ground(c, 700, 1900, by);
  [0, 0.22, 0.42, THROW_RELEASE, 0.6, 0.75, 1].forEach((k, i) => {
    const o = { who: 'boy', x: 780 + i * 165, y: by, s: 1, t: T, pose: 'throw', k, hold: k <= THROW_RELEASE ? 'ball' : null, smile: 0.8, look: [0.6, -0.3] };
    drawHuman(c, o);
    label(c, `throw k ${k}`, o.x, by + 24);
  });

  const y2 = 690;
  ground(c, 30, 1900, y2);
  drawHuman(c, { who: 'girl', x: 100, y: y2, s: 1, t: T, pose: 'kneel', handR: [205, y2 - 70], smile: 0.8, look: [0.5, 0.5] });
  cross(c, 205, y2 - 70); label(c, 'kneel + handR', 120, y2 + 24);
  drawHuman(c, { who: 'boy', x: 340, y: y2, s: 1, t: T, pose: 'crouch', smile: 0.9, look: [0.6, 0.5] });
  drawDog(c, { x: 500, y: y2, s: 0.75, t: T, pose: 'sit', mood: 'happy', flip: -1 });
  label(c, 'crouch', 340, y2 + 24);
  drawHuman(c, { who: 'mom', x: 660, y: y2, s: 0.8, t: T, pose: ['stand', 'crouch', 0.5] });
  label(c, "['stand','crouch',0.5]", 660, y2 + 24);
  [[70, -250], [95, -150], [60, -60], [-70, -120]].forEach((q, i) => {
    const x = 860 + i * 190, tx = x + q[0], ty = y2 + q[1];
    const o = { who: i === 2 ? 'grandma' : 'dad', x, y: y2, s: 0.8, t: T, seed: i, handR: [tx, ty], pose: i === 2 ? ['stand', 'crouch', 0.35] : 'stand', look: [0.5, q[1] < -200 ? -0.5 : 0.4] };
    drawHuman(c, o); cross(c, tx, ty);
    const hp = handPos(o); c.fillStyle = '#1a9a3a'; c.beginPath(); c.arc(hp.R[0], hp.R[1], 3.5, 0, 6.3); c.fill();
  });
  label(c, 'handR IK targets (red = target, green = handPos)', 1140, y2 + 24);
  // leash example, flipped
  {
    const o = { who: 'boy', x: 1760, y: y2, s: 0.9, t: T, flip: -1, pose: 'walk', phase: 0.15, handR: [1700, y2 - 95] };
    drawHuman(c, o);
    const hp = handPos(o), dx = 1600, dy = y2 - 62;
    drawDog(c, { x: 1560, y: y2, s: 0.75, t: T, flip: -1, gait: 'walk', phase: 0.3, mood: 'happy' });
    c.strokeStyle = '#b8323a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(hp.R[0], hp.R[1]); c.quadraticCurveTo((hp.R[0] + dx) / 2, dy + 30, dx, dy); c.stroke();
    label(c, 'flip -1, leash from handPos', 1680, y2 + 24);
  }

  // vanish on a dark panel
  const y3 = 1030;
  c.fillStyle = lin(c, 0, 730, 0, 1080, [[0, '#27304f'], [1, '#3a3f58']]); c.fillRect(0, 730, 1180, 350);
  [0, 0.2, 0.4, 0.6, 0.8].forEach((k, i) => {
    const o = { who: i % 2 ? 'boy' : 'walkerB', x: 90 + i * 150, y: y3, s: 0.8, t: T, seed: 7 + i, pose: 'walk', phase: 0.15, vanish: k };
    drawHuman(c, o);
    drawVanishFx(c, { x: o.x, y: o.y, s: o.s, k, seed: o.seed, h: humanHeight(o.who) });
    label(c, `vanish ${k}`, o.x, y3 + 26, '#e8e2cc');
  });
  [0.3, 0.55].forEach((k, i) => {
    const x = 870 + i * 190;
    drawCyclist(c, { x, y: y3, s: 0.6, t: T, phase: 0.2, vanish: k, seed: 3 });
    drawVanishFx(c, { x, y: y3 - 40, s: 0.6, k, seed: 3 });
  });
  label(c, 'cyclist vanish 0.3 / 0.55', 960, y3 + 26, '#e8e2cc');
  drawCyclist(c, { x: 1330, y: y3, s: 0.85, t: T, phase: 0.08, who: 'walkerB', color: '#d9534a' });
  drawCyclist(c, { x: 1580, y: y3, s: 0.6, t: T, phase: 0.55, who: 'boy', flip: -1 });
  drawBike(c, { x: 1730, y: y3, s: 0.6, tilt: 0.5 });
  drawBike(c, { x: 1830, y: y3 - 6, s: 0.6, fall: 1 });
  label(c, 'cyclist / tilt 0.5 / fall 1', 1560, y3 + 26);
  console.log(save(cv, 'build/sheets/model_human_b.jpg', 90));
}

// ---------------- timing
{
  const cv = createCanvas(960, 540), c = cv.getContext('2d');
  const time = (fn, n = 200) => { for (let i = 0; i < 20; i++) fn(i); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(i); return ((performance.now() - t0) / n).toFixed(2); };
  const row = (name, o) => `${name} ${time((i) => drawHuman(c, { x: 480, y: 500, t: i * 0.04, phase: i * 0.03, ...o }))}`;
  console.log('ms/draw s=1 stand:', WHO.map((w) => row(w, { who: w })).join('  '));
  console.log('ms/draw s=0.45 walk:', WHO.map((w) => row(w, { who: w, s: 0.45, pose: 'walk' })).join('  '));
  console.log('ms/draw:', row('boy throw', { who: 'boy', pose: 'throw', k: 0.4, hold: 'ball' }), ' ', row('vanish .5 s.45', { who: 'mom', s: 0.45, pose: 'walk', vanish: 0.5 }),
    ' ', row('vanish .1 s.45', { who: 'mom', s: 0.45, pose: 'walk', vanish: 0.1 }),
    ' cyclist s.45', time((i) => drawCyclist(c, { x: 480, y: 500, s: 0.45, phase: i * 0.03 })),
    ' fx', time((i) => drawVanishFx(c, { x: 480, y: 500, s: 0.45, k: (i % 50) / 50 })));
}
