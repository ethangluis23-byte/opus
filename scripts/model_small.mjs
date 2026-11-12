// Model sheets for the small pets.  node scripts/model_small.mjs [all|rabbit|hop|small|faces|bench]
//   -> build/sheets/model_small.jpg (rabbit poses + variants + hamster + guinea pig), model_small_hop.jpg (hop cycle,
//      blends, options), model_small_faces.jpg (close-ups). 'bench' times 200 draws of each character.
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt } from '../src/engine/draw.js';
import { drawRabbit, RABBITS, rabbitStride, drawHamster, drawGuineaPig } from '../src/chars/small.js';

loadFonts();
const which = process.argv[2] || 'all';
const T = +(process.argv[3] || 1.3);

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y) => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 20, color: '#2a3550' });
const dot = (c, a, col = '#e0245e') => { if (!a) return; c.fillStyle = col; c.beginPath(); c.arc(a[0], a[1], 3, 0, Math.PI * 2); c.fill(); };

if (which === 'all' || which === 'rabbit' || which === 'small') {
  const { cv, c } = board();
  const cells = [
    ['sit', { pose: 'sit' }],
    ['graze (chew)', { pose: 'graze' }],
    ['alert (freeze)', { pose: 'alert', still: 1 }],
    ['lie (flop)', { pose: 'lie' }],
    ['dig', { pose: 'dig' }],
    ['hop 0 crouch', { pose: 'hop', phase: 0 }],
    ['hop 0.14 push', { pose: 'hop', phase: 0.14 }],
    ['hop 0.36 air', { pose: 'hop', phase: 0.36 }],
    ['hop 0.56 land', { pose: 'hop', phase: 0.56 }],
    ['hop 0.8 gather', { pose: 'hop', phase: 0.8 }],
    ['ears back -1', { pose: 'sit', ears: -1 }],
    ['ears fwd / swivel', { pose: 'sit', ears: [1, -0.4], look: [0.8, -0.2] }],
    ['carrot', { pose: 'sit', carrot: 1, chew: 1 }],
    ['push (door)', { pose: 'sit', push: 1 }],
    ['thump 0.45', { pose: 'sit', thump: 0.45, ears: 0.6 }],
  ];
  cells.forEach(([name, o], i) => {
    const col = i % 5, row = Math.floor(i / 5), x = 200 + col * 380, y = 290 + row * 340;
    const a = drawRabbit(c, { x, y, s: 4.2, t: T + i * 0.37, seed: i, ...o });
    if (o.push) dot(c, a.reach);
    if (o.carrot || i === 1) dot(c, a.mouth);
    label(c, name, x, y + 30);
  });
  console.log(save(cv, 'build/sheets/model_small_rabbit.jpg', 90));
}

if (which === 'all' || which === 'hop') {
  const { cv, c } = board();
  // hop cycle strip with a moving root: feet must not slide (ground ticks mark planted toes)
  const s = 3.2, st = rabbitStride('sandy', s);
  for (let i = 0; i < 10; i++) {
    const ph = i / 10, x = 90 + ph * st * 4.4 + i * 150;
    drawRabbit(c, { x, y: 260, s, t: T, pose: 'hop', phase: ph, seed: 3 });
    label(c, ph.toFixed(1), x, 290);
  }
  // overlay of one hop in place (onion skin) to check foot planting: x advances with phase
  for (let i = 0; i <= 8; i++) {
    const ph = i / 8; c.globalAlpha = i === 0 || i === 8 ? 1 : 0.35;
    const a = drawRabbit(c, { x: 200 + ph * st, y: 560, s, t: T, pose: 'hop', phase: ph, shadow: 0 });
    c.globalAlpha = 1; dot(c, a.foot, '#1a7');
  }
  label(c, 'one hop, onion skin (green = near hind toe)', 330, 600);
  // leap hop + kits
  for (let i = 0; i < 5; i++) {
    const ph = i / 5;
    drawRabbit(c, { x: 820 + i * 190, y: 560, s: 2.6, t: T, pose: 'hop', phase: ph + 0.06, leap: 1, v: 'brown', seed: i });
  }
  label(c, 'leap 1 (brown)', 1200, 600);
  // kits and blends
  const kits = [['kit sit', { pose: 'sit', kit: 1 }], ['kit graze', { pose: 'graze', kit: 1 }], ['kit hop', { pose: 'hop', phase: 0.36, kit: 1 }],
    ['kit 0.5', { pose: 'sit', kit: 0.5 }], ['kit lie', { pose: 'lie', kit: 1 }], ['blend sit>alert 0.5', { pose: ['sit', 'alert', 0.5] }],
    ['blend hop>sit 0.5', { pose: ['hop', 'sit', 0.5], phase: 0.3 }], ['push 0.5', { pose: 'sit', push: 0.5 }], ['thump 0.75 (impact)', { pose: 'sit', thump: 0.62 }]];
  kits.forEach(([name, o], i) => {
    const x = 130 + i * 205, y = 900, kit = o.kit ?? 0;
    drawRabbit(c, { x, y, s: kit ? 3.6 : 2.6, t: T + i, seed: i + 7, ...o });
    label(c, name, x, y + 40);
  });
  console.log(save(cv, 'build/sheets/model_small_hop.jpg', 90));
}

if (which === 'all' || which === 'small' || which === 'variants') {
  const { cv, c } = board();
  Object.keys(RABBITS).forEach((v, i) => {
    const x = 130 + i * 230, y = 300;
    drawRabbit(c, { x, y, s: 3.2, t: T + i, v, seed: i, pose: i % 2 ? 'sit' : 'graze' });
    label(c, v, x, y + 34);
    drawRabbit(c, { x: x + 10, y: 520, s: 2.6, t: T + i, v, seed: i, pose: 'hop', phase: 0.3 + i * 0.07 });
  });
  // hamster + guinea pig
  const hp = [['sit', { pose: 'sit' }], ['eat', { pose: 'eat' }], ['run', { pose: 'run', phase: 0.2 }], ['run .6', { pose: 'run', phase: 0.6 }],
    ['gnaw worried', { pose: 'gnaw', mood: 'worried' }], ['sleep', { pose: 'sleep' }], ['cheeks happy', { pose: 'sit', cheeks: 1, mood: 'happy' }]];
  hp.forEach(([name, o], i) => {
    const x = 120 + i * 150, y = 820;
    const a = drawHamster(c, { x, y, s: 6, t: T + i, seed: i, ...o });
    if (o.pose === 'gnaw') { c.fillStyle = '#9aa3ad'; c.fillRect(a.bar - 3, y - 140, 6, 140); drawHamster(c, { x, y, s: 6, t: T + i, seed: i, ...o, part: 'grip' }); }
    label(c, name, x, y + 30);
  });
  const gp = [['stand', { pose: 'stand' }], ['walk', { pose: 'walk', phase: 0.3 }], ['popcorn .5', { pose: 'popcorn', k: 0.5 }], ['call', { pose: 'call' }], ['eat', { pose: 'eat' }]];
  gp.forEach(([name, o], i) => {
    const x = 1170 + i * 160 + (i > 2 ? 20 : 0), y = 820 + (i % 2) * 150;
    drawGuineaPig(c, { x, y, s: 4.4, t: T + i, seed: i, ...o });
    label(c, name, x, y + 28);
  });
  console.log(save(cv, 'build/sheets/model_small.jpg', 90));
}

if (which === 'all' || which === 'faces') {
  const { cv, c } = board();
  const cell = (cx, cy, w, h, fn, name) => {
    c.save(); c.beginPath(); c.rect(cx - w / 2, cy - h / 2, w, h); c.clip(); fn(); c.restore();
    label(c, name, cx, cy + h / 2 + 16);
  };
  // rabbits at s 8 (head centre ~ (40,-88) design units * 2.4 px)
  const rab = [['sandy', { pose: 'sit' }], ['carrot + chew', { pose: 'sit', carrot: 0.8, chew: 1 }], ['ears back, wary', { pose: 'sit', ears: -1, look: [-0.6, 0] }],
    ['kit', { pose: 'sit', kit: 1 }], ['patched', { pose: 'sit', v: 'patched' }], ['sandy200', { pose: 'sit', v: 'sandy200', ears: 0.6 }]];
  rab.forEach(([name, o], i) => {
    const cx = 165 + i * 318, cy = 190, kit = o.kit ?? 0, s = kit ? 16 : 8;
    cell(cx, cy, 300, 330, () => drawRabbit(c, { x: cx - 120 + (kit ? 10 : 0), y: cy + 270 + (kit ? 20 : 0), s, t: T + i * 0.3, seed: i, shadow: 0, ...o }), name);
  });
  // hamsters at s 34
  const ham = [['neutral', { pose: 'sit' }], ['worried', { pose: 'sit', mood: 'worried' }], ['happy', { pose: 'sit', mood: 'happy' }],
    ['cheeks 1', { pose: 'sit', cheeks: 1 }], ['eat', { pose: 'eat' }], ['gnaw worried + bars', { pose: 'gnaw', mood: 'worried' }]];
  ham.forEach(([name, o], i) => {
    const cx = 165 + i * 318, cy = 560, gn = o.pose === 'gnaw';
    cell(cx, cy, 300, 330, () => {
      const x = cx - (gn ? 110 : 80), y = cy + (gn ? 420 : 300), s = gn ? 30 : 34;
      const a = drawHamster(c, { x, y, s, t: T + i * 0.3, seed: i, shadow: 0, ...o, part: gn ? 'body' : 'all' });
      if (gn) {
        for (const bx of [a.bar - 150, a.bar]) { c.fillStyle = lin(c, bx - 8, 0, bx + 8, 0, [[0, '#c9d0d8'], [0.5, '#8d96a1'], [1, '#5d6670']]); c.fillRect(bx - 7, cy - 200, 14, 400); }
        drawHamster(c, { x, y, s, t: T + i * 0.3, seed: i, shadow: 0, ...o, part: 'grip' });
      }
    }, name);
  });
  // guinea pigs at s 18
  const gps = [['stand', { pose: 'stand' }], ['call', { pose: 'call' }], ['eat', { pose: 'eat' }], ['popcorn 0.45', { pose: 'popcorn', k: 0.45 }], ['walk', { pose: 'walk', phase: 0.4 }]];
  gps.forEach(([name, o], i) => {
    const cx = 200 + i * 380, cy = 905;
    cell(cx, cy, 360, 300, () => drawGuineaPig(c, { x: cx - 40, y: cy + 135, s: 12, t: T + i * 0.3, seed: i, ...o }), name);
  });
  console.log(save(cv, 'build/sheets/model_small_faces.jpg', 90));
}

if (which === 'bench') {
  const cv = createCanvas(1920, 1080), c = cv.getContext('2d');
  const run = (name, fn) => {
    for (let i = 0; i < 30; i++) fn(i);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) fn(i);
    console.log(name.padEnd(22), ((performance.now() - t0) / 200).toFixed(3), 'ms/draw');
  };
  run('rabbit sit', (i) => drawRabbit(c, { x: 500, y: 600, s: 4, t: i * 0.033, pose: 'sit' }));
  run('rabbit hop', (i) => drawRabbit(c, { x: 500, y: 600, s: 4, t: i * 0.033, pose: 'hop', phase: i * 0.05 }));
  run('rabbit dig carrot', (i) => drawRabbit(c, { x: 500, y: 600, s: 4, t: i * 0.033, pose: 'dig', v: 'patched', carrot: 1 }));
  run('hamster run', (i) => drawHamster(c, { x: 500, y: 600, s: 6, t: i * 0.033, pose: 'run', phase: i * 0.1 }));
  run('hamster gnaw', (i) => drawHamster(c, { x: 500, y: 600, s: 6, t: i * 0.033, pose: 'gnaw', mood: 'worried' }));
  run('guinea pig popcorn', (i) => drawGuineaPig(c, { x: 500, y: 600, s: 4, t: i * 0.033, pose: 'popcorn', k: (i % 20) / 20 }));
  run('guinea pig walk', (i) => drawGuineaPig(c, { x: 500, y: 600, s: 4, t: i * 0.033, pose: 'walk', phase: i * 0.05 }));
}
