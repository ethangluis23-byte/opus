// Render the whole film in 30 s parts with two parallel workers, then join the parts.
//   node scripts/render_film.mjs [--crf 15] [--preset slow] [--from 0] [--to 600] [--workers 2] [--dir build/video]
// Parts that already exist (part_NN.mp4 with a .done marker) are skipped, so the script can be resumed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { args } from '../src/cli/common.js';

const a = args();
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(root, a.dir || 'build/video');
const logs = path.join(root, 'build/logs');
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(logs, { recursive: true });
const from = +(a.from ?? 0), to = +(a.to ?? 600), LEN = 30;
const parts = [];
for (let s = from; s < to; s += LEN) parts.push({ s, e: Math.min(to, s + LEN), n: String(Math.round(s / LEN)).padStart(2, '0') });

const run = (cmd, argv, log) => new Promise((res) => {
  const out = log ? fs.openSync(log, 'w') : 'inherit';
  const p = spawn(cmd, argv, { cwd: root, stdio: ['ignore', out, out] });
  p.on('close', (code) => res(code));
});

const queue = parts.filter((p) => !fs.existsSync(path.join(dir, `part_${p.n}.done`)));
let failed = 0;
async function worker() {
  for (;;) {
    const p = queue.shift();
    if (!p) return;
    const out = path.join(dir, `part_${p.n}.mp4`), t0 = Date.now();
    const code = await run('node', ['src/cli/render.js', '--from', p.s, '--to', p.e, '--out', out, '--crf', a.crf || 15, '--preset', a.preset || 'slow'].map(String), path.join(logs, `part_${p.n}.log`));
    if (code === 0) { fs.writeFileSync(path.join(dir, `part_${p.n}.done`), ''); console.log(`part ${p.n} done in ${((Date.now() - t0) / 1000).toFixed(0)}s`); } else { failed++; console.log(`part ${p.n} FAILED (build/logs/part_${p.n}.log)`); }
  }
}
await Promise.all(Array.from({ length: +(a.workers || 2) }, worker));
if (failed) process.exit(1);
fs.writeFileSync(path.join(dir, 'parts.txt'), parts.map((p) => `file 'part_${p.n}.mp4'\n`).join(''));
const code = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'parts.txt'), '-c', 'copy', '-movflags', '+faststart', path.join(dir, 'picture.mp4')]);
console.log(code === 0 ? `picture: ${path.join(dir, 'picture.mp4')}` : 'concat FAILED');
process.exit(code);
