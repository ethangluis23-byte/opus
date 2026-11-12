// Humans: simple stylised people (side-view body, three-quarter head) in the film's flat-vector outline style.
// They are secondary characters: the city crowd that vanishes at 24 s in scene 1, the family in the memory flash
// and the photo, and two close-up feeding hands. Rounded shapes, dot eyes, simple hair; same gradient / rim light /
// dark-tint outline / contact shadow recipe as drawDog.
//
// drawHuman(c, {
//   x, y, s, flip     ground point between the feet ('sit': under the seat contact; 'kneel': under the hip;
//                     'cycle': under the bike's crank), scale, facing (1 = right, -1 = left).
//                     Heights at s 1: adults ≈ 300-340 units (man 335), boy 230, girl 200 (dog: 150 to the head).
//   t, seed           seconds (breathing, sway, blinks, hair bounce, wave) and per-person seed. For the extras
//                     ('man' 'woman' 'jogger' 'elder') seed also picks skin, hair, hair style and clothes colours
//                     (seed 0 = the preset's default look). Family members never change colour.
//   who               key of PEOPLE (default 'man') or a custom person object, e.g. {...PEOPLE.woman, top: {...}}.
//   pose              'stand' | 'walk' | 'run' | 'throw' | 'wave' | 'sit' | 'reach' | 'leash' | 'kneel' | 'cycle' | 'hold'
//   phase             walk / run cycle (cycles; one cycle = two steps). Advance by distance / humanStride(who, s, gait).
//                     'cycle': crank revolutions (use drawBike, which advances by distance / bikeStride()).
//   k                 0..1 pose progress: throw 0 ready (ball at chest) → 0.38 wind-up → 0.6 RELEASE (ball leaves the
//                     hand; draw it yourself from then on, starting at the returned `hand`) → 1 follow-through;
//                     reach: arm extension (default 1); kneel: 0 arms open → 1 hugging; hold: 0 cup at chest → 1 sip.
//   arm               near-arm action that overrides the pose's near arm, so it combines with any body pose:
//                     'wave' | 'reach' | 'leash' | 'hold' | 'pet' | 'down'. ({pose:'sit', arm:'wave'} = mom on the
//                     bench; {pose:'walk', arm:'leash'} = dog walker; {pose:'sit', arm:'hold'} = café customer.)
//                     The poses 'wave' 'reach' 'leash' 'hold' are 'stand' + that arm.
//   ball              true: a tennis ball in the near hand (throw: only while k < 0.6)
//   cup               true: a takeaway cup in the near hand (default on for arm 'hold'; false to hide)
//   look              [dx, dy] -1..1: eyes / head turn (dy < 0 looks up)
//   mood              'neutral' | 'happy' (open smile) | 'calm' (closed smiling eyes) | 'surprised' | 'sad'
//   vanish            0..1: dissolves from the feet up (the remaining body brightens toward warm light, the edge
//                     crumbles into flecks); nothing is drawn at 1. Pair with drawVanishFx after g.grade().
//   behind(c, A)      callback drawn after the far arm + far leg, before torso / near leg (caller coordinates; A = the
//                     anchors below). drawBike uses it so the frame sits between the rider's legs.
//   mid(c, A)         callback drawn after the body + head, before the near arm: a dog being hugged, a leash
//                     (drawLeash from A.hand, so the fist closes over it), a cup on a café table...
//                     While vanishing (0 < vanish < 1) both callbacks are drawn un-dissolved: behind() first, mid() last.
//   shadow            contact shadow strength (default 0.3, 0 = none; 'sit' shadows only the feet)
// }) → anchors in the caller's coordinates (also returned when vanish ≥ 1, so a leash can start falling from there):
//   { hand: [x,y]   near hand (fist / grip centre: leash handle, ball, cup)
//     hand2: [x,y]  far hand
//     head: [x,y]   head centre      top: [x,y]  top of the head      hip: [x,y]  hip joint
//     chest: [x,y]  front of the chest (hug contact)      seat: [x,y]  seat contact point (sit / cycle) }
//
// PEOPLE            presets: boy (~9, brown hair, red hoodie, jeans, sneakers), girl (~7, pigtails, yellow dress),
//                   mom (dark bun, teal top, grey trousers), dad (navy shirt, chinos), grandma (grey bun, lilac
//                   cardigan, glasses, plum skirt), man, woman, jogger (headband, tee, shorts), elder (flat cap,
//                   glasses). Fields: h, build ('adult'|'boy'|'girl'), fem, stoop, skin, hair, style ('short' 'curly'
//                   'bun' 'bob' 'pony' 'pigtails' 'long' 'bald'), hat ('flatcap' 'cap' 'band' null), glasses, top
//                   {kind: 'hoodie'|'tee'|'sweater'|'shirt'|'blouse'|'cardigan'|'jacket'|'dress', color, sleeve:
//                   'long'|'short', under}, bottom {kind: 'trousers'|'shorts'|'skirt'|'dress', color, len},
//                   legs (skin / tights), socks, shoes {color, sole}.
// humanStride(who, s = 1, gait = 'walk' | 'run')   world distance per walk/run cycle (phase += distance / stride).
// seatHeight(who, s = 1)                          seat surface height above the ground for 'sit' (0.27 × height).
// humanHeight(who, s = 1)                         standing height to the top of the hair.
//
// drawVanishFx(c, {x, y, s, k, t, h, who, seed}) the emissive part of a vanish (call after g.grade(), same x/y/s and
//   k = vanish as the drawHuman call): warm-white glow column over the remaining body, a bright band at the
//   dissolve line, rising twinkling sparkles. h = figure height in units (default from who, else 330). Nothing at
//   k ≤ 0 or k ≥ 1.
// drawLeash(c, x0, y0, x1, y1, {s, slack, color, fall, groundY, t, w}) a sagging leash from the walker's hand
//   (x0, y0) to the collar (x1, y1). slack 0 taut .. 1 loose (default 0.35); fall 0..1 = the handle drops to the
//   ground (gravity ease + small bounce) and the rope settles on it; groundY = the ground under the handle (default
//   y1 + 115·s: the golden's collar height); color default red '#c23b2e'; w core width (default 3.2·s).
//   Returns {handle: [x, y]}.
// drawBike(c, {x, y, s, flip, phase, t, seed, who, color, rider, vanish, look, mood}) bicycle with rolling wheels +
//   rider (pose 'cycle', who default 'man'; rider: false = parked bike). (x, y) = ground point under the crank.
//   phase = pedal revolutions = distance / bikeStride(s, who). The bike scales with the rider (kids ride small
//   bikes). Returns the rider anchors plus {saddle, front: [x,y] front-wheel hub, back: rear hub}.
// bikeStride(s = 1, who = 'man')  distance per pedal revolution.
// drawHand(c, {x, y, s, rot, flip, open, skin, sleeve, cuff, holding, bite, age, ring, len, t}) close-up hand +
//   sleeved forearm entering from off-frame. (x, y) = the palm centre; rot = direction the fingers point (0 =
//   right, the arm comes from the left; -PI/2 = up, from below); flip -1 mirrors across the arm (thumb on the other
//   side). s 1 ≈ 200 units from wrist to fingertips. open 0 fist .. 1 flat open hand (default 0.75); holding
//   'seed' (pinched between thumb and index) | 'carrot' (in the fist, pointing forward) | null; bite 0..1 nibbles the
//   carrot tip away; skin; sleeve colour or null (bare forearm); cuff colour; age 0..1 (knuckle creases, paler);
//   ring true = gold ring; len forearm length (default 1100). Returns {item: [x,y] seed / carrot tip, palm: [x,y]}.
//   Grandma: {skin: PEOPLE.grandma.skin, sleeve: PEOPLE.grandma.top.color, age: 1, ring: true, holding: 'seed'}.
//   Girl:    {skin: PEOPLE.girl.skin, sleeve: null, holding: 'carrot', open: 0}.
// drawCup(c, {x, y, s, rot, color}) takeaway cup (the one café customers hold; use it for the falling cup).
//   (x, y) = cup centre, 30 units tall at s 1.
import { createCanvas } from '@napi-rs/canvas';
import { P as newPath, blob, capsule, circle, oval, union, fill, line, clipped, lin, rad, shadow, ik2, rrect, poly } from '../engine/draw.js';
import { TAU, clamp, lerp, mix, tone, alpha, hash, noise1, RNG, ease, K, ss, wrap } from '../engine/util.js';
import { blink, inkW } from './rig.js';

// ---------------------------------------------------------------------------------------------------------------
// Proportions (fractions of the figure height h). Heads are enlarged for appeal, kids more so.
const BUILDS = {
  adult: { thigh: 0.222, shin: 0.226, ah: 0.03, torso: 0.27, neck: 0.04, head: 0.09, chest: 0.084, waist: 0.07, hips: 0.078,
    upper: 0.165, fore: 0.15, hand: 0.03, foot: 0.106, thighR: 0.046, kneeR: 0.032, ankleR: 0.022, upperR: 0.029, elbowR: 0.024, wristR: 0.019, neckR: 0.031 },
  boy: { thigh: 0.2, shin: 0.2, ah: 0.03, torso: 0.27, neck: 0.03, head: 0.116, chest: 0.092, waist: 0.087, hips: 0.088,
    upper: 0.158, fore: 0.142, hand: 0.036, foot: 0.118, thighR: 0.052, kneeR: 0.037, ankleR: 0.026, upperR: 0.034, elbowR: 0.028, wristR: 0.023, neckR: 0.036 },
  girl: { thigh: 0.19, shin: 0.19, ah: 0.03, torso: 0.265, neck: 0.028, head: 0.125, chest: 0.093, waist: 0.088, hips: 0.09,
    upper: 0.152, fore: 0.138, hand: 0.038, foot: 0.118, thighR: 0.054, kneeR: 0.038, ankleR: 0.027, upperR: 0.035, elbowR: 0.029, wristR: 0.024, neckR: 0.037 },
};

export const PEOPLE = {
  boy: { h: 230, build: 'boy', skin: '#f0c29e', hair: '#6b4024', style: 'short',
    top: { kind: 'hoodie', color: '#d8443a' }, bottom: { kind: 'trousers', color: '#41679f' }, shoes: { color: '#f1eee6', sole: '#d8443a' } },
  girl: { h: 200, build: 'girl', skin: '#f3c9a7', hair: '#8e552c', style: 'pigtails', ties: '#e5534b',
    top: { kind: 'dress', color: '#f5c53a', sleeve: 'short' }, bottom: { kind: 'dress', color: '#f5c53a', len: 0.47 },
    socks: '#fbf7ee', shoes: { color: '#d2463b' } },
  mom: { h: 318, build: 'adult', fem: 1, skin: '#e9b892', hair: '#36231e', style: 'bun',
    top: { kind: 'blouse', color: '#1e8a8b' }, bottom: { kind: 'trousers', color: '#7f838c' }, shoes: { color: '#4d3a34' } },
  dad: { h: 338, build: 'adult', skin: '#e2a982', hair: '#4a3023', style: 'short',
    top: { kind: 'shirt', color: '#3e5f93' }, bottom: { kind: 'trousers', color: '#b39b70' }, shoes: { color: '#5a3d2b' } },
  grandma: { h: 300, build: 'adult', fem: 1, stoop: 0.07, skin: '#f1c8ab', hair: '#d3cfcb', style: 'bun', glasses: '#6c5867',
    top: { kind: 'cardigan', color: '#a98bc6', under: '#f4ecdc' }, bottom: { kind: 'skirt', color: '#6c5a74', len: 0.74 },
    legs: '#e8c3a9', shoes: { color: '#5b4640' } },
  man: { h: 335, build: 'adult', extra: 'man', skin: '#e0a985', hair: '#3b2a22', style: 'short',
    top: { kind: 'jacket', color: '#5b6f86', under: '#e9e4da' }, bottom: { kind: 'trousers', color: '#3a4558' }, shoes: { color: '#3a2c26' } },
  woman: { h: 315, build: 'adult', fem: 1, extra: 'woman', skin: '#edbd98', hair: '#7a4a2a', style: 'bob',
    top: { kind: 'sweater', color: '#d9785c' }, bottom: { kind: 'trousers', color: '#3f4f6b' }, shoes: { color: '#5a3d2b' } },
  jogger: { h: 328, build: 'adult', fem: 1, extra: 'jogger', skin: '#c98c66', hair: '#2b1d18', style: 'pony', hat: 'band', band: '#ffffff',
    top: { kind: 'tee', color: '#ff6b5a', stripe: '#ffffff' }, bottom: { kind: 'shorts', color: '#26303d' }, socks: '#ffffff',
    shoes: { color: '#4d8af0', sole: '#ffffff' } },
  elder: { h: 312, build: 'adult', stoop: 0.09, extra: 'elder', skin: '#eab796', hair: '#d6d2ce', style: 'bald', hat: 'flatcap', hatColor: '#7b6a55',
    glasses: '#5d5045', top: { kind: 'cardigan', color: '#8a7a52', under: '#ece4d2' }, bottom: { kind: 'trousers', color: '#5d5a55' }, shoes: { color: '#3d2f28' } },
};

// Seeded wardrobe for extras.
const SKINS = ['#f3cdb0', '#eab894', '#e0a985', '#c98c66', '#a86f4c', '#7f5038', '#5f3a29'];
const HAIRS = ['#2b1d18', '#3b2a22', '#5e3b24', '#7a4a2a', '#9b5a2c', '#c99a55', '#a8432a', '#1f1a1c'];
const GREYS = ['#d6d2ce', '#bcb6b1', '#e6e2dd', '#a9a39d'];
const TOPS = ['#c8423a', '#2f6f9f', '#3f8a5a', '#e0a33a', '#7a5aa8', '#d96a8a', '#2a9d8f', '#e76f51', '#5b6c7d', '#efe4cf', '#8a3b4a', '#4f7cc8'];
const BOTTOMS = ['#3f5f93', '#2f3a4f', '#6b6f78', '#a08a62', '#4a3a32', '#556b4a', '#2b2b33'];
const SHOES = ['#3a2c26', '#f0ece4', '#5a3d2b', '#2c3440', '#a8322c', '#7a6a5a'];
const SPORT = ['#ff6b5a', '#2ec4b6', '#a3d14b', '#ffb02e', '#4d8af0', '#e84a8a', '#9b6bf2'];
const _people = new Map();
function person(who, seed = 0) {
  if (who && typeof who === 'object') return finish(who);
  const base = PEOPLE[who || 'man'] || PEOPLE.man;
  const sd = base.extra ? Math.round(seed * 1000) / 1000 : 0, key = (who || 'man') + ':' + sd;
  let P = _people.get(key);
  if (P) return P;
  P = { ...base };
  if (base.extra && sd) {
    const r = RNG(Math.floor(sd * 7919) + 17 + base.h);
    P.skin = r.pick(SKINS);
    if (base.extra === 'man') {
      P.hair = r.pick(HAIRS); P.style = r.pick(['short', 'short', 'curly', 'bald', 'short']);
      if (P.style === 'bald') P.hair = r.pick(HAIRS.slice(0, 4));
      P.h = Math.round(r.range(318, 345));
      P.top = { kind: r.pick(['jacket', 'sweater', 'shirt', 'tee', 'hoodie']), color: r.pick(TOPS), under: '#ece6da' };
      P.bottom = { kind: 'trousers', color: r.pick(BOTTOMS) };
      P.shoes = { color: r.pick(SHOES) };
      P.hat = r.chance(0.15) ? 'cap' : null; P.hatColor = r.pick(TOPS); P.glasses = r.chance(0.25) ? '#2e2a2a' : null;
    } else if (base.extra === 'woman') {
      P.hair = r.pick(HAIRS); P.style = r.pick(['bob', 'pony', 'long', 'bun', 'curly']);
      P.h = Math.round(r.range(300, 325));
      const dress = r.chance(0.2);
      P.top = { kind: dress ? 'dress' : r.pick(['blouse', 'sweater', 'cardigan', 'jacket', 'tee']), color: r.pick(TOPS), under: '#f2ece0' };
      P.bottom = dress ? { kind: 'dress', color: P.top.color, len: 0.5 } : r.chance(0.35)
        ? { kind: 'skirt', color: r.pick(BOTTOMS), len: r.range(0.45, 0.7) } : { kind: 'trousers', color: r.pick(BOTTOMS) };
      P.legs = P.skin; P.shoes = { color: r.pick(SHOES) }; P.glasses = r.chance(0.2) ? '#3a2b30' : null;
    } else if (base.extra === 'jogger') {
      P.fem = r.chance(0.5) ? 1 : 0; P.hair = r.pick(HAIRS); P.style = P.fem ? 'pony' : r.pick(['short', 'curly']);
      P.h = Math.round(r.range(315, 340));
      P.top = { kind: 'tee', color: r.pick(SPORT), stripe: '#ffffff' }; P.bottom = { kind: 'shorts', color: r.pick(['#26303d', '#3b4a6b', '#1f2a2e', '#4a4f57']) };
      P.shoes = { color: r.pick(SPORT), sole: '#ffffff' }; P.band = r.pick(['#ffffff', P.top.color, '#26303d']);
    } else if (base.extra === 'elder') {
      P.fem = r.chance(0.4) ? 1 : 0; P.hair = r.pick(GREYS); P.h = Math.round(r.range(300, 320));
      P.style = P.fem ? r.pick(['bun', 'bob', 'curly']) : r.pick(['bald', 'short']);
      P.hat = P.fem ? null : r.pick(['flatcap', null]); P.hatColor = r.pick(['#7b6a55', '#5b5f66', '#6d5a4a']);
      P.top = { kind: r.pick(['cardigan', 'jacket', 'sweater']), color: r.pick(['#8a7a52', '#6b7a8a', '#9a6a5a', '#7a8a6a', '#b08aa0']), under: '#ece4d2' };
      P.bottom = P.fem && r.chance(0.5) ? { kind: 'skirt', color: r.pick(BOTTOMS), len: 0.72 } : { kind: 'trousers', color: r.pick(['#5d5a55', '#6b6252', '#3f4552']) };
      P.legs = P.skin; P.shoes = { color: r.pick(['#3d2f28', '#5a4a40', '#2c2c30']) }; P.glasses = r.chance(0.6) ? '#5d5045' : null;
    }
  }
  P = finish(P);
  _people.set(key, P);
  return P;
}
function finish(P) {
  if (P._ok) return P;
  const B = BUILDS[P.build || 'adult'];
  const f = P.fem ? 1 : 0;
  return { ...P, _ok: 1, B: { ...B, chest: B.chest * (1 - f * 0.05), waist: B.waist * (1 - f * 0.1), hips: B.hips * (1 + f * 0.07), upperR: B.upperR * (1 - f * 0.1) },
    top: { sleeve: 'long', ...(P.top || { kind: 'tee', color: '#5b6c7d' }) }, bottom: P.bottom || { kind: 'trousers', color: '#3a4558' }, shoes: P.shoes || { color: '#3a2c26' } };
}
const resolveH = (who, seed) => person(who, seed).h;
export const humanHeight = (who = 'man', s = 1) => resolveH(who) * s;
export const seatHeight = (who = 'man', s = 1) => 0.27 * resolveH(who) * s;

const GAIT = { walk: { duty: 0.57, D: 1.4, lift: 0.1, base: 0.955 }, run: { duty: 0.36, D: 2.4, lift: 0.26, base: 0.93 } };
export function humanStride(who = 'man', s = 1, gait = 'walk') {
  const P = person(who), B = P.B;
  return (GAIT[gait] || GAIT.walk).D * (B.thigh + B.shin) * P.h * s;
}

// ---------------------------------------------------------------------------------------------------------------
// Colour helpers: every material gets a cached shading ramp and a dark outline tint of its own hue.
const _sh = new Map();
function shade(col) {
  let v = _sh.get(col);
  if (!v) {
    const ink = mix(col, '#1c1118', 0.7);
    v = { c: col, hi: tone(col, 0.17), lo: mix(col, ink, 0.3), ink, far: mix(col, ink, 0.24), farLo: mix(col, ink, 0.42), rim: tone(col, 0.5) };
    _sh.set(col, v);
  }
  return v;
}
// Diagonal ramp: lit upper-left on screen (fl = flip keeps the light on the screen's left when mirrored).
const ramp = (c, M, x, y0, y1, fl, far) => lin(c, x - 0.3 * (y1 - y0) * fl, y0, x + 0.3 * (y1 - y0) * fl, y1,
  far ? [[0, M.far], [1, M.farLo]] : [[0, M.hi], [0.48, M.c], [1, M.lo]]);
function rimAndForm(c, path, M, lw, fl, y0, y1, a = 0.36) {
  clipped(c, path, () => {
    c.fillStyle = lin(c, 0, lerp(y0, y1, 0.55), 0, y1, [[0, alpha(M.lo, 0)], [1, alpha(M.ink, 0.28)]]);
    c.fill(path);
    c.save(); c.translate(1.3 * fl, 2.6); c.globalAlpha *= a; line(c, path, M.rim, lw * 2.3); c.restore();
  });
}

const rot2 = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const dirA = (a) => [Math.sin(a), Math.cos(a)]; // limb angle measured from straight down, + = forward
const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

// ---------------------------------------------------------------------------------------------------------------
// Pose solver → skeleton in character units (facing +x, ground y = 0).
const THROW = [ // [hipDx, lean, nA1, nA2, fA1, fA2, nFx, nFlift, nFang, fFx, fFlift, fFang]  (positions in h)
  [0, [0, 0.03, 0.3, 1.5, -0.05, 0.3, -0.035, 0, 0, 0.07, 0, 0]],
  [0.38, [-0.04, -0.15, -2.2, -2.7, 1.7, 1.85, -0.05, 0, 0, 0.14, 0.04, -0.25]],
  [0.6, [0.03, 0.16, -3.75, -4.1, -0.35, 0.05, -0.09, 0, 0.45, 0.15, 0, 0], 'in'],
  [1, [0.05, 0.3, -5.55, -5.2, -0.75, -0.4, -0.15, 0.05, 1.0, 0.15, 0, 0], 'out'],
];

function armFK(sh, a1, a2, upper, fore) {
  const el = add(sh, dirA(a1), upper), hd = add(el, dirA(a2), fore);
  return { sh, el, hd };
}
function armIK(sh, tgt, upper, fore, bend = 1) {
  const r = ik2(sh[0], sh[1], tgt[0], tgt[1], upper, fore, bend);
  return { sh, el: [r.jx, r.jy], hd: [r.ex, r.ey] };
}

export function bikeGeom(k = 1, phase = 0) {
  const ca = TAU * phase, cr = 25 * k, bb = [0, -48 * k];
  return {
    k, bb, wr: 60 * k, back: [-100 * k, -60 * k], front: [102 * k, -60 * k], saddle: [-34 * k, -150 * k],
    grip: [74 * k, -190 * k], seatTop: [-28 * k, -138 * k], head: [80 * k, -150 * k], headLo: [85 * k, -126 * k],
    pedN: [bb[0] + Math.cos(ca) * cr, bb[1] + Math.sin(ca) * cr], pedF: [bb[0] - Math.cos(ca) * cr, bb[1] - Math.sin(ca) * cr], ca, cr,
  };
}

function solve(P, p) {
  const h = P.h, B = P.B, t = p.t ?? 0, seed = p.seed ?? 0;
  const thigh = B.thigh * h, shin = B.shin * h, ah = B.ah * h, L = thigh + shin, T = B.torso * h;
  const upper = B.upper * h, fore = B.fore * h, foot = B.foot * h;
  const pose = p.pose || 'stand', k = clamp(p.k ?? (pose === 'reach' ? 1 : 0));
  const breath = Math.sin(t * 1.55 + seed * 1.7) * 0.5 + 0.5, sway = Math.sin(t * 0.55 + seed * 2.3);
  const S = { h, B, L, T, thigh, shin, ah, foot, upper, fore, breath, pose, k, mood: p.mood, ground: 1, hair: Math.sin(t * 1.1 + seed) * 0.04 };
  let hipDx = 0, lean = 0.012 * sway + (P.stoop ?? 0), tilt = 0;
  let nF = [0.022 * h, 0, 0], fF = [-0.028 * h, 0, 0]; // [x, lift, toe-down angle]
  let nK = null, fK = null, hipY = null, armN = null, armF = null;
  let nOpen = 0.35, fOpen = 0.35, nFist = 0;
  const swingFK = (a1, a2) => ({ a: [a1, a2] });

  if (pose === 'walk' || pose === 'run') {
    const G = GAIT[pose], D = G.D * L, St = D * G.duty, ph = p.phase ?? 0, run = pose === 'run';
    const ft = (q) => {
      const u = wrap(q);
      if (u < G.duty) {
        const w = u / G.duty;
        const ang = run ? lerp(-0.1, 0.5, ss(0.55, 1, w)) : lerp(-0.22, 0, ss(0, 0.16, w)) + 0.55 * ss(0.72, 1, w);
        return [lerp(St / 2, -St / 2, w), Math.max(0, Math.sin(ang)) * foot * 0.62, ang, 0];
      }
      const w = (u - G.duty) / (1 - G.duty);
      const x = run ? lerp(-St / 2, St / 2, ease.io(clamp(w * 1.15 - 0.1))) : lerp(-St / 2, St / 2, ease.io(w));
      const lift = G.lift * L * Math.sin(Math.PI * Math.pow(w, run ? 0.7 : 0.9));
      return [x, lift, run ? lerp(0.9, -0.15, w) : lerp(0.6, -0.22, ease.io(w)), 1];
    };
    const a = ft(ph), b = ft(ph + 0.5);
    nF = [a[0], a[1], a[2]]; fF = [b[0], b[1], b[2]];
    let base = ah + L * G.base;
    if (run) base = ah + L * (G.base + 0.035 * Math.cos(TAU * 2 * (ph - G.duty / 2) + Math.PI));
    hipY = base;
    for (const f of [a, b]) if (!f[3]) hipY = Math.min(hipY, f[1] + ah + Math.sqrt(Math.max(0, (0.993 * L) ** 2 - f[0] * f[0])));
    hipY = -hipY;
    lean += run ? 0.16 : 0.035;
    tilt = run ? -0.12 : -0.02;
    const c2 = Math.cos(TAU * ph);
    if (run) {
      const an = -0.7 * c2 + 0.1, af = 0.7 * c2 + 0.1;
      armN = swingFK(an, an + 1.3 + 0.15 * Math.max(0, c2)); armF = swingFK(af, af + 1.3 + 0.15 * Math.max(0, -c2));
      nFist = 1; nOpen = 0; fOpen = 0;
    } else {
      const an = -0.36 * c2, af = 0.36 * c2;
      armN = swingFK(an, an + 0.2 + 0.32 * Math.max(0, an / 0.36)); armF = swingFK(af, af + 0.2 + 0.32 * Math.max(0, af / 0.36));
    }
    S.hair = Math.sin(TAU * 2 * ph) * (run ? 0.22 : 0.08);
    S.bounce = run ? 1 : 0.4;
  } else if (pose === 'throw') {
    const v = K(k, THROW);
    hipDx = v[0] * h; lean += v[1];
    armN = swingFK(v[2], v[3]); armF = swingFK(v[4], v[5]);
    nF = [v[6] * h, v[7] * h, v[8]]; fF = [v[9] * h, v[10] * h, v[11]];
    nFist = k < 0.6 ? 1 : 0; nOpen = k < 0.6 ? 0 : 0.8; fOpen = 0.8;
    tilt = -v[1] * 0.5 - 0.04;
    S.mood = p.mood ?? 'happy';
    S.hair = v[1] * 0.4;
  } else if (pose === 'sit') {
    const seatH = 0.27 * h, tr = B.thighR * h;
    hipY = -(seatH + tr * 0.82); lean += -0.05;
    nF = [thigh * 1.0 + 0.035 * h, 0, 0]; fF = [thigh * 0.92 + 0.012 * h, 0, 0];
    S.sit = seatH; S.ground = 0;
    armN = { lap: 0.62 }; armF = { lap: 0.5 };
  } else if (pose === 'kneel') {
    const kr = B.kneeR * h;
    nK = [0.03 * h, -kr * 0.95];
    hipDx = nK[0] - 0.02 * h; hipY = nK[1] - thigh * 0.985;
    const ay = -B.foot * h * 0.8, dyk = ay - nK[1];
    nF = [nK[0] - Math.sqrt(Math.max(1, shin * shin - dyk * dyk)), ay, Math.PI / 2 - 0.08]; nF.abs = 1;
    fF = [hipDx + thigh * 0.98 + 0.035 * h, 0, 0];
    lean += 0.07 + 0.12 * k;
    tilt = -0.05 - 0.05 * k;
    armN = swingFK(lerp(1.2, 1.32, k), lerp(1.55, 0.55, k)); armF = swingFK(lerp(1.05, 1.25, k), lerp(1.45, 0.5, k));
    nOpen = 0.9; fOpen = 0.9;
  } else if (pose === 'cycle') {
    const G = p._bike || bikeGeom(h / 330, p.phase ?? 0);
    hipDx = G.saddle[0] + 2; hipY = G.saddle[1] - B.thighR * h * 0.55;
    lean += h < 260 ? 0.3 : 0.42;
    tilt = -0.32;
    const ankle = (ped, ang) => [ped[0] - Math.cos(ang) * foot * 0.28, ped[1] - ah * 0.9 - Math.sin(ang) * foot * 0.28];
    const an = 0.12 + 0.22 * Math.sin(G.ca), af = 0.12 - 0.22 * Math.sin(G.ca);
    nF = [...ankle(G.pedN, an), an]; nF.abs = 1;
    fF = [...ankle(G.pedF, af), af]; fF.abs = 1;
    armN = { tgt: G.grip }; armF = { tgt: [G.grip[0] - 4 * G.k, G.grip[1] + 2 * G.k] };
    nFist = 1; nOpen = 0; fOpen = 0;
    S.ground = 0; S.seatAt = G.saddle;
  }
  // ---- torso frame ----
  if (hipY === null) {
    // standing-type poses: hip as high as both planted feet allow
    let hy = ah + L * 0.975 + breath * 0.002 * h;
    for (const f of [nF, fF]) if (!f.abs && f[1] < 1) hy = Math.min(hy, ah + f[1] + Math.sqrt(Math.max(0, (0.993 * L) ** 2 - (f[0] - hipDx) ** 2)));
    hipY = -hy;
  }
  const hip = [hipDx, hipY];
  const up = [Math.sin(lean), -Math.cos(lean)], fw = [Math.cos(lean), Math.sin(lean)];
  const pt = (a, b) => [hip[0] + up[0] * a * T + fw[0] * b, hip[1] + up[1] * a * T + fw[1] * b];
  const chest = B.chest * h * (1 + breath * 0.015);
  const shN = pt(0.9 + breath * 0.008, 0.06 * chest), shF = pt(0.91 + breath * 0.008, -0.2 * chest);
  // ---- arm actions ----
  const act = p.arm || ({ wave: 'wave', reach: 'reach', leash: 'leash', hold: 'hold' })[pose] || null;
  const tw = Math.sin(t * 2.2 + seed);
  if (act === 'wave') { armN = swingFK(2.55 + 0.05 * tw, Math.PI - 0.12 + 0.36 * Math.sin(TAU * 1.6 * t + seed)); nOpen = 1; nFist = 0; S.wave = 1; S.mood = p.mood ?? 'happy'; }
  else if (act === 'reach') { const r = pose === 'reach' ? k : clamp(p.k ?? 1); armN = swingFK(lerp(0.12, 1.32, r), lerp(0.3, 1.5, r)); nOpen = lerp(0.4, 1, r); nFist = 0; S.palmUp = r; if (pose === 'reach') lean += 0.06 * r; }
  else if (act === 'leash') { armN = swingFK(0.6 + 0.03 * tw, 0.98 + 0.05 * Math.sin(t * 2.9 + seed)); nFist = 1; nOpen = 0; S.leash = 1; }
  else if (act === 'hold') { const q = pose === 'hold' ? k : clamp(p.k ?? 0); armN = swingFK(lerp(0.32, 0.95, q), lerp(2.25, 3.05, q)); nFist = 1; nOpen = 0; S.cup = p.cup ?? true; S.sip = q; }
  else if (act === 'pet') { const st = Math.sin(t * 2.4 + seed); armN = swingFK(1.0 + 0.1 * st, 0.75 + 0.12 * st); nOpen = 1; nFist = 0; }
  else if (act === 'down') { armN = swingFK(0.05, 0.18); }
  if (p.ball && !(pose === 'throw' && k >= 0.6)) { S.ball = 1; nFist = 1; nOpen = 0; }
  if (p.cup && !S.cup) S.cup = true;
  // ---- arms ----
  const lap = (q) => armIK(q === armN ? shN : shF, [hip[0] + thigh * q.lap, hip[1] - B.thighR * h * 1.35], upper, fore, 1);
  const mk = (q, sh, near) => {
    if (!q) return armFK(sh, near ? 0.05 + sway * 0.02 : -0.06 - sway * 0.02, near ? 0.2 : 0.12, upper, fore);
    if (q.lap) return lap(q);
    if (q.tgt) return armIK(sh, q.tgt, upper, fore, 1);
    return armFK(sh, q.a[0], q.a[1], upper, fore);
  };
  const an = mk(armN, shN, 1), af = mk(armF, shF, 0);
  an.open = nOpen; an.fist = nFist; af.open = fOpen; af.fist = 0;
  // ---- legs ----
  const hipN = add(hip, fw, 0.02 * h), hipF = add(hip, fw, -0.03 * h);
  const leg = (hp, f, kn, near) => {
    const ank = f.abs ? [f[0], f[1]] : [f[0] + (near ? 0 : 0), -ah - f[1]];
    let knee;
    if (kn) knee = kn;
    else { const r = ik2(hp[0], hp[1], ank[0], ank[1], thigh, shin, -1); knee = [r.jx, r.jy]; ank[0] = r.ex; ank[1] = r.ey; }
    return { hip: hp, knee, ank, ang: f[2] };
  };
  const ln = leg(hipN, nF, nK, 1), lf = leg(hipF, fF, fK, 0);
  // ---- head ----
  const r = B.head * h;
  const hAng = lean * 0.45 + tilt + (p.look ? clamp(p.look[1], -1, 1) * 0.16 : 0) + Math.sin(t * 0.7 + seed * 3) * 0.02;
  const nb = pt(1.0, 0.05 * chest);
  const hc = add(add(nb, [Math.sin(hAng), -Math.cos(hAng)], B.neck * h + r * 0.88), [Math.cos(hAng), Math.sin(hAng)], r * 0.1);
  Object.assign(S, { hip, lean, up, fw, pt, chest, waist: B.waist * h, hips: B.hips * h, shN, shF, an, af, ln, lf, r, hc, hAng, nb });
  return S;
}

// ---------------------------------------------------------------------------------------------------------------
// Static head pieces (head-local, radius r, facing +x), cached per style and size.
const _heads = new Map();
const scaleP = (pts, r) => pts.map((q) => [q[0] * r, q[1] * r, q[2]]);
const CAP = [[0.8, -0.46], [0.5, -0.86], [0, -1.06], [-0.55, -0.95], [-0.98, -0.5], [-1.06, 0.05], [-0.92, 0.5], [-0.62, 0.66],
  [-0.4, 0.34], [-0.3, 0.02], [-0.1, -0.36], [0.35, -0.48]];
function headParts(style, r, kid) {
  const key = style + ':' + r.toFixed(1) + ':' + kid;
  let H = _heads.get(key);
  if (H) return H;
  const skull = union(circle(0, 0, r), blob(scaleP([[0.25, -0.62], [0.88, -0.3], [0.98, 0.25], [0.78, 0.7], [0.32, 0.96], [-0.25, 0.82]], r)),
    circle(0.97 * r, 0.14 * r, (kid ? 0.13 : 0.16) * r));
  const ear = oval(-0.16 * r, 0.12 * r, 0.16 * r, 0.21 * r, -0.15);
  let hair = null, back = null, front = null;
  const cap = scaleP(CAP, r);
  if (style === 'short') {
    hair = blob([[0.9 * r, -0.36 * r, 1], [0.72 * r, -0.52 * r], [0.66 * r, -0.74 * r], [0.3 * r, -0.98 * r], [-0.25 * r, -1.08 * r], [-0.75 * r, -0.86 * r],
      [-1.04 * r, -0.36 * r], [-1.02 * r, 0.18 * r], [-0.82 * r, 0.52 * r], [-0.56 * r, 0.6 * r], [-0.38 * r, 0.3 * r], [-0.3 * r, -0.02 * r],
      [-0.08 * r, -0.36 * r], [0.3 * r, -0.44 * r, 1], [0.48 * r, -0.36 * r, 1], [0.6 * r, -0.46 * r, 1]]);
  } else if (style === 'curly') {
    const bumps = [];
    for (let i = 0; i < 11; i++) { const a = lerp(-0.25, -3.6, i / 10); bumps.push(circle(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86 - r * 0.06, r * 0.3)); }
    hair = union(blob(cap), ...bumps);
  } else if (style === 'bald') {
    hair = blob(scaleP([[-0.36, -0.12], [-0.7, -0.5], [-1.0, -0.2], [-1.0, 0.3], [-0.7, 0.62], [-0.44, 0.4], [-0.3, 0.06]], r));
  } else if (style === 'bob') {
    hair = blob(scaleP([[0.82, -0.44], [0.5, -0.88], [0, -1.08], [-0.6, -0.96], [-1.04, -0.45], [-1.12, 0.2], [-1.02, 0.78], [-0.6, 0.86, 1],
      [-0.12, 0.8, 1], [-0.02, 0.4], [-0.08, -0.3], [0.38, -0.5]], r));
  } else {
    hair = blob(cap);
  }
  if (style === 'bun') front = circle(-0.52 * r, -0.98 * r, 0.38 * r);
  if (style === 'pony') back = 'pony';
  if (style === 'pigtails') back = 'pig';
  if (style === 'long') back = blob(scaleP([[-0.2, -0.6], [-0.95, -0.7], [-1.15, 0.2], [-1.12, 1.25], [-0.9, 1.75], [-0.4, 1.6], [-0.25, 0.9]], r));
  H = { skull, ear, hair, back, front, r };
  _heads.set(key, H);
  return H;
}

// Ponytail / pigtail: a tapered lock hanging from a tie point, swinging by `sw`.
function lock(x, y, len, w, ang) {
  const d = [Math.sin(ang), Math.cos(ang)], n = [d[1], -d[0]];
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const u = i / 4, wv = w * (1 - u * 0.75) * (u < 0.15 ? 0.7 + u * 2 : 1), bend = Math.sin(u * 2.4) * len * 0.12;
    pts.push([x + d[0] * len * u + n[0] * (bend + wv), y + d[1] * len * u + n[1] * (bend + wv)]);
  }
  for (let i = 4; i >= 0; i--) {
    const u = i / 4, wv = w * (1 - u * 0.75) * (u < 0.15 ? 0.7 + u * 2 : 1), bend = Math.sin(u * 2.4) * len * 0.12;
    pts.push([x + d[0] * len * u + n[0] * (bend - wv), y + d[1] * len * u + n[1] * (bend - wv)]);
  }
  return blob(pts);
}

// ---------------------------------------------------------------------------------------------------------------
// Body parts.
function drawShoe(c, P, l, lw, far, fl) {
  const B = P.B, h = P.h, F = B.foot * h, sh = 0.05 * h * (P.build === 'adult' || !P.build ? 1 : 1.1);
  const M = shade(far ? mix(P.shoes.color, '#000000', 0.12) : P.shoes.color);
  c.save(); c.translate(l.ank[0], l.ank[1]); c.rotate(l.ang);
  const ah = B.ah * h;
  const path = blob([[-0.3 * F, ah * 0.98, 1], [-0.32 * F, -sh * 0.25], [-0.05 * F, -sh * 0.62], [0.32 * F, -sh * 0.38], [0.66 * F, -sh * 0.12],
    [0.8 * F, ah * 0.35], [0.76 * F, ah * 0.98, 1]]);
  fill(c, path, far ? M.far : lin(c, 0, -sh, 0, ah, [[0, M.hi], [0.6, M.c], [1, M.lo]]));
  const sole = P.shoes.sole;
  if (sole) clipped(c, path, () => { fill(c, rrect(-0.4 * F, ah * 0.45, 1.3 * F, ah, 2), far ? mix(sole, '#000', 0.15) : sole); });
  line(c, path, M.ink, lw);
  c.restore();
}

function drawLeg(c, P, S, l, far, lw, fl) {
  const h = P.h, B = P.B, bot = P.bottom.kind;
  const rT = B.thighR * h, rK = B.kneeR * h, rA = B.ankleR * h;
  const shinP = capsule(l.knee[0], l.knee[1], rK, l.ank[0], l.ank[1] - rA * 0.2, rA);
  const thighP = capsule(l.hip[0], l.hip[1], rT, l.knee[0], l.knee[1], rK);
  const y0 = Math.min(l.hip[1], l.knee[1], l.ank[1]) - rT, y1 = Math.max(l.hip[1], l.knee[1], l.ank[1]) + rA;
  const x0 = l.hip[0];
  if (bot === 'trousers') {
    const u = union(thighP, shinP), M = shade(P.bottom.color);
    fill(c, u, ramp(c, M, x0, y0, y1, fl, far));
    if (!far) rimAndForm(c, u, M, lw, fl, y0, y1, 0.3);
    line(c, u, M.ink, lw);
  } else {
    const skin = P.legs || P.skin, Ms = shade(skin), u = union(thighP, shinP);
    fill(c, u, ramp(c, Ms, x0, y0, y1, fl, far));
    line(c, u, Ms.ink, lw);
    if (P.socks) {
      const sk = capsule(lerp(l.knee[0], l.ank[0], 0.72), lerp(l.knee[1], l.ank[1], 0.72), rA * 1.12, l.ank[0], l.ank[1], rA * 1.12);
      const Mk = shade(P.socks); fill(c, sk, far ? Mk.far : Mk.c); line(c, sk, Mk.ink, lw * 0.9);
    }
    if (bot === 'shorts') {
      const M = shade(P.bottom.color), e = lerp2(l.hip, l.knee, 0.62);
      const sp = capsule(l.hip[0], l.hip[1], rT * 1.12, e[0], e[1], rT * 1.02);
      fill(c, sp, ramp(c, M, x0, y0, e[1] + rT, fl, far)); line(c, sp, M.ink, lw);
    }
  }
  drawShoe(c, P, l, lw, far, fl);
}

// Point at `d` units along a leg (thigh then shin).
function alongLeg(l, d, P) {
  const tl = Math.hypot(l.knee[0] - l.hip[0], l.knee[1] - l.hip[1]);
  if (d <= tl) return lerp2(l.hip, l.knee, d / tl);
  const sl = Math.hypot(l.ank[0] - l.knee[0], l.ank[1] - l.knee[1]) || 1;
  return lerp2(l.knee, l.ank, clamp((d - tl) / sl));
}

function skirtPath(P, S, waistA) {
  const h = P.h, B = P.B, len = (P.bottom.len ?? 0.5) * S.L, pt = S.pt;
  const qs = [S.ln, S.lf].map((l) => {
    const q = alongLeg(l, len, P), q0 = alongLeg(l, len - 0.02 * h, P), d = [q[0] - q0[0], q[1] - q0[1]], dl = Math.hypot(d[0], d[1]) || 1;
    const n = [d[1] / dl, -d[0] / dl]; // limb-forward normal
    return { q, n, d: [d[0] / dl, d[1] / dl] };
  });
  const rr = B.kneeR * h * 1.25 + 0.022 * h + (P.bottom.len ?? 0.5) * 0.03 * h;
  const dot = (a) => a.q[0] * a.n[0] + a.q[1] * a.n[1];
  const [fq, bq] = dot(qs[0]) >= dot(qs[1]) ? [qs[0], qs[1]] : [qs[1], qs[0]];
  const hemF = add(fq.q, fq.n, rr), hemB = add(bq.q, bq.n, -rr * 1.1);
  const mid = add(lerp2(hemF, hemB, 0.5), lerp2(fq.d, bq.d, 0.5), 0.012 * h);
  return blob([pt(waistA, -S.waist * 1.02), pt(0.05, -S.hips * 1.15), hemB, mid, hemF, pt(0.06, S.hips * 1.02), pt(waistA, S.waist * 1.0)]);
}

function torsoPath(P, S) {
  const pt = S.pt, cw = S.chest, ww = S.waist, hw = S.hips, kind = P.top.kind;
  const fem = P.fem ? 1 : 0, kid = P.build !== 'adult' ? 1 : 0;
  const pts = [pt(-0.13, 0.72 * hw), pt(0.3, (0.94 + kid * 0.1) * ww), pt(0.66, (1.0 + fem * 0.06) * cw), pt(0.92, 0.66 * cw), pt(1.03, 0.2 * cw),
    pt(1.03, -0.4 * cw), pt(0.88, -0.95 * cw), pt(0.5, -0.88 * ww), pt(0.12, -1.02 * hw), pt(-0.13, -0.5 * hw)];
  let path = blob(pts);
  if (kind === 'hoodie') path = union(path, oval(...pt(1.0, -0.62 * cw), 0.5 * cw, 0.3 * cw, S.lean - 0.25));
  if (kind === 'dress' || P.bottom.kind === 'dress') path = union(path, skirtPath(P, S, 0.36));
  return path;
}

function topDetails(c, P, S, M, lw, fl) {
  const pt = S.pt, cw = S.chest, ww = S.waist, hw = S.hips, kind = P.top.kind;
  c.lineWidth = lw * 0.75; c.strokeStyle = alpha(M.ink, 0.75);
  const seg = (pts, closed) => { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); if (closed) c.closePath(); c.stroke(); };
  if (kind === 'hoodie') {
    fill(c, blob([pt(-0.2, 1.2 * hw), pt(0.02, 1.1 * hw), pt(0.04, -1.3 * hw), pt(-0.2, -1.3 * hw)]), M.lo); // hem band
    seg([pt(0.03, 0.95 * hw), pt(0.03, -1.2 * hw)]);
    seg([pt(0.08, 0.98 * ww), pt(0.44, 0.92 * ww), pt(0.44, 0.25 * ww), pt(0.1, 0.1 * ww)]); // pocket
    c.strokeStyle = M.ink; c.lineWidth = lw * 0.6;
    seg([pt(0.96, 0.42 * cw), pt(0.74, 0.52 * cw)]); seg([pt(0.97, 0.22 * cw), pt(0.76, 0.3 * cw)]);
  } else if (kind === 'shirt') {
    fill(c, blob([pt(1.06, 0.05 * cw), pt(1.04, 0.62 * cw), [...pt(0.86, 0.5 * cw), 1], pt(0.96, 0.22 * cw)]), M.hi);
    seg([pt(0.98, 0.62 * cw), pt(0.05, 0.86 * hw)]);
    c.fillStyle = M.ink; for (const a of [0.75, 0.5, 0.25]) { const q = pt(a, lerp(0.86 * hw, 0.7 * cw, a) - 2); c.beginPath(); c.arc(q[0], q[1], lw * 0.7, 0, TAU); c.fill(); }
  } else if (kind === 'blouse' || kind === 'tee' || kind === 'sweater') {
    seg([pt(1.0, 0.62 * cw), pt(0.92, 0.3 * cw), pt(1.0, -0.2 * cw)]);
    if (kind === 'sweater') { fill(c, blob([pt(-0.2, 1.2 * hw), pt(0.05, 1.1 * hw), pt(0.06, -1.3 * hw), pt(-0.2, -1.3 * hw)]), M.lo); seg([pt(0.05, 0.95 * hw), pt(0.06, -1.2 * hw)]); }
    if (P.top.stripe) { c.strokeStyle = P.top.stripe; c.lineWidth = 0.022 * P.h; seg([pt(0.88, -0.05 * cw), pt(0.0, -0.05 * hw)]); }
  } else if (kind === 'cardigan' || kind === 'jacket') {
    const U = shade(P.top.under || '#efe8da');
    fill(c, blob([pt(1.08, 0.08 * cw), pt(1.02, 0.75 * cw), pt(0.6, 1.2 * cw), pt(-0.2, 1.2 * hw), pt(-0.2, 0.62 * hw), pt(0.45, 0.62 * ww), pt(0.92, 0.42 * cw)]), U.c);
    c.strokeStyle = M.ink; c.lineWidth = lw * 0.85;
    seg([pt(1.0, 0.36 * cw), pt(0.5, 0.6 * ww), pt(-0.15, 0.62 * hw)]);
    if (kind === 'cardigan') {
      c.fillStyle = tone(M.c, 0.55); for (const a of [0.72, 0.46, 0.2]) { const q = pt(a, lerp(0.58 * hw, 0.4 * cw, a) - 3); c.beginPath(); c.arc(q[0], q[1], lw * 1.1, 0, TAU); c.fill(); }
      fill(c, blob([pt(-0.2, 1.3 * hw), pt(0.04, 1.2 * hw), pt(0.05, -1.3 * hw), pt(-0.2, -1.3 * hw)]), alpha(M.lo, 0.8));
      seg([pt(0.15, 0.5 * ww), pt(0.36, 0.5 * ww)]);
    } else {
      fill(c, blob([pt(1.08, -0.5 * cw), pt(1.1, 0.1 * cw), [...pt(0.95, 0.5 * cw), 1], pt(0.92, -0.3 * cw)]), M.lo); // collar
      seg([pt(0.3, 0.2 * ww), pt(0.3, 0.75 * ww)]);
    }
  } else if (kind === 'dress') {
    fill(c, blob([pt(0.4, 1.4 * ww), pt(0.31, 1.4 * ww), pt(0.31, -1.4 * ww), pt(0.4, -1.4 * ww)]), alpha(M.lo, 0.9)); // waist sash
    fill(c, blob([pt(1.05, -0.1 * cw), pt(1.04, 0.62 * cw), pt(0.9, 0.55 * cw), pt(0.96, 0.15 * cw)]), '#fffaf0'); // collar
  }
}

function drawHandShape(c, P, a, lw, far, fl, palmUp) {
  const h = P.h, B = P.B, hr = B.hand * h, Ms = shade(P.skin);
  const d = [a.hd[0] - a.el[0], a.hd[1] - a.el[1]], dl = Math.hypot(d[0], d[1]) || 1, ang = Math.atan2(d[1], d[0]);
  let path;
  if (a.fist || a.open < 0.3) path = circle(a.hd[0] + d[0] / dl * hr * 0.2, a.hd[1] + d[1] / dl * hr * 0.2, hr * 0.95);
  else {
    c.save(); c.translate(a.hd[0], a.hd[1]); c.rotate(ang);
    const sp = 0.55 + a.open * 0.45, th = palmUp ? -1 : 1;
    path = union(oval(hr * 0.55, 0, hr * (0.95 + 0.25 * a.open), hr * 0.72 * sp + hr * 0.12, 0), capsule(hr * 0.1, -th * hr * 0.35, hr * 0.33, hr * 0.62, -th * hr * (0.75 + 0.2 * a.open), hr * 0.24));
    fill(c, path, far ? Ms.far : lin(c, 0, -hr, 0, hr, [[0, Ms.hi], [1, Ms.c]]));
    line(c, path, Ms.ink, lw * 0.9);
    c.restore();
    return;
  }
  fill(c, path, far ? Ms.far : rad(c, a.hd[0] - hr * 0.3, a.hd[1] - hr * 0.4, hr * 1.6, [[0, Ms.hi], [1, Ms.c]]));
  line(c, path, Ms.ink, lw * 0.9);
}

function drawArm(c, P, S, a, far, lw, fl) {
  const h = P.h, B = P.B, rU = B.upperR * h, rE = B.elbowR * h, rW = B.wristR * h, hr = B.hand * h;
  const sl = P.top.sleeve, M = shade(P.top.color), Ms = shade(P.skin);
  const d = [a.hd[0] - a.el[0], a.hd[1] - a.el[1]], dl = Math.hypot(d[0], d[1]) || 1;
  const wr = [a.hd[0] - d[0] / dl * hr * 0.55, a.hd[1] - d[1] / dl * hr * 0.55];
  const upP = capsule(a.sh[0], a.sh[1], rU, a.el[0], a.el[1], rE), loP = capsule(a.el[0], a.el[1], rE, wr[0], wr[1], rW);
  const y0 = Math.min(a.sh[1], a.el[1], wr[1]) - rU, y1 = Math.max(a.sh[1], a.el[1], wr[1]) + rU;
  // hand first when it sits behind the forearm line (hanging arms read better with the cuff over the wrist)
  if (sl === 'long') {
    drawHandShape(c, P, a, lw, far, fl, S.palmUp > 0.5 && !far);
    const u = union(upP, loP);
    fill(c, u, ramp(c, M, a.sh[0], y0, y1, fl, far));
    if (!far) rimAndForm(c, u, M, lw, fl, y0, y1, 0.3);
    line(c, u, M.ink, lw);
    if (P.top.kind === 'hoodie' || P.top.kind === 'cardigan' || P.top.kind === 'sweater') {
      const cu = capsule(lerp(a.el[0], wr[0], 0.8), lerp(a.el[1], wr[1], 0.8), rW * 1.18, wr[0], wr[1], rW * 1.18);
      fill(c, cu, far ? M.farLo : M.lo); line(c, cu, M.ink, lw * 0.8);
    }
  } else {
    drawHandShape(c, P, a, lw, far, fl, S.palmUp > 0.5 && !far);
    const u = union(upP, loP);
    fill(c, u, ramp(c, Ms, a.sh[0], y0, y1, fl, far)); line(c, u, Ms.ink, lw);
    const e = lerp2(a.sh, a.el, 0.62), sp = capsule(a.sh[0], a.sh[1], rU * 1.25, e[0], e[1], rU * 1.12);
    fill(c, sp, ramp(c, M, a.sh[0], y0, e[1] + rU, fl, far)); line(c, sp, M.ink, lw);
  }
}

function drawHeadAll(c, P, S, p, lw, fl) {
  const r = S.r, t = p.t ?? 0, seed = p.seed ?? 0, kid = P.build !== 'adult' ? 1 : 0;
  const Hd = headParts(P.style || 'short', r, kid);
  const Ms = shade(P.skin), Mh = shade(P.hair);
  c.save(); c.translate(S.hc[0], S.hc[1]); c.rotate(S.hAng);
  // hair behind the head
  const sw = S.hair + (S.lean ?? 0) * 0.5;
  if (Hd.back === 'pony') {
    const pp = lock(-0.82 * r, -0.62 * r, 1.25 * r, 0.24 * r, -0.95 - sw * 1.4 - S.hAng);
    fill(c, pp, lin(c, 0, -r, 0, r, [[0, Mh.hi], [1, Mh.lo]])); line(c, pp, Mh.ink, lw);
  } else if (Hd.back === 'pig') {
    const pf = lock(-0.7 * r, -0.66 * r, 0.95 * r, 0.2 * r, -1.35 - sw * 1.2 - S.hAng);
    fill(c, pf, Mh.far); line(c, pf, Mh.ink, lw);
  } else if (Hd.back) { fill(c, Hd.back, lin(c, 0, -r, 0, 1.7 * r, [[0, Mh.c], [1, Mh.lo]])); line(c, Hd.back, Mh.ink, lw); }
  if (Hd.front) { fill(c, Hd.front, lin(c, 0, -1.4 * r, 0, -0.6 * r, [[0, Mh.hi], [1, Mh.c]])); line(c, Hd.front, Mh.ink, lw); }
  // skull
  fill(c, Hd.skull, lin(c, -0.4 * r * fl, -r, 0.4 * r * fl, r, [[0, Ms.hi], [0.55, Ms.c], [1, Ms.lo]]));
  clipped(c, Hd.skull, () => {
    c.save(); c.translate(1.2 * fl, 2.4); c.globalAlpha *= 0.4; line(c, Hd.skull, Ms.rim, lw * 2.2); c.restore();
    c.fillStyle = alpha('#f07a6a', 0.3); c.beginPath(); c.ellipse(0.46 * r, 0.36 * r, 0.17 * r, 0.11 * r, 0, 0, TAU); c.fill();
    c.fillStyle = lin(c, 0, 0.5 * r, 0, r, [[0, alpha(Ms.lo, 0)], [1, alpha(Ms.ink, 0.2)]]); c.fillRect(-r * 1.2, 0.5 * r, r * 2.6, r * 0.6);
  });
  line(c, Hd.skull, Ms.ink, lw);
  // face
  const look = p.look || [0.2, 0], ex = clamp(look[0], -1, 1) * 0.05 * r, ey = clamp(look[1], -1, 1) * 0.05 * r;
  const mood = S.mood || 'neutral';
  const bl = Math.max(blink(t, seed + 11), mood === 'calm' ? 1 : 0);
  const eyeC = '#2a1c1a';
  const eyeAt = (x, y, rx, ry) => {
    if (bl > 0.55) {
      c.strokeStyle = eyeC; c.lineWidth = lw * 1.05; c.lineCap = 'round'; c.beginPath();
      const k = mood === 'calm' || mood === 'happy' ? -1 : 1;
      c.moveTo(x - rx * 1.3, y); c.quadraticCurveTo(x, y + ry * 0.7 * k, x + rx * 1.3, y); c.stroke();
      return;
    }
    const sy = ry * (1 - bl * 0.8) * (mood === 'surprised' ? 1.15 : 1);
    c.fillStyle = eyeC; c.beginPath(); c.ellipse(x + ex, y + ey, rx, sy, 0, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + ex - rx * 0.25, y + ey - sy * 0.4, rx * 0.36, 0, TAU); c.fill();
  };
  eyeAt(0.4 * r, -0.04 * r, 0.075 * r * (1 + kid * 0.25), 0.105 * r * (1 + kid * 0.2));
  eyeAt(0.78 * r, -0.06 * r, 0.06 * r * (1 + kid * 0.25), 0.095 * r * (1 + kid * 0.2));
  // brows
  c.strokeStyle = mix(P.hair, '#2a1c1a', 0.35); c.lineWidth = lw * 1.1; c.lineCap = 'round';
  const bro = mood === 'sad' ? 0.25 : mood === 'surprised' ? -0.05 : 0;
  const by = mood === 'surprised' ? -0.33 : -0.27;
  c.beginPath(); c.moveTo(0.28 * r, (by + bro * 0.4) * r); c.quadraticCurveTo(0.4 * r, (by - 0.06) * r, 0.52 * r, (by - bro * 0.2) * r); c.stroke();
  c.beginPath(); c.moveTo(0.7 * r, (by - bro * 0.2) * r); c.quadraticCurveTo(0.8 * r, (by - 0.06) * r, 0.88 * r, (by + bro * 0.4) * r); c.stroke();
  // mouth
  if (mood === 'happy' || mood === 'surprised') {
    const mp = mood === 'happy'
      ? blob([[0.56 * r, 0.42 * r], [0.9 * r, 0.4 * r], [0.82 * r, 0.6 * r], [0.66 * r, 0.6 * r]])
      : oval(0.74 * r, 0.5 * r, 0.07 * r, 0.09 * r, 0);
    fill(c, mp, '#8a2e2a'); clipped(c, mp, () => fill(c, oval(0.72 * r, 0.64 * r, 0.14 * r, 0.08 * r, 0), '#e8787a')); line(c, mp, Ms.ink, lw * 0.8);
  } else {
    c.strokeStyle = Ms.ink; c.lineWidth = lw * 0.9; c.beginPath();
    const sm = mood === 'sad' ? -1 : 1;
    c.moveTo(0.6 * r, 0.47 * r - sm * 0.02 * r); c.quadraticCurveTo(0.73 * r, 0.47 * r + sm * 0.07 * r, 0.86 * r, 0.44 * r - sm * 0.03 * r); c.stroke();
  }
  // nose shading
  c.strokeStyle = alpha(Ms.ink, 0.5); c.lineWidth = lw * 0.7; c.beginPath(); c.moveTo(0.97 * r, 0.27 * r); c.quadraticCurveTo(0.9 * r, 0.3 * r, 0.86 * r, 0.24 * r); c.stroke();
  // ear (hidden by a bob)
  if (P.style !== 'bob' && P.style !== 'long') {
    fill(c, Hd.ear, Ms.c); line(c, Hd.ear, Ms.ink, lw * 0.9);
    c.strokeStyle = alpha(Ms.ink, 0.55); c.lineWidth = lw * 0.7; c.beginPath(); c.arc(-0.15 * r, 0.12 * r, 0.09 * r, -1.2, 1.4); c.stroke();
  }
  // hair
  fill(c, Hd.hair, lin(c, -0.3 * r * fl, -1.1 * r, 0.3 * r * fl, 0.7 * r, [[0, Mh.hi], [0.5, Mh.c], [1, Mh.lo]]));
  clipped(c, Hd.hair, () => { c.save(); c.translate(1.2 * fl, 2.4); c.globalAlpha *= 0.4; line(c, Hd.hair, Mh.rim, lw * 2.2); c.restore(); });
  line(c, Hd.hair, Mh.ink, lw);
  if (P.style === 'short' || P.style === 'bob') {
    c.strokeStyle = alpha(Mh.ink, 0.45); c.lineWidth = lw * 0.7; c.beginPath(); c.moveTo(-0.1 * r, -0.9 * r); c.quadraticCurveTo(-0.55 * r, -0.7 * r, -0.75 * r, -0.2 * r); c.stroke();
  }
  if (Hd.back === 'pig') {
    const pn = lock(-0.62 * r, 0.12 * r, 1.0 * r, 0.22 * r, -0.55 - sw * 1.2 - S.hAng);
    fill(c, pn, lin(c, 0, 0, 0, r, [[0, Mh.hi], [1, Mh.lo]])); line(c, pn, Mh.ink, lw);
    for (const q of [[-0.62, 0.12], [-0.72, -0.64]]) { const ti = circle(q[0] * r, q[1] * r, 0.12 * r); fill(c, ti, P.ties || '#e5534b'); line(c, ti, shade(P.ties || '#e5534b').ink, lw * 0.8); }
  }
  if (Hd.back === 'pony') { const ti = circle(-0.82 * r, -0.62 * r, 0.1 * r); fill(c, ti, P.band || '#e5534b'); line(c, ti, shade(P.band || '#e5534b').ink, lw * 0.8); }
  // hats
  if (P.hat === 'band') {
    const bp = blob([[0.78 * r, -0.62 * r], [0.2 * r, -0.98 * r], [-0.55 * r, -0.9 * r], [-0.62 * r, -0.66 * r], [0.12 * r, -0.74 * r], [0.84 * r, -0.4 * r]]);
    const Mb = shade(P.band || '#ffffff'); fill(c, bp, Mb.c); line(c, bp, Mb.ink, lw * 0.9);
  } else if (P.hat === 'flatcap' || P.hat === 'cap') {
    const Mc = shade(P.hatColor || '#7b6a55');
    const cap = P.hat === 'flatcap'
      ? blob([[-1.0 * r, -0.28 * r], [-0.92 * r, -0.82 * r], [-0.1 * r, -1.12 * r], [0.75 * r, -0.86 * r], [1.22 * r, -0.52 * r], [1.18 * r, -0.38 * r, 1], [0.55 * r, -0.44 * r], [-0.2 * r, -0.4 * r], [-0.95 * r, -0.12 * r, 1]])
      : blob([[-1.0 * r, -0.2 * r], [-0.9 * r, -0.85 * r], [-0.05 * r, -1.14 * r], [0.7 * r, -0.8 * r], [0.82 * r, -0.5 * r], [1.4 * r, -0.42 * r], [1.38 * r, -0.32 * r, 1], [0.4 * r, -0.36 * r], [-0.95 * r, -0.05 * r, 1]]);
    fill(c, cap, lin(c, 0, -1.1 * r, 0, -0.2 * r, [[0, Mc.hi], [1, Mc.lo]])); line(c, cap, Mc.ink, lw);
    c.strokeStyle = alpha(Mc.ink, 0.6); c.lineWidth = lw * 0.7; c.beginPath(); c.moveTo(-0.6 * r, -0.62 * r); c.quadraticCurveTo(0.2 * r, -0.72 * r, 0.75 * r, -0.5 * r); c.stroke();
  }
  // glasses
  if (P.glasses) {
    c.strokeStyle = P.glasses; c.lineWidth = lw * 0.9;
    c.fillStyle = 'rgba(235,245,255,0.22)';
    c.beginPath(); c.ellipse(0.42 * r, -0.04 * r, 0.19 * r, 0.16 * r, 0, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(0.82 * r, -0.06 * r, 0.12 * r, 0.15 * r, 0, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0.61 * r, -0.08 * r); c.lineTo(0.7 * r, -0.08 * r); c.moveTo(0.23 * r, -0.06 * r); c.lineTo(-0.12 * r, -0.02 * r); c.stroke();
  }
  c.restore();
}

function drawBallAt(c, x, y, rr, lw) {
  const b = circle(x, y, rr);
  fill(c, b, rad(c, x - rr * 0.35, y - rr * 0.4, rr * 1.5, [[0, '#f2ff8a'], [0.6, '#d4e83a'], [1, '#9fb31f']]));
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = lw * 0.7; c.beginPath(); c.arc(x - rr * 0.9, y, rr * 0.8, -0.9, 0.9); c.stroke();
  line(c, b, '#5d6a14', lw * 0.8);
}

export function drawCup(c, o) {
  const s = o.s ?? 1, col = o.color ?? '#f4efe6';
  c.save(); c.translate(o.x, o.y); c.rotate(o.rot ?? 0); c.scale(s, s);
  const lw = inkW(s) * 0.85, M = shade(col);
  const body = poly([[-11, -13], [11, -13], [8, 15], [-8, 15]]);
  fill(c, body, lin(c, -11, 0, 11, 0, [[0, M.hi], [0.6, M.c], [1, M.lo]]));
  fill(c, poly([[-10.2, -5], [10.2, -5], [9.1, 6], [-9.1, 6]]), '#b07a4a');
  line(c, body, M.ink, lw);
  const lid = rrect(-12.5, -17, 25, 5, 2.2);
  fill(c, lid, '#ffffff'); line(c, lid, M.ink, lw);
  c.restore();
}

// ---------------------------------------------------------------------------------------------------------------
function paint(c, P, S, p, s, fl, A, noCb) {
  const h = P.h, lw = inkW(s) * 0.95;
  c.lineJoin = 'round'; c.lineCap = 'round';
  const shA = p.shadow ?? 0.3;
  if (shA > 0) {
    if (S.ground) {
      const xs = [S.ln.ank[0], S.lf.ank[0], S.hip[0]];
      const x0 = Math.min(...xs) - 0.05 * h, x1 = Math.max(...xs) + 0.09 * h;
      shadow(c, (x0 + x1) / 2, 1, Math.max(0.15 * h, (x1 - x0) / 2 + 0.03 * h), 0.024 * h, shA);
    } else if (S.sit) shadow(c, (S.ln.ank[0] + S.lf.ank[0]) / 2 + 0.03 * h, 1, 0.08 * h, 0.018 * h, shA * 0.8);
  }
  const inv = (fn) => { if (noCb || !fn) return; c.save(); c.scale(1 / (s * fl), 1 / s); c.translate(-p.x, -p.y); fn(c, A); c.restore(); };
  drawArm(c, P, S, S.af, true, lw, fl);
  drawLeg(c, P, S, S.lf, true, lw, fl);
  inv(p.behind);
  drawLeg(c, P, S, S.ln, false, lw, fl);
  // skirt (separate from the top)
  if (P.bottom.kind === 'skirt') {
    const sp = skirtPath(P, S, 0.16), M = shade(P.bottom.color);
    const y0 = S.pt(0.2, 0)[1], y1 = S.ln.knee[1] + 0.06 * h;
    fill(c, sp, ramp(c, M, S.hip[0], y0, y1, fl)); rimAndForm(c, sp, M, lw, fl, y0, y1, 0.25); line(c, sp, M.ink, lw);
  }
  // neck
  const Ms = shade(P.skin), nr = P.B.neckR * h;
  const nk = capsule(S.nb[0], S.nb[1] + nr * 0.4, nr, S.hc[0] - 0.12 * S.r, S.hc[1] + 0.55 * S.r, nr * 0.95);
  fill(c, nk, Ms.lo); line(c, nk, Ms.ink, lw);
  // torso
  const M = shade(P.top.color), tp = torsoPath(P, S);
  const ty0 = S.pt(1.05, 0)[1] - S.chest * 0.6, ty1 = Math.max(S.hip[1] + 0.04 * h, P.bottom.kind === 'dress' ? S.ln.knee[1] : -1e9);
  fill(c, tp, ramp(c, M, S.hip[0], ty0, ty1, fl));
  clipped(c, tp, () => topDetails(c, P, S, M, lw, fl));
  rimAndForm(c, tp, M, lw, fl, ty0, ty1, 0.34);
  line(c, tp, M.ink, lw);
  drawHeadAll(c, P, S, p, lw, fl);
  inv(p.mid);
  // near arm + held things
  const a = S.an;
  if (S.cup && a.fist) {
    const d = [a.hd[0] - a.el[0], a.hd[1] - a.el[1]], dl = Math.hypot(d[0], d[1]) || 1;
    c.save(); c.scale(1 / s, 1 / s);
    drawCup(c, { x: (a.hd[0] + d[0] / dl * 4) * s, y: (a.hd[1] - 6) * s, s: s * (h / 330) * 1.05, rot: -S.sip * 0.9 });
    c.restore();
  }
  drawArm(c, P, S, a, false, lw, fl);
  if (S.ball) drawBallAt(c, a.hd[0] + 0.02 * h, a.hd[1] - 0.012 * h, 0.022 * h, lw);
}

// ---------------------------------------------------------------------------------------------------------------
// Vanish: the figure is rendered into a bounded scratch buffer, masked from the feet up and tinted toward light.
const lineFrac = (v) => -0.05 + 1.25 * Math.pow(clamp(v), 1.15);
const _buf = { cv: null, c: null, w: 0, h: 0 };
function scratch(w, h) {
  if (!_buf.cv || _buf.w < w || _buf.h < h) {
    const nw = Math.max(_buf.w, Math.ceil(w / 256) * 256), nh = Math.max(_buf.h, Math.ceil(h / 256) * 256);
    _buf.cv = createCanvas(nw, nh); _buf.c = _buf.cv.getContext('2d'); _buf.w = nw; _buf.h = nh;
  }
  return _buf;
}
function dissolve(c, P, S, p, s, fl, v, A) {
  const h = P.h, m = c.getTransform(), cw = c.canvas?.width ?? 4096, chh = c.canvas?.height ?? 4096;
  // tight local box from the skeleton (keeps the scratch composite small)
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity;
  for (const q of [S.hc, S.an.hd, S.af.hd, S.an.el, S.af.el, S.ln.ank, S.lf.ank, S.ln.knee, S.lf.knee, S.hip, S.shN]) {
    bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]);
  }
  const fx0 = Math.min(S.ln.ank[0], S.lf.ank[0]), fx1 = Math.max(S.ln.ank[0], S.lf.ank[0]);
  bx0 = Math.min(bx0 - 0.08 * h, S.hc[0] - S.r * 2, fx0 - 0.2 * h); bx1 = Math.max(bx1 + 0.1 * h, S.hc[0] + S.r * 1.6, fx1 + 0.2 * h);
  by0 = Math.min(by0 - 0.06 * h, S.hc[1] - S.r * 1.7);
  const by1 = 0.05 * h;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [lx, ly] of [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]]) {
    const wx = p.x + lx * s * fl, wy = p.y + ly * s, dx = m.a * wx + m.c * wy + m.e, dy = m.b * wx + m.d * wy + m.f;
    x0 = Math.min(x0, dx); x1 = Math.max(x1, dx); y0 = Math.min(y0, dy); y1 = Math.max(y1, dy);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(cw, Math.ceil(x1)); y1 = Math.min(chh, Math.ceil(y1));
  const w = x1 - x0, hh = y1 - y0;
  if (w <= 0 || hh <= 0) return;
  const Bf = scratch(w, hh), x = Bf.c;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w + 1, hh + 1);
  x.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
  x.translate(p.x, p.y); x.scale(s * fl, s);
  paint(x, P, S, { ...p, shadow: (p.shadow ?? 0.3) * (1 - ss(0, 0.3, v)) }, s, fl, A, true);
  const yl = -lineFrac(v) * h, band = 0.13 * h, seed = p.seed ?? 0;
  x.globalCompositeOperation = 'destination-in';
  x.fillStyle = lin(x, 0, yl, 0, yl - band, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,1)']]);
  x.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  // crumble the edge into flecks
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = 'rgba(0,0,0,0.9)';
  for (let i = 0; i < 26; i++) {
    const u = hash(i, seed + 41), fy = yl - band * (0.3 + 1.1 * hash(i, seed + 43)), rr = h * (0.006 + 0.012 * hash(i, seed + 47) * (1 - (yl - fy) / (band * 1.6)));
    x.beginPath(); x.arc((u - 0.5) * 0.36 * h, fy, Math.max(0.5, rr), 0, TAU); x.fill();
  }
  // brighten toward warm light, hottest at the edge
  x.globalCompositeOperation = 'source-atop';
  const gl = clamp(0.25 + v * 0.9);
  x.fillStyle = lin(x, 0, yl, 0, yl - 0.6 * h, [[0, 'rgba(255,246,226,0.95)'], [0.2, `rgba(255,240,214,${(0.35 + 0.4 * gl).toFixed(3)})`], [1, `rgba(255,236,206,${(0.1 + 0.45 * v).toFixed(3)})`]]);
  x.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  x.globalCompositeOperation = 'source-over';
  x.setTransform(1, 0, 0, 1, 0, 0);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha *= 1 - ss(0.88, 1, v);
  c.drawImage(Bf.cv, 0, 0, w, hh, x0, y0, w, hh);
  c.restore();
}

// ---------------------------------------------------------------------------------------------------------------
export function drawHuman(c, p) {
  const P = person(p.who, p.seed ?? 0);
  const s = p.s ?? 1, fl = (p.flip ?? 1) < 0 ? -1 : 1, v = clamp(p.vanish ?? 0);
  const S = solve(P, p);
  const W = (q) => [p.x + q[0] * s * fl, p.y + q[1] * s];
  const A = {
    hand: W(S.an.hd), hand2: W(S.af.hd), head: W(S.hc), hip: W(S.hip), chest: W(S.pt(0.68, S.chest)),
    top: W(add(S.hc, [Math.sin(S.hAng), -Math.cos(S.hAng)], S.r * 1.05)),
    seat: S.sit ? [p.x, p.y - S.sit * s] : S.seatAt ? W(S.seatAt) : null,
  };
  if (v >= 1) return A;
  if (v > 0) {
    if (p.behind) p.behind(c, A);
    dissolve(c, P, S, p, s, fl, v, A);
    if (p.mid) p.mid(c, A);
    return A;
  }
  c.save();
  c.translate(p.x, p.y); c.scale(s * fl, s);
  paint(c, P, S, p, s, fl, A, false);
  c.restore();
  return A;
}

// ---------------------------------------------------------------------------------------------------------------
// Emissive vanish light (after the grade).
export function drawVanishFx(c, o) {
  const k = clamp(o.k ?? 0);
  if (k <= 0 || k >= 1) return;
  const s = o.s ?? 1, seed = o.seed ?? 0, t = o.t ?? 0;
  const h = (o.h ?? (o.who ? resolveH(o.who, seed) : 330)) * s, x = o.x, y = o.y;
  const yl = y - lineFrac(k) * h, top = y - h * 1.02;
  const env = ss(0, 0.1, k) * (1 - ss(0.72, 1, k));
  const col = '#fff1d6';
  c.save();
  c.globalCompositeOperation = 'screen';
  // glow column over what is left of the body
  const ya = Math.max(top, Math.min(yl, y)), cy = (ya + top) / 2 + h * 0.05, ry = Math.max(h * 0.18, (ya - top) / 2 + h * 0.15);
  c.save(); c.translate(x, cy); c.scale(1, ry / (h * 0.22));
  c.globalAlpha = 0.55 * env;
  c.fillStyle = rad(c, 0, 0, h * 0.22, [[0, alpha(col, 0.9)], [0.4, alpha(col, 0.35)], [1, alpha(col, 0)]]);
  c.beginPath(); c.arc(0, 0, h * 0.22, 0, TAU); c.fill();
  c.restore();
  // hot band at the dissolve line
  if (yl > top - h * 0.05) {
    c.save(); c.translate(x, yl); c.scale(1, 0.32);
    c.globalAlpha = 0.85 * env;
    c.fillStyle = rad(c, 0, 0, h * 0.2, [[0, alpha('#ffffff', 1)], [0.3, alpha(col, 0.6)], [1, alpha(col, 0)]]);
    c.beginPath(); c.arc(0, 0, h * 0.2, 0, TAU); c.fill();
    c.restore();
  }
  // rising sparkles: each is born when the dissolve line passes its height, then drifts up and twinkles out
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 64; i++) {
    const hf = hash(i, seed + 3), born = clamp((hf + 0.05) / 1.25) ** (1 / 1.15), life = 0.26 + 0.14 * hash(i, seed + 17), age = (k - born) / life;
    if (age <= 0 || age >= 1) continue;
    const bx = (hash(i, seed + 5) - 0.5) * h * (hf > 0.85 ? 0.15 : 0.28);
    const px = x + bx + noise1(i * 3.1 + t * 0.9, seed) * h * 0.05 * age + (hash(i, seed + 9) - 0.5) * h * 0.1 * age;
    const py = y - hf * h - age * h * (0.12 + 0.3 * hash(i, seed + 7));
    const tw = 0.55 + 0.45 * Math.sin(t * 13 + i * 2.7);
    const a = Math.sin(Math.PI * Math.sqrt(age)) * tw * (1 - ss(0.85, 1, k));
    const rr = Math.max(0.6, h * (0.0022 + 0.0042 * hash(i, seed + 11)) * (1 - age * 0.4));
    c.globalAlpha = a * 0.22; c.fillStyle = '#ffcf7a'; c.beginPath(); c.arc(px, py, rr * 3.2, 0, TAU); c.fill();
    c.globalAlpha = a * 0.4; c.beginPath(); c.arc(px, py, rr * 1.8, 0, TAU); c.fill();
    c.globalAlpha = a; c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(px, py, rr, 0, TAU); c.fill();
    if (hash(i, seed + 13) > 0.55) {
      const g = rr * (3 + 2 * tw);
      c.globalAlpha = a * 0.75; c.strokeStyle = '#fff4dc'; c.lineWidth = Math.max(0.5, rr * 0.4);
      c.beginPath(); c.moveTo(px - g, py); c.lineTo(px + g, py); c.moveTo(px, py - g); c.lineTo(px, py + g); c.stroke();
    }
  }
  c.restore();
}

// ---------------------------------------------------------------------------------------------------------------
export function drawLeash(c, x0, y0, x1, y1, o = {}) {
  const s = o.s ?? 1, fall = clamp(o.fall ?? 0), slack = o.slack ?? 0.35, t = o.t ?? 0;
  const col = o.color ?? '#c23b2e', w = o.w ?? 3.2 * s, gy = o.groundY ?? y1 + 115 * s;
  const M = shade(col), ink = inkW(s) * s * 0.9;
  const d0 = Math.hypot(x1 - x0, y1 - y0) || 1, sag0 = slack * 0.3 * d0 * (1 + 0.05 * Math.sin(t * 2.3 + x0 * 0.01));
  const Lr = d0 + (8 * sag0 * sag0) / (3 * d0);
  let hx = x0, hy = y0;
  if (fall > 0) {
    const fe = ease.in(clamp(fall / 0.72)), b = fall > 0.72 ? Math.sin(Math.PI * clamp((fall - 0.72) / 0.28)) * 7 * s * (1 - fall) * 3 : 0;
    hx = lerp(x0, x0 + (x1 - x0) * 0.18, ease.out(clamp(fall))); hy = lerp(y0, gy - w * 0.5, fe) - b;
  }
  const d1 = Math.hypot(x1 - hx, y1 - hy) || 1, sag = Math.sqrt(Math.max(0, (3 * d1 * (Lr - d1)) / 8));
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    pts.push([lerp(hx, x1, u), Math.min(gy - w * 0.5, lerp(hy, y1, u) + 4 * sag * u * (1 - u))]);
  }
  const path = blob(pts, false);
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  line(c, path, M.ink, w + ink * 2);
  line(c, path, M.c, w);
  c.save(); c.translate(-w * 0.12, -w * 0.28); c.globalAlpha *= 0.55; line(c, path, M.rim, w * 0.32); c.restore();
  // handle loop (hanging below the fist, flat on the ground once dropped)
  const fz = ss(0.55, 1, fall), dir = x1 >= hx ? -1 : 1;
  const lx = hx + dir * fz * 9 * s, ly = lerp(hy + 7 * s, gy - w * 0.4, fz);
  const loop = oval(lx, ly, lerp(4.5, 10, fz) * s, lerp(7.5, 2.6, fz) * s, 0);
  line(c, loop, M.ink, w + ink * 2); line(c, loop, M.c, w);
  // clip at the collar
  const clip = rrect(x1 - 2.6 * s, y1 - 1.5 * s, 5.2 * s, 7 * s, 2 * s);
  fill(c, clip, '#c9ccd2'); line(c, clip, '#4a4d55', ink);
  c.restore();
  return { handle: [hx, hy] };
}

// ---------------------------------------------------------------------------------------------------------------
const GEAR = 2.2;
export function bikeStride(s = 1, who = 'man') { return GEAR * TAU * 60 * (resolveH(who) / 330) * s; }

function drawBikeBody(c, G, o, s, part) {
  const lw = inkW(s) * 0.95, k = G.k, col = o.color ?? '#2f7fbf', M = shade(col);
  const wa = (o.phase ?? 0) * GEAR * TAU;
  if (part === 'far') { // far crank + pedal
    c.strokeStyle = '#4a4d55'; c.lineWidth = 4.5 * k; c.lineCap = 'round';
    c.beginPath(); c.moveTo(G.bb[0], G.bb[1]); c.lineTo(G.pedF[0], G.pedF[1]); c.stroke();
    fill(c, rrect(G.pedF[0] - 7 * k, G.pedF[1] - 2.5 * k, 14 * k, 5 * k, 2 * k), '#3b3e45');
    return;
  }
  if (part === 'near') {
    c.strokeStyle = '#2c2f36'; c.lineWidth = 5 * k + lw * 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(G.bb[0], G.bb[1]); c.lineTo(G.pedN[0], G.pedN[1]); c.stroke();
    c.strokeStyle = '#a9aeb8'; c.lineWidth = 5 * k; c.stroke();
    const pd = rrect(G.pedN[0] - 8 * k, G.pedN[1] - 3 * k, 16 * k, 6 * k, 2 * k); fill(c, pd, '#3b3e45'); line(c, pd, '#1e2026', lw * 0.8);
    return;
  }
  // wheels
  for (const hub of [G.back, G.front]) {
    c.strokeStyle = '#8f949e'; c.lineWidth = Math.max(0.8, 1.1 * k);
    c.beginPath();
    for (let i = 0; i < 12; i++) { const a = wa + (i * TAU) / 12; c.moveTo(hub[0], hub[1]); c.lineTo(hub[0] + Math.cos(a) * G.wr * 0.9, hub[1] + Math.sin(a) * G.wr * 0.9); }
    c.stroke();
    c.strokeStyle = '#b9bec7'; c.lineWidth = 3 * k; c.beginPath(); c.arc(hub[0], hub[1], G.wr * 0.9, 0, TAU); c.stroke();
    c.strokeStyle = '#1d1f24'; c.lineWidth = 9 * k + lw; c.beginPath(); c.arc(hub[0], hub[1], G.wr - 3 * k, 0, TAU); c.stroke();
    c.strokeStyle = '#33363d'; c.lineWidth = 7 * k; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 2 * k; c.beginPath(); c.arc(hub[0], hub[1], G.wr - 4 * k, 3.6, 5.2); c.stroke();
    fill(c, circle(hub[0], hub[1], 5 * k), '#c4c8d0'); line(c, circle(hub[0], hub[1], 5 * k), '#4a4d55', lw * 0.7);
  }
  // chain + ring
  c.strokeStyle = '#4a4d55'; c.lineWidth = 2 * k;
  c.beginPath(); c.moveTo(G.bb[0], G.bb[1] - 13 * k); c.lineTo(G.back[0], G.back[1] - 6 * k); c.moveTo(G.bb[0], G.bb[1] + 13 * k); c.lineTo(G.back[0], G.back[1] + 6 * k); c.stroke();
  const ring = circle(G.bb[0], G.bb[1], 14 * k); fill(c, ring, '#9ca1ab'); line(c, ring, '#3d4048', lw * 0.8);
  // frame: one stroked path, outlined once
  const fr = newPath();
  fr.moveTo(G.back[0], G.back[1]); fr.lineTo(G.bb[0], G.bb[1]); fr.lineTo(G.seatTop[0], G.seatTop[1]); fr.lineTo(G.back[0], G.back[1]);
  fr.moveTo(G.bb[0], G.bb[1]); fr.lineTo(G.headLo[0], G.headLo[1]); fr.lineTo(G.head[0], G.head[1]); fr.lineTo(G.seatTop[0], G.seatTop[1]);
  fr.moveTo(G.headLo[0], G.headLo[1]); fr.lineTo(G.front[0], G.front[1]);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = M.ink; c.lineWidth = 7.5 * k + lw * 2; c.stroke(fr);
  c.strokeStyle = lin(c, 0, -150 * k, 0, -50 * k, [[0, M.hi], [1, M.c]]); c.lineWidth = 7.5 * k; c.stroke(fr);
  c.strokeStyle = alpha(M.rim, 0.5); c.lineWidth = 2 * k; c.save(); c.translate(-1 * k, -1.6 * k); c.stroke(fr); c.restore();
  // seat post, saddle, stem, bars
  c.strokeStyle = '#3d4048'; c.lineWidth = 4.5 * k + lw;
  c.beginPath(); c.moveTo(G.seatTop[0], G.seatTop[1]); c.lineTo(G.saddle[0] + 2 * k, G.saddle[1] + 4 * k);
  c.moveTo(G.head[0], G.head[1]); c.lineTo(G.head[0] - 2 * k, G.grip[1] + 6 * k); c.lineTo(G.grip[0] + 4 * k, G.grip[1] + 2 * k); c.stroke();
  c.strokeStyle = '#a9aeb8'; c.lineWidth = 4.5 * k; c.stroke();
  const sd = blob([[G.saddle[0] - 16 * k, G.saddle[1] - 2 * k], [G.saddle[0] + 4 * k, G.saddle[1] - 6 * k], [G.saddle[0] + 18 * k, G.saddle[1] - 1 * k], [G.saddle[0] + 2 * k, G.saddle[1] + 4 * k]]);
  fill(c, sd, '#33302e'); line(c, sd, '#151313', lw * 0.8);
  const gp = capsule(G.grip[0] - 2 * k, G.grip[1], 4 * k, G.grip[0] + 7 * k, G.grip[1] + 1 * k, 4 * k); fill(c, gp, '#2b2b30');
}

export function drawBike(c, o) {
  const P = person(o.who || 'man', o.seed ?? 0), s = o.s ?? 1, fl = (o.flip ?? 1) < 0 ? -1 : 1;
  const G = bikeGeom(P.h / 330, o.phase ?? 0);
  const W = (q) => [o.x + q[0] * s * fl, o.y + q[1] * s];
  const local = (fn) => (cc) => { cc.save(); cc.translate(o.x, o.y); cc.scale(s * fl, s); fn(cc); cc.restore(); };
  if ((o.shadow ?? 0.3) > 0) { c.save(); c.translate(o.x, o.y); c.scale(s * fl, s); shadow(c, 0, 1, 150 * G.k, 9 * G.k, o.shadow ?? 0.3); c.restore(); }
  const body = local((cc) => { drawBikeBody(cc, G, o, s, 'far'); drawBikeBody(cc, G, o, s, 'frame'); drawBikeBody(cc, G, o, s, 'near'); });
  let A = {};
  if (o.rider === false) body(c);
  else A = drawHuman(c, { ...o, who: o.who || 'man', pose: 'cycle', _bike: G, shadow: 0, behind: body, s, flip: fl });
  return { ...A, saddle: W(G.saddle), front: W(G.front), back: W(G.back) };
}

// ---------------------------------------------------------------------------------------------------------------
// Close-up hand. Local frame: palm centre at the origin, fingers toward +x, thumb on the -y side (top when rot = 0).
function drawCarrot(c, len, bite, lw) {
  const L = len * (1 - 0.35 * clamp(bite));
  const tipR = 3 + 7 * clamp(bite);
  const body = blob([[-40, -17], [L * 0.45, -12], [L, -tipR], [L + 2, 0], [L, tipR], [L * 0.45, 12], [-40, 17]]);
  const M = shade('#f08a2a');
  // leaves
  c.save();
  for (const [a, l] of [[-2.6, 70], [-2.9, 85], [2.8, 75], [3.1, 60]]) {
    const lf = blob([[-38, 0], [-38 + Math.cos(a) * l * 0.5 - 8, Math.sin(a) * l * 0.5 - 6], [-38 + Math.cos(a) * l, Math.sin(a) * l], [-38 + Math.cos(a) * l * 0.5 + 6, Math.sin(a) * l * 0.5 + 6]]);
    fill(c, lf, '#5aa83c'); line(c, lf, '#24451b', lw * 0.8);
  }
  c.restore();
  fill(c, body, lin(c, 0, -17, 0, 17, [[0, M.hi], [0.5, M.c], [1, M.lo]]));
  c.strokeStyle = alpha(M.ink, 0.5); c.lineWidth = lw * 0.7;
  for (const x of [L * 0.2, L * 0.42, L * 0.62]) { c.beginPath(); c.moveTo(x, -9); c.quadraticCurveTo(x + 3, -4, x + 1, 1); c.stroke(); }
  if (bite > 0.02) { // pale bitten face
    fill(c, oval(L + 0.5, 0, 2.5, tipR * 0.95, 0), '#ffd2a0');
  }
  line(c, body, M.ink, lw);
  return [L + 2, 0];
}

export function drawHand(c, o) {
  const s = o.s ?? 1, rot = o.rot ?? 0, fl = (o.flip ?? 1) < 0 ? -1 : 1, open = clamp(o.open ?? 0.75), age = clamp(o.age ?? 0);
  const skin = o.skin ?? PEOPLE.girl.skin, Ms = shade(age > 0 ? mix(skin, '#f4e6dc', 0.15 * age) : skin);
  const holding = o.holding ?? null, t = o.t ?? 0, len = o.len ?? 1100, lw = inkW(s) * 1.1;
  const fist = holding === 'carrot' || open < 0.25, pinch = holding === 'seed';
  c.save();
  c.translate(o.x, o.y); c.rotate(rot); c.scale(s, s * fl);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const breathe = Math.sin(t * 1.3 + 0.7) * 1.5;
  c.translate(0, breathe);
  const out = { item: null, palm: [0, 0] };
  // forearm + sleeve
  const fa = capsule(-50, 1, 33, -len, 6, 52);
  fill(c, fa, lin(c, 0, -46, 0, 50, [[0, Ms.hi], [0.5, Ms.c], [1, Ms.lo]])); line(c, fa, Ms.ink, lw);
  if (o.sleeve) {
    const M = shade(o.sleeve), sx = -150;
    const sl = capsule(sx + 20, 2, 56, -len - 60, 8, 66);
    fill(c, sl, lin(c, 0, -60, 0, 64, [[0, M.hi], [0.5, M.c], [1, M.lo]]));
    clipped(c, sl, () => { c.save(); c.translate(1.5, 3); c.globalAlpha = 0.35; line(c, sl, M.rim, lw * 2.4); c.restore(); });
    line(c, sl, M.ink, lw);
    const Mc = shade(o.cuff ?? M.lo), cf = rrect(sx - 4, -58, 46, 116, 18);
    fill(c, cf, lin(c, 0, -58, 0, 58, [[0, Mc.hi], [1, Mc.lo]]));
    c.strokeStyle = alpha(Mc.ink, 0.45); c.lineWidth = lw * 0.7;
    for (let i = 1; i < 6; i++) { const xx = sx - 4 + i * 7.6; c.beginPath(); c.moveTo(xx, -52); c.lineTo(xx, 52); c.stroke(); }
    line(c, cf, Mc.ink, lw);
  }
  let item = null;
  const skinG = (y0, y1) => lin(c, -20, y0, 20, y1, [[0, Ms.hi], [0.55, Ms.c], [1, Ms.lo]]);
  const palm = blob([[-62, -38], [10, -46], [46, -40], [60, -8], [54, 34], [10, 44], [-62, 40]]);
  const palmPaint = () => {
    fill(c, palm, skinG(-46, 44));
    clipped(c, palm, () => { c.save(); c.translate(1.5, 3); c.globalAlpha = 0.35; line(c, palm, Ms.rim, lw * 2.4); c.restore(); });
    line(c, palm, Ms.ink, lw);
  };
  const crease = (x, y) => { if (age <= 0) return; c.strokeStyle = alpha(Ms.ink, 0.35 * age); c.lineWidth = lw * 0.6; c.beginPath(); c.arc(x, y, 6, -0.6, 0.9); c.stroke(); };
  let thumbPts;
  if (fist) {
    if (holding === 'carrot') {
      c.save(); c.translate(36, -14); c.rotate(-0.1);
      const tip = drawCarrot(c, 175, o.bite ?? 0, lw);
      c.restore();
      item = [36 + tip[0] * Math.cos(-0.1), -14 + tip[0] * Math.sin(-0.1)];
    }
    palmPaint();
    // curled fingers: four rolled knuckles across the front of the fist, index on top
    for (let i = 3; i >= 0; i--) {
      const y = -24 + i * 18.5, kn = capsule(34, y, 15, 60, y + 4, 13.5);
      fill(c, kn, skinG(y - 15, y + 15)); line(c, kn, Ms.ink, lw * 0.95);
      crease(52, y + 2);
    }
    thumbPts = [[-8, -38, 20], [28, -46, 16], [54, -30, 13]];
  } else {
    // fingers stacked index (top) → pinky (bottom), curling up toward the thumb as the hand closes
    const curl = pinch ? 0.45 : 1 - open;
    const F = [[44, 24, 52, 14.5, 0.1], [44, 8, 64, 16, 0.04], [44, -8, 68, 16.5, -0.02], [44, -24, 62, 16, -0.08]]; // pinky..index: [x, y, len, r, fan]
    F.forEach(([bx, by, fln, fr, fan], i) => {
      const l1 = fln * 0.55, l2 = fln * 0.5;
      let j, e;
      if (pinch && i === 3) { const r = ik2(bx, by, 90, -56, l1, l2, 1); j = [r.jx, r.jy]; e = [r.ex, r.ey]; }
      else {
        const a1 = fan * (0.4 + open) - curl * 1.05, a2 = a1 - curl * 1.25;
        j = [bx + Math.cos(a1) * l1, by + Math.sin(a1) * l1]; e = [j[0] + Math.cos(a2) * l2, j[1] + Math.sin(a2) * l2];
      }
      const fp = union(capsule(bx - 12, by, fr, j[0], j[1], fr * 0.94), capsule(j[0], j[1], fr * 0.94, e[0], e[1], fr * 0.8));
      const dk = 0.07 * (3 - i);
      fill(c, fp, lin(c, 0, by - fr, 0, by + fr, [[0, mix(Ms.hi, Ms.lo, dk)], [1, mix(Ms.c, Ms.lo, 0.25 + dk)]]));
      line(c, fp, Ms.ink, lw);
      crease(j[0], j[1]);
    });
    palmPaint();
    thumbPts = pinch ? [[-8, -40, 20], [34, -66, 16], [64, -66, 13]] : [[-8, -40, 20], [30, -72 + open * 6, 16], [58, -80 + open * 10, 13]];
  }
  if (pinch) {
    const sx = 79, sy = -66;
    c.save(); c.translate(sx, sy); c.rotate(-0.35);
    const seedP = blob([[-14, 0], [-4, -8], [12, -5], [16, 0], [12, 5], [-4, 8]]);
    fill(c, seedP, lin(c, 0, -8, 0, 8, [[0, '#6b6660'], [1, '#2f2c2a']]));
    c.strokeStyle = 'rgba(240,236,226,0.85)'; c.lineWidth = 1.6;
    for (const yy of [-3.5, 0, 3.5]) { c.beginPath(); c.moveTo(-10, yy * 0.8); c.lineTo(12, yy * 0.5); c.stroke(); }
    line(c, seedP, '#1c1a19', lw * 0.8);
    c.restore();
    item = [sx, sy];
  }
  // thumb
  const th = thumbPts;
  const thumb = union(capsule(th[0][0], th[0][1], th[0][2], th[1][0], th[1][1], th[1][2]), capsule(th[1][0], th[1][1], th[1][2], th[2][0], th[2][1], th[2][2]));
  fill(c, thumb, lin(c, 0, -84, 0, -26, [[0, Ms.hi], [1, Ms.c]])); line(c, thumb, Ms.ink, lw);
  c.fillStyle = alpha('#ffffff', 0.35);
  c.beginPath(); c.ellipse(th[2][0] + 2, th[2][1] - 4, 6, 4, -0.4, 0, TAU); c.fill();
  if (age > 0) { c.strokeStyle = alpha(Ms.ink, 0.3 * age); c.lineWidth = lw * 0.6; c.beginPath(); c.moveTo(-30, -20); c.quadraticCurveTo(-10, -10, 0, 10); c.stroke(); }
  if (o.ring) { const rg = rrect(fist ? 24 : 30, fist ? 16 : 1, 9, 15, 3); fill(c, rg, '#f2c14e'); line(c, rg, '#8a6418', lw * 0.7); }
  c.restore();
  const tr = (q) => { const y = (q[1] + breathe) * fl; return [o.x + (q[0] * Math.cos(rot) - y * Math.sin(rot)) * s, o.y + (q[0] * Math.sin(rot) + y * Math.cos(rot)) * s]; };
  out.item = item ? tr(item) : tr([90, 0]);
  out.palm = tr([0, 0]);
  return out;
}
