// Narration-only audio for a time range (used for quick previews before the full mix exists).
//   node scripts/preview_audio.mjs [--from 0] [--to 60] [--out build/audio/preview_narration.wav]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { narration } from '../src/film/narration.js';
import { ROOT } from '../src/engine/stage.js';
import { args } from '../src/cli/common.js';

const a = args();
const from = +(a.from ?? 0), to = +(a.to ?? 60);
const out = path.join(ROOT, a.out || 'build/audio/preview_narration.wav');
const lines = narration.lines.filter((l) => l.start >= from && l.start < to && fs.existsSync(path.join(ROOT, 'build/audio/narration', `${l.id}.wav`)));
const argv = ['-hide_banner', '-loglevel', 'error', '-y'];
for (const l of lines) argv.push('-i', path.join(ROOT, 'build/audio/narration', `${l.id}.wav`));
const parts = lines.map((l, i) => `[${i}:a]adelay=${Math.round((l.start - from) * 1000)}:all=1[a${i}]`);
const mix = `${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad,atrim=0:${to - from},aformat=channel_layouts=stereo[out]`;
argv.push('-filter_complex', [...parts, mix].join(';'), '-map', '[out]', '-ar', '48000', out);
const r = spawnSync('ffmpeg', argv, { stdio: 'inherit' });
console.log(`${lines.length} lines -> ${out} (exit ${r.status})`);
process.exit(r.status || 0);
