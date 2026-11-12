// Cat rig: side-view body with a three-quarter head, built like drawDog (merged outline, gradient coat, rim light).
// Units: at the same `s` a cat is in scale with the dog: back ~47 units high, ear tips ~84, nose to rump ~80, tail ~57.
//
// drawCat(c, {
//   x, y, s, flip,     ground point under the body, scale, facing (1 = right, -1 = left)
//   t, seed,           seconds (breathing, blinking, ear twitches, whiskers, tail sway) and de-sync seed
//   v,                 key of CATS or a variant object (merged over CATS.orange). Default 'orange'
//   kitten,            0..1 young proportions (half size, big head, short legs and tail)
//   pose,              'stand' | 'sit' | 'loaf' | 'curl' | 'crouch' | 'arch' | 'leap', or [from, to, k] to blend
//                      (curl = asleep on a sofa: use mood 'asleep'; arch = Halloween arch: use mood 'angry')
//   air,               leap only, 0..1 take-off -> landing (0 pushing off nose-up, 0.5 fully stretched, 1 gathering)
//   lift,              world px the body is raised above (x, y); the ground shadow stays down and fades (jump arcs)
//   gait, phase,       'walk' | 'trot' | 'run' | 'stalk' + cycle phase. Works in stand / crouch / arch.
//                      Advance phase by distance / catStride(gait, v, s, kitten) so feet do not slide.
//   mood,              'neutral' | 'happy' | 'sleepy' | 'asleep' | 'alert' | 'scared' | 'hunting' | 'angry' | 'sad'
//   look,              [dx, dy] pupil direction -1..1 (dx > 0 = forward)
//   headTurn,          0 three-quarter forward (default), 1 facing the camera, 2 looking back over the shoulder
//   headDown, headUp,  0..1 (sniffing / eating at ground level, looking up)        tilt: extra head roll, radians
//   mouth,             0..1 open (meow; 'angry' opens it to a hiss with fangs)       teeth: 0/1 force fangs
//   paw,               0..1 near front paw lifts and reaches forward (bowl tap: animate 0.5..1)
//   tailFlick,         0..1 extra twitch of the tail tip             tailUp: -1..1 override (1 = straight up)
//   tailWrap,          0..1 override: tail wrapped along the ground in front of the body (default per pose)
//   lid, ear, dilate, hackles, smile, blink     overrides of the mood defaults (ear 1 pricked .. -1 flat)
//   sil,               '#color': draw the whole cat as a flat single-colour silhouette (rooftop / backlit)
//   shadow,            ground shadow strength (default 0.3, 0 in sil mode)
// })
// CATS: orange (hero pet, teal collar + bell), orange20 / orange50 / orange200 (descendants: no collar, slightly
//   leaner, more muscular, duller scruffier coat - deliberately almost unchanged), tuxedo, grey (tabby).
// catStride(gait, v, s, kitten) -> world px travelled per gait cycle (walk ~40, trot ~72, run ~175, stalk ~24 at s 1).
// catEyeShine(c, p): call AFTER g.grade with the same p: draws only two glowing green-gold eye shines at the eyes
//   (p.shine 0..1 intensity, default 1; follows blinking, nothing when asleep).
// catAnchors(p) -> { head, eyes: [near, far], nose, paw (near front paw, follows `paw`), r (head radius) } as world [x, y].
import { blob, capsule, oval, union, join, fill, line, clipped, lin, rad, shadow, ik2, poly, glow, P as newPath } from '../engine/draw.js';
import { TAU, DEG, clamp, lerp, mix, alpha, hash, smooth, ss } from '../engine/util.js';
import { eye, blink, gaitFoot, GAITS, inkW } from './rig.js';

export const CATS = {
  orange: { coat: '#f08a24', dark: '#c9641a', light: '#fdb759', cream: '#fff0d4', line: '#5e2a0c', stripe: '#c0540f', nose: '#f08c8c', earIn: '#f7b9a6',
    iris: '#8fc23a', whisk: '#fffaf0', plump: 1, lean: 0, muscle: 0, scruff: 0, legK: 1, bib: 0.8, collar: '#2f9e9a' },
  orange20: { coat: '#ea8829', dark: '#c0621c', light: '#f7b25a', cream: '#fbead0', line: '#5a290d', stripe: '#b5500f', nose: '#e88a88', earIn: '#f0b3a0',
    iris: '#8fc23a', whisk: '#fffaf0', plump: 0.55, lean: 0.35, muscle: 0.4, scruff: 0.35, legK: 1.03, bib: 0.7, collar: null },
  orange50: { coat: '#e3862e', dark: '#b8601f', light: '#f0ad5c', cream: '#f7e5cb', line: '#56280e', stripe: '#aa4d11', nose: '#e08784', earIn: '#eaad9b',
    iris: '#93c23c', whisk: '#fffaf0', plump: 0.4, lean: 0.55, muscle: 0.7, scruff: 0.6, legK: 1.05, bib: 0.62, collar: null },
  orange200: { coat: '#dc8433', dark: '#b05e22', light: '#eaa95e', cream: '#f3e0c6', line: '#52270f', stripe: '#a04a13', nose: '#d88380', earIn: '#e4a897',
    iris: '#97c23e', whisk: '#fffaf0', plump: 0.3, lean: 0.7, muscle: 1, scruff: 0.8, legK: 1.07, bib: 0.55, collar: null, size: 1.04 },
  tuxedo: { coat: '#3a3a42', dark: '#1e1e25', light: '#5d5d68', cream: '#fbf7ee', line: '#0e0e13', stripe: null, nose: '#e39a9a', earIn: '#b98a8e',
    iris: '#e6b936', whisk: '#ffffff', plump: 0.6, lean: 0.2, muscle: 0.2, scruff: 0.1, legK: 1, bib: 1, hard: 1, socks: '#fbf7ee', blaze: 1, collar: null },
  grey: { coat: '#8f949e', dark: '#646974', light: '#b9bec7', cream: '#eef0f2', line: '#2a2e37', stripe: '#4b505a', nose: '#d98c8c', earIn: '#d9a9a6',
    iris: '#a5cf4a', whisk: '#ffffff', plump: 0.5, lean: 0.3, muscle: 0.3, scruff: 0.25, legK: 1, bib: 0.7, collar: null },
};

const MOODS = {
  neutral: { mouth: 0, lid: 0.1, slant: 0.14, dilate: 0.42, ear: 0, tailUp: 0.2, hackles: 0, smile: 0.3, whisk: 0, flick: 0, low: 0, sway: 1 },
  happy: { mouth: 0, lid: 0.16, slant: 0.1, dilate: 0.58, ear: 0.15, tailUp: 1, hackles: 0, smile: 1, whisk: 0.3, flick: 0, low: 0.22, sway: 1, happy: 1 },
  sleepy: { mouth: 0, lid: 0.58, slant: 0.1, dilate: 0.3, ear: -0.12, tailUp: -0.1, hackles: 0, smile: 0.4, whisk: 0, flick: 0, low: 0, sway: 0.4 },
  asleep: { mouth: 0, lid: 1, slant: 0, dilate: 0.3, ear: -0.1, tailUp: -0.1, hackles: 0, smile: 0.6, whisk: 0, flick: 0, low: 0, sway: 0.15 },
  alert: { mouth: 0, lid: 0, slant: 0.06, dilate: 0.64, ear: 1, tailUp: 0.45, hackles: 0, smile: 0.1, whisk: 0.5, flick: 0, low: 0, sway: 0.5 },
  scared: { mouth: 0.14, lid: 0, slant: -0.14, dilate: 1, ear: -0.75, tailUp: -0.85, hackles: 0.45, smile: -0.7, whisk: -0.6, flick: 0, low: 0, sway: 0.3 },
  hunting: { mouth: 0, lid: 0.04, slant: 0.2, dilate: 0.95, ear: 1, tailUp: -0.12, hackles: 0, smile: 0, whisk: 1, flick: 0.7, low: 0.12, sway: 0.3 },
  angry: { mouth: 0.85, lid: 0.22, slant: 0.5, dilate: 0.1, ear: -1, tailUp: 0.55, hackles: 1, smile: -0.8, whisk: -1, flick: 0.5, low: 0.3, sway: 0.3, teeth: 1 },
  sad: { mouth: 0, lid: 0.24, slant: -0.26, dilate: 0.55, ear: -0.35, tailUp: -0.6, hackles: 0, smile: -0.7, whisk: -0.3, flick: 0, low: 0, sway: 0.3 },
};

// Pose parameters (S = hip-shoulder length, F = front leg length). fm = front-leg mode weights [ground IK, tucked, free],
// fold = hind leg folded under the haunch, wrap = tail laid along the ground in front, tw/tUp = pose-driven tail lift,
// gw = how much a gait applies.
const POSES = {
  stand: (S, F) => ({ wl: S / 2 + 8, hip: [-S / 2, -(F + 6.5)], sh: [S / 2, -(F + 5.5)], arch: 1.5, neck: 50, nl: 1, hr: 0, fm: [1, 0, 0], fold: 0, hfx: -5, ffx: 3, wrap: 0, tw: 0, tUp: 0, brist: 0, gw: 1 }),
  sit: (S, F) => ({ hip: [-13, -13.5], sh: [9, -(F + 6.3)], arch: 4.5, neck: 63, nl: 1, hr: -0.05, fm: [1, 0, 0], fold: 1, hfx: 21, ffx: 4, wrap: 1, wl: 21, tw: 0, tUp: 0, brist: 0, gw: 0 }),
  loaf: (S) => ({ hip: [-S * 0.45, -13.5], sh: [S * 0.42, -16.5], arch: 5.5, neck: 36, nl: 0.84, hr: 0, fm: [0, 1, 0], fold: 1, hfx: 22, ffx: 0, wrap: 1, wl: S * 0.42 + 9, tw: 0, tUp: 0, brist: 0, gw: 0 }),
  curl: (S) => ({ hip: [-S * 0.4, -13.5], sh: [S * 0.3, -13], arch: 12, neck: -6, nl: 0.74, hr: 0.4, fm: [0, 1, 0], fold: 1, hfx: 22, ffx: 0, wrap: 1, wl: S * 0.3 + 15, tw: 0, tUp: 0, brist: 0, gw: 0 }),
  crouch: (S, F) => ({ wl: S / 2 + 8, hip: [-S * 0.48, -(F * 0.78 + 6.5)], sh: [S * 0.48, -(F * 0.54 + 5.5)], arch: 1.5, neck: 3, nl: 1.05, hr: -0.05, fm: [1, 0, 0], fold: 0.25, hfx: -1, ffx: 6, wrap: 0, tw: 1, tUp: -0.12, brist: 0, gw: 1 }),
  arch: (S, F) => ({ wl: S / 2 + 8, hip: [-15.5, -(F + 7)], sh: [15, -(F + 4.5)], arch: 14, neck: 22, nl: 0.86, hr: 0.12, fm: [1, 0, 0], fold: 0, hfx: -2, ffx: 1, wrap: 0, tw: 1, tUp: 0.85, brist: 1, gw: 1 }),
  leap: (S, F) => ({ wl: S / 2 + 8, hip: [-S * 0.52, -(F + 4)], sh: [S * 0.52, -(F + 6)], arch: 0, neck: 22, nl: 1.08, hr: -0.05, fm: [0, 0, 1], fold: 0, hfx: -5, ffx: 3, wrap: 0, tw: 1, tUp: 0.1, brist: 0, gw: 0 }),
};
function poseMix(pose, S, F) {
  const get = (n) => (POSES[n] || POSES.stand)(S, F);
  if (!Array.isArray(pose)) return get(pose);
  const a = get(pose[0]), b = get(pose[1]), k = clamp(pose[2] ?? 0), o = {};
  for (const key in a) o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => lerp(v, b[key][i], k)) : lerp(a[key], b[key], k);
  return o;
}

const variant = (v) => (typeof v === 'string' ? CATS[v] || CATS.orange : v ? { ...CATS.orange, ...v } : CATS.orange);
const GK = 0.56; // cat legs relative to the shared (dog-sized) gait table
function gaitFor(name, V, kit) {
  const g0 = GAITS[name];
  if (!g0) return null;
  const k = GK * lerp(V.legK ?? 1, 1, 0.3) * lerp(1, 0.8, kit) * (name === 'run' ? 0.9 : 1);
  return { duty: g0.duty, off: g0.off, stride: g0.stride * k, lift: g0.lift * k, bob: g0.bob * k * 0.8, pitch: g0.pitch * 0.8, bobs: g0.bobs, run: name === 'run' ? 1 : 0 };
}
// World distance covered per gait cycle (advance phase by distance / catStride to keep the feet planted).
export function catStride(gait = 'walk', v = 'orange', s = 1, kitten = 0) {
  const V = variant(v), k = clamp(kitten), g = gaitFor(gait, V, k) || gaitFor('walk', V, k);
  return (g.stride / g.duty) * (V.size ?? 1) * lerp(1, 0.52, k) * s;
}

// Quick ear flick now and then.
function twitch(t, seed, period = 5.3) {
  const k = t / period + hash(seed, 7), i = Math.floor(k), d = (k - i) * period - hash(i, seed + 11) * (period - 0.5);
  return d > 0 && d < 0.36 ? Math.sin((d / 0.36) * TAU) * (1 - d / 0.36) : 0;
}

// Skeleton numbers shared by drawCat, catEyeShine and catAnchors (no paths are built here).
function rig(p) {
  const V = variant(p.v), m = MOODS[p.mood] || MOODS.neutral;
  const pick = (k, d = 0) => (p[k] != null ? p[k] : m[k] != null ? m[k] : d);
  const t = p.t ?? 0, seed = p.seed ?? 0, kit = clamp(p.kitten ?? 0);
  const s = Math.max(1e-3, (p.s ?? 1) * (V.size ?? 1) * lerp(1, 0.52, kit)), flip = (p.flip ?? 1) < 0 ? -1 : 1;
  const lk = (V.legK ?? 1) * lerp(1, 0.8, kit), hk = lerp(1, 1.3, kit);
  const S = 44 * (V.bodyK ?? 1) * lerp(1, 0.8, kit), F = 30.5 * lk;
  const P = poseMix(p.pose, S, F);
  const aw = clamp(P.fm[2]), air = clamp(p.air ?? 0.5);
  const g = p.gait ? gaitFor(p.gait, V, kit) : null, ph = p.phase ?? 0, gw = g ? clamp(P.gw) : 0;
  let rot = lerp(-0.36, 0.32, smooth(air)) * aw, arch = P.arch + lerp(-1.5, 6, ss(0.5, 1, air)) * aw, len = 1 - 0.1 * ss(0.55, 1, air) * aw, dy = 0, nod = 0;
  if (gw > 0) {
    const flex = g.run * Math.cos(TAU * (ph - 0.92)); // gallop: spine gathers and extends
    dy = (-g.bob * (0.5 - 0.5 * Math.cos(TAU * g.bobs * ph)) + g.run * 3) * gw;
    rot += g.pitch * Math.sin(TAU * ph + 0.6) * gw;
    arch += flex * 4.5 * gw; len *= 1 - 0.07 * flex * gw;
    nod = Math.sin(TAU * g.bobs * ph + 1.2) * 0.035 * gw;
  }
  const cx = (P.hip[0] + P.sh[0]) / 2, cy = (P.hip[1] + P.sh[1]) / 2, co = Math.cos(rot) * len, si = Math.sin(rot) * len;
  const tr = (q) => [cx + (q[0] - cx) * co - (q[1] - cy) * si, cy + (q[0] - cx) * si + (q[1] - cy) * co + dy];
  const hip = tr(P.hip), sh = tr(P.sh);
  // head
  const hd = clamp(pick('headDown')), hu = clamp(pick('headUp')), tk = clamp(P.fm[1]);
  const nAng = lerp(lerp(P.neck, lerp(-52, -14, tk), hd), 80, hu) * DEG + nod + Math.sin(t * 0.9 + 1.3 + seed) * 0.012 - rot * 0.6;
  const nLen = 19 * P.nl * lerp(1, 0.9, kit) * lerp(1, 1.22, hd);
  const hc = [sh[0] + 3 + Math.cos(nAng) * nLen, sh[1] - 2 - Math.sin(nAng) * nLen];
  if (aw < 0.5) hc[1] = Math.min(hc[1], -13.4 * hk);
  const q = 1 - clamp(p.headTurn ?? 0, 0, 2), aq = Math.abs(q);
  const hRot = (P.hr + hd * lerp(0.5, 0.1, tk) - hu * 0.6 + nod * 0.5 + rot * 0.45) * clamp(q * 2.5, -1, 1) + (p.tilt ?? 0);
  const fo = 5.2 * q, sep = 14.8 - 1.2 * aq, er = 6.5 * lerp(1, 1.08, kit);
  const eyes = [
    { x: fo - sep / 2, y: 0.6, r: er * (1 - 0.1 * clamp(-q)), sx: 1 - 0.18 * clamp(-q), side: -1 },
    { x: fo + sep / 2, y: 0.6, r: er * (1 - 0.1 * clamp(q)), sx: 1 - 0.18 * clamp(q), side: 1 },
  ];
  const lid = clamp(Math.max(pick('lid'), p.blink ?? blink(t, seed + 1, 4.2)));
  const liftU = Math.max(0, p.lift ?? 0) / s;
  return { V, m, pick, t, seed, kit, s, flip, lk, hk, S, F, P, aw, air, g, ph, gw, hip, sh, arch, hc, hRot, q, aq, fo, eyes, lid, liftU, look: p.look || [0.3, 0.05] };
}
const headToWorld = (p, R, x, y) => {
  const ca = Math.cos(R.hRot), sa = Math.sin(R.hRot);
  return [(p.x ?? 0) + R.flip * R.s * (R.hc[0] + R.hk * (x * ca - y * sa)), (p.y ?? 0) + R.s * (R.hc[1] - R.liftU + R.hk * (x * sa + y * ca))];
};

export function catAnchors(p = {}) {
  const R = rig(p);
  const k = clamp(p.paw ?? 0), px = R.P.sh[0] + R.P.ffx + 13 * k + 2.7, py = -10 * Math.sin(k * Math.PI / 2) - 2.6 - R.liftU;
  return { head: headToWorld(p, R, 0, 0), eyes: R.eyes.map((e) => headToWorld(p, R, e.x, e.y)), nose: headToWorld(p, R, 9.6 * R.q, 5.2),
    paw: [(p.x ?? 0) + R.flip * R.s * px, (p.y ?? 0) + R.s * py], r: 17 * R.hk * R.s };
}

// Glowing eyes for night shots: draw after the grade with the same options as drawCat.
export function catEyeShine(c, p = {}) {
  const R = rig(p), a = clamp(p.shine ?? 1) * (1 - ss(0.45, 0.9, R.lid));
  if (a <= 0.01) return;
  for (const e of R.eyes) {
    const [x, y] = headToWorld(p, R, e.x + R.look[0] * e.r * 0.2, e.y + R.look[1] * e.r * 0.2 + R.lid * e.r * 0.5), r = e.r * R.hk * R.s;
    glow(c, x, y, r * 4.2, '#9dff4e', a * 0.75);
    c.save();
    c.globalAlpha *= a;
    c.translate(x, y); c.scale(e.sx, 1 - R.lid * 0.7);
    c.fillStyle = rad(c, 0, 0, r * 0.95, [[0, '#fbffe2'], [0.45, '#e2ff86'], [0.8, 'rgba(170,240,70,0.75)'], [1, 'rgba(120,220,60,0)']]);
    c.beginPath(); c.arc(0, 0, r * 0.95, 0, TAU); c.fill();
    c.restore();
  }
}

export function drawCat(c, p = {}) {
  const R = rig(p), { V, m, pick, t, seed, kit, s, flip, lk, hk, S, P, aw, air, g, ph, gw, hip, sh, arch, hc, hRot, q, aq, fo } = R;
  const L = V.line, lw = inkW(s), lean = clamp(V.lean ?? 0), plump = clamp(V.plump ?? 0.5), scruff = Math.max(clamp(V.scruff ?? 0), kit * 0.5), mus = clamp(V.muscle ?? 0);
  const asleep = m === MOODS.asleep, breath = Math.sin(t * (asleep ? 1.15 : 1.7) + seed) * 0.5 + 0.5, bA = asleep ? 1.2 : 0.6;
  const ground = aw < 0.5;

  // ---- spine: quadratic curve hip -> shoulder, bulging dorsally by `arch` ----
  const cdx = sh[0] - hip[0], cdy = sh[1] - hip[1], sd = Math.hypot(cdx, cdy) || 1, ux = cdx / sd, uy = cdy / sd;
  const C = [(hip[0] + sh[0]) / 2 + uy * arch * 2, (hip[1] + sh[1]) / 2 - ux * arch * 2];
  const ddx = 2 * (sh[0] - 2 * C[0] + hip[0]), ddy = 2 * (sh[1] - 2 * C[1] + hip[1]);
  const sp = (a, b) => {
    const ac = clamp(a), ia = 1 - ac;
    const tx = 2 * (ia * (C[0] - hip[0]) + ac * (sh[0] - C[0])), ty = 2 * (ia * (C[1] - hip[1]) + ac * (sh[1] - C[1])), tl = Math.hypot(tx, ty) || 1;
    let x = ia * ia * hip[0] + 2 * ac * ia * C[0] + ac * ac * sh[0] + (tx / tl) * (a - ac) * sd;
    let y = ia * ia * hip[1] + 2 * ac * ia * C[1] + ac * ac * sh[1] + (ty / tl) * (a - ac) * sd;
    if ((b < 0 && arch > 0.5) || (b > 0 && arch < -0.5)) { // inside of the bend: stay within the radius of curvature
      const cr = Math.abs(tx * ddy - ty * ddx), lim = cr > 1e-6 ? (tl * tl * tl / cr) * 0.8 : 1e6;
      b = clamp(b, -lim, lim);
    }
    x += (ty / tl) * b; y -= (tx / tl) * b;
    return [x, ground ? Math.min(y, 0) : y];
  };
  const bf = (u, v) => [ux * u - uy * v, uy * u + ux * v]; // body frame (u forward, v toward the belly) -> offset
  const belly = lerp(9.2, 13.8, plump) + breath * bA, chest = lerp(12.6, 14.4, plump) + breath * bA * 0.6, dor = 10 + mus * 0.7 + breath * bA * 0.4;
  const torso = blob([sp(-0.12, dor + 0.4), sp(-0.27, 1.5), sp(-0.2, -10.5), sp(0.3, -belly), sp(0.82, -chest), sp(1.13, -7), sp(1.13, 5), sp(0.93, dor + 1.6 + mus), sp(0.46, dor - 0.5)]);
  const neck = capsule(sh[0] + 1, sh[1] + 1, 11 - lean * 0.8, hc[0] - 3 * hk, hc[1] + 4 * hk, 9.5 * hk);

  // ---- legs ----
  const fUp = 15 * lk, fLo = 15.5 * lk, th = 14 * lk, mt = 13.5 * lk, pawK = lerp(1, 1.12, kit);
  const fr = [5.5 - lean * 0.4 + mus * 0.3, 4.1 - lean * 0.25, 3.4];
  const reach = clamp(p.paw ?? 0);
  const frontLeg = (far) => {
    const off = far ? [3.6, -0.8] : [0, 0], w = P.fm;
    let gx = 0, gy = 0;
    if (gw > 0) { const d = gaitFoot(ph + g.off[far ? 'ff' : 'nf'], g); gx = d[0] * gw; gy = d[1] * gw; }
    const root = [sh[0] + 1 + off[0] + (g ? gx * 0.3 * g.run : 0), sh[1] + 7 + off[1]];
    // mode 0: foot on the ground (gait / reaching paw)
    let tx = P.sh[0] + P.ffx + off[0] + gx, ty = gy;
    if (!far && reach > 0) { tx += 13 * reach; ty -= 10 * Math.sin(reach * Math.PI / 2); }
    const a = ik2(root[0], root[1], tx, ty, fUp, fLo, 1);
    // mode 1: tucked under the chest
    const bj = [sh[0] + 4 + off[0], -7 + off[1]], be = [sh[0] + 9 + off[0] * 1.4, -1.2 + off[1] * 0.5];
    // mode 2: airborne
    const al = clamp(air + (far ? -0.07 : 0.04)), k1 = ss(0, 0.5, al), k2 = ss(0.5, 1, al);
    const o2 = bf(lerp(lerp(22, 27.5, k1), 18, k2) * lk, lerp(lerp(13, 5, k1), 22, k2) * lk);
    const cr = ik2(root[0], root[1], root[0] + o2[0], root[1] + o2[1], fUp, fLo, 1);
    const j = [a.jx * w[0] + bj[0] * w[1] + cr.jx * w[2], a.jy * w[0] + bj[1] * w[1] + cr.jy * w[2]];
    const e = [a.ex * w[0] + be[0] * w[1] + cr.ex * w[2], a.ey * w[0] + be[1] * w[1] + cr.ey * w[2]];
    const lift = gw > 0 ? clamp(-gy / g.lift) : 0;
    const pa = (lift * 0.9 + (far ? 0 : reach * 0.5)) * w[0] + clamp(Math.atan2(cr.ey - cr.jy, cr.ex - cr.jx), -0.4, 1.3) * w[2];
    const hang = lerp(2.6, 0.6, w[2]);
    const paw = oval(e[0] + Math.cos(pa) * 2.7, e[1] - hang + Math.sin(pa) * 2.7, 5.5 * pawK, 3.5, pa);
    const parts = [capsule(j[0], j[1], fr[1], e[0], e[1] - hang, fr[2]), paw];
    if (w[1] < 0.5) parts.unshift(capsule(root[0], root[1], fr[0], j[0], j[1], fr[1]));
    return { parts, root, j, e, pa, px: e[0] + Math.cos(pa) * 2.7, py: e[1] - hang + Math.sin(pa) * 2.7 };
  };
  const hindLeg = (far) => {
    const off = far ? [3.6, -0.8] : [0, 0], f = P.fold;
    let gx = 0, gy = 0;
    if (gw > 0) { const d = gaitFoot(ph + g.off[far ? 'fh' : 'nh'], g); gx = d[0] * gw; gy = d[1] * gw; }
    const al = clamp(air + (far ? -0.07 : 0.04)), k1 = ss(0, 0.5, al), k2 = ss(0.5, 1, al);
    const hb = bf(-1, 6), kb = bf(lerp(lerp(-1, -2, k1), 9, k2), lerp(13, 12, k1) * lk), fb = bf(lerp(lerp(-22, -29, k1), 11, k2) * lk, lerp(lerp(26, 11, k1), 29, k2) * lk);
    const hx = hip[0] + lerp(lerp(1.5, 6, f), hb[0], aw) + off[0], hy = hip[1] + lerp(lerp(6, 2.3, f), hb[1], aw) + off[1];
    const hrx = lerp(10.5, 14.5, f) - lean * 0.8 + mus * 0.6, hry = lerp(13, 11.3, f) - lean * 0.5, hro = lerp(-0.2, 0.12, f) + Math.atan2(uy, ux) * aw;
    const haunch = oval(hx, hy, hrx, hry, hro);
    const knee = [hip[0] + lerp(lerp(7, 15, f), kb[0], aw) + off[0], hip[1] + lerp(lerp(15 * lk, 5, f), kb[1], aw) + off[1]];
    const tx = lerp(P.hip[0] + P.hfx + off[0] + gx, hip[0] + fb[0] + off[0], aw), ty = lerp(lerp(0, -1.5, f) + gy, hip[1] + fb[1] + off[1], aw);
    const k = ik2(knee[0], knee[1], tx, ty, th, mt, 1);
    const lift = gw > 0 ? clamp(-gy / g.lift) : 0, pa = lerp(lift * 0.8, lerp(Math.PI, 0.5, k2), aw), hang = lerp(2.6, 0.6, aw);
    const paw = oval(k.ex + Math.cos(pa) * 2.9, k.ey - hang + Math.sin(pa) * 2.9, 5.7 * pawK, 3.4, pa);
    return { parts: [haunch, capsule(knee[0], knee[1], 5 - lean * 0.4 + mus * 0.3, k.jx, k.jy, 3.5), capsule(k.jx, k.jy, 3.5, k.ex, k.ey - hang, 3.1), paw],
      knee, j: [k.jx, k.jy], e: [k.ex, k.ey], pa, h: [hx, hy, hrx, hry, hro], px: k.ex + Math.cos(pa) * 2.9, py: k.ey - hang + Math.sin(pa) * 2.9 };
  };
  const nf = frontLeg(false), ff = frontLeg(true), nh = hindLeg(false), fh = hindLeg(true);

  // ---- fur tufts: bristling back, scruffy wild coats ----
  const tufts = [];
  const tuft = (b, dx, dy, w) => {
    const ix = b[0] - dx * 0.9, iy = b[1] - dy * 0.9;
    tufts.push(blob([[ix - dy * w, iy + dx * w], [b[0] + dx * 0.2 - dy * w * 0.55, b[1] + dy * 0.2 + dx * w * 0.55], [b[0] + dx, b[1] + dy, 1], [b[0] + dx * 0.2 + dy * w * 0.55, b[1] + dy * 0.2 - dx * w * 0.55], [ix + dy * w, iy - dx * w]]));
  };
  const brist = clamp(Math.max(P.brist, pick('hackles')));
  if (brist > 0.1) for (let i = 0; i < 9; i++) { const a = 0.02 + i * 0.118, b = sp(a, dor + 0.5), n = sp(a - 0.035, dor + 0.5 + 3.8 * brist); tuft(b, n[0] - b[0], n[1] - b[1], 0.55); }
  if (scruff > 0.3 && ground) {
    const k = scruff;
    tuft(sp(1.1, -chest * 0.4), 3.5 * k, 4.5 * k, 0.6);
    tuft(sp(0.95, -chest * 0.93), 0.5 * k, 5 * k, 0.6);
    if (P.fold < 0.5) { tuft(sp(0.5, -belly + 1), -1.5 * k, 4 * k, 0.7); tuft(sp(-0.22, -7), -4 * k, 3 * k, 0.6); }
  }

  // ---- tail: centreline (free chain blended with a ground-hugging wrap), drawn as a ribbon ----
  const N = 7, tl = 8.2 * lerp(1, 0.72, kit) * (V.tailLen ?? 1), tailW = lerp(1, 0.8, kit) * (1 + scruff * 0.12);
  const tUp = clamp(p.tailUp ?? lerp(pick('tailUp'), P.tUp, clamp(P.tw)), -1, 1), wrap = clamp(p.tailWrap ?? P.wrap);
  const fl = clamp(p.tailFlick ?? m.flick ?? 0), flk = Math.sin(t * 11 + seed) * (0.55 + 0.45 * Math.sin(t * 2.3 + seed * 1.7)) * fl;
  const sway = (m.sway ?? 1) * (gw > 0 ? 0.4 : 1);
  const cen = [sp(-0.2, 4.5)];
  {
    let ta = Math.PI + Math.atan2(uy, ux) * 0.6 + tUp * 1.3 - 0.42 * (1 - Math.abs(tUp)), tp = cen[0];
    const cr = tUp >= 0 ? 0.16 * (1 - tUp) + 0.02 : 0.15 * (1 + tUp) + 0.07 * tUp;
    for (let i = 0; i < N; i++) {
      ta += cr + (tUp > 0.6 && i >= N - 2 ? (tUp - 0.6) * 1.3 : 0) + Math.sin(t * 0.95 + seed * 1.3 - i * 0.6) * 0.045 * sway * (0.4 + i / N)
        + (i >= N - 3 ? flk * 0.2 * (i - (N - 4)) : 0) + (gw > 0 ? Math.sin(TAU * ph + i * 0.5) * 0.03 : 0);
      tp = [tp[0] + Math.cos(ta) * tl, ground ? Math.min(tp[1] + Math.sin(ta) * tl, -2.9) : tp[1] + Math.sin(ta) * tl];
      cen.push(tp);
    }
  }
  if (wrap > 0.01) {
    const x0 = P.hip[0] - 12.5, dxw = Math.min(tl * 0.97, (P.wl - x0) / N);
    for (let i = 0; i <= N; i++) {
      const tipK = clamp((i - (N - 3)) / 3);
      const wx = x0 + i * dxw, wy = (i ? -3 : -5.5) - tipK * (1.2 + Math.abs(flk) * 5 + Math.sin(t * 0.8 + seed) * 0.5 * sway);
      cen[i] = [lerp(cen[i][0], wx, wrap), lerp(cen[i][1], wy, wrap)];
    }
  }
  const tw = (i) => lerp(3.8, 2.7, i / N) * tailW * (1 + brist * 0.55);
  const upE = [], loE = [], nrm = [];
  for (let i = 0; i <= N; i++) {
    const a = cen[Math.max(0, i - 1)], b = cen[Math.min(N, i + 1)], dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [(b[1] - a[1]) / dl, -(b[0] - a[0]) / dl], w = tw(i);
    nrm.push(n);
    upE.push([cen[i][0] + n[0] * w, cen[i][1] + n[1] * w]); loE.push([cen[i][0] - n[0] * w, cen[i][1] - n[1] * w]);
  }
  const tipP = [cen[N][0] - nrm[N][1] * tw(N) * 0.95, cen[N][1] + nrm[N][0] * tw(N) * 0.95];
  let tail;
  if (brist > 0.15) {
    const spike = (E, sg) => E.flatMap((q2, i) => (i < N ? [q2, [(q2[0] + E[i + 1][0]) / 2 + nrm[i][0] * sg * 2.1 * brist, (q2[1] + E[i + 1][1]) / 2 + nrm[i][1] * sg * 2.1 * brist, 1]] : [q2]));
    tail = blob([...spike(upE, 1), tipP, ...spike(loE, -1).reverse()]);
  } else tail = blob([...upE, tipP, ...loE.slice().reverse()]);
  const wrapMode = wrap > 0.5;

  // ---- head geometry (head units, origin at the skull centre) ----
  const earIn = clamp(pick('ear'), -1, 1), flat = Math.max(0, -earIn), fwd = Math.max(0, earIn), earK = lerp(1, 1.06, kit) * (V.earK ?? 1);
  const ear = (side) => { // side -1 = left of the picture, 1 = right
    const farK = clamp(side * q), bx = side * 10.5 + (side * q > 0 ? 2 * q : 4 * q), by = -15.6 * Math.sqrt(Math.max(0.05, 1 - (bx / 18.5) ** 2)) + 3.6;
    const hw = 7.6 * (1 - 0.22 * farK) * earK * (1 - 0.12 * flat), H = 19 * earK * (1 + 0.07 * fwd) * (1 - 0.36 * flat);
    const rot = side * (0.15 + flat * 0.92 - fwd * 0.1) + twitch(t, seed + (side > 0 ? 3 : 0)) * 0.22 + Math.sin(t * 1.3 + side) * 0.012;
    const ox = bx + side * flat * 2.5, oy = by + flat * 3.5, ca = Math.cos(rot), sa = Math.sin(rot);
    const T = (u, v, sharp) => [ox + u * ca - v * sa, oy + u * sa + v * ca, sharp];
    return {
      outer: blob([T(-hw, 4), T(-hw * 0.82, -8), T(side * 1.5, -H, 1), T(hw * 0.82, -8), T(hw, 4), T(0, 8)]),
      inner: blob([T(-hw * 0.5 - side * q * 1.2, 2), T(-hw * 0.36 - side * q * 0.8, -7), T(side * 1.5, -H * 0.76, 1), T(hw * 0.36 - side * q * 0.8, -7), T(hw * 0.5 - side * q * 1.2, 2)]),
      tip: T(side * 1.5, -H), dir: [sa, -ca],
    };
  };
  const earL = ear(-1), earR = ear(1);
  const cheek = (side) => {
    const k = (1 - 0.5 * clamp(side * q)) * (1 + 0.35 * scruff);
    return blob([[side * 14.5, 0.5], [side * (17.6 + 4.2 * k), 6.6 + k, 1], [side * 15, 8], [side * (14.2 + 3.6 * k), 12.6 + 1.5 * k, 1], [side * 9, 12]]);
  };
  const mx = 9 * q, nx = mx + 0.6 * q, ny = 5.4;
  const hsil = union(oval(0, 0, 18.5, 15.6), oval(mx, 8.5, 9, 6.3), cheek(-1), cheek(1), earL.outer, earR.outer);
  const whiskers = () => {
    const wp = newPath(), wk = pick('whisk');
    for (const side of [-1, 1]) {
      const farK = clamp(side * q), px = nx + side * 4.8 * (1 - 0.25 * farK), py = 9.6, len = 17.5 * (1 - 0.32 * farK) * lerp(1, 0.85, kit);
      for (let i = 0; i < 3; i++) {
        const an = -0.3 + i * 0.27 - wk * 0.1 * (1 - i) + (wk < 0 ? wk * 0.22 : 0) + Math.sin(t * 2.1 + i * 1.7 + seed + side) * 0.03;
        const ex = px + side * Math.cos(an) * len, ey = py + Math.sin(an) * len + 1.2;
        wp.moveTo(px + side * 1.5, py + (i - 1) * 1.3); wp.quadraticCurveTo((px + ex) / 2, (py + ey) / 2 - 2.6, ex, ey);
      }
    }
    return wp;
  };

  // ---- draw ----
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(s * flip, s);
  const shA = p.shadow ?? (p.sil ? 0 : 0.3);
  if (shA > 0) { const fade = 1 / (1 + R.liftU / 45); shadow(c, (P.hip[0] + P.sh[0]) / 2 + 5, 0.6, (S * 0.62 + 16) * lerp(0.7, 1, fade), 4.6, shA * fade); }
  if (R.liftU) c.translate(0, -R.liftU);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const headXf = () => { c.translate(hc[0], hc[1]); c.rotate(hRot); c.scale(hk, hk); };
  const hl = lw / hk;

  if (p.sil) { // flat silhouette
    const all = union(tail, ...fh.parts, ...ff.parts, torso, neck, ...tufts, ...nh.parts, ...nf.parts);
    fill(c, all, p.sil); line(c, all, p.sil, lw * 0.7);
    c.save(); headXf();
    fill(c, hsil, p.sil); line(c, hsil, p.sil, hl * 0.7);
    c.globalAlpha *= 0.8; line(c, whiskers(), p.sil, hl * 0.5);
    c.restore();
    c.restore();
    return;
  }

  const tailPaint = () => {
    const ys = cen.map((v) => v[1]), y0 = Math.min(...ys) - 5, y1 = Math.max(...ys) + 5;
    fill(c, tail, lin(c, 0, y0, 0, y1, [[0, mix(V.coat, V.light, 0.35)], [0.5, V.coat], [1, V.dark]]));
    clipped(c, tail, () => {
      const dk = V.stripe || V.dark, w0 = tw(0) + 2;
      if (V.stripe) {
        const rings = newPath();
        for (let i = 1; i < N - 1; i++) { rings.moveTo(cen[i][0] + nrm[i][0] * w0 * 2, cen[i][1] + nrm[i][1] * w0 * 2); rings.lineTo(cen[i][0] - nrm[i][0] * w0 * 2, cen[i][1] - nrm[i][1] * w0 * 2); }
        line(c, rings, alpha(dk, 0.8), 2.5, 'butt');
      }
      c.fillStyle = alpha(dk, V.stripe ? 0.85 : 0.5); c.beginPath(); c.arc(cen[N][0], cen[N][1], tl * 0.95, 0, TAU); c.fill();
    });
  };

  // far legs
  const farCol = mix(V.dark, L, 0.12);
  for (const leg of [fh, ff]) {
    const u = union(...leg.parts);
    fill(c, u, farCol);
    if (V.socks) clipped(c, u, () => { c.fillStyle = mix(V.socks, L, 0.22); c.beginPath(); c.arc(leg.px, leg.py, 7.2, 0, TAU); c.fill(); });
    line(c, u, L, lw);
  }
  if (!wrapMode) { tailPaint(); line(c, tail, L, lw); }

  // near silhouette: one merged outline
  const legParts = [...nh.parts, ...nf.parts], legU = union(...legParts);
  const trunk = union(torso, neck, ...tufts);
  const sil = wrapMode ? union(trunk, legU, tail) : union(trunk, legU);
  const top = Math.min(hip[1], sh[1]) - 14 - Math.max(0, arch);
  fill(c, sil, lin(c, 0, top, 0, 1, [[0, V.light], [0.4, V.coat], [1, V.dark]]));
  clipped(c, trunk, () => {
    if (V.stripe) {
      const st = [];
      for (let i = 0; i < 7; i++) {
        const a = 0.05 + i * 0.142, d = 1.5 + 3.5 * hash(i, 7);
        st.push(blob([sp(a - 0.042, dor + 4), sp(a + 0.042, dor + 4), sp(a + 0.05, 4), [...sp(a + 0.035, -d), 1], sp(a - 0.012, 4)]));
      }
      fill(c, join(...st), alpha(V.stripe, 0.82));
    }
    const ca = V.bib ?? 0.7, b2 = sp(0.5, -(belly + chest) * 0.5 - 1.5), q1 = sp(1.06, -chest * 0.45), hard = V.hard ? 0.02 : 0.4;
    c.fillStyle = rad(c, q1[0], q1[1], 19, [[0, alpha(V.cream, ca)], [0.72 - hard, alpha(V.cream, ca * 0.85)], [0.74, alpha(V.cream, V.hard ? 0 : ca * 0.3)], [1, alpha(V.cream, 0)]]);
    c.fillRect(q1[0] - 19, q1[1] - 19, 38, 38);
    c.save(); c.translate(b2[0], b2[1]); c.rotate(Math.atan2(uy, ux)); c.scale(1, 0.36);
    c.fillStyle = rad(c, 0, 0, S * 0.58, [[0, alpha(V.cream, ca * 0.9)], [0.6, alpha(V.cream, ca * (V.hard ? 0.9 : 0.5))], [1, alpha(V.cream, 0)]]);
    c.fillRect(-S, -S, S * 2, S * 2); c.restore();
  });
  clipped(c, legU, () => {
    const f0 = clamp((sh[1] + 2 - top) / (1 - top)), f1 = clamp((sh[1] + 16 - top) / (1 - top));
    c.fillStyle = lin(c, 0, top, 0, 1, [[0, alpha(V.coat, 0)], [f0, alpha(V.coat, 0)], [f1, mix(V.coat, V.dark, f1 * 0.45)], [1, mix(V.coat, V.dark, 0.8)]]);
    c.fillRect(-300, top - 40, 600, 400);
    if (V.stripe) {
      const ls = newPath(), bar = (a, b, k, w) => {
        const x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k), dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, px = -(b[1] - a[1]) / dl * w, py = (b[0] - a[0]) / dl * w;
        ls.moveTo(x - px, y - py); ls.lineTo(x + px, y + py);
      };
      if (P.fm[1] < 0.5) { bar(nf.root, nf.j, 0.72, 8); bar(nf.j, nf.e, 0.3, 7); bar(nf.j, nf.e, 0.68, 6); }
      bar(nh.j, nh.e, 0.3, 6); bar(nh.knee, nh.j, 0.55, 7);
      const h = nh.h;
      for (const [k, a0, a1] of [[0.74, -2.95, -1.75], [0.42, -2.8, -1.5]]) {
        const ch = Math.cos(h[4]), sh2 = Math.sin(h[4]), ex = h[2] * k * Math.cos(a0), ey = h[3] * k * Math.sin(a0);
        ls.moveTo(h[0] + ex * ch - ey * sh2, h[1] + ex * sh2 + ey * ch); ls.ellipse(h[0], h[1], h[2] * k, h[3] * k, h[4], a0, a1);
      }
      line(c, ls, alpha(V.stripe, 0.7), 2.2, 'butt');
    }
    if (V.socks) { c.fillStyle = V.socks; for (const leg of [nf, nh]) { c.beginPath(); c.arc(leg.px, leg.py, 7.4, 0, TAU); c.fill(); } }
  });
  if (wrapMode) tailPaint();
  clipped(c, sil, () => {
    // soft form shadow underneath, rim light along top edges, a hint of the thigh
    c.fillStyle = lin(c, 0, -17, 0, 0, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), ground ? 0.5 : 0.25)]]);
    c.fillRect(-300, -17, 600, 22);
    c.save(); c.translate(0.6, 1.4); c.globalAlpha = 0.36; line(c, sil, V.light, lw * 2.3); c.restore();
    const h = nh.h;
    c.save(); c.globalAlpha = 0.38; c.strokeStyle = L; c.lineWidth = lw * 0.8; c.beginPath(); c.ellipse(h[0], h[1], h[2], h[3], h[4], -1.35, 0.7); c.stroke(); c.restore();
  });
  line(c, sil, L, lw);
  if (wrapMode) line(c, blob(upE.slice(1), false), alpha(L, 0.9), lw * 0.9);
  // toes
  c.strokeStyle = alpha(L, 0.7); c.lineWidth = lw * 0.65;
  for (const leg of [nf, nh]) {
    if (leg === nf && P.fm[1] > 0.5) continue;
    for (const d of [0.6, 3]) {
      const bx = leg.px + Math.cos(leg.pa) * d, by = leg.py + 0.6 + Math.sin(leg.pa) * d;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 0.4, by + 1.9); c.stroke();
    }
  }
  // collar + bell
  if (V.collar) {
    const ax = sh[0] + 1, ay = sh[1] + 1, bx = hc[0] - 3 * hk, by = hc[1] + 4 * hk, k = 0.34;
    const cx = lerp(ax, bx, k), cy = lerp(ay, by, k), r = lerp(11 - lean * 0.8, 9.5 * hk, k) + 0.3;
    const dx = bx - ax, dy = by - ay, dl = Math.hypot(dx, dy) || 1, px = -dy / dl, py = dx / dl;
    c.strokeStyle = L; c.lineWidth = 4 + lw; c.lineCap = 'butt'; c.beginPath(); c.moveTo(cx - px * r, cy - py * r); c.lineTo(cx + px * r, cy + py * r); c.stroke();
    c.strokeStyle = V.collar; c.lineWidth = 3.4; c.beginPath(); c.moveTo(cx - px * r, cy - py * r); c.lineTo(cx + px * r, cy + py * r); c.stroke();
    c.lineCap = 'round';
    const bell = oval(cx + px * r * 0.9 + 0.5, cy + py * r * 0.9 + 3 + Math.sin(t * 3 + seed) * 0.2, 2.7, 2.7);
    fill(c, bell, '#f6c544'); line(c, bell, L, lw * 0.7);
  }

  // ---- head ----
  c.save(); headXf();
  const headCol = V.headCol || V.coat;
  fill(c, hsil, lin(c, 0, -30, 0, 16, [[0, V.light], [0.42, mix(headCol, V.light, 0.45)], [0.72, headCol], [1, mix(headCol, V.dark, 0.55)]]));
  clipped(c, hsil, () => {
    fill(c, join(earL.inner, earR.inner), V.earIn);
    c.fillStyle = lin(c, 0, -30, 0, -8, [[0, alpha(V.earIn, 0)], [1, alpha(mix(V.earIn, L, 0.45), 0.55)]]); c.fill(join(earL.inner, earR.inner));
    if (V.stripe) {
      const fs = newPath();
      for (const dx of [-3.6, 0, 3.6]) { fs.moveTo(fo + dx * (1 - 0.15 * aq), -6.2 - (dx ? 0 : 1)); fs.lineTo(fo + dx * 1.25 - q * 0.8, -13.5 - (dx ? 0 : 1)); }
      for (const side of [-1, 1]) {
        const e = R.eyes[side < 0 ? 0 : 1], x0 = e.x + side * (e.r * e.sx + 0.6), k = 1 - 0.55 * clamp(side * q);
        fs.moveTo(x0, 2.2); fs.lineTo(x0 + side * 6.5 * k, 3.6); fs.moveTo(x0 - side * 0.6, 5.6); fs.lineTo(x0 + side * 5.2 * k, 7.6);
      }
      line(c, fs, alpha(V.stripe, 0.8), 1.7);
    }
    // muzzle pads + chin
    const kf = 1 - 0.25 * aq, mz = union(oval(nx - 4.4 * (q < 0 ? kf : 1), 10.3, 6 * (q < 0 ? kf : 1), 4.9), oval(nx + 4.4 * (q > 0 ? kf : 1), 10.3, 6 * (q > 0 ? kf : 1), 4.9), oval(nx, 13.4, 5.2, 3.6));
    fill(c, mz, V.cream);
    if (V.blaze) fill(c, blob([[fo - 1.2, -12], [fo + 1.2, -12], [nx + 3.4, 2], [nx + 7, 8], [nx, 9], [nx - 7, 8], [nx - 3.4, 2]]), V.cream);
    c.fillStyle = lin(c, 0, 5, 0, 17, [[0, alpha(V.dark, 0)], [1, alpha(mix(V.dark, L, 0.3), 0.45)]]);
    c.fillRect(-30, 5, 60, 14);
    c.save(); c.translate(0.6, 1.4); c.globalAlpha = 0.34; line(c, hsil, V.light, hl * 2.3); c.restore();
  });
  line(c, hsil, L, hl);
  if (scruff > 0.7) { // lynx-like ear tips on the wildest coats
    c.strokeStyle = L; c.lineWidth = hl * 0.9;
    for (const e of [earL, earR]) { c.beginPath(); c.moveTo(e.tip[0], e.tip[1]); c.lineTo(e.tip[0] + e.dir[0] * 2.6, e.tip[1] + e.dir[1] * 2.6); c.stroke(); }
  }
  // mouth
  const mo = clamp(pick('mouth')), smile = pick('smile', 0.3), teeth = (p.teeth ?? m.teeth ?? 0) > 0 || mo > 0.6, y0 = ny + 3.9;
  const kl = q < 0 ? 1 - 0.25 * aq : 1, kr = q > 0 ? 1 - 0.25 * aq : 1;
  if (mo > 0.04) {
    const w = 2.6 + 2.6 * mo, d = 1.6 + 7.4 * mo;
    const jaw = blob([[nx - w - 1.5, y0 + 0.6], [nx + w + 1.5, y0 + 0.6], [nx + w * 0.92 + 1, y0 + d * 0.72 + 1.2], [nx, y0 + d + 2.1], [nx - w * 0.92 - 1, y0 + d * 0.72 + 1.2]]);
    fill(c, jaw, mix(V.cream, V.dark, 0.18)); line(c, jaw, L, hl * 0.9);
    const gape = blob([[nx - w, y0], [nx, y0 - 0.7], [nx + w, y0], [nx + w * 0.82, y0 + d * 0.7], [nx, y0 + d], [nx - w * 0.82, y0 + d * 0.7]]);
    fill(c, gape, '#6a2424');
    clipped(c, gape, () => {
      fill(c, oval(nx, y0 + d * 0.92, w * 0.72, d * 0.42), '#f58d9b');
      if (teeth) {
        c.fillStyle = '#fffdf5';
        for (const sg of [-1, 1]) {
          const fx = nx + sg * w * 0.6, fh2 = 1.8 + 2.6 * mo;
          c.beginPath(); c.moveTo(fx - 1.1, y0 - 0.5); c.lineTo(fx, y0 + fh2); c.lineTo(fx + 1.1, y0 - 0.5); c.closePath(); c.fill();
          const gx = nx + sg * w * 0.42;
          c.beginPath(); c.moveTo(gx - 0.8, y0 + d); c.lineTo(gx, y0 + d - 1.2 - 1.2 * mo); c.lineTo(gx + 0.8, y0 + d); c.closePath(); c.fill();
        }
      }
    });
    line(c, gape, L, hl * 0.8);
  }
  c.strokeStyle = L; c.lineWidth = hl * 0.85;
  c.beginPath(); c.moveTo(nx, ny + 1.6); c.lineTo(nx, y0);
  if (mo > 0.04) {
    const w = 2.6 + 2.6 * mo;
    c.moveTo(nx - w - 1.3 * kl, y0 + 0.3); c.quadraticCurveTo(nx - w * 0.5, y0 + 0.9, nx, y0); c.quadraticCurveTo(nx + w * 0.5, y0 + 0.9, nx + w + 1.3 * kr, y0 + 0.3);
  } else {
    c.moveTo(nx - 5 * kl, y0 + 0.5 - smile * 0.9); c.quadraticCurveTo(nx - 2.4 * kl, y0 + 2.9, nx, y0); c.quadraticCurveTo(nx + 2.4 * kr, y0 + 2.9, nx + 5 * kr, y0 + 0.5 - smile * 0.9);
  }
  c.stroke();
  // nose
  const nose = blob([[nx - 2.8, ny - 1.4], [nx, ny - 1.8], [nx + 2.8, ny - 1.4], [nx + 1.3, ny + 0.9], [nx, ny + 1.9], [nx - 1.3, ny + 0.9]]);
  fill(c, nose, V.nose); line(c, nose, L, hl * 0.65);
  if (pick('slant') > 0.4) { // snarl wrinkles
    c.strokeStyle = alpha(L, 0.6); c.lineWidth = hl * 0.7;
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(nx + sg * 1.6, ny - 3.6); c.lineTo(nx + sg * 3.4, ny - 2.6); c.stroke(); }
  }
  // whiskers: dark underlay + light hair so they read on any background
  c.fillStyle = alpha(L, 0.4);
  for (const sg of [-1, 1]) for (const [dx, dy] of [[3, 8.4], [5.2, 9.9], [3.2, 11.2]]) { c.beginPath(); c.arc(nx + sg * dx * (sg * q > 0 ? 1 - 0.25 * aq : 1), dy, 0.42, 0, TAU); c.fill(); }
  const wp = whiskers();
  line(c, wp, alpha(L, 0.32), hl * 0.95); line(c, wp, V.whisk || '#fffaf0', hl * 0.5);
  // eyes
  const lidCol = mix(headCol, V.light, 0.3), sl = pick('slant'), dil = clamp(pick('dilate', 0.42)), low = pick('low');
  for (const e of R.eyes) {
    c.save(); c.translate(e.x, e.y); c.scale(e.sx, 1);
    eye(c, { x: 0, y: 0, r: e.r, look: R.look, iris: V.iris, irisR: 0.76, slit: true, dilate: dil, lid: R.lid, lidAng: -e.side * sl, lidColor: lidCol, line: L, lw: hl * 0.85, happy: !!m.happy, low });
    c.restore();
  }
  c.restore();

  c.restore();
}
