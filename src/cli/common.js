// Shared CLI helpers.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { ROOT, W, H } from '../engine/stage.js';

export function args(argv = process.argv.slice(2)) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2), v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) o[k] = true; else { o[k] = v; i++; }
    } else o._.push(a);
  }
  return o;
}

export function save(canvas, file, q = 90) {
  const out = path.isAbsolute(file) ? file : path.join(ROOT, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, /\.png$/i.test(out) ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', q));
  return out;
}

export const tc = (T) => `${Math.floor(T / 60)}:${(T % 60).toFixed(1).padStart(4, '0')}`;

// Tile rendered frames into labelled contact-sheet pages. draw(i) must return a canvas of size tw x th.
export function sheet(items, draw, { cols = 4, rows = 4, tw = 480, out }) {
  const th = Math.round((tw * H) / W), per = cols * rows, files = [];
  for (let page = 0; page * per < items.length; page++) {
    const chunk = items.slice(page * per, page * per + per);
    const cv = createCanvas(cols * tw, Math.ceil(chunk.length / cols) * th), c = cv.getContext('2d');
    c.fillStyle = '#111'; c.fillRect(0, 0, cv.width, cv.height);
    chunk.forEach((it, i) => {
      const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
      c.drawImage(draw(it), x, y, tw, th);
      c.font = '600 15px "Barlow Semi Condensed"';
      const label = it.label, w = c.measureText(label).width + 10;
      c.fillStyle = 'rgba(0,0,0,0.72)'; c.fillRect(x, y + th - 20, w, 20);
      c.fillStyle = '#ffd98a'; c.textBaseline = 'middle'; c.fillText(label, x + 5, y + th - 9);
    });
    const file = items.length > per ? out.replace(/(\.\w+)$/, `_p${page + 1}$1`) : out;
    files.push(save(cv, file, 88));
  }
  return files;
}
