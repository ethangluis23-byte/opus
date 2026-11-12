// Dog rig: side-view body with a three-quarter head. One rig covers every dog in the film (breeds, puppies,
// feral descendants) through the variant table below.
//
// drawDog(c, {
//   x, y, s, flip,        ground point under the body, scale (1 = 100 units to the shoulder... about 150px tall at s 1), facing
//   t,                    seconds, drives breathing / blinking / tail / ear life
//   v,                    variant object or key of DOGS (default golden)
//   pose,                 'stand' | 'sit' | 'lie' | 'bow' | 'up', or [from, to, k] to blend
//   gait, phase,          'walk' | 'trot' | 'run' | 'stalk' and cycle phase (cycles). Advance phase by distance / dogStride().
//   mood,                 'neutral' | 'happy' | 'sad' | 'alert' | 'scared' | 'angry' | 'sleepy' | 'asleep'
//   headDown, headUp,     0..1 (sniffing / resting on paws, looking up / howling)
//   tilt,                 radians, extra head rotation (the curious head tilt)
//   look,                 [dx, dy] pupil direction, -1..1 (dx > 0 = forward)
//   mouth, tongue, brow, lid, ear, wag, tailUp, hackles     overrides of the mood defaults
//   puppy,                0..1 juvenile proportions
//   paw,                  0..1 phase for scratching when pose is 'up'
//   carry,                (c) => draw something held in the mouth, in head units at the lips
//   shadow,               ground shadow strength (default 0.3, 0 to disable)
// })
import { blob, capsule, circle, oval, union, fill, line, clipped, lin, rad, shadow, ik2, poly } from '../engine/draw.js';
import { TAU, DEG, clamp, lerp, mix, tone, alpha } from '../engine/util.js';
import { eye, blink, gaitFoot, GAITS, inkW } from './rig.js';

export const DOGS = {
  // The hero: golden retriever with a red collar.
  golden: { coat: '#eaa63f', dark: '#c47d25', light: '#f8cd76', cream: '#fce6b4', line: '#5a3212', nose: '#33221a', ear: '#cf8a2b', iris: '#70421f',
    earType: 0, fluff: 1, lean: 0, legK: 1, muzzle: 1, collar: '#d9453c', tail: 'plume' },
  // Feral descendants of the hero line: same golden coat and cream chest, progressively leaner with rising ears.
  golden20: { coat: '#e5a443', dark: '#bd7a27', light: '#f4c873', cream: '#f9e2b0', line: '#573012', nose: '#33221a', ear: '#c98529', iris: '#70421f',
    earType: 0.45, fluff: 0.55, lean: 0.4, legK: 1.03, muzzle: 1.04, collar: null, tail: 'plume' },
  golden50: { coat: '#dfa148', dark: '#b5762a', light: '#efc377', cream: '#f6dfae', line: '#552f13', nose: '#33221a', ear: '#c18128', iris: '#70421f',
    earType: 0.8, fluff: 0.28, lean: 0.7, legK: 1.06, muzzle: 1.08, collar: null, tail: 'bush' },
  golden200: { coat: '#dba04b', dark: '#af722b', light: '#ecc17a', cream: '#f5ddaa', line: '#532e13', nose: '#33221a', ear: '#bb7d29', iris: '#70421f',
    earType: 1, fluff: 0.18, lean: 0.85, legK: 1.08, muzzle: 1.1, collar: null, tail: 'bush' },
  // Other pets seen in the first years.
  shepherd: { coat: '#c98d4a', dark: '#8f5a2a', light: '#e0ad6a', cream: '#e9c896', line: '#3a2414', nose: '#241a16', ear: '#4a3424', iris: '#5a3a1c',
    earType: 1, fluff: 0.3, lean: 0.4, legK: 1.05, muzzle: 1.12, collar: '#3b6fb5', tail: 'bush', saddle: '#3d2c22', mask: '#3d2c22' },
  beagle: { coat: '#f4efe6', dark: '#cfc6b8', light: '#ffffff', cream: '#ffffff', line: '#3e2a1c', nose: '#2a1d18', ear: '#8a5630', iris: '#5a3a1c',
    earType: 0, fluff: 0, lean: 0.1, legK: 0.8, muzzle: 0.9, collar: '#2f9e6b', tail: 'thin', saddle: '#8a5630', headCol: '#a86a3a', size: 0.78 },
  husky: { coat: '#8f98a6', dark: '#5f6876', light: '#b8c0cc', cream: '#f4f6f8', line: '#2c3038', nose: '#23252b', ear: '#6d7684', iris: '#7fc4ea',
    earType: 1, fluff: 0.5, lean: 0.3, legK: 1.02, muzzle: 1.0, collar: '#c0392b', tail: 'curl', belly: '#f4f6f8', size: 1 },
  terrier: { coat: '#f1ece2', dark: '#c9c0b2', light: '#ffffff', cream: '#ffffff', line: '#463426', nose: '#2a1d18', ear: '#b9773d', iris: '#4a2f18',
    earType: 0.55, fluff: 0.35, lean: 0.2, legK: 0.78, muzzle: 0.8, collar: '#e0a52e', tail: 'stub', patch: '#b9773d', size: 0.62 },
  pug: { coat: '#e3c497', dark: '#b99a6e', light: '#f3dcb6', cream: '#f3dcb6', line: '#3b2a1c', nose: '#1d1512', ear: '#3b2c24', iris: '#3a2616',
    earType: 0.1, fluff: 0, lean: -0.5, legK: 0.62, muzzle: 0.3, collar: '#9b59b6', tail: 'curl', mask: '#3b2c24', size: 0.56 },
  dachshund: { coat: '#9a5a2c', dark: '#6f3d1b', light: '#b9763f', cream: '#c98a52', line: '#34200f', nose: '#1f1611', ear: '#7d4520', iris: '#3a2616',
    earType: 0, fluff: 0, lean: 0, legK: 0.42, muzzle: 1.15, collar: '#2e86c1', tail: 'thin', size: 0.66, bodyK: 1.18 },
  blacklab: { coat: '#3a3838', dark: '#1f1e20', light: '#5a5859', cream: '#4a4848', line: '#0f0e10', nose: '#0f0e10', ear: '#2a292b', iris: '#8a5a2a',
    earType: 0, fluff: 0.1, lean: 0.1, legK: 1, muzzle: 1, collar: '#f1c40f', tail: 'thin' },
  mutt: { coat: '#b98a5a', dark: '#8a6238', light: '#d3a877', cream: '#ecd3ad', line: '#3d2817', nose: '#2a1d18', ear: '#7a5230', iris: '#5a3a1c',
    earType: 0.6, fluff: 0.3, lean: 0.4, legK: 0.98, muzzle: 1, collar: null, tail: 'bush', size: 0.9 },
  // Long-run free-breeding types (50+ years): sandy, prick-eared, lean.
  wildBig: { coat: '#d39a4c', dark: '#a56d2a', light: '#e6bc78', cream: '#f1d9a8', line: '#4d2c14', nose: '#2c1f18', ear: '#b0742a', iris: '#8a5a22',
    earType: 1, fluff: 0.3, lean: 0.75, legK: 1.14, muzzle: 1.14, collar: null, tail: 'bush', size: 1.12 },
  wildSmall: { coat: '#c99a5e', dark: '#9c7038', light: '#dfba84', cream: '#efdcb4', line: '#4a2f18', nose: '#2c1f18', ear: '#a87a3c', iris: '#7a5222',
    earType: 1, fluff: 0.2, lean: 0.9, legK: 0.96, muzzle: 1.05, collar: null, tail: 'bush', size: 0.7 },
};

const MOODS = {
  neutral: { mouth: 0, tongue: 0, brow: 0, lid: 0, ear: 0, wag: 0.12, tailUp: 0.15, hackles: 0 },
  happy: { mouth: 0.75, tongue: 1, brow: 0.05, lid: 0, ear: 0.2, wag: 1, tailUp: 0.5, hackles: 0 },
  sad: { mouth: 0, tongue: 0, brow: -1, lid: 0.22, ear: -0.35, wag: 0, tailUp: -0.75, hackles: 0 },
  alert: { mouth: 0, tongue: 0, brow: 0.25, lid: 0, ear: 1, wag: 0, tailUp: 0.45, hackles: 0 },
  scared: { mouth: 0.1, tongue: 0, brow: -0.7, lid: 0, ear: -1, wag: 0, tailUp: -1, hackles: 0 },
  angry: { mouth: 0.4, tongue: 0, brow: 1, lid: 0.2, ear: 0.6, wag: 0, tailUp: 0.9, hackles: 1 },
  sleepy: { mouth: 0, tongue: 0, brow: -0.2, lid: 0.6, ear: -0.2, wag: 0, tailUp: -0.4, hackles: 0 },
  asleep: { mouth: 0, tongue: 0, brow: -0.1, lid: 1, ear: -0.2, wag: 0, tailUp: -0.5, hackles: 0 },
};

const POSES = {
  stand: (S, FL) => ({ hip: [-S / 2, -(FL + 6)], sh: [S / 2, -(FL + 10)], neck: 50, fmode: [1, 0, 0], fold: 0, hfx: -8 }),
  sit: (S, FL) => {
    const hy = -27, sy = -(FL + 9), dx = Math.sqrt(Math.max(S * S - (sy - hy) ** 2, 400));
    return { hip: [-dx / 2 - 6, hy], sh: [dx / 2 - 6, sy], neck: 62, fmode: [1, 0, 0], fold: 1, hfx: 33 };
  },
  lie: (S) => ({ hip: [-S / 2, -24], sh: [S / 2 - 1, -31], neck: 46, fmode: [0, 1, 0], fold: 1, hfx: 38 }),
  bow: (S, FL) => ({ hip: [-S / 2 + 4, -(FL + 5)], sh: [S / 2 - 8, -33], neck: 60, fmode: [0, 1, 0], fold: 0, hfx: -6 }),
  up: (S, FL) => {
    const a = 64 * DEG, hip = [-24, -(FL * 0.82)];
    return { hip, sh: [hip[0] + Math.cos(a) * S, hip[1] - Math.sin(a) * S], neck: 68, fmode: [0, 0, 1], fold: 0.3, hfx: 6 };
  },
};
const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
function poseMix(pose, S, FL) {
  if (!Array.isArray(pose)) return POSES[pose || 'stand'](S, FL);
  const a = POSES[pose[0]](S, FL), b = POSES[pose[1]](S, FL), k = clamp(pose[2]);
  return { hip: lerp2(a.hip, b.hip, k), sh: lerp2(a.sh, b.sh, k), neck: lerp(a.neck, b.neck, k), fmode: a.fmode.map((v, i) => lerp(v, b.fmode[i], k)), fold: lerp(a.fold, b.fold, k), hfx: lerp(a.hfx, b.hfx, k) };
}

// World distance covered per gait cycle (advance phase by distance / dogStride to keep feet planted).
export function dogStride(gait = 'walk', v = 'golden', s = 1, puppy = 0) {
  const V = typeof v === 'string' ? DOGS[v] : { ...DOGS.golden, ...v };
  return GAITS[gait].stride * lerp(V.legK ?? 1, 1, 0.3) * lerp(1, 0.7, puppy) * (V.size ?? 1) * s;
}

const EAR_NEAR = [
  [[-7, -22], [-21, -17], [-30, 2], [-27, 24], [-15, 29], [-6, 15], [-3, -8]],
  [[-3, -22], [-15, -22], [-25, -38], [-23, -57, 1], [-12, -45], [-3, -32], [3, -17]],
];
const EAR_FAR = [
  [[8, -23], [20, -26], [28, -12], [24, -2], [14, -12]],
  [[5, -22], [12, -31], [23, -53, 1], [27, -35], [19, -20]],
];

export function drawDog(c, p) {
  const V = typeof p.v === 'string' ? DOGS[p.v] : { ...DOGS.golden, ...(p.v || {}) };
  const m = MOODS[p.mood || 'neutral'];
  const pick = (k) => (p[k] !== undefined ? p[k] : m[k]);
  const t = p.t ?? 0, pup = p.puppy ?? 0, size = (V.size ?? 1) * lerp(1, 0.5, pup);
  const s = (p.s ?? 1) * size, flip = p.flip ?? 1;
  const legK = (V.legK ?? 1) * lerp(1, 0.68, pup), bk = (V.bodyK ?? 1) * lerp(1, 0.8, pup), hk = lerp(1, 1.3, pup);
  const lean = V.lean ?? 0, fluff = lerp(V.fluff ?? 0, Math.max(V.fluff ?? 0, 0.6), pup);
  const S = 82 * bk, FL = 70 * legK, L = V.line, lw = inkW(s);
  const P = poseMix(p.pose, S, FL);
  const g = p.gait ? GAITS[p.gait] : null, ph = p.phase ?? 0;
  const gw = P.fmode[0] * (1 - P.fold); // how much the gait applies
  const breath = Math.sin(t * 1.7 + (p.seed ?? 0)) * 0.5 + 0.5;

  // ---- skeleton ----
  let hip = [...P.hip], sh = [...P.sh];
  if (g && gw > 0) {
    const bob = -g.bob * (0.5 - 0.5 * Math.cos(TAU * g.bobs * ph)) * gw;
    const pit = g.pitch * Math.sin(TAU * ph + 0.6) * gw;
    const cx = (hip[0] + sh[0]) / 2, cy = (hip[1] + sh[1]) / 2, rot = (q) => [cx + (q[0] - cx) * Math.cos(pit) - (q[1] - cy) * Math.sin(pit), cy + (q[0] - cx) * Math.sin(pit) + (q[1] - cy) * Math.cos(pit) + bob];
    hip = rot(hip); sh = rot(sh);
  }
  const sd = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]) || 1, ux = (sh[0] - hip[0]) / sd, uy = (sh[1] - hip[1]) / sd, nx = uy, ny = -ux; // n = dorsal side
  const sp = (a, b) => [hip[0] + ux * a * sd + nx * b, hip[1] + uy * a * sd + ny * b];
  const chest = lerp(30, 25, clamp(lean)) * (lean < 0 ? 1 - lean * 0.25 : 1) * lerp(1, 0.92, pup) + breath * 0.8;
  const tuck = lerp(17, 11.5, clamp(lean)) * (lean < 0 ? 1 - lean * 0.6 : 1);
  const torso = blob([sp(-0.12, 20), sp(-0.27, 3), sp(-0.2, -21), sp(0.3, -tuck), sp(0.84, -chest), sp(1.15, -13), sp(1.14, 9), sp(0.93, 23), sp(0.46, 18.5)]);

  // head placement
  const hd = clamp(pick('headDown') ?? 0), hu = clamp(pick('headUp') ?? 0);
  let nAng = lerp(lerp(P.neck, lerp(-28, -5, P.fmode[1]), hd), 84, hu) * DEG;
  const nLen = 48 * lerp(1, 0.86, pup) * lerp(1, 1.12, hd) * (g && gw ? 1 : 1);
  const nb = [sh[0] + 6, sh[1] - 4];
  const gaitNod = g && gw ? Math.sin(TAU * g.bobs * ph + 1.2) * 0.035 * gw : 0;
  nAng += gaitNod + Math.sin(t * 0.9 + 1.3) * 0.012;
  const hc = [nb[0] + Math.cos(nAng) * nLen, nb[1] - Math.sin(nAng) * nLen];
  const hRot = -(P.neck - 50) * DEG * 0.12 + hd * lerp(0.62, 0.1, P.fmode[1]) - hu * 0.85 + (p.tilt ?? 0) + gaitNod * 0.6;
  const neck = capsule(sh[0] + 1, sh[1] + 2, 22 - lean * 2.5, hc[0] - 5 * hk, hc[1] + 7 * hk, 15.5 * hk);

  // legs
  const fUp = 34 * legK, fLo = 36 * legK, th = 30 * legK, mt = 26 * legK;
  const fr = [11 - lean * 1.2, 8.6 - lean * 0.8, 7.2];
  const frontLeg = (far) => {
    const off = far ? [7, -1.5] : [0, 0], key = far ? 'ff' : 'nf';
    const root = [sh[0] + 4 + off[0], sh[1] + 12 + off[1]];
    let gx = 0, gy = 0;
    if (g && gw > 0) { const d = gaitFoot(ph + g.off[key], g); gx = d[0] * gw * lerp(legK, 1, 0.3); gy = d[1] * gw; }
    // mode 0: standing IK
    const a = ik2(root[0], root[1], P.sh[0] + 6 + off[0] + gx, gy, fUp, fLo, 1);
    const A = { j: [a.jx, a.jy], e: [a.ex, a.ey], toe: 0 };
    // mode 1: forearm resting on the ground, pointing forward
    const B = { j: [sh[0] + 2 + off[0], -7.5 + off[1]], e: [sh[0] + 48 * lerp(1, 0.8, pup) + off[0] * 1.6, -6.5 + off[1]], toe: 0 };
    // mode 2: reaching up (scratching at a door)
    const scr = Math.sin(TAU * ((p.paw ?? 0) + (far ? 0.5 : 0)));
    const ur = ik2(root[0], root[1], root[0] + 30 + off[0], root[1] - 22 + scr * 12, fUp, fLo, 1);
    const C = { j: [ur.jx, ur.jy], e: [ur.ex, ur.ey], toe: -1.1 };
    const w = P.fmode, mixp = (k) => [A[k][0] * w[0] + B[k][0] * w[1] + C[k][0] * w[2], A[k][1] * w[0] + B[k][1] * w[1] + C[k][1] * w[2]];
    const j = mixp('j'), e = mixp('e'), toe = C.toe * w[2] + (w[1] > 0.5 ? 0 : 0);
    const lift = g && gw > 0 ? clamp(-gy / g.lift) : 0;
    const pa = toe + lift * 0.9; // paw droops while swinging
    const paw = oval(e[0] + Math.cos(pa) * 5.5, e[1] - 5 + Math.sin(pa) * 5.5 + (w[1] > 0.5 ? 1 : 0), 11.2 * lerp(1, 1.12, pup), 6.8, pa);
    const parts = [capsule(j[0], j[1], fr[1], e[0], e[1] - 5, fr[2]), paw];
    if (w[1] < 0.5) parts.unshift(capsule(root[0], root[1], fr[0], j[0], j[1], fr[1]));
    return { parts, e, pa };
  };
  const hindLeg = (far) => {
    const off = far ? [7, -1.5] : [0, 0], key = far ? 'fh' : 'nh', f = P.fold;
    const hc2 = [hip[0] + lerp(3, 11, f) + off[0], hip[1] + lerp(12, 4, f) + off[1]];
    const haunch = oval(hc2[0], hc2[1], lerp(20, 28, f) - lean * 2, lerp(26, 23.5, f) - lean * 1.5, lerp(-0.2, 0.15, f));
    const knee = [hip[0] + lerp(13, 30, f) + off[0], hip[1] + lerp(30 * legK, 9, f) + off[1]];
    let gx = 0, gy = 0;
    if (g && gw > 0) { const d = gaitFoot(ph + g.off[key], g); gx = d[0] * gw * lerp(legK, 1, 0.3); gy = d[1] * gw; }
    const k = ik2(knee[0], knee[1], P.hip[0] + P.hfx + off[0] + gx, lerp(0, -3, f) + gy, th, mt, 1);
    const lift = g && gw > 0 ? clamp(-gy / g.lift) : 0, pa = lift * 0.8;
    const paw = oval(k.ex + Math.cos(pa) * 6, k.ey - 5 + Math.sin(pa) * 6, 11.5 * lerp(1, 1.12, pup), 6.6, pa);
    return { parts: [haunch, capsule(knee[0], knee[1], 9.5 - lean, k.jx, k.jy, 6.6), capsule(k.jx, k.jy, 6.6, k.ex, k.ey - 5, 6.2), paw], e: [k.ex, k.ey], haunch, pa };
  };
  const nf = frontLeg(false), ff = frontLeg(true), nh = hindLeg(false), fh = hindLeg(true);

  // fur tufts that break the silhouette (feathering on fluffy coats)
  const tufts = [];
  const tuft = (bx, by, dx, dy, w) => {
    const ix = bx - dx * 0.9, iy = by - dy * 0.9;
    tufts.push(blob([[ix - dy * w, iy + dx * w], [bx + dx * 0.2 - dy * w * 0.55, by + dy * 0.2 + dx * w * 0.55], [bx + dx, by + dy, 1], [bx + dx * 0.2 + dy * w * 0.55, by + dy * 0.2 - dx * w * 0.55], [ix + dy * w, iy - dx * w]]));
  };
  if (fluff > 0.25) {
    const k = fluff;
    { const q = sp(1.1, -chest * 0.62); tuft(q[0], q[1], 5 * k, 10 * k, 0.55); }
    { const q = sp(0.97, -chest * 0.9); tuft(q[0], q[1], 1 * k, 11 * k, 0.6); }
    for (const a of [0.3, 0.5, 0.68]) { const q = sp(a, -lerp(tuck, chest, clamp((a - 0.2) / 0.6)) + 3); tuft(q[0], q[1], -3 * k, 8 * k, 0.7); }
    { const q = sp(-0.21, -14); tuft(q[0], q[1], -8 * k, 7 * k, 0.6); }
  }
  const hk2 = clamp(pick('hackles') ?? 0);
  if (hk2 > 0.1) for (const a of [0.5, 0.62, 0.74, 0.86, 0.98]) { const q = sp(a, 16 + (a > 0.9 ? 3 : 0)); tuft(q[0], q[1], -3 * hk2, -9 * hk2, 0.5); }

  // tail
  const tailType = V.tail || 'plume', tUp = pick('tailUp') ?? 0.15, wag = pick('wag') ?? 0;
  const wagA = Math.sin(t * (p.wagSpeed ?? 11) + (p.seed ?? 0)) * wag * 0.42;
  const tb = sp(-0.24, 13);
  const tw = { plume: [[7, 9], [6.5, 15], [5, 13], [2.5, 6]], bush: [[6.5, 8], [7, 11], [6, 10], [3, 5]], thin: [[4.5, 4.5], [4, 4], [3, 3], [1.6, 1.6]], curl: [[6, 7], [6, 8], [5, 7], [3, 4]], stub: [[5, 5], [4, 4]] }[tailType];
  const segs = tw.length, segLen = tailType === 'stub' ? 9 : lerp(22, 17, pup) * (tailType === 'thin' ? 1.05 : 1);
  let ta = Math.PI + tUp * 0.8 + (tailType === 'curl' ? 0.9 : 0) + Math.atan2(uy, ux) * 0.5, tp = [...tb];
  const cen = [[...tp]], nor = [];
  for (let i = 0; i < segs; i++) {
    ta += (tailType === 'curl' ? 0.75 : tUp * 0.13) + wagA * (0.5 + i * 0.5) + Math.sin(t * 2 + i) * 0.02;
    tp = [tp[0] + Math.cos(ta) * segLen, Math.min(tp[1] + Math.sin(ta) * segLen, -5)];
    cen.push([...tp]); nor.push([Math.sin(ta), -Math.cos(ta)]);
  }
  const upE = [], loE = [];
  for (let i = 0; i < segs; i++) {
    const q = cen[i], n2 = nor[i], w = tw[i];
    upE.push([q[0] - n2[0] * w[0], q[1] - n2[1] * w[0]]);
    loE.push([q[0] + n2[0] * w[1] * lerp(1, 1.0, fluff), q[1] + n2[1] * w[1]]);
  }
  const tip = cen[segs];
  const tail = blob([...upE, [tip[0], tip[1]], ...loE.reverse()]);

  // ---- draw ----
  c.save();
  c.translate(p.x, p.y); c.scale(s * flip, s);
  if ((p.shadow ?? 0.3) > 0) shadow(c, (hip[0] + sh[0]) / 2 + 6, 1, S * 0.72 + 22, 9, p.shadow ?? 0.3);
  c.lineJoin = 'round'; c.lineCap = 'round';

  // far legs
  const farCol = mix(V.dark, L, 0.07);
  for (const leg of [fh, ff]) {
    const u = union(...leg.parts);
    fill(c, u, farCol); line(c, u, L, lw);
  }
  // tail
  { const ys = cen.map((q) => q[1]), y0 = Math.min(...ys) - 8, y1 = Math.max(...ys) + 12;
    fill(c, tail, lin(c, 0, y0, 0, y1, [[0, V.coat], [1, tailType === 'plume' ? mix(V.coat, V.cream, 0.65) : V.dark]])); }
  line(c, tail, L, lw);

  // near silhouette: one merged outline; markings stay on the trunk, legs are painted over them
  const legParts = [...nh.parts, ...nf.parts];
  const trunk = union(torso, neck, ...tufts);
  const sil = union(trunk, ...legParts);
  const top = Math.min(hip[1], sh[1]) - 26;
  const coatGrad = lin(c, 0, top, 0, 2, [[0, V.light], [0.42, V.coat], [1, V.dark]]);
  fill(c, sil, coatGrad);
  clipped(c, trunk, () => {
    if (V.saddle) fill(c, blob([sp(-0.2, 26), sp(-0.05, -2), sp(0.4, 2), sp(0.85, 4), sp(1.05, 26), sp(0.5, 30)]), V.saddle);
    if (V.patch) fill(c, oval(...sp(0.3, 8), 22, 17, 0.3), V.patch);
    if (V.belly) fill(c, blob([sp(-0.25, -14), sp(0.3, -4), sp(0.9, -12), sp(1.2, -2), sp(1.2, -40), sp(0.3, -40), sp(-0.3, -34)]), V.belly);
    const ca = lerp(0.3, 0.95, clamp(fluff));
    const q = sp(1.07, -chest * 0.5);
    c.fillStyle = rad(c, q[0], q[1], 40, [[0, alpha(V.cream, ca)], [0.5, alpha(V.cream, ca * 0.8)], [1, alpha(V.cream, 0)]]);
    c.fillRect(q[0] - 40, q[1] - 40, 80, 80);
    const b2 = sp(0.5, -(tuck + chest) * 0.5 - 4);
    c.save(); c.translate(b2[0], b2[1]); c.rotate(Math.atan2(uy, ux)); c.scale(1, 0.34);
    c.fillStyle = rad(c, 0, 0, S * 0.5, [[0, alpha(V.cream, ca * 0.9)], [0.6, alpha(V.cream, ca * 0.5)], [1, alpha(V.cream, 0)]]);
    c.fillRect(-S, -S, S * 2, S * 2); c.restore();
  });
  clipped(c, union(...legParts), () => {
    const f0 = clamp((sh[1] + 6 - top) / (2 - top)), f1 = clamp((sh[1] + 30 - top) / (2 - top));
    c.fillStyle = lin(c, 0, top, 0, 2, [[0, alpha(V.coat, 0)], [f0, alpha(V.coat, 0)], [f1, mix(V.coat, V.dark, f1 * 0.5)], [1, V.dark]]);
    c.fillRect(-400, top - 60, 800, 500);
    if (V.socks) { c.fillStyle = V.socks; c.fillRect(-400, -FL * 0.46, 800, FL); }
  });
  clipped(c, sil, () => {
    // soft form shadow underneath, rim light along top edges, a hint of the thigh
    c.fillStyle = lin(c, 0, -34, 0, 0, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.5)]]);
    c.fillRect(-400, -34, 800, 40);
    c.save(); c.translate(1.2, 2.8); c.globalAlpha = 0.34; line(c, sil, V.light, lw * 2.4); c.restore();
    c.save(); c.globalAlpha = 0.36; c.strokeStyle = L; c.lineWidth = lw * 0.8; c.beginPath();
    const f = P.fold, off0 = [hip[0] + lerp(3, 11, f), hip[1] + lerp(12, 4, f)];
    c.ellipse(off0[0], off0[1], lerp(20, 28, f) - lean * 2, lerp(26, 23.5, f) - lean * 1.5, lerp(-0.2, 0.15, f), -1.25, 0.75); c.stroke(); c.restore();
  });
  line(c, sil, L, lw);
  // toes
  c.strokeStyle = alpha(L, 0.7); c.lineWidth = lw * 0.7;
  for (const leg of [nf, nh]) {
    for (const d of [2.5, 7.5]) {
      const bx = leg.e[0] + Math.cos(leg.pa) * (4 + d), by = leg.e[1] - 3.5 + Math.sin(leg.pa) * (4 + d);
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 0.8, by + 3.2); c.stroke();
    }
  }
  // collar
  if (V.collar) {
    const cx = lerp(sh[0] + 1, hc[0] - 5 * hk, 0.56), cy = lerp(sh[1] + 2, hc[1] + 7 * hk, 0.56), r = lerp(22 - lean * 2.5, 15.5 * hk, 0.56) + 0.6;
    const dx = hc[0] - sh[0], dy = hc[1] - sh[1], dl = Math.hypot(dx, dy) || 1, px = -dy / dl, py = dx / dl;
    c.strokeStyle = L; c.lineWidth = 8 + lw; c.beginPath(); c.moveTo(cx - px * r, cy - py * r); c.lineTo(cx + px * r, cy + py * r); c.stroke();
    c.strokeStyle = V.collar; c.lineWidth = 7.2; c.beginPath(); c.moveTo(cx - px * r, cy - py * r); c.lineTo(cx + px * r, cy + py * r); c.stroke();
    const tx = cx + px * r * 0.86 + 2, ty = cy + py * r * 0.86 + 6.5 + Math.sin(t * 3) * 0.4;
    const tg = circle(tx, ty, 5.2);
    fill(c, tg, '#f6c544'); line(c, tg, L, lw * 0.75);
  }

  // ---- head ----
  c.save();
  c.translate(hc[0], hc[1]); c.rotate(hRot); c.scale(hk, hk);
  const mz = (V.muzzle ?? 1) * lerp(1, 0.7, pup), X = (x) => (x > 4 ? 4 + (x - 4) * mz : x);
  const earIn = pick('ear') ?? 0, earT = clamp((V.earType ?? 0) + Math.max(0, earIn) * 0.22 * (1 - Math.abs((V.earType ?? 0) - 0.5) * 0.6));
  const earBack = Math.max(0, -earIn), earSway = (g && gw ? Math.sin(TAU * g.bobs * ph) * 0.1 * (1 - earT) : 0) + Math.sin(t * 1.3) * 0.015;
  const earPts = (tab, piv, far) => {
    const a = earBack * (0.5 + 0.3 * earT) + earSway * (far ? -1 : 1) - earT * 0 + (earIn > 0 ? -0.06 * earIn : 0), ca = Math.cos(a), sa = Math.sin(a);
    return tab[0].map((q, i) => {
      const x = lerp(q[0], tab[1][i][0], earT) - piv[0], y = lerp(q[1], tab[1][i][1], earT) - piv[1];
      const sharp = earT > 0.6 ? tab[1][i][2] : 0;
      return [piv[0] + x * ca + y * sa * (far ? 1 : -1), piv[1] - x * sa * (far ? 1 : -1) + y * ca, sharp];
    });
  };
  const earCol = V.ear || V.dark;
  // far ear
  const efar = blob(earPts(EAR_FAR, [12, -22], true));
  fill(c, efar, mix(earCol, L, 0.25)); line(c, efar, L, lw);
  // lower jaw + tongue (behind the muzzle)
  const mo = clamp(pick('mouth') ?? 0), tg2 = clamp(pick('tongue') ?? 0);
  if (mo > 0.04) {
    const d = mo * 13;
    const jaw = blob([[9, 13], [X(34), 12], [X(39), 15 + d * 0.9], [X(27), 19 + d * 1.25], [11, 17 + d * 0.8]]);
    fill(c, jaw, '#6a2424'); 
    clipped(c, jaw, () => { fill(c, oval(X(26), 21 + d * 0.9, 12 * mz + 2, 5 + d * 0.5, 0.05), '#f58d9b'); });
    line(c, jaw, L, lw);
    if (tg2 > 0.3) {
      const tl = blob([[X(22), 16 + d * 0.5], [X(33), 15 + d * 0.5], [X(35), 22 + d * 1.3 + tg2 * 5], [X(28), 27 + d * 1.4 + tg2 * 7], [X(21), 22 + d * 1.2 + tg2 * 4]]);
      fill(c, tl, '#f58d9b'); line(c, tl, L, lw * 0.85);
      c.strokeStyle = alpha('#c75a6e', 0.8); c.lineWidth = lw * 0.6; c.beginPath(); c.moveTo(X(27), 18 + d * 0.6); c.lineTo(X(28), 23 + d * 1.2 + tg2 * 4); c.stroke();
    }
  }
  const skull = circle(0, 0, 25);
  const muzzle = blob([[4, -2], [X(22), -4], [X(38), 0], [X(45), 7], [X(41), 17], [X(24), 21.5], [6, 20], [-3, 9]]);
  const parts = [skull, muzzle];
  if (fluff > 0.3) parts.push(poly([[-17, 12], [-29, 21], [-15, 23]]), poly([[-9, 19], [-17, 31], [-3, 25]]));
  const hsil = union(...parts);
  const headCol = V.headCol || V.coat;
  fill(c, hsil, lin(c, 0, -26, 0, 24, [[0, mix(headCol, V.light, V.headCol ? 0.25 : 0.75)], [0.5, headCol], [1, mix(headCol, V.dark, 0.6)]]));
  clipped(c, hsil, () => {
    // muzzle + blaze
    const mcol = V.mask || V.cream;
    fill(c, blob([[1, 2], [X(22), -1], [X(40), 2], [X(47), 8], [X(42), 19], [X(24), 24], [4, 23], [-4, 12]]), mcol);
    if (!V.mask) { c.globalAlpha = 0.55; fill(c, oval(10, -6, 5.5, 13, 0.1), V.cream); c.globalAlpha = 1; }
    if (V.mask) { c.globalAlpha = 0.75; fill(c, oval(10, -8, 17, 9, 0), V.mask); c.globalAlpha = 1; }
    c.fillStyle = lin(c, 0, 4, 0, 26, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.5)]]);
    c.fillRect(-30, 4, 90, 26);
  });
  line(c, hsil, L, lw);
  // mouth line
  const nxp = X(43), smile = (mo > 0.04 ? 0.5 : 0) + (p.smile ?? (m === MOODS.happy ? 1 : m === MOODS.sad ? -0.6 : 0.25));
  c.strokeStyle = L; c.lineWidth = lw * 0.9;
  c.beginPath(); c.moveTo(nxp - 1.5, 9.5); c.lineTo(nxp - 4, 14.5);
  c.quadraticCurveTo(X(27), 19.5 + smile * 2.6, 12, 16.5 - smile * 2.4); c.stroke();
  if ((pick('brow') ?? 0) > 0.7 && mo > 0.2) { // snarl: a flash of teeth
    c.fillStyle = '#fffdf5';
    for (const tx of [X(30), X(24), X(18)]) { c.beginPath(); c.moveTo(tx - 2.4, 17.6); c.lineTo(tx, 22.5); c.lineTo(tx + 2.4, 17.9); c.closePath(); c.fill(); }
  }
  // nose
  const nose = blob([[nxp - 6.5, 2.5], [nxp, 0.2], [nxp + 5.5, 3.5], [nxp + 4, 9], [nxp - 2, 10.2], [nxp - 6, 7]]);
  fill(c, nose, V.nose); line(c, nose, L, lw * 0.7);
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(nxp - 1.5, 3.4, 2.6, 1.3, -0.2, 0, TAU); c.fill();
  // whisker dots
  c.fillStyle = alpha(L, 0.45);
  for (const [dx, dy] of [[-12, 12], [-17, 14.5], [-10, 16]]) { c.beginPath(); c.arc(nxp + dx * mz, dy, 0.9, 0, TAU); c.fill(); }
  // eyes
  const brow = pick('brow') ?? 0, bl = p.blink ?? blink(t, p.seed ?? 1);
  const lid = clamp(Math.max(pick('lid') ?? 0, bl)), look = p.look || [0.25, 0.05];
  const er = 8.6 * lerp(1, 1.14, pup), fx = lerp(14, 20, clamp(mz));
  const lidCol = mix(headCol, V.light, 0.3);
  const sadA = brow < 0 ? -brow * 0.42 : -brow * 0.38;
  eye(c, { x: fx, y: -9.6, r: er * 0.88, look, iris: V.iris, lid, lidAng: sadA, lidColor: lidCol, line: L, lw: lw * 0.85, happy: m === MOODS.happy, low: brow > 0.6 ? 0.25 : 0 });
  eye(c, { x: 1.5, y: -8.2, r: er, look, iris: V.iris, lid, lidAng: -sadA, lidColor: lidCol, line: L, lw: lw * 0.85, happy: m === MOODS.happy, low: brow > 0.6 ? 0.25 : 0 });
  // brows
  c.strokeStyle = mix(L, headCol, 0.25); c.lineWidth = lw * 1.25;
  const br = (bx, by, dir) => { const a = dir * brow * -0.5; c.beginPath(); c.moveTo(bx - Math.cos(a) * 5, by - Math.sin(a) * 5 - Math.max(0, -brow) * 1.5); c.lineTo(bx + Math.cos(a) * 5, by + Math.sin(a) * 5 - Math.max(0, -brow) * 1.5); c.stroke(); };
  br(0.5, -8.2 - er - 3.2, -1); br(fx + 0.5, -9.6 - er * 0.88 - 3, 1);
  // near ear
  const enear = blob(earPts(EAR_NEAR, [-6, -19], false));
  fill(c, enear, lin(c, 0, -30, 0, 28, [[0, mix(earCol, V.light, 0.25)], [1, mix(earCol, L, 0.12)]]));
  if (earT > 0.55) clipped(c, enear, () => { c.globalAlpha = 0.5; fill(c, blob([[-8, -24], [-17, -30], [-21, -50], [-13, -40]]), mix(V.cream, '#f4a59a', 0.35)); c.globalAlpha = 1; });
  line(c, enear, L, lw);
  if (p.carry) { c.save(); c.translate(X(36), 15); p.carry(c); c.restore(); }
  c.restore();

  c.restore();
}
