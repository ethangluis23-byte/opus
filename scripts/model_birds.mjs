// Model sheets for the birds module.  node scripts/model_birds.mjs [t]  -> build/sheets/model_birds*.jpg (+ timings)
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt, rrect, fill } from '../src/engine/draw.js';
import { drawParrot, drawHawk, hawkShadow, drawPigeon, drawButterfly, drawFlock, PARROTS } from '../src/chars/birds.js';

loadFonts();
const T = +(process.argv[2] || 1.3);

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y) => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 18, color: '#2a3550' });
const rod = (c, x, y, w = 120, r = 5) => { fill(c, rrect(x - w / 2, y, w, r * 2, r), '#7a5232'); fill(c, rrect(x - w / 2, y, w, r * 0.8, r * 0.4), '#9a7048'); };

// ---------------- sheet 1: poses, variants, hawk, pigeon, butterflies, flocks
let { cv, c } = board();
const S1 = 1.55;
const rowA = [
  ['perch', {}], ['walk 0.15', { pose: 'walk', phase: 0.15 }], ['walk 0.65', { pose: 'walk', phase: 0.65 }],
  ['bob (happy)', { bob: 1, mood: 'happy', t: T + 0.1 }], ['preen', { preen: 1 }], ['squabble', { wingRaise: 1, beak: 0.75, mood: 'angry' }],
  ['food', { food: true, mood: 'happy', look: [0.5, 0.4] }], ['talk', { beak: 0.6, tilt: -0.15 }], ['age 1', { age: 1, look: [0.2, 0.3] }],
];
rowA.forEach(([name, o], i) => {
  const x = 120 + i * 210, y = 190;
  rod(c, x, y, 130, 5);
  drawParrot(c, { x, y, s: S1, t: T, ...o });
  label(c, name, x, y + 100);
});
const rowB = [
  ['fly 0.0', { pose: 'fly', flap: 0 }], ['fly 0.22', { pose: 'fly', flap: 0.22 }], ['fly 0.45', { pose: 'fly', flap: 0.45 }],
  ['fly 0.7', { pose: 'fly', flap: 0.7, beak: 0.6 }], ['glide', { pose: 'glide' }], ['land', { pose: 'land', flap: 0.1 }],
  ['land>perch .5', { pose: ['land', 'perch', 0.5] }], ['perch>fly .5', { pose: ['perch', 'fly', 0.5], flap: 0.1 }],
];
rowB.forEach(([name, o], i) => {
  const x = 130 + i * 236, y = 470;
  if (name.startsWith('land')) rod(c, x, y, 120, 5);
  drawParrot(c, { x, y, s: 1.3, t: T, ...o });
  label(c, name, x, y + 70);
});
// variants + size lineup at s = 1 with guides (macaw 90, amazon 50, parakeet 45; dog head ~150)
const rowC = [['parakeet', { v: 'parakeet' }], ['amazon', { v: 'amazon' }], ['redcrown', { v: 'redcrown', mood: 'alert' }],
  ['parakeet fly', { v: 'parakeet', pose: 'fly', flap: 0.25 }], ['amazon fly', { v: 'amazon', pose: 'fly', flap: 0.6 }], ['redcrown glide', { v: 'redcrown', pose: 'glide' }]];
rowC.forEach(([name, o], i) => {
  const x = 110 + i * 175, y = 690;
  if (!o.pose) rod(c, x, y, 90, 4);
  drawParrot(c, { x, y, s: 2, t: T + i, ...o });
  label(c, name, x, y + 80);
});
{
  const x0 = 1180, y0 = 680;
  c.strokeStyle = 'rgba(40,60,90,0.35)'; c.lineWidth = 1;
  for (const [hh, nm] of [[90, '90'], [50, '50'], [45, '45']]) {
    c.beginPath(); c.moveTo(x0 - 60, y0 - hh * 1.6 * (60 / 100) * 0 - hh); c.lineTo(x0 + 330, y0 - hh); c.stroke();
    txt(c, nm, x0 - 75, y0 - hh, { size: 14, color: '#2a3550' });
  }
  // tails hang below the perch: draw each bird so its head top sits on the guide (measured offsets are visual)
  ['macaw', 'parakeet', 'amazon', 'redcrown'].forEach((v, i) => {
    const x = x0 + i * 85, sz = PARROTS[v].size;
    const top = 57 * sz; // head top above the perch at s = 1
    const total = { macaw: 90, parakeet: 45, amazon: 50, redcrown: 52 }[v];
    const y = y0 - total + top;
    rod(c, x, y, 40, 2);
    drawParrot(c, { x, y, s: 1, t: T, v });
  });
  label(c, 'size check s=1 (head top -> tail tip spans the guide to the floor line)', x0 + 140, y0 + 22);
  c.beginPath(); c.moveTo(x0 - 60, y0); c.lineTo(x0 + 330, y0); c.stroke();
}
// hawk, shadow, pigeons, butterflies, flocks
drawHawk(c, { x: 1640, y: 470, s: 0.95, t: T });
label(c, 'hawk', 1640, 560);
drawHawk(c, { x: 1640, y: 170, s: 0.8, t: T + 2, bank: 0.35, flip: -1 });
label(c, 'hawk bank .35 flip', 1640, 250);
fill(c, rrect(20, 850, 330, 210, 8), '#7fae5a');
hawkShadow(c, { x: 185, y: 950, s: 0.9 });
label(c, 'hawkShadow', 185, 1040);
[['stand', { pose: 'stand' }], ['walk', { pose: 'walk', phase: 0.3 }], ['peck', { pose: 'peck', phase: 0.3 }], ['fly', { pose: 'fly', flap: 0.25 }], ['dark walk', { pose: 'walk', phase: 0.8, v: 'dark', flip: -1 }], ['pale', { v: 'pale' }]]
  .forEach(([name, o], i) => {
    const x = 420 + i * 105, y = 1000;
    drawPigeon(c, { x, y, s: 1.5, t: T + i, ...o });
    label(c, name, x, y + 26);
  });
['orange', 'yellow', 'white', 'blue'].forEach((col, i) => {
  drawButterfly(c, { x: 1070 + i * 52, y: 960 + (i % 2) * 30, s: 1.8, t: T + i * 0.13, color: col, seed: i });
});
label(c, 'butterflies', 1150, 1040);
fill(c, rrect(1270, 820, 630, 240, 8), '#f2b46a');
drawFlock(c, { x: 1280, y: 830, w: 300, h: 210, n: 40, t: T, seed: 3, kind: 'parrot' });
drawFlock(c, { x: 1590, y: 830, w: 300, h: 100, n: 20, t: T, seed: 5, kind: 'far', dir: 1 });
drawFlock(c, { x: 1590, y: 935, w: 300, h: 110, n: 16, t: T, seed: 8, kind: 'pigeon', dir: -1, scale: 1.2 });
label(c, 'flock parrot (wheel) · far (stream) · pigeon', 1585, 1048);
console.log(save(cv, 'build/sheets/model_birds.jpg', 90));

// ---------------- sheet 2: macaw faces
({ cv, c } = board());
const faces = [
  ['neutral', {}], ['talking', { beak: 0.7, look: [0.6, 0.1] }], ['age 1', { age: 1, look: [0.1, 0.25] }],
  ['happy bob', { bob: 1, mood: 'happy', t: T + 0.12 }], ['angry squabble', { mood: 'angry', beak: 0.85, wingRaise: 0.6 }], ['seed', { food: true, mood: 'happy' }],
];
faces.forEach(([name, o], i) => {
  const x = 170 + i * 315;
  c.save(); c.beginPath(); c.rect(x - 150, 30, 300, 340); c.clip();
  drawParrot(c, { x: x - 10, y: 640, s: 5.6, t: T, ...o });
  c.restore();
  label(c, name, x, 392);
});
const faces2 = [['parakeet', { v: 'parakeet' }, 11.5], ['amazon', { v: 'amazon' }, 8.8], ['redcrown', { v: 'redcrown' }, 8.5],
  ['age .5 sad', { age: 0.5, mood: 'sad' }, 5.6], ['sleepy', { mood: 'sleepy' }, 5.6], ['preen', { preen: 1 }, 5.6]];
faces2.forEach(([name, o, s], i) => {
  const x = 170 + i * 315;
  c.save(); c.beginPath(); c.rect(x - 150, 440, 300, 340); c.clip();
  const sz = (PARROTS[o.v || 'macaw'].size);
  drawParrot(c, { x: x - 10, y: 1050 + (o.preen ? -110 : 0), s: s * (o.v ? 0.47 / sz * sz : 1), t: T, ...o });
  c.restore();
  label(c, name, x, 802);
});
// full-body hero at a close-up scale
drawParrot(c, { x: 330, y: 1010, s: 2.4, t: T, food: true, mood: 'happy' });
drawParrot(c, { x: 760, y: 1010, s: 2.4, t: T, beak: 0.5, flip: -1, look: [0.4, -0.2] });
drawParrot(c, { x: 1200, y: 1010, s: 2.4, t: T, age: 1, mood: 'sad' });
drawParrot(c, { x: 1650, y: 1000, s: 2.0, t: T, pose: 'fly', flap: 0.15, beak: 0.6 });
console.log(save(cv, 'build/sheets/model_birds_faces.jpg', 90));

// ---------------- timings (on a full-HD canvas)
const tc = createCanvas(1920, 1080).getContext('2d');
const time = (name, n, fn) => {
  for (let i = 0; i < 10; i++) fn(i);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn(i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  console.log(`${name.padEnd(26)} ${ms.toFixed(3)} ms/draw`);
};
const poses = ['perch', 'walk', 'fly', 'glide', 'land'];
time('drawParrot macaw s=2', 200, (i) => drawParrot(tc, { x: 400 + i, y: 500, s: 2, t: i * 0.04, pose: poses[i % 5], phase: i * 0.05, beak: (i % 3) / 3, bob: i % 2 }));
time('drawParrot parakeet s=1', 200, (i) => drawParrot(tc, { x: 400 + i, y: 500, s: 1, t: i * 0.04, v: 'parakeet', pose: poses[i % 5] }));
time('drawParrot macaw age1 s=4', 200, (i) => drawParrot(tc, { x: 900, y: 900, s: 4, t: i * 0.04, age: 1, mood: 'angry', wingRaise: 0.5 }));
time('drawFlock parrot n=120', 200, (i) => drawFlock(tc, { x: 0, y: 0, w: 1920, h: 600, n: 120, t: i * 0.04, seed: 2 }));
time('drawFlock far n=120', 200, (i) => drawFlock(tc, { x: 0, y: 0, w: 1920, h: 600, n: 120, t: i * 0.04, seed: 2, kind: 'far', dir: 1 }));
time('drawFlock pigeon n=120', 200, (i) => drawFlock(tc, { x: 0, y: 0, w: 1920, h: 600, n: 120, t: i * 0.04, seed: 2, kind: 'pigeon', dir: 0 }));
time('drawHawk s=1', 200, (i) => drawHawk(tc, { x: 900, y: 300, s: 1, t: i * 0.04, bank: 0.2 }));
time('hawkShadow s=1.5', 200, (i) => hawkShadow(tc, { x: 900 + i, y: 800, s: 1.5 }));
time('drawPigeon s=1.5', 200, (i) => drawPigeon(tc, { x: 900, y: 800, s: 1.5, t: i * 0.04, pose: ['walk', 'peck', 'fly'][i % 3], phase: i * 0.05 }));
time('drawButterfly s=2', 200, (i) => drawButterfly(tc, { x: 900, y: 800, s: 2, t: i * 0.04, seed: i }));
