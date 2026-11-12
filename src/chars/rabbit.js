// Rabbit rig: side-view body with a three-quarter head, same conventions as drawDog. An adult is about 62 units long
// and 46 tall at the head (ears up to ~75) at s = 1, i.e. correctly sized next to the dog at the same s.
//
// drawRabbit(c, {
//   x, y, s, flip,     ground point under the body, scale, facing (1 = right, -1 = left)
//   t, seed,           seconds / individual offset: breathing, blinking, nose twitch, ear flicks, munching, digging
//   v,                 key of RABBITS or a variant object (default 'sandy')
//   kit,               0..1 baby proportions (small, big head, short ears)
//   pose,              'sit' (default, compact loaf) | 'stand' | 'graze' (head down, jaw moving) | 'alert' (upright on
//                      the haunches, ears straight up) | 'freeze' (flattened, ears back, wide eyes) | 'dig' (front paws
//                      scrabbling, animated from t; throws dirt unless dirt: false), or [from, to, k] to blend
//   gait, phase,       'hop' | 'run' and the cycle phase (cycles): hind push 0..0.3, airborne, front paws land ~0.55,
//                      hind feet swing through and land at 1. Advance phase by distance / rabbitStride() while moving x
//                      linearly: planted feet stay put. gaitK 0..1 blends pose -> gait (default 1 when gait is set).
//   mood,              'neutral' | 'happy' | 'alert' | 'scared' | 'asleep'
//   ear,               0 (straight up) .. 1 (flat on the back): overrides mood / pose
//   earTurn,           -1..1 ear swivel (1 = openings turned forward / to camera, -1 = turned away)
//   munch,             0..1 chewing strength (default 1 in 'graze')
//   look,              [dx, dy] pupil direction -1..1 (dx > 0 = forward)
//   lid, tilt, blink,  eyelid closure 0..1, extra head rotation (radians), explicit blink 0..1
//   dirt,              colour of the dirt thrown while digging (default '#8a6a48', false = none)
//   shadow,            ground shadow strength (default 0.3, 0 = none)
// }) -> anchors in canvas coordinates: { head, nose, mouth, eye, earTip, tail, feet: { nh, nf }, top }
//
// RABBITS: sandy (hero: sandy-brown, white blaze, white tail and belly), sandy20 / sandy50 / sandy200 (wild
//   descendants: leaner, earthier agouti, longer legs, less white), white, patched (black-and-white Dutch), grey, brown.
// rabbitStride(gait, v, s, kit) -> canvas distance covered per gait cycle.
// rabbitIcon(c, x, y, s, color) -> flat one-colour sitting-rabbit pictogram; (x, y) = bottom centre, about 40 wide and
//   46 tall at s = 1.
import { blob, capsule, circle, oval, union, join, fill, line, clipped, lin, rad, shadow, ik2 } from '../engine/draw.js';
import { TAU, clamp, lerp, mix, alpha, hash, noise1 } from '../engine/util.js';
import { eye, blink, inkW } from './rig.js';

const SANDY = { coat: '#d9a25c', dark: '#ae773a', light: '#f0c88e', belly: '#fcf4e3', line: '#5a3716', earIn: '#f2b3a4', iris: '#5b3413', nose: '#e8929a',
  blaze: 1, chest: 1, tail: '#fdf8ee', lean: 0, legK: 1, earK: 1, tick: 0 };
export const RABBITS = {
  sandy: SANDY,
  sandy20: { ...SANDY, coat: '#c99a5c', dark: '#a0733c', light: '#e2bd88', belly: '#f6ecd8', blaze: 0.7, chest: 0.6, lean: 0.35, legK: 1.06, earK: 1.03, tick: 0.3 },
  sandy50: { ...SANDY, coat: '#b58a58', dark: '#8b653a', light: '#d2b084', belly: '#eee2cb', line: '#4d3117', blaze: 0.42, chest: 0.3, tail: '#f6eedc', lean: 0.7, legK: 1.12, earK: 1.06, tick: 0.65 },
  sandy200: { ...SANDY, coat: '#a07d54', dark: '#775a38', light: '#c3a57c', belly: '#e6d8bf', line: '#452c16', blaze: 0.2, chest: 0.1, tail: '#f1e8d6', lean: 1, legK: 1.18, earK: 1.1, tick: 1 },
  white: { ...SANDY, coat: '#f1ede6', dark: '#c9c1b6', light: '#ffffff', belly: '#ffffff', line: '#6a5b52', iris: '#7a3044', blaze: 0, chest: 0, tail: '#ffffff' },
  patched: { ...SANDY, coat: '#37323a', dark: '#1e1b22', light: '#5b5560', belly: '#f7f3ec', line: '#17141a', earIn: '#b98a8a', iris: '#4a2c16', blaze: 1.25, chest: 0, band: '#f7f3ec', tail: '#37323a' },
  grey: { ...SANDY, coat: '#9a9ea8', dark: '#6c7079', light: '#c0c4cc', belly: '#eceef0', line: '#33363d', iris: '#4a3524', blaze: 0, chest: 0.4, tail: '#f2f3f5', tick: 0.3 },
  brown: { ...SANDY, coat: '#8f5f38', dark: '#683f20', light: '#b5855a', belly: '#e9d6ba', line: '#3a2210', iris: '#3f2410', blaze: 0, chest: 0.25, tail: '#f3e7d2', tick: 0.2 },
};

// ear: 0 up .. 1 flat back; wide: eye-white showing; twitch: nose speed
const MOODS = {
  neutral: { ear: 0.3, lid: 0, wide: 0, brow: 0, twitch: 1, tailUp: 0.2, smile: 0.2 },
  happy: { ear: 0.2, lid: 0, wide: 0, brow: 0, twitch: 0.8, tailUp: 0.6, smile: 1 },
  alert: { ear: 0, lid: 0, wide: 0.5, brow: 0.15, twitch: 1.7, tailUp: 0.7, smile: 0 },
  scared: { ear: 0.95, lid: 0, wide: 1, brow: -0.8, twitch: 2.4, tailUp: -0.2, smile: -0.5, shiver: 1 },
  asleep: { ear: 0.82, lid: 1, wide: 0, brow: 0, twitch: 0.12, tailUp: 0, smile: 0.3 },
};
MOODS.sad = { ...MOODS.neutral, ear: 0.7, lid: 0.25, brow: -0.7, smile: -0.5 };
MOODS.sleepy = { ...MOODS.asleep, lid: 0.6 };

const PD = { hip: [-13, -18], rH: 16, sh: [11, -17], rS: 13, hd: [10, -11], hRot: 0, fp: [16, 0], fpa: 0, hf: 3, earA: 0, earW: 0, flat: 0, dig: 0, munch: 0, wide: 0, lift: 1 };
const POSES = {
  stand: PD,
  sit: { ...PD, hip: [-10, -17], rH: 17, sh: [9, -19], rS: 13.5, hd: [9, -13], fp: [15, 0], hf: 6, lift: 0 },
  graze: { ...PD, hip: [-11, -17], rH: 17, sh: [10, -15], rS: 13, hd: [12, 2.5], hRot: 0.55, fp: [12, 0], hf: 5, earA: 0.42, earW: 0.6, munch: 1, lift: 0 },
  alert: { ...PD, hip: [-6, -17], rH: 17, sh: [0, -37], rS: 12.5, hd: [5, -18], hRot: -0.06, fp: [10, -27], fpa: 1.2, hf: 12, earA: 0, earW: 1, wide: 0.4, lift: 0 },
  freeze: { ...PD, hip: [-12, -12.5], rH: 13, sh: [10, -11.5], rS: 11, hd: [12, -2.5], hRot: 0.1, fp: [20, 0], hf: 4, earA: 0.97, earW: 1, flat: 1, wide: 1, lift: 0 },
  dig: { ...PD, hip: [-12, -22.5], rH: 16.5, sh: [10, -12.5], rS: 12.5, hd: [12, 0], hRot: 0.5, fp: [20, 0], hf: -1, earA: 0.4, earW: 0.5, dig: 1, lift: 0 },
};
POSES.loaf = POSES.sit; POSES.lie = POSES.freeze;
const mixv = (a, b, k) => (Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], k)) : lerp(a, b, k));
function mixPose(a, b, k) { const o = {}; for (const key in PD) o[key] = mixv(a[key], b[key], k); return o; }
function poseMix(pose) {
  if (Array.isArray(pose)) return mixPose(POSES[pose[0]] || POSES.sit, POSES[pose[1]] || POSES.sit, clamp(+pose[2] || 0));
  return POSES[pose] || POSES.sit;
}

// Bound cycle. dH: hind stance length, fS/dF: front stance start/length, hL/fL: where the feet land (body x).
const GA = {
  hop: { stride: 54, lift: 15, dH: 0.3, fS: 0.56, dF: 0.2, ext: 0.75, pitch: 1, hL: 4, fL: 18, ear: 0.25, reach: 1 },
  run: { stride: 104, lift: 11, dH: 0.24, fS: 0.54, dF: 0.17, ext: 1.25, pitch: 0.8, hL: 9, fL: 25, ear: 0.72, reach: 1.3 },
};
const HEIGHT = [[0, 0.04], [0.14, -0.06], [0.3, 0.5], [0.43, 1], [0.56, 0.58], [0.75, 0.3], [0.9, 0.18]];
const PITCH = [[0, 0.02], [0.14, -0.14], [0.3, -0.3], [0.43, -0.06], [0.56, 0.2], [0.72, 0.33], [0.9, 0.15]];
const STRETCH = [[0, 0.86], [0.15, 0.96], [0.3, 1.14], [0.43, 1.2], [0.56, 1.1], [0.75, 0.92], [0.9, 0.85]];
// hind hock offset from the hip joint [x, y] and foot angle while off the ground; front paw offset from the shoulder joint
const HIND_X = [[0.15, -8], [0.36, -13], [0.46, -21], [0.58, -21], [0.72, -9], [0.86, 4], [0.95, 5]];
const HIND_Y = [[0.15, 6], [0.36, 3], [0.46, 5], [0.58, 4], [0.72, 9], [0.86, 10], [0.95, 9]];
const HIND_A = [[0.15, 0.6], [0.36, 1.7], [0.46, 2.4], [0.58, 2.3], [0.72, 1.4], [0.86, 0.6], [0.95, 0.25]];
const FRONT_X = [[0, 1], [0.2, 4], [0.38, 11], [0.5, 10], [0.7, 0], [0.85, -3], [0.93, -1]];
const FRONT_Y = [[0, 11], [0.2, 11], [0.38, 13], [0.5, 16], [0.7, 14], [0.85, 11], [0.93, 10]];
const wrap1 = (x) => ((x % 1) + 1) % 1;
// periodic Catmull-Rom through [phase, value] keys
function cyc(ph, keys) {
  const n = keys.length, x0 = wrap1(ph);
  let i = n - 1;
  for (let j = 0; j < n; j++) if (keys[j][0] <= x0) i = j;
  const k = (j) => keys[((j % n) + n) % n], a = k(i), b = k(i + 1);
  let pb = b[0], x = x0; if (pb <= a[0]) pb += 1; if (x < a[0]) x += 1;
  const u = (x - a[0]) / (pb - a[0]), v0 = k(i - 1)[1], v1 = a[1], v2 = b[1], v3 = k(i + 2)[1];
  return 0.5 * (2 * v1 + (v2 - v0) * u + (2 * v0 - 5 * v1 + 4 * v2 - v3) * u * u + (3 * v1 - v0 - 3 * v2 + v3) * u * u * u);
}
const ramp = (x, a, b) => clamp((x - a) / (b - a));
const variant = (v) => (typeof v === 'string' ? RABBITS[v] || SANDY : v ? { ...SANDY, ...v } : SANDY);
const strideK = (V, kit) => lerp(V.legK ?? 1, 1, 0.4) * lerp(1, 0.9, kit);

export function rabbitStride(gait = 'hop', v = 'sandy', s = 1, kit = 0) {
  const V = variant(v), k = clamp(kit || 0);
  return (GA[gait] || GA.hop).stride * strideK(V, k) * (V.size ?? 1) * lerp(1, 0.45, k) * s;
}

const TICKS = Array.from({ length: 16 }, (_, i) => [hash(i, 71) * 1.15 - 0.15, 3 + hash(i, 72) * 9, hash(i, 73)]);

export function drawRabbit(c, p = {}) {
  const V = variant(p.v), m = MOODS[p.mood] || MOODS.neutral;
  const t = p.t ?? 0, seed = p.seed ?? 0, kit = clamp(p.kit ?? 0);
  const size = (V.size ?? 1) * lerp(1, 0.45, kit), s = Math.max((p.s ?? 1) * size, 1e-3), flip = p.flip === -1 ? -1 : 1;
  const lean = clamp(V.lean ?? 0), legK = (V.legK ?? 1) * lerp(1, 0.86, kit), hk = lerp(1, 1.36, kit) * (1 - 0.05 * lean);
  const L = V.line, lw = inkW(s, 1.6);
  const G = GA[p.gait] || null, gw = G ? clamp(p.gaitK ?? 1) : 0, ph = p.phase ?? 0;
  let P = poseMix(p.pose);
  if (gw > 0) P = mixPose(P, POSES.stand, gw);
  const breath = Math.sin(t * (m === MOODS.asleep ? 1.6 : m.shiver ? 7 : 3.6) + seed) * 0.5 + 0.5;
  const shiver = (m.shiver ?? 0) * Math.sin(t * 41 + seed) * 0.28;
  const digW = P.dig, digA = t * 24 + seed;

  // ---- skeleton ----
  const bl = lerp(1, 0.84, kit) * (1 + 0.07 * lean), up = (legK - 1) * 14 * P.lift;
  let hip = [P.hip[0] * bl + shiver, P.hip[1] - up - digW * Math.sin(digA * 0.5) * 0.8], sh = [P.sh[0] * bl + shiver, P.sh[1] - up + digW * Math.sin(digA) * 0.7];
  const rH = P.rH * (1 - 0.13 * lean), rS = P.rS * (1 - 0.1 * lean) + breath * 0.45;
  let pit = 0, air = 0;
  if (gw > 0) {
    air = cyc(ph, HEIGHT) * gw;
    pit = cyc(ph, PITCH) * G.pitch * gw;
    const st = 1 + (cyc(ph, STRETCH) - 1) * G.ext * gw;
    const cx = (hip[0] + sh[0]) / 2, cy = (hip[1] + sh[1]) / 2 - air * G.lift * legK, hx = ((sh[0] - hip[0]) / 2) * st, hy = ((sh[1] - hip[1]) / 2) * st, cs = Math.cos(pit), sn = Math.sin(pit);
    hip = [cx - (hx * cs - hy * sn), cy - (hx * sn + hy * cs)]; sh = [cx + hx * cs - hy * sn, cy + hx * sn + hy * cs];
  }
  const sd = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]) || 1, ux = (sh[0] - hip[0]) / sd, uy = (sh[1] - hip[1]) / sd, nx = uy, ny = -ux;
  const sp = (a, b) => [hip[0] + ux * a * sd + nx * b, hip[1] + uy * a * sd + ny * b];
  const ang = Math.atan2(uy, ux), ST = G ? G.stride * strideK(V, kit) : 0;

  // legs
  const TH = 13 * legK, SK = 14 * legK, FT = 19 * Math.sqrt(legK), FU = 9.5 * legK, FLo = 10 * legK;
  const hindLeg = (far) => {
    const off = far ? 3 : 0, J = [hip[0] + 2.5 + off, hip[1] + 4.5 - (far ? 1 : 0)];
    let toe = [P.hf + off, 0], th = 0.08;
    if (gw > 0) {
      const q = wrap1(ph - (far ? 0.03 : 0)), d = q > 0.5 ? q - 1 : q;
      const fa = cyc(q, HIND_A), hk0 = [J[0] + cyc(q, HIND_X) * G.reach, J[1] + cyc(q, HIND_Y)];
      const w = ramp(d, -0.08, 0) * (1 - ramp(d, G.dH, G.dH + 0.07));
      const sa = lerp(0.1, 0.78, clamp(d / G.dH));
      const gt = [lerp(hk0[0] + FT * Math.cos(fa), G.hL + off - ST * d, w), lerp(hk0[1] + FT * Math.sin(fa), 0, w)], ga = lerp(fa, sa, w);
      toe = [lerp(toe[0], gt[0], gw), lerp(toe[1], gt[1], gw)]; th = lerp(th, ga, gw);
    }
    toe[1] = Math.min(toe[1], 0);
    const k = ik2(J[0], J[1], toe[0] - FT * Math.cos(th), Math.min(toe[1] - FT * Math.sin(th), 0), TH, SK, -1);
    const hock = [k.ex, k.ey];
    toe = [hock[0] + FT * Math.cos(th), Math.min(hock[1] + FT * Math.sin(th), 0)];
    const haunch = oval(hip[0] + 1.5 + off, hip[1] + 1.5 - (far ? 1 : 0), rH * 0.86 * (1 + 0.18 * P.flat), rH * 0.86, 0);
    const parts = [haunch, capsule(J[0], J[1], 7.2, k.jx, k.jy, 5.4), capsule(k.jx, k.jy, 5.2, hock[0], hock[1] - 3.4, 3.6), capsule(hock[0], hock[1] - 3.4, 3.5, toe[0] - 2, toe[1] - 3.1, 3.1), oval(toe[0] - 0.5, toe[1] - 3.1, 4.6, 3.1, th)];
    return { parts, toe, th, haunch };
  };
  const frontLeg = (far) => {
    const off = far ? 3.5 : 0, J = [sh[0] + 2 + off, sh[1] + 4 - (far ? 1 : 0)];
    let tg = [P.fp[0] + off, P.fp[1]], pa = P.fpa;
    if (digW > 0) { const a = digA + (far ? Math.PI : 0); tg[0] += Math.sin(a) * 6.5 * digW; tg[1] -= Math.max(0, Math.cos(a)) * 6 * digW; pa += Math.max(0, Math.cos(a)) * 0.7 * digW; }
    if (gw > 0) {
      const q = wrap1(ph + (far ? 0.05 : 0)), d = q - G.fS;
      const w = ramp(d, -0.09, 0) * (1 - ramp(d, G.dF, G.dF + 0.07));
      const fx = J[0] + cyc(q, FRONT_X) * G.reach, fy = J[1] + cyc(q, FRONT_Y);
      const gt = [lerp(fx, G.fL + off - ST * d, w), lerp(fy, 0, w)];
      tg = [lerp(tg[0], gt[0], gw), lerp(tg[1], gt[1], gw)]; pa = lerp(pa, (1 - w) * 0.7, gw);
    }
    tg[1] = Math.min(tg[1], 0);
    const a = ik2(J[0], J[1], tg[0] - 2, tg[1] - 3, FU, FLo, 1), e = [a.ex, a.ey];
    const paw = oval(e[0] + Math.cos(pa) * 2.2, e[1] + Math.sin(pa) * 2.2, 5, 3.1, pa);
    return { parts: [capsule(J[0], J[1], 6.4, a.jx, a.jy, 4.5), capsule(a.jx, a.jy, 4.4, e[0], e[1], 3.3), paw], e, j: [a.jx, a.jy], pa, toe: [e[0] + 2, e[1] + 3] };
  };
  const nh = hindLeg(false), fh = hindLeg(true), nf = frontLeg(false), ff = frontLeg(true);

  // head
  const hOff = [P.hd[0] * lerp(1, 1.08, kit) + gw * (G ? (G.reach - 1) * 8 : 0), P.hd[1] * lerp(1, 1.12, kit) + gw * (G ? (G.reach - 1) * 10 : 0)];
  const hp = pit * 0.45, hc = [sh[0] + hOff[0] * Math.cos(hp) - hOff[1] * Math.sin(hp), sh[1] + hOff[0] * Math.sin(hp) + hOff[1] * Math.cos(hp) + Math.sin(t * 1.1 + seed) * 0.25];
  const munch = clamp(p.munch ?? P.munch), chew = munch * (0.5 + 0.5 * Math.sin(t * 19 + seed));
  const hRot = P.hRot + pit * 0.3 + (p.tilt ?? 0) + munch * Math.sin(t * 19 + seed) * 0.012;
  const neck = capsule(sh[0] + 2, sh[1] - 2, rS * 0.82, hc[0] - 3 * hk, hc[1] + 3 * hk, 9.5 * hk);

  const rump = oval(hip[0], hip[1], rH * (1 + 0.2 * P.flat), rH, 0);
  const mid = sp(0.5, 1.4 - P.flat * 1.4);
  const torso = union(capsule(hip[0], hip[1], rH * 0.98, sh[0], sh[1], rS), rump, oval(mid[0], mid[1], sd * 0.78, (rH + rS) / 2 + 0.5, ang));
  const tUp = m.tailUp, tb = sp(-(rH * 0.9) / sd, rH * 0.22 + tUp * 3), tw = m === MOODS.happy ? Math.sin(t * 13 + seed) * 0.8 : 0;
  const tail = union(circle(tb[0] + tw, tb[1], 6.2), circle(tb[0] - 2.4 + tw, tb[1] - 2.6 - tUp * 1.5, 4.4));

  // ---- draw ----
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s);
  const shA = p.shadow ?? 0.3;
  if (shA > 0) shadow(c, (hip[0] + sh[0]) / 2 + 3, 1, (sd * 0.5 + 24) * (1 - air * 0.25), 5.5, shA * (1 - air * 0.45));
  c.lineJoin = 'round'; c.lineCap = 'round';

  const drawDirt = () => { // kicked back under the belly and out behind the rump
    if (!(digW > 0.3) || p.dirt === false) return;
    c.fillStyle = typeof p.dirt === 'string' ? p.dirt : '#8a6a48';
    for (let i = 0; i < 9; i++) {
      const u = wrap1(t * 2.4 + i / 9 + hash(i, seed + 4)), h = hash(i, seed + 8);
      c.globalAlpha = digW * Math.min(1, (1 - u) * 2.2);
      c.beginPath(); c.arc(sh[0] - 2 - u * (44 + h * 22), -Math.sin(u * Math.PI) * (9 + h * 15) - 1.5, 2.1 - u * 0.7 + h * 0.7, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  };
  const foreCol = V.band || null, farCol = mix(V.dark, L, 0.1);
  { const u = union(...fh.parts.slice(1)); fill(c, u, farCol); line(c, u, L, lw); }
  { const u = union(...ff.parts); fill(c, u, foreCol ? mix(foreCol, L, 0.25) : farCol); line(c, u, L, lw); }
  fill(c, tail, lin(c, 0, tb[1] - 8, 0, tb[1] + 7, [[0, mix(V.tail, V.coat, 0.25)], [0.45, V.tail], [1, mix(V.tail, V.dark, 0.3)]])); line(c, tail, L, lw);

  const legParts = [...nh.parts, ...nf.parts];
  const trunk = union(torso, neck), sil = union(trunk, ...legParts);
  const top = Math.min(hip[1] - rH, sh[1] - rS) - 2;
  fill(c, sil, lin(c, 0, top, 0, 1, [[0, V.light], [0.45, V.coat], [1, V.dark]]));
  clipped(c, trunk, () => {
    if (V.band) fill(c, blob([sp(0.5, 30), sp(0.62, 0), sp(0.5, -30), sp(1.6, -30), sp(1.6, 30)]), V.band);
    if (V.tick) {
      c.strokeStyle = alpha(mix(V.dark, L, 0.35), 0.5 * V.tick); c.lineWidth = lw * 0.55; c.beginPath();
      for (const [a, b, h] of TICKS) { const q = sp(a, b * (rH / 16)); c.moveTo(q[0], q[1]); c.lineTo(q[0] - ux * (2.4 + h * 2) + nx * 0.8, q[1] - uy * (2.4 + h * 2) + ny * 0.8); }
      c.stroke();
    }
    const b2 = sp(0.45, -(rH + rS) * 0.5);
    c.save(); c.translate(b2[0], b2[1]); c.rotate(ang); c.scale(1, 0.42);
    c.fillStyle = rad(c, 0, 0, sd * 0.95, [[0, alpha(V.belly, 0.95)], [0.55, alpha(V.belly, 0.7)], [1, alpha(V.belly, 0)]]);
    c.fillRect(-sd * 2, -sd * 2, sd * 4, sd * 4); c.restore();
    const ch = V.chest ?? 0;
    if (ch > 0.02) {
      const q = sp(1.05, -rS * 0.55), r = rS * (0.7 + 0.5 * ch);
      c.fillStyle = rad(c, q[0], q[1], r, [[0, alpha(V.belly, 0.95)], [0.6, alpha(V.belly, 0.75 * ch)], [1, alpha(V.belly, 0)]]);
      c.fillRect(q[0] - r, q[1] - r, r * 2, r * 2);
    }
  });
  if (foreCol) clipped(c, union(...nf.parts), () => { c.fillStyle = lin(c, 0, top, 0, 1, [[0, foreCol], [1, mix(foreCol, L, 0.25)]]); c.fillRect(-200, -200, 400, 400); });
  clipped(c, sil, () => {
    c.fillStyle = lin(c, 0, -15, 0, 0, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.5)]]);
    c.fillRect(-200, -15, 400, 18);
    c.save(); c.translate(0.6, 1.5); c.globalAlpha = 0.36; line(c, sil, V.light, lw * 2.3); c.restore();
    // inner contours: haunch and foreleg
    c.save(); c.globalAlpha = 0.38; c.strokeStyle = L; c.lineWidth = lw * 0.8;
    c.beginPath(); c.ellipse(hip[0] + 1.5, hip[1] + 1.5, rH * 0.86 * (1 + 0.18 * P.flat), rH * 0.86, 0, -2.0, 0.55); c.stroke();
    c.stroke(nh.parts[4]);
    const up2 = clamp(-nf.toe[1] / 9) * (1 - gw);
    if (up2 > 0.05) { // paws held off the ground: show the forearm against the chest
      const dx = nf.e[0] - nf.j[0], dy = nf.e[1] - nf.j[1], dl = Math.hypot(dx, dy) || 1, ox = -dy / dl, oy = dx / dl;
      c.globalAlpha = 0.55 * up2; c.stroke(nf.parts[2]);
      c.beginPath(); c.moveTo(nf.j[0] + ox * 4.3 - dx * 0.25, nf.j[1] + oy * 4.3 - dy * 0.25); c.lineTo(nf.e[0] + ox * 3.2, nf.e[1] + oy * 3.2); c.stroke();
    }
    c.restore();
  });
  line(c, sil, L, lw);
  c.strokeStyle = alpha(L, 0.65); c.lineWidth = lw * 0.6;
  for (const [q, a] of [[nf.toe, nf.pa], [nh.toe, nh.th]]) {
    for (const d of [0.4, 2.4]) { const bx = q[0] + Math.cos(a) * d, by = q[1] - 2.2 + Math.sin(a) * d; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 0.4, by + 1.7); c.stroke(); }
  }

  drawDirt();

  // ---- head ----
  const eb = [hc[0] + (-4.5 * Math.cos(hRot) + 10 * Math.sin(hRot)) * hk, hc[1] + (-4.5 * Math.sin(hRot) - 10 * Math.cos(hRot)) * hk], bt = sp(0.3, rH + 2);
  const flatA = clamp(Math.atan2(eb[0] - bt[0], eb[1] - bt[1]), 1.3, 2.2); // ear angle that lays the ears along the back
  const earIn = p.ear !== undefined ? clamp(p.ear) : lerp(lerp(m.ear, G ? Math.max(m.ear, G.ear) : m.ear, gw), Math.max(P.earA, m.ear > 0.6 ? m.ear : 0), P.earW);
  const flick = Math.max(0, noise1(t * 0.9, seed + 17) - 0.62) * 1.4 * (m === MOODS.asleep ? 0.2 : 1);
  const earA = earIn * 1.45 + clamp((earIn - 0.6) / 0.4) * (flatA - 1.45) + (gw > 0 ? Math.sin(TAU * ph + 2) * 0.12 * gw : 0), turn = clamp(p.earTurn ?? 0, -1, 1);
  const EL = 31 * (V.earK ?? 1) * lerp(1, 0.5, kit), eCol = V.earCol || V.coat;
  const earTipLocal = [-4.5 - Math.sin(earA - hRot * 0.7 + 0.08) * EL, -10 - Math.cos(earA - hRot * 0.7 + 0.08) * EL];
  const drawEar = (bx, by, a, far) => {
    c.save(); c.translate(bx, by); c.rotate(-a);
    const w = (far ? 0.9 : 1) * (1 - 0.14 * Math.abs(turn)) * lerp(1, 1.15, kit), l = EL * (far ? 0.97 : 1);
    const path = blob([[-3.3 * w, 1.5], [-5.3 * w, -l * 0.45], [-3.9 * w, -l * 0.86], [-0.2, -l], [3.5 * w, -l * 0.85], [4.8 * w, -l * 0.42], [3.3 * w, 1.5]]);
    fill(c, path, far ? mix(eCol, L, 0.28) : lin(c, 0, -l, 0, 0, [[0, mix(eCol, V.dark, 0.35)], [0.35, mix(eCol, V.light, 0.3)], [1, eCol]]));
    const iw = clamp(0.5 + 0.5 * turn);
    if (iw > 0.05) clipped(c, path, () => {
      const x0 = lerp(4.6, -2.6, iw) * w;
      fill(c, blob([[x0 * 0.7, -1], [x0, -l * 0.45], [x0 * 0.6 + 0.6, -l * 0.9], [3.4 * w, -l * 0.8], [3.9 * w, -l * 0.42], [2.6 * w, -1]]), far ? mix(V.earIn, L, 0.3) : V.earIn);
    });
    line(c, path, L, lw / hk);
    c.restore();
  };
  c.save();
  c.translate(hc[0], hc[1]); c.rotate(hRot); c.scale(hk, hk);
  const hl = lw / hk;
  drawEar(1.5, -10.8, earA - hRot * 0.7 - 0.2 * (1 - earIn) - turn * 0.1 + flick * 0.5, true);
  const nt = Math.sin(t * 15 * lerp(1, m.twitch, 0.5) + seed) * 0.5 * Math.min(1, m.twitch) * (0.55 + 0.45 * Math.sin(t * 2.3 + seed * 3));
  const skull = circle(0, 0, 13);
  const muzzle = blob([[2, -10], [11, -7], [17, -2.2 + nt * 0.3], [18.8, 3 + nt * 0.4], [15.5, 8.2], [7, 11.2], [-2, 11], [-6, 4]]);
  const cheek = oval(-1.5, 5.6, 10.5 + chew * 0.5, 8.6 + chew * 0.4, 0.1);
  const chin = oval(11.5, 8.6 + chew * 1.5, 5.2, 3.3, -0.12);
  const hsil = union(skull, muzzle, cheek, chin);
  fill(c, hsil, lin(c, 0, -14, 0, 13, [[0, mix(V.coat, V.light, 0.8)], [0.5, V.coat], [1, mix(V.coat, V.dark, 0.6)]]));
  const wide = Math.max(m.wide, P.wide), er = 5.3 * (1 + 0.13 * wide) * lerp(1, 1.1, kit);
  const ex = 1.2, ey = -3.4, fx = 11.4, fy = -4.9;
  clipped(c, hsil, () => {
    fill(c, blob([[9, 2.5], [15, 0.5], [20, 2], [20, 9], [14, 13], [6, 13], [4, 8]]), alpha(V.belly, 0.92)); // muzzle + chin
    c.globalAlpha = 0.5; fill(c, oval(-2, 8.5, 9, 5, 0.15), V.belly); c.globalAlpha = 1;
    const bz = V.blaze ?? 0;
    if (bz > 0.05) {
      const k = Math.min(bz, 1.4), wv = lerp(0.35, 1, clamp(k)) * (bz > 1 ? bz : 1), y0 = lerp(-4, -13.6, clamp(k));
      fill(c, blob([[6.4 - 4.8 * wv, y0 + 1.6], [6.6, y0 - 0.8], [6.8 + 4.6 * wv, y0 + 2.2], [7.6 + 2.4 * wv, -7], [12.5, -2 - wv], [18, -1.5], [20, 3], [12, 3.5], [6.8 - 1.6 * wv, -1], [5.8 - 2.8 * wv, -7]]), mix(V.belly, '#ffffff', 0.6));
    }
    c.globalAlpha = 0.5; fill(c, circle(ex, ey, er + 1.7), mix(V.coat, V.light, 0.85)); c.globalAlpha = 1;
    c.fillStyle = lin(c, 0, 3, 0, 14, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.45)]]);
    c.fillRect(-16, 3, 40, 12);
    c.save(); c.translate(0.5, 1.2); c.globalAlpha = 0.3; line(c, hsil, V.light, hl * 2.2); c.restore();
  });
  line(c, hsil, L, hl);
  // nose, mouth, whiskers
  const nx0 = 17.6, ny0 = 1.2 + nt;
  const nose = blob([[nx0 - 2.2, ny0 - 1.2], [nx0 + 1.5, ny0 - 0.9], [nx0 + 0.2, ny0 + 2.1]]);
  fill(c, nose, V.nose); line(c, nose, L, hl * 0.6);
  const smile = p.smile ?? m.smile;
  c.strokeStyle = L; c.lineWidth = hl * 0.8;
  c.beginPath(); c.moveTo(nx0 + 0.1, ny0 + 2.2); c.lineTo(nx0 - 0.6, 5.6 + chew * 0.5);
  c.quadraticCurveTo(nx0 - 4, 8.2 + smile * 1.1 + chew, 10.2, 7.2 - smile * 0.9 + chew * 0.6); c.stroke();
  c.strokeStyle = alpha(L, 0.4); c.lineWidth = hl * 0.42; c.beginPath();
  for (const [a, l] of [[2.55, 13], [2.25, 14], [1.95, 12], [0.75, 8], [0.4, 9]]) { const wa = a + nt * 0.08; c.moveTo(13.5, 5.2); c.quadraticCurveTo(13.5 + Math.cos(wa) * l * 0.5, 5.2 + Math.sin(wa) * l * 0.5 - 1, 13.5 + Math.cos(wa) * l, 5.2 + Math.sin(wa) * l); }
  c.stroke();
  // eyes
  const bk = p.blink ?? blink(t, seed + 1, 4.2), lid = clamp(Math.max(p.lid ?? m.lid, bk)), look = p.look || [0.3, 0.05];
  const lidCol = mix(V.coat, V.light, 0.4), brow = m.brow, la = -brow * 0.4, happy = m === MOODS.happy || m === MOODS.asleep;
  const eo = { look, iris: V.iris, irisR: lerp(0.8, 0.6, wide), lid, lidColor: lidCol, line: L, lw: hl * 0.8, happy, low: m === MOODS.happy ? 0.28 : 0 };
  eye(c, { ...eo, x: fx, y: fy, r: er * 0.74, lidAng: la });
  eye(c, { ...eo, x: ex, y: ey, r: er, lidAng: -la });
  if (brow < -0.3) {
    c.strokeStyle = mix(L, V.coat, 0.2); c.lineWidth = hl * 1.1; c.beginPath();
    c.moveTo(ex - 4.5, ey - er - 0.6); c.lineTo(ex + 3.5, ey - er - 2.6); c.moveTo(fx - 2.2, fy - er * 0.74 - 2.4); c.lineTo(fx + 3.2, fy - er * 0.74 - 0.8); c.stroke();
  }
  drawEar(-4.5, -10, earA - hRot * 0.7 + 0.08 + turn * 0.12 + flick, false);
  c.restore();
  c.restore();

  // anchors (canvas coordinates)
  const W = (q) => [(p.x ?? 0) + q[0] * s * flip, (p.y ?? 0) + q[1] * s];
  const ch0 = Math.cos(hRot), sh0 = Math.sin(hRot), HW = (q) => W([hc[0] + (q[0] * ch0 - q[1] * sh0) * hk, hc[1] + (q[0] * sh0 + q[1] * ch0) * hk]);
  return { head: W(hc), nose: HW([19, 2]), mouth: HW([15.5, 7.5]), eye: HW([ex, ey]), earTip: HW(earTipLocal), tail: W(tb), top: W([hc[0], hc[1] - 13 * hk]), feet: { nh: W(nh.toe), nf: W(nf.toe) } };
}

let ICON = null;
export function rabbitIcon(c, x, y, s = 1, color = '#f7c35f') {
  if (!ICON) {
    ICON = union(...[[-3, -13, 15.5, 13, -0.1], [-7, -11, 12, 11, 0], [10.5, -26, 9, 8.2, 0.1], [16, -23.5, 4.6, 4, 0.3], [5.5, -39, 3.1, 9.5, -0.28], [11.5, -39.5, 3, 9.5, 0.12], [-18.5, -9, 4.4, 4.4, 0], [9.5, -2.6, 6.5, 2.7, 0], [-4, -2.4, 11, 2.6, 0]].map((e) => oval(...e)));
  }
  c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = color; c.fill(ICON); c.restore();
}
