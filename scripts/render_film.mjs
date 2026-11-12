// Render the whole film (or a range) in parallel segments, join them, and mux the soundtrack.
//   node scripts/render_film.mjs [--from 0 --to 600] [--seg 60] [--jobs 2] [--crf 16] [--preset slow]
//                                [--audio build/audio/mix.wav] [--out build/final/the_last_pets_on_earth.mp4] [--force]
// Segments are cached in build/video/segments (re-rendered with --force or when missing). Every frame is a pure
// function of time, so segments rendered by separate processes join seamlessly.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../src/engine/stage.js';
import { args } from '../src/cli/common.js';

const a = args();
const from = +(a.from ?? 0), to = +(a.to ?? 600), seg = +(a.seg ?? 60);
const jobs = +(a.jobs ?? Math.max(1, os.cpus().length));
const crf = String(a.crf ?? 16), preset = a.preset ?? 'slow';
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const out = abs(a.out ?? 'build/final/the_last_pets_on_earth.mp4');
const audio = abs(a.audio ?? 'build/audio/mix.wav');
const segDir = path.join(ROOT, 'build/video/segments'), logDir = path.join(ROOT, 'build/logs');
fs.mkdirSync(segDir, { recursive: true }); fs.mkdirSync(logDir, { recursive: true }); fs.mkdirSync(path.dirname(out), { recursive: true });

const run = (cmd, argv, logFile) => new Promise((resolve, reject) => {
  const log = logFile ? fs.openSync(logFile, 'a') : 'inherit';
  const p = spawn(cmd, argv, { stdio: ['ignore', log, log] });
  p.on('error', reject);
  p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${argv.slice(0, 6).join(' ')} … exited ${code}`))));
});

const segs = [];
for (let t = from; t < to - 1e-6; t += seg) {
  const t1 = Math.min(to, t + seg);
  segs.push({ t0: t, t1, file: path.join(segDir, `seg_${String(Math.round(t * 10)).padStart(5, '0')}_${String(Math.round(t1 * 10)).padStart(5, '0')}_crf${crf}.mp4`) });
}
const todo = segs.filter((s) => a.force || !fs.existsSync(s.file));
console.log(`${segs.length} segments (${todo.length} to render) with ${jobs} jobs, crf ${crf}, preset ${preset}`);
const t0 = performance.now();
let next = 0, failed = null;
async function worker() {
  while (next < todo.length && !failed) {
    const s = todo[next++], tmp = s.file.replace(/\.mp4$/, '.part.mp4');
    const logFile = path.join(logDir, `render_${path.basename(s.file, '.mp4')}.log`);
    console.log(`  render ${s.t0}–${s.t1}s -> ${path.basename(s.file)}`);
    try {
      await run(process.execPath, ['src/cli/render.js', '--from', String(s.t0), '--to', String(s.t1), '--out', tmp, '--crf', crf, '--preset', preset], logFile);
      fs.renameSync(tmp, s.file);
      console.log(`  done   ${s.t0}–${s.t1}s  (${((performance.now() - t0) / 60000).toFixed(1)} min elapsed)`);
    } catch (e) { failed = e; console.error(`  FAILED ${s.t0}–${s.t1}s: ${e.message} (see ${logFile})`); }
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, Math.max(1, todo.length)) }, worker));
if (failed) process.exit(1);

const list = path.join(segDir, 'concat.txt');
fs.writeFileSync(list, segs.map((s) => `file '${s.file}'`).join('\n') + '\n');
const video = out.replace(/\.mp4$/, '.video.mp4');
await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', video]);
if (a['no-mux'] || !fs.existsSync(audio)) {
  if (!a['no-mux']) console.log(`WARNING: ${audio} missing — wrote video only`);
  fs.renameSync(video, out);
} else {
  // the mix may cover the whole film while the video covers a range: cut the matching audio span
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-ss', String(a['audio-offset'] ?? 0), '-t', String(to - from), '-i', audio,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    '-metadata', 'title=The Last Pets on Earth', '-movflags', '+faststart', '-shortest', out]);
  fs.unlinkSync(video);
}
console.log(`wrote ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB) in ${((performance.now() - t0) / 60000).toFixed(1)} min`);
