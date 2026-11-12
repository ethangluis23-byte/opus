// Film index: loads sceneNN.js modules (placeholder card for scenes not authored yet).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, W, H } from '../engine/stage.js';
import { makeFilm } from '../engine/film.js';
import { narration } from './narration.js';
import { LOOKS, drawSky } from '../engine/sky.js';
import { bigTitle } from '../engine/overlays.js';

export const DURATION = 600;

const TITLES = ['THE DAY HUMANS DISAPPEARED', 'THE FIRST 24 HOURS', 'AFTER 7 DAYS', 'AFTER 1 YEAR', 'AFTER 5 YEARS', 'AFTER 20 YEARS', 'AFTER 50 YEARS', 'AFTER 100 YEARS', 'AFTER 200 YEARS', 'THE LAST MEMORY'];

function placeholder(n) {
  return {
    n,
    shots: [{
      id: `s${String(n).padStart(2, '0')}_placeholder`, at: 0, pill: `SCENE ${n}`,
      draw(g, t) {
        drawSky(g, LOOKS.night, { clouds: false });
        g.vignette(0.5);
        g.screen((c) => bigTitle(c, { text: TITLES[n - 1], sub: 'SCENE NOT AUTHORED YET', t: (t % 60) * 0.05 + 0.8, dur: 4 }));
      },
    }],
  };
}

let cached = null;
export async function getFilm() {
  if (cached) return cached;
  const scenes = [];
  // LP_SCENES=3,4 loads only those scene modules (placeholders elsewhere) so one scene can be previewed in isolation.
  const only = process.env.LP_SCENES ? new Set(process.env.LP_SCENES.split(',').map(Number)) : null;
  for (let n = 1; n <= 10; n++) {
    const file = path.join(ROOT, 'src/film', `scene${String(n).padStart(2, '0')}.js`);
    if (fs.existsSync(file) && (!only || only.has(n))) scenes.push((await import(pathToFileURL(file).href)).default);
    else scenes.push(placeholder(n));
  }
  cached = makeFilm(scenes, narration, DURATION);
  return cached;
}
