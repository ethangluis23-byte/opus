// On-screen graphics language: time pill, corner badge, callout labels, title cards, karaoke captions, film grain.
import { createCanvas } from '@napi-rs/canvas';
import { W, H } from './stage.js';
import { TAU, clamp, ease, ss, RNG, alpha, lerp } from './util.js';
import { rrect, lin, rad, txt } from './draw.js';

export const GOLD = '#f7c35f', GOLD_HOT = '#ffc247', GOLD_DEEP = '#f2a52e', NAVY = '#0b1030', CREAM = '#fbe3a6';
export const PANEL = 'rgba(8,12,32,0.68)';
export const F_COND = 'Barlow Condensed', F_SEMI = 'Barlow Semi Condensed';

// Top-left time marker, e.g. "+7 DAYS".
export function timePill(c, text, a = 1, pop = 1) {
  if (!text || a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  c.font = `600 23px "${F_SEMI}"`; c.letterSpacing = '2.6px';
  const tw = c.measureText(text).width, x = 52, y = 40, h = 46, w = tw + 60;
  c.translate(x + 24, y + h / 2); c.scale(pop, pop); c.translate(-(x + 24), -(y + h / 2));
  const p = rrect(x, y, w, h, h / 2);
  c.fillStyle = PANEL; c.fill(p);
  c.strokeStyle = alpha(GOLD, 0.85); c.lineWidth = 2; c.stroke(p);
  c.fillStyle = GOLD; c.beginPath(); c.arc(x + 24, y + h / 2, 6, 0, TAU); c.fill();
  c.fillStyle = CREAM; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText(text, x + 42, y + h / 2 + 1);
  c.restore();
}

// Top-right paw mark.
export function pawBadge(c, a = 1) {
  if (a <= 0) return;
  const s = 40, x = W - 52 - s, y = 43;
  c.save();
  c.globalAlpha *= a;
  const p = rrect(x, y, s, s, 11);
  c.fillStyle = PANEL; c.fill(p);
  c.strokeStyle = alpha(GOLD, 0.8); c.lineWidth = 2; c.stroke(p);
  c.fillStyle = GOLD;
  const cx = x + s / 2, cy = y + s / 2 + 3;
  c.beginPath(); c.ellipse(cx, cy + 3, 7.2, 5.8, 0, 0, TAU); c.fill();
  for (const [dx, dy] of [[-8.5, -3.5], [-3, -9], [3, -9], [8.5, -3.5]]) { c.beginPath(); c.ellipse(cx + dx, cy + dy, 2.7, 3.3, dx * 0.04, 0, TAU); c.fill(); }
  c.restore();
}

// Gold label with a leader line to a point. o: {x, y (anchor), lx, ly (label centre), text, p (0..1 draw-on), a, size}
export function callout(c, o) {
  const p = clamp(o.p ?? 1), a = o.a ?? 1;
  if (p <= 0 || a <= 0) return;
  const size = o.size ?? 24;
  c.save();
  c.globalAlpha *= a;
  c.font = `700 ${size}px "${F_SEMI}"`; c.letterSpacing = '2.4px';
  const tw = c.measureText(o.text).width, bw = tw + 36, bh = size + 22;
  const bx = o.lx - bw / 2, by = o.ly - bh / 2;
  // leader: 45-degree run from the anchor, then straight to the nearest box edge
  const pts = [[o.x, o.y]];
  const dx = o.lx - o.x, dy = o.ly - o.y;
  if (Math.abs(dx) > bw / 2 + 12) {
    const ex = dx > 0 ? bx : bx + bw, run = Math.min(Math.abs(dy), Math.abs(ex - o.x) - 8);
    if (run > 4) pts.push([o.x + Math.sign(dx) * run, o.ly]);
    pts.push([ex, o.ly]);
  } else {
    pts.push([o.lx, dy > 0 ? by : by + bh]);
  }
  let total = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
  let left = total * ease.out3(ss(0.08, 0.62, p));
  c.strokeStyle = alpha(GOLD, 0.92); c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const u = Math.min(1, left / (segs[i - 1] || 1));
    c.lineTo(lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u));
    left -= segs[i - 1];
  }
  c.stroke();
  const ds = ease.back(ss(0, 0.28, p));
  c.fillStyle = alpha(GOLD, 0.28); c.beginPath(); c.arc(o.x, o.y, 12 * ds, 0, TAU); c.fill();
  c.fillStyle = GOLD_HOT; c.beginPath(); c.arc(o.x, o.y, 5.5 * ds, 0, TAU); c.fill();
  const la = ss(0.5, 0.9, p);
  if (la > 0) {
    c.globalAlpha *= la;
    const slide = (1 - ease.out3(la)) * 10 * Math.sign(dx || 1);
    const box = rrect(bx - slide, by, bw, bh, 9);
    c.fillStyle = PANEL; c.fill(box);
    c.strokeStyle = alpha(GOLD, 0.9); c.lineWidth = 2; c.stroke(box);
    c.fillStyle = '#ffd98a'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(o.text, o.lx - slide + 1.2, o.ly + 1);
  }
  c.restore();
}

// Standalone label box (no leader), same style as callout labels.
export function tag(c, text, x, y, a = 1, size = 24) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  c.font = `700 ${size}px "${F_SEMI}"`; c.letterSpacing = '2.4px';
  const bw = c.measureText(text).width + 36, bh = size + 22, box = rrect(x - bw / 2, y - bh / 2, bw, bh, 9);
  c.fillStyle = PANEL; c.fill(box);
  c.strokeStyle = alpha(GOLD, 0.9); c.lineWidth = 2; c.stroke(box);
  c.fillStyle = '#ffd98a'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x + 1.2, y + 1);
  c.restore();
}

// Big gold time-jump banner. o: {text, sub, t (local seconds), dur, y, size, band}
export function bigTitle(c, o) {
  const t = o.t, dur = o.dur ?? 3.2;
  if (t < 0 || t > dur) return;
  const a = Math.min(ss(0, 0.3, t), 1 - ss(dur - 0.55, dur, t));
  const y = o.y ?? 480, size = o.size ?? 156, zoom = 1 + 0.035 * (t / dur);
  c.save();
  c.translate(W / 2, y); c.scale(zoom, zoom); c.translate(-W / 2, -y);
  if (o.band !== false) {
    const bh = size * 2.1 * ease.out3(ss(0, 0.45, t));
    c.globalAlpha = a * 0.62;
    c.fillStyle = lin(c, 0, y - bh / 2, 0, y + bh / 2, [[0, 'rgba(5,8,24,0)'], [0.2, 'rgba(5,8,24,1)'], [0.8, 'rgba(5,8,24,1)'], [1, 'rgba(5,8,24,0)']]);
    c.fillRect(-W * 0.1, y - bh / 2, W * 1.2, bh);
  }
  const rise = (1 - ease.out3(ss(0.05, 0.6, t))) * 30, ty = y + rise - (o.sub ? size * 0.14 : 0);
  c.globalAlpha = a;
  c.font = `800 ${size}px "${F_COND}"`; c.letterSpacing = `${(size * 0.05).toFixed(1)}px`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = 'rgba(255,146,36,0.8)'; c.shadowBlur = 38;
  c.fillStyle = lin(c, 0, ty - size * 0.45, 0, ty + size * 0.45, [[0, '#ffe7a8'], [0.55, '#fcc04e'], [1, '#f09a20']]);
  c.fillText(o.text, W / 2 + size * 0.025, ty);
  c.shadowBlur = 0; c.shadowColor = 'transparent';
  if (o.sub) {
    const lw = 250 * ease.out3(ss(0.25, 0.8, t)), ly = y + size * 0.4 + rise * 0.5;
    c.strokeStyle = alpha(GOLD, 0.9); c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(W / 2 - lw, ly); c.lineTo(W / 2 + lw, ly); c.stroke();
    c.globalAlpha = a * ss(0.35, 0.9, t);
    c.font = `600 ${Math.round(size * 0.21)}px "${F_SEMI}"`; c.letterSpacing = `${(size * 0.06).toFixed(1)}px`;
    c.fillStyle = '#fff4d6';
    c.fillText(o.sub, W / 2 + size * 0.03, ly + size * 0.24);
  }
  c.restore();
}

// Cartoon speech bubble whose tail points at (x, y). o: {x, y, text, p (pop 0..1), side (1 right of the tail, -1 left), size}
export function bubble(c, o) {
  const p = clamp(o.p ?? 1);
  if (p <= 0) return;
  const size = o.size ?? 40, side = o.side ?? 1, k = ease.back(p);
  c.save();
  c.font = `800 ${size}px "${F_COND}"`; c.letterSpacing = '2px';
  const tw = c.measureText(o.text).width, bw = tw + 52, bh = size + 34;
  const cx = o.x + side * (bw / 2 + 26), cy = o.y - bh / 2 - 38;
  c.translate(o.x, o.y); c.scale(k, k); c.translate(-o.x, -o.y);
  c.globalAlpha *= Math.min(1, p * 2);
  c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 16; c.shadowOffsetY = 6;
  c.fillStyle = '#fffaf0';
  const box = rrect(cx - bw / 2, cy - bh / 2, bw, bh, bh * 0.42);
  c.fill(box);
  c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(cx - side * bw * 0.3, cy + bh / 2 - 6); c.lineTo(cx - side * bw * 0.12, cy + bh / 2 - 2); c.closePath(); c.fill();
  c.shadowBlur = 0; c.shadowColor = 'transparent'; c.shadowOffsetY = 0;
  c.fillStyle = '#1b2248'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(o.text, cx + 1, cy + 2);
  c.restore();
}

// ---- captions ----
// lines: [{id, start, words: [{w, s, e}], hl: [phrases]}] -> display chunks with absolute word times.
export function buildCaptions(lines) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9'-]/g, '');
  const chunks = [];
  for (const L of lines) {
    const toks = L.words.map((w) => ({ w: w.w, t0: L.start + w.s, t1: L.start + w.e, hl: false }));
    const nt = toks.map((t) => norm(t.w));
    for (const h of L.hl || []) {
      const hw = h.split(/\s+/).map(norm);
      for (let i = 0; i + hw.length <= nt.length; i++) {
        if (hw.every((x, j) => nt[i + j] === x)) { for (let j = 0; j < hw.length; j++) toks[i + j].hl = true; break; }
      }
    }
    let cur = [];
    const flush = () => { if (cur.length) { chunks.push({ words: cur, line: L.id }); cur = []; } };
    for (let i = 0; i < toks.length; i++) {
      cur.push(toks[i]);
      const w = toks[i].w, len = cur.reduce((s, x) => s + x.w.length + 1, 0), left = toks.length - 1 - i;
      const hard = /[.?!:]$/.test(w), soft = /[,;]$/.test(w);
      if (hard || (soft && cur.length >= 3) || cur.length >= 6 || len >= 30) {
        if (left === 1 && !hard) continue; // do not strand a single word
        flush();
      }
    }
    flush();
  }
  chunks.forEach((ch, i) => {
    const end = ch.words[ch.words.length - 1].t1, next = chunks[i + 1];
    ch.t0 = ch.words[0].t0 - 0.08;
    ch.t1 = Math.max(end, Math.min(end + 0.55, next ? next.words[0].t0 - 0.08 : end + 0.55));
  });
  return chunks;
}

export function drawCaptions(c, chunks, T) {
  let ch = null;
  for (const x of chunks) { if (T >= x.t0 && T < x.t1) { ch = x; break; } if (x.t0 > T) break; }
  if (!ch) return;
  const a = Math.min(ss(ch.t0, ch.t0 + 0.1, T), 1 - ss(ch.t1 - 0.12, ch.t1, T));
  c.save();
  c.font = `700 46px "${F_SEMI}"`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.letterSpacing = '0.6px';
  const sp = 12, ws = ch.words.map((w) => c.measureText(w.w).width);
  const total = ws.reduce((s, x) => s + x, 0) + sp * (ws.length - 1), y = 984, R = total / 2 + 200;
  c.save();
  c.globalAlpha = a * 0.6;
  c.translate(W / 2, y + 4); c.scale(1, 66 / R);
  c.fillStyle = rad(c, 0, 0, R, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]);
  c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  c.restore();
  c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 9; c.shadowOffsetY = 2;
  let x = W / 2 - total / 2;
  ch.words.forEach((w, i) => {
    const said = T >= w.t0 - 0.03;
    c.globalAlpha = a * (said ? 1 : 0.45);
    c.fillStyle = said && w.hl ? GOLD_HOT : '#ffffff';
    c.fillText(w.w, x, y);
    x += ws[i] + sp;
  });
  c.restore();
}

// ---- film grain (also dithers gradients against banding) ----
let grainTiles = null;
function makeGrain() {
  grainTiles = [];
  for (let k = 0; k < 4; k++) {
    const n = 256, cv = createCanvas(n, n), x = cv.getContext('2d'), img = x.createImageData(n, n), r = RNG(900 + k);
    for (let i = 0; i < n * n; i++) {
      const v = clamp(128 + (r() + r() + r() - 1.5) * 90, 0, 255);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    grainTiles.push(cv);
  }
}
export function grain(c, frame, amt = 0.06) {
  if (amt <= 0) return;
  if (!grainTiles) makeGrain();
  const f = Math.floor(frame / 2), tile = grainTiles[f % 4];
  c.save();
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = amt;
  c.translate(-((f * 73) % 256), -((f * 151) % 256));
  c.fillStyle = c.createPattern(tile, 'repeat');
  c.fillRect(0, 0, W + 256, H + 256);
  c.restore();
}

// Rolling counter for time-lapses, e.g. label "DAYS WITHOUT HUMANS", value "128".
export function counter(c, label, value, a = 1, y = 150) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  txt(c, label, W / 2, y - 62, { font: F_SEMI, weight: 600, size: 26, track: 6, color: '#fff4d6' });
  txt(c, value, W / 2, y, { font: F_COND, weight: 800, size: 104, track: 4, color: GOLD_HOT, glow: ['rgba(255,146,36,0.7)', 26] });
  c.restore();
}
