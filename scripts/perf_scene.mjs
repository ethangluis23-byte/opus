// Frame-time profile of one scene: average / p95 / max ms per frame and the slowest shots.
//   FILM_SCENES=3 node scripts/perf_scene.mjs 3 [--step 0.5] [--scale 1]
import { getFilm } from '../src/film/index.js';
import { Renderer } from '../src/engine/film.js';
import { args } from '../src/cli/common.js';

const a = args();
const n = +(a._[0] ?? a.scene ?? 1), step = +(a.step ?? 0.5), scale = +(a.scale ?? 1);
const film = await getFilm();
const R = new Renderer(film, scale);
R.frame((n - 1) * 60 + 0.01); // warm caches/fonts
const times = [], per = new Map();
for (let T = (n - 1) * 60 + step / 2; T < n * 60; T += step) {
  const t0 = performance.now();
  const cv = R.frame(T);
  cv.data(); // include the pixel readback the encoder needs
  const ms = performance.now() - t0;
  times.push(ms);
  const s = film.shots.find((x) => T >= x.start && T < x.end);
  const e = per.get(s.id) || { n: 0, sum: 0, max: 0 };
  e.n++; e.sum += ms; e.max = Math.max(e.max, ms); per.set(s.id, e);
}
times.sort((x, y) => x - y);
const avg = times.reduce((x, y) => x + y, 0) / times.length;
console.log(`scene ${n}: ${times.length} frames at scale ${scale}: avg ${avg.toFixed(0)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(0)} ms, max ${times[times.length - 1].toFixed(0)} ms (includes ~40 ms pixel readback)`);
for (const [id, e] of [...per].sort((x, y) => y[1].sum / y[1].n - x[1].sum / x[1].n)) console.log(`  ${id.padEnd(22)} avg ${(e.sum / e.n).toFixed(0).padStart(4)} ms  max ${e.max.toFixed(0).padStart(4)} ms`);
