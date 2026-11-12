// Copy important generated assets out of the git-ignored build/ folder into tracked folders (run before committing),
// so production can resume without re-synthesising narration or losing approved reference sheets.
//   node scripts/backup_assets.mjs
// Restore is automatic: src/film/narration.js and audio/mix.py fall back to assets/audio/ when build/audio/ is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [
  ['build/audio/narration.json', 'assets/audio/narration.json'],
  ['build/audio/tts_report.md', 'assets/audio/tts_report.md'],
  ['build/audio/tts_tmp/voice_selection.json', 'assets/audio/voice_selection.json'],
  ['build/audio/narration', 'assets/audio/narration', /\.wav$/],
  ['build/audio/parrot', 'assets/audio/parrot', /\.wav$/],
  ['build/sheets', 'docs/sheets', /\.(jpg|png)$/],
];
let copied = 0, same = 0;
const sameFile = (a, b) => fs.existsSync(b) && fs.statSync(a).size === fs.statSync(b).size && fs.readFileSync(a).equals(fs.readFileSync(b));
function copy(src, dst) {
  if (sameFile(src, dst)) { same++; return; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied++;
}
for (const [s, d, re] of jobs) {
  const src = path.join(ROOT, s), dst = path.join(ROOT, d);
  if (!fs.existsSync(src)) continue;
  if (fs.statSync(src).isDirectory()) { for (const f of fs.readdirSync(src)) if (!re || re.test(f)) copy(path.join(src, f), path.join(dst, f)); }
  else copy(src, dst);
}
console.log(`backup: ${copied} files copied, ${same} unchanged`);
