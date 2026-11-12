// Verify an exported film: container/streams, full decode without errors, audio loudness/silence, and a frame sheet.
//   node scripts/verify_video.mjs build/final/the_last_pets_on_earth.mp4 [--sheet build/final/verify_sheet.jpg] [--every 30]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/engine/stage.js';
import { args } from '../src/cli/common.js';

const a = args();
const file = path.resolve(ROOT, a._[0] || 'build/final/the_last_pets_on_earth.mp4');
if (!fs.existsSync(file)) { console.error(`missing ${file}`); process.exit(1); }
const sh = (cmd, argv) => spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 1 << 26 });
const fail = [];

const probe = JSON.parse(sh('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).stdout);
const v = probe.streams.find((s) => s.codec_type === 'video'), au = probe.streams.find((s) => s.codec_type === 'audio');
const dur = +probe.format.duration;
console.log(`file      ${file}  ${(+probe.format.size / 1048576).toFixed(1)} MB  ${dur.toFixed(2)} s  ${(+probe.format.bit_rate / 1e6).toFixed(2)} Mb/s`);
if (v) console.log(`video     ${v.codec_name} ${v.profile} ${v.width}x${v.height} ${v.r_frame_rate} fps  ${v.pix_fmt}  frames ${v.nb_frames}`); else fail.push('no video stream');
if (au) console.log(`audio     ${au.codec_name} ${au.sample_rate} Hz ${au.channels} ch  ${(+au.bit_rate / 1000).toFixed(0)} kb/s  ${(+au.duration).toFixed(2)} s`); else fail.push('no audio stream');
if (a.expect && Math.abs(dur - +a.expect) > 0.25) fail.push(`duration ${dur} != expected ${a.expect}`);

// full decode of both streams: any error output means a broken file
const dec = sh('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-map', '0', '-f', 'null', '-']);
const decErr = (dec.stderr || '').trim();
console.log(`decode    ${dec.status === 0 && !decErr ? 'clean (all frames and audio decode without errors)' : 'ERRORS'}`);
if (dec.status !== 0 || decErr) fail.push(`decode errors: ${decErr.slice(0, 400)}`);

if (au) {
  const r = sh('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a', '-af', 'ebur128=peak=true,silencedetect=n=-55dB:d=2.5', '-f', 'null', '-']);
  const txt = r.stderr || '';
  const I = txt.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop(), TP = txt.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop();
  const sil = [...txt.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((m) => `${(+m[1]).toFixed(1)}–${(+m[2]).toFixed(1)}s`);
  console.log(`loudness  ${I || '?'}  true peak ${TP || '?'}`);
  console.log(`silence   ${sil.length ? sil.join(', ') : 'none longer than 2.5 s below -55 dB'}`);
  if (sil.length > 3) fail.push('long silent stretches in the soundtrack');
}

if (a.sheet !== 'false') {
  const every = +(a.every ?? Math.max(5, Math.round(dur / 40)));
  const sheet = path.resolve(ROOT, a.sheet || file.replace(/\.mp4$/, '_sheet.jpg'));
  const n = Math.ceil(dur / every), cols = 6, rows = Math.ceil(n / cols);
  const r = sh('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', file, '-vf', `fps=1/${every},scale=320:-1,drawtext=fontfile=${path.join(ROOT, 'assets/fonts/BarlowSemiCondensed-Bold.ttf')}:text='%{pts\\:hms}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${cols}x${rows}`, '-frames:v', '1', sheet]);
  console.log(`sheet     ${r.status === 0 ? sheet : 'failed: ' + r.stderr.slice(0, 200)}`);
}
console.log(fail.length ? `FAIL: ${fail.join(' | ')}` : 'PASS');
process.exit(fail.length ? 1 : 0);
