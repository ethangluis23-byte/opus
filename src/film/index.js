// Film index: loads sceneNN.js modules (placeholder card for scenes not authored yet or failing to load).
// FILM_SCENES=3,4 loads only those scene files (others become placeholders) — handy while authoring in parallel.
// A scene that fails to import/validate, or a shot whose draw() throws, falls back to a card and logs the error,
// so one broken scene never takes down stills or a long render of the others.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../engine/stage.js';
import { makeFilm, SCENE_LEN } from '../engine/film.js';
import { narration } from './narration.js';
import { LOOKS, drawSky } from '../engine/sky.js';
import { bigTitle } from '../engine/overlays.js';

export const DURATION = 600;

const TITLES = ['THE DAY HUMANS DISAPPEARED', 'THE FIRST 24 HOURS', 'AFTER 7 DAYS', 'AFTER 1 YEAR', 'AFTER 5 YEARS', 'AFTER 20 YEARS', 'AFTER 50 YEARS', 'AFTER 100 YEARS', 'AFTER 200 YEARS', 'THE LAST MEMORY'];

function card(g, t, n, sub) {
  drawSky(g, LOOKS.night, { clouds: false });
  g.vignette(0.5);
  g.screen((c) => bigTitle(c, { text: TITLES[n - 1], sub, t: (t % 60) * 0.05 + 0.8, dur: 4 }));
}

function placeholder(n, why = 'SCENE NOT AUTHORED YET') {
  return { n, shots: [{ id: `s${String(n).padStart(2, '0')}_placeholder`, at: 0, pill: `SCENE ${n}`, draw: (g, t) => card(g, t, n, why) }] };
}

function validate(sc, n) {
  if (!sc || sc.n !== n || !Array.isArray(sc.shots) || !sc.shots.length) throw new Error(`scene${n}: default export must be {n: ${n}, shots: [...]}`);
  const ats = [];
  for (const s of sc.shots) {
    if (typeof s.at !== 'number' || !(s.at >= 0 && s.at < SCENE_LEN)) throw new Error(`shot ${s.id}: "at" must be a number in [0, 60), got ${s.at}`);
    if (typeof s.draw !== 'function') throw new Error(`shot ${s.id}: missing draw()`);
    ats.push(s.at);
  }
  ats.sort((x, y) => x - y);
  if (ats[0] !== 0) throw new Error(`scene${n}: first shot must have at: 0`);
  for (let i = 1; i < ats.length; i++) if (ats[i] - ats[i - 1] <= 0.05) throw new Error(`scene${n}: two shots start at ${ats[i].toFixed(2)}`);
}

const reported = new Set();
function guard(sc) {
  for (const s of sc.shots) {
    const draw = s.draw;
    s.draw = (g, t) => {
      try { draw(g, t); } catch (e) {
        if (!reported.has(s.id)) { reported.add(s.id); console.error(`ERROR shot ${s.id} at t=${t.toFixed(2)}: ${e.stack || e}`); }
        g.ctx.restore(); g.ctx.save(); g._reset(g.ctx); g.begin();
        card(g, t, sc.n, `SHOT ${s.id} FAILED`);
      }
    };
  }
  return sc;
}

let cached = null;
export async function getFilm() {
  if (cached) return cached;
  const only = process.env.FILM_SCENES ? new Set(process.env.FILM_SCENES.split(',').map(Number)) : null;
  const scenes = [];
  for (let n = 1; n <= 10; n++) {
    const file = path.join(ROOT, 'src/film', `scene${String(n).padStart(2, '0')}.js`);
    if (!fs.existsSync(file) || (only && !only.has(n))) { scenes.push(placeholder(n)); continue; }
    try {
      const sc = (await import(pathToFileURL(file).href)).default;
      validate(sc, n);
      scenes.push(guard(sc));
    } catch (e) {
      console.error(`WARNING scene${n} not loaded: ${e.message}`);
      scenes.push(placeholder(n, 'SCENE FAILED TO LOAD'));
    }
  }
  cached = makeFilm(scenes, narration, DURATION);
  return cached;
}
