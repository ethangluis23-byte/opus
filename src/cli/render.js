// Render a time range of the film to H.264 by piping raw frames into ffmpeg.
//   node src/cli/render.js --from 0 --to 60 --out build/video/part_00.mp4 [--scale 1] [--crf 16] [--preset medium]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { getFilm } from '../film/index.js';
import { Renderer } from '../engine/film.js';
import { FPS, ROOT } from '../engine/stage.js';
import { args, tc } from './common.js';

const a = args();
const film = await getFilm();
const from = +(a.from ?? 0), to = +(a.to ?? film.duration), scale = +(a.scale || 1);
const out = path.isAbsolute(a.out || '') ? a.out : path.join(ROOT, a.out || 'build/video/out.mp4');
fs.mkdirSync(path.dirname(out), { recursive: true });

const R = new Renderer(film, scale);
const w = R.A.pw, h = R.A.ph;
const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
const ff = spawn('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', a.preset || 'medium', '-crf', String(a.crf || 16),
  '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709',
  '-g', String(FPS * 2), '-movflags', '+faststart', out,
], { stdio: ['pipe', 'inherit', 'inherit'] });
ff.on('error', (e) => { console.error('ffmpeg failed to start', e); process.exit(1); });

const t0 = performance.now();
for (let f = f0; f < f1; f++) {
  const cv = R.frame(f / FPS);
  const buf = Buffer.from(cv.data());
  if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
  if ((f - f0) % (FPS * 5) === 0) {
    const el = (performance.now() - t0) / 1000, done = f - f0 + 1;
    console.log(`${tc(f / FPS)}  ${done}/${f1 - f0} frames  ${(done / Math.max(el, 0.001)).toFixed(1)} fps`);
  }
}
ff.stdin.end();
const [code] = await once(ff, 'close');
console.log(`done ${f1 - f0} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s, ffmpeg exit ${code} -> ${out}`);
process.exit(code || 0);
