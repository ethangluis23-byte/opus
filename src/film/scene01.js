// TEMPORARY look-development shots (replaced by the real scene 1).
import { W, H } from '../engine/stage.js';
import { LOOKS, drawSky } from '../engine/sky.js';
import { lin, shadow } from '../engine/draw.js';
import { K, RNG, mix } from '../engine/util.js';
import { grass, tree, bush, ivy, vines, flowers, moss, bough, aging } from '../env/nature.js';
import { godRays, dust, rain, fog, fireflies, farBirds, fallingLeaves } from '../env/fx.js';
import { drawDog, dogStride } from '../chars/dog.js';
import { callout, bigTitle } from '../engine/overlays.js';

function park(g, t, look, yrs, dog) {
  const A = aging(yrs);
  drawSky(g, look, {});
  g.layer(0.25, (c) => {
    const r = RNG(5);
    for (let i = 0; i < 16; i++) { const w = r.range(90, 170), h = r.range(180, 520), x = -200 + i * 150; c.fillStyle = mix('#7f95b8', '#5f7396', r()); c.fillRect(x, 760 - h, w, h); }
  }, { fog: [look.haze, 0.55] });
  g.layer(0.5, (c) => {
    for (let i = 0; i < 9; i++) tree(c, -100 + i * 270, 790, { h: 300 + (i % 3) * 60, seed: i + 2, t, kind: i % 4 === 3 ? 'poplar' : 'round' });
  }, { fog: [look.haze, 0.28] });
  g.layer(1, (c) => {
    c.fillStyle = lin(c, 0, 780, 0, 1080, [[0, '#7fb957'], [0.4, '#5c9c46'], [1, '#3f7a38']]); c.fillRect(-600, 780, 3200, 400);
    c.fillStyle = '#c9b68d'; c.fillRect(-600, 880, 3200, 46);
    c.fillStyle = '#8a8f98'; c.fillRect(1380, 420, 360, 380);
    ivy(c, 1380, 420, 360, 380, { cover: A.vines, seed: 4, t });
    vines(c, 1380, 1740, 420, { len: 160 * A.vines, seed: 2, t });
    moss(c, 1380, 1740, 420, { seed: 3 });
    tree(c, 330, 800, { h: 520, seed: 11, t });
    tree(c, 1180, 806, { h: 360, seed: 14, t, kind: 'birch' });
    tree(c, 760, 800, { h: 300 * A.trees, seed: 5, t, kind: 'sapling' });
    bush(c, 620, 808, { w: 200, h: 100, seed: 3, t, flowers: '#ff9ecb' });
    bush(c, 1560, 812, { w: 240, h: 110, seed: 6, t });
    grass(c, -200, 2200, 812, { h: 20 + 40 * A.weeds, seed: 1, t, density: 0.3 });
    flowers(c, 0, 1920, 830, { n: 40, seed: 2, t, yVar: 14 });
    if (dog) drawDog(c, dog);
    grass(c, -200, 2200, 960, { h: 30 + 50 * A.weeds, seed: 9, t, density: 0.25, yVar: 30 });
  });
}

export default {
  n: 1,
  shots: [
    { id: 'look_day', at: 0, pill: 'DAY 0', draw(g, t) {
      const look = LOOKS.day;
      g.camera(K(t, [[0, 960], [6, 1040]]), 540, K(t, [[0, 1], [6, 1.08]]));
      const x = 500 + t * 110;
      park(g, t, look, 0, { x, y: 905, s: 1.5, t, gait: 'trot', phase: (t * 110) / dogStride('trot', 'golden', 1.5), mood: 'happy' });
      g.grade(look);
      g.screen((c) => { const [sx, sy] = g.toScreen(x + 60, 760); callout(c, { x: sx, y: sy, lx: sx + 240, ly: sy - 120, text: 'GOLDEN RETRIEVER', p: (t - 1) / 0.8 }); });
    } },
    { id: 'look_golden', at: 6, pill: '+5 YEARS', trans: { type: 'fade', dur: 0.8 }, draw(g, t) {
      const look = LOOKS.golden;
      g.camera(960, 540, 1.05);
      park(g, t, look, 5, { x: 900, y: 905, s: 1.5, t, pose: 'sit', mood: 'sad', flip: -1, look: [0.5, -0.4], v: 'golden20' });
      g.grade(look);
      g.screen((c) => { godRays(c, look.sun.x, look.sun.y, { ang: Math.PI * 0.72, spread: 0.9, t, a: 0.26, color: look.key }); });
      g.layer(1.2, (c) => { dust(c, 0, 300, 1920, 600, { t, n: 70 }); fallingLeaves(c, 0, 0, 1920, 1080, { t, n: 10 }); });
      g.layer(1.6, (c) => bough(c, -60, 60, 0.35, { t, seed: 2, len: 640 }), { blur: 6, tint: ['#10240f', 0.45] });
      g.screen((c) => bigTitle(c, { text: '5 YEARS LATER', sub: 'THE CITY TURNS GREEN', t: t - 0.4 }));
    } },
    { id: 'look_night', at: 12, pill: '+100 YEARS', trans: { type: 'fade', dur: 0.8 }, draw(g, t) {
      const look = LOOKS.night;
      park(g, t, look, 100, { x: 1000, y: 905, s: 1.5, t, pose: 'lie', mood: 'asleep', headDown: 1, v: 'golden200' });
      g.layer(1.05, (c) => fog(c, -200, 2200, 860, { t, color: '#9fb4e6', a: 0.22 }));
      g.grade(look);
      g.layer(1.1, (c) => fireflies(c, 100, 560, 1700, 360, { t }));
    } },
    { id: 'look_rain', at: 18, pill: '+7 DAYS', trans: { type: 'dip', dur: 1 }, draw(g, t) {
      const look = LOOKS.rain;
      park(g, t, look, 0.02, { x: 760, y: 905, s: 1.5, t, mood: 'scared', gait: 'walk', phase: t * 0.8, v: 'beagle' });
      g.grade(look);
      g.screen((c) => rain(c, { t, n: 300 }));
    } },
  ],
};
