// Model sheets for character rigs.  node scripts/model.mjs dog   -> build/sheets/model_dog_*.jpg
import { createCanvas } from '@napi-rs/canvas';
import { loadFonts } from '../src/engine/stage.js';
import { save } from '../src/cli/common.js';
import { lin, txt, shadow } from '../src/engine/draw.js';

loadFonts();
const which = process.argv[2] || 'dog';
const T = +(process.argv[3] || 1.3);

function board(w = 1920, h = 1080) {
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#cfe3ee'], [0.7, '#e9eef0'], [1, '#d8d2c4']]);
  c.fillRect(0, 0, w, h);
  return { cv, c };
}
const label = (c, s, x, y) => txt(c, s, x, y, { font: 'Barlow Semi Condensed', weight: 600, size: 20, color: '#2a3550' });

if (which === 'dog') {
  const { drawDog } = await import('../src/chars/dog.js');
  // sheet 1: poses
  let { cv, c } = board();
  const cells = [
    ['stand neutral', { }],
    ['walk', { gait: 'walk', phase: 0.18, mood: 'happy' }],
    ['trot', { gait: 'trot', phase: 0.3 }],
    ['run', { gait: 'run', phase: 0.42, mood: 'happy' }],
    ['run 2', { gait: 'run', phase: 0.9, mood: 'alert' }],
    ['sit happy', { pose: 'sit', mood: 'happy' }],
    ['sit sad', { pose: 'sit', mood: 'sad', look: [0.6, -0.5] }],
    ['lie waiting', { pose: 'lie', mood: 'sad', headDown: 0.95, look: [0.3, -0.7] }],
    ['asleep', { pose: 'lie', mood: 'asleep', headDown: 1 }],
    ['up (scratch door)', { pose: 'up', mood: 'sad', paw: 0.2, look: [0.6, -0.6] }],
    ['play bow', { pose: 'bow', mood: 'happy' }],
    ['sniff', { headDown: 0.8, mood: 'alert', look: [0.5, 0.6] }],
    ['howl', { pose: 'sit', headUp: 1, mouth: 0.6 }],
    ['angry', { mood: 'angry' }],
    ['scared', { mood: 'scared', pose: ['stand', 'lie', 0.3] }],
  ];
  cells.forEach(([name, o], i) => {
    const col = i % 5, row = Math.floor(i / 5), x = 190 + col * 384, y = 300 + row * 350;
    drawDog(c, { x, y, s: 1.75, t: T, ...o });
    label(c, name, x, y + 34);
  });
  console.log(save(cv, 'build/sheets/model_dog_poses.jpg', 90));

  // sheet 2: faces + variants
  ({ cv, c } = board());
  ['neutral', 'happy', 'sad', 'alert', 'angry', 'sleepy'].forEach((mood, i) => {
    const x = 170 + i * 310;
    c.save(); c.beginPath(); c.rect(x - 150, 30, 300, 340); c.clip();
    drawDog(c, { x: x - 240, y: 590, s: 3.2, t: T, mood, shadow: 0 });
    c.restore();
    label(c, mood, x, 392);
  });
  const vars = ['golden', 'golden20', 'golden50', 'golden200', 'shepherd', 'beagle', 'husky', 'terrier', 'pug', 'dachshund', 'blacklab', 'mutt', 'wildBig', 'wildSmall'];
  vars.forEach((v, i) => {
    const col = i % 7, row = Math.floor(i / 7), x = 140 + col * 272, y = 720 + row * 300;
    drawDog(c, { x, y, s: 1.2, t: T + i, v, mood: i % 3 === 0 ? 'happy' : 'neutral', gait: row ? 'walk' : null, phase: i * 0.13 });
    label(c, v, x, y + 30);
  });
  drawDog(c, { x: 1790, y: 1020, s: 1.2, t: T, puppy: 1, v: 'golden200', pose: 'sit', mood: 'happy' });
  console.log(save(cv, 'build/sheets/model_dog_faces.jpg', 90));
}
