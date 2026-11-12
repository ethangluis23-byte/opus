// Vector drawing primitives shared by every illustration in the film.
import { Path2D, createCanvas } from '@napi-rs/canvas';
import { TAU, clamp, alpha } from './util.js';

const UNION = 2; // PathOp.Union (const enum in the typings, so not available at runtime)

export const P = () => new Path2D();

export function poly(pts, closed = true) {
  const p = new Path2D();
  pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  if (closed) p.closePath();
  return p;
}

// Smooth curve through points (Catmull-Rom -> cubic Bezier). A point [x, y, 1] is a sharp corner.
export function blob(pts, closed = true, k = 1) {
  const p = new Path2D(), n = pts.length;
  if (n < 2) return p;
  const at = (i) => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]);
  p.moveTo(pts[0][0], pts[0][1]);
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const s1 = p1[2] ? 0 : k / 6, s2 = p2[2] ? 0 : k / 6;
    p.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * s1, p1[1] + (p2[1] - p0[1]) * s1,
      p2[0] - (p3[0] - p1[0]) * s2, p2[1] - (p3[1] - p1[1]) * s2,
      p2[0], p2[1],
    );
  }
  if (closed) p.closePath();
  return p;
}

// Tapered capsule: circle radius ra at A joined to circle radius rb at B by their outer tangents.
export function capsule(ax, ay, ra, bx, by, rb) {
  const p = new Path2D();
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d <= Math.abs(ra - rb) + 1e-6) {
    if (ra >= rb) p.arc(ax, ay, ra, 0, TAU); else p.arc(bx, by, rb, 0, TAU);
    return p;
  }
  const ang = Math.atan2(dy, dx), phi = Math.acos(clamp((ra - rb) / d, -1, 1));
  p.arc(ax, ay, ra, ang + phi, ang - phi + TAU);
  p.arc(bx, by, rb, ang - phi, ang + phi);
  p.closePath();
  return p;
}

export function circle(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; }
export function oval(x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, TAU); return p; }
export function rrect(x, y, w, h, r = 0) {
  const p = new Path2D(), q = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  p.moveTo(x + q, y); p.lineTo(x + w - q, y); p.arcTo(x + w, y, x + w, y + q, q);
  p.lineTo(x + w, y + h - q); p.arcTo(x + w, y + h, x + w - q, y + h, q);
  p.lineTo(x + q, y + h); p.arcTo(x, y + h, x, y + h - q, q);
  p.lineTo(x, y + q); p.arcTo(x, y, x + q, y, q); p.closePath();
  return p;
}
export function rect(x, y, w, h) { const p = new Path2D(); p.rect(x, y, w, h); return p; }

// Boolean union of paths (use for merged silhouettes and clip shapes). Skia's op() can silently drop an operand when
// curves are near-tangent (a limb vanishing for single frames = flicker), so every step is verified with a
// point-in-path probe at the operand's bounds centre (when that point lies inside the operand) and retried with a
// sub-pixel nudge; as a last resort the operand is appended un-merged (nonzero fill stays correct).
const PROBE = createCanvas(1, 1).getContext('2d');
const centre = (q) => { const b = q.getBounds(); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
export const unionStats = { ops: 0, retries: 0, fallbacks: 0 };
export function union(...ps) {
  const u = new Path2D(ps[0]);
  const c0 = centre(ps[0]), probe0 = PROBE.isPointInPath(ps[0], c0[0], c0[1]);
  for (let i = 1; i < ps.length; i++) {
    const ci = centre(ps[i]), probe = PROBE.isPointInPath(ps[i], ci[0], ci[1]);
    let ok = false;
    for (let k = 0; k < 3 && !ok; k++) {
      let q = ps[i];
      if (k) { q = new Path2D(); q.addPath(ps[i], { a: 1, b: 0, c: 0, d: 1, e: 0.037 * k, f: -0.029 * k }); unionStats.retries++; }
      u.op(q, UNION); unionStats.ops++;
      if (probe0 && !PROBE.isPointInPath(u, c0[0], c0[1])) { unionStats.fallbacks++; return join(...ps); }
      ok = !probe || PROBE.isPointInPath(u, ci[0], ci[1]);
    }
    if (!ok) { u.addPath(ps[i]); unionStats.fallbacks++; }
  }
  return u;
}
// Concatenate paths without boolean ops (fine for fills when paths share winding).
export function join(...ps) { const u = new Path2D(); for (const p of ps) u.addPath(p); return u; }

export function fill(c, path, style) { c.fillStyle = style; c.fill(path); }
export function line(c, path, style, w = 2, cap = 'round') {
  c.strokeStyle = style; c.lineWidth = w; c.lineCap = cap; c.lineJoin = 'round'; c.stroke(path);
}
// Fill + outline in one call.
export function ink(c, path, fillStyle, lineStyle, w = 3) {
  if (fillStyle) fill(c, path, fillStyle);
  if (lineStyle && w > 0) line(c, path, lineStyle, w);
}
// Run fn with drawing clipped to path.
export function clipped(c, path, fn) { c.save(); c.clip(path); fn(c); c.restore(); }

export function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(clamp(o), col);
  return g;
}
export function rad(c, x, y, r, stops, r0 = 0) {
  const g = c.createRadialGradient(x, y, r0, x, y, Math.max(r, r0 + 0.01));
  for (const [o, col] of stops) g.addColorStop(clamp(o), col);
  return g;
}

// Additive soft light blob (sun halos, lamps, eye shine, window glow).
export function glow(c, x, y, r, color, a = 1, mode = 'screen') {
  if (a <= 0 || r <= 0) return;
  c.save();
  c.globalCompositeOperation = mode; c.globalAlpha *= a;
  c.fillStyle = rad(c, x, y, r, [[0, alpha(color, 1)], [0.3, alpha(color, 0.5)], [0.65, alpha(color, 0.14)], [1, alpha(color, 0)]]);
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}

// Soft elliptical contact shadow on the ground.
export function shadow(c, x, y, rx, ry, a = 0.3, color = '#000000') {
  if (a <= 0) return;
  c.save();
  c.translate(x, y); c.scale(1, ry / rx);
  c.fillStyle = rad(c, 0, 0, rx, [[0, alpha(color, a)], [0.55, alpha(color, a * 0.62)], [1, alpha(color, 0)]]);
  c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill();
  c.restore();
}

// Two-bone IK. Returns the joint and the (reach-clamped) end point. bend = +1 / -1 picks the side the joint folds to.
export function ik2(ax, ay, tx, ty, l1, l2, bend = 1) {
  let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy) || 1e-6;
  const dmax = (l1 + l2) * 0.999, dmin = Math.abs(l1 - l2) + 1e-3;
  const dc = clamp(d, dmin, dmax);
  if (dc !== d) { dx *= dc / d; dy *= dc / d; d = dc; }
  const base = Math.atan2(dy, dx);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  return { jx: ax + Math.cos(base + bend * a) * l1, jy: ay + Math.sin(base + bend * a) * l1, ex: ax + dx, ey: ay + dy };
}

// Text. o: {size, font, weight, color, align, base, track, a, glow:[color, blur], outline:[color, width], shadow:[color, blur, dy]}
export function txt(c, s, x, y, o = {}) {
  c.save();
  c.font = `${o.weight ?? 700} ${o.size ?? 40}px "${o.font ?? 'Barlow Condensed'}"`;
  c.textAlign = o.align ?? 'center'; c.textBaseline = o.base ?? 'middle';
  c.letterSpacing = `${o.track ?? 0}px`;
  if (o.a != null) c.globalAlpha *= o.a;
  if (o.outline) { c.lineJoin = 'round'; c.strokeStyle = o.outline[0]; c.lineWidth = o.outline[1]; c.strokeText(s, x, y); }
  if (o.glow) { c.shadowColor = o.glow[0]; c.shadowBlur = o.glow[1]; }
  if (o.shadow) { c.shadowColor = o.shadow[0]; c.shadowBlur = o.shadow[1]; c.shadowOffsetY = o.shadow[2] ?? 0; }
  c.fillStyle = o.color ?? '#ffffff';
  c.fillText(s, x, y);
  c.restore();
}
export function txtWidth(c, s, o = {}) {
  c.save();
  c.font = `${o.weight ?? 700} ${o.size ?? 40}px "${o.font ?? 'Barlow Condensed'}"`;
  c.letterSpacing = `${o.track ?? 0}px`;
  const w = c.measureText(s).width;
  c.restore();
  return w;
}
