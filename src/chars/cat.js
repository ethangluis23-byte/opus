// Cat rig: side-view body with a three-quarter head — the feline counterpart of drawDog (src/chars/dog.js). One rig
// covers the hero orange tabby, its feral descendants and the other cats of the film; a house mouse sits at the end.
//
// drawCat(c, {
//   x, y, s, flip   ground point under the body, scale, facing (1 right, -1 left). s 1 = 45 units to the shoulder,
//                   ~68 to the ear tips, ~72 nose to rump, tail ~50 (the dog at s 1 is 100 to the shoulder).
//   t, seed         seconds (breathing, blinks, happy slow-blinks, ear twitches, tail sway, whiskers) and de-sync seed
//   v               key of CATS or a partial variant object merged over CATS.orange (default 'orange')
//   pose            'stand' | 'sit' | 'loaf' | 'curl' | 'crouch' | 'leap' | 'arch' | 'lie', or [from, to, k] to blend.
//                   Default 'stand' ('curl' when mood is 'asleep', a stalking half-crouch when gait is 'stalk').
//                   sit: upright, tail wrapped round the paws · loaf: paws tucked · curl: sleeping ball, tail over the
//                   nose · crouch: low hunting crouch, shoulder blades and haunches up, head low · arch: Halloween arch
//                   (stiff legs, humped back, fur and tail puffed — pair with mood 'angry') · lie: sphinx, side view.
//   k, air          leap: k 0..1 = take-off push (hind paws on the ground) → stretched in the air (0.5) → landing reach
//                   (front paws touch the ground at k 1); air = apex height in units (scaled by s): the body rides
//                   air * sin(PI k) above the ground point. Move x yourself (lerp y too when landing on a table).
//   gait, phase     'walk' | 'trot' | 'run' | 'stalk' and cycle phase; advance phase by distance / catStride(gait, v, s)
//                   and the feet stay planted. Gaits drive 'stand' and 'crouch' (and blends between them).
//   mood            'neutral' | 'curious' | 'alert' | 'hunting' | 'scared' | 'angry' | 'sleepy' | 'asleep' | 'happy'
//   look            [dx, dy] gaze -1..1 (dx > 0 = forward; default [0.3, 0.05])     tilt   radians of head tilt
//   mouth           0..1 jaw open (a meow ~0.5; a hiss with bared fangs when mood is 'angry' or hiss: true)
//   paw             0..1 raise the near front paw (animate 0 → 1 → 0 to tap a bowl / bat at something)
//   eyeShine        0..1 night eye-shine: glowing green-gold eyes with a halo (see anchors.eyes to re-glow after grade)
//   tailFlick       0..1 tail-tip twitching (mood default; hunting 0.6)    pupil   0..1 dilation override (1 = round)
//   wet             0..1 rain-soaked: darker clumped fur, slimmer tail, glossy streaks
//   slope           body pitch in radians (> 0 = nose down, e.g. walking down stairs); the feet land on the inclined
//                   line through the ground point
//   ear, lid, blink overrides: ears -1 (flat) .. 1 (pricked forward), upper lid 0..1, blink signal 0..1
//   shadow          contact shadow: true (default, 0.3) | false | strength
// }) → anchors in the caller's coordinates: { eyes: [[x, y] near, [x, y] far], eyeR (world radius of the near eye),
//      nose, head, top (y of the ear tips), tail (tip), paws: { nf, ff, nh, fh } }.
//      For night shots draw the cat in the scene, then after g.grade(look): glow(c, ...eyes[i], eyeR * 3, '#c8ff5a').
//
// CATS                    orange (hero: #f08a24 tabby, cream chest/muzzle/paws, green eyes, pink nose),
//                         orange20 / orange50 / orange200 (feral line: leaner, scruffier, notched ear, duller coat),
//                         tuxedo (black, white bib/paws/muzzle, yellow eyes), grey (grey tabby)
// catStride(gait, v, s)   world distance covered per gait cycle
//
// drawMouse(c, { x, y, s, flip, t, seed, pose: 'stand' | 'run' | 'sniff', run (truthy → 'run'), phase, look, shadow })
//                         brown-grey house mouse, ~8 units tall and ~12 long (+ tail) at s 1, facing right at flip 1.
//                         Returns { nose, eye } anchors.
// mouseStride(s)          distance per run cycle (advance phase by distance / mouseStride(s))
import { blob, capsule, oval, union, join, fill, line, clipped, lin, rad, shadow, ik2, glow } from '../engine/draw.js';
import { TAU, clamp, lerp, smooth, ease, hash, noise1, mix, alpha } from '../engine/util.js';
import { eye, blink, gaitFoot, GAITS, inkW } from './rig.js';

const PI = Math.PI;
const U = 0.5; // the rig is authored at 2x: 90 design units to the shoulder → 45 units at s 1

export const CATS = {
  // The hero: orange tabby with cream chest, muzzle and paws.
  orange: { coat: '#f08a24', dark: '#c35d17', light: '#ffb867', cream: '#fde3bf', stripe: '#c4561a', line: '#5a2a0c', nose: '#f2939b',
    iris: '#7cc243', ear: '#f6a7a2', tabby: 1, bib: 0, socks: 0.55, lean: 0, scruff: 0, notch: 0, legK: 1, size: 1 },
  // Feral descendants: nearly unchanged — a touch leaner, scruffier, a notched ear, a slightly duller coat.
  orange20: { coat: '#e98a2e', dark: '#bb5d1b', light: '#f9b46b', cream: '#f8dfbb', stripe: '#bb561f', line: '#58290d', nose: '#e8939a',
    iris: '#7cbd45', ear: '#eea6a2', tabby: 1, bib: 0, socks: 0.5, lean: 0.25, scruff: 0.45, notch: 1, legK: 1.01, size: 1 },
  orange50: { coat: '#e28a35', dark: '#b45f20', light: '#f2b06e', cream: '#f3dbb7', stripe: '#b25826', line: '#56290f', nose: '#e2949a',
    iris: '#7db948', ear: '#e9a6a2', tabby: 1, bib: 0, socks: 0.45, lean: 0.32, scruff: 0.6, notch: 1, legK: 1.02, size: 1 },
  orange200: { coat: '#da893c', dark: '#ab6025', light: '#ebad71', cream: '#eed7b3', stripe: '#a9592b', line: '#542a11', nose: '#dc949a',
    iris: '#80b64a', ear: '#e4a5a2', tabby: 1, bib: 0, socks: 0.4, lean: 0.38, scruff: 0.7, notch: 1, legK: 1.03, size: 1 },
  // Other cats.
  tuxedo: { coat: '#302f37', dark: '#1b1a20', light: '#5c5b68', cream: '#f6f4ef', stripe: null, line: '#0c0b0f', nose: '#d98c96',
    iris: '#efc331', ear: '#c78b92', inner: '#77758a', whisk: 'rgba(246,244,239,0.85)', tabby: 0, bib: 1, socks: 1, blaze: 1,
    lean: 0.05, scruff: 0.1, notch: 0, legK: 1, size: 0.97 },
  grey: { coat: '#8f949c', dark: '#5d626b', light: '#c0c5cc', cream: '#efeee9', stripe: '#4b5058', line: '#22252b', nose: '#c98d93',
    iris: '#c3c43c', ear: '#e6a6a6', tabby: 1, bib: 0, socks: 0.5, lean: 0.1, scruff: 0.15, notch: 0, legK: 1, size: 0.95 },
};
const catVariant = (v) => (typeof v === 'string' ? CATS[v] || CATS.orange : v ? { ...CATS.orange, ...v } : CATS.orange);

// Rig gaits: the shared GAITS rescaled to the cat's legs (design units). The gallop is shortened to stay in reach.
const CG = {};
for (const [k, g] of Object.entries(GAITS)) {
  CG[k] = { ...g, stride: g.stride * (k === 'run' ? 0.62 : 0.8), lift: g.lift * 0.8, bob: g.bob * (k === 'run' ? 0.6 : 0.8) };
}

// World distance per gait cycle. gaitFoot slides a planted foot back by `stride` over the stance fraction `duty`,
// so the body must advance stride / duty per cycle for the paws to stay put.
export function catStride(gait = 'walk', v = 'orange', s = 1) {
  const V = catVariant(v), g = CG[gait] || CG.walk;
  return (g.stride / g.duty) * (V.legK ?? 1) * U * (V.size ?? 1) * s;
}

// Mood table. ear -1..1, lid / low (lower lid), ang = lid slant (+ inner corners down = stern, - = worried),
// pupil = slit dilation, whisk = whisker angle, tail = TAILS style, sway/flick = tail life, head offset/rotation.
const MOODS = {
  neutral: { ear: 0, lid: 0.12, low: 0, ang: 0.1, pupil: 0.38, mouth: 0, whisk: 0, tail: 'up', sway: 1, flick: 0.12, head: [0, 0], hrot: 0, puff: 0 },
  curious: { ear: 0.6, lid: 0, low: 0, ang: -0.06, pupil: 0.62, mouth: 0, whisk: 0.5, tail: 'hook', sway: 0.8, flick: 0.25, head: [3, -3], hrot: 0, puff: 0 },
  alert: { ear: 1, lid: 0, low: 0, ang: 0.04, pupil: 0.5, mouth: 0, whisk: 0.4, tail: 'up', sway: 0.45, flick: 0.2, head: [2, -6], hrot: -0.04, puff: 0 },
  hunting: { ear: 0.85, lid: 0.1, low: 0.24, ang: 0.16, pupil: 0.97, mouth: 0, whisk: 0.85, tail: 'low', sway: 0.25, flick: 0.6, head: [6, 7], hrot: 0.06, puff: 0 },
  scared: { ear: -0.85, lid: 0, low: 0, ang: -0.3, pupil: 1, mouth: 0.08, whisk: -0.7, tail: 'tuck', sway: 0.2, flick: 0.1, head: [-4, 7], hrot: 0.08, puff: 0.55 },
  angry: { ear: -1, lid: 0.24, low: 0.3, ang: 0.42, pupil: 0.26, mouth: 0.8, hiss: 1, whisk: -0.8, tail: 'lash', sway: 1, swaySpeed: 3.4, flick: 0.4, head: [2, 4], hrot: 0.04, puff: 0.7 },
  sleepy: { ear: -0.12, lid: 0.62, low: 0.18, ang: 0.05, pupil: 0.4, mouth: 0, whisk: -0.1, tail: 'down', sway: 0.35, flick: 0.05, head: [0, 4], hrot: 0.08, puff: 0 },
  asleep: { ear: -0.2, lid: 1, low: 0, ang: 0, pupil: 0.4, mouth: 0, whisk: -0.2, tail: 'down', sway: 0.12, flick: 0.08, head: [0, 5], hrot: 0.12, puff: 0, sleep: 1 },
  happy: { ear: 0.15, lid: 0.3, low: 0.2, ang: 0.08, pupil: 0.45, mouth: 0, whisk: 0.15, tail: 'hook', sway: 0.9, flick: 0.2, head: [0, -2], hrot: -0.03, puff: 0, slow: 1 },
};

// Tail carriage: a0 = base direction (canvas radians for a cat facing right; PI = straight back), c0 / c1 = turn per
// segment at the base / tip (+ curls up and over, - curls down and under).
const TAILS = {
  up: { a0: PI + 1.0, c0: 0.07, c1: 0.32 },
  hook: { a0: PI + 1.38, c0: 0, c1: 0.62 },
  low: { a0: PI + 0.1, c0: -0.02, c1: 0.1 },
  down: { a0: PI - 0.6, c0: 0.07, c1: 0.2 },
  tuck: { a0: PI - 1.15, c0: -0.16, c1: -0.18 },
  lash: { a0: PI + 0.45, c0: 0.1, c1: -0.2 },
};

// Pose table (design units, ground at y 0, facing +x). hip / sh = spine end joints; arch = dorsal hump (archV share of
// it applied to the belly); belly = depth factor; back = dorsal thickness; froot = front-leg root offset from sh;
// ftar = front paw target; fl = front leg length factor; fpa / hpa = paw angles; hk = knee offset from hip;
// htar = hind paw target; haunch = [dx, dy, rx, ry, rot] from hip; head = head offset from the neck base; hrot = head
// rotation; gait = how much a gait drives the legs; puff = fur raised; tail = carriage override (front 1 = drawn over
// the body, 2 = over the head too; base = [a, b] spine coords of the root).
const P0 = { arch: 0, archV: 0, belly: 1, back: 19, fl: 1, fpa: 0, hpa: 0, hrot: 0, gait: 0, puff: 0, lift: 0, tail: null };
const POSES = {
  stand: { ...P0, hip: [-35, -66], sh: [35, -64], froot: [2, 7], ftar: [37, 0], hk: [11, 28], htar: [-37, 0], haunch: [3, 9, 17, 21, -0.25],
    head: [14, -22], gait: 1 },
  sit: { ...P0, hip: [-20, -26], sh: [18, -70], froot: [3, 7], ftar: [27, 0], fl: 1.06, hk: [30, 6], htar: [13, -1], haunch: [9, 4, 25, 22, 0.1],
    head: [9, -21], hrot: -0.05, tail: { a0: PI - 0.75, c0: -0.42, c1: -0.28, front: 1, base: [-0.3, -4] } },
  loaf: { ...P0, hip: [-32, -30], sh: [28, -32], belly: 1.06, back: 21, froot: [0, 6], ftar: [39, -3], hk: [22, 14], htar: [-6, -3],
    haunch: [6, 6, 22, 21, 0], head: [6, -17], tail: { a0: PI - 1.1, c0: -0.42, c1: -0.2, front: 1, base: [-0.3, -6] } },
  curl: { ...P0, hip: [-24, -24], sh: [16, -24], arch: 16, belly: 1, back: 20, froot: [0, 4], ftar: [28, -3], hk: [20, 12], htar: [4, -3],
    haunch: [4, 4, 23, 19, 0], head: [12, 10], hrot: 0.5, tail: { a0: PI - 1.3, c0: -0.5, c1: -0.25, front: 2, base: [-0.35, -2] } },
  crouch: { ...P0, hip: [-32, -42], sh: [28, -32], froot: [0, -14], ftar: [46, 0], hk: [14, 22], htar: [-26, 0], haunch: [2, 8, 18, 21, -0.1],
    head: [22, 8], hrot: 0.05, gait: 1, tail: null },
  arch: { ...P0, hip: [-26, -80], sh: [24, -68], arch: 22, archV: 0.85, froot: [0, 8], ftar: [16, 0], hk: [6, 30], htar: [-14, 0],
    haunch: [2, 8, 16, 19, -0.15], head: [16, 0], hrot: 0.1, puff: 1, tail: { a0: PI + 1.45, c0: -0.02, c1: -0.06, front: 0, base: [-0.27, 8] } },
  lie: { ...P0, hip: [-34, -26], sh: [30, -30], froot: [2, 6], ftar: [78, -3.5], hk: [26, 10], htar: [6, -3], haunch: [8, 6, 23, 20, 0],
    head: [10, -16], tail: { a0: PI - 0.5, c0: -0.3, c1: -0.25, front: 1, base: [-0.3, -8] } },
};
// Leap keys: take-off (k 0), stretched flight (k 0.5), landing reach (k 1).
const LEAP = [
  { ...P0, hip: [-22, -54], sh: [32, -84], froot: [2, 6], ftar: [54, -54], fpa: 1.1, hk: [-10, 22], htar: [-56, 0], hpa: 0.5,
    haunch: [2, 8, 17, 21, 0.3], head: [12, -16], hrot: -0.15, tail: { a0: PI + 0.2, c0: 0.04, c1: 0.1, front: 0, base: [-0.27, 8] } },
  { ...P0, hip: [-42, -58], sh: [40, -62], froot: [4, 6], ftar: [90, -36], fpa: 0.25, hk: [-6, 20], htar: [-96, -30], hpa: 2.2,
    haunch: [2, 8, 17, 20, -0.4], head: [20, -8], hrot: 0.05, tail: { a0: PI + 0.1, c0: 0.02, c1: 0.06, front: 0, base: [-0.27, 8] } },
  { ...P0, hip: [-30, -76], sh: [34, -52], froot: [2, 7], ftar: [58, 0], fpa: -0.2, hk: [16, 20], htar: [-4, -34], hpa: 0.9,
    haunch: [2, 8, 17, 21, -0.5], head: [16, -12], hrot: 0.12, tail: { a0: PI + 0.7, c0: 0.05, c1: 0.2, front: 0, base: [-0.27, 8] } },
];

function blendPose(A, B, k) {
  if (k <= 0) return A;
  if (k >= 1) return B;
  const o = {};
  for (const key in A) {
    const a = A[key], b = B[key];
    if (typeof a === 'number') o[key] = lerp(a, b, k);
    else if (Array.isArray(a)) o[key] = a.map((v, i) => lerp(v, b[i], k));
    else o[key] = k < 0.5 ? a : b;
  }
  return o;
}
function blendTail(A, B, k) {
  if (A === B || k <= 0) return A;
  if (k >= 1) return B;
  return { a0: lerp(A.a0, B.a0, k), c0: lerp(A.c0, B.c0, k), c1: lerp(A.c1, B.c1, k), front: k < 0.5 ? A.front : B.front,
    base: [lerp(A.base[0], B.base[0], k), lerp(A.base[1], B.base[1], k)] };
}
function onePose(name, k) {
  if (name !== 'leap') return POSES[name] || POSES.stand;
  const A = k < 0.5 ? LEAP[0] : LEAP[1], B = k < 0.5 ? LEAP[1] : LEAP[2], u = smooth(k < 0.5 ? k * 2 : k * 2 - 1);
  return { ...blendPose(A, B, u), tail: blendTail(A.tail, B.tail, u), lift: Math.sin(PI * k) };
}
function resolvePose(pose, k, MT) {
  if (Array.isArray(pose)) {
    const A = onePose(pose[0], k), B = onePose(pose[1], k), w = clamp(pose[2]);
    const P = blendPose(A, B, w);
    return { ...P, tail: blendTail(A.tail || MT, B.tail || MT, w) };
  }
  const P = onePose(pose, k);
  return P.tail ? P : { ...P, tail: MT };
}

// Happy cats slow-blink: lids sink shut, hold, and reopen every few seconds.
function slowBlink(t, seed) {
  const per = 5.2, u = (((t + hash(seed, 4) * per) % per) + per) % per;
  if (u < 0.55) return smooth(u / 0.55);
  if (u < 1.0) return 1;
  if (u < 1.7) return 1 - smooth((u - 1.0) / 0.7);
  return 0;
}
// Ear flicks: one ear snaps back briefly every few seconds.
function earTwitch(t, seed) {
  const per = 3.9, k = t / per + hash(seed, 11), i = Math.floor(k), u = (k - i) * per, at = hash(i, seed + 13) * (per - 0.4);
  const d = u - at, amt = d > 0 && d < 0.3 ? Math.sin((d / 0.3) * PI) : 0;
  return hash(i, seed + 19) < 0.5 ? { near: amt, far: 0 } : { near: 0, far: amt };
}

// Ears in head units (skull centre 0,0, skull radius ~24, x forward). Last point sits inside the skull.
const EAR_NEAR = { piv: [-11, -16], pts: [[-21, -6], [-24.5, -20], [-23, -33], [-19, -44, 1], [-12, -36], [-5, -27], [-1, -21], [-9, -10]],
  notch: [[-21, -6], [-24.5, -20], [-23.6, -29, 1], [-19.6, -30.5, 1], [-22.2, -35, 1], [-19, -44, 1], [-12, -36], [-5, -27], [-1, -21], [-9, -10]],
  inner: [[-18.5, -13], [-20.5, -31], [-18.6, -39.5, 1], [-12, -32], [-7, -24], [-11, -15]] };
const EAR_FAR = { piv: [14, -18], pts: [[6, -21], [7.5, -32], [16, -42, 1], [21, -31], [23, -18], [20, -10], [12, -12]],
  inner: [[9.5, -22], [11, -31.5], [16, -39, 1], [17.5, -28], [15, -18]] };

// Outline helper for a centreline with half-widths: returns closed (fill) and open (no base cap: stroke) paths.
function ribbon(cen, wid, spiky) {
  const n = cen.length, up = [], lo = [];
  for (let i = 0; i < n; i++) {
    const a = cen[Math.max(0, i - 1)], b = cen[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const w = wid[i], q = cen[i];
    if (spiky > 0 && i > 0 && i < n - 1) {
      // bottle-brush fur: a sharp tuft between every pair of centreline points
      const pm = cen[i - 1], wm = (wid[i - 1] + w) / 2 * (1 + 0.42 * spiky), mx = (pm[0] + q[0]) / 2, my = (pm[1] + q[1]) / 2;
      up.push([mx - dy * wm, my + dx * wm, 1]); lo.push([mx + dy * wm, my - dx * wm, 1]);
    }
    up.push([q[0] - dy * w, q[1] + dx * w]); lo.push([q[0] + dy * w, q[1] - dx * w]);
  }
  const e = cen[n - 1], p = cen[n - 2], dl = Math.hypot(e[0] - p[0], e[1] - p[1]) || 1, w = wid[n - 1];
  const tip = [e[0] + ((e[0] - p[0]) / dl) * w * 0.95, e[1] + ((e[1] - p[1]) / dl) * w * 0.95];
  const pts = [...up, tip, ...lo.reverse()];
  return { closed: blob(pts), open: blob(pts, false), up, lo };
}

export function drawCat(c, p = {}) {
  const V = catVariant(p.v);
  const moodKey = p.mood && MOODS[p.mood] ? p.mood : 'neutral', m = MOODS[moodKey];
  const pick = (k) => (p[k] !== undefined ? p[k] : m[k]);
  const t = p.t ?? 0, seed = p.seed ?? 0, flip = p.flip ?? 1, s = p.s ?? 1, size = V.size ?? 1;
  const K = s * U * size, lw = (inkW(s) * s * 0.92) / K;
  const wet = clamp(p.wet ?? 0), legK = V.legK ?? 1, lean = V.lean ?? 0, scruff = V.scruff ?? 0;
  const L = V.line, inner = V.inner || L;
  const coat = wet ? mix(V.coat, V.dark, wet * 0.5) : V.coat;
  const dark = wet ? mix(V.dark, L, wet * 0.3) : V.dark;
  const light = wet ? mix(V.light, V.coat, wet * 0.55) : V.light;
  const cream = wet ? mix(V.cream, V.dark, wet * 0.22) : V.cream;
  const stripe = V.stripe ? (wet ? mix(V.stripe, L, wet * 0.3) : V.stripe) : null;

  // ---- pose ----
  const gname = p.gait && CG[p.gait] ? p.gait : null;
  const pose = p.pose ?? (moodKey === 'asleep' ? 'curl' : gname === 'stalk' ? ['stand', 'crouch', 0.55] : 'stand');
  const MT = { ...TAILS[m.tail], front: 0, base: [-0.27, 8] };
  const P = resolvePose(pose, clamp(p.k ?? 0.5), MT);
  const g = gname ? CG[gname] : null, ph = p.phase ?? 0, gw = g ? P.gait : 0;
  const sleep = m.sleep ? 1 : 0;
  const breath = 0.5 + 0.5 * Math.sin(t * (sleep ? 1.25 : 2.1) + seed * 1.7);
  const slope = p.slope ?? 0, ts = Math.tan(slope), gy = (x) => x * ts;
  const lift = (P.lift ?? 0) * (p.air ?? 0) / (U * size);
  const puff = clamp(Math.max(P.puff, m.puff ?? 0) + wet * 0);

  // ---- skeleton ----
  let hip = [P.hip[0], P.hip[1] - lift], sh = [P.sh[0], P.sh[1] - lift], ba = 0, archX = 0;
  const rotAbout = (q, cx, cy, a) => { const ca = Math.cos(a), sa = Math.sin(a), x = q[0] - cx, y = q[1] - cy; return [cx + x * ca - y * sa, cy + x * sa + y * ca]; };
  if (g && gw > 0) {
    const bob = -g.bob * (0.5 - 0.5 * Math.cos(TAU * g.bobs * ph)) * gw, pit = g.pitch * Math.sin(TAU * ph + 0.6) * gw;
    const cx = (hip[0] + sh[0]) / 2, cy = (hip[1] + sh[1]) / 2;
    if (gname === 'run') { // bounding gallop: the spine gathers (hind feet forward) and stretches (front reach)
      const fx = Math.cos(TAU * (ph - 0.05)) * gw, fk = 1 - 0.12 * fx;
      hip[0] = cx + (hip[0] - cx) * fk; sh[0] = cx + (sh[0] - cx) * fk; archX = 9 * Math.max(0, fx);
    }
    hip = rotAbout(hip, cx, cy, pit); sh = rotAbout(sh, cx, cy, pit); hip[1] += bob; sh[1] += bob; ba += pit;
  }
  if (slope) { const cx = (hip[0] + sh[0]) / 2, cy = (hip[1] + sh[1]) / 2; hip = rotAbout(hip, cx, cy, slope); sh = rotAbout(sh, cx, cy, slope); ba += slope; }
  const R = (v) => [v[0] * Math.cos(ba) - v[1] * Math.sin(ba), v[0] * Math.sin(ba) + v[1] * Math.cos(ba)];
  const sd = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]) || 1, ux = (sh[0] - hip[0]) / sd, uy = (sh[1] - hip[1]) / sd, nx = uy, ny = -ux;
  const arch = P.arch + archX, archV = P.archV;
  const sp = (a, b) => { const bb = b + arch * 4 * a * (1 - a) * (b >= 0 ? 1 : archV); return [hip[0] + ux * a * sd + nx * bb, hip[1] + uy * a * sd + ny * bb]; };

  // head placement
  const gaitNod = g && gw ? Math.sin(TAU * g.bobs * ph + 1.2) * 0.03 * gw : 0;
  const nb = [sh[0] + R([6, -8])[0], sh[1] + R([6, -8])[1]];
  const ho = R([P.head[0] + m.head[0], P.head[1] + m.head[1] - breath * 0.6 * (1 - sleep) + breath * 0.9 * sleep]);
  const hc = [nb[0] + ho[0], nb[1] + ho[1] + gaitNod * 12];
  const hRot = P.hrot + m.hrot + (p.tilt ?? 0) + gaitNod + ba * 0.7 + Math.sin(t * 0.8 + seed) * 0.012;
  const hcos = Math.cos(hRot), hsin = Math.sin(hRot);
  const H2B = (q) => [hc[0] + q[0] * hcos - q[1] * hsin, hc[1] + q[0] * hsin + q[1] * hcos];

  // ---- torso outline (spine coords a along hip→shoulder, b towards the back), fur tufts as sharp points ----
  const dep = (25 + breath * (sleep ? 1.6 : 0.9)) * (1 - lean * 0.12) * (1 - wet * 0.05) * P.belly;
  const tuck = (19 - lean * 3) * P.belly, back = P.back + puff * 2;
  const fz = 0.55 + scruff * 0.6 + puff * 0.6 + wet * 0.5, fb = scruff * 0.8 + wet * 0.9 + puff * 0.4;
  const T = [[-0.08, back + 1], [-0.27, 9], [-0.31, -6], [-0.345 - 0.05 * fz, -13, 1], [-0.24, -18], [-0.2, -20]];
  T.push([0.18, -tuck - 4]);
  if (fb > 0.15) for (const a of [0.3, 0.45, 0.6, 0.75]) T.push([a - 0.05, -lerp(tuck + 3, dep, (a - 0.2) / 0.6)], [a, -lerp(tuck + 3, dep, (a - 0.2) / 0.6) - 4.5 * fb, 1]);
  else T.push([0.55, -tuck - 2]);
  T.push([0.88, -dep], [1.1, -dep * 0.6], [1.17 + 0.05 * fz, -dep * 0.46, 1], [1.15, -dep * 0.33], [1.21 + 0.045 * fz, -dep * 0.18, 1], [1.2, -4], [1.12, 12], [0.92, back + 2]);
  if (puff + wet * 0.5 > 0.1) {
    const k = puff + wet * 0.35;
    for (let a = 0.8; a > -0.05; a -= 0.12) T.push([a, back + 0.5], [a - 0.06, back + 1 + 6 * k, 1]);
  } else T.push([0.5, back - 2.5]);
  const torso = blob(T.map(([a, b, sharp]) => { const q = sp(a, b); return sharp ? [q[0], q[1], 1] : q; }));
  const nA = [sh[0] + R([1, 3])[0], sh[1] + R([1, 3])[1]], nB = H2B([-4, 9]);
  const neck = capsule(nA[0], nA[1], 18 * (1 - lean * 0.06), nB[0], nB[1], 13.5);

  // ---- legs ----
  const fU = 29 * legK * P.fl, fL = 31 * legK * P.fl, th = 29 * legK, mt = 25 * legK;
  const frontLeg = (far) => {
    const off = far ? [5, -2] : [0, 0], key = far ? 'ff' : 'nf', ro = R(P.froot);
    const root = [sh[0] + ro[0] + off[0], sh[1] + ro[1] + off[1]];
    let tx = P.ftar[0] + off[0], gx = 0, gyo = 0;
    if (g && gw > 0) { const d = gaitFoot(ph + g.off[key], g); gx = d[0] * gw * legK; gyo = d[1] * gw; }
    tx += gx;
    let ty = P.ftar[1] - lift + gy(tx) + gyo;
    const pr = far ? 0 : clamp(p.paw ?? 0);
    if (pr > 0) { const e = ease.io(pr); tx = lerp(tx, root[0] + 25, e); ty = lerp(ty, root[1] + 27, e) - Math.sin(pr * PI) * 4; }
    const a = ik2(root[0], root[1], tx, ty, fU, fL, 1);
    const j = [a.jx, Math.min(a.jy, gy(a.jx) - 3)], e = [a.ex, a.ey];
    const sw = g && gw > 0 ? clamp(-gyo / g.lift) : 0, pa = P.fpa + sw * 0.9 + pr * 1.15 + ba * 0.6;
    const pc = [e[0] + Math.cos(pa) * 4.5, e[1] - 4 + Math.sin(pa) * 4.5];
    const paw = oval(pc[0], pc[1], 8.6, 5.3, pa);
    return { parts: [capsule(root[0], root[1], 8.4 - lean, j[0], j[1], 6), capsule(j[0], j[1], 6, e[0], e[1] - 4, 4.7), paw], root, j, e, pa, pc, pr };
  };
  const hindLeg = (far) => {
    const off = far ? [5, -2] : [0, 0], key = far ? 'fh' : 'nh', hh = R(P.haunch), kk = R(P.hk);
    const hcen = [hip[0] + hh[0] + off[0], hip[1] + hh[1] + off[1]];
    const haunch = oval(hcen[0], hcen[1], P.haunch[2] * (1 - lean * 0.08), P.haunch[3] * (1 - lean * 0.06), P.haunch[4] + ba);
    const knee = [hip[0] + kk[0] * legK + off[0], hip[1] + kk[1] * legK + off[1]];
    let tx = P.htar[0] + off[0], gx = 0, gyo = 0;
    if (g && gw > 0) { const d = gaitFoot(ph + g.off[key], g); gx = d[0] * gw * legK; gyo = d[1] * gw; }
    tx += gx;
    const ty = P.htar[1] - lift + gy(tx) + gyo;
    const k = ik2(knee[0], knee[1], tx, ty, th, mt, 1);
    const hock = [k.jx, Math.min(k.jy, gy(k.jx) - 3)], e = [k.ex, k.ey];
    const sw = g && gw > 0 ? clamp(-gyo / g.lift) : 0, pa = P.hpa + sw * 0.8 + ba * 0.6;
    const pc = [e[0] + Math.cos(pa) * 5, e[1] - 4 + Math.sin(pa) * 5];
    const paw = oval(pc[0], pc[1], 9.2, 5.2, pa);
    return { parts: [haunch, capsule(knee[0], knee[1], 8.6 - lean, hock[0], hock[1], 5.2), capsule(hock[0], hock[1], 5.2, e[0], e[1] - 4, 4.6), paw],
      hcen, knee, hock, e, pa, pc };
  };
  const nf = frontLeg(false), ff = frontLeg(true), nh = hindLeg(false), fh = hindLeg(true);

  // ---- tail ----
  const TL = P.tail, tb = sp(TL.base[0], TL.base[1]);
  const flick = clamp(p.tailFlick ?? m.flick ?? 0), swayAmp = (m.sway ?? 1) * (gw ? 0.6 : 1), swaySp = m.swaySpeed ?? 1.25;
  const fsig = flick * (Math.sin(t * 7.3 + seed) * 0.6 + Math.sin(t * 12.7 + seed * 2.1) * 0.4) * (0.55 + 0.45 * noise1(t * 0.9, seed + 7));
  const segs = 9, segLen = 11.4, cen = [tb];
  let ta = TL.a0 + ba * 0.8, tx0 = tb[0], ty0 = tb[1];
  for (let i = 0; i < segs; i++) {
    const u = i / (segs - 1);
    ta += lerp(TL.c0, TL.c1, smooth(u)) + Math.sin(t * swaySp + seed * 0.7 - i * 0.5) * 0.045 * swayAmp * (0.4 + u) + (i >= segs - 3 ? fsig * 0.3 * (i - segs + 4) / 3 : 0);
    tx0 += Math.cos(ta) * segLen; ty0 += Math.sin(ta) * segLen;
    ty0 = Math.min(ty0, gy(tx0) - 5.5);
    cen.push([tx0, ty0]);
  }
  const tpuff = puff * (TL.front ? 0.3 : 1);
  const twid = cen.map((_, i) => lerp(7, 5.3, i / segs) * (1 - wet * 0.28) * (1 + tpuff * 0.9 + scruff * 0.06));
  const tail = ribbon(cen, twid, tpuff + wet * 0.6);

  // ---- draw ----
  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(K * flip, K);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const shA = p.shadow === false ? 0 : p.shadow === true || p.shadow == null ? 0.3 : +p.shadow;
  if (shA > 0) {
    const xs = [nf.pc[0], nh.pc[0], nh.hcen[0] - P.haunch[2], nf.pc[0] + 8], x0 = Math.min(...xs), x1 = Math.max(...xs);
    const cx = (x0 + x1) / 2, ak = 1 / (1 + lift / 70);
    c.save(); c.translate(cx, gy(cx) + 1); c.rotate(slope);
    shadow(c, 0, 0, ((x1 - x0) / 2 + 16) * lerp(0.75, 1, ak), 7 * lerp(0.7, 1, ak), shA * ak);
    c.restore();
  }

  // far legs: outline-under-fill gives one merged contour without boolean ops
  const farCol = mix(dark, L, 0.12);
  for (const leg of [fh, ff]) {
    c.strokeStyle = L; c.lineWidth = lw * 2;
    for (const q of leg.parts) c.stroke(q);
    c.fillStyle = farCol;
    for (const q of leg.parts) c.fill(q);
    if (V.socks >= 0.9) clipped(c, join(...leg.parts), () => fill(c, capsule(leg.pc[0], leg.pc[1], 10, (leg.hock || leg.j)[0], (leg.hock || leg.j)[1], 4), mix(cream, '#8d8a96', 0.35)));
  }
  const drawTail = (front) => {
    const ys = cen.map((q) => q[1]), y0 = Math.min(...ys) - 8, y1 = Math.max(...ys) + 8;
    fill(c, tail.closed, lin(c, 0, y0, 0, y1, [[0, mix(coat, light, 0.35)], [0.6, coat], [1, dark]]));
    if (stripe) clipped(c, tail.closed, () => {
      c.strokeStyle = alpha(stripe, 0.75); c.lineWidth = 4.2;
      for (const i of [2, 4, 6]) { const a = tail.up[Math.min(tail.up.length - 1, i * (tpuff + wet * 0.6 > 0 ? 2 : 1))], q = cen[i], dx = q[0] - a[0], dy = q[1] - a[1]; c.beginPath(); c.moveTo(a[0] - dx * 0.4, a[1] - dy * 0.4); c.lineTo(q[0] + dx * 1.4, q[1] + dy * 1.4); c.stroke(); }
      const e = cen[segs], q = cen[segs - 1];
      fill(c, oval(e[0], e[1], 13, 10, Math.atan2(e[1] - q[1], e[0] - q[0])), alpha(stripe, 0.8));
    });
    clipped(c, tail.closed, () => { c.save(); c.translate(1.1 * flip, 2.4); c.globalAlpha = 0.3; line(c, tail.open, light, lw * 2.2); c.restore(); });
    line(c, front ? tail.open : tail.closed, L, lw);
  };
  if (!TL.front) drawTail(false);

  // near silhouette: one merged outline; markings clipped to the trunk; legs painted over them
  const legParts = [...nh.parts, ...nf.parts];
  const sil = union(torso, neck, ...legParts);
  const top = Math.min(hip[1], sh[1]) - back - arch - 4, bot = Math.max(nh.e[1], nf.e[1], 0) + 2;
  fill(c, sil, lin(c, 0, top, 0, bot, [[0, light], [0.42, coat], [1, dark]]));
  clipped(c, torso, () => {
    if (stripe) {
      c.fillStyle = alpha(stripe, 0.7);
      c.fill(blob([sp(-0.12, back + 6), sp(0.5, back + 5), sp(1.02, back + 6), sp(1.0, back - 4), sp(0.5, back - 6.5), sp(-0.1, back - 5)]));
      for (let i = 0; i < 6; i++) {
        const a = 0.04 + i * 0.155, w = 0.032, b1 = -6 - (i % 2) * 5;
        c.fill(blob([sp(a - w, back + 6), sp(a + w, back + 6), sp(a + w * 0.6, 4), sp(a - w * 1.2, b1, 1), sp(a - w * 1.4, 4)]));
      }
    }
    if (V.bib) {
      fill(c, blob([sp(1.3, 2), sp(1.05, -dep * 0.22), sp(0.78, -tuck * 0.75), sp(0.4, -tuck * 0.72), sp(0.15, -tuck - 2), sp(0.1, -dep - 14), sp(1.3, -dep - 14)]), cream);
    } else {
      const ca = 0.95, q = sp(1.1, -dep * 0.45);
      c.fillStyle = rad(c, q[0], q[1], 26, [[0, alpha(cream, ca)], [0.55, alpha(cream, ca * 0.8)], [1, alpha(cream, 0)]]);
      c.fillRect(q[0] - 26, q[1] - 26, 52, 52);
      const b2 = sp(0.5, -dep - 2);
      c.save(); c.translate(b2[0], b2[1]); c.rotate(Math.atan2(uy, ux)); c.scale(1, 0.3);
      c.fillStyle = rad(c, 0, 0, sd * 0.62, [[0, alpha(cream, 0.85)], [0.6, alpha(cream, 0.5)], [1, alpha(cream, 0)]]);
      c.fillRect(-sd, -sd, sd * 2, sd * 2); c.restore();
    }
    if (wet > 0.05) { // glossy wet streaks along the back
      c.strokeStyle = alpha('#ffffff', 0.32 * wet); c.lineWidth = 1.6;
      for (const [a, b] of [[0.15, back - 4], [0.42, back - 6], [0.7, back - 4]]) { const q0 = sp(a, b), q1 = sp(a + 0.13, b - 1); c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); c.stroke(); }
    }
  });
  const legClip = join(...legParts);
  clipped(c, legClip, () => {
    const f0 = clamp((sh[1] + 4 - top) / (bot - top)), f1 = clamp((sh[1] + 30 - top) / (bot - top));
    c.fillStyle = lin(c, 0, top, 0, bot, [[0, alpha(coat, 0)], [f0, alpha(coat, 0)], [f1, mix(coat, dark, f1 * 0.45)], [1, dark]]);
    c.fillRect(-300, top - 60, 600, 500);
    if (stripe) {
      c.strokeStyle = alpha(stripe, 0.6); c.lineWidth = 4;
      const band = (a, b, k, w) => { const x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k), dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1; c.beginPath(); c.moveTo(x - (dy / dl) * w, y + (dx / dl) * w); c.lineTo(x + (dy / dl) * w, y - (dx / dl) * w); c.stroke(); };
      band(nf.j, nf.e, 0.3, 9); band(nf.j, nf.e, 0.6, 9); band(nh.knee, nh.hock, 0.35, 11); band(nh.knee, nh.hock, 0.7, 10);
      c.lineWidth = 4.6; c.beginPath(); c.ellipse(nh.hcen[0] - 3, nh.hcen[1] + 2, P.haunch[2] * 0.75, P.haunch[3] * 0.8, P.haunch[4] + ba, -2.4, -1.2); c.stroke();
    }
    const sk = V.socks ?? 0;
    if (sk > 0) for (const leg of [nf, nh]) {
      const up = leg.hock || leg.j;
      if (sk >= 0.9) fill(c, capsule(leg.pc[0], leg.pc[1], 10, lerp(leg.e[0], up[0], 0.55), lerp(leg.e[1], up[1], 0.55), 6), cream);
      else { c.fillStyle = rad(c, leg.pc[0], leg.pc[1] - 1, 15, [[0, alpha(cream, sk)], [0.55, alpha(cream, sk * 0.75)], [1, alpha(cream, 0)]]); c.fillRect(leg.pc[0] - 15, leg.pc[1] - 16, 30, 30); }
    }
  });
  clipped(c, sil, () => {
    // soft form shadow underneath, rim light along the top edges, a hint of the thigh
    const fy = Math.max(nh.hcen[1], sh[1] + dep * 0.5) - 12;
    c.fillStyle = lin(c, 0, fy - 10, 0, fy + 26, [[0, alpha(dark, 0)], [1, alpha(mix(dark, L, 0.3), 0.42)]]);
    c.fillRect(-300, fy - 10, 600, 36 + 200);
    c.save(); c.translate(1.2 * flip, 2.8); c.globalAlpha = 0.36; line(c, sil, light, lw * 2.4); c.restore();
    c.save(); c.globalAlpha = 0.34; c.strokeStyle = inner; c.lineWidth = lw * 0.8; c.beginPath();
    c.ellipse(nh.hcen[0], nh.hcen[1], P.haunch[2] * (1 - lean * 0.08), P.haunch[3] * (1 - lean * 0.06), P.haunch[4] + ba, -1.3, 0.7); c.stroke(); c.restore();
  });
  line(c, sil, L, lw);
  // toes, and the pink pads of a raised paw
  c.strokeStyle = alpha(inner, 0.7); c.lineWidth = lw * 0.65;
  for (const leg of [nf, nh]) for (const d of [2.6, 6.6]) {
    const bx = leg.pc[0] + Math.cos(leg.pa) * (d - 1), by = leg.pc[1] + 1 + Math.sin(leg.pa) * (d - 1);
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 0.6, by + 2.8); c.stroke();
  }
  if (nf.pr > 0.35) {
    const a = clamp((nf.pr - 0.35) / 0.4);
    c.save(); c.translate(nf.pc[0], nf.pc[1]); c.rotate(nf.pa); c.globalAlpha = a;
    fill(c, oval(-0.5, 4.4, 4.2, 2.3), '#e9919a');
    for (const [dx, dy] of [[4.8, 3.2], [6.6, 0.6], [2.4, 5.6]]) fill(c, oval(dx, dy, 1.6, 1.3), '#e9919a');
    c.restore();
  }
  if (TL.front === 1) drawTail(true);

  // ---- head (head units: skull centre 0,0, radius ~24, x forward) ----
  c.save();
  c.translate(hc[0], hc[1]); c.rotate(hRot);
  const earIn = clamp(pick('ear') ?? 0, -1, 1), flat = Math.max(0, -earIn), tw = earTwitch(t, seed);
  const earSway = g && gw ? Math.sin(TAU * g.bobs * ph) * 0.03 : 0;
  const drawEar = (E, far) => {
    const a = (earIn > 0 ? 0.13 * earIn : -flat * (far ? 0.9 : 1.15)) - (far ? tw.far : tw.near) * 0.32 + earSway, sy = 1 - flat * 0.36;
    const ca = Math.cos(a), sa = Math.sin(a), [px, py] = E.piv;
    const tf = (q) => { const x = q[0] - px, y = (q[1] - py) * sy; return [px + x * ca - y * sa, py + x * sa + y * ca, q[2]]; };
    const pts = (!far && V.notch ? E.notch : E.pts).map(tf);
    const outer = blob(pts);
    fill(c, outer, lin(c, 0, -44, 0, -12, far ? [[0, mix(coat, dark, 0.25)], [1, mix(coat, dark, 0.45)]] : [[0, mix(coat, light, 0.45)], [1, coat]]));
    clipped(c, outer, () => {
      fill(c, blob(E.inner.map(tf)), far ? mix(V.ear, dark, 0.35) : V.ear);
      if (!far) {
        c.strokeStyle = alpha(mix(cream, '#ffffff', 0.5), 0.85); c.lineWidth = 1.3;
        for (const [x0, y0, x1, y1] of [[-14, -16, -18, -27], [-11, -17, -12.5, -28], [-16, -14, -21, -22]]) {
          const q0 = tf([x0, y0]), q1 = tf([x1, y1]); c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); c.stroke();
        }
      }
    });
    line(c, outer, L, lw);
  };
  drawEar(EAR_FAR, true);
  drawEar(EAR_NEAR, false);

  const hiss = clamp(p.hiss ? 1 : m.hiss ?? 0), mo = clamp(pick('mouth') ?? 0), d = mo * (9 + hiss * 4);
  const ck = 1 + puff * 0.6 + scruff * 0.45 + wet * 0.35;
  const H = blob([[-20, 10], [-24.5, -2], [-19, -16], [-6, -24], [9, -22.5], [20, -15], [25.5, -7.5], [30, -1], [33, 4.5], [32.4, 9.8],
    [29, 13.4 + d * 0.15], [25, 16.5 + d], [17, 20.5 + d * 0.95], [7, 21.5 + d * 0.55], [0, 22 + d * 0.2],
    [-5.5, 23.5 + 2.4 * ck, 1], [-9, 21], [-14, 24 + 2.6 * ck, 1], [-16.5, 18.5], [-21.5, 19 + 2.2 * ck, 1], [-20.5, 14]]);
  fill(c, H, lin(c, 0, -25, 0, 24, [[0, mix(coat, light, 0.6)], [0.5, coat], [1, mix(coat, dark, 0.5)]]));
  clipped(c, H, () => {
    if (V.bib) { // tuxedo: white muzzle with a blaze up the nose bridge
      fill(c, blob([[6, 6], [9, -3], [8.5, -12, 1], [12.5, -3], [21, 1], [29, -2], [34, 4], [33, 11], [27, 16 + d], [18, 23 + d], [5, 23], [1, 14]]), cream);
    } else {
      c.globalAlpha = 0.95;
      fill(c, blob([[13, 5], [22, 1.5], [30, 2.5], [34, 9], [29, 14 + d * 0.2], [24, 18.5 + d], [15, 22 + d], [6, 21 + d * 0.5], [6.5, 12]]), cream);
      c.globalAlpha = 1;
      c.fillStyle = rad(c, 6, 10, 15, [[0, alpha(cream, 0.55)], [1, alpha(cream, 0)]]); c.fillRect(-9, -5, 30, 30);
    }
    if (stripe) { // tabby "M" on the brow and cheek stripes
      c.strokeStyle = alpha(stripe, 0.85); c.lineWidth = 2.6;
      for (const [x0, y0, cx, cy, x1, y1] of [[3.5, -23, 5.5, -18, 5.5, -14], [-4.5, -22.5, -2.5, -18.5, -1.5, -15], [12, -21.5, 12.5, -17, 12.5, -13.5],
        [-12, -19, -9, -16, -6.5, -15.5], [-12.5, 1.5, -17, -0.5, -23, -1], [-11.5, 7, -16, 6.5, -21, 8]]) {
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); c.stroke();
      }
    }
    c.fillStyle = lin(c, 0, 5, 0, 27, [[0, alpha(dark, 0)], [1, alpha(mix(dark, L, 0.3), 0.42)]]);
    c.fillRect(-30, 5, 70, 30);
    c.save(); c.translate(1 * flip, 2.2); c.globalAlpha = 0.3; line(c, H, light, lw * 2.2); c.restore();
  });
  line(c, H, L, lw);

  // mouth: open (meow / hiss) or the closed cat smile
  const nX = 30.6, nY = 5.6;
  if (mo > 0.04) {
    const cx = lerp(17, 13.5, hiss), up = hiss * 1.6;
    const mouthP = blob([[31.6, 9.4 - up * 0.4], [24, 11.2 - up], [cx, 13.2], [cx + 4, 14.6 + d * 0.5], [25, 15.6 + d * 0.95], [30.6, 12.6 + d * 0.75]]);
    fill(c, mouthP, '#5e1c22');
    clipped(c, mouthP, () => fill(c, oval(25.5, 15 + d * 0.95, 7, 2.6 + d * 0.12), '#ef8b98'));
    c.fillStyle = '#fffaf0';
    for (const [fx, fs] of [[28.6, 1], [21.4, 0.8]]) {
      const fy = lerp(10.8, 9.2, hiss) - (fx < 25 ? up * 0.5 : 0), fl2 = (2.4 + hiss * 1.8 + mo * 0.8) * fs;
      c.beginPath(); c.moveTo(fx - 1.3 * fs, fy); c.lineTo(fx, fy + fl2); c.lineTo(fx + 1.3 * fs, fy); c.closePath(); c.fill();
    }
    line(c, mouthP, L, lw * 0.85);
    if (hiss > 0.3) { // wrinkled nose
      c.strokeStyle = alpha(L, 0.6 * hiss); c.lineWidth = lw * 0.6;
      for (const [x0, y0] of [[22.5, -2], [24.6, -4.6]]) { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + 2.2, y0 - 1.6, x0 + 4.4, y0 - 0.4); c.stroke(); }
    }
  } else {
    c.strokeStyle = L; c.lineWidth = lw * 0.8;
    c.beginPath(); c.moveTo(nX, nY); c.lineTo(nX - 0.4, 9.2);
    c.quadraticCurveTo(28, 12.4, 23, 11.2); c.moveTo(nX - 0.4, 9.2); c.quadraticCurveTo(32, 11.6, 33.2, 9.8); c.stroke();
  }
  // nose
  const nose = blob([[26, 1], [32.4, 0], [33.6, 2.4], [nX, nY], [27.2, 3.6]]);
  fill(c, nose, V.nose); line(c, nose, L, lw * 0.7);
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(29.5, 1.5, 1.8, 0.8, -0.1, 0, TAU); c.fill();
  // whisker dots + whiskers
  c.fillStyle = alpha(inner, 0.45);
  for (const [x, y] of [[21.5, 8.2], [24.6, 9.3], [21.2, 11.4], [24.4, 12.4]]) { c.beginPath(); c.arc(x, y, 0.7, 0, TAU); c.fill(); }
  const wa = (pick('whisk') ?? 0) * 0.22 + noise1(t * 1.6, seed + 3) * 0.05;
  c.strokeStyle = V.whisk || alpha(L, 0.55); c.lineWidth = lw * 0.42;
  for (let i = 0; i < 3; i++) {
    const ox = 29.6, oy = 9.6 + i * 1.5, a = -0.24 + i * 0.22 - wa, ln = 25 - i * 2;
    c.beginPath(); c.moveTo(ox, oy); c.quadraticCurveTo(ox + Math.cos(a) * ln * 0.55, oy + Math.sin(a) * ln * 0.55 - 1.2, ox + Math.cos(a + 0.12) * ln, oy + Math.sin(a + 0.12) * ln); c.stroke();
    const ix = 20.5, iy = 10 + i * 1.6, b = PI - 0.18 + i * 0.25 + wa * 0.6, l2 = 15 - i;
    c.globalAlpha = 0.6; c.beginPath(); c.moveTo(ix, iy); c.quadraticCurveTo(ix + Math.cos(b) * l2 * 0.5, iy + Math.sin(b) * l2 * 0.5 - 1, ix + Math.cos(b - 0.1) * l2, iy + Math.sin(b - 0.1) * l2); c.stroke(); c.globalAlpha = 1;
  }
  // eyes
  const bl = p.blink ?? blink(t, seed + 1, 4.2);
  let lid = Math.max(pick('lid') ?? 0, bl);
  if (m.slow && p.lid === undefined) lid = Math.max(lid, slowBlink(t, seed));
  lid = clamp(lid);
  const es = clamp(p.eyeShine ?? 0), dil = clamp(lerp(p.pupil ?? m.pupil, 1, es * 0.8));
  const iris = es > 0 ? mix(V.iris, '#d6ff5e', es * 0.85) : V.iris, pupCol = es > 0 ? mix('#17110d', '#f3ffc6', es) : undefined;
  const look = p.look || [0.3, 0.05], ang = m.ang ?? 0, lidColor = mix(coat, light, 0.25), low = m.low ?? 0;
  const EF = [16.5, -5.5, 7.1], EN = [-0.5, -4.5, 8.4];
  eye(c, { x: EF[0], y: EF[1], r: EF[2], look, iris, slit: true, dilate: dil, lid, lidAng: -ang, lidColor, line: L, lw: lw * 0.85, low, irisR: 0.8, pupil: pupCol });
  eye(c, { x: EN[0], y: EN[1], r: EN[2], look, iris, slit: true, dilate: dil, lid, lidAng: ang, lidColor, line: L, lw: lw * 0.85, low, irisR: 0.8, pupil: pupCol });
  if (es > 0 && lid < 0.9) for (const [x, y, r] of [EF, EN]) glow(c, x, y, r * 3.2, '#c8ff5a', es * 0.75 * (1 - lid));
  c.restore();
  if (TL.front === 2) drawTail(true);
  c.restore();

  // anchors in caller coordinates
  const X = (q) => [(p.x ?? 0) + flip * K * q[0], (p.y ?? 0) + K * q[1]];
  const earTop = Math.min(H2B([-19, -44])[1], H2B([16, -42])[1]);
  return {
    eyes: [X(H2B(EN)), X(H2B(EF))], eyeR: EN[2] * K, nose: X(H2B([33, 3])), head: X(hc), top: (p.y ?? 0) + K * earTop,
    tail: X(cen[segs]), paws: { nf: X([nf.pc[0], nf.e[1]]), ff: X([ff.pc[0], ff.e[1]]), nh: X([nh.pc[0], nh.e[1]]), fh: X([fh.pc[0], fh.e[1]]) },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// House mouse (design units at 4x: 32 units tall → 8 at s 1).
export const MOUSE = { coat: '#8f7e6f', dark: '#65564a', light: '#b8a796', belly: '#e2d6c6', line: '#3a2c24', ear: '#eaa8a5',
  tail: '#d3a99f', feet: '#ecb4ac', nose: '#ef8e9a' };
const MU = 0.25, MSTRIDE = 44;
export function mouseStride(s = 1) { return MSTRIDE * MU * s; }

export function drawMouse(c, p = {}) {
  const M = MOUSE, s = p.s ?? 1, flip = p.flip ?? 1, t = p.t ?? 0, seed = p.seed ?? 0, K = s * MU;
  const pose = p.pose ?? (p.run ? 'run' : 'stand'), ph = p.phase ?? 0, run = pose === 'run' ? 1 : 0, sniff = pose === 'sniff' ? 1 : 0;
  const lw = (0.95 * Math.sqrt(Math.max(s, 0.3))) / K, L = M.line;
  const breath = Math.sin(t * 9 + seed) * 0.5;
  const cyc = TAU * ph, ext = run ? Math.sin(cyc) : 0; // bound: +1 stretched, -1 gathered
  const hop = run ? Math.max(0, Math.sin(cyc + 0.5)) * 5 : 0;
  const rear = sniff ? 0.42 + Math.sin(t * 1.3 + seed) * 0.04 : 0, pitch = -rear + (run ? -ext * 0.08 : 0);
  const sx = 1 + ext * 0.12, sy = 1 - ext * 0.08 - run * 0.08;
  const twitch = Math.sin(t * (sniff ? 31 : 17) + seed) * (sniff ? 1 : 0.4) * (Math.sin(t * 2.1 + seed) > -0.2 ? 1 : 0);
  // body points relative to the hind-foot pivot (-12, 0); rearing rotates about it
  const pv = [-12, 0], ca = Math.cos(pitch), sa = Math.sin(pitch);
  const B = (x, y) => { const X = (x - pv[0]) * sx, Y = y * sy - hop; return [pv[0] + X * ca - Y * sa, pv[1] + X * sa + Y * ca]; };
  const body = blob([B(-24, -12), B(-17, -25 - breath * 0.4), B(-3, -31 - breath * 0.6), B(9, -28), B(17, -24), B(25.5, -17.5), B(33 + twitch * 0.4, -12),
    B(31, -9), B(25, -6.5), B(15, -5.5), B(5, -3.5), B(-8, -3), B(-20, -5)]);
  const nose = B(33.2 + twitch * 0.4, -12), eyeP = B(20, -20), earN = B(11, -30), earF = B(18, -32);
  // feet
  const fF = run ? [16 + ext * 9, -Math.max(0, -Math.sin(cyc)) * 4] : sniff ? null : [15, 0];
  const fH = run ? [-12 - ext * 7, -Math.max(0, Math.sin(cyc)) * 3] : [-12, 0];
  // tail
  const tb = B(-23, -9), tp = [tb];
  let ta = PI + 0.25 - pitch * 0.5 - run * 0.15, tx = tb[0], ty = tb[1];
  for (let i = 0; i < 10; i++) {
    ta += Math.sin(t * 2.2 + seed - i * 0.6) * 0.07 * (1 - run * 0.6) - 0.025;
    tx += Math.cos(ta) * 4.8; ty = Math.min(ty + Math.sin(ta) * 4.8, -1.2); tp.push([tx, ty]);
  }

  c.save();
  c.translate(p.x ?? 0, p.y ?? 0); c.scale(K * flip, K);
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (p.shadow !== false) shadow(c, 2, 0.5, 30, 4.5, (typeof p.shadow === 'number' ? p.shadow : 0.28) / (1 + hop * 0.05));
  // tail (tapered strokes)
  for (let i = 0; i < tp.length - 1; i++) {
    const w = lerp(3.4, 0.9, i / (tp.length - 1));
    c.strokeStyle = L; c.lineWidth = w + lw * 1.6; c.beginPath(); c.moveTo(tp[i][0], tp[i][1]); c.lineTo(tp[i + 1][0], tp[i + 1][1]); c.stroke();
  }
  for (let i = 0; i < tp.length - 1; i++) {
    const w = lerp(3.4, 0.9, i / (tp.length - 1));
    c.strokeStyle = M.tail; c.lineWidth = w; c.beginPath(); c.moveTo(tp[i][0], tp[i][1]); c.lineTo(tp[i + 1][0], tp[i + 1][1]); c.stroke();
  }
  // far ear, feet
  const ef = oval(earF[0], earF[1], 6.2, 7.2, -0.25 + pitch);
  fill(c, ef, mix(M.coat, M.dark, 0.3)); line(c, ef, L, lw);
  const foot = (q, rx) => { const f = oval(q[0], q[1] - 1.6, rx, 2.2, 0); fill(c, f, M.feet); line(c, f, L, lw * 0.8); };
  foot([fH[0] + 4, fH[1]], 6.5);
  if (fF) foot(fF, 4.2);
  // body
  fill(c, body, lin(c, 0, -32, 0, 0, [[0, M.light], [0.45, M.coat], [1, M.dark]]));
  clipped(c, body, () => {
    const q = B(10, -4);
    c.fillStyle = rad(c, q[0], q[1], 18, [[0, alpha(M.belly, 0.95)], [1, alpha(M.belly, 0)]]); c.fillRect(q[0] - 20, q[1] - 20, 40, 40);
    const h = B(-12, -16);
    c.strokeStyle = alpha(L, 0.22); c.lineWidth = lw * 0.8; c.beginPath(); c.ellipse(h[0], h[1], 10, 11, pitch, -1.4, 0.8); c.stroke();
    c.save(); c.translate(0.8 * flip, 1.8); c.globalAlpha = 0.35; line(c, body, M.light, lw * 2.2); c.restore();
  });
  line(c, body, L, lw);
  if (sniff) { // front paws held up under the chin
    for (const dx of [0, 2.6]) { const q = B(22 + dx, -7); const f = oval(q[0], q[1], 2.6, 1.8, 0.6); fill(c, f, M.feet); line(c, f, L, lw * 0.7); }
  }
  // near ear
  const en = oval(earN[0], earN[1], 7.6, 8.6, -0.3 + pitch - run * 0.35);
  fill(c, en, lin(c, 0, earN[1] - 9, 0, earN[1] + 9, [[0, M.light], [1, M.coat]]));
  clipped(c, en, () => fill(c, oval(earN[0] + 1, earN[1] + 0.8, 5, 6, -0.3 + pitch), M.ear));
  line(c, en, L, lw);
  // nose, whiskers, eye
  fill(c, oval(nose[0] - 0.4, nose[1] - 0.2, 2.1, 1.8, 0), M.nose);
  c.strokeStyle = alpha(L, 0.5); c.lineWidth = lw * 0.45;
  for (let i = 0; i < 3; i++) {
    const a = -0.3 + i * 0.3 + twitch * 0.08 + pitch, ox = nose[0] - 3.5, oy = nose[1] + 1;
    c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + Math.cos(a) * 13, oy + Math.sin(a) * 13); c.stroke();
  }
  eye(c, { x: eyeP[0], y: eyeP[1], r: 3.4, look: p.look || [0.5, 0], white: '#2b1d17', pupil: '#0f0a08', irisR: 0.92, lid: blink(t, seed + 3, 2.8), lidColor: M.coat, line: L, lw: lw * 0.7 });
  c.restore();
  const X = (q) => [(p.x ?? 0) + flip * K * q[0], (p.y ?? 0) + K * q[1]];
  return { nose: X(nose), eye: X(eyeP) };
}
