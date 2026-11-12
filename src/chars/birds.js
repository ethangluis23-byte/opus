// Bird rigs: parrots (hero scarlet macaw + small parrots), hawk, pigeon, mass flocks, butterfly, nest.
// Side view, facing right (flip -1 = left). Units: the macaw is ~110 units from perch to crown at s = 1 and its tail
// hangs ~75 units below the perch. All birds share one scale: at the same s an amazon is ~68 tall, parakeet ~58,
// conure ~54, budgie ~40, pigeon ~50.
//
// drawMacaw(c, p)   hero scarlet macaw.          drawParrot(c, p)   p.v: 'parakeet' | 'amazon' | 'budgie' | 'conure' | 'macaw'
//   x, y, s, flip    perch: point under the feet. fly: body centre. land: the point the feet reach for. peek: bottom
//                    centre of the nest hole (only head + shoulders are drawn, clipped at y, fading into p.holeColor)
//   t, seed          seconds / individual: blinks, breathing, head saccades, feather ruffles, tail sway (idle: 0..1 scales them)
//   pose             'perch' (default) | 'fly' | 'land' | 'peek'
//   flap             wing-beat phase in cycles (0 = wings up, 0.5 = down); defaults to a beat driven by t
//   glide            0..1 hold the wings out (fly);  pitch  radians nose-up (fly default 0.06, land 0.95)
//   wings            0..1 wings raised/half open while perched (stretch, balance after landing)
//   mood             'neutral' | 'happy' | 'sad' | 'alert' | 'asleep'   (overrides: lid 0..1, fluff 0..1)
//   age              0 bright young bird .. 1 very old: faded, ragged / missing feathers, dull heavy-lidded eye, hunched
//   talk             0..1 beak open        bob   0..1 happy head-bob (animated by t)      tilt  -1..1 head tilt
//   look             [dx, dy] pupil direction -1..1 (dx > 0 forward)
//   headTurn         -1..1 looks back over the shoulder (|1| = fully turned)
//   preen            0..1 head tucked back to the wing, nibbling       eat  0..1 reaches forward/down to take a seed
//   shuffle          sideways shuffle phase in cycles (feet lift alternately, body rocks; move x yourself)
//   shadow           contact-shadow strength under the perch point (default 0)
//   BIRDS            variant table (pass an object as v to override colours).
// drawHawk(c, {x, y, s, flip, t, bank, flap, rot})   soaring red-tailed hawk seen from below/side, ~200 units wingspan.
//                    bank -1..1 rolls it, flap = slow beat phase in cycles (default: gentle soaring from t), rot radians.
// hawkShadow(c, x, y, s, a, rot)   soft dark hawk-shaped ground shadow (flattened), alpha a (default 0.28).
// drawPigeon(c, {x, y, s, flip, t, seed, pose, flap, walk, v, look, shadow})
//                    pose 'stand' | 'peck' (animated from t) | 'fly' (flap phase; x, y = body centre);
//                    walk = step phase in cycles (head-bobbing walk); v 'blue' | 'dark' | 'pale' | 'red' (default by seed).
// flock(c, {x, y, w, h, n, t, seed, dir, speed, size, colors, spread, wheel})
//                    n (<= 400) small flapping parrot shapes inside the rect (x, y = top-left). dir 1/-1, speed px/s,
//                    size 1 = ~22 px long birds, colors [[body, wing, tail], ...], spread 0..1 (tight band .. fills rect),
//                    wheel 0 = streaming across with a murmuration-like undulation (wraps), 1 = wheeling round the centre.
// drawButterfly(c, {x, y, s, t, seed, color, flap, rot})   ~26 units wingspan; flap phase optional (default from t).
// drawNest(c, {x, y, s, eggs, seed})   stick nest ~90 wide, 34 tall; (x, y) = bottom centre; eggs 0..4.
import { Path2D } from '@napi-rs/canvas';
import { blob, capsule, circle, oval, union, fill, line, clipped, lin, rad, shadow, poly } from '../engine/draw.js';
import { TAU, DEG, clamp, lerp, mix, tone, alpha, sat, hash, noise1, RNG, ss, wrap } from '../engine/util.js';
import { eye, blink, inkW } from './rig.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const c01 = (v, d = 0) => clamp(num(v, d));

export const BIRDS = {
  macaw: { size: 1, body: '#e4392b', dark: '#a81d24', light: '#fb7350', line: '#4c1017', wing: ['#dd352b', '#f8c832', '#2d66cc'], wingDark: '#1c3f96',
    under: ['#e5532f', '#ecab3c'], tail: ['#d8302b', '#2d66cc'], tailLen: 96, tailW: 9, patch: '#f8f0e6', beak: '#f4e9cf', beakShade: '#cbb994', beakTip: '#40332e',
    jaw: '#322927', beakK: 1, iris: '#f4dc74', eyeR: 7.7, feet: '#6f686b', headK: 1, fat: 1 },
  parakeet: { size: 0.54, body: '#7fc63f', dark: '#4a9a2e', light: '#b2e262', line: '#1f4d1c', wing: ['#72bc3b', '#8fd24c', '#3f9040'], wingDark: '#2a6a3a',
    under: ['#9bd65a', '#5aa06a'], tail: ['#5fb04a', '#3f9fb8'], tailLen: 100, tailW: 8, beak: '#e8493b', beakShade: '#b92f2c', jaw: '#5a2a2a', beakK: 0.7,
    iris: '#f6edc0', eyeR: 7.4, eyeRing: '#f29a4a', feet: '#8a8486', headK: 1.08, fat: 0.96, ring: ['#2a2424', '#f08aa0'] },
  amazon: { size: 0.64, body: '#55b040', dark: '#2f7d32', light: '#8fd660', line: '#1b4520', wing: ['#4aa53c', '#e2443a', '#2f5fb0'], wingDark: '#22407e',
    under: ['#86cc5c', '#4f9a8a'], tail: ['#4fa83e', '#c9d44a'], tailLen: 34, tailW: 15, beak: '#efe3bf', beakShade: '#c8b98e', jaw: '#d9cba3', beakK: 0.78,
    iris: '#f2b03a', eyeR: 7.2, eyeRing: '#f5f0e6', feet: '#8a8486', headK: 1.1, fat: 1.14, crown: '#e63d33', cheek: '#6a8fe0' },
  budgie: { size: 0.38, body: '#86d24c', dark: '#4fa33a', light: '#c0ee72', line: '#254d1e', wing: ['#e6e25a', '#e6e25a', '#3e5a5a'], wingDark: '#2e4444',
    under: ['#cfe86a', '#8fb89a'], tail: ['#3a78c0', '#2a5a9a'], tailLen: 62, tailW: 9, beak: '#ecd9a0', beakShade: '#c9b577', jaw: '#d9c48a', beakK: 0.52,
    iris: '#f4f1e4', eyeR: 7.8, feet: '#9aa0b4', headK: 1.24, fat: 1.06, head: '#f6e452', cere: '#4f8fe0', bars: '#33382c', spots: 1 },
  conure: { size: 0.52, body: '#f9c62c', dark: '#e08a1c', light: '#ffe46a', line: '#6a3410', wing: ['#f6c22a', '#6cba48', '#2f6ab8'], wingDark: '#1f4a8c',
    under: ['#f4b63a', '#7aa878'], tail: ['#7aa83a', '#2f6ab8'], tailLen: 66, tailW: 9, beak: '#474040', beakShade: '#2c2727', jaw: '#3a3434', beakK: 0.74,
    iris: '#5a4030', eyeR: 7.4, eyeRing: '#f6f1e8', feet: '#7d7578', headK: 1.1, fat: 1, face: '#f47a20' },
};

const MOODS = {
  neutral: { lid: 0, brow: 0, fluff: 0.12, tall: 0, pin: 0, low: 0, droop: 0 },
  happy: { lid: 0, brow: 0, fluff: 0.5, tall: 0.15, pin: 0.25, low: 0.36, droop: 0 },
  sad: { lid: 0.3, brow: -1, fluff: 0, tall: -0.7, pin: 0, low: 0, droop: 1 },
  alert: { lid: 0, brow: 0, fluff: 0, tall: 1, pin: 0.75, low: 0, droop: 0 },
  asleep: { lid: 1, brow: 0, fluff: 1, tall: -0.8, pin: 0, low: 0, droop: 0.4 },
};

const _pal = new Map();
function palette(key, V, age) {
  const q = Math.round(age * 25), id = key ? `${key}:${q}` : null;
  let P = id && _pal.get(id);
  if (P) return P;
  const a = q / 25, f = (col) => (col && a > 0 ? mix(sat(col, 1 - 0.4 * a), '#b9a595', 0.17 * a) : col);
  P = { ...V };
  for (const k of ['body', 'dark', 'light', 'head', 'crown', 'face', 'cheek', 'wingDark']) P[k] = f(V[k]);
  P.wing = (V.wing || BIRDS.macaw.wing).map(f); P.under = (V.under || BIRDS.macaw.under).map(f); P.tail = (V.tail || BIRDS.macaw.tail).map(f);
  P.iris = a > 0 ? mix(V.iris, '#9c917c', 0.55 * a) : V.iris;
  P.beak = a > 0 ? mix(V.beak, '#b9aa90', 0.3 * a) : V.beak;
  P.farBody = tone(P.dark, -0.12); P.farWing = P.wing.map((w) => tone(w, -0.22)); P.farUnder = P.under.map((w) => tone(w, -0.22));
  if (id) _pal.set(id, P);
  return P;
}

// ---------------------------------------------------------------- head
const SK = [[-20, 3], [-18, -11], [-8, -20], [5, -21.5], [15, -15.5], [19.5, -4], [17, 8], [9, 17], [-4, 19], [-15, 14]];
const SKULL = blob(SK);
const BEAK_UP = blob([[11, -12], [19, -17], [29, -13.5], [35, -4], [35.5, 7], [31, 18.5, 1], [27.5, 11], [21, 6.5], [11, 5.5]]);
const BEAK_LO = blob([[10, 5], [18, 6], [24, 9], [25.5, 14], [21.5, 19.5], [14, 19.5], [9.5, 14]]);
const PATCH = blob([[15, -15], [5, -17], [-6, -12], [-10, -1], [-5, 10], [6, 14], [14, 9], [18, -2]]);
const CROWN = blob([[21, -4], [15, -18], [3, -24], [-9, -21], [-5, -12], [7, -10]]);

// Skull outline in body space (so it can be merged into the silhouette).
function skullPath(hc, hf, rot, hk, fluff) {
  const ca = Math.cos(rot), sa = Math.sin(rot), f = 1 + fluff * 0.05;
  const hp = (x, y) => [hc[0] + hf * hk * (x * ca - y * sa), hc[1] + hk * (x * sa + y * ca)];
  const parts = [blob(SK.map((q) => hp(q[0] * (q[0] < 0 ? f : 1), q[1] * f)))];
  if (fluff > 0.3) {
    const k = (fluff - 0.3) * 1.4;
    for (const [bx, by, dx, dy] of [[-19, -3, -5, -2], [-19, 7, -5, 2], [-13, -16, -4, -4], [-14, 14, -3, 4]]) {
      parts.push(poly([hp(bx + 4, by - 3.5), hp(bx + dx * k, by + dy * k), hp(bx + 4, by + 3.5)]));
    }
  }
  return parts;
}

function headPaint(c, P, hc, hf, rot, hk, st) {
  const { L, age } = st, lw = st.lw / hk, talk = st.talk;
  c.save();
  c.translate(hc[0], hc[1]); c.scale(hf * hk, hk); c.rotate(rot);
  clipped(c, SKULL, () => {
    if (P.head) { c.fillStyle = lin(c, 0, -22, 0, 26, [[0, tone(P.head, 0.12)], [0.6, P.head], [0.8, P.head], [1, alpha(P.head, 0)]]); c.fillRect(-30, -30, 60, 60); }
    if (P.face) { c.fillStyle = rad(c, 8, 0, 25, [[0, P.face], [0.55, alpha(P.face, 0.9)], [1, alpha(P.face, 0)]]); c.fillRect(-30, -30, 60, 60); }
    if (P.crown) fill(c, CROWN, lin(c, 0, -24, 0, -8, [[0, tone(P.crown, 0.15)], [1, P.crown]]));
    if (P.cheek) { c.fillStyle = rad(c, -5, 4, 12, [[0, alpha(P.cheek, 0.75)], [1, alpha(P.cheek, 0)]]); c.fillRect(-20, -10, 30, 30); }
    if (P.patch) {
      fill(c, PATCH, lin(c, 0, -16, 0, 14, [[0, P.patch], [1, tone(P.patch, -0.1)]]));
      if (st.blush > 0) { c.fillStyle = rad(c, 4, 7, 9, [[0, alpha('#f08a8a', 0.5 * st.blush)], [1, alpha('#f08a8a', 0)]]); c.fillRect(-8, -4, 24, 22); }
      c.strokeStyle = alpha(P.body, 0.75); c.lineWidth = 0.9; c.lineCap = 'round';
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-6 + i * 1.6, 2.5 + i * 2.4); c.quadraticCurveTo(1, 7 + i * 2.2, 9 - i, 5.5 + i * 2); c.stroke(); }
      line(c, PATCH, alpha(L, 0.28), lw * 0.6);
    }
    if (P.bars) {
      c.strokeStyle = P.bars; c.lineWidth = 1.1;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(4, 2, 12 + i * 3, 2.3, 4.1); c.stroke(); }
    }
    if (P.ring) {
      c.lineCap = 'round'; c.lineWidth = 3;
      c.strokeStyle = P.ring[1]; c.beginPath(); c.moveTo(-9, 16.5); c.quadraticCurveTo(-19, 12, -20.5, 0); c.stroke();
      c.strokeStyle = P.ring[0]; c.beginPath(); c.moveTo(13, 9); c.quadraticCurveTo(8, 17, -3, 17.5); c.quadraticCurveTo(-10, 17, -15, 13); c.stroke();
    }
    if (P.spots) {
      fill(c, oval(4, 11, 4.2, 2.8, 0.3), '#7a68d8');
      c.fillStyle = '#25252a';
      for (const [sx, sy] of [[11, 16], [4.5, 18], [-2, 17]]) { c.beginPath(); c.arc(sx, sy, 1.5, 0, TAU); c.fill(); }
    }
    if (age > 0.3) { // thinning, ruffled patches on an old bird
      c.strokeStyle = alpha(P.dark, 0.45 * age); c.lineWidth = 1;
      for (const [ax, ay] of [[-14, -6], [-10, 9], [-3, -17], [-16, 3]]) { c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - 3, ay + 2.5); c.moveTo(ax + 2, ay + 2); c.lineTo(ax - 1, ay + 4.5); c.stroke(); }
    }
  });
  // beak
  const bk = P.beakK;
  c.save();
  c.translate(12, -2); c.scale(bk, bk); c.translate(-12, 2);
  const blw = lw / bk;
  if (talk > 0.03) {
    c.save(); c.translate(11, 6); c.rotate(talk * 0.3); c.translate(-11, -6);
    fill(c, BEAK_LO, '#4a161c'); fill(c, oval(17.5, 10, 5.5, 2.8, 0.25), '#7c5a66');
    c.restore();
  }
  c.save(); c.translate(11, 6); c.rotate(talk * 0.66); c.translate(-11, -6);
  fill(c, BEAK_LO, lin(c, 0, 5, 0, 20, [[0, P.jaw], [1, tone(P.jaw, -0.25)]])); line(c, BEAK_LO, L, blw);
  c.restore();
  c.save(); c.translate(12, -6); c.rotate(-talk * 0.13); c.translate(-12, 6);
  fill(c, BEAK_UP, lin(c, 14, -16, 30, 16, [[0, tone(P.beak, 0.18)], [0.55, P.beak], [1, P.beakShade]]));
  clipped(c, BEAK_UP, () => {
    if (P.beakTip) { c.fillStyle = rad(c, 14, 8, 13, [[0, alpha(P.beakTip, 0.9)], [0.6, alpha(P.beakTip, 0.55)], [1, alpha(P.beakTip, 0)]]); c.fillRect(0, -6, 30, 28); }
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(19, -13); c.quadraticCurveTo(28, -11, 31.5, -3); c.stroke();
    if (age > 0.4) { c.strokeStyle = alpha(P.beakShade, 0.7 * age); c.lineWidth = 0.8; c.beginPath(); c.moveTo(24, -3); c.lineTo(30, 5); c.moveTo(21, 0); c.lineTo(26, 8); c.stroke(); }
  });
  line(c, BEAK_UP, L, blw);
  c.fillStyle = alpha(L, 0.75); c.beginPath(); c.ellipse(15.5, -10.5, 1.5, 1, -0.5, 0, TAU); c.fill();
  c.restore();
  if (P.cere) { const ce = oval(14.5, -10, 4.2, 3, -0.5); fill(c, ce, P.cere); line(c, ce, L, blw * 0.7); }
  c.restore();
  // eye
  const ex = 2.5, ey = -4.5, r = P.eyeR;
  if (P.eyeRing && st.lid < 0.9) { c.fillStyle = P.eyeRing; c.beginPath(); c.arc(ex, ey, r + 1.9, 0, TAU); c.fill(); }
  const skin = P.patch ? mix(P.patch, '#e3b7a6', 0.55) : mix(P.head || P.face || P.body, P.dark, 0.25);
  eye(c, { x: ex, y: ey, r, look: st.look, iris: P.iris, irisR: 0.74, dilate: st.dilate, lid: st.lid, lidAng: st.lidAng, lidColor: skin, low: st.low,
    line: L, lw: lw * 0.85, happy: st.happy });
  if (age > 0.25 && st.lid < 0.9) { // tired crease under an old eye
    c.strokeStyle = alpha(L, 0.3 * age); c.lineWidth = lw * 0.5; c.beginPath(); c.arc(ex, ey + 1, r + 2.6, 0.5, 2.2); c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------- feathers
function tailFeathers(c, P, root, ang, o) {
  const { len, lw, L, spread, bend, age } = o, w0 = P.tailW * (o.wk ?? 1);
  for (let i = 4; i >= 0; i--) {
    const side = i % 2 ? 1 : -1, rank = Math.ceil(i / 2);
    if ((i === 2 && age > 0.45) || (i === 3 && age > 0.8)) continue;
    let l = len * (1 - 0.19 * rank - (i % 2 ? 0.05 : 0));
    const broken = i === 0 && age > 0.62;
    if (broken) l *= 0.8;
    const a = ang + side * rank * spread + bend * (0.4 + rank * 0.2);
    const dx = Math.cos(a), dy = Math.sin(a), mx = -dy, my = dx, w = w0 * (1 - rank * 0.1);
    const bx = bend * l * 0.22, at = (u, v) => [root[0] + dx * l * u + mx * (v + bx * u * u), root[1] + dy * l * u + my * (v + bx * u * u)];
    const tipW = len < 50 ? w * 0.42 : (broken ? w * 0.3 : 0);
    const pts = [at(0, -w * 0.5), at(0.3, -w * 0.62), at(0.7, -w * 0.4), tipW ? at(1, -tipW) : at(1, 0, 1), at(0.7, w * 0.4), at(0.3, w * 0.62), at(0, w * 0.5)];
    if (tipW) pts.splice(4, 0, at(1.02, tipW));
    else pts[3] = [...at(1, 0), 1];
    if (broken) pts.splice(4, 0, [...at(0.93, 0), 1]);
    const f = blob(pts), col = rank === 0 ? P.tail[0] : rank === 1 ? mix(P.tail[0], P.tail[1], 0.6) : P.tail[1];
    const tip = at(1, 0);
    fill(c, f, lin(c, root[0], root[1], tip[0], tip[1], [[0, tone(col, o.far ? -0.2 : 0.06)], [0.55, col], [1, mix(col, P.tail[1], 0.8)]]));
    line(c, f, L, lw * 0.85);
    const m = at(0.86, 0);
    c.strokeStyle = alpha(L, 0.35); c.lineWidth = lw * 0.45; c.beginPath(); c.moveTo(root[0], root[1]); c.quadraticCurveTo(...at(0.5, 0), m[0], m[1]); c.stroke();
  }
}

// Spread wing in side view. o: S shoulder, k signed elevation (-1 up .. 1 down), fold wrist flex, L span, C0 root chord,
// sweep, cd chord direction, cols [coverts, band, flights], dk darker flight tone.
function spreadWing(c, o) {
  const { S, k, C0, cols, lw } = o, L = o.span, fold = o.fold ?? 0, sw = o.sweep ?? 0.16, cd = o.cd ?? [-1, 0], n = 8, age = o.age ?? 0;
  const LE = (v) => {
    const a = Math.min(v, 0.5), b = Math.max(0, v - 0.5);
    return [S[0] - (sw * a + (sw + fold * 0.95) * b) * L + Math.sin(v * Math.PI) * 4, S[1] + k * L * (a + b * (1 - fold * 0.5))];
  };
  const PT = (v, w) => { const q = LE(v), h = C0 * (1 - 0.68 * v * v) * w; return [q[0] + cd[0] * h, q[1] + cd[1] * h + w * 3]; };
  const e1 = LE(1), e0 = LE(0.88), el = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) || 1;
  const tip = [e1[0] + ((e1[0] - e0[0]) / el) * 8 + cd[0] * 5, e1[1] + ((e1[1] - e0[1]) / el) * 8 + cd[1] * 5];
  const pts = [LE(0), LE(0.25), LE(0.5), LE(0.75), LE(0.94), tip];
  for (let i = n; i >= 1; i--) {
    const rag = age > 0.4 && hash(i, 77) < age * 0.45 ? 0.74 : 1;
    if (i < n) pts.push([...PT(i / n, 0.84), 1]);
    pts.push(PT((i - 0.5) / n, 1.04 * rag));
  }
  pts.push([...PT(0, 0.96), 1]);
  const wing = blob(pts);
  const y0 = Math.min(S[1], e1[1]), y1 = Math.max(S[1], e1[1]) + 6, g = (col) => lin(c, 0, y0, 0, y1, [[0, tone(col, 0.1)], [1, tone(col, -0.14)]]);
  const wb = (v) => lerp(1, 0.42, ss(0.4, 0.95, v)), vs = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const band = (w1) => blob([...vs.map((v) => LE(v)), ...vs.slice().reverse().map((v) => PT(v, w1 * wb(v)))]);
  fill(c, wing, lin(c, S[0], S[1], e1[0] - 0.5, e1[1], [[0, cols[2]], [1, o.dk ?? cols[2]]]));
  clipped(c, wing, () => {
    c.strokeStyle = alpha(o.L, 0.4); c.lineWidth = lw * 0.5;
    c.beginPath();
    for (let i = 1; i < n; i++) { const a = PT(i / n, 0.5 * wb(i / n)), b = PT(i / n, 0.86); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    c.stroke();
    fill(c, band(0.58), g(cols[1]));
    fill(c, band(0.36), g(cols[0]));
  });
  line(c, wing, o.L, lw);
}

const tuft = (list, bx, by, dx, dy, w) => {
  const l = Math.hypot(dx, dy) || 1, mx = (-dy / l) * w, my = (dx / l) * w;
  list.push(poly([[bx - dx * 0.8 + mx, by - dy * 0.8 + my], [bx + dx, by + dy], [bx - dx * 0.8 - mx, by - dy * 0.8 - my]]));
};

function foot(c, P, fx, lift, st, grip = 1) {
  const { L, lw } = st, y = -lift;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const stroke = (col, w) => {
    c.strokeStyle = col; c.lineWidth = w;
    c.beginPath(); c.moveTo(fx - 0.5, y - 9); c.lineTo(fx, y - 2.6);
    c.moveTo(fx, y - 2.6); c.quadraticCurveTo(fx + 7.5, y - 3.6, fx + 7.6, y + lerp(-1.5, 1.6, grip));
    c.moveTo(fx + 0.5, y - 2.6); c.quadraticCurveTo(fx + 3.8, y - 4, fx + 3.9, y + lerp(-1, 2.2, grip));
    c.moveTo(fx, y - 2.6); c.quadraticCurveTo(fx - 5.4, y - 3.4, fx - 5.4, y + lerp(-1.5, 1.4, grip));
    c.stroke();
  };
  stroke(L, 3.5 + lw * 1.5); stroke(P.feet, 3.5);
  c.strokeStyle = alpha(L, 0.85); c.lineWidth = 1.5;
  c.beginPath();
  for (const [dx, dy] of [[7.6, 1.6], [3.9, 2.2], [-5.4, 1.4]]) { c.moveTo(fx + dx, y + dy * grip); c.lineTo(fx + dx - Math.sign(dx) * 0.6, y + dy * grip + 2.2); }
  c.stroke();
}

// Common head state from mood / options.
function headState(p, P, st) {
  const { M, t, seed, age, idle } = st, asleep = p.mood === 'asleep';
  const sk = t * 0.62 + hash(seed, 11) * 10, si = Math.floor(sk), sf = sk - si;
  const sac = asleep ? 0 : lerp(hash(si, seed + 21) - 0.5, hash(si + 1, seed + 21) - 0.5, ss(0.84, 0.96, sf)) * idle;
  const baseLid = clamp(num(p.lid, M.lid + age * 0.16));
  const look = Array.isArray(p.look) ? [num(p.look[0]), num(p.look[1])] : [0.25 + sac * 0.5, M.droop * 0.35];
  st.sac = sac;
  st.lid = Math.max(baseLid, asleep ? 1 : blink(t, seed, 3.8) * idle);
  st.lidAng = M.brow < 0 ? M.brow * 0.36 - age * 0.06 : -age * 0.12;
  st.low = M.low; st.happy = p.mood === 'happy';
  st.dilate = (1 - 0.34 * M.pin) * lerp(1, 0.86, age);
  st.look = look; st.talk = c01(p.talk);
  st.blush = P.patch ? (p.mood === 'happy' ? 0.8 : 0) + c01(p.bob) * 0.4 : 0;
}

// ---------------------------------------------------------------- perch / peek
function perchPose(c, P, p, st, peek) {
  const { t, seed, lw, L, M, age, idle } = st, asleep = p.mood === 'asleep';
  const eat = c01(p.eat), preen = c01(p.preen), turn = Math.max(Math.abs(clamp(num(p.headTurn), -1, 1)), preen);
  const bobA = c01(p.bob), bob = Math.sin(t * TAU * 2.3 + seed), wingsUp = c01(p.wings);
  const rk = t / 7.3 + hash(seed, 5), rph = (rk - Math.floor(rk)) * 7.3, ruffle = asleep || rph > 0.9 ? 0 : Math.sin((rph / 0.9) * Math.PI) * idle;
  const fluff = clamp(num(p.fluff, M.fluff) + ruffle * 0.7 + bobA * 0.2), shake = Math.sin(t * 46) * ruffle * 0.7;
  const tall = M.tall * (1 - eat) - age * 0.35;
  const breath = Math.sin(t * (asleep ? 1.5 : 2.2) + seed * 1.7) * (asleep ? 1.3 : 0.7) * idle;
  const hasSh = typeof p.shuffle === 'number' && isFinite(p.shuffle), sa = hasSh ? Math.sin(TAU * p.shuffle) : 0;
  const leanA = (17 - 7 * tall + 19 * eat + 8 * preen + age * 6) * DEG + sa * 0.05, B = 54 * (1 + 0.05 * tall), fat = P.fat * (1 + 0.09 * fluff);
  const H = [-4 + (hasSh ? Math.cos(TAU * p.shuffle) * 2.4 : 0) + shake, -25 + bobA * 2.2 * Math.sin(t * TAU * 2.3 + seed - 0.7) - Math.abs(sa) * 1.2];
  const u = [Math.sin(leanA), -Math.cos(leanA)], n = [Math.cos(leanA), Math.sin(leanA)];
  const bp = (a, b) => [H[0] + u[0] * a * B + n[0] * b, H[1] + u[1] * a * B + n[1] * b];
  const body = blob([bp(-0.25, -5), bp(-0.06, -17 * fat), bp(0.4, -21.5 * fat), bp(0.8, -17.5), bp(1.05, -9), bp(1.07, 10), bp(0.8, 21.5 * fat),
    bp(0.44, 25 * fat + breath), bp(0.1, 19.5 * fat), bp(-0.18, 7)]);
  // head
  const hk = P.headK, nb = bp(1, 2);
  const pk = preen * (1 + 0.06 * Math.sin(t * 13)), turnS = ss(0.0, 1, turn);
  const hc = [nb[0] + 6 + eat * 20 - pk * 15 - turnS * (1 - preen) * 5 + shake, nb[1] - 14 - tall * 3.5 + eat * 15 + pk * 13 + M.droop * 5 + age * 3 + bobA * (-4 - 5 * bob) + breath * 0.4];
  const hfRaw = Math.cos(Math.PI * turn), hf = (hfRaw < 0 ? -1 : 1) * Math.max(Math.abs(hfRaw), 0.42);
  const hRot = clamp(num(p.tilt), -1, 1) * 0.42 + eat * 0.5 + pk * 0.95 + M.droop * 0.16 + st.sac * 0.2 + bobA * bob * 0.08 + (asleep ? 0.12 : 0) + (hf < 0 && !preen ? 0.1 : 0);
  const neck = capsule(...bp(0.86, 1), 17 * fat, hc[0] - hf * 2, hc[1] + 4, 16.5 * hk);
  const tufts = [];
  if (fluff > 0.3) {
    const k = (fluff - 0.3) * 1.5;
    for (const [a, b] of [[0.78, 21], [0.55, 24.5], [0.3, 23], [0.1, 19]]) { const q = bp(a, b * fat - 2); tuft(tufts, q[0], q[1], n[0] * 4 * k - u[0] * 3 * k, n[1] * 4 * k - u[1] * 3 * k, 3.4); }
    for (const [a, b] of [[0.2, -19], [-0.05, -15]]) { const q = bp(a, b * fat + 2); tuft(tufts, q[0], q[1], -n[0] * 4 * k - u[0] * 3 * k, -n[1] * 4 * k - u[1] * 3 * k, 3.4); }
  }
  if (age > 0.4) { const q = bp(0.62, 22 * fat); tuft(tufts, q[0], q[1], n[0] * 5 * age + 1, n[1] * 5 * age + 3, 2.6); const q2 = bp(0.9, -16); tuft(tufts, q2[0], q2[1], -5 * age, -2, 2.6); }
  const sil = union(body, neck, ...skullPath(hc, hf, hRot, hk, fluff), ...tufts);
  const top = hc[1] - 22 * hk, grad = lin(c, 0, top, 0, 4, [[0, P.light], [0.45, P.body], [1, P.dark]]);
  const sh0 = bp(0.9, -7);

  if (peek) { c.save(); c.beginPath(); c.rect(-90, -160, 180, 160); c.clip(); c.translate(-nb[0] + 2, -nb[1] - 12); }
  if (!peek) {
    if (num(p.shadow) > 0) shadow(c, 0, 3, 34, 6, num(p.shadow));
    const sway = Math.sin(t * 1.1 + seed) * 0.035 * idle + (hasSh ? -sa * 0.06 : 0) + bobA * bob * 0.03;
    const tr = bp(-0.17, -9.5), ta = Math.atan2(-u[1], -u[0]) + 0.05 + M.droop * -0.08 + eat * 0.12;
    tailFeathers(c, P, tr, ta + sway, { len: P.tailLen * (1 - age * 0.06), lw, L, spread: P.tailLen < 50 ? 0.16 : 0.035, bend: sway * 2 + 0.18, age });
    if (wingsUp > 0.02) {
      const kk = -wingsUp * 0.92 + Math.sin(t * 9) * 0.03 * wingsUp;
      spreadWing(c, { S: [sh0[0] + 5, sh0[1] - 2], k: kk, span: 92, C0: 50, sweep: -0.26, cols: P.farWing, dk: tone(P.wingDark, -0.2), lw, L, age, cd: [-0.94, 0.34] });
      spreadWing(c, { S: sh0, k: kk, span: 94, C0: 52, sweep: 0.4, cols: [P.under[0], P.under[1], P.under[1]], dk: tone(P.under[1], -0.15), lw, L, age, cd: [-0.94, 0.34] });
    }
    foot(c, P, 7, Math.max(0, -sa) * 5, st);
  }
  fill(c, sil, grad);
  clipped(c, sil, () => {
    if (P.belly) { const q = bp(0.45, 14); c.fillStyle = rad(c, q[0], q[1], 34, [[0, P.belly], [0.6, alpha(P.belly, 0.8)], [1, alpha(P.belly, 0)]]); c.fillRect(q[0] - 34, q[1] - 34, 68, 68); }
    const q = bp(0.72, 9); c.fillStyle = rad(c, q[0], q[1], 26, [[0, alpha(P.light, 0.5)], [1, alpha(P.light, 0)]]); c.fillRect(q[0] - 26, q[1] - 26, 52, 52);
    c.fillStyle = lin(c, 0, -30, 0, 2, [[0, alpha(P.dark, 0)], [1, alpha(mix(P.dark, L, 0.35), 0.55)]]); c.fillRect(-80, -30, 160, 40);
    c.strokeStyle = alpha(mix(P.dark, L, 0.3), 0.5); c.lineWidth = lw * 0.5; c.lineCap = 'round'; // chest feather scallops
    for (const [a, b] of [[0.62, 13], [0.5, 19], [0.36, 12], [0.3, 20], [0.14, 13], [0.74, 16]]) { const s0 = bp(a, b); c.beginPath(); c.arc(s0[0], s0[1], 3.6, 0.5, 2.5); c.stroke(); }
    c.save(); c.translate(1.2, 2.6); c.globalAlpha = 0.36; line(c, sil, P.light, lw * 2.4); c.restore();
  });
  line(c, sil, L, lw);
  if (!peek && wingsUp < 0.6) { // folded wing
    const droop = M.droop * 2 + age * 2.5;
    const wing = blob([bp(0.93, 4), bp(1.0, -8), bp(0.78, -18.5 * fat), bp(0.36, -22.5 * fat), bp(-0.08, -21.5), bp(-0.5, -18 + droop), [...bp(-0.8, -14 + droop * 2), 1],
      bp(-0.42, -8 + droop), bp(-0.02, -1), bp(0.4, 6.5), bp(0.72, 9)]);
    const ua = Math.atan2(u[1], u[0]), w0 = bp(1, 0), w1 = bp(-0.8, 0);
    fill(c, wing, lin(c, 0, w0[1], 0, w1[1], [[0, tone(P.wing[0], 0.12)], [0.5, P.wing[0]], [1, tone(P.wing[0], -0.2)]]));
    clipped(c, wing, () => {
      fill(c, poly([bp(0.36, -34), bp(0.34, 20), bp(-1.2, 20), bp(-1.2, -34)]), lin(c, ...bp(0.34, -8), ...bp(-0.8, -12), [[0, P.wing[2]], [1, P.wingDark]]));
      c.strokeStyle = alpha(L, 0.42); c.lineWidth = lw * 0.5;
      for (const b of [-13, -6.5, 0]) { const a0 = bp(0.26, b * 1.5 - 2), a1 = bp(-0.66 + b * -0.012, -14 + droop * 2 + (b + 13) * 0.42); c.beginPath(); c.moveTo(a0[0], a0[1]); c.lineTo(a1[0], a1[1]); c.stroke(); }
      const row = (al, col, rx, n0, edge) => {
        for (let i = 0; i < n0; i++) {
          const q = bp(al + (i % 2) * 0.03, -24 + i * (34 / (n0 - 1))), f = oval(q[0], q[1], rx, 4.6, ua);
          fill(c, f, col);
          if (edge) line(c, f, edge, lw * 0.45);
        }
      };
      fill(c, poly([bp(0.62, -34), bp(0.62, 20), bp(0.42, 20), bp(0.42, -34)]), P.wing[1]);
      row(0.42, P.wing[1], 11, 6, P.bars ? P.bars : alpha(mix(P.wing[1], L, 0.5), 0.45));
      fill(c, poly([bp(1.2, -34), bp(1.2, 20), bp(0.7, 20), bp(0.7, -34)]), lin(c, 0, w0[1], 0, w1[1], [[0, tone(P.wing[0], 0.12)], [0.5, P.wing[0]], [1, tone(P.wing[0], -0.2)]]));
      row(0.68, P.wing[0], 9, 6, P.bars ? P.bars : alpha(mix(P.wing[0], L, 0.5), 0.4));
      if (P.bars) row(0.86, P.wing[0], 7, 6, P.bars);
      c.save(); c.translate(1.2, 2.4); c.globalAlpha = 0.3; line(c, wing, tone(P.wing[0], 0.4), lw * 2); c.restore();
      if (age > 0.5) { const q = bp(-0.45, -12); c.fillStyle = alpha(P.dark, 0.5 * age); c.beginPath(); c.moveTo(q[0] - 3, q[1] - 5); c.lineTo(q[0] + 4, q[1] + 2); c.lineTo(q[0] - 4, q[1] + 6); c.fill(); }
    });
    line(c, wing, L, lw * 0.9);
  }
  if (!peek) foot(c, P, -5, Math.max(0, sa) * 5, st);
  headPaint(c, P, hc, hf, hRot, hk, st);
  if (peek) {
    const hole = typeof p.holeColor === 'string' ? p.holeColor : '#120c0a', oy = nb[1] + 12;
    c.fillStyle = lin(c, 0, oy - 20, 0, oy, [[0, alpha(hole, 0)], [0.7, alpha(hole, 0.75)], [1, alpha(hole, 0.95)]]);
    clipped(c, sil, () => c.fillRect(-120, oy - 20, 240, 24));
    c.restore();
  }
}

// ---------------------------------------------------------------- flight / landing
function flyPose(c, P, p, st, land) {
  const { t, lw, L, age } = st;
  const f = wrap(num(p.flap, t * (land ? 5.2 : 3.4) + hash(st.seed, 3)), 1), pitch = num(p.pitch, land ? 0.95 : 0.06);
  const cx0 = land ? -12 : 0, cy0 = (land ? -38 : 0) + (land ? 0 : Math.cos(TAU * (f - 0.1)) * 3);
  const ca = Math.cos(-pitch), sa = Math.sin(-pitch), rp = (x, y) => [cx0 + x * ca - y * sa, cy0 + x * sa + y * ca];
  let k, fold;
  if (land) { k = -0.8 + 0.18 * Math.cos(TAU * f); fold = 0.06; }
  else {
    const kc = -Math.cos(TAU * f), gl = c01(p.glide);
    k = lerp(kc < 0 ? kc : kc * 0.82, -0.2, gl); fold = (f > 0.5 ? Math.sin((f - 0.5) * TAU) * 0.55 : 0) * (1 - gl);
  }
  const fat = P.fat, hk = P.headK * 0.94;
  const body = blob([rp(-37, 1), rp(-20, -12.5 * fat), rp(4, -15.5 * fat), rp(26, -12.5), rp(35, 0), rp(25, 13), rp(0, 16.5 * fat), rp(-22, 11.5 * fat)]);
  const hc = rp(37, -4), hRot = -pitch * 0.2 + clamp(num(p.tilt), -1, 1) * 0.3 + 0.06 + st.sac * 0.08;
  const sil = union(body, capsule(...rp(22, -1), 14, hc[0], hc[1] + 2, 15 * hk), ...skullPath(hc, 1, hRot, hk, 0));
  const cdl = land ? [-(ca + 1) / 2, -sa / 2] : [-ca, -sa], cdn = Math.hypot(cdl[0], cdl[1]) || 1, cd = [cdl[0] / cdn, cdl[1] / cdn];
  const Ln = 98, C0 = 54, sN = rp(13, -7), sF = rp(19, -10), vw = land ? 0 : 0.27 * (1 - k * k), kN = k + vw, kF = k * 0.95 - vw;
  const farCols = kF > 0 ? [P.farUnder[0], P.farUnder[1], P.farUnder[1]] : P.farWing;
  const nearCols = kN < 0 ? [P.under[0], P.under[1], P.under[1]] : P.wing;
  // far wing
  spreadWing(c, { S: [sF[0] + (land ? 4 : 0), sF[1] - (land ? 2 : 0)], k: kF, fold, span: Ln * 0.96, C0, sweep: land ? -0.3 : 0.04, cd, cols: farCols,
    dk: tone(kF > 0 ? P.farUnder[1] : P.wingDark, -0.25), lw, L, age });
  // tail
  const wave = Math.sin(TAU * f - 1.2) * 0.05, ta = Math.atan2(-sa, -ca) + (land ? -0.32 : 0.05) + wave;
  tailFeathers(c, P, rp(-33, 1), ta, { len: P.tailLen * (1 - age * 0.06), lw, L, spread: land ? 0.15 : (P.tailLen < 50 ? 0.14 : 0.05), bend: land ? -0.2 : wave * 3 + 0.1, age, wk: land ? 1.25 : 1 });
  // legs
  if (land) {
    for (const far of [1, 0]) {
      const a = rp(-8 + far * 5, 13), e = [2 + far * 7, -1 - far * 1.5];
      c.lineCap = 'round';
      for (const [col, w] of [[L, 5 + lw], [P.feet, 4.2]]) {
        c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(e[0], e[1] - 5);
        c.moveTo(e[0], e[1] - 5); c.lineTo(e[0] + 8, e[1] - 6); c.moveTo(e[0], e[1] - 5); c.lineTo(e[0] + 6.5, e[1] + 0.5); c.moveTo(e[0], e[1] - 5); c.lineTo(e[0] - 4.5, e[1] + 1); c.stroke();
      }
      const th = capsule(a[0] - 2, a[1] - 4, 9, lerp(a[0], e[0], 0.45), lerp(a[1], e[1] - 5, 0.45), 4.5);
      fill(c, th, far ? P.farBody : P.dark); line(c, th, L, lw * 0.85);
    }
  } else {
    const q = rp(-13, 13.5), ft = oval(q[0], q[1], 6, 3.6, -pitch + 0.2);
    fill(c, ft, P.feet); line(c, ft, L, lw * 0.8);
  }
  // body + head
  const top = Math.min(hc[1] - 21 * hk, cy0 - 18), bot = cy0 + (land ? 30 : 18);
  fill(c, sil, lin(c, 0, top, 0, bot, [[0, P.light], [0.45, P.body], [1, P.dark]]));
  clipped(c, sil, () => {
    if (P.belly) { const q = rp(4, 10); c.fillStyle = rad(c, q[0], q[1], 34, [[0, P.belly], [0.6, alpha(P.belly, 0.8)], [1, alpha(P.belly, 0)]]); c.fillRect(q[0] - 34, q[1] - 34, 68, 68); }
    c.save(); c.translate(1.2, 2.6); c.globalAlpha = 0.36; line(c, sil, P.light, lw * 2.4); c.restore();
  });
  line(c, sil, L, lw);
  headPaint(c, P, hc, 1, hRot, hk, st);
  // near wing
  spreadWing(c, { S: sN, k: kN, fold, span: Ln, C0, sweep: land ? 0.4 : 0.18, cd, cols: nearCols, dk: kN < 0 ? tone(P.under[1], -0.18) : P.wingDark, lw, L, age });
}

function drawBird(c, p, key0) {
  p = p && typeof p === 'object' ? p : {};
  const key = typeof p.v === 'string' && BIRDS[p.v] ? p.v : key0, custom = p.v && typeof p.v === 'object';
  const age = c01(p.age), P = palette(custom ? null : key, custom ? { ...BIRDS[key0], ...p.v } : BIRDS[key], age);
  const s = Math.max(num(p.s, 1), 0.01), flip = num(p.flip, 1) < 0 ? -1 : 1, sz = num(P.size, 1) || 1;
  const pose = p.pose === 'fly' || p.pose === 'land' || p.pose === 'peek' ? p.pose : 'perch';
  const st = { t: num(p.t), seed: num(p.seed), lw: inkW(s * sz), L: P.line, M: MOODS[p.mood] || MOODS.neutral, age, idle: c01(p.idle, 1) };
  headState(p, P, st);
  c.save();
  c.translate(num(p.x), num(p.y)); c.scale(s * sz * flip, s * sz);
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (pose === 'fly' || pose === 'land') flyPose(c, P, p, st, pose === 'land');
  else perchPose(c, P, p, st, pose === 'peek');
  c.restore();
}

export function drawMacaw(c, p) { drawBird(c, { ...(p || {}), v: p && typeof p.v === 'object' ? p.v : 'macaw' }, 'macaw'); }
export function drawParrot(c, p) { drawBird(c, p, 'parakeet'); }

// ---------------------------------------------------------------- hawk
const HAWK = { body: '#efe3c8', dark: '#6b4c32', mid: '#a9825a', line: '#3a2819', tail: '#cf6b3a', tip: '#3d2c20' };
const HW_LE = [[10, 0], [20, 28], [27, 60], [25, 92]], HW_TIPS = [[21, 128], [7, 141], [-8, 142], [-22, 134], [-35, 120]], HW_TE = [[-37, 96], [-39, 64], [-33, 30], [-21, 0]];
function hawkWing(side, scl, lift, sweep) {
  const T = (q) => { const v = q[1] / 135; return [q[0] - v * v * sweep, side * q[1] * scl - lift * v * v]; };
  const pts = HW_LE.map(T);
  HW_TIPS.forEach((tp, i) => {
    pts.push(T(tp));
    if (i < HW_TIPS.length - 1) { const nx = HW_TIPS[i + 1]; pts.push([...T([lerp((tp[0] + nx[0]) / 2, -5, 0.6), lerp((tp[1] + nx[1]) / 2, 92, 0.6)]), 1]); }
  });
  for (const q of HW_TE) pts.push(T(q));
  return { path: blob(pts), T };
}
function hawkParts(bank, fl) {
  const ky = 0.76, lift = fl * 22, sq = 1 - Math.abs(fl) * 0.1; bank = clamp(bank - 0.3, -1.2, 1.2);
  const far = hawkWing(-1, ky * (1 + 0.36 * bank) * sq, lift, 20), near = hawkWing(1, ky * (1 - 0.36 * bank) * sq, lift, 14);
  const body = blob([[-30, 0], [-18, -8.5], [6, -11], [24, -8], [30, 0], [24, 8], [6, 11], [-18, 8.5]]);
  const tail = [];
  for (let i = 0; i < 7; i++) { const a = Math.PI + (i - 3) * 0.2; tail.push([-26 + Math.cos(a) * 46, Math.sin(a) * 46 * 0.92]); }
  const tailP = blob([[-24, -6, 1], ...tail.map((q, i) => (i === 0 || i === 6 ? [...q, 1] : q)), [-24, 6, 1]]);
  const head = circle(31, 0, 8.6);
  return { far, near, body, tailP, head };
}
let _hawkSil = null;

export function drawHawk(c, p) {
  p = p && typeof p === 'object' ? p : {};
  const s = Math.max(num(p.s, 1), 0.01), flip = num(p.flip, 1) < 0 ? -1 : 1, t = num(p.t), bank = clamp(num(p.bank), -1, 1);
  const fl = typeof p.flap === 'number' && isFinite(p.flap) ? Math.sin(TAU * p.flap) : Math.sin(t * 0.9) * 0.18;
  const H = HAWK, L = H.line, lw = inkW(s);
  const { far, near, body, tailP, head } = hawkParts(bank, fl);
  c.save();
  c.translate(num(p.x), num(p.y)); c.scale(s * flip, s); c.rotate(num(p.rot) + bank * 0.22 + Math.sin(t * 0.6) * 0.02);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // tail
  fill(c, tailP, lin(c, -26, 0, -72, 0, [[0, tone(H.tail, 0.25)], [0.72, H.tail], [0.8, H.tip], [0.9, H.tip], [0.93, '#f0dcc0'], [1, '#f0dcc0']]));
  c.strokeStyle = alpha(L, 0.3); c.lineWidth = lw * 0.5; c.beginPath();
  for (let i = 1; i < 6; i++) { const a = Math.PI + (i - 3) * 0.2; c.moveTo(-26, 0); c.lineTo(-26 + Math.cos(a) * 44, Math.sin(a) * 44 * 0.82); }
  c.stroke();
  line(c, tailP, L, lw);
  // wings (pale underside, dark tips, trailing band, patagial bar, barred flight feathers)
  for (const [w, shade] of [[far, -0.1], [near, 0]]) {
    const tipY = w.T([0, 135])[1];
    fill(c, w.path, lin(c, 0, 0, 0, tipY, [[0, tone(H.body, shade)], [0.7, tone(H.body, shade - 0.05)], [1, tone(H.mid, shade)]]));
    clipped(c, w.path, () => {
      fill(c, poly([w.T([40, 116]), w.T([40, 160]), w.T([-60, 160]), w.T([-60, 100]), w.T([-20, 110])]), alpha(H.tip, 0.9));
      c.strokeStyle = alpha(H.tip, 0.75); c.lineWidth = 7; c.beginPath(); [[-22, -2], [-34, 30], [-40, 64], [-38, 96], [-34, 116]].forEach((q, i) => { const a = w.T(q); if (i) c.lineTo(a[0], a[1]); else c.moveTo(a[0], a[1]); }); c.stroke();
      c.strokeStyle = alpha(H.dark, 0.85); c.lineWidth = 6.5; c.beginPath(); [[14, 8], [22, 32], [27, 60]].forEach((q, i) => { const a = w.T(q); if (i) c.lineTo(a[0], a[1]); else c.moveTo(a[0], a[1]); }); c.stroke();
      c.strokeStyle = alpha(H.mid, 0.55); c.lineWidth = 1.6;
      for (const dx of [-4, -11, -18]) { c.beginPath(); [[dx + 2, 8], [dx, 45], [dx, 85], [dx + 5, 112]].forEach((q, i) => { const a = w.T(q); if (i) c.lineTo(a[0], a[1]); else c.moveTo(a[0], a[1]); }); c.stroke(); }
      c.strokeStyle = alpha(L, 0.22); c.lineWidth = lw * 0.5; c.beginPath();
      for (let i = 1; i < 10; i++) { const a = w.T([lerp(-21, -36, i / 10) + 18, i * 11]), b = w.T([lerp(-21, -38, i / 10), i * 10.5]); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
      c.stroke();
    });
    line(c, w.path, L, lw);
  }
  // body + head
  fill(c, body, lin(c, 0, -10, 0, 10, [[0, tone(H.body, 0.05)], [1, tone(H.body, -0.14)]]));
  clipped(c, body, () => { c.fillStyle = alpha(H.dark, 0.55); for (const [bx, by] of [[2, -4], [-3, 3], [6, 4], [-8, -2], [0, 0], [9, -1], [-5, 6]]) { c.beginPath(); c.ellipse(bx, by, 2.6, 1.1, 0, 0, TAU); c.fill(); } });
  line(c, body, L, lw);
  fill(c, head, lin(c, 0, -8, 0, 8, [[0, H.mid], [1, H.dark]])); line(c, head, L, lw);
  const bk = blob([[37, -3.5], [43, -2], [46.5, 3, 1], [42, 2.5], [37.5, 3.5]]);
  fill(c, bk, '#f2c94c'); clipped(c, bk, () => { c.fillStyle = '#40342c'; c.fillRect(42, -6, 8, 12); }); line(c, bk, L, lw * 0.8);
    c.fillStyle = '#f6d24a'; c.beginPath(); c.arc(34.5, 2.6, 1.9, 0, TAU); c.fill();
  c.fillStyle = '#1c130e'; c.beginPath(); c.arc(34.8, 2.6, 1.1, 0, TAU); c.fill();
  c.restore();
}

export function hawkShadow(c, x, y, s = 1, a = 0.28, rot = 0) {
  a = num(a, 0.28); if (a <= 0) return;
  if (!_hawkSil) { const h = hawkParts(0, 0); _hawkSil = union(h.far.path, h.near.path, h.body, h.tailP, h.head); }
  s = Math.max(num(s, 1), 0.01);
  c.save();
  c.translate(num(x), num(y)); c.scale(s, s * 0.7); c.rotate(num(rot));
  c.fillStyle = `rgba(8,14,10,${(a * 0.36).toFixed(3)})`; c.lineJoin = 'round';
  for (const k of [1.14, 1.07, 1]) { c.save(); c.scale(k, k); c.fill(_hawkSil); c.restore(); }
  c.restore();
}

// ---------------------------------------------------------------- pigeon
const PIGEONS = {
  blue: { body: '#93a0b2', dark: '#667387', light: '#c3ccd8', head: '#5f6c80', line: '#262c3a', bar: '#33394a', tail: '#56627a' },
  dark: { body: '#6a7486', dark: '#454e60', light: '#929cae', head: '#48515f', line: '#1e222c', bar: '#2a2f3c', tail: '#3f4758' },
  pale: { body: '#dcdcdc', dark: '#aeb0b6', light: '#f7f7f5', head: '#c6c8cc', line: '#3a3c44', bar: '#8a8e98', tail: '#b4b6bc' },
  red: { body: '#c79a84', dark: '#9a6d5a', light: '#e6c6b4', head: '#a4705c', line: '#3c241c', bar: '#7c4a3a', tail: '#ab8270' },
};
const PIG_KEYS = ['blue', 'blue', 'dark', 'blue', 'pale', 'red'];
const PIG_BEAK = blob([[6.5, -2.2], [12, -1.6], [16.5, 0.8, 1], [12, 2.2], [6.5, 2.6]]);

export function drawPigeon(c, p) {
  p = p && typeof p === 'object' ? p : {};
  const s = Math.max(num(p.s, 1), 0.01), flip = num(p.flip, 1) < 0 ? -1 : 1, t = num(p.t), seed = num(p.seed);
  const V = PIGEONS[p.v] || PIGEONS[PIG_KEYS[Math.floor(hash(seed, 41) * PIG_KEYS.length) % PIG_KEYS.length]];
  const L = V.line, lw = inkW(s * 0.5), fly = p.pose === 'fly';
  c.save();
  c.translate(num(p.x), num(p.y)); c.scale(s * flip, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // peck / walk state
  let q = 0;
  if (p.pose === 'peck') { const k = t * 0.9 + hash(seed, 7) * 5, ph = k - Math.floor(k); q = ph < 0.56 ? Math.pow(Math.max(0, Math.sin(ph / 0.56 * TAU * 1.5 - 0.3)), 0.6) : 0; }
  const hasW = typeof p.walk === 'number' && isFinite(p.walk), wp = hasW ? wrap(p.walk, 1) : 0;
  const sk = t * 0.8 + hash(seed, 11) * 10, si = Math.floor(sk), sac = lerp(hash(si, seed + 21) - 0.5, hash(si + 1, seed + 21) - 0.5, ss(0.84, 0.96, sk - si));
  const pitch = fly ? num(p.pitch, 0.2) : 0, f = wrap(num(p.flap, t * 5 + hash(seed, 3)), 1);
  const oy = fly ? 24 + Math.cos(TAU * (f - 0.1)) * 1.6 : 0, ox = fly ? 2 : 0;
  const rot = fly ? -pitch : q * 0.34, ca = Math.cos(rot), sa = Math.sin(rot), px0 = fly ? -2 : 2, py0 = fly ? -24 : 0;
  const R = (x, y) => [px0 + (x - px0) * ca - (y - py0) * sa + ox, py0 + (x - px0) * sa + (y - py0) * ca + oy];
  const breath = Math.sin(t * 2.6 + seed) * 0.5;
  const body = blob([R(-23, -21), R(-10, -34), R(6, -36.5 - breath * 0.3), R(18, -29), R(21, -17), R(11, -8 + breath * 0.4), R(-6, -7.5), R(-18, -12)]);
  const bob = hasW ? (wp % 0.5) / 0.5 : 0, thrust = hasW ? lerp(-3.5, 4, ss(0.55, 0.95, bob)) : 0;
  const hu = R(20.5 + thrust + sac * 1.2, -47 + (fly ? 5 : 0)), hd = [28 + ox, -7.5 + oy];
  const hc = fly ? R(27, -36) : [lerp(hu[0], hd[0], q), lerp(hu[1], hd[1], q)];
  const hRot = fly ? -pitch * 0.4 + 0.1 : q * 1.05 + sac * 0.12;
  const nk = R(13, -27), head = circle(hc[0], hc[1], 8.8);
  const sil = union(body, capsule(nk[0], nk[1], 10.5, hc[0], hc[1], 7.6), head);
  if (!fly && num(p.shadow, 0.3) > 0) shadow(c, 0, 1, 30, 5, num(p.shadow, 0.3));
  // tail
  const tr = R(-18, -18), tdir = Math.atan2(R(-44, -9)[1] - tr[1], R(-44, -9)[0] - tr[0]);
  const tw = fly ? 0.42 : 0.2, tl = 27, tp = (a, l) => [tr[0] + Math.cos(tdir + a) * l, tr[1] + Math.sin(tdir + a) * l];
  const tail = blob([[...tp(-1.5, 7), 1], tp(-tw, tl), tp(0, tl + 1.5), tp(tw, tl), [...tp(1.5, 7), 1]]);
  fill(c, tail, lin(c, tr[0], tr[1], ...tp(0, tl), [[0, V.tail], [0.68, V.tail], [0.72, V.bar], [0.92, V.bar], [0.95, V.tail]])); line(c, tail, L, lw);
  if (fly) {
    const k0 = -Math.cos(TAU * f) * (f < 0.25 || f > 0.75 ? 1 : 0.85);
    spreadWing(c, { S: R(10, -31), k: k0 * 0.95 - 0.27 * (1 - k0 * k0), fold: f > 0.5 ? Math.sin((f - 0.5) * TAU) * 0.5 : 0, span: 52, C0: 32, sweep: 0.03,
      cols: [tone(V.body, -0.2), tone(V.body, -0.25), tone(V.dark, -0.2)], dk: tone(V.bar, -0.1), lw, L });
    const ft = oval(...R(-6, -8), 4.5, 2.6, 0.3); fill(c, ft, '#d9605a'); line(c, ft, L, lw * 0.7);
  } else {
    // legs
    for (const far of [1, 0]) {
      const ph = hasW ? wrap(wp + far * 0.5, 1) : 0.25, sw = hasW ? (ph < 0.5 ? lerp(6, -6, ph * 2) : lerp(-6, 6, ss(0, 1, (ph - 0.5) * 2))) : 0;
      const lift = hasW && ph > 0.5 ? Math.sin((ph - 0.5) * TAU) * 4 : 0, fx = (far ? 5 : -3) + sw, fy = -lift;
      c.strokeStyle = far ? '#b8463f' : '#e0625a'; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(far ? 4 : -2, -9); c.lineTo(fx, fy - 1.2); c.moveTo(fx, fy - 1.2); c.lineTo(fx + 6.5, fy); c.moveTo(fx, fy - 1.2); c.lineTo(fx + 4.5, fy + 1.2); c.moveTo(fx, fy - 1.2); c.lineTo(fx - 4, fy + 0.4); c.stroke();
    }
  }
  fill(c, sil, lin(c, 0, hc[1] - 9, 0, oy - 6, [[0, V.light], [0.5, V.body], [1, V.dark]]));
  clipped(c, sil, () => {
    c.fillStyle = rad(c, hc[0], hc[1], 13, [[0, V.head], [0.75, V.head], [1, alpha(V.head, 0)]]); c.fillRect(hc[0] - 14, hc[1] - 14, 28, 28);
    const m = [lerp(nk[0], hc[0], 0.45), lerp(nk[1], hc[1], 0.45)];
    c.fillStyle = rad(c, m[0] + 1, m[1], 12, [[0, 'rgba(70,190,140,0.85)'], [0.5, 'rgba(150,90,190,0.6)'], [1, 'rgba(150,90,190,0)']]); c.fillRect(m[0] - 13, m[1] - 13, 26, 26);
    c.fillStyle = lin(c, 0, oy - 16, 0, oy - 5, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.4), 0.5)]]); c.fillRect(-60, oy - 16, 120, 14);
    c.save(); c.translate(0.8, 1.6); c.globalAlpha = 0.36; line(c, sil, V.light, lw * 2.2); c.restore();
  });
  line(c, sil, L, lw);
  if (fly) {
    const k0 = -Math.cos(TAU * f) * (f < 0.25 || f > 0.75 ? 1 : 0.85), kk = k0 + 0.27 * (1 - k0 * k0);
    spreadWing(c, { S: R(7, -29), k: kk, fold: f > 0.5 ? Math.sin((f - 0.5) * TAU) * 0.5 : 0, span: 54, C0: 33, sweep: 0.16,
      cols: kk < 0 ? [V.light, tone(V.light, -0.06), tone(V.body, 0.1)] : [V.body, V.bar, V.body], dk: V.dark, lw, L });
  } else {
    const wing = blob([R(10, -31), R(0, -34.5), R(-14, -31), R(-27, -22), [...R(-39, -14), 1], R(-26, -13), R(-10, -13), R(4, -17), R(11, -24)]);
    fill(c, wing, lin(c, 0, -36, 0, -12, [[0, tone(V.light, -0.02)], [1, tone(V.body, 0.04)]]));
    clipped(c, wing, () => {
      c.strokeStyle = V.bar; c.lineWidth = 3.6;
      for (const dx of [-11, -19]) { c.beginPath(); c.moveTo(...R(dx, -34)); c.quadraticCurveTo(...R(dx - 5, -24), ...R(dx - 3, -10)); c.stroke(); }
      fill(c, poly([R(-25, -30), R(-44, -22), R(-44, -8), R(-27, -10)]), V.bar);
    });
    line(c, wing, L, lw * 0.9);
  }
  // face
  c.save();
  c.translate(hc[0], hc[1]); c.rotate(hRot);
  fill(c, PIG_BEAK, '#4a4650'); line(c, PIG_BEAK, L, lw * 0.75);
  const cere = oval(8.2, -1.6, 2.6, 1.9, 0.2); fill(c, cere, '#f3f0ea'); line(c, cere, L, lw * 0.6);
  eye(c, { x: 1.6, y: -1.8, r: 3.5, look: Array.isArray(p.look) ? p.look : [0.2 + sac * 0.6, 0], iris: '#f08c2c', irisR: 0.86, white: '#f6c890', lid: blink(t, seed + 3, 4.4), lidColor: V.head,
    line: L, lw: lw * 0.75 });
  c.restore();
  c.restore();
}

// ---------------------------------------------------------------- flock
const FLOCK_COLS = [['#58b33e', '#2f8a3a', '#3f9fb8'], ['#7fca48', '#3f9a3a', '#e8c531'], ['#e2412f', '#2d66cc', '#c92d2a'], ['#5fae3c', '#2a7a44', '#e0483a']];
const _flock = new Map();
export function flock(c, o) {
  o = o && typeof o === 'object' ? o : {};
  const x = num(o.x), y = num(o.y), w = Math.max(num(o.w, 1920), 1), h = Math.max(num(o.h, 400), 1);
  const n = clamp(Math.round(num(o.n, 80)), 0, 400), t = num(o.t), seed = num(o.seed, 1);
  const dir = num(o.dir, 1) < 0 ? -1 : 1, speed = num(o.speed, 170), size = Math.max(num(o.size, 1), 0.05);
  const spread = c01(o.spread, 0.6), wheel = c01(o.wheel);
  const cols = Array.isArray(o.colors) && o.colors.length ? o.colors.map((q) => (Array.isArray(q) ? q : [q, q, q])) : FLOCK_COLS;
  if (!n) return;
  const id = `${seed}:${n}`;
  let B = _flock.get(id);
  if (!B) { const r = RNG(seed * 7 + 13); B = new Float32Array(n * 6); for (let i = 0; i < n * 6; i++) B[i] = r(); if (_flock.size > 64) _flock.clear(); _flock.set(id, B); }
  const pad = 26 * size, W = w + pad * 2, band = lerp(0.2, 1, spread), om = (speed / (w * 0.36)) * dir;
  const paths = cols.map(() => [new Path2D(), new Path2D(), new Path2D()]);
  const out = [0, 0];
  const pos = (i, tt) => {
    const j = i * 6, u = B[j], v = B[j + 1], r3 = B[j + 4];
    let sx = 0, sy = 0, wx = 0, wy = 0;
    if (wheel < 1) {
      sx = u * W + dir * speed * (0.92 + 0.16 * r3) * tt;
      const g = sx / w;
      sy = h * 0.5 + noise1(g * 1.7 - dir * tt * 0.1, seed) * h * 0.24 * (1 - spread * 0.4) + noise1(g * 4.1 + tt * 0.17, seed + 9) * h * 0.07
        + (v - 0.5) * h * band * (0.7 + 0.3 * noise1(g * 2.3 - dir * tt * 0.22, seed + 4)) + noise1(tt * 0.6 + i * 1.37, seed + 2) * 7 * size;
    }
    if (wheel > 0) {
      const rr = (0.3 + 0.7 * Math.sqrt(v)) * lerp(0.45, 1, spread) * (1 + 0.16 * noise1(tt * 0.33 + i * 0.41, seed + 6));
      const a = u * TAU + om * tt * (0.9 + 0.2 * r3) + noise1(tt * 0.2, seed + 8) * 0.5;
      wx = w * 0.5 + Math.cos(a) * rr * w * 0.46; wy = h * 0.5 + Math.sin(a) * rr * h * 0.44 + noise1(tt * 0.5 + i, seed + 2) * 6 * size;
    }
    out[0] = lerp(sx, wx, wheel); out[1] = lerp(sy, wy, wheel);
  };
  for (let i = 0; i < n; i++) {
    const j = i * 6;
    pos(i, t + 0.08); const x1 = out[0], y1 = out[1];
    pos(i, t); let X = out[0]; const Y = clamp(out[1], -pad, h + pad);
    const vx = x1 - X, vy = y1 - out[1];
    if (wheel < 1) X = wrap(X + pad * wheel, W) - pad;
    const fl = Math.abs(vx) < 0.02 ? dir : (vx < 0 ? -1 : 1), ang = clamp(Math.atan2(vy, Math.abs(vx) + 1e-3), -1.25, 1.25);
    const z = size * (0.72 + 0.56 * B[j + 3]), ca = Math.cos(ang) * z, sa = Math.sin(ang) * z;
    const k = Math.sin(t * (9 + 4 * B[j + 5]) + B[j + 2] * TAU), ak = Math.abs(k);
    const px = x + X, py = y + Y, P3 = paths[Math.floor(B[j + 4] * 97.3 + i) % cols.length];
    const mv = (pt, lx, ly) => pt.moveTo(px + fl * (lx * ca - ly * sa), py + lx * sa + ly * ca);
    const ln = (pt, lx, ly) => pt.lineTo(px + fl * (lx * ca - ly * sa), py + lx * sa + ly * ca);
    // far wing + tail (path 0), body (1), near wing (2)
    const p0 = P3[0], p1 = P3[1], p2 = P3[2];
    mv(p0, 4.6, -0.8); ln(p0, 0.6 - 2 * ak, -k * 9 - 1.2); ln(p0, -2.2 - ak, -k * 5); ln(p0, -2, -0.2); p0.closePath();
    mv(p0, -4.5, -1.2); ln(p0, -15, 0.4); ln(p0, -4.5, 1.3); p0.closePath();
    mv(p1, 7.4, -0.4); ln(p1, 6.6, -2.3); ln(p1, 3.4, -2.9); ln(p1, -3, -2.2); ln(p1, -6.5, -0.4); ln(p1, -3, 2); ln(p1, 3, 2.6); ln(p1, 6.8, 1.6); p1.closePath();
    mv(p2, 3.4, -0.4); ln(p2, -1.4 - 2 * ak, -k * 10.5); ln(p2, -4.2 - ak, -k * 6); ln(p2, -3.4, 0.4); p2.closePath();
  }
  for (let q = 0; q < cols.length; q++) {
    c.fillStyle = cols[q][2]; c.fill(paths[q][0]);
    c.fillStyle = cols[q][0]; c.fill(paths[q][1]);
    c.fillStyle = cols[q][1]; c.fill(paths[q][2]);
  }
}

// ---------------------------------------------------------------- butterfly
const BF_FORE = blob([[0, -1.5], [3.5, -9], [10.5, -11], [13, -5.5], [7, -0.5], [0.5, 1]]);
const BF_HIND = blob([[0.5, 0], [7.5, 0.5], [10.5, 5.5], [6.5, 10], [1.5, 6]]);
export function drawButterfly(c, o) {
  o = o && typeof o === 'object' ? o : {};
  const s = Math.max(num(o.s, 1), 0.01), t = num(o.t), seed = num(o.seed), col = typeof o.color === 'string' ? o.color : '#f29a2e';
  const ph = typeof o.flap === 'number' && isFinite(o.flap) ? o.flap : t * 6.5 + hash(seed, 1) * 7 + noise1(t * 1.3, seed) * 0.4;
  const open = lerp(0.14, 1, Math.pow(0.5 + 0.5 * Math.cos(TAU * ph), 0.8)), dk = tone(col, -0.62), lw = inkW(s * 0.4) * 0.6;
  c.save();
  c.translate(num(o.x), num(o.y) + Math.sin(TAU * ph) * 1.2 * s); c.scale(s, s); c.rotate(num(o.rot, noise1(t * 0.7, seed + 2) * 0.35));
  c.lineJoin = 'round'; c.lineCap = 'round';
  for (const side of [-1, 1]) {
    c.save(); c.scale(side * open, 1);
    for (const [wp, a] of [[BF_HIND, tone(col, -0.08)], [BF_FORE, col]]) {
      fill(c, wp, a);
      clipped(c, wp, () => { line(c, wp, dk, 3.4); c.fillStyle = tone(col, 0.45); c.beginPath(); c.arc(9.6, -8.2, 1, 0, TAU); c.arc(8.8, 6, 0.9, 0, TAU); c.fill(); });
      line(c, wp, dk, lw);
    }
    c.strokeStyle = alpha(dk, 0.5); c.lineWidth = 0.5; c.beginPath(); c.moveTo(1, -1); c.lineTo(9, -7); c.moveTo(1, -0.5); c.lineTo(10.5, -4); c.moveTo(1, 1); c.lineTo(7.5, 5.5); c.stroke();
    c.restore();
  }
  fill(c, capsule(0, -4.5, 1.5, 0, 6, 1), dk);
  c.strokeStyle = dk; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-0.5, -5.5); c.quadraticCurveTo(-2, -9, -3.6, -10.5); c.moveTo(0.5, -5.5); c.quadraticCurveTo(2, -9, 3.6, -10.5); c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- nest
const _nest = new Map();
const STICKS = ['#4d3520', '#6f4d2e', '#8f683c', '#ad8350'];
function nestGeo(seed) {
  let G = _nest.get(seed);
  if (G) return G;
  const r = RNG(seed * 3 + 5), back = STICKS.map(() => new Path2D()), front = STICKS.map(() => new Path2D());
  const stick = (set, cx, cy, a, l) => {
    const p = set[r.int(0, 3)], dx = Math.cos(a) * l / 2, dy = Math.sin(a) * l / 2, bx = r.range(-3, 3), by = r.range(-3, 3);
    p.moveTo(cx - dx, cy - dy); p.quadraticCurveTo(cx + bx, cy + by, cx + dx, cy + dy);
  };
  for (let i = 0; i < 16; i++) stick(back, r.range(-34, 34), r.range(-33, -25), r.range(-0.5, 0.5), r.range(20, 40));
  for (let i = 0; i < 60; i++) {
    const v = r(), yy = lerp(-27, -3, v), half = lerp(43, 24, v * v), xx = r.range(-half, half);
    stick(front, xx, yy, (xx / 60) * 0.9 + r.range(-0.45, 0.45), r.range(18, 42) * lerp(1, 0.7, v));
  }
  for (let i = 0; i < 8; i++) { const sd = r.sign(); stick(front, sd * r.range(30, 42), r.range(-28, -14), sd * r.range(-0.9, -0.2), r.range(16, 30)); }
  G = { back, front };
  if (_nest.size > 40) _nest.clear();
  _nest.set(seed, G);
  return G;
}
const NEST_BOWL = blob([[-45, -27], [-40, -12], [-26, -2], [0, 1], [26, -2], [40, -12], [45, -27], [22, -22], [0, -20.5], [-22, -22]]);
export function drawNest(c, o) {
  o = o && typeof o === 'object' ? o : {};
  const s = Math.max(num(o.s, 1), 0.01), seed = num(o.seed), eggs = clamp(Math.round(num(o.eggs)), 0, 4), G = nestGeo(seed), L = '#2e1f12';
  c.save();
  c.translate(num(o.x), num(o.y)); c.scale(s, s);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const lw = inkW(s);
  fill(c, oval(0, -26, 41, 9), '#2a1c10');
  c.lineWidth = 2.6; G.back.forEach((p, i) => { c.strokeStyle = tone(STICKS[i], -0.3); c.stroke(p); });
  for (let i = 0; i < eggs; i++) {
    const ex = (i - (eggs - 1) / 2) * 15 + (hash(i, seed) - 0.5) * 3, e = oval(ex, -28.5, 7.6, 9.6, (hash(i, seed + 2) - 0.5) * 0.7);
    fill(c, e, lin(c, 0, -38, 0, -19, [[0, '#fffdf6'], [0.6, '#f1eadb'], [1, '#cfc4ae']])); line(c, e, '#6a5a44', lw * 0.8);
  }
  line(c, NEST_BOWL, L, lw * 2 + 3);
  fill(c, NEST_BOWL, lin(c, 0, -27, 0, 1, [[0, '#7a5632'], [1, '#43301c']]));
  c.lineWidth = 4.4; c.strokeStyle = L; for (const p of G.front) c.stroke(p);
  c.lineWidth = 2.8; G.front.forEach((p, i) => { c.strokeStyle = STICKS[i]; c.stroke(p); });
  c.fillStyle = lin(c, 0, -14, 0, 2, [[0, 'rgba(30,18,8,0)'], [1, 'rgba(30,18,8,0.45)']]); c.fill(NEST_BOWL);
  c.restore();
}
