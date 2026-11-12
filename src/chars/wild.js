// Wild animals: deer (doe / stag / fawn) and red fox. Side-view body, three-quarter head, same conventions as drawDog.
//
// drawDeer(c, {
//   x, y, s, flip,     ground point under the body, scale (s 1: doe ~190 units to the top of the head, ~210 with ears,
//                      ~150 long; stag 1.12x plus ~75 of antlers; fawn 0.55x), facing (1 right, -1 left)
//   t, seed,           seconds / individual offset: breathing, blinking, ear turns, tail flicks
//   v,                 'doe' | 'stag' (antlers, darker neck) | 'fawn' (spotted, small) or an object overriding DEER.doe
//   pose,              'stand' | 'graze' (head down to the grass) | 'alert' (head high, ears wide) | 'lower' (stag lowering
//                      its antlers in threat), or [from, to, k] to blend
//   gait, phase,       'walk' | 'trot' | 'bound' (leaping run, airborne around phase 0.25-0.5 and 0.75-1) and cycle phase.
//                      Advance phase by distance / deerStride(gait, v, s).
//   mood,              'neutral' | 'calm' | 'happy' | 'alert' | 'scared' | 'angry' | 'sleepy' | 'asleep'
//   look,              [dx, dy] pupil direction -1..1 (dx > 0 = forward)
//   headDown, headUp,  0..1 extra lowering / raising of the head; tilt = extra head rotation (radians)
//   ear (-1 back .. 1 pricked), lid, brow, tailUp (0 down .. 1 white flag raised), blink     overrides of the mood defaults
//   shadow,            ground shadow strength (default 0.3, 0 disables)
// })
// deerStride(gait = 'walk', v = 'doe', s = 1) -> distance per cycle (walk 78, trot 108, bound 230 for the doe at s 1).
//
// drawFox(c, { x, y, s, flip, t, seed, pose, gait, phase, mood, look, headDown, headUp, tilt, ear, lid, brow, tailUp, shadow })
//   red fox, ~76 units to the top of the head (92 with ears), ~85 long plus a 55-unit brush.
//   pose: 'stand' | 'sit' | 'crouch' (low, watching from cover) or [from, to, k]; gait: 'trot' | 'walk' | 'run'.
// foxStride(gait = 'trot', s = 1) -> distance per cycle (trot 40, walk 30, run 78 at s 1).
//
// Anchors (character units, before s/flip): deer shoulder ~(46, -116), head centre ~(80, -173) standing;
// fox shoulder ~(21, -43), head centre ~(39, -62). Unknown poses / moods / gaits fall back to stand / neutral / none.
import { blob, capsule, circle, oval, union, fill, line, clipped, lin, rad, shadow, ik2, poly } from '../engine/draw.js';
import { TAU, DEG, clamp, lerp, mix, tone, alpha, hash, noise1 } from '../engine/util.js';
import { eye, blink, gaitFoot, inkW } from './rig.js';
import { Path2D } from '@napi-rs/canvas';

export const DEER = {
  doe: { coat: '#c98a50', dark: '#96602f', light: '#e6b47c', cream: '#f8ead0', line: '#4a2a14', nose: '#2a1c16', ear: '#b87a42', iris: '#4a2c16', hoof: '#3a2a22',
    size: 1, bodyK: 1, neckK: 1, headK: 1.2, antlers: 0, spots: 0 },
  stag: { coat: '#b97a44', dark: '#855126', light: '#d9a56c', cream: '#f4e4c6', line: '#44240f', nose: '#2a1c16', ear: '#a86c38', iris: '#4a2c16', hoof: '#35261f',
    size: 1.12, bodyK: 1.03, neckK: 1.14, headK: 1.12, antlers: 1, spots: 0 },
  fawn: { coat: '#d39a5c', dark: '#a56c38', light: '#edc08a', cream: '#fbf0da', line: '#4f2e16', nose: '#2a1c16', ear: '#c28648', iris: '#4a2c16', hoof: '#3f2e25',
    size: 0.55, bodyK: 0.8, neckK: 0.84, headK: 1.5, antlers: 0, spots: 1 },
};
export const FOX = { coat: '#dd6a2a', dark: '#a8431a', light: '#f39c55', cream: '#fcf2e2', line: '#4a1f10', nose: '#221815', ear: '#2f211c', iris: '#e9a23b', sock: '#33231e' };

const MOODS = {
  neutral: { ear: 0.2, lid: 0.06, brow: 0, tailUp: 0 },
  calm: { ear: 0, lid: 0.2, brow: 0, tailUp: 0 },
  happy: { ear: 0.35, lid: 0.04, brow: 0, tailUp: 0.3 },
  alert: { ear: 1, lid: 0, brow: 0.12, tailUp: 0.5 },
  scared: { ear: -0.75, lid: 0, brow: -0.8, tailUp: 1 },
  angry: { ear: -0.6, lid: 0.2, brow: 0.9, tailUp: 0.25 },
  sleepy: { ear: -0.2, lid: 0.55, brow: -0.2, tailUp: 0 },
  asleep: { ear: -0.3, lid: 1, brow: 0, tailUp: 0 },
};

const DGAITS = {
  walk: { duty: 0.64, off: { nh: 0, nf: 0.26, fh: 0.5, ff: 0.76 }, stride: 78, lift: 16, bob: 2, pitch: 0.01, bobs: 2 },
  trot: { duty: 0.5, off: { nh: 0, nf: 0.5, fh: 0.5, ff: 0 }, stride: 108, lift: 24, bob: 5, pitch: 0.014, bobs: 2 },
  bound: { duty: 0.22, off: { nh: 0, fh: 0.05, nf: 0.5, ff: 0.56 }, stride: 230, lift: 30, bob: 40, pitch: 0.17, arc: 1 },
};
const FGAITS = {
  walk: { duty: 0.64, off: { nh: 0, nf: 0.26, fh: 0.5, ff: 0.76 }, stride: 30, lift: 6, bob: 1, pitch: 0.01, bobs: 2 },
  trot: { duty: 0.5, off: { nh: 0, nf: 0.5, fh: 0.5, ff: 0 }, stride: 40, lift: 8.5, bob: 2.2, pitch: 0.016, bobs: 2 },
  run: { duty: 0.34, off: { nh: 0, fh: 0.1, nf: 0.48, ff: 0.6 }, stride: 78, lift: 14, bob: 6, pitch: 0.1, bobs: 1 },
};
const DPOSES = {
  stand: { hip: [-46, -112], sh: [46, -116], neck: 62, nlen: 1, hrot: 0.03, fold: 0, hfx: -21 },
  graze: { hip: [-46, -112], sh: [46, -108], neck: -60, nlen: 1.3, hrot: 1.12, fold: 0, hfx: -21 },
  alert: { hip: [-46, -112], sh: [46, -118], neck: 76, nlen: 1.05, hrot: -0.07, fold: 0, hfx: -21 },
  lower: { hip: [-47, -114], sh: [45, -105], neck: -12, nlen: 1, hrot: 1.02, fold: 0, hfx: -26 },
};
const FPOSES = {
  stand: { hip: [-21, -41], sh: [21, -43], neck: 48, nlen: 1, hrot: 0, fold: 0, hfx: -7 },
  sit: { hip: [-14, -16], sh: [16, -44], neck: 64, nlen: 1, hrot: 0.1, fold: 1, hfx: 19 },
  crouch: { hip: [-22, -22], sh: [22, -20.5], neck: 12, nlen: 0.9, hrot: -0.06, fold: 0, hfx: -9 },
};
function poseMix(tab, pose, bk) {
  const get = (n) => tab[n] || tab.stand;
  let P;
  if (Array.isArray(pose)) {
    const a = get(pose[0]), b = get(pose[1]), k = clamp(pose[2] ?? 0), l2 = (u, v) => [lerp(u[0], v[0], k), lerp(u[1], v[1], k)];
    P = { hip: l2(a.hip, b.hip), sh: l2(a.sh, b.sh), neck: lerp(a.neck, b.neck, k), nlen: lerp(a.nlen, b.nlen, k), hrot: lerp(a.hrot, b.hrot, k), fold: lerp(a.fold, b.fold, k), hfx: lerp(a.hfx, b.hfx, k) };
  } else { const a = get(pose); P = { ...a, hip: [...a.hip], sh: [...a.sh] }; }
  P.hip[0] *= bk; P.sh[0] *= bk;
  return P;
}
const arc = (ph, c0, w) => { const d = Math.abs(((((ph - c0 + 0.5) % 1) + 1) % 1) - 0.5) / w; return d < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * d) : 0; };

export function deerStride(gait = 'walk', v = 'doe', s = 1) {
  const V = typeof v === 'string' ? (DEER[v] || DEER.doe) : { ...DEER.doe, ...(v || {}) };
  return (DGAITS[gait] || DGAITS.walk).stride * (V.size ?? 1) * s;
}
export function foxStride(gait = 'trot', s = 1) { return (FGAITS[gait] || FGAITS.trot).stride * s; }

// Generic quadruped: skeleton + merged silhouette; K supplies proportions and the species-specific head / tail / markings.
function quad(c, p, V, K) {
  const m = MOODS[p.mood] || MOODS.neutral, pick = (k) => (p[k] !== undefined && p[k] !== null ? p[k] : m[k]);
  const t = p.t ?? 0, seed = p.seed ?? 0, s = (p.s ?? 1) * (V.size ?? 1), flip = p.flip === -1 ? -1 : 1;
  const L = V.line, lw = inkW(s) * K.lineK;
  const P = poseMix(K.poses, p.pose, V.bodyK ?? 1);
  const G = p.gait && K.gaits[p.gait] ? K.gaits[p.gait] : null, ph = p.phase ?? 0, gw = G ? 1 - P.fold : 0;
  const breath = Math.sin(t * 1.6 + seed) * 0.5 + 0.5;

  // ---- skeleton
  let hip = [...P.hip], sh = [...P.sh], air = 0;
  if (G && gw > 0) {
    const bob = (G.arc ? G.bob * (arc(ph, 0.37, 0.18) + 0.42 * arc(ph, 0.87, 0.16)) : G.bob * (0.5 - 0.5 * Math.cos(TAU * G.bobs * ph))) * gw;
    const pit = (G.arc ? -G.pitch * Math.cos(TAU * (ph - 0.2)) : G.pitch * Math.sin(TAU * ph + 0.6)) * gw;
    air = G.arc ? bob / G.bob : 0;
    hip[1] -= bob; sh[1] -= bob;
    const cx = (hip[0] + sh[0]) / 2, cy = (hip[1] + sh[1]) / 2, cp = Math.cos(pit), sp2 = Math.sin(pit);
    const rot = (q) => [cx + (q[0] - cx) * cp - (q[1] - cy) * sp2, cy + (q[0] - cx) * sp2 + (q[1] - cy) * cp];
    hip = rot(hip); sh = rot(sh);
  }
  const sd = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]) || 1, ux = (sh[0] - hip[0]) / sd, uy = (sh[1] - hip[1]) / sd, nx = uy, ny = -ux;
  const sp = (a, b) => [hip[0] + ux * a * sd + nx * b, hip[1] + uy * a * sd + ny * b];
  const torso = blob(K.torso(sp, breath, P));

  const hd = clamp(pick('headDown') ?? 0), hu = clamp(pick('headUp') ?? 0), nk = V.neckK ?? 1, hk = V.headK ?? 1;
  const nod = G && gw ? Math.sin(TAU * (G.bobs || 1) * ph + 1.2) * 0.035 * gw : 0;
  const nAng = (lerp(lerp(P.neck, K.neckDown, hd), 82, hu) - air * 16) * DEG + nod + Math.sin(t * 0.9 + 1.3 + seed) * 0.012;
  const nLen = K.nLen * nk * P.nlen * lerp(1, 1.15, hd);
  const nb = [sh[0] + K.nb[0], sh[1] + K.nb[1]];
  const hc = [nb[0] + Math.cos(nAng) * nLen, nb[1] - Math.sin(nAng) * nLen];
  const hRot = P.hrot + hd * K.hrotDown - hu * 0.75 + (p.tilt ?? 0) + nod * 0.6 + air * 0.12;
  const neck = capsule(sh[0] + K.neck[0], sh[1] + K.neck[1], K.neck[2] * nk, hc[0] + K.neck[3] * hk, hc[1] + K.neck[4] * hk, K.neck[5] * lerp(1, hk, 0.5) * lerp(1, nk, 0.6));

  // ---- legs
  const swing = (key) => { if (!(G && gw > 0)) return [0, 0, 0]; const d = gaitFoot(ph + G.off[key], G); return [d[0] * gw, d[1] * gw, clamp(-d[1] / G.lift)]; };
  const foot = (e, pa) => (K.hoof ? null : oval(e[0] + Math.cos(pa) * K.paw[2], e[1] + K.footH - K.paw[1] * 0.78 + Math.sin(pa) * K.paw[2], K.paw[0], K.paw[1], pa));
  const frontLeg = (far) => {
    const off = far ? K.farOff : [0, 0], [gx, gy, lf] = swing(far ? 'ff' : 'nf');
    const root = [sh[0] + K.fRoot[0] + off[0], sh[1] + K.fRoot[1] + off[1]];
    const a = ik2(root[0], root[1], P.sh[0] + K.fFoot + off[0] + gx, gy - K.footH + off[1], K.fUp, K.fLo, K.fBend);
    const e = [a.ex, a.ey], pa = lf * 0.9, parts = [capsule(root[0], root[1], K.fr[0], a.jx, a.jy, K.fr[1]), capsule(a.jx, a.jy, K.fr[1], e[0], e[1], K.fr[2])];
    const f = foot(e, pa); if (f) parts.push(f);
    return { parts, e, pa };
  };
  const hindLeg = (far) => {
    const off = far ? K.farOff : [0, 0], f = P.fold, [gx, gy, lf] = swing(far ? 'fh' : 'nh');
    const hA = K.haunch, hB = K.haunchF, kA = K.knee, kB = K.kneeF;
    const haunch = oval(hip[0] + lerp(hA[0], hB[0], f) + off[0], hip[1] + lerp(hA[1], hB[1], f) + off[1], lerp(hA[2], hB[2], f), lerp(hA[3], hB[3], f), lerp(-0.2, 0.15, f));
    const knee = [hip[0] + lerp(kA[0], kB[0], f) + off[0], hip[1] + lerp(kA[1], kB[1], f) + off[1]];
    const k = ik2(knee[0], knee[1], P.hip[0] + P.hfx + off[0] + gx, gy - K.footH + off[1] - f, K.th, K.mt, 1);
    const e = [k.ex, k.ey], pa = lf * 0.8, parts = [haunch, capsule(knee[0], knee[1], K.hr[0], k.jx, k.jy, K.hr[1]), capsule(k.jx, k.jy, K.hr[1], e[0], e[1], K.hr[2])];
    const ft = foot(e, pa); if (ft) parts.push(ft);
    return { parts, e, pa, haunch };
  };
  const nf = frontLeg(false), ff = frontLeg(true), nh = hindLeg(false), fh = hindLeg(true);
  const hoof = (leg, far) => {
    if (!K.hoof) return;
    c.save(); c.translate(leg.e[0], leg.e[1] - 0.6); c.rotate(leg.pa * 1.2);
    const h = poly([[-K.fr[2] - 0.2, 0], [K.fr[2] + 0.4, 0], [K.fr[2] + 2.6, K.footH + 0.6], [-K.fr[2] - 0.6, K.footH + 0.6]]);
    fill(c, h, far ? mix(V.hoof, L, 0.4) : V.hoof); line(c, h, L, lw * 0.85);
    if (!far) { c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(-K.fr[2] + 0.6, 1, 1.6, K.footH - 1.6); }
    c.restore();
  };

  // ---- draw
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s);
  const sa = p.shadow ?? 0.3;
  if (sa > 0) shadow(c, (P.hip[0] + P.sh[0]) / 2 + K.shadow[2], 1, K.shadow[0] * (1 - air * 0.3), K.shadow[1], sa * (1 - air * 0.45));
  c.lineJoin = 'round'; c.lineCap = 'round';
  const ctx = { V, L, lw, t, seed, sp, hip, sh, P, G, gw, ph, breath, pick, p, m, air, flip, hk };

  const farCol = mix(V.dark, L, 0.1);
  for (const leg of [fh, ff]) { const u = union(...leg.parts); fill(c, u, farCol); if (K.sock) clipped(c, union(...leg.parts.slice(leg.haunch ? 2 : 1)), () => K.sock(c, ctx, true)); line(c, u, L, lw); hoof(leg, true); }
  K.tail(c, ctx);

  const legParts = [...nh.parts, ...nf.parts];
  const trunk = union(torso, neck), sil = union(trunk, ...legParts);
  const top = Math.min(hip[1], sh[1]) - K.topPad;
  fill(c, sil, lin(c, 0, top, 0, 2, [[0, V.light], [0.4, V.coat], [1, V.dark]]));
  clipped(c, trunk, () => K.marks(c, ctx, { hc, nb, neck }));
  clipped(c, union(...legParts), () => {
    const f0 = clamp((sh[1] + K.legShade[0] - top) / (2 - top)), f1 = clamp((sh[1] + K.legShade[1] - top) / (2 - top));
    c.fillStyle = lin(c, 0, top, 0, 2, [[0, alpha(V.coat, 0)], [f0, alpha(V.coat, 0)], [f1, mix(V.coat, V.dark, f1 * 0.5)], [1, V.dark]]);
    c.fillRect(-500, top - 80, 1000, 600);
  });
  if (K.sock) clipped(c, union(...nh.parts.slice(2), ...nf.parts.slice(1)), () => K.sock(c, ctx, false));
  clipped(c, sil, () => {
    c.fillStyle = lin(c, 0, -K.under, 0, 0, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.45)]]);
    c.fillRect(-500, -K.under, 1000, K.under + 6);
    c.save(); c.translate(1.2, 2.8); c.globalAlpha = 0.34; line(c, sil, V.light, lw * 2.4); c.restore();
    // hint of the thigh
    const f = P.fold, hA = K.haunch, hB = K.haunchF;
    c.save(); c.globalAlpha = 0.34; c.strokeStyle = L; c.lineWidth = lw * 0.8; c.beginPath();
    c.ellipse(hip[0] + lerp(hA[0], hB[0], f), hip[1] + lerp(hA[1], hB[1], f), lerp(hA[2], hB[2], f), lerp(hA[3], hB[3], f), lerp(-0.2, 0.15, f), -1.2, 0.8); c.stroke(); c.restore();
  });
  line(c, sil, L, lw);
  hoof(nh, false); hoof(nf, false);
  if (!K.hoof) { // toes
    c.strokeStyle = alpha(K.toe || L, 0.7); c.lineWidth = lw * 0.7;
    for (const leg of [nf, nh]) for (const d of [1.2, 3.8]) {
      const bx = leg.e[0] + Math.cos(leg.pa) * (2 + d), by = leg.e[1] + K.footH - 2 + Math.sin(leg.pa) * (2 + d);
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 0.4, by + 1.7); c.stroke();
    }
  }
  // ---- head
  c.save();
  c.translate(hc[0], hc[1]); c.rotate(hRot); c.scale(hk, hk);
  K.head(c, ctx);
  c.restore();
  c.restore();
}

// Leaf-shaped ear: base (bx, by), pointing up when ang = 0 (negative ang tilts it backwards).
function leafEar(c, bx, by, len, wid, ang, colTop, colBot, inner, L, lw) {
  c.save(); c.translate(bx, by); c.rotate(ang);
  const e = blob([[-wid * 0.5, 2], [-wid, -len * 0.45], [-wid * 0.15, -len, 1], [wid * 0.9, -len * 0.5], [wid * 0.55, 2]]);
  fill(c, e, lin(c, 0, -len, 0, 2, [[0, colTop], [1, colBot]]));
  if (inner) clipped(c, e, () => fill(c, blob([[-wid * 0.2, 0], [-wid * 0.55, -len * 0.45], [-wid * 0.08, -len * 0.86, 1], [wid * 0.5, -len * 0.5], [wid * 0.3, 0]]), inner));
  line(c, e, L, lw);
  c.restore();
}
function eyes(c, o, ctx, near, far, iris, lidCol, extra = {}) {
  const { t, seed, pick, p, L, lw, m } = ctx;
  const brow = pick('brow') ?? 0, bl = p.blink ?? blink(t, seed + 1);
  const lid = clamp(Math.max(pick('lid') ?? 0, bl)), look = Array.isArray(p.look) ? p.look : [0.25, 0.05], sadA = -brow * 0.38;
  const base = { look, iris, lid, lidColor: lidCol, line: L, lw: lw * 0.85, happy: m === MOODS.happy, low: brow > 0.6 ? 0.25 : 0, ...extra };
  eye(c, { ...base, x: far[0], y: far[1], r: far[2], lidAng: sadA });
  eye(c, { ...base, x: near[0], y: near[1], r: near[2], lidAng: -sadA });
  return { brow, lid };
}

// ------------------------------------------------------------------ deer
let _ant = null;
function antlerPaths() {
  if (_ant) return _ant;
  const beam = new Path2D(), tines = new Path2D();
  beam.moveTo(0, 2); beam.bezierCurveTo(-7, -14, -15, -30, -10, -46); beam.bezierCurveTo(-7, -58, 4, -66, 15, -68);
  tines.moveTo(-2.5, -6); tines.quadraticCurveTo(6, -10, 12, -22);
  tines.moveTo(-9.5, -25); tines.quadraticCurveTo(-1, -31, 2, -44);
  tines.moveTo(-11, -43); tines.quadraticCurveTo(-20, -50, -22, -63);
  tines.moveTo(-3, -60); tines.quadraticCurveTo(-4, -70, -1, -79);
  _ant = { beam, tines };
  return _ant;
}
function antler(c, bx, by, ang, k, col, L, lw) {
  const { beam, tines } = antlerPaths();
  c.save(); c.translate(bx, by); c.rotate(ang); c.scale(k, k);
  line(c, beam, L, 5.4 + lw * 2); line(c, tines, L, 3.6 + lw * 2);
  line(c, tines, col, 3.6); line(c, beam, col, 5.4);
  c.save(); c.translate(-0.8, -0.6); line(c, beam, 'rgba(255,255,255,0.35)', 1.4); c.restore();
  c.restore();
}
const SPOTS = (() => { const a = []; for (let i = 0; i < 26; i++) a.push([-0.16 + hash(i, 3) * 1.2, 15 - (i % 4) * 7.5 - hash(i, 7) * 3, 2.2 + hash(i, 11) * 1.4]); return a; })();

const DEER_K = {
  poses: DPOSES, gaits: DGAITS, lineK: 1, hoof: true, footH: 7, farOff: [7, -1.5],
  nLen: 60, nb: [6, -4], neck: [-1, 9, 26, -4, 5, 11.5], neckDown: -60, hrotDown: 1.0,
  fRoot: [4, 34], fFoot: 5, fUp: 38, fLo: 38.6, fBend: -1, fr: [10, 5.2, 3.9],
  haunch: [4, 16, 25, 31], haunchF: [4, 16, 25, 31], knee: [12, 40], kneeF: [12, 40], th: 37, mt: 42, hr: [11, 5, 3.9],
  shadow: [86, 10, 4], topPad: 24, legShade: [40, 100], under: 50,
  torso: (sp, breath) => { const ch = 37 + breath * 0.9; return [sp(-0.12, 22), sp(-0.28, 6), sp(-0.25, -20), sp(0.05, -26), sp(0.4, -25), sp(0.84, -ch), sp(1.1, -26), sp(1.18, 0), sp(1.02, 24), sp(0.5, 19.5)]; },
  marks(c, { V, sp, L }, { hc, nb, neck }) {
    // pale belly, rump patch, throat
    const b = sp(0.42, -27);
    c.save(); c.translate(b[0], b[1]); c.scale(1, 0.26);
    c.fillStyle = rad(c, 0, 0, 62, [[0, alpha(V.cream, 0.95)], [0.6, alpha(V.cream, 0.6)], [1, alpha(V.cream, 0)]]); c.fillRect(-70, -70, 140, 140); c.restore();
    const r = sp(-0.3, -2);
    c.fillStyle = rad(c, r[0], r[1], 24, [[0, alpha(V.cream, 0.95)], [0.55, alpha(V.cream, 0.7)], [1, alpha(V.cream, 0)]]); c.fillRect(r[0] - 24, r[1] - 24, 48, 48);
    c.fillStyle = rad(c, hc[0] - 2, hc[1] + 20, 20, [[0, alpha(V.cream, 0.9)], [0.6, alpha(V.cream, 0.5)], [1, alpha(V.cream, 0)]]); c.fillRect(hc[0] - 24, hc[1] - 2, 46, 44);
    if (V.antlers) clipped(c, neck, () => {
      const mx = lerp(nb[0], hc[0], 0.5), my = lerp(nb[1], hc[1], 0.5) + 6, md = mix(V.dark, L, 0.35);
      c.fillStyle = rad(c, mx, my, 52, [[0, alpha(md, 0.5)], [0.55, alpha(md, 0.34)], [1, alpha(md, 0)]]); c.fillRect(mx - 52, my - 52, 104, 104);
    });
    // darker dorsal line
    c.strokeStyle = alpha(V.dark, 0.5); c.lineWidth = 7; c.beginPath(); const a0 = sp(-0.1, 22), a1 = sp(0.5, 19.5), a2 = sp(1.0, 24); c.moveTo(a0[0], a0[1]); c.quadraticCurveTo(a1[0], a1[1], a2[0], a2[1]); c.stroke();
    if (V.spots) { c.fillStyle = alpha(V.cream, 0.92); for (const [a, b2, rr] of SPOTS) { const q = sp(a, b2); c.beginPath(); c.ellipse(q[0], q[1], rr * 1.25, rr, 0, 0, TAU); c.fill(); } }
  },
  tail(c, { V, L, lw, sp, t, seed, pick, air }) {
    const up = clamp(Math.max(pick('tailUp') ?? 0, air)), k = t / 2.7 + hash(seed, 4), fr = k - Math.floor(k);
    const flick = fr < 0.16 ? Math.sin((fr / 0.16) * Math.PI) * Math.sin(t * 22) * 0.45 : 0;
    const tb = sp(-0.26, 11);
    c.save(); c.translate(tb[0], tb[1]); c.rotate(lerp(112, 246, up) * DEG + flick);
    const tl = blob([[-2, -5], [9, -7], [22, 0, 1], [9, 7], [-2, 5]]);
    fill(c, tl, lin(c, 0, -7, 0, 7, [[0, V.cream], [lerp(0.4, 0.75, up), V.cream], [lerp(0.5, 0.85, up), V.coat], [1, V.dark]]));
    line(c, tl, L, lw); c.restore();
  },
  head(c, ctx) {
    const { V, L, lw, t, seed, pick } = ctx;
    const e = clamp(pick('ear') ?? 0, -1, 1), turn = noise1(t * 0.45, seed + 3) * 0.16, tw = Math.sin(t * 0.8 + seed) * 0.04;
    const nearA = (e >= 0 ? lerp(-0.86, -0.66, e) : lerp(-0.86, -1.8, -e)) + tw, farA = (e >= 0 ? lerp(0.12, 0.46, e) : lerp(0.12, -1.25, -e)) + turn * (e > 0.6 ? 0.5 : 1);
    const earC = V.ear, inner = mix(V.cream, '#f0b8a0', 0.3);
    if (V.antlers) antler(c, 7.5, -12, 0.2, 0.96, mix('#e9d6ac', L, 0.3), L, lw);
    leafEar(c, 6, -11, 31, 9.5, farA, mix(earC, L, 0.2), mix(earC, L, 0.3), inner, L, lw);
    const skull = oval(0, 0, 15.5, 14.5), muzzle = blob([[3, -7], [19, -6], [32, -1], [38.5, 5.5], [36, 12.5], [25, 15], [9, 13.5], [-2, 8]]);
    const hsil = union(skull, muzzle);
    fill(c, hsil, lin(c, 0, -15, 0, 15, [[0, mix(V.coat, V.light, 0.8)], [0.5, V.coat], [1, mix(V.coat, V.dark, 0.6)]]));
    clipped(c, hsil, () => {
      fill(c, blob([[14, 16], [20, 9], [28, 4.5], [36, 3], [42, 8], [38, 16], [24, 18]]), V.cream);
      fill(c, blob([[-8, 16], [0, 10], [14, 12], [24, 16], [8, 20]]), alpha(V.cream, 0.9));
      c.fillStyle = alpha(V.cream, 0.85); c.beginPath(); c.ellipse(3.5, -2.2, 9.6, 9.2, 0, 0, TAU); c.ellipse(15.6, -4.2, 8, 8, 0, 0, TAU); c.fill();
      c.fillStyle = alpha(V.dark, V.antlers ? 0.5 : 0.3); c.beginPath(); c.ellipse(13, -13.5, 12, 4.6, 0.25, 0, TAU); c.fill();
      c.fillStyle = alpha(V.dark, 0.3); c.beginPath(); c.ellipse(27, -1.5, 9, 3, 0.42, 0, TAU); c.fill();
      c.fillStyle = lin(c, 0, 5, 0, 17, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.4)]]); c.fillRect(-18, 5, 62, 14);
    });
    line(c, hsil, L, lw);
    // mouth, nose
    const sm = ctx.m === MOODS.happy ? 1 : ctx.m === MOODS.scared || ctx.m === MOODS.angry ? -0.5 : 0.3;
    c.strokeStyle = L; c.lineWidth = lw * 0.85; c.beginPath(); c.moveTo(36.4, 10.6); c.quadraticCurveTo(30, 13.2 + sm * 1.4, 24.5, 11.4 - sm * 1.2); c.stroke();
    const nose = blob([[33.5, 1.5], [37.5, 0.4], [41, 3.6], [40, 8.4], [36.4, 9.6], [33.4, 6]]);
    fill(c, nose, V.nose); line(c, nose, L, lw * 0.7);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(36.6, 2.8, 2.2, 1.1, -0.2, 0, TAU); c.fill();
    eyes(c, null, ctx, [3.5, -2.4, 7], [15.6, -4.2, 5.9], V.iris, mix(V.coat, V.light, 0.35), { irisR: 0.8 });
    // lashes (doe, fawn) / heavy brow (stag)
    c.strokeStyle = L; c.lineWidth = lw * 0.85;
    if (!V.antlers) { c.beginPath(); c.moveTo(-2.4, -6.6); c.lineTo(-5.6, -8.6); c.moveTo(-3.4, -4); c.lineTo(-6.8, -5); c.stroke(); }
    const brow = pick('brow') ?? 0;
    if (V.antlers || Math.abs(brow) > 0.3) {
      c.lineWidth = lw * 1.2; c.strokeStyle = mix(L, V.coat, 0.2); const a = brow * 0.45 + (V.antlers ? 0.15 : 0);
      c.beginPath(); c.moveTo(3.5 - 6, -11.6 - a * 5); c.lineTo(3.5 + 6, -11.6 + a * 5); c.moveTo(15.6 - 5, -12 + a * 4); c.lineTo(15.6 + 5, -12 - a * 4); c.stroke();
    }
    if (V.antlers) antler(c, -3.5, -12.5, -0.16, 1.04, '#ecdcb4', L, lw);
    leafEar(c, -9, -8, 32, 10, nearA, mix(earC, V.light, 0.3), mix(earC, L, 0.1), e > 0.5 ? inner : null, L, lw);
  },
};
export function drawDeer(c, p = {}) {
  const V = typeof p.v === 'string' ? (DEER[p.v] || DEER.doe) : { ...DEER.doe, ...(p.v || {}) };
  quad(c, p, V, DEER_K);
}

// ------------------------------------------------------------------ fox
const FOX_K = {
  poses: FPOSES, gaits: FGAITS, lineK: 0.8, hoof: false, footH: 2.6, paw: [5.6, 3.4, 2.6], farOff: [3.6, -0.8], toe: '#c9b8a8',
  nLen: 22, nb: [3, -2], neck: [1, 1, 11.5, -3, 4, 8.6], neckDown: -24, hrotDown: 0.5,
  fRoot: [3, 8], fFoot: 4, fUp: 18, fLo: 17.6, fBend: 1, fr: [5.6, 4, 3.2],
  haunch: [2, 6, 11.5, 13.5], haunchF: [5, 3, 14.5, 13], knee: [8, 15], kneeF: [15, 6], th: 13.6, mt: 14.6, hr: [5.2, 3.6, 3.1],
  shadow: [42, 5.5, 2], topPad: 13, legShade: [8, 30], under: 17,
  torso: (sp, breath) => { const ch = 15 + breath * 0.5; return [sp(-0.12, 10.5), sp(-0.28, 2), sp(-0.22, -11), sp(0.3, -9), sp(0.84, -ch), sp(1.14, -7), sp(1.14, 5), sp(0.93, 12), sp(0.46, 10)]; },
  sock(c, { V }, far) {
    c.fillStyle = lin(c, 0, -15, 0, -8, [[0, alpha(V.sock, 0)], [1, far ? mix(V.sock, '#000000', 0.2) : V.sock]]);
    c.fillRect(-200, -15, 400, 18);
  },
  marks(c, { V, sp, P }) {
    const q = sp(1.08, -8);
    c.fillStyle = rad(c, q[0], q[1], 19, [[0, alpha(V.cream, 1)], [0.55, alpha(V.cream, 0.85)], [1, alpha(V.cream, 0)]]); c.fillRect(q[0] - 19, q[1] - 19, 38, 38);
    const b = sp(0.5, -11);
    c.save(); c.translate(b[0], b[1]); c.rotate(Math.atan2(P.sh[1] - P.hip[1], P.sh[0] - P.hip[0])); c.scale(1, 0.3);
    c.fillStyle = rad(c, 0, 0, 26, [[0, alpha(V.cream, 0.9)], [0.6, alpha(V.cream, 0.5)], [1, alpha(V.cream, 0)]]); c.fillRect(-30, -30, 60, 60); c.restore();
  },
  tail(c, { V, L, lw, sp, t, seed, pick, G, gw, ph, P }) {
    const up = pick('tailUp') ?? 0, run = G && gw ? 1 : 0, f = P.fold;
    const w = [[4, 4.5], [7, 8.5], [8.6, 10.4], [7.6, 9.2], [4.6, 5.4]], segLen = 12.5;
    let ta = Math.PI - lerp(0.62, 0.12, Math.max(run, clamp(up))) - f * 0.25 + up * 0.5, tp = sp(-0.25, 4.5);
    const sway = Math.sin(t * 1.8 + seed) * 0.05 + (run ? Math.sin(TAU * ph * 2) * 0.07 : 0);
    const cen = [[...tp]], nor = [];
    for (let i = 0; i < w.length; i++) {
      ta += lerp(0.1, 0.22, f) + up * 0.1 + sway * (0.4 + i * 0.4);
      tp = [tp[0] + Math.cos(ta) * segLen, Math.min(tp[1] + Math.sin(ta) * segLen, -6.5)];
      cen.push([...tp]); nor.push([Math.sin(ta), -Math.cos(ta)]);
    }
    const upE = [], loE = [];
    for (let i = 0; i < w.length; i++) { const q = cen[i], n = nor[i]; upE.push([q[0] - n[0] * w[i][0], q[1] - n[1] * w[i][0]]); loE.push([q[0] + n[0] * w[i][1], q[1] + n[1] * w[i][1]]); }
    const tip = cen[w.length], tail = blob([...upE, [tip[0], tip[1], 1], ...loE.reverse()]);
    const ys = cen.map((q) => q[1]), y0 = Math.min(...ys) - 9, y1 = Math.max(...ys) + 10;
    fill(c, tail, lin(c, 0, y0, 0, y1, [[0, V.light], [0.45, V.coat], [1, V.dark]]));
    clipped(c, tail, () => {
      const q = cen[w.length - 1];
      fill(c, circle(tip[0] + (tip[0] - q[0]) * 0.2, tip[1] + (tip[1] - q[1]) * 0.2, 12.5), V.cream);
      c.fillStyle = alpha(V.sock, 0.28); c.beginPath(); c.arc(q[0], q[1], 10, 0, TAU); c.fill();
      fill(c, circle(tip[0] + (tip[0] - q[0]) * 0.25, tip[1] + (tip[1] - q[1]) * 0.25, 10.5), V.cream);
      c.save(); c.translate(1, 2.4); c.globalAlpha = 0.3; line(c, tail, V.light, lw * 2.2); c.restore();
    });
    line(c, tail, L, lw);
  },
  head(c, ctx) {
    const { V, L, lw, t, seed, pick } = ctx;
    const e = clamp(pick('ear') ?? 0, -1, 1), back = Math.max(0, -e), tw = Math.sin(t * 1.1 + seed) * 0.03 + noise1(t * 0.5, seed + 2) * 0.05;
    const ear = (pts, piv, a, far) => {
      c.save(); c.translate(piv[0], piv[1]); c.rotate(a); c.translate(-piv[0], -piv[1]);
      const p = blob(pts);
      if (far) { fill(c, p, mix(V.ear, L, 0.3)); clipped(c, p, () => fill(c, blob([[5, -9], [8, -19], [11, -25, 1], [12, -16], [11.5, -8]]), mix(V.cream, '#e9b9a0', 0.4))); }
      else { fill(c, p, lin(c, 0, -29, 0, -6, [[0, V.ear], [0.42, V.ear], [0.62, V.coat], [1, mix(V.coat, V.light, 0.4)]])); }
      line(c, p, L, lw); c.restore();
    };
    ear([[3, -9], [6.6, -20], [11.5, -29.5, 1], [13.8, -17], [13, -8]], [8, -9], -back * 0.95 + e * 0.06 - tw, true);
    const skull = circle(0, 0, 12.6), muzzle = blob([[3, -3], [13, -2.4], [23, 2.2], [28, 6], [26, 10], [15, 11.8], [4, 10.8], [-2, 5]]);
    const hsil = union(skull, muzzle, poly([[-9.5, 4], [-18, 11.5], [-7.5, 12.4]]), poly([[-5, 9], [-10, 18], [1, 12.8]]));
    fill(c, hsil, lin(c, 0, -13, 0, 14, [[0, mix(V.coat, V.light, 0.8)], [0.5, V.coat], [1, mix(V.coat, V.dark, 0.5)]]));
    clipped(c, hsil, () => {
      fill(c, blob([[-20, 8], [-9, 3.4], [0, 6.4], [9, 5.4], [18, 3.6], [27, 5], [30, 12], [12, 14], [-4, 20], [-20, 16]]), V.cream);
      c.fillStyle = alpha(V.cream, 0.6); c.beginPath(); c.ellipse(6, -8.4, 3.2, 6.6, 0.1, 0, TAU); c.fill();
      c.fillStyle = alpha(V.sock, 0.3); c.beginPath(); c.ellipse(19.5, 1.6, 6.6, 1.9, 0.36, 0, TAU); c.fill();
      c.fillStyle = lin(c, 0, 6, 0, 19, [[0, alpha('#b7a48e', 0)], [1, alpha('#9c8670', 0.5)]]); c.fillRect(-22, 6, 54, 14);
    });
    line(c, hsil, L, lw);
    const sm = ctx.m === MOODS.happy ? 1 : ctx.m === MOODS.angry ? -0.6 : 0.4;
    c.strokeStyle = L; c.lineWidth = lw * 0.85; c.beginPath(); c.moveTo(26, 8.6); c.lineTo(24.6, 10); c.quadraticCurveTo(18, 12.4 + sm * 1.3, 10.5, 10 - sm * 1.2); c.stroke();
    const nose = blob([[24.4, 3.2], [27.6, 2.6], [30, 5], [29, 8], [26.4, 8.6], [24.2, 6.4]]);
    fill(c, nose, V.nose); line(c, nose, L, lw * 0.7);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(26.8, 4.2, 1.5, 0.8, -0.2, 0, TAU); c.fill();
    c.fillStyle = alpha(L, 0.45); for (const [dx, dy] of [[19, 8], [16.4, 9.4], [20.4, 9.8]]) { c.beginPath(); c.arc(dx, dy, 0.5, 0, TAU); c.fill(); }
    eyes(c, null, ctx, [0.6, -2.6, 5], [9.8, -3.6, 4.2], V.iris, mix(V.coat, V.light, 0.3), { slit: true, dilate: ctx.m === MOODS.alert || ctx.m === MOODS.scared ? 0.75 : 0.5 });
    const brow = pick('brow') ?? 0;
    c.strokeStyle = mix(L, V.coat, 0.25); c.lineWidth = lw * 1.15; const a = brow * 0.5 + 0.12;
    c.beginPath(); c.moveTo(0.6 - 4.4, -9.6 - a * 3.6); c.lineTo(0.6 + 4.4, -9.6 + a * 3.6); c.moveTo(9.8 - 3.6, -9.6 + a * 3); c.lineTo(9.8 + 3.6, -9.6 - a * 3); c.stroke();
    ear([[-10.4, -5], [-12.6, -17], [-9, -30, 1], [-2.4, -17.5], [1.6, -9.4]], [-5, -8], -back * 1.0 + e * 0.07 + tw, false);
  },
};
export function drawFox(c, p = {}) {
  const V = p.v && typeof p.v === 'object' ? { ...FOX, ...p.v } : FOX;
  quad(c, p, V, FOX_K);
}
