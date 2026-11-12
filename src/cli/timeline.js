// Export build/timeline.json for the audio mix: scenes, markers, narration starts, ambience beds and sound cues.
//   node src/cli/timeline.js [--out build/timeline.json]
// Shots may carry:  bed: 'wind_street' | {type, gain, params} | [..]   (ambience for the shot's duration)
//                   sfx: [{at (seconds from shot start), type, gain, pan, params}]
//                   bedCut: true (end the previous ambience abruptly at this shot)
// Scene modules may export markers: {name: absoluteSeconds}.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getFilm, DURATION } from '../film/index.js';
import { narration } from '../film/narration.js';
import { ROOT } from '../engine/stage.js';
import { args } from './common.js';

const a = args();
const film = await getFilm();
const TITLES = ['THE DAY HUMANS DISAPPEARED', 'THE FIRST 24 HOURS', 'AFTER 7 DAYS', 'AFTER 1 YEAR', 'AFTER 5 YEARS', 'AFTER 20 YEARS', 'AFTER 50 YEARS', 'AFTER 100 YEARS', 'AFTER 200 YEARS', 'THE LAST MEMORY'];
const r2 = (x) => Math.round(x * 1000) / 1000;

const scenes = TITLES.map((label, i) => ({ n: i + 1, start: i * 60, end: i === 9 ? film.duration : (i + 1) * 60, label }));
const markers = { vanish: 24.0, main_title: 55.2, photo_start: 446.0, photo_end: 478.0, finale_start: 540.0 };
for (let n = 1; n <= 10; n++) {
  const file = path.join(ROOT, 'src/film', `scene${String(n).padStart(2, '0')}.js`);
  if (fs.existsSync(file)) Object.assign(markers, (await import(pathToFileURL(file).href)).markers || {});
}
const last = narration.lines[narration.lines.length - 1];
markers.last_word_end = r2(last.end);

// beds: merge runs of consecutive shots that carry the same ambience
const beds = [], open = new Map();
const norm = (b) => (typeof b === 'string' ? { type: b } : b);
const close = (key, end, cut) => { const b = open.get(key); if (!b) return; b.end = r2(end + (cut ? 0 : 0.6)); b.fade_out = cut ? 0.06 : 1.2; beds.push(b); open.delete(key); };
for (const s of film.shots) {
  const list = (s.bed ? (Array.isArray(s.bed) ? s.bed : [s.bed]) : []).map(norm);
  const keys = new Set(list.map((b) => JSON.stringify([b.type, b.gain ?? -22, b.params || {}])));
  for (const key of [...open.keys()]) if (!keys.has(key)) close(key, s.start, s.bedCut);
  for (const b of list) {
    const key = JSON.stringify([b.type, b.gain ?? -22, b.params || {}]);
    if (!open.has(key)) open.set(key, { type: b.type, start: r2(Math.max(0, s.start - (s.bedCut ? 0 : 0.6))), end: 0, gain_db: b.gain ?? -22, fade_in: s.bedCut ? 0.3 : 1.2, fade_out: 1.2, params: b.params || {} });
  }
}
for (const key of [...open.keys()]) close(key, film.duration, true);
beds.sort((x, y) => x.start - y.start);

const sfx = [];
for (const s of film.shots) for (const e of s.sfx || []) sfx.push({ t: r2(s.start + e.at), type: e.type, gain_db: e.gain ?? -12, pan: e.pan ?? 0, params: e.params || {} });
// automatic transition sounds at the time-jump boundaries (scenes 2..9 start with a title card)
for (let n = 2; n <= 9; n++) {
  const T = (n - 1) * 60;
  sfx.push({ t: r2(T - 3.0), type: 'riser', gain_db: -13, pan: 0, params: { dur: 3.0 } });
  if (n >= 3) sfx.push({ t: r2(T - 3.3), type: 'time_tick', gain_db: -16, pan: 0, params: { dur: 3.2, accel: 1 } });
  sfx.push({ t: r2(T + 0.3), type: 'boom', gain_db: -8, pan: 0, params: {} });
  sfx.push({ t: r2(T - 0.35), type: 'whoosh', gain_db: -14, pan: 0, params: { dur: 0.9 } });
}
sfx.sort((x, y) => x.t - y.t);

const out = {
  fps: 30, duration: film.duration, scenes, markers,
  narration: narration.lines.map((l) => ({ id: l.id, start: r2(l.start) })),
  beds, sfx,
};
const file = path.join(ROOT, a.out || 'build/timeline.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1));
const types = [...new Set(sfx.map((x) => x.type))].sort();
console.log(`${file}: ${out.narration.length} lines, ${beds.length} beds, ${sfx.length} cues (${types.length} types)`);
// narration sanity: overlaps and scene overruns
let prev = null;
for (const l of narration.lines) {
  if (prev && l.start < prev.end + 0.15) console.log(`  WARN narration overlap: ${prev.id} ends ${prev.end.toFixed(2)} but ${l.id} starts ${l.start.toFixed(2)}`);
  const lim = l.scene === 10 ? film.duration - 2 : l.scene * 60 - 0.5;
  if (l.end > lim) console.log(`  WARN ${l.id} ends at ${l.end.toFixed(2)}, past ${lim.toFixed(2)}`);
  prev = l;
}
