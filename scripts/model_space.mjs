// Look check for the globe, map and infographic helpers.
import { Gfx } from '../src/engine/stage.js';
import { earthSet, mapSet, mapPin, spaceBackdrop } from '../src/sets/space.js';
import { heading, subheading, card, arrow, reticle, bar, medallion, soundArcs } from '../src/engine/info.js';
import { callout } from '../src/engine/overlays.js';
import { drawDog } from '../src/chars/dog.js';
import { createCanvas } from '@napi-rs/canvas';
import { save } from '../src/cli/common.js';
const g = new Gfx(0.5), out = createCanvas(1920, 1080), o = out.getContext('2d');
const put = (i) => o.drawImage(g.canvas, (i % 2) * 960, Math.floor(i / 2) * 540);
g.begin(); g.t = 2; g.T = 2; g.camera(960, 560, 1.05); earthSet(g, 2, { lit: 1 }); g.vignette(0.4); put(0);
g.begin(); g.camera(960, 560, 1.05); earthSet(g, 2.4, { lit: 0.45 }); g.vignette(0.4); put(1);
g.begin(); const at = mapSet(g, 3, {}); g.layer(1, (c) => { mapPin(c, ...at(-118, 34), 1, 3); mapPin(c, ...at(0, 51.5), 1, 3.4); });
g.screen((c) => { const a = g.toScreen(...at(-118, 34)), b = g.toScreen(...at(0, 51.5)); callout(c, { x: a[0], y: a[1], lx: a[0] + 60, ly: a[1] + 170, text: 'LOS ANGELES · RED-CROWNED PARROTS', p: 1 }); callout(c, { x: b[0], y: b[1], lx: b[0] - 120, ly: b[1] - 150, text: 'LONDON · RING-NECKED PARAKEETS', p: 1 }); });
g.vignette(0.3); put(2);
g.begin(); spaceBackdrop(g, 1, {}); g.screen((c) => {
  heading(c, 'IF YOU COULD SAVE ONLY ONE', 150); subheading(c, 'WHICH WOULD YOU CHOOSE?', 215);
  ['DOG', 'CAT', 'PARROT', 'RABBIT'].forEach((n, i) => card(c, { x: 330 + i * 420, y: 560, w: 340, h: 380, p: 1, label: n, draw: (c) => { if (i === 0) drawDog(c, { x: 330 - 150, y: 780, s: 2.2, t: 1, mood: 'happy', shadow: 0 }); } }));
  arrow(c, 300, 930, 700, 930, 1); reticle(c, 1500, 900, 46, 1, 1); bar(c, { x: 820, y: 930, w: 420, v: 0.7, label: 'BROWN COATS', value: '85%' }); soundArcs(c, 1750, 930, 0.3, {});
  medallion(c, { x: 1780, y: 180, r: 90, p: 1 });
}); g.vignette(0.35); put(3);
console.log(save(out, 'build/sheets/model_space.jpg', 90));
