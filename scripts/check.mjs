// Crash + speed check: renders sampled frames of a time range and reports per-shot timings and any exception.
//   node scripts/check.mjs [--scene 3 | --from 0 --to 600] [--step 0.5] [--scale 0.5]
import { getFilm } from '../src/film/index.js';
import { Renderer } from '../src/engine/film.js';
import { args, tc } from '../src/cli/common.js';

const a = args();
const film = await getFilm();
const from = a.scene ? (+a.scene - 1) * 60 : +(a.from ?? 0);
const to = a.scene ? +a.scene * 60 : +(a.to ?? film.duration);
const step = +(a.step || 0.5), scale = +(a.scale || 0.5);
const R = new Renderer(film, scale);
const per = new Map();
let errors = 0;
for (let T = from; T < to - 1e-6; T += step) {
  const s = film.shots.find((x) => T >= x.start && T < x.end);
  const t0 = performance.now();
  try { R.frame(T); } catch (e) {
    errors++;
    if (errors <= 12) console.log(`ERROR at ${tc(T)} in ${s.id}: ${String(e.stack || e).split('\n').slice(0, 3).join(' | ')}`);
    // a throw can leave the canvas state stack unbalanced; start from a fresh renderer state
    R.A.ctx.reset?.(); R.B.ctx.reset?.();
    continue;
  }
  const ms = performance.now() - t0, p = per.get(s.id) || { n: 0, sum: 0, max: 0 };
  p.n++; p.sum += ms; p.max = Math.max(p.max, ms); per.set(s.id, p);
}
let total = 0, n = 0;
for (const [id, p] of per) { total += p.sum; n += p.n; console.log(`${id.padEnd(18)} avg ${(p.sum / p.n).toFixed(0).padStart(4)} ms  max ${p.max.toFixed(0).padStart(4)} ms  (${p.n} frames)`); }
console.log(`${n} frames at scale ${scale}: avg ${(total / Math.max(n, 1)).toFixed(0)} ms, ${errors} errors`);
process.exit(errors ? 1 : 0);
