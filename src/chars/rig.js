// Shared character-rig helpers: eyes, blinking, gait cycles.
import { TAU, clamp, lerp, hash, ease, tone } from '../engine/util.js';
import { circle, clipped, rad } from '../engine/draw.js';

// Leg phase offsets: nh/nf = near hind/front, fh/ff = far hind/front. stride/lift/bob in character units.
export const GAITS = {
  walk: { duty: 0.64, off: { nh: 0, nf: 0.26, fh: 0.5, ff: 0.76 }, stride: 46, lift: 9, bob: 1.6, pitch: 0.012, bobs: 2 },
  stalk: { duty: 0.74, off: { nh: 0, nf: 0.26, fh: 0.5, ff: 0.76 }, stride: 32, lift: 6, bob: 0.6, pitch: 0.006, bobs: 2 },
  trot: { duty: 0.5, off: { nh: 0, nf: 0.5, fh: 0.5, ff: 0 }, stride: 64, lift: 14, bob: 3.6, pitch: 0.016, bobs: 2 },
  run: { duty: 0.34, off: { nh: 0, fh: 0.1, nf: 0.48, ff: 0.6 }, stride: 118, lift: 24, bob: 9, pitch: 0.1, bobs: 1 },
};

// Foot offset [dx, dy] for a gait at a cycle phase: stance slides back at body speed, swing arcs forward.
export function gaitFoot(phase, g) {
  const ph = ((phase % 1) + 1) % 1;
  if (ph < g.duty) return [lerp(g.stride / 2, -g.stride / 2, ph / g.duty), 0];
  const u = (ph - g.duty) / (1 - g.duty);
  return [lerp(-g.stride / 2, g.stride / 2, ease.io(u)), -g.lift * Math.sin(u * Math.PI)];
}

// Natural blink: returns lid closure 0..1 at time t (pseudo-random interval per seed).
export function blink(t, seed = 0, period = 3.4) {
  const k = t / period + hash(seed, 3);
  const i = Math.floor(k), ph = (k - i) * period, at = hash(i, seed + 5) * (period - 0.5);
  const d = ph - at;
  if (d > 0 && d < 0.17) return Math.sin((d / 0.17) * Math.PI);
  if (hash(i, seed + 9) < 0.25 && d > 0.3 && d < 0.47) return Math.sin(((d - 0.3) / 0.17) * Math.PI);
  return 0;
}

// Big expressive cartoon eye.
// o: {x, y, r, look: [dx, dy] in -1..1, iris, pupil, slit, dilate, lid (0 open .. 1 closed), lidAng, lidColor, low (lower-lid squint 0..1),
//     line, lw, happy (closed eye curves up), white}
export function eye(c, o) {
  const { x, y, r } = o, lw = o.lw ?? 2, lid = clamp(o.lid ?? 0);
  const lx = clamp(o.look?.[0] ?? 0, -1, 1), ly = clamp(o.look?.[1] ?? 0, -1, 1);
  if (lid >= 0.9) {
    const k = o.happy ? -1 : 1;
    c.save();
    c.strokeStyle = o.line; c.lineWidth = lw * 1.15; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - r * 0.9, y + r * 0.05 * k); c.quadraticCurveTo(x, y + r * 0.8 * k, x + r * 0.9, y + r * 0.05 * k); c.stroke();
    c.restore();
    return;
  }
  const ball = circle(x, y, r);
  c.fillStyle = o.white ?? '#ffffff'; c.fill(ball);
  clipped(c, ball, () => {
    const ir = r * (o.irisR ?? 0.68), ix = x + lx * (r - ir) * 0.95, iy = y + ly * (r - ir) * 0.95;
    if (o.iris) {
      c.fillStyle = rad(c, ix, iy, ir, [[0, tone(o.iris, 0.3)], [0.72, o.iris], [1, tone(o.iris, -0.5)]]);
      c.beginPath(); c.arc(ix, iy, ir, 0, TAU); c.fill();
    }
    c.fillStyle = o.pupil ?? '#17110d';
    c.beginPath();
    if (o.slit) c.ellipse(ix, iy, ir * lerp(0.22, 0.8, clamp(o.dilate ?? 0.3)), ir * 0.92, 0, 0, TAU);
    else c.arc(ix, iy, ir * (o.iris ? 0.64 : 1) * (o.dilate ?? 1), 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(ix - ir * 0.32, iy - ir * 0.36, ir * 0.27, 0, TAU); c.fill();
    c.beginPath(); c.arc(ix + ir * 0.34, iy + ir * 0.32, ir * 0.12, 0, TAU); c.fill();
    c.fillStyle = 'rgba(40,20,10,0.15)';
    c.beginPath(); c.ellipse(x, y - r * 0.98, r * 1.25, r * 0.6, 0, 0, TAU); c.fill();
    if (lid > 0.02 || o.lidAng) {
      c.save();
      c.translate(x, y - r + lid * 2 * r); c.rotate(o.lidAng ?? 0);
      c.fillStyle = o.lidColor ?? '#caa';
      c.fillRect(-r * 3, -r * 4, r * 6, r * 4);
      c.strokeStyle = o.line; c.lineWidth = lw; c.beginPath(); c.moveTo(-r * 3, 0); c.lineTo(r * 3, 0); c.stroke();
      c.restore();
    }
    if (o.low > 0.02) {
      c.save();
      c.translate(x, y + r - o.low * r * 0.9);
      c.fillStyle = o.lidColor ?? '#caa';
      c.beginPath(); c.ellipse(0, r * 1.5, r * 1.7, r * 1.5, 0, 0, TAU); c.fill();
      c.strokeStyle = o.line; c.lineWidth = lw * 0.9; c.beginPath(); c.ellipse(0, r * 1.5, r * 1.7, r * 1.5, 0, 0, TAU); c.stroke();
      c.restore();
    }
  });
  c.strokeStyle = o.line; c.lineWidth = lw; c.stroke(ball);
}

// Outline width in character units for a given on-screen scale: grows sub-linearly so close-ups do not get heavy lines.
export const inkW = (s, base = 2.1) => base * Math.pow(Math.max(s, 0.2), -0.38);
