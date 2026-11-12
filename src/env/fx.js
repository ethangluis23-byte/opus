// Atmospheric effects: light shafts, dust motes, rain, fog, falling leaves, fireflies, distant birds.
// All take the 2D context first; draw them on a g.layer(...) or g.screen(...) as appropriate.
import { TAU, RNG, clamp, lerp, alpha, noise1 } from '../engine/util.js';
import { lin, rad, glow } from '../engine/draw.js';
import { W, H } from '../engine/stage.js';

// Fan of soft sun rays from (x, y). o: {ang (direction, radians; PI/2 = straight down), spread, len, n, color, a, t, seed}
export function godRays(c, x, y, o = {}) {
  const ang = o.ang ?? Math.PI * 0.62, spread = o.spread ?? 0.7, len = o.len ?? 1400, n = o.n ?? 9, a = o.a ?? 0.22, t = o.t ?? 0, r = RNG((o.seed ?? 1) * 31 + 8), col = o.color ?? '#fff3c4';
  c.save();
  c.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) {
    const u = (i + r.range(0.1, 0.9)) / n, d = ang + (u - 0.5) * spread, wd = r.range(0.018, 0.06), k = 0.6 + 0.4 * Math.sin(t * r.range(0.25, 0.6) + i * 2.1);
    const ex = x + Math.cos(d) * len, ey = y + Math.sin(d) * len;
    c.globalAlpha = a * k * r.range(0.5, 1);
    c.fillStyle = lin(c, x, y, ex, ey, [[0, alpha(col, 0.9)], [0.5, alpha(col, 0.42)], [1, alpha(col, 0)]]);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(d - wd) * len, y + Math.sin(d - wd) * len); c.lineTo(x + Math.cos(d + wd) * len, y + Math.sin(d + wd) * len); c.closePath(); c.fill();
  }
  c.restore();
}

// One volumetric shaft through an opening (window, hole in a roof). pts: quad [[x,y] x4] ordered source-left, source-right, far-right, far-left.
export function lightShaft(c, pts, o = {}) {
  const col = o.color ?? '#fff1c2', a = o.a ?? 0.3;
  const sx = (pts[0][0] + pts[1][0]) / 2, sy = (pts[0][1] + pts[1][1]) / 2, ex = (pts[2][0] + pts[3][0]) / 2, ey = (pts[2][1] + pts[3][1]) / 2;
  c.save();
  c.globalCompositeOperation = 'screen'; c.globalAlpha = a;
  c.fillStyle = lin(c, sx, sy, ex, ey, [[0, alpha(col, 1)], [0.6, alpha(col, 0.5)], [1, alpha(col, 0)]]);
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill();
  c.restore();
}

// Floating dust / pollen in a box. o: {n, t, seed, color, a, size, drift}
export function dust(c, x, y, w, h, o = {}) {
  const n = o.n ?? 60, t = o.t ?? 0, r = RNG((o.seed ?? 1) * 37 + 3), col = o.color ?? '#fff6d8', a = o.a ?? 0.7, size = o.size ?? 1, dr = o.drift ?? 1;
  c.save();
  c.globalCompositeOperation = 'screen'; c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const bx = r() * w, by = r() * h, sp = r.range(4, 14) * dr, ph = r.range(0, 100), s = r.range(1, 2.8) * size;
    const px = x + ((bx + t * sp + noise1(t * 0.2 + ph, i) * 40) % w + w) % w, py = y + ((by - t * sp * 0.35 + noise1(t * 0.17 + ph, i + 50) * 30) % h + h) % h;
    c.globalAlpha = a * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * r.range(0.6, 1.8) + ph)));
    c.beginPath(); c.arc(px, py, s, 0, TAU); c.fill();
  }
  c.restore();
}

// Rain streaks over the frame (draw in g.screen). o: {t, n, wind (slant px per px), len, a, color, seed, speed}
export function rain(c, o = {}) {
  const t = o.t ?? 0, n = o.n ?? 260, slant = o.wind ?? -0.18, len = o.len ?? 46, a = o.a ?? 0.35, sp = (o.speed ?? 1) * 1500, r = RNG((o.seed ?? 1) * 41 + 6);
  c.save();
  c.strokeStyle = o.color ?? '#dbe9ff'; c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const z = r.range(0.45, 1), x0 = r() * (W + 400) - 200, y0 = r() * (H + len * 2), v = sp * z;
    const y = ((y0 + t * v) % (H + len * 2)) - len, x = x0 + slant * y;
    c.globalAlpha = a * z; c.lineWidth = 1.1 + z * 1.1;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + slant * len * z, y + len * z); c.stroke();
  }
  c.restore();
}

// Little splash rings where rain meets a ground line (world coords). o: {t, n, seed, color, a}
export function splashes(c, x0, x1, y, o = {}) {
  const t = o.t ?? 0, n = o.n ?? 40, r = RNG((o.seed ?? 1) * 43 + 2);
  c.save();
  c.strokeStyle = o.color ?? '#dbe9ff'; c.lineWidth = 1.4;
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), ph = (t * r.range(1.4, 2.4) + r()) % 1, yy = y + r.range(-10, 14);
    c.globalAlpha = (o.a ?? 0.5) * (1 - ph);
    c.beginPath(); c.ellipse(x, yy, 3 + ph * 11, 1 + ph * 3.2, 0, 0, TAU); c.stroke();
  }
  c.restore();
}

// Drifting mist band centred on y. o: {h, color, a, t, seed, n, speed}
export function fog(c, x0, x1, y, o = {}) {
  const h = o.h ?? 160, col = o.color ?? '#ffffff', a = o.a ?? 0.35, t = o.t ?? 0, n = o.n ?? 9, r = RNG((o.seed ?? 1) * 47 + 5), span = x1 - x0 + 800;
  c.save();
  for (let i = 0; i < n; i++) {
    const rx = r.range(280, 620), bx = r() * span, sp = r.range(6, 18) * (o.speed ?? 1) * (i % 2 ? 1 : -0.6), yy = y + r.range(-h * 0.3, h * 0.3);
    const x = x0 - 400 + (((bx + t * sp) % span) + span) % span, ry = h * r.range(0.35, 0.6);
    c.save();
    c.translate(x, yy); c.scale(1, ry / rx);
    c.fillStyle = rad(c, 0, 0, rx, [[0, alpha(col, a)], [0.5, alpha(col, a * 0.5)], [1, alpha(col, 0)]]);
    c.fillRect(-rx, -rx, rx * 2, rx * 2);
    c.restore();
  }
  c.restore();
}

// Leaves tumbling through a box. o: {t, n, seed, colors, wind, size}
export function fallingLeaves(c, x, y, w, h, o = {}) {
  const t = o.t ?? 0, n = o.n ?? 14, r = RNG((o.seed ?? 1) * 53 + 7), cols = o.colors ?? ['#c9a14a', '#b9853a', '#8fae4a', '#d9b25a'], wd = o.wind ?? 60, size = o.size ?? 1;
  c.save();
  for (let i = 0; i < n; i++) {
    const fall = r.range(34, 70), ph = r.range(0, 100), bx = r() * w, by = r() * h, s = r.range(5, 9) * size;
    const py = y + ((by + t * fall) % h + h) % h, px = x + ((bx + t * wd + Math.sin(t * 1.3 + ph) * 40) % w + w) % w, a = t * r.range(1, 3) + ph;
    c.fillStyle = r.pick(cols);
    c.beginPath(); c.ellipse(px, py, s, s * (0.3 + 0.35 * Math.abs(Math.sin(a * 1.7))), a, 0, TAU); c.fill();
  }
  c.restore();
}

// Fireflies wandering in a box (dusk / night). o: {t, n, seed, color}
export function fireflies(c, x, y, w, h, o = {}) {
  const t = o.t ?? 0, n = o.n ?? 18, r = RNG((o.seed ?? 1) * 59 + 1), col = o.color ?? '#e9ff8a';
  for (let i = 0; i < n; i++) {
    const bx = r() * w, by = r() * h, ph = r.range(0, 100);
    const px = x + bx + noise1(t * 0.25 + ph, i) * 90, py = y + by + noise1(t * 0.22 + ph, i + 40) * 60;
    const k = clamp(Math.sin(t * r.range(0.8, 1.7) + ph) * 1.4);
    if (k <= 0.02) continue;
    glow(c, px, py, 16, col, 0.85 * k);
    c.save(); c.globalAlpha = k; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(px, py, 1.7, 0, TAU); c.fill(); c.restore();
  }
}

// Tiny distant birds crossing the sky. o: {t, n, seed, y0, y1, dir, color, speed, size}
export function farBirds(c, o = {}) {
  const t = o.t ?? 0, n = o.n ?? 7, r = RNG((o.seed ?? 1) * 61 + 4), dir = o.dir ?? 1, col = o.color ?? '#2a3348', span = W + 600;
  c.save();
  c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const sp = r.range(55, 95) * (o.speed ?? 1), y = lerp(o.y0 ?? 120, o.y1 ?? 360, r()), bx = r() * span, s = r.range(7, 13) * (o.size ?? 1), ph = r.range(0, TAU);
    const x = dir > 0 ? ((bx + t * sp) % span) - 300 : W + 300 - ((bx + t * sp) % span), f = Math.sin(t * 9 + ph), yy = y + Math.sin(t * 0.7 + ph) * 12;
    c.lineWidth = s * 0.22;
    c.beginPath(); c.moveTo(x - s, yy - f * s * 0.55); c.quadraticCurveTo(x - s * 0.4, yy - s * 0.2, x, yy); c.quadraticCurveTo(x + s * 0.4, yy - s * 0.2, x + s, yy - f * s * 0.55); c.stroke();
  }
  c.restore();
}
