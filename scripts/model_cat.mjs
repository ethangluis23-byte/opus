// Model sheets for the cat rig.  node scripts/model_cat.mjs [t]  -> build/sheets/model_cat_poses.jpg, model_cat_faces.jpg
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt, rrect, fill } from '../src/engine/draw.js';
import { drawCat, drawMouse, catStride, mouseStride } from '../src/chars/cat.js';

loadFonts();
const T = +(process.argv[2] || 1.3);

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y, color = '#2a3550') => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 19, color });
const night = (c, x, y, w, h) => fill(c, rrect(x, y, w, h, 14), lin(c, 0, y, 0, y + h, [[0, '#141a36'], [1, '#2a2f4e']]));
const scratch = createCanvas(64, 64).getContext('2d');

// ---- sheet 1: poses, gaits, variants ----
{
  const { cv, c } = board();
  const S = 1.75, CW = 274, CH = 270;
  const cells = [
    ['stand neutral', {}], ['walk curious', { gait: 'walk', phase: 0.15, mood: 'curious' }], ['trot alert', { gait: 'trot', phase: 0.3, mood: 'alert' }],
    ['run (gathered)', { gait: 'run', phase: 0.05 }], ['run (stretched)', { gait: 'run', phase: 0.55 }], ['stalk (gait) hunting', { gait: 'stalk', phase: 0.3, mood: 'hunting' }],
    ['crouch hunting', { pose: 'crouch', mood: 'hunting', look: [0.6, 0.2] }],
    ['sit', { pose: 'sit' }], ['sit, paw tap + meow', { pose: 'sit', paw: 1, mouth: 0.55, mood: 'curious', look: [0.5, -0.5] }],
    ['loaf happy', { pose: 'loaf', mood: 'happy', t: T + 0.6 }], ['curl asleep', { pose: 'curl', mood: 'asleep' }], ['lie (sphinx) sleepy', { pose: 'lie', mood: 'sleepy' }],
    ['tuxedo arch + hiss', { v: 'tuxedo', pose: 'arch', mood: 'angry', flip: -1, dx: 20 }], ['scared', { mood: 'scared', pose: ['stand', 'crouch', 0.5] }],
    ['leap k 0 (take-off)', { pose: 'leap', k: 0, mood: 'hunting', dx: -20 }], ['leap k 0.5, air 25', { pose: 'leap', k: 0.5, air: 25, mood: 'hunting', dx: -20 }],
    ['leap k 1 (landing)', { pose: 'leap', k: 1, mood: 'alert', dx: -30 }], ['down stairs (slope 0.4)', { gait: 'stalk', phase: 0.2, mood: 'hunting', v: 'orange20', slope: 0.4, dy: -40, slopeLine: 1 }],
    ['climbing (slope -0.35)', { gait: 'walk', phase: 0.6, mood: 'alert', slope: -0.35, dy: 10, slopeLine: 1 }], ['wet + eyeShine (night)', { pose: 'loaf', mood: 'alert', wet: 1, eyeShine: 1, blink: 0, look: [-0.2, 0], night: 1 }],
    ['look back, tilt', { flip: -1, mood: 'curious', look: [-0.9, -0.3], tilt: 0.25, dx: 10 }],
    ['orange20 walk', { v: 'orange20', gait: 'walk', phase: 0.6 }], ['orange50 trot', { v: 'orange50', gait: 'trot', phase: 0.8, mood: 'alert' }],
    ['orange200 stalk', { v: 'orange200', gait: 'stalk', phase: 0.1, mood: 'hunting', pose: 'crouch' }], ['tuxedo walk', { v: 'tuxedo', gait: 'walk', phase: 0.4, mood: 'curious' }],
    ['grey sit happy', { v: 'grey', pose: 'sit', mood: 'happy' }], ['mouse stand / run / sniff', { mice: 1 }], ['to scale: cat s 1 + mouse s 1', { scale: 1 }],
  ];
  cells.forEach(([name, o], i) => {
    const col = i % 7, row = Math.floor(i / 7), x0 = col * CW, y0 = row * CH, gx = x0 + CW / 2 + (o.dx ?? 0), gyy = y0 + 222 + (o.dy ?? 0);
    if (o.night) night(c, x0 + 6, y0 + 6, CW - 12, CH - 12);
    if (o.slopeLine) { c.strokeStyle = 'rgba(42,53,80,0.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(gx - 120, gyy - 120 * Math.tan(o.slope)); c.lineTo(gx + 120, gyy + 120 * Math.tan(o.slope)); c.stroke(); }
    if (o.mice) {
      drawMouse(c, { x: x0 + 52, y: gyy, s: 4, t: T });
      drawMouse(c, { x: x0 + 140, y: gyy - 50, s: 4, t: T, pose: 'run', phase: 0.3 });
      drawMouse(c, { x: x0 + 215, y: gyy, s: 4, t: T, pose: 'sniff' });
    } else if (o.scale) {
      drawCat(c, { x: x0 + 95, y: gyy, s: 1, t: T, mood: 'hunting', pose: 'crouch' });
      drawMouse(c, { x: x0 + 200, y: gyy, s: 1, t: T, pose: 'run', phase: 0.7 });
    } else drawCat(c, { x: gx, y: gyy, s: S, t: o.t ?? T, seed: i, ...o });
    label(c, name, x0 + CW / 2, y0 + 254, o.night ? '#dfe6ff' : undefined);
  });
  console.log(save(cv, 'build/sheets/model_cat_poses.jpg', 90));
}

// ---- sheet 2: moods close-up, eye shine, mouth, variant faces ----
{
  const { cv, c } = board();
  const faces = [
    ['neutral', {}], ['curious (tilt)', { mood: 'curious', tilt: -0.18 }], ['alert', { mood: 'alert' }], ['hunting', { mood: 'hunting' }],
    ['scared', { mood: 'scared' }], ['angry (hiss)', { mood: 'angry' }], ['sleepy', { mood: 'sleepy' }],
    ['asleep', { mood: 'asleep', pose: 'stand' }], ['happy (slow blink)', { mood: 'happy', t: 2.5 }], ['meow', { mouth: 0.6, mood: 'curious', look: [0.2, -0.6] }],
    ['eyeShine (night)', { eyeShine: 1, mood: 'alert', night: 1 }], ['tuxedo', { v: 'tuxedo', mood: 'curious' }], ['grey tabby', { v: 'grey' }],
    ['orange200 (notch)', { v: 'orange200', mood: 'alert' }],
  ];
  const s = 5.2;
  faces.forEach(([name, o], i) => {
    const col = i % 7, row = Math.floor(i / 7), x0 = 12 + col * 272, y0 = 20 + row * 520, cw = 260, ch = 470;
    const a = drawCat(scratch, { x: 0, y: 0, s, t: o.t ?? T, ...o, shadow: false });
    const ox = x0 + cw / 2 - a.head[0] + 8, oy = y0 + ch * 0.55 - a.head[1];
    c.save(); c.beginPath(); c.rect(x0, y0, cw, ch); c.clip();
    if (o.night) night(c, x0, y0, cw, ch);
    drawCat(c, { x: ox, y: oy, s, t: o.t ?? T, ...o, shadow: false });
    c.restore();
    label(c, name, x0 + cw / 2, y0 + ch + 18);
  });
  console.log(save(cv, 'build/sheets/model_cat_faces.jpg', 90));
}

// ---- timing ----
{
  const cv = createCanvas(1920, 1080), c = cv.getContext('2d');
  const opts = [{}, { gait: 'walk' }, { gait: 'run' }, { pose: 'sit', mood: 'happy' }, { pose: 'crouch', gait: 'stalk', mood: 'hunting' },
    { pose: 'curl', mood: 'asleep' }, { pose: 'leap', k: 0.4, air: 20 }, { v: 'tuxedo', pose: 'arch', mood: 'angry' }, { wet: 1, eyeShine: 1, pose: 'loaf' }];
  const run = (n) => { for (let i = 0; i < n; i++) drawCat(c, { x: 600, y: 700, s: 1.5, t: i * 0.07, phase: i * 0.05, ...opts[i % opts.length] }); };
  run(40);
  const t0 = performance.now(); run(200);
  const ms = (performance.now() - t0) / 200;
  const t1 = performance.now(); for (let i = 0; i < 200; i++) drawMouse(c, { x: 600, y: 700, s: 3, t: i * 0.07, phase: i * 0.1, pose: ['stand', 'run', 'sniff'][i % 3] });
  console.log(`drawCat ${ms.toFixed(2)} ms/draw at s 1.5 (200 draws, mixed poses); drawMouse ${((performance.now() - t1) / 200).toFixed(2)} ms`);
  console.log('catStride walk/trot/run/stalk at s 1:', ['walk', 'trot', 'run', 'stalk'].map((g) => catStride(g).toFixed(1)).join(' / '), '· mouseStride(1):', mouseStride(1));
}
