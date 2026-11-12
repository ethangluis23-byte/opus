// Model sheets for the cat rig.  node scripts/model_cat.mjs [t]  -> build/sheets/model_cat_poses.jpg, model_cat_faces.jpg
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt, rrect, fill } from '../src/engine/draw.js';
import { drawCat, drawMouse, catStride } from '../src/chars/cat.js';

loadFonts();
const T = +(process.argv[2] || 1.3);

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y) => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 19, color: '#2a3550' });
const scratch = createCanvas(64, 64).getContext('2d');

// ---- sheet 1: poses, gaits, variants ----
{
  const { cv, c } = board();
  const S = 1.85;
  const cells = [
    ['stand neutral', { }],
    ['walk curious', { gait: 'walk', phase: 0.15, mood: 'curious' }],
    ['trot', { gait: 'trot', phase: 0.3, mood: 'alert' }],
    ['run (gathered)', { gait: 'run', phase: 0.05 }],
    ['run (stretched)', { gait: 'run', phase: 0.55 }],
    ['stalk hunting', { gait: 'stalk', phase: 0.3, mood: 'hunting' }],
    ['sit', { pose: 'sit' }],
    ['sit, paw tap + meow', { pose: 'sit', paw: 1, mouth: 0.55, mood: 'curious', look: [0.5, -0.5] }],
    ['loaf happy', { pose: 'loaf', mood: 'happy', t: T + 0.6 }],
    ['curl asleep', { pose: 'curl', mood: 'asleep' }],
    ['lie (sphinx) sleepy', { pose: 'lie', mood: 'sleepy' }],
    ['crouch hunting', { pose: 'crouch', mood: 'hunting', look: [0.6, 0.2] }],
    ['leap k 0 (take-off)', { pose: 'leap', k: 0, mood: 'hunting' }],
    ['leap k 0.5, air 25', { pose: 'leap', k: 0.5, air: 25, mood: 'hunting' }],
    ['leap k 1 (landing)', { pose: 'leap', k: 1, mood: 'alert' }],
    ['tuxedo arch + hiss', { v: 'tuxedo', pose: 'arch', mood: 'angry', flip: -1, dx: 30 }],
    ['scared', { mood: 'scared', pose: ['stand', 'crouch', 0.5] }],
    ['wet + eyeShine', { pose: 'loaf', mood: 'alert', wet: 1, eyeShine: 1, look: [-0.2, 0], night: 1 }],
    ['orange20 walk', { v: 'orange20', gait: 'walk', phase: 0.6 }],
    ['orange50 trot', { v: 'orange50', gait: 'trot', phase: 0.8, mood: 'alert' }],
    ['orange200 stalk', { v: 'orange200', gait: 'stalk', phase: 0.1, mood: 'hunting', pose: 'crouch' }],
    ['tuxedo walk', { v: 'tuxedo', gait: 'walk', phase: 0.4, mood: 'curious' }],
    ['grey sit / slope walk', { v: 'grey', pose: 'sit', mood: 'happy', dx: -60, extra: true }],
    ['mouse stand / run / sniff', { mouse: true }],
  ];
  cells.forEach(([name, o], i) => {
    const col = i % 6, row = Math.floor(i / 6), x0 = col * 320, y0 = row * 270, gx = x0 + 160 + (o.dx ?? 0), gyy = y0 + 225;
    if (o.night) fill(c, rrect(x0 + 8, y0 + 8, 304, 254, 14), lin(c, 0, y0, 0, y0 + 270, [[0, '#1a2140'], [1, '#2c3150']]));
    if (o.mouse) {
      drawMouse(c, { x: x0 + 60, y: gyy, s: 3, t: T });
      drawMouse(c, { x: x0 + 160, y: gyy, s: 3, t: T, pose: 'run', phase: 0.3 });
      drawMouse(c, { x: x0 + 255, y: gyy, s: 3, t: T, pose: 'sniff' });
      drawCat(c, { x: x0 + 70, y: gyy - 120, s: 0.9, t: T, mood: 'hunting', pose: 'crouch', shadow: false });
      drawMouse(c, { x: x0 + 150, y: gyy - 120, s: 1, t: T, pose: 'run', phase: 0.7 });
    } else if (o.extra) {
      drawCat(c, { x: gx - 10, y: gyy, s: S * 0.95, t: T, ...o });
      drawCat(c, { x: x0 + 250, y: gyy - 40, s: 1.1, t: T, v: 'orange20', gait: 'stalk', phase: 0.2, mood: 'hunting', slope: 0.38 });
    } else {
      drawCat(c, { x: gx, y: gyy, s: S, t: o.t ?? T, seed: i, ...o });
    }
    label(c, name, x0 + 160, y0 + 252);
  });
  console.log(save(cv, 'build/sheets/model_cat_poses.jpg', 90));
}

// ---- sheet 2: moods close-up, eye shine, mouth, variant faces ----
{
  const { cv, c } = board();
  const faces = [
    ['neutral', {}], ['curious', { mood: 'curious', tilt: -0.18 }], ['alert', { mood: 'alert' }], ['hunting', { mood: 'hunting' }],
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
    if (o.night) fill(c, rrect(x0, y0, cw, ch, 0), lin(c, 0, y0, 0, y0 + ch, [[0, '#121833'], [1, '#262b48']]));
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
    { pose: 'curl', mood: 'asleep' }, { pose: 'leap', k: 0.4, air: 20 }, { v: 'tuxedo', pose: 'arch', mood: 'angry' }];
  const run = (n) => { for (let i = 0; i < n; i++) drawCat(c, { x: 600, y: 700, s: 1.5, t: i * 0.07, phase: i * 0.05, ...opts[i % opts.length] }); };
  run(40);
  const t0 = performance.now(); run(200);
  const ms = (performance.now() - t0) / 200;
  const t1 = performance.now(); for (let i = 0; i < 200; i++) drawMouse(c, { x: 600, y: 700, s: 3, t: i * 0.07, phase: i * 0.1, pose: ['stand', 'run', 'sniff'][i % 3] });
  console.log(`drawCat ${ms.toFixed(2)} ms/draw at s 1.5 (200 draws, mixed poses); drawMouse ${((performance.now() - t1) / 200).toFixed(2)} ms`);
  console.log('strides walk/trot/run/stalk at s 1:', ['walk', 'trot', 'run', 'stalk'].map((g) => catStride(g).toFixed(1)).join(' / '));
}
