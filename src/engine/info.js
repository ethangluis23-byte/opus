// Infographic language (gold on navy): headings, cards, arrows, reticles, bars. Screen-space helpers; call inside g.screen().
import { W, H } from './stage.js';
import { TAU, clamp, ease, ss, alpha, lerp } from './util.js';
import { rrect, lin, txt, glow } from './draw.js';
import { GOLD, GOLD_HOT, CREAM, PANEL, F_COND, F_SEMI } from './overlays.js';

// Gold headline with glow. a: alpha, rise handled by caller via y.
export function heading(c, text, y, a = 1, size = 84, x = W / 2) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  c.font = `800 ${size}px "${F_COND}"`; c.letterSpacing = `${(size * 0.045).toFixed(1)}px`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = 'rgba(255,146,36,0.75)'; c.shadowBlur = size * 0.3;
  c.fillStyle = lin(c, 0, y - size * 0.45, 0, y + size * 0.45, [[0, '#ffe7a8'], [0.55, '#fcc04e'], [1, '#f09a20']]);
  c.fillText(text, x + size * 0.02, y);
  c.restore();
}

// Small tracked sub-heading in cream/white.
export function subheading(c, text, y, a = 1, size = 30, x = W / 2, color = '#fff4d6') {
  if (a <= 0) return;
  txt(c, text, x, y, { font: F_SEMI, weight: 600, size, track: size * 0.22, color, a });
}

// Rounded panel with gold border; draws content clipped inside. o: {x, y (centre), w, h, p (pop 0..1), label, sub, draw: (c) => {}, fill}
export function card(c, o) {
  const p = clamp(o.p ?? 1);
  if (p <= 0) return;
  const k = ease.back(p), a = Math.min(1, p * 2.2), { x, y, w, h } = o;
  c.save();
  c.translate(x, y); c.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k); c.translate(-x, -y);
  c.globalAlpha *= a;
  const box = rrect(x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.1);
  c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 30; c.shadowOffsetY = 12;
  c.fillStyle = o.fill ?? lin(c, 0, y - h / 2, 0, y + h / 2, [[0, '#1c2a5e'], [1, '#0d1638']]); c.fill(box); c.restore();
  if (o.draw) { c.save(); c.clip(box); o.draw(c); c.restore(); }
  c.strokeStyle = alpha(GOLD, 0.95); c.lineWidth = o.lw ?? 3.5; c.stroke(box);
  if (o.label) {
    const ly = y + h / 2 + 46;
    txt(c, o.label, x, ly, { font: F_COND, weight: 800, size: o.labelSize ?? 46, track: 4, color: o.labelColor ?? GOLD_HOT, glow: ['rgba(255,146,36,0.55)', 14] });
    if (o.sub) txt(c, o.sub, x, ly + 40, { font: F_SEMI, weight: 600, size: 22, track: 4, color: '#fff4d6' });
  }
  c.restore();
}

// Arrow drawn on from (x0, y0) to (x1, y1) as p goes 0..1.
export function arrow(c, x0, y0, x1, y1, p = 1, o = {}) {
  const k = ease.out3(clamp(p));
  if (k <= 0) return;
  const col = o.color ?? GOLD, w = o.w ?? 4, ex = lerp(x0, x1, k), ey = lerp(y0, y1, k), a = Math.atan2(y1 - y0, x1 - x0), hs = o.head ?? 16;
  c.save();
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w; c.lineCap = 'round';
  if (o.dash) c.setLineDash(o.dash);
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(ex - Math.cos(a) * hs * 0.6, ey - Math.sin(a) * hs * 0.6); c.stroke();
  c.setLineDash([]);
  c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - Math.cos(a - 0.45) * hs, ey - Math.sin(a - 0.45) * hs); c.lineTo(ex - Math.cos(a + 0.45) * hs, ey - Math.sin(a + 0.45) * hs); c.closePath(); c.fill();
  c.restore();
}

// Targeting ring that snaps onto a point (e.g. "easy to spot").
export function reticle(c, x, y, r, p = 1, t = 0, color = GOLD_HOT) {
  const k = clamp(p);
  if (k <= 0) return;
  const rr = r * (1.8 - 0.8 * ease.out3(k));
  c.save();
  c.globalAlpha *= Math.min(1, k * 2);
  c.strokeStyle = color; c.lineWidth = 3.5; c.lineCap = 'round';
  c.translate(x, y); c.rotate(t * 0.6);
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0, 0, rr, i * (TAU / 4) + 0.25, (i + 1) * (TAU / 4) - 0.25); c.stroke(); }
  for (let i = 0; i < 4; i++) { const a = i * (TAU / 4); c.beginPath(); c.moveTo(Math.cos(a) * rr * 1.1, Math.sin(a) * rr * 1.1); c.lineTo(Math.cos(a) * rr * 1.32, Math.sin(a) * rr * 1.32); c.stroke(); }
  c.restore();
}

// Horizontal bar with label and value text. o: {x, y, w, h, v (0..1), p, label, value, color}
export function bar(c, o) {
  const p = clamp(o.p ?? 1);
  if (p <= 0) return;
  const { x, y, w } = o, h = o.h ?? 30, v = clamp(o.v) * ease.out3(p);
  c.save();
  c.globalAlpha *= Math.min(1, p * 3);
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.fill(rrect(x, y, w, h, h / 2));
  if (v > 0.004) { c.fillStyle = o.color ?? lin(c, x, 0, x + w, 0, [[0, '#f2a52e'], [1, '#ffd98a']]); c.fill(rrect(x, y, Math.max(h, w * v), h, h / 2)); }
  if (o.label) txt(c, o.label, x, y - 20, { font: F_SEMI, weight: 700, size: 24, track: 3, color: CREAM, align: 'left' });
  if (o.value) txt(c, o.value, x + w, y - 20, { font: F_COND, weight: 800, size: 30, track: 2, color: GOLD_HOT, align: 'right' });
  c.restore();
}

// Circular portrait frame; content drawn clipped. o: {x, y, r, p, draw, ring}
export function medallion(c, o) {
  const p = clamp(o.p ?? 1);
  if (p <= 0) return;
  const k = ease.back(p), r = o.r * (0.6 + 0.4 * k);
  c.save();
  c.globalAlpha *= Math.min(1, p * 2.2);
  glow(c, o.x, o.y, r * 1.7, '#f2a52e', 0.25);
  c.beginPath(); c.arc(o.x, o.y, r, 0, TAU);
  c.fillStyle = o.fill ?? lin(c, 0, o.y - r, 0, o.y + r, [[0, '#2a3f86'], [1, '#101a44']]); c.fill();
  if (o.draw) { c.save(); c.beginPath(); c.arc(o.x, o.y, r, 0, TAU); c.clip(); o.draw(c); c.restore(); }
  c.strokeStyle = o.ring ?? GOLD; c.lineWidth = o.lw ?? 5; c.beginPath(); c.arc(o.x, o.y, r, 0, TAU); c.stroke();
  c.restore();
}

// Curved "sound" arcs radiating from a point (barking behind a door, a parrot calling).
export function soundArcs(c, x, y, t, o = {}) {
  const n = o.n ?? 3, dir = o.dir ?? 0, col = o.color ?? GOLD_HOT, size = o.size ?? 1, a = o.a ?? 1;
  c.save();
  c.strokeStyle = col; c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const ph = ((t * (o.speed ?? 1.6) + i / n) % 1), r = (18 + ph * 70) * size;
    c.globalAlpha = a * (1 - ph) * 0.9; c.lineWidth = 4 * size * (1 - ph * 0.5);
    c.beginPath(); c.arc(x, y, r, dir - 0.6, dir + 0.6); c.stroke();
  }
  c.restore();
}

export { PANEL };
