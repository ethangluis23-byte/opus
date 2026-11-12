// Human rig: side-view body with a three-quarter head, flat-vector like the dog. Humans exist only in scene 1.
// Units: an adult is ~330 tall at s = 1 (boy 215, girl 195). (x, y) = ground point between the feet (under the seat
// when sitting). flip 1 = facing right, -1 = left. "R" is the NEAR arm (drawn in front), "L" the far arm.
//
// PEOPLE            presets for `who`: boy, girl, mom, dad, grandma, jogger, walkerA, walkerB, walkerC, waiter.
//                   `who` may also be an object, e.g. {...PEOPLE.mom, top: '#c33', hairC: '#222'} (keep it a constant).
// drawHuman(c, {
//   who, x, y, s, flip, t, seed,
//   pose,           'stand' | 'walk' | 'run' | 'sit' | 'throw' | 'kneel' | 'crouch', or [from, to, k] to blend
//   phase,          walk / run cycle phase in cycles: advance by distance / humanStride(who, s, pose). Feet do not slide.
//   seat,           sit: seat height in character units (world px / s); default = knee height. Feet dangle if higher.
//   k,              throw: 0..1 wind-up (0-0.42) -> release at THROW_RELEASE (0.52) -> follow-through. Near hand throws.
//   handR, handL,   [x, y] WORLD-space target the hand reaches (two-bone IK, clamped to arm length): leash, seed, petting
//   wave,           0..1 raises an arm and waves it (from t). Uses R, or L when R is busy (handR / hold).
//   hold,           'cup' | 'ball' | 'phone' | null — item in the R hand (cup / phone also raise the forearm)
//   look,           [x, y] eye direction -1..1 (y also nods the head a little); headTilt radians
//   smile,          0..1 (default 0.5; above 0.7 the mouth opens)
//   vanish,         0 normal .. 1 gone: pale gold silhouette that breaks up top-down into rising motes (seeded)
//   shadow,         ground shadow strength (default 1, 0 = none)
// })
// handPos(p)        same options -> {R: [x, y], L: [x, y], head: [x, y], top: y, footR, footL (ankles)} in WORLD space:
//                   attach a leash, ball, carrot or seed to a hand. THROW_RELEASE = 0.52 is the k at which the ball leaves.
// humanStride(who, s, gait)   world distance per cycle for gait 'walk' | 'run'
// drawVanishFx(c, {x, y, s, k, seed, h})   emissive glow + sparkles, draw AFTER g.grade for each person; h = height
//                   in units (default 330; humanHeight(who) gives it). Peaks near k 0.35, nothing at k = 0 or 1.
// drawCyclist(c, {x, y, s, flip, t, phase, who, vanish, tilt, fall, color, seed})   (x, y) = ground under the bike
//                   centre; phase = pedal turns: advance by distance / bikeStride(s, who). vanish dissolves the
//                   rider only. tilt (radians) rotates bike + rider about the ground contact.
// drawBike(c, {x, y, s, flip, tilt, phase, fall, color, shadow})   riderless bike. fall 0..1 lays it flat on the
//                   ground (side-view squash) — nicer than tilt for a bike toppling over.
import { TAU, clamp, lerp, ss, ease, K, hash, tone, mix, alpha, invLerp, wrap } from '../engine/util.js';
import { blob, capsule, circle, oval, rrect, lin, glow, shadow, ik2 } from '../engine/draw.js';
import { Path2D } from '@napi-rs/canvas';
import { eye, blink, inkW } from './rig.js';

const BASE = { h: 330, skin: '#f0bd94', hair: 'short', hairC: '#4a2f1e', top: '#4a6fb0', sleeve: 'long', bottom: 'pants',
  bot: '#3a4560', shoe: '#efe9dd', eye: '#5a3a22', build: 1 };

export const PEOPLE = {
  boy: { h: 215, skin: '#f4c39c', hair: 'messy', hairC: '#7a4a22', top: '#e5483c', detail: 'stripes', stripe: '#fff1dc', sleeve: 'short',
    bottom: 'shorts', bot: '#3d5f9e', shoe: '#f3efe6', eye: '#3f7a4a' },
  girl: { h: 195, skin: '#b9774a', hair: 'pigtails', hairC: '#2f1d16', tie: '#ffd24a', top: '#f4b63a', sleeve: 'short', bottom: 'dress',
    skirtLen: 0.85, shoe: '#d9465a', eye: '#4a2c18' },
  mom: { h: 318, skin: '#f1c09a', hair: 'long', hairC: '#9a4f2a', top: '#3aa39b', sleeve: 'long', bottom: 'pants', bot: '#2f4c80',
    shoe: '#ece4d4', eye: '#3f7f8f', build: 0.94, lips: '#c9505a' },
  dad: { h: 340, skin: '#c58d60', hair: 'short', hairC: '#2a211c', beard: 1, top: '#5a9150', sleeve: 'short', bottom: 'pants',
    bot: '#b99c70', shoe: '#5c3f2c', build: 1.1 },
  grandma: { h: 298, skin: '#efc6a6', hair: 'bun', hairC: '#d3d6da', glasses: 1, top: '#b25a80', detail: 'cardigan', inner: '#f6ecd8',
    sleeve: 'long', bottom: 'skirt', bot: '#525a7c', skirtLen: 1.5, shoe: '#6e4c3a', stoop: 0.07, build: 1.06, eye: '#5a6a7a' },
  jogger: { h: 326, skin: '#8b5737', hair: 'ponytail', hairC: '#1e1815', band: '#f4f0e6', top: '#ff6f4d', sleeve: 'none',
    bottom: 'shorts', bot: '#252a3d', shoe: '#c9ee4a', build: 0.92, lips: '#a8454a' },
  walkerA: { h: 334, skin: '#eab88f', hair: 'short', hairC: '#d9b266', top: '#4b70b2', detail: 'hood', sleeve: 'long', bottom: 'pants',
    bot: '#3b4052', shoe: '#f0ebe0', eye: '#4a78a8' },
  walkerB: { h: 314, skin: '#a66b45', hair: 'curly', hairC: '#2b1d17', top: '#e8a33c', sleeve: 'long', bottom: 'skirt', bot: '#7b3f6f',
    skirtLen: 0.95, shoe: '#3a2c33', build: 0.95, lips: '#a3404c' },
  walkerC: { h: 328, skin: '#f2c9a9', hair: 'thin', hairC: '#b9bcc0', hat: '#6e7567', mustache: 1, top: '#8c7050', coat: 0.7,
    sleeve: 'long', bottom: 'pants', bot: '#4b505a', shoe: '#3c2e26', stoop: 0.04, build: 1.08, eye: '#5a6a7a' },
  waiter: { h: 324, skin: '#dca97d', hair: 'short', hairC: '#3b2a1f', top: '#f4f0e7', sleeve: 'long', detail: 'bowtie', bottom: 'pants',
    bot: '#22263a', apron: '#333950', shoe: '#1d1f2a', build: 0.95 },
};

export const THROW_RELEASE = 0.52;
const MONO = '#fff1c6';
const GAIT = { walk: { duty: 0.62, dist: 0.62, lift: 0.05, roll: 0.5, heel: 0.22, kick: 0.1 },
  run: { duty: 0.36, dist: 1.05, lift: 0.15, roll: 0.75, heel: 0.05, kick: 0.55 } };
// bicycle geometry for a 330-unit rider (scaled by rider height)
const BK = { R: 58, rx: -98, fx: 98, bbx: -10, bby: -50, crank: 24, seat: [-40, -164], bar: [74, -192], gear: 2.4 };

const lineOf = (col) => mix(tone(col, -0.6), '#3a2030', 0.18);
const mk = (col) => { const ln = lineOf(col); return { c: col, l: tone(col, 0.2), d: mix(col, ln, 0.3), ln, far: mix(col, ln, 0.18) }; };
const MK_MONO = { c: MONO, l: MONO, d: MONO, ln: MONO, far: MONO };

const DIM = new WeakMap();
function dims(who) {
  const key = (typeof who === 'string' ? PEOPLE[who] : who && typeof who === 'object' ? who : null) || PEOPLE.walkerA;
  let D = DIM.get(key);
  if (D) return D;
  const V = { ...BASE, ...key };
  const H = V.h > 20 ? V.h : 330, kid = clamp((300 - H) / 110), bw = V.build ?? 1, chub = lerp(1, 1.1, kid);
  const hr = V.head ?? H * lerp(0.112, 0.148, kid);
  const leg = H * (V.legK ?? lerp(0.47, 0.42, kid)), ank = H * 0.035, neck = H * 0.022;
  const torso = H - leg - neck - hr * 1.86, thigh = (leg - ank) * 0.5075;
  const skirtCol = V.bottom === 'dress' ? V.top : V.bottom === 'skirt' ? V.bot : V.apron ? V.apron : V.coat ? V.top : null;
  const pal = { skin: mk(V.skin), hair: mk(V.hairC), top: mk(V.top), bot: mk(V.bot ?? V.top), shoe: mk(V.shoe),
    skirt: mk(skirtCol ?? V.top), hat: mk(V.hat || '#666666'), item: null };
  const mono = { skin: MK_MONO, hair: MK_MONO, top: MK_MONO, bot: MK_MONO, shoe: MK_MONO, skirt: MK_MONO, hat: MK_MONO };
  D = { V, H, kid, hr, leg, ank, neck, torso, thigh, shin: thigh, l1: H * lerp(0.165, 0.15, kid), l2: H * lerp(0.155, 0.14, kid),
    rS: H * 0.08 * bw * chub, rW: H * 0.072 * bw * chub, rT: H * 0.051 * bw * chub, rK: H * 0.039 * chub, rA: H * 0.029 * chub,
    rU: H * 0.036 * chub, rE: H * 0.03 * chub, rWr: H * 0.025 * chub, rH: H * 0.031 * chub, footL: H * 0.14 * lerp(1, 1.12, kid),
    pants: V.bottom === 'pants', shorts: V.bottom === 'shorts', hasSkirt: !!skirtCol,
    skirtLen: (V.bottom === 'dress' || V.bottom === 'skirt') ? (V.skirtLen ?? 0.9) : V.apron ? 0.92 : (V.coat ?? 0.7), pal, mono };
  DIM.set(key, D);
  return D;
}

export const humanHeight = (who) => dims(who).H;
export function humanStride(who, s = 1, gait = 'walk') { return dims(who).H * (GAIT[gait] || GAIT.walk).dist * s; }
export function bikeStride(s = 1, who = 'walkerA') { return BK.gear * TAU * BK.R * (dims(who).H / 330) * s; }

// ---------------------------------------------------------------- skeleton
const fk = (D, a, b) => [D.l1 * Math.sin(a) + D.l2 * Math.sin(a + b), D.l1 * Math.cos(a) + D.l2 * Math.cos(a + b)];
const shoulderOf = (D, hx, hy, lean) => [hx + Math.sin(lean) * (D.torso - D.rS), hy - Math.cos(lean) * (D.torso - D.rS)];
// ankle position of a foot whose flat ground position is fx, rolled onto the toe by r radians
function rolled(D, fx, r) {
  const piv = D.footL * 0.55, cs = Math.cos(r), sn = Math.sin(r);
  return [fx + piv - piv * cs + D.ank * sn, -piv * sn - D.ank * cs];
}
// [ankleX, ankleY, footRot, inStance] for a cycle phase
function foot(phase, g, D) {
  const ph = wrap(phase), sw = g.duty * g.dist * D.H;
  if (ph < g.duty) {
    const u = ph / g.duty, a = rolled(D, lerp(sw / 2, -sw / 2, u), g.roll * ss(0.55, 1, u));
    return [a[0], a[1], g.roll * ss(0.55, 1, u) - g.heel * (1 - ss(0, 0.16, u)), 1];
  }
  const u = (ph - g.duty) / (1 - g.duty), a0 = rolled(D, -sw / 2, g.roll), e = ease.io(u), up = Math.sin(u * Math.PI);
  return [lerp(a0[0], sw / 2, e), lerp(a0[1], -D.ank, e) - g.lift * D.H * up, lerp(g.roll, -g.heel, ss(0, 0.85, u)) + g.kick * up, 0];
}

const POSES = {
  stand(p, D, t, seed) {
    const H = D.H, sw = Math.sin(t * 0.7 + seed * 1.7), lean = 0.02 + (D.V.stoop ?? 0);
    return { hx: sw * H * 0.004, hy: -D.leg, lean, nod: 0, R: [-H * 0.032, -D.ank, 0], L: [H * 0.048, -D.ank, 0],
      aR: fk(D, -0.16 + sw * 0.015 - lean, 0.22), aL: fk(D, 0.16 - sw * 0.015 - lean, 0.18), bR: 1, bL: 1 };
  },
  walk(p, D) {
    const ph = p.phase ?? 0, R = foot(ph, GAIT.walk, D), L = foot(ph + 0.5, GAIT.walk, D), Lm = (D.thigh + D.shin) * 0.99;
    let h = D.leg * 0.992;
    for (const f of [R, L]) if (f[3]) { const dx = Math.abs(f[0]) + D.H * 0.014; h = Math.min(h, -f[1] + Math.sqrt(Math.max(1, Lm * Lm - dx * dx))); };
    const sw = Math.cos(TAU * (ph - 0.06));
    return { hx: 0, hy: -h, lean: 0.045 + (D.V.stoop ?? 0), nod: 0, R, L, bR: 1, bL: 1,
      aR: fk(D, -0.4 * sw, 0.2 + 0.2 * Math.max(0, -sw)), aL: fk(D, 0.4 * sw, 0.2 + 0.2 * Math.max(0, sw)) };
  },
  run(p, D) {
    const ph = p.phase ?? 0, R = foot(ph, GAIT.run, D), L = foot(ph + 0.5, GAIT.run, D);
    const h = D.leg * 0.9 + D.H * 0.022 * Math.sin(2 * TAU * (ph - 0.305)), sw = Math.cos(TAU * (ph - 0.06));
    return { hx: 0, hy: -h, lean: 0.2, nod: -0.06, R, L, bR: 1, bL: 1,
      aR: fk(D, 0.1 - 0.8 * sw, 1.5 - 0.25 * sw), aL: fk(D, 0.1 + 0.8 * sw, 1.5 + 0.25 * sw) };
  },
  sit(p, D, t, seed) {
    const knee = D.shin + D.ank, seat = p.seat > 0 ? p.seat : knee + 1, hy = -(seat + D.rT * 0.9), lean = -0.05;
    const dangle = seat > knee + 4 && D.kid > 0.5, sw = dangle ? Math.sin(t * 2.3 + seed) * D.H * 0.022 : 0;
    const fy = dangle ? Math.min(-D.ank, hy + D.shin * 0.98) : -D.ank, kx = D.thigh * 0.97 + (dangle ? 0 : Math.max(0, seat - knee) * 1.3), S = shoulderOf(D, 0, hy, lean);
    const lap = (dx) => [kx * 0.62 + dx - S[0], hy - D.rT - D.rH * 0.5 - S[1]];
    return { hx: 0, hy, lean, nod: 0, R: [kx + 2 + sw, fy, dangle ? 0.3 : 0], L: [kx + D.H * 0.035 - sw, fy, dangle ? 0.3 : 0],
      aR: lap(0), aL: lap(D.H * 0.03), bR: 1, bL: 1 };
  },
  throw(p, D) {
    const k = clamp(p.k ?? 0), H = D.H, A = D.l1 + D.l2;
    const step = K(k, [[0.18, 0], [0.48, 1]]), lift = Math.sin(clamp((k - 0.18) / 0.3) * Math.PI) * H * 0.04;
    const roll = K(k, [[0.42, 0], [0.62, 0.6], [0.85, 0.45], [1, 0.2]]), r = rolled(D, -H * 0.032, roll);
    const aR = K(k, [[0, [0.05, 0.97]], [0.22, [-0.72, 0.25]], [0.42, [-0.5, -0.7]], [0.48, [0.1, -0.98], 'lin'], [0.52, [0.62, -0.77], 'lin'], [0.58, [0.92, -0.3], 'lin'],
      [0.68, [0.78, 0.42], 'out'], [1, [0.22, 0.93]]]);
    const aL = K(k, [[0, [0.1, 0.96]], [0.36, [0.72, 0.08]], [0.62, [-0.3, 0.8]], [1, [0.1, 0.96]]]);
    return { hx: step * H * 0.05 + K(k, [[0, 0], [0.4, -0.03 * H], [0.6, 0.03 * H], [1, 0]]),
      hy: -D.leg * K(k, [[0, 1], [0.4, 0.955], [0.6, 0.925], [1, 0.97]]),
      lean: K(k, [[0, 0.02], [0.4, -0.2], [0.56, 0.24, 'out'], [0.75, 0.3], [1, 0.08]]), nod: K(k, [[0, 0], [0.4, -0.12], [0.6, 0], [1, 0]]),
      R: [r[0], r[1], roll, 1], L: [H * 0.048 + step * H * 0.15, -D.ank - lift, -0.25 * Math.sin(clamp((k - 0.18) / 0.3) * Math.PI), 1],
      aR: [aR[0] * A, aR[1] * A], aL: [aL[0] * A, aL[1] * A], bR: k < 0.48 ? -1 : 1, bL: 1 };
  },
  crouch(p, D) {
    const H = D.H;
    return { hx: -H * 0.085, hy: -(D.leg * 0.4 + D.ank), lean: 0.55, nod: 0.12, R: [-H * 0.02, -D.ank, 0], L: [H * 0.06, -D.ank, 0],
      aR: fk(D, 0.75, 0.5), aL: fk(D, 0.5, 0.9), bR: 1, bL: 1 };
  },
  kneel(p, D) {
    const H = D.H, hy = -(D.thigh * 0.97 + D.rK), r = rolled(D, -D.shin * 0.92 - D.footL * 0.55, 1.5);
    return { hx: 0, hy, lean: 0.3, nod: 0.1, R: [D.thigh * 0.72, -D.ank, 0], L: [r[0], r[1], 1.5, 1],
      aR: fk(D, 0.85, 0.35), aL: fk(D, 0.55, 0.7), bR: 1, bL: 1 };
  },
  ride(p, D) {
    const k = D.H / 330, th = (p.phase ?? 0) * TAU, cr = BK.crank * k, lean = 0.52;
    const hx = (BK.seat[0] + 2) * k, hy = BK.seat[1] * k - D.rT * 0.75 + Math.sin(th * 2) * k;
    const S = shoulderOf(D, hx, hy, lean);
    const ped = (a) => [BK.bbx * k + Math.cos(a) * cr - D.footL * 0.3, BK.bby * k + Math.sin(a) * cr - D.ank, 0.18 + 0.2 * Math.sin(a), 1];
    return { hx, hy, lean, nod: -0.12, R: ped(th), L: ped(th + Math.PI), bR: 1, bL: 1,
      aR: [BK.bar[0] * k - S[0], BK.bar[1] * k - S[1]], aL: [(BK.bar[0] + 5) * k - S[0], (BK.bar[1] + 1) * k - S[1]] };
  },
};
const mixA = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
function poseOf(pose, p, D, t, seed) {
  const one = (n) => (POSES[n] || POSES.stand)(p, D, t, seed);
  if (!Array.isArray(pose)) return one(pose);
  const a = one(pose[0]), b = one(pose[1]), k = clamp(+pose[2] || 0);
  return { hx: lerp(a.hx, b.hx, k), hy: lerp(a.hy, b.hy, k), lean: lerp(a.lean, b.lean, k), nod: lerp(a.nod, b.nod, k),
    R: mixA(a.R, b.R, k), L: mixA(a.L, b.L, k), aR: mixA(a.aR, b.aR, k), aL: mixA(a.aL, b.aL, k), bR: k < 0.5 ? a.bR : b.bR, bL: k < 0.5 ? a.bL : b.bL };
}
const num2 = (v) => Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]);

function solve(p, D) {
  const t = p.t ?? 0, seed = p.seed ?? 0, H = D.H, s = p.s > 0 ? p.s : 1, flip = (p.flip ?? 1) < 0 ? -1 : 1;
  const P = poseOf(p.pose, p, D, t, seed);
  const breath = Math.sin(t * 1.9 + seed * 2.3) * 0.5 + 0.5, tl = D.torso + breath * H * 0.004;
  const ux = Math.sin(P.lean), uy = -Math.cos(P.lean);
  const cx = P.hx + ux * (tl - D.rS), cy = P.hy + uy * (tl - D.rS), nx = P.hx + ux * tl, ny = P.hy + uy * tl;
  const look = num2(p.look) ? p.look : [0.3, 0.05];
  const tilt = P.lean * 0.4 + P.nod + clamp(look[1], -1, 1) * 0.14 + (p.headTilt ?? 0) + (p.hold === 'phone' ? 0.14 : 0);
  const head = { x: nx + ux * D.neck + D.hr * (0.12 + Math.sin(tilt) * 0.5), y: ny + uy * D.neck - D.hr * 0.86, r: D.hr, tilt };
  const sR = [cx - H * 0.006, cy + D.rS * 0.1], sL = [cx + H * 0.02, cy + D.rS * 0.15];
  let tR = [sR[0] + P.aR[0], sR[1] + P.aR[1]], tL = [sL[0] + P.aL[0], sL[1] + P.aL[1]], bR = P.bR, bL = P.bL;
  const toLocal = (w) => [(w[0] - (p.x ?? 0)) / (s * flip), (w[1] - (p.y ?? 0)) / s];
  const hold = p.hold;
  if ((hold === 'cup' || hold === 'phone') && !num2(p.handR)) {
    const q = hold === 'cup' ? fk(D, 0.1 - P.lean, 1.5) : fk(D, 0.32 - P.lean, 2.05);
    tR = [sR[0] + q[0], sR[1] + q[1] - breath]; bR = 1;
  }
  const wv = clamp(p.wave ?? 0);
  if (wv > 0) {
    const useL = num2(p.handR) || !!hold, A = D.l1 + D.l2, w = Math.sin(t * 9 + seed), S = useL ? sL : sR;
    const tw = [S[0] + A * (0.66 + 0.15 * w), S[1] - A * (0.6 - 0.06 * w * w)], e = ease.io(wv);
    if (useL) { tL = mixA(tL, tw, e); bL = 1; } else { tR = mixA(tR, tw, e); bR = 1; }
  }
  if (num2(p.handR)) { tR = toLocal(p.handR); bR = 1; }
  if (num2(p.handL)) { tL = toLocal(p.handL); bL = 1; }
  const arm = (S, T, b) => { const q = ik2(S[0], S[1], T[0], T[1], D.l1, D.l2, b); return { sx: S[0], sy: S[1], jx: q.jx, jy: q.jy, ex: q.ex, ey: q.ey }; };
  const leg = (hx, F) => { const q = ik2(hx, P.hy, F[0], F[1], D.thigh, D.shin, -1); return { hx, hy: P.hy, kx: q.jx, ky: q.jy, ax: q.ex, ay: q.ey, rot: F[2] }; };
  return { hx: P.hx, hy: P.hy, lean: P.lean, ux, uy, cx, cy, nx, ny, head, look, top: head.y - D.hr * 1.3,
    R: { arm: arm(sR, tR, bR), leg: leg(P.hx - H * 0.008, P.R) }, L: { arm: arm(sL, tL, bL), leg: leg(P.hx + H * 0.014, P.L) } };
}

export function handPos(p = {}) {
  const D = dims(p.who), J = solve(p, D), s = p.s > 0 ? p.s : 1, f = (p.flip ?? 1) < 0 ? -s : s, x = p.x ?? 0, y = p.y ?? 0;
  const w = (lx, ly) => [x + lx * f, y + ly * s];
  return { R: w(J.R.arm.ex, J.R.arm.ey), L: w(J.L.arm.ex, J.L.arm.ey), head: w(J.head.x, J.head.y), top: y + J.top * s,
    footR: w(J.R.leg.ax, J.R.leg.ay), footL: w(J.L.leg.ax, J.L.leg.ay) };
}

// ---------------------------------------------------------------- painting
// outline-behind: stroke every part at double width, then fill them all, so a group reads as one merged silhouette
function group(c, parts, lw) {
  c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = lw * 2;
  for (const q of parts) { c.strokeStyle = q[2]; c.stroke(q[0]); }
  for (const q of parts) { c.fillStyle = q[1]; c.fill(q[0]); }
}
function shoePath(ax, ay, rot, D) {
  const L = D.footL, a = D.ank, cs = Math.cos(rot), sn = Math.sin(rot);
  const P = [[-0.3 * L, a, 1], [-0.33 * L, a * 0.3], [-0.2 * L, -a * 0.5], [0.05 * L, -a * 0.45], [0.38 * L, a * 0.1], [0.66 * L, a * 0.42], [0.72 * L, a * 0.8], [0.66 * L, a, 1]];
  return blob(P.map((q) => [ax + q[0] * cs - q[1] * sn, ay + q[0] * sn + q[1] * cs, q[2]]));
}
function legParts(L, D, pal, far, grad) {
  const k = far ? 'far' : 'c', thigh = capsule(L.hx, L.hy, D.rT, L.kx, L.ky, D.rK), shin = capsule(L.kx, L.ky, D.rK, L.ax, L.ay, D.rA);
  const out = [];
  if (D.pants) { const f = (!far && grad) || pal.bot[k]; out.push([shin, f, pal.bot.ln], [thigh, f, pal.bot.ln]); }
  else {
    out.push([shin, pal.skin[k], pal.skin.ln], [thigh, pal.skin[k], pal.skin.ln]);
    if (D.shorts) out.push([capsule(L.hx, L.hy, D.rT * 1.1, lerp(L.hx, L.kx, 0.6), lerp(L.hy, L.ky, 0.6), D.rT * 1.02), pal.bot[k], pal.bot.ln]);
  }
  out.push([shoePath(L.ax, L.ay, L.rot, D), pal.shoe[k], pal.shoe.ln]);
  return out;
}
function armParts(A, D, pal, far) {
  const k = far ? 'far' : 'c', sl = D.V.sleeve, skin = pal.skin[k], top = pal.top[k];
  const up = capsule(A.sx, A.sy, D.rU, A.jx, A.jy, D.rE), fore = capsule(A.jx, A.jy, D.rE, A.ex, A.ey, D.rWr);
  const dir = Math.atan2(A.ey - A.jy, A.ex - A.jx), cs = Math.cos(dir), sn = Math.sin(dir), r = D.rH, hand = oval(A.ex + cs * r * 0.3, A.ey + sn * r * 0.3, r * 1.12, r * 0.9, dir);
  hand.moveTo(A.ex + Math.cos(dir - 1.15) * r * 0.85 + r * 0.42, A.ey + Math.sin(dir - 1.15) * r * 0.85); hand.arc(A.ex + Math.cos(dir - 1.15) * r * 0.85, A.ey + Math.sin(dir - 1.15) * r * 0.85, r * 0.42, 0, TAU);
  if (sl === 'long') return [[hand, skin, pal.skin.ln], [fore, top, pal.top.ln], [up, top, pal.top.ln]];
  const out = [[hand, skin, pal.skin.ln], [fore, skin, pal.skin.ln], [up, skin, pal.skin.ln]];
  if (sl !== 'none') out.push([capsule(A.sx, A.sy, D.rU * 1.14, lerp(A.sx, A.jx, 0.58), lerp(A.sy, A.jy, 0.58), D.rU * 1.1), top, pal.top.ln]);
  return out;
}
function legPoint(L, D, d) {
  if (d <= D.thigh) { const u = d / D.thigh; return [lerp(L.hx, L.kx, u), lerp(L.hy, L.ky, u), L.kx - L.hx, L.ky - L.hy]; }
  const u = clamp((d - D.thigh) / D.shin); return [lerp(L.kx, L.ax, u), lerp(L.ky, L.ay, u), L.ax - L.kx, L.ay - L.ky];
}
function skirtPath(J, D) {
  const d = D.skirtLen * D.thigh, hw = D.rT * (1.25 + 0.12 * D.skirtLen), a = legPoint(J.R.leg, D, d), b = legPoint(J.L.leg, D, d);
  const n = (q) => { const m = Math.hypot(q[2], q[3]) || 1; return [q[3] / m, -q[2] / m]; };
  const na = n(a), nb = n(b), da = a[0] * na[0] + a[1] * na[1], db = b[0] * na[0] + b[1] * na[1];
  const f = da >= db ? [a, na] : [b, nb], r = da >= db ? [b, nb] : [a, na], w = D.rW;
  return blob([[J.hx - w * 1.02, J.hy - w * 0.3], [J.hx + w * 1.02, J.hy - w * 0.3], [f[0][0] + f[1][0] * hw, f[0][1] + f[1][1] * hw, 1],
    [r[0][0] - r[1][0] * hw, r[0][1] - r[1][1] * hw, 1], [J.hx - w * 1.08, J.hy + w * 0.55]], true, 0.7);
}

// unit-size head / hair shapes (head radius = 1, facing right)
let HP = null;
function headPaths() {
  if (HP) return HP;
  const tear = blob([[0, -0.05], [0.2, 0.22], [0.27, 0.62], [0.08, 0.98, 1], [-0.16, 0.8], [-0.22, 0.4], [-0.13, 0.08]]);
  const curlB = new Path2D(), curlF = new Path2D();
  for (let i = 0; i < 8; i++) { const a = (150 + i * 27) * Math.PI / 180, x = -0.08 + Math.cos(a) * 0.86, y = -0.14 + Math.sin(a) * 0.86; curlB.moveTo(x + 0.42, y); curlB.arc(x, y, 0.42, 0, TAU); }
  for (const q of [[0.66, -0.74, 0.22], [0.34, -0.72, 0.26], [0, -0.62, 0.27], [-0.3, -0.42, 0.25], [-0.42, -0.14, 0.2]]) { curlF.moveTo(q[0] + q[2], q[1]); curlF.arc(q[0], q[1], q[2], 0, TAU); }
  HP = {
    head: blob([[0, -1], [0.68, -0.76], [0.97, -0.12], [0.9, 0.42], [0.52, 0.9], [0.02, 1.0], [-0.52, 0.84], [-0.9, 0.32], [-0.96, -0.28], [-0.66, -0.78]]),
    ear: oval(-0.5, 0.14, 0.17, 0.23, -0.15), tear, curlB, curlF,
    short: blob([[-0.74, 0.46], [-1.03, -0.05], [-0.9, -0.68], [-0.3, -1.1], [0.38, -1.08], [0.84, -0.72], [0.9, -0.5, 1], [0.5, -0.6], [0.05, -0.5], [-0.3, -0.26], [-0.36, 0.1, 1], [-0.52, -0.1], [-0.66, 0.26]]),
    messy: blob([[-0.72, 0.44], [-1.05, -0.05], [-0.95, -0.62], [-0.62, -1.0], [-0.5, -1.24, 1], [-0.3, -1.08], [-0.05, -1.3, 1], [0.2, -1.08], [0.5, -1.22, 1], [0.7, -0.9], [1.0, -0.74, 1],
      [0.86, -0.45], [0.56, -0.64, 1], [0.4, -0.42], [0.12, -0.6, 1], [-0.1, -0.36], [-0.32, -0.24], [-0.36, 0.1, 1], [-0.52, -0.1], [-0.66, 0.24]]),
    bun: blob([[-0.7, 0.5], [-1.02, 0], [-0.92, -0.66], [-0.32, -1.08], [0.36, -1.05], [0.8, -0.72], [0.84, -0.52, 1], [0.4, -0.66], [-0.05, -0.52], [-0.34, -0.2], [-0.38, 0.12, 1], [-0.54, -0.08], [-0.64, 0.28]]),
    bunB: circle(-0.8, -0.9, 0.38),
    long: blob([[-0.62, 0.3], [-1.02, -0.1], [-0.9, -0.68], [-0.3, -1.1], [0.4, -1.07], [0.86, -0.7], [0.95, -0.36, 1], [0.62, -0.62], [0.2, -0.66], [-0.16, -0.4], [-0.28, 0.0], [-0.24, 0.62, 1], [-0.44, 0.34]]),
    longB: blob([[-0.6, -0.9], [-1.08, -0.3], [-1.16, 0.7], [-1.0, 1.5], [-0.5, 1.64], [-0.1, 1.4], [-0.06, 0.6], [0.1, -0.2]]),
    thin: blob([[-0.72, 0.48], [-1.0, 0.05], [-0.97, -0.4], [-0.5, -0.44], [-0.3, -0.2], [-0.36, 0.1, 1], [-0.52, -0.08], [-0.64, 0.28]]),
    hat: blob([[-1.05, -0.3, 1], [-1.0, -0.82], [-0.4, -1.2], [0.4, -1.18], [0.9, -0.88], [1.06, -0.62], [1.42, -0.52], [1.46, -0.4, 1], [0.9, -0.42], [0.2, -0.5], [-0.5, -0.4]]),
    beard: blob([[-0.36, 0.1, 1], [-0.2, 0.5], [0.15, 0.34], [0.5, 0.34], [0.8, 0.34], [0.93, 0.4, 1], [0.84, 0.72], [0.5, 1.03], [0.02, 1.1], [-0.48, 0.92], [-0.74, 0.46], [-0.6, 0.15]]),
    band: blob([[-0.98, -0.42], [-0.4, -0.6], [0.3, -0.74], [0.9, -0.56], [0.95, -0.38], [0.3, -0.54], [-0.4, -0.4], [-0.98, -0.22]]),
  };
  return HP;
}

function drawHead(c, J, D, pal, o) {
  const h = J.head, r = h.r, V = D.V, { mono, lod, p } = o, w = o.lw / r, U = headPaths(), st = V.hair;
  const t = p.t ?? 0, seed = p.seed ?? 0, ph = p.phase ?? 0;
  const moving = p.pose === 'walk' ? 1 : p.pose === 'run' ? 1.8 : 0;
  const bounce = moving ? Math.sin(2 * TAU * ph + 0.6) * 0.16 * moving : Math.sin(t * 1.3 + seed) * 0.04;
  const hc = pal.hair, hf = mono ? MONO : lin(c, 0, -1.1, 0, 0.6, [[0, hc.l], [0.6, hc.c], [1, hc.d]]);
  c.save(); c.translate(h.x, h.y); c.rotate(h.tilt); c.scale(r, r);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const tail = (x, y, rot, sc, f) => { c.save(); c.translate(x, y); c.rotate(rot); c.scale(sc, sc); c.lineWidth = (w * 2) / sc; c.strokeStyle = hc.ln; c.stroke(U.tear); c.fillStyle = f; c.fill(U.tear); c.restore(); };
  // hair behind the head
  if (st === 'pigtails') tail(0.3, -0.92, -0.75 - bounce, 0.95, hc.far);
  if (st === 'ponytail') tail(-0.8, -0.55, 0.28 + bounce * 1.6 + moving * 0.42, 1.45, hc.c);
  if (st === 'bun') group(c, [[U.bunB, hf, hc.ln]], w);
  if (st === 'long') group(c, [[U.longB, mono ? MONO : hc.d, hc.ln]], w);
  if (st === 'curly') group(c, [[U.curlB, hf, hc.ln]], w);
  // head
  const sk = pal.skin;
  group(c, [[U.ear, sk.d, sk.ln], [U.head, mono ? MONO : lin(c, 0, -1, 0, 1.05, [[0, sk.l], [0.5, sk.c], [1, sk.d]]), sk.ln]], w);
  if (!mono) {
    if (!lod) {
      c.save(); c.clip(U.head); c.translate(0.04, 0.09); c.globalAlpha = 0.4; c.strokeStyle = sk.l; c.lineWidth = w * 2.4; c.stroke(U.head); c.restore();
      c.fillStyle = alpha('#f0705a', 0.2); c.beginPath(); c.arc(0.16, 0.44, 0.19, 0, TAU); c.fill();
      c.strokeStyle = alpha(sk.ln, 0.6); c.lineWidth = w * 0.8; c.beginPath(); c.arc(-0.5, 0.14, 0.09, 2.2, 4.6); c.stroke();
    }
    if (V.beard) { group(c, [[U.beard, hf, hc.ln]], w * 0.8); c.fillStyle = sk.c; c.beginPath(); c.ellipse(0.5, 0.56, 0.27, 0.13, 0, 0, TAU); c.fill(); }
    // eyes
    const kidE = lerp(1, 1.14, D.kid), lid = blink(t, seed), smile = clamp(p.smile ?? 0.5);
    const E = [[0.2, -0.05, 0.225 * kidE], [0.72, -0.07, 0.19 * kidE]];
    if (lod) {
      c.fillStyle = '#2a1c18';
      for (const e of E) { c.beginPath(); c.ellipse(e[0] + J.look[0] * 0.04, e[1], e[2] * 0.62, e[2] * (lid > 0.5 ? 0.2 : 0.8), 0, 0, TAU); c.fill(); }
    } else {
      for (const e of E) eye(c, { x: e[0], y: e[1], r: e[2], look: J.look, iris: V.eye, lid, lidColor: sk.c, line: sk.ln, lw: w * 0.9, low: smile > 0.75 ? (smile - 0.75) * 1.2 : 0 });
      const bc = V.hairC === '#d3d6da' || V.hairC === '#b9bcc0' ? '#8d8f96' : hc.d, up = (smile - 0.5) * 0.05;
      c.strokeStyle = bc; c.lineWidth = w * 1.5; c.beginPath();
      c.moveTo(0.0, -0.36 - up); c.quadraticCurveTo(0.2, -0.47 - up, 0.42, -0.38 - up);
      c.moveTo(0.58, -0.38 - up); c.quadraticCurveTo(0.74, -0.46 - up, 0.9, -0.36 - up); c.stroke();
    }
    // nose, mouth
    c.strokeStyle = alpha(sk.ln, 0.75); c.lineWidth = w * 0.9;
    c.beginPath(); c.arc(0.55, 0.22, 0.09, -1.1, 1.5); c.stroke();
    if (V.mustache) { c.fillStyle = hc.c; c.strokeStyle = hc.ln; c.lineWidth = w * 0.7; c.beginPath(); c.ellipse(0.55, 0.43, 0.27, 0.085, 0.05, 0, TAU); c.fill(); c.stroke(); }
    const mx = 0.47, my = 0.53 + (V.mustache ? 0.06 : 0), mw = 0.17 + 0.1 * smile, md = 0.03 + 0.17 * smile;
    if (smile > 0.7 && !lod) {
      c.beginPath(); c.moveTo(mx - mw, my - md * 0.3); c.quadraticCurveTo(mx, my + md * 1.7, mx + mw * 0.9, my - md * 0.4); c.closePath();
      c.fillStyle = '#7d2b30'; c.fill(); c.strokeStyle = sk.ln; c.lineWidth = w; c.stroke();
    } else {
      c.strokeStyle = V.lips || sk.ln; c.lineWidth = w * (V.lips ? 1.5 : 1.1);
      c.beginPath(); c.moveTo(mx - mw, my - md * 0.3); c.quadraticCurveTo(mx, my + md, mx + mw * 0.9, my - md * 0.4); c.stroke();
    }
  }
  // hair in front
  if (st === 'curly') group(c, [[U.curlF, hf, hc.ln]], w);
  else if (U[st] && st !== 'pigtails' && st !== 'ponytail') group(c, [[U[st], hf, hc.ln]], w);
  else if (st !== 'bald') group(c, [[U.bun, hf, hc.ln]], w);
  if (st === 'pigtails') { tail(-0.74, -0.6, 0.95 + bounce, 1.05, hf); if (!mono) { c.fillStyle = V.tie || '#ffd24a'; c.beginPath(); c.arc(-0.76, -0.58, 0.13, 0, TAU); c.fill(); } }
  if (V.band && !mono) { c.fillStyle = V.band; c.fill(U.band); c.strokeStyle = alpha(hc.ln, 0.5); c.lineWidth = w * 0.6; c.stroke(U.band); }
  if (V.hat) group(c, [[U.hat, mono ? MONO : lin(c, 0, -1.2, 0, -0.3, [[0, pal.hat.l], [1, pal.hat.d]]), pal.hat.ln]], w);
  if (V.glasses && !mono) {
    c.strokeStyle = '#4a3a48'; c.lineWidth = w * 1.3; c.beginPath();
    c.moveTo(0.2 + 0.31, -0.05); c.arc(0.2, -0.05, 0.31, 0, TAU); c.moveTo(0.72 + 0.26, -0.07); c.arc(0.72, -0.07, 0.26, 0, TAU);
    c.moveTo(-0.11, -0.1); c.lineTo(-0.5, -0.02); c.stroke();
    if (!lod) { c.fillStyle = 'rgba(255,255,255,0.16)'; c.beginPath(); c.arc(0.2, -0.05, 0.3, 0, TAU); c.arc(0.72, -0.07, 0.25, 0, TAU); c.fill(); }
  }
  c.restore();
}

function drawItem(c, kind, A, D, lw) {
  const x = A.ex, y = A.ey, u = D.H / 330;
  c.lineJoin = 'round';
  if (kind === 'ball') {
    const r = 9.5, bx = x + r * 0.5, by = y + r * 0.35;
    c.lineWidth = lw * 2; c.strokeStyle = '#5a6a14'; c.beginPath(); c.arc(bx, by, r, 0, TAU); c.stroke();
    c.fillStyle = lin(c, 0, by - r, 0, by + r, [[0, '#eaf266'], [1, '#b4c22c']]); c.fill();
    c.strokeStyle = '#f8fbe0'; c.lineWidth = lw * 0.9; c.beginPath(); c.arc(bx - r * 0.9, by, r * 0.9, -0.9, 0.9); c.stroke();
  } else if (kind === 'cup') {
    const w = 11 * u, h = 30 * u, cy = y - h * 0.62, cup = new Path2D();
    cup.moveTo(x - w, cy); cup.lineTo(x + w, cy); cup.lineTo(x + w * 0.76, cy + h); cup.lineTo(x - w * 0.76, cy + h); cup.closePath();
    c.lineWidth = lw * 2; c.strokeStyle = '#5a4636'; c.stroke(cup); c.fillStyle = '#f6f1e6'; c.fill(cup);
    c.fillStyle = '#b9814f'; c.fillRect(x - w * 0.95, cy + h * 0.34, w * 1.9, h * 0.36);
    const lid = rrect(x - w * 1.12, cy - 5 * u, w * 2.24, 6 * u, 2 * u); c.stroke(lid); c.fillStyle = '#e9e2d3'; c.fill(lid);
  } else if (kind === 'phone') {
    c.save(); c.translate(x + 3 * u, y - 13 * u); c.rotate(0.3);
    const ph = rrect(-7 * u, -17 * u, 14 * u, 32 * u, 3 * u);
    c.lineWidth = lw * 2; c.strokeStyle = '#14161f'; c.stroke(ph); c.fillStyle = '#2a2f3e'; c.fill(ph); c.restore();
  } else return;
  group(c, [[circle(x, y, D.rH * 0.92), D.pal.skin.c, D.pal.skin.ln]], lw * 0.8);
}

function paint(c, J, D, pal, o) {
  const { lw, mono, lod, pass, p } = o, V = D.V, H = D.H;
  if (pass !== 'front') {
    group(c, armParts(J.L.arm, D, pal, true), lw);
    group(c, legParts(J.L.leg, D, pal, true), lw);
  }
  if (pass === 'back') return;
  // body: neck, near leg, torso (+ skirt / coat / apron) share one outline
  const top = pal.top, cy0 = J.cy - D.rS, torso = capsule(J.hx, J.hy, D.rW, J.cx, J.cy, D.rS);
  const tg = mono ? MONO : lin(c, 0, cy0, 0, J.hy + D.rW, [[0, top.l], [0.5, top.c], [1, top.d]]);
  const lg = mono || !D.pants ? null : lin(c, 0, J.hy, 0, 0, [[0, pal.bot.c], [1, pal.bot.d]]);
  const neck = capsule(J.cx + J.ux * D.rS * 0.5, J.cy + J.uy * D.rS * 0.5, D.rE * 1.05, J.head.x - D.hr * 0.12, J.head.y + D.hr * 0.5, D.rE * 1.05);
  const parts = [[neck, pal.skin.d, pal.skin.ln], ...legParts(J.R.leg, D, pal, false, lg)];
  const sk = D.hasSkirt ? skirtPath(J, D) : null, apron = !!V.apron;
  if (sk && !apron) parts.push([sk, mono ? MONO : lin(c, 0, J.hy, 0, J.hy + D.skirtLen * D.thigh, [[0, pal.skirt.c], [1, pal.skirt.d]]), pal.skirt.ln]);
  if (V.detail === 'hood') parts.push([circle(J.cx - Math.cos(J.lean) * D.rS * 0.55 + J.ux * D.rS * 0.75, J.cy - Math.sin(J.lean) * D.rS * 0.55 + J.uy * D.rS * 0.75, D.rS * 0.62), top.d, top.ln]);
  parts.push([torso, tg, top.ln]);
  if (sk && apron) parts.push([sk, pal.skirt.c, pal.skirt.ln]);
  group(c, parts, lw);
  if (!mono) {
    const fx = Math.cos(J.lean), fy = Math.sin(J.lean);   // front normal of the torso
    c.save(); c.clip(torso);
    if (V.detail === 'stripes') {
      c.strokeStyle = V.stripe || '#ffffff'; c.lineWidth = H * 0.026; c.lineCap = 'butt'; c.beginPath();
      for (let d = -D.rW * 0.6; d < D.torso; d += H * 0.058) { const x = J.hx + J.ux * d, y = J.hy + J.uy * d; c.moveTo(x - fx * 99, y - fy * 99); c.lineTo(x + fx * 99, y + fy * 99); }
      c.stroke();
    } else if (V.detail === 'cardigan') {
      c.fillStyle = V.inner || '#f6ecd8'; c.beginPath();
      c.moveTo(J.cx + fx * D.rS * 0.2 + J.ux * D.rS, J.cy + fy * D.rS * 0.2 + J.uy * D.rS); c.lineTo(J.cx + fx * D.rS * 2, J.cy + fy * D.rS * 2 + J.uy * D.rS);
      c.lineTo(J.hx + fx * D.rW * 2, J.hy + fy * D.rW * 2 + D.rW); c.lineTo(J.hx + fx * D.rW * 0.5, J.hy + fy * D.rW * 0.5 + D.rW); c.closePath(); c.fill();
      c.strokeStyle = alpha(top.ln, 0.7); c.lineWidth = lw * 0.8; c.stroke();
    } else if (V.detail === 'bowtie') {
      c.fillStyle = '#b8323a'; const bx = J.cx + fx * D.rS * 0.55 + J.ux * D.rS * 0.72, by = J.cy + fy * D.rS * 0.55 + J.uy * D.rS * 0.72, q = H * 0.017;
      c.beginPath(); c.moveTo(bx - q, by - q * 0.7); c.lineTo(bx + q, by + q * 0.7); c.lineTo(bx + q, by - q * 0.7); c.lineTo(bx - q, by + q * 0.7); c.closePath(); c.fill();
    }
    if (!lod) {   // rim light from the upper left + form shadow at the hem
      c.translate(1.2, 2.8); c.globalAlpha = 0.34; c.strokeStyle = top.l; c.lineWidth = lw * 2.4; c.stroke(torso);
    }
    c.restore();
  }
  drawHead(c, J, D, pal, o);
  group(c, armParts(J.R.arm, D, pal, false), lw);
  if (p.hold && !mono) drawItem(c, p.hold, J.R.arm, D, lw);
}

function bones(J, D) {
  const h = J.head, R = J.R, L = J.L, a = (A) => [[A.sx, A.sy, A.jx, A.jy, D.rU], [A.jx, A.jy, A.ex, A.ey, D.rE]];
  const l = (G) => [[G.hx, G.hy, G.kx, G.ky, D.rT * 0.9], [G.kx, G.ky, G.ax, G.ay, D.rK]];
  const hd = [h.x, h.y, h.x, h.y, h.r], tr = [J.hx, J.hy, J.cx, J.cy, D.rS * 0.9];
  return [hd, hd, hd, tr, tr, tr, ...a(R.arm), ...a(L.arm), ...l(R.leg), ...l(L.leg)];
}
function motes(c, J, D, k, seed, lod, top, bot) {
  const B = bones(J, D), n = lod ? 24 : 46, H = D.H, end = 1 - ss(0.86, 1, k);
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const b = B[Math.floor(hash(i, seed + 11) * B.length) % B.length], u = hash(i, seed + 12);
    const a0 = hash(i, seed + 13) * TAU, rr = Math.sqrt(hash(i, seed + 14)) * b[4];
    const px = lerp(b[0], b[2], u) + Math.cos(a0) * rr, py = lerp(b[1], b[3], u) + Math.sin(a0) * rr;
    const kc = lerp(0.16, 0.9, invLerp(top, bot, py)) - 0.02 + hash(i, seed + 15) * 0.03;
    const a = (k - kc) / (0.16 + hash(i, seed + 16) * 0.2);
    if (a <= 0 || a >= 1) continue;
    const e = 1 - (1 - a) * (1 - a);
    const x = px + Math.sin(a * 6 + a0) * H * 0.03 + (hash(i, seed + 17) - 0.5) * H * 0.12 * e, y = py - e * H * (0.18 + 0.3 * hash(i, seed + 18));
    const r = H * (0.008 + 0.017 * hash(i, seed + 19)) * Math.pow(1 - a, 0.6) * (0.4 + 0.6 * Math.min(1, a * 6)) * end;
    c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
  }
  c.fillStyle = MONO; c.fill();
}

export function drawHuman(c, p = {}) {
  const k = clamp(p.vanish ?? 0);
  if (k >= 1) return;
  const D = dims(p.who), s = p.s > 0 ? p.s : 1, flip = (p.flip ?? 1) < 0 ? -1 : 1, H = D.H, pass = p._pass;
  const q = p.s > 0 ? p : { ...p, s }, J = solve(q, D), lw = inkW(s), lod = s < 0.6, sh = p.shadow ?? 1;
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s);
  if (sh > 0 && pass !== 'front') shadow(c, J.hx + H * 0.01, 0, H * 0.17, H * 0.032, 0.26 * sh * (1 - k));
  if (k <= 0) paint(c, J, D, D.pal, { lw, mono: false, lod, pass, p: q });
  else {
    const a1 = ss(0, 0.22, k), top = J.top - H * 0.06, bot = H * 0.03, cut = lerp(top, bot, invLerp(0.16, 0.9, k)), seed = p.seed ?? 0;
    const clip = new Path2D(), W = H * 1.3, st = H * 0.035;
    clip.moveTo(-W, H);
    for (let x = -W, i = 0; x <= W; x += st, i++) clip.lineTo(x, cut + (hash(i, seed + 3) - 0.5) * H * 0.07);
    clip.lineTo(W, H); clip.closePath();
    c.save(); c.clip(clip);
    if (a1 < 1) paint(c, J, D, D.pal, { lw, mono: false, lod, pass, p: q });
    c.globalAlpha *= a1;
    paint(c, J, D, D.mono, { lw, mono: true, lod, pass, p: q });
    c.restore();
    if (pass !== 'back') motes(c, J, D, k, seed, lod, top, bot);
  }
  c.restore();
}

// Emissive part of the vanish: draw after the colour grade.
export function drawVanishFx(c, o = {}) {
  const k = clamp(o.k ?? 0);
  if (k <= 0 || k >= 1) return;
  const h = (o.h > 0 ? o.h : 330) * (o.s > 0 ? o.s : 1), x = o.x ?? 0, y = o.y ?? 0, seed = o.seed ?? 0;
  const env = ss(0, 0.3, k) * (1 - ss(0.42, 1, k));
  c.save(); c.translate(x, y - h * 0.52); c.scale(0.42, 1);
  glow(c, 0, 0, h * 0.9, '#ffe7ab', env * 0.8);
  c.restore();
  glow(c, x, y - h * lerp(0.5, 0.85, k), h * 0.3, '#fffbe6', env * 0.55);
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = '#fff3c4'; c.beginPath();
  for (let i = 0; i < 16; i++) {
    const k0 = hash(i, seed + 31) * 0.5, a = (k - k0) / (0.3 + hash(i, seed + 32) * 0.2);
    if (a <= 0 || a >= 1) continue;
    const px = x + (hash(i, seed + 33) - 0.5) * h * 0.5 + Math.sin(a * 5 + i) * h * 0.03, py = y - h * (0.05 + hash(i, seed + 34)) - a * h * 0.4;
    const r = h * (0.014 + 0.026 * hash(i, seed + 35)) * Math.sin(a * Math.PI);
    c.moveTo(px, py - r); c.quadraticCurveTo(px, py, px + r, py); c.quadraticCurveTo(px, py, px, py + r);
    c.quadraticCurveTo(px, py, px - r, py); c.quadraticCurveTo(px, py, px, py - r);
  }
  c.fill(); c.restore();
}

// ---------------------------------------------------------------- bicycle
let BP = null;
function bikeDraw(c, ph, lw, part, color) {
  const B = BK, th = ph * TAU, px = B.bbx + Math.cos(th) * B.crank, py = B.bby + Math.sin(th) * B.crank;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const crank = (x, y, col) => {
    c.strokeStyle = '#2a2d38'; c.lineWidth = 4.5 + lw; c.beginPath(); c.moveTo(B.bbx, B.bby); c.lineTo(x, y); c.stroke();
    c.strokeStyle = col; c.lineWidth = 5; c.beginPath(); c.moveTo(x - 9, y); c.lineTo(x + 9, y); c.stroke();
  };
  if (part === 'back') { crank(2 * B.bbx - px, 2 * B.bby - py, '#3a3d48'); return; }
  if (part === 'front') { crank(px, py, '#4a4e5c'); return; }
  if (!BP) {
    const f = new Path2D(), k = new Path2D();
    f.moveTo(B.bbx, B.bby); f.lineTo(-36, -150); f.lineTo(70, -160); f.moveTo(B.bbx, B.bby); f.lineTo(73, -146);
    f.moveTo(B.bbx, B.bby); f.lineTo(B.rx, -B.R); f.lineTo(-36, -150);
    k.moveTo(B.fx, -B.R); k.lineTo(74, -148); k.lineTo(67, -186); k.lineTo(B.bar[0] + 4, B.bar[1]); k.moveTo(-36, -150); k.lineTo(-39, -166);
    BP = { f, k, saddle: capsule(-54, -167, 4, -28, -169, 5.5) };
  }
  const rot = th * B.gear;
  for (const wx of [B.rx, B.fx]) {
    c.strokeStyle = '#aab0bc'; c.lineWidth = 1.1; c.beginPath();
    for (let i = 0; i < 7; i++) { const a = rot + (i / 7) * Math.PI; c.moveTo(wx - Math.cos(a) * (B.R - 7), -B.R - Math.sin(a) * (B.R - 7)); c.lineTo(wx + Math.cos(a) * (B.R - 7), -B.R + Math.sin(a) * (B.R - 7)); }
    c.stroke();
    c.strokeStyle = '#c9ced6'; c.lineWidth = 2.2; c.beginPath(); c.arc(wx, -B.R, B.R - 8, 0, TAU); c.stroke();
    c.strokeStyle = '#2b2e3a'; c.lineWidth = 6.5; c.beginPath(); c.arc(wx, -B.R, B.R - 3.2, 0, TAU); c.stroke();
    c.fillStyle = '#4a4e5c'; c.beginPath(); c.arc(wx, -B.R, 4.5, 0, TAU); c.fill();
  }
  c.strokeStyle = '#2a2d38'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(B.bbx, B.bby - 10); c.lineTo(B.rx, -B.R - 4); c.moveTo(B.bbx, B.bby + 10); c.lineTo(B.rx, -B.R + 4); c.stroke();
  c.strokeStyle = '#3a3d4a'; c.lineWidth = 5 + lw * 2; c.stroke(BP.k); c.strokeStyle = '#c3c8d0'; c.lineWidth = 4; c.stroke(BP.k);
  c.strokeStyle = lineOf(color); c.lineWidth = 5.5 + lw * 2; c.stroke(BP.f); c.strokeStyle = color; c.lineWidth = 5.5; c.stroke(BP.f);
  c.strokeStyle = alpha(tone(color, 0.45), 0.7); c.lineWidth = 1.6; c.save(); c.translate(-0.8, -1.4); c.stroke(BP.f); c.restore();
  c.strokeStyle = '#1e2029'; c.lineWidth = lw * 2; c.stroke(BP.saddle); c.fillStyle = '#3a3340'; c.fill(BP.saddle);
  c.strokeStyle = '#23252f'; c.lineWidth = 7; c.beginPath(); c.moveTo(B.bar[0] - 3, B.bar[1]); c.lineTo(B.bar[0] + 7, B.bar[1] + 1); c.stroke();
  c.fillStyle = '#2a2d38'; c.beginPath(); c.arc(B.bbx, B.bby, 11, 0, TAU); c.fill();
  c.fillStyle = '#8a909c'; c.beginPath(); c.arc(B.bbx, B.bby, 5, 0, TAU); c.fill();
}

function bikeXf(c, o, k) {
  const s = (o.s > 0 ? o.s : 1), flip = (o.flip ?? 1) < 0 ? -1 : 1, fall = clamp(o.fall ?? 0);
  c.translate(o.x ?? 0, o.y ?? 0); c.rotate((o.tilt ?? 0) * flip);
  if (fall > 0) c.transform(1, 0, -0.22 * fall, lerp(1, 0.22, fall), 0, 0);
  c.scale(flip, 1);
  return s;
}
export function drawBike(c, o = {}) {
  c.save();
  const s = bikeXf(c, o), k = s * (o.k ?? 1), lw = inkW(k), ph = o.phase ?? 0, col = o.color || '#2f9c95';
  if ((o.shadow ?? 1) > 0) shadow(c, 0, 0, 125 * k, 13 * k, 0.24 * (o.shadow ?? 1));
  c.scale(k, k);
  bikeDraw(c, ph, lw, 'back', col); bikeDraw(c, ph, lw, 'mid', col); bikeDraw(c, ph, lw, 'front', col);
  c.restore();
}
export function drawCyclist(c, o = {}) {
  const v = clamp(o.vanish ?? 0), who = o.who ?? 'walkerA', D = dims(who), kb = D.H / 330;
  if (v >= 1) { drawBike(c, { ...o, k: kb }); return; }
  c.save();
  const s = bikeXf(c, o), k = s * kb, lw = inkW(k), ph = o.phase ?? 0, col = o.color || '#2f9c95';
  const hp = { who, x: 0, y: 0, s, flip: 1, t: o.t ?? 0, seed: o.seed ?? 0, pose: 'ride', phase: ph, vanish: v, shadow: 0, look: o.look, smile: o.smile };
  const bike = (part) => { c.save(); c.scale(k, k); bikeDraw(c, ph, lw, part, col); c.restore(); };
  shadow(c, 0, 0, 125 * k, 13 * k, 0.24 * (o.shadow ?? 1));
  bike('back');
  drawHuman(c, { ...hp, _pass: 'back' });
  bike('mid'); bike('front');
  drawHuman(c, { ...hp, _pass: 'front' });
  c.restore();
}
