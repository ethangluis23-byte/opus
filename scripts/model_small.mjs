// Model sheets for the rabbit and the small pets.
//   node scripts/model_small.mjs [rabbit|small|all] [t]  -> build/sheets/model_rabbit_*.jpg, model_small.jpg
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt } from '../src/engine/draw.js';

loadFonts();
const which = process.argv[2] || 'all';
const T = +(process.argv[3] || 1.3);

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y) => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 18, color: '#2a3550', align: 'center' });
const bench = (name, fn, n = 200) => {
  const { c } = board(400, 300);
  for (let i = 0; i < 20; i++) fn(c, i);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(c, i);
  console.log(`${name}: ${((performance.now() - t0) / n).toFixed(2)} ms`);
};

if (which === 'rabbit' || which === 'all') {
  const { drawRabbit, RABBITS, rabbitStride, rabbitIcon } = await import('../src/chars/rabbit.js');
  // sheet 1: poses, moods, hop cycle
  let { cv, c } = board();
  const cells = [
    ['sit neutral', {}],
    ['sit happy', { mood: 'happy' }],
    ['graze', { pose: 'graze' }],
    ['alert', { pose: 'alert', mood: 'alert' }],
    ['freeze', { pose: 'freeze', mood: 'scared' }],
    ['dig', { pose: 'dig' }],
    ['stand', { pose: 'stand' }],
    ['asleep', { mood: 'asleep' }],
    ['scared sit', { mood: 'scared' }],
    ['sit>alert 0.5, earTurn 1', { pose: ['sit', 'alert', 0.5], earTurn: 1 }],
    ['earTurn -1, look up', { earTurn: -1, look: [-0.6, -0.6] }],
    ['flip, munch', { flip: -1, munch: 1 }],
  ];
  cells.forEach(([name, o], i) => {
    const col = i % 6, row = Math.floor(i / 6), x = 160 + col * 320, y = 270 + row * 290;
    drawRabbit(c, { x, y, s: 3.1, t: T, ...o });
    label(c, name, x, y + 30);
  });
  for (let i = 0; i < 10; i++) {
    const x = 110 + i * 190, y = 900, ph = i / 10;
    c.fillStyle = '#b9b3a4'; c.fillRect(x - 90, y, 180, 2);
    drawRabbit(c, { x, y, s: 2, t: T, gait: 'hop', phase: ph });
    label(c, `hop ${ph.toFixed(1)}`, x, y + 28);
  }
  for (let i = 0; i < 8; i++) {
    const x = 130 + i * 240, y = 1040, ph = i / 8;
    drawRabbit(c, { x, y, s: 1.25, t: T, gait: 'run', phase: ph, mood: 'scared', v: 'sandy200' });
    label(c, `run ${ph.toFixed(2)}`, x + 70, y - 60);
  }
  console.log(save(cv, 'build/sheets/model_rabbit_poses.jpg', 90));

  // sheet 2: faces, variants, kits, icon, small sizes
  ({ cv, c } = board());
  ['neutral', 'happy', 'alert', 'scared', 'asleep'].forEach((mood, i) => {
    const x = 190 + i * 330;
    c.save(); c.beginPath(); c.rect(x - 160, 20, 320, 400); c.clip();
    drawRabbit(c, { x: x - 110, y: 520, s: 6.4, t: T, mood, shadow: 0 });
    c.restore();
    label(c, mood, x, 440);
  });
  c.save(); c.beginPath(); c.rect(1680, 20, 230, 400); c.clip();
  drawRabbit(c, { x: 1730, y: 420, s: 6.4, t: T, pose: 'graze', v: 'sandy200', shadow: 0 }); c.restore();
  label(c, 'graze sandy200', 1795, 440);
  Object.keys(RABBITS).forEach((v, i) => {
    const x = 130 + i * 235, y = 690;
    drawRabbit(c, { x, y, s: 2.4, t: T + i, v, seed: i, pose: i === 3 ? 'alert' : 'sit' });
    label(c, v, x, y + 28);
  });
  [['kit 1', { kit: 1 }], ['kit graze', { kit: 1, pose: 'graze' }], ['kit hop', { kit: 1, gait: 'hop', phase: 0.42 }], ['kit 0.5 alert', { kit: 0.5, pose: 'alert' }], ['kit sandy200', { kit: 1, v: 'sandy200', mood: 'asleep' }]].forEach(([name, o], i) => {
    const x = 110 + i * 190, y = 900;
    drawRabbit(c, { x, y, s: 3.1, t: T, ...o });
    label(c, name, x, y + 28);
  });
  drawRabbit(c, { x: 1090, y: 900, s: 3.1, t: T, v: 'sandy' });
  drawRabbit(c, { x: 1190, y: 900, s: 3.1, t: T, v: 'sandy', kit: 1, flip: -1, mood: 'happy' });
  label(c, 'doe + kit', 1130, 928);
  for (let i = 0; i < 6; i++) rabbitIcon(c, 1340 + i * 52, 900, 1, i < 4 ? '#f7c35f' : '#49557a');
  label(c, 'rabbitIcon', 1470, 928);
  ['sit', 'graze', 'alert', 'freeze'].forEach((pose, i) => drawRabbit(c, { x: 1700 + i * 55, y: 900, s: 0.7, t: T, pose, v: i % 2 ? 'sandy50' : 'sandy' }));
  for (let i = 0; i < 5; i++) drawRabbit(c, { x: 1700 + i * 45, y: 840, s: 0.35, t: T, gait: 'run', phase: i * 0.23, v: 'sandy200' });
  label(c, 's 0.7 / 0.35', 1790, 928);
  for (let i = 0; i < 9; i++) drawRabbit(c, { x: 120 + i * 200, y: 1045, s: 1.5, t: T, gait: 'run', phase: i / 9, v: i % 3 === 1 ? 'grey' : 'sandy', mood: 'alert' });
  console.log(save(cv, 'build/sheets/model_rabbit_faces.jpg', 90));

  // foot-slide check: planted feet must stay at one canvas x while the body advances by stride * phase
  for (const gait of ['hop', 'run']) {
    const st = rabbitStride(gait, 'sandy', 1), rng = gait === 'hop' ? [[0, 0.3, 'nh'], [0.56, 0.76, 'nf']] : [[0, 0.24, 'nh'], [0.54, 0.71, 'nf']];
    for (const [a, b, k] of rng) {
      let lo = 1e9, hi = -1e9, ymax = 0;
      for (let i = 0; i <= 20; i++) { const ph = a + ((b - a) * i) / 20, r = drawRabbit(c, { x: 3000 + ph * st, y: 3000, gait, phase: ph, t: T }); lo = Math.min(lo, r.feet[k][0]); hi = Math.max(hi, r.feet[k][0]); ymax = Math.max(ymax, Math.abs(r.feet[k][1] - 3000)); }
      console.log(`${gait} ${k} stance slide ${(hi - lo).toFixed(2)} units, lift ${ymax.toFixed(2)}`);
    }
  }
  bench('drawRabbit sit', (c2, i) => drawRabbit(c2, { x: 200, y: 200, s: 2, t: i * 0.04 }));
  bench('drawRabbit hop', (c2, i) => drawRabbit(c2, { x: 200, y: 200, s: 2, t: i * 0.04, gait: 'hop', phase: i * 0.03 }));
}

if (which === 'small' || which === 'all') {
  const { drawHamster, drawGuineaPig, drawMouse } = await import('../src/chars/small.js');
  const { cv, c } = board();
  const ham = [
    ['stand', {}], ['sit (food)', { pose: 'sit' }], ['run 0.1', { pose: 'run', phase: 0.1 }], ['run 0.35', { pose: 'run', phase: 0.35 }],
    ['grip + gnaw', { pose: 'grip', gnaw: 1 }], ['grip scared', { pose: 'grip', mood: 'scared' }], ['happy', { mood: 'happy', cheeks: 1 }], ['scared', { mood: 'scared' }],
  ];
  ham.forEach(([name, o], i) => {
    const x = 130 + i * 236, y = 250;
    if (o.pose === 'grip') { c.fillStyle = '#8d97a6'; c.fillRect(x + 12 * 5.2 - 3, y - 220, 6, 222); }
    drawHamster(c, { x, y, s: 5.2, t: T, ...o });
    label(c, `hamster ${name}`, x, y + 28);
  });
  const gp = [
    ['stand', {}], ['walk 0.2', { pose: 'walk', phase: 0.2 }], ['walk 0.6', { pose: 'walk', phase: 0.6 }], ['call', { pose: 'call', mouth: 1 }],
    ['popcorn 0.35', { hop: 0.35, mood: 'happy' }], ['popcorn 0.7', { hop: 0.7, mood: 'happy' }], ['scared', { mood: 'scared' }], ['happy flip', { mood: 'happy', flip: -1 }],
  ];
  gp.forEach(([name, o], i) => {
    const x = 130 + i * 236, y = 560;
    drawGuineaPig(c, { x, y, s: 4, t: T, ...o });
    label(c, `guinea pig ${name}`, x, y + 28);
  });
  const mo = [['stand', {}], ['sniff', { pose: 'sniff' }], ['run 0.1', { pose: 'run', phase: 0.1 }], ['run 0.4', { pose: 'run', phase: 0.4 }], ['run 0.7', { pose: 'run', phase: 0.7 }], ['scared flip', { mood: 'scared', flip: -1 }]];
  mo.forEach(([name, o], i) => {
    const x = 120 + i * 200, y = 760;
    drawMouse(c, { x, y, s: 6, t: T, ...o });
    label(c, `mouse ${name}`, x, y + 28);
  });
  // close-up faces
  [[drawHamster, { mood: 'scared', pose: 'grip' }, 1330, 1120, 11], [drawGuineaPig, { pose: 'call', mouth: 0.8 }, 1540, 1010, 8.5], [drawHamster, { mood: 'happy', pose: 'sit' }, 1800, 1020, 10]].forEach(([fn, o, x, y, s], i) => {
    c.save(); c.beginPath(); c.rect(1270 + i * 220, 610, 210, 250); c.clip();
    fn(c, { x: x - 60, y: y - 120, s, t: T, shadow: 0, ...o }); c.restore();
  });
  label(c, 'close-ups', 1590, 880);
  // small sizes
  for (let i = 0; i < 5; i++) {
    drawHamster(c, { x: 100 + i * 70, y: 980, s: 1, t: T + i, pose: ['stand', 'sit', 'run', 'grip', 'stand'][i], phase: 0.3, seed: i });
    drawGuineaPig(c, { x: 500 + i * 90, y: 980, s: 1, t: T + i, pose: ['stand', 'walk', 'call', 'stand', 'walk'][i], phase: 0.3, hop: i === 3 ? 0.5 : 0, seed: i });
    drawMouse(c, { x: 1000 + i * 60, y: 980, s: 1, t: T + i, pose: ['stand', 'run', 'sniff', 'run', 'run'][i], phase: i * 0.2, seed: i });
    drawMouse(c, { x: 1340 + i * 90, y: 980, s: 2.5, t: T + i, pose: 'run', phase: i * 0.2, seed: i, flip: i % 2 ? -1 : 1 });
  }
  label(c, 's = 1 (hamster, guinea pig, mouse) and mouse s = 2.5', 800, 1010);
  console.log(save(cv, 'build/sheets/model_small.jpg', 90));
  bench('drawHamster', (c2, i) => drawHamster(c2, { x: 200, y: 200, s: 4, t: i * 0.04, pose: 'run', phase: i * 0.05 }));
  bench('drawGuineaPig', (c2, i) => drawGuineaPig(c2, { x: 200, y: 200, s: 4, t: i * 0.04, pose: 'walk', phase: i * 0.05 }));
  bench('drawMouse', (c2, i) => drawMouse(c2, { x: 200, y: 200, s: 4, t: i * 0.04, pose: 'run', phase: i * 0.05 }));
}
