// Model sheets for the cat rig.  node scripts/model_cat.mjs [t]  -> build/sheets/model_cat_{poses,faces,gaits}.jpg
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt } from '../src/engine/draw.js';
import { drawCat, catStride, catEyeShine, CATS } from '../src/chars/cat.js';

loadFonts();
const T = +(process.argv[2] || 1.3);

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y, size = 20) => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size, color: '#2a3550' });

// ---- sheet 1: poses ----
{
  const { cv, c } = board();
  const cells = [
    ['stand neutral', {}],
    ['sit happy', { pose: 'sit', mood: 'happy' }],
    ['loaf sleepy', { pose: 'loaf', mood: 'sleepy' }],
    ['curl asleep', { pose: 'curl', mood: 'asleep' }],
    ['crouch hunting', { pose: 'crouch', mood: 'hunting', look: [0.8, 0.1] }],
    ['arch angry (hiss)', { pose: 'arch', mood: 'angry' }],
    ['leap air 0.1', { pose: 'leap', air: 0.1, mood: 'hunting', lift: 40 }],
    ['leap air 0.5', { pose: 'leap', air: 0.5, mood: 'hunting', lift: 90 }],
    ['leap air 0.9', { pose: 'leap', air: 0.9, mood: 'alert', lift: 40 }],
    ['crouch>leap 0.5', { pose: ['crouch', 'leap', 0.5], air: 0, mood: 'hunting' }],
    ['paw tap, headDown', { paw: 0.8, headDown: 0.6, mood: 'alert', look: [0.4, 0.8] }],
    ['sit, headTurn 1, meow', { pose: 'sit', headTurn: 1, mouth: 0.7, look: [0, -0.3] }],
    ['stand, look back', { headTurn: 2, mood: 'alert' }],
    ['scared', { mood: 'scared', pose: ['stand', 'crouch', 0.6] }],
    ['sit>stand 0.5', { pose: ['sit', 'stand', 0.5] }],
  ];
  let ms = 0;
  cells.forEach(([name, o], i) => {
    const col = i % 5, row = Math.floor(i / 5), x = 190 + col * 384, y = 300 + row * 350;
    const t0 = performance.now();
    drawCat(c, { x, y, s: 2.6, t: T, ...o });
    ms += performance.now() - t0;
    label(c, name, x, y + 34);
  });
  console.log(save(cv, 'build/sheets/model_cat_poses.jpg', 90), `avg ${(ms / cells.length).toFixed(2)} ms/cat`);
}

// ---- sheet 2: faces, variants, kitten, silhouette, small ----
{
  const { cv, c } = board();
  ['neutral', 'happy', 'sleepy', 'asleep', 'alert', 'scared', 'hunting', 'angry'].forEach((mood, i) => {
    const x = 125 + i * 238;
    c.save(); c.beginPath(); c.rect(x - 115, 20, 230, 250); c.clip();
    drawCat(c, { x: x - 150, y: 420, s: 4.4, t: T, mood, shadow: 0 });
    c.restore();
    label(c, mood, x, 288);
  });
  [['turn 0.5', { headTurn: 0.5 }], ['turn 1', { headTurn: 1 }], ['turn 1.5', { headTurn: 1.5 }], ['meow', { mouth: 0.8 }], ['tuxedo angry', { v: 'tuxedo', mood: 'angry' }], ['grey happy blink', { v: 'grey', mood: 'happy', blink: 1 }], ['kitten', { kitten: 1, mood: 'alert' }]].forEach(([name, o], i) => {
    const x = 125 + i * 238, k = o.kitten ? 1.55 : 1;
    c.save(); c.beginPath(); c.rect(x - 115, 310, 230, 200); c.clip();
    drawCat(c, { x: x - 112 * (o.kitten ? 0.75 : 1), y: 640 - (o.kitten ? 60 : 0), s: 3.3 * k, t: T, shadow: 0, ...o });
    c.restore();
    label(c, name, x, 528);
  });
  // night eye shine
  c.fillStyle = '#0b1030'; c.fillRect(1680, 310, 230, 200);
  const pn = { x: 1740, y: 500, s: 1.6, t: T, pose: 'crouch', mood: 'hunting', sil: '#141a3c' };
  drawCat(c, pn); catEyeShine(c, pn);
  txt(c, 'sil + catEyeShine', 1795, 528, { font: 'Barlow Semi Condensed', weight: 600, size: 20, color: '#2a3550' });

  const vars = Object.keys(CATS);
  vars.forEach((v, i) => {
    const x = 130 + i * 232, y = 740;
    drawCat(c, { x, y, s: 1.5, t: T + i, v, seed: i });
    label(c, v, x, y + 24);
  });
  drawCat(c, { x: 1530, y: 740, s: 1.5, t: T, kitten: 1, pose: 'sit', mood: 'happy' });
  drawCat(c, { x: 1610, y: 740, s: 1.5, t: T, kitten: 0.5, gait: 'walk', phase: 0.2 });
  label(c, 'kitten 1 / 0.5', 1570, 764);
  drawCat(c, { x: 1780, y: 740, s: 1.5, t: T, sil: '#1a2038', gait: 'walk', phase: 0.3 });
  label(c, 'sil', 1790, 764);
  // small sizes
  const small = [{}, { pose: 'sit' }, { pose: 'loaf' }, { pose: 'curl', mood: 'asleep' }, { pose: 'crouch', mood: 'hunting' }, { pose: 'arch', mood: 'angry' }, { pose: 'leap', lift: 20 }, { gait: 'walk', phase: 0.3 }, { gait: 'run', phase: 0.42 },
    { v: 'tuxedo' }, { v: 'grey', pose: 'sit' }, { v: 'orange200', gait: 'trot', phase: 0.2 }, { kitten: 1 }, { sil: '#1a2038' }, { sil: '#1a2038', pose: 'sit' }, { sil: '#1a2038', pose: 'arch', mood: 'angry' }];
  small.forEach((o, i) => drawCat(c, { x: 70 + i * 118, y: 900, s: 0.5, t: T, ...o }));
  label(c, 's = 0.5', 60, 930);
  small.forEach((o, i) => drawCat(c, { x: 70 + i * 118, y: 1030, s: 0.9, t: T, ...o }));
  label(c, 's = 0.9', 60, 1056);
  console.log(save(cv, 'build/sheets/model_cat_faces.jpg', 90));
}

// ---- sheet 3: gaits ----
{
  const { cv, c } = board();
  const rows = [['walk', [0, 0.2, 0.4, 0.6, 0.8], {}], ['trot', [0, 0.2, 0.4, 0.6, 0.8], { mood: 'happy' }], ['run', [0.1, 0.42, 0.6, 0.75, 0.92], { mood: 'alert' }], ['stalk (crouch)', [0, 0.25, 0.5, 0.75, 0.9], { pose: 'crouch', mood: 'hunting', gait: 'stalk' }]];
  rows.forEach(([gait, phases, o], r) => {
    phases.forEach((phase, i) => {
      const x = 180 + i * 370, y = 210 + r * 215;
      drawCat(c, { x, y, s: 2, t: T, gait: gait.split(' ')[0], phase, ...o });
      label(c, `${gait} ${phase}`, x, y + 26, 17);
    });
  });
  // planted-feet check: the cat advances by stride * phase over a tick grid spaced one stride apart
  const y = 1020, s = 1.5, st = catStride('walk', 'orange', s);
  c.strokeStyle = '#8a93a8'; c.lineWidth = 1;
  for (let x = 60; x < 1900; x += st / 2) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 10); c.stroke(); }
  for (let i = 0; i < 9; i++) { const phase = i * 0.37; drawCat(c, { x: 150 + phase * st * 4.4 / 0.37 / 4.4 + i * 150, y, s, t: T, gait: 'walk', phase: (phase + i * 150 / st) }); }
  label(c, 'walk: x advances by stride x phase', 960, 1056, 17);
  console.log(save(cv, 'build/sheets/model_cat_gaits.jpg', 90));
}

// ---- timing + robustness ----
{
  const cv = createCanvas(1920, 1080), c = cv.getContext('2d');
  const poses = ['stand', 'sit', 'loaf', 'curl', 'crouch', 'arch', 'leap'], moods = ['neutral', 'happy', 'sleepy', 'asleep', 'alert', 'scared', 'hunting', 'angry'];
  let n = 0;
  const t0 = performance.now();
  for (let i = 0; i < 400; i++) {
    drawCat(c, { x: 300 + (i % 20) * 60, y: 400 + (i % 7) * 60, s: 1 + (i % 5) * 0.5, t: i * 0.173, pose: poses[i % 7], mood: moods[i % 8], v: Object.keys(CATS)[i % 6], gait: i % 3 ? 'walk' : 'run', phase: i * 0.07, air: (i % 11) / 10, seed: i });
    n++;
  }
  const dt = (performance.now() - t0) / n;
  // odd inputs must not throw
  drawCat(c, {}); drawCat(c, { pose: 'nope', mood: 'nope', gait: 'nope', v: 'nope', t: -5, phase: -3.3, kitten: 2, paw: 3, headTurn: 9, look: [5, -5], s: 0 });
  drawCat(c, { pose: ['sit', 'nope', 0.5], v: { coat: '#ffffff' }, sil: '#000', tailWrap: 0.5, tailUp: -3, lift: -5 });
  for (let k = 0; k <= 1; k += 0.1) for (const a of poses) for (const b of poses) drawCat(c, { x: 500, y: 500, pose: [a, b, k], t: k * 7, air: k, kitten: k });
  catEyeShine(c, {}); catEyeShine(c, { x: 100, y: 100, mood: 'asleep' });
  console.log(`drawCat avg ${dt.toFixed(2)} ms (mixed poses/sizes), blends + odd inputs ok`);
}
