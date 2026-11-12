// Model sheets for the apartment set.  node scripts/model_apartment.mjs [wide|close|lapse|time|all]
import { createCanvas } from '@napi-rs/canvas';
import { Gfx } from '../src/engine/stage.js';
import { LOOKS } from '../src/engine/sky.js';
import { save } from '../src/cli/common.js';
import { txt } from '../src/engine/draw.js';
import { drawDog } from '../src/chars/dog.js';
import { apartmentSet, apartmentLight, APT } from '../src/sets/apartment.js';

const which = process.argv[2] || 'all', T = 2.3;
const dogs = (years) => (c) => {
  const v = years >= 150 ? 'golden200' : 'golden';
  drawDog(c, { x: APT.doorWait.x, y: APT.doorWait.y, s: 1.5, flip: -1, t: T, pose: 'sit', mood: 'sad', v });
  drawDog(c, { x: 1250, y: APT.floorY, s: 1.5, t: T, v });
};
function frame(g, cam, o) {
  g.begin(); g.t = T; g.T = T;
  g.camera(...cam);
  const opt = { actors: dogs(o.years || 0), ...o };
  apartmentSet(g, T, opt); g.grade(opt.look || LOOKS.day); apartmentLight(g, T, opt);
}
function sheet(name, tiles, cols, tw = 960) {
  const th = tw * 9 / 16, g = new Gfx(tw / 1920), rows = Math.ceil(tiles.length / cols), out = createCanvas(cols * tw, rows * th), x = out.getContext('2d');
  tiles.forEach(([label, cam, o], i) => {
    frame(g, cam, o);
    const px = (i % cols) * tw, py = Math.floor(i / cols) * th;
    x.drawImage(g.canvas, px, py);
    x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(px, py, label.length * 9 + 16, 24);
    txt(x, label, px + 8, py + 13, { font: 'Barlow Semi Condensed', weight: 600, size: 17, color: '#ffd76a', align: 'left' });
  });
  console.log(save(out, `build/sheets/model_apartment_${name}.jpg`, 88));
}
const C = APT.cams;
if (which === 'wide' || which === 'all') {
  sheet('wide', [
    ['0 day', C.wide, { years: 0 }], ['1 day night power', C.wide, { years: 1 / 365, look: LOOKS.night }],
    ['1 day night no power', C.wide, { years: 1 / 365, look: LOOKS.night, power: false }], ['7 days', C.wide, { years: 7 / 365, look: LOOKS.morning }],
    ['5 years', C.wide, { years: 5, look: LOOKS.golden }], ['20 years', C.wide, { years: 20, look: LOOKS.overcast }],
    ['100 years', C.wide, { years: 100, look: LOOKS.day }], ['200 years', C.wide, { years: 200, look: LOOKS.forest }],
  ], 2);
}
if (which === 'close' || which === 'all') {
  sheet('close', [
    ['door 0', C.door, { years: 0 }], ['door 200', C.door, { years: 200, look: LOOKS.forest }],
    ['sofa 0', C.sofa, { years: 0 }], ['sofa 200', C.sofa, { years: 200, look: LOOKS.forest }],
    ['window 0', C.window, { years: 0, windowOpen: 0.6 }], ['window 200', C.window, { years: 200, look: LOOKS.forest }],
  ], 2);
}
if (which === 'mid' || which === 'all') {
  sheet('mid', [
    ['room 0 z1 left', [760, 540, 1], { years: 0 }], ['room 0 z1 right', [1960, 540, 1], { years: 0 }],
    ['1 year', [1960, 540, 1], { years: 1 }], ['5 years', [1960, 540, 1], { years: 5, look: LOOKS.golden }],
    ['20 years', [1960, 540, 1], { years: 20, look: LOOKS.morning }], ['100 years', [760, 540, 1], { years: 100, look: LOOKS.morning }],
    ['100 years', [1960, 540, 1], { years: 100, look: LOOKS.morning }], ['200 years', [1500, 540, 0.8], { years: 200, look: LOOKS.forest }],
    ['evening lamp+tv', [1500, 560, 1.05], { years: 1 / 365, look: LOOKS.dusk }], ['night no power', [1960, 540, 1], { years: 2 / 365, look: LOOKS.night, power: false }],
  ], 2);
}
if (which === 'lapse' || which === 'all') {
  sheet('lapse', [100, 112, 125, 137, 150, 162, 175, 187, 200].map((y) => [`${y} years`, C.ruin, { years: y, look: LOOKS.forest }]), 3, 640);
}
if (which === 'time' || which === 'all') {
  const g = new Gfx(1);
  for (const [label, cam, o] of [['0 wide', C.wide, { years: 0 }], ['0 z1', [1960, 540, 1], { years: 0 }], ['night z1', [1500, 540, 1], { years: 0.01, look: LOOKS.night }], ['20 z1', [1960, 540, 1], { years: 20 }], ['100 z1', [1500, 540, 1], { years: 100 }], ['200 z1', [1960, 540, 1], { years: 200, look: LOOKS.forest }], ['200 wide', C.wide, { years: 200, look: LOOKS.forest }]]) {
    frame(g, cam, { ...o, actors: null });
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) frame(g, cam, { ...o, actors: null });
    console.log(label.padEnd(10), ((performance.now() - t0) / 5).toFixed(1), 'ms (set + grade + light, 1080p)');
  }
}
