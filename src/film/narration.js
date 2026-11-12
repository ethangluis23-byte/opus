// Narration timeline: script lines + measured TTS word timings (when available) + authored start times.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../engine/stage.js';

const readJSON = (p, d = null) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d);

function load() {
  const script = readJSON(path.join(ROOT, 'film/script.json'));
  const tts = readJSON(path.join(ROOT, 'build/audio/narration.json'));
  // Authored line starts (absolute film seconds): film/starts.json plus one file per scene in film/starts/.
  const starts = readJSON(path.join(ROOT, 'film/starts.json'), {});
  const dir = path.join(ROOT, 'film/starts');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) Object.assign(starts, readJSON(path.join(dir, f), {}));
  const cursor = {};
  const lines = [];
  for (const L of script.lines) {
    const toks = L.text.split(/\s+/);
    const tl = tts?.lines?.[L.id];
    let words, dur;
    if (tl && tl.words?.length === toks.length) {
      words = tl.words.map((w, i) => ({ w: toks[i], s: w.s, e: w.e }));
      dur = tl.dur;
    } else {
      // No TTS yet: estimate about 2.5 words per second.
      let t = 0;
      words = toks.map((w) => {
        const s = t;
        t += 0.15 + 0.052 * w.replace(/[^a-z]/gi, '').length + (/[.?!:]$/.test(w) ? 0.3 : /,$/.test(w) ? 0.16 : 0);
        return { w, s, e: t - 0.04 };
      });
      dur = t;
    }
    const base = (L.scene - 1) * 60;
    let start = starts[L.id];
    if (start == null) start = cursor[L.scene] ?? base + (L.scene === 1 ? 0.8 : 3.2);
    cursor[L.scene] = start + dur + 0.55;
    lines.push({ id: L.id, scene: L.scene, text: L.text, hl: L.hl || [], start, dur, end: start + dur, words });
  }
  return { lines, hasTTS: !!tts, parrot: tts?.parrot || {} };
}

export const narration = load();
const byId = new Map(narration.lines.map((l) => [l.id, l]));

// nar('3.2') -> {start, end, dur} in absolute film seconds. nar.rel('3.2') -> start relative to its scene.
export function nar(id) {
  const l = byId.get(id);
  if (!l) throw new Error(`unknown narration line ${id}`);
  return l;
}
nar.rel = (id, lead = 0) => { const l = nar(id); return l.start - (l.scene - 1) * 60 - lead; };
// Absolute time of the n-th word (0-based) of a line; handy for syncing a visual beat to a spoken word.
nar.word = (id, n) => { const l = nar(id); return l.start + l.words[Math.min(n, l.words.length - 1)].s; };
