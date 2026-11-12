// Hero props for The Last Pets on Earth — all `fn(c, {x, y, s = 1, rot = 0, age = 0, ...})`, (x, y) = the point the
// prop rests on (bottom centre), dark-tinted outlines via inkW(s), age 0..1 = new → 200 years of decay.
//
//   drawPlush(c, {x, y, s, rot, age, squash, look})   tan teddy (≈62 tall at s=1) with a blue ribbon; age → faded, dirty,
//                                                     mossy, torn seam; squash 0..1 = bitten/shaken; look -1..1 head turn
//   drawPhoto(c, {x, y, s, rot, age, frame, t})      framed photo (≈150×112 at s=1, frame on by default) of the boy
//                                                     hugging MAX; age → sepia, stains, cracked glass; age back to 0 =
//                                                     the colour returns. (x, y) = bottom centre of the frame.
//   drawCollar(c, {x, y, s, rot, age})               red collar lying flat (≈90 wide) with a gold bone tag "MAX"
//   drawBowl(c, {x, y, s, rot, age, name, sapling, food})  cream ceramic bowl (≈96×36) lettered name ('MAX');
//                                                     age → cracks, chip, moss; sapling 0..1 grows a sapling in it
//   drawFeeder(c, {x, y, s, led, age})               automatic feeder (≈84×132); led 0..1 brightness of its green LED.
//                                                     Returns the LED point [x, y] (scenes add an emissive glow there).
//   drawPerchStand(c, {x, y, s, age})                macaw stand (≈340 tall); returns the perch point [x, y]
//   drawDogBed(c, {x, y, s, age})                    red plaid bed (≈270×74); age → flattened, faded, torn, mossy.
//                                                     Returns the cushion top point [x, y] where a dog lies.
//   drawBall(c, {x, y, s, rot, age})                 tennis ball, radius 14 (y = ground under it)
//   drawCage(c, {x, y, s, age, open, fern})          small-pet cage (≈170×124); age → rust; open 0..1 door; fern 0..1
import { TAU, clamp, lerp, mix, alpha, RNG, ss, tone } from '../engine/util.js';
import { P, blob, rrect, oval, circle, poly, union, fill, ink, clipped, lin, rad, shadow, txt } from '../engine/draw.js';
import { inkW } from '../chars/rig.js';
import { drawDog } from '../chars/dog.js';
import { tree, moss as mossLine, LEAF } from '../env/nature.js';

const MOSS = ['#4f7a35', '#6c9a3f', '#86ad4b'];

function place(c, o, fn) {
  const s = o.s ?? 1;
  c.save();
  c.translate(o.x ?? 0, o.y ?? 0);
  if (o.rot) c.rotate(o.rot);
  c.scale(s, s);
  fn(s);
  c.restore();
}

// soft moss/dirt blotches clipped to a shape
function grime(c, path, k, seed, box) {
  if (k <= 0.02) return;
  clipped(c, path, () => {
    const r = RNG(seed);
    c.globalAlpha = clamp(k) * 0.55;
    for (let i = 0; i < 6; i++) {
      const x = box[0] + r() * box[2], y = box[1] + box[3] * (0.4 + 0.6 * r());
      c.fillStyle = rad(c, x, y, 12 + 26 * r(), [[0, '#3d3424'], [1, 'rgba(61,52,36,0)']]);
      c.fillRect(x - 40, y - 40, 80, 80);
    }
    c.globalAlpha = 1;
  });
}
function mossCap(c, x0, x1, y, k, seed) {
  if (k <= 0.05) return;
  const r = RNG(seed), p = P();
  const n = Math.max(3, Math.round((x1 - x0) / 9));
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, (i + r()) / n), rr = (3 + 6 * r()) * k;
    p.moveTo(x + rr, y); p.arc(x, y, rr, 0, Math.PI, true);
  }
  fill(c, p, MOSS[seed % 3]);
}

// ------------------------------------------------------------------ plush teddy ---
export function drawPlush(c, o) {
  const age = clamp(o.age ?? 0), sq = clamp(o.squash ?? 0), look = o.look ?? 0;
  place(c, o, (s) => {
    const fur = mix(mix('#c9955a', '#9c8566', age * 0.8), '#6f6a4a', age * 0.25);
    const furD = tone(fur, -0.22), furL = tone(fur, 0.22), line = tone(fur, -0.62), muz = mix('#ecd2a6', '#a89a7c', age * 0.8);
    const lw = inkW(s) / s * 0.9;
    c.scale(1 + 0.2 * sq, 1 - 0.28 * sq);
    shadow(c, 0, 0, 34, 6, 0.28);
    const hx = look * 4, hy = -44;
    const body = blob([[-22, -2], [-25, -22], [-16, -36], [0, -38], [16, -36], [25, -22], [22, -2], [0, 2]]);
    const legL = oval(-15, -6, 12, 9, -0.2), legR = oval(15, -6, 12, 9, 0.2);
    const armL = oval(-24, -22, 8, 13, 0.35), armR = oval(24, -22, 8, 13, -0.35);
    const head = oval(hx, hy, 21, 19), earL = circle(hx - 16, hy - 15, 8), earR = circle(hx + 16, hy - 15, 8);
    const sil = union(body, legL, legR, armL, armR, head, earL, earR);
    c.lineJoin = 'round';
    ink(c, sil, lin(c, 0, -64, 0, 4, [[0, furL], [0.45, fur], [1, furD]]), line, lw * 2);
    fill(c, oval(-15, -5, 7, 5.5, -0.2), muz); fill(c, oval(15, -5, 7, 5.5, 0.2), muz);
    fill(c, circle(hx - 16, hy - 15, 4.2), muz); fill(c, circle(hx + 16, hy - 15, 4.2), muz);
    fill(c, oval(0, -18, 11, 12), alpha(muz, 0.85));
    fill(c, oval(hx + look * 2, hy + 6, 9, 7), muz);
    fill(c, oval(hx + look * 2, hy + 2.5, 3.6, 2.6), '#3a2416');
    fill(c, circle(hx - 7 + look * 3, hy - 4, 2.8), '#1d140e'); fill(c, circle(hx + 7 + look * 3, hy - 4, 2.8), '#1d140e');
    fill(c, circle(hx - 7.8 + look * 3, hy - 5, 0.9), alpha('#ffffff', 0.8 * (1 - age))); fill(c, circle(hx + 6.2 + look * 3, hy - 5, 0.9), alpha('#ffffff', 0.8 * (1 - age)));
    c.strokeStyle = '#3a2416'; c.lineWidth = lw * 0.9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(hx + look * 2, hy + 5); c.lineTo(hx + look * 2, hy + 8); c.stroke();
    // rim light (upper left)
    c.save(); c.clip(sil); c.strokeStyle = alpha('#fff3d6', 0.5 * (1 - age * 0.7)); c.lineWidth = lw * 2.4;
    c.beginPath(); c.arc(hx, hy, 20, Math.PI * 1.05, Math.PI * 1.55); c.stroke(); c.restore();
    // ribbon
    const rib = mix('#3f7fd0', '#5d7180', age * 0.85), ribL = tone(rib, -0.5);
    ink(c, union(blob([[0, -30], [-14, -38], [-15, -26]]), blob([[0, -30], [14, -38], [15, -26]])), rib, ribL, lw * 1.4);
    ink(c, circle(0, -30, 3.6), tone(rib, 0.15), ribL, lw);
    // torn seam with stuffing
    if (age > 0.55) {
      const k = ss(0.55, 0.9, age);
      fill(c, blob([[10, -20], [18, -27 - 3 * k], [23, -18], [16, -13]]), alpha('#e9e4d6', k));
      c.strokeStyle = alpha(line, k); c.lineWidth = lw; c.beginPath(); c.moveTo(9, -14); c.lineTo(22, -26); c.stroke();
    }
    grime(c, sil, age, 41, [-30, -64, 60, 66]);
    if (age > 0.4) { c.save(); c.clip(sil); mossCap(c, -26, 26, 2, ss(0.4, 1, age) * 1.6, 2); c.restore(); }
  });
}

// ------------------------------------------------------------------------ photo ---
const PW = 150, PH = 112;
export function drawPhoto(c, o) {
  const age = clamp(o.age ?? 0), frame = o.frame ?? true, t = o.t ?? 0;
  place(c, o, (s) => {
    const lw = inkW(s) / s;
    c.translate(0, -PH / 2 - (frame ? 10 : 0));
    if (frame) {
      const fc = mix('#8a5a34', '#5a5040', age * 0.7);
      shadow(c, 0, PH / 2 + 12, 80, 8, 0.25);
      ink(c, rrect(-PW / 2 - 10, -PH / 2 - 10, PW + 20, PH + 20, 5), lin(c, 0, -70, 0, 70, [[0, tone(fc, 0.18)], [1, tone(fc, -0.15)]]), tone(fc, -0.6), lw * 1.8);
      fill(c, rrect(-PW / 2 - 3, -PH / 2 - 3, PW + 6, PH + 6, 2), tone(fc, -0.35));
    }
    const pr = rrect(-PW / 2, -PH / 2, PW, PH, 1);
    clipped(c, pr, () => {
      // the photograph: the boy hugging MAX in the park
      c.fillStyle = lin(c, 0, -PH / 2, 0, PH / 2, [[0, '#8fc6ee'], [0.55, '#cfe7f5'], [0.56, '#7dbb5a'], [1, '#4e8f3e']]);
      c.fillRect(-PW / 2, -PH / 2, PW, PH);
      fill(c, oval(-52, -4, 26, 20), '#5f9e4a'); fill(c, oval(58, -8, 30, 24), '#558f43');
      drawDog(c, { x: 18, y: 62, s: 0.42, flip: -1, t: 1.3, pose: 'sit', mood: 'happy', shadow: false });
      // boy (simple shapes, matching the human style: red hoodie, brown hair)
      const sk = '#f2c8a2';
      fill(c, blob([[-46, 60], [-50, 20], [-38, 2], [-14, 4], [-4, 22], [-2, 60]]), '#d8473d');
      fill(c, blob([[-14, 10], [6, 6], [18, 14], [16, 22], [-6, 20]]), '#d8473d');
      fill(c, oval(15, 17, 6, 5), sk);
      fill(c, circle(-27, -12, 15), sk);
      fill(c, blob([[-43, -14], [-40, -28], [-27, -32], [-12, -24], [-14, -16], [-26, -22], [-38, -12]]), '#6b4226');
      fill(c, circle(-21, -12, 1.8), '#2a1c14');
      c.strokeStyle = '#a0564a'; c.lineWidth = 1.4; c.beginPath(); c.arc(-21, -6, 4, 0.2, 2.2); c.stroke();
      // ageing: desaturate, sepia, stains, fading
      if (age > 0) {
        c.globalCompositeOperation = 'saturation'; c.globalAlpha = clamp(age * 1.2);
        c.fillStyle = '#808080'; c.fillRect(-PW / 2, -PH / 2, PW, PH);
        c.globalCompositeOperation = 'multiply'; c.globalAlpha = age * 0.85;
        c.fillStyle = '#e2c08a'; c.fillRect(-PW / 2, -PH / 2, PW, PH);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = age * 0.35;
        c.fillStyle = '#efe2c4'; c.fillRect(-PW / 2, -PH / 2, PW, PH);
        c.globalAlpha = 1;
        const r = RNG(77);
        for (let i = 0; i < 5; i++) {
          const x = -PW / 2 + r() * PW, y = -PH / 2 + r() * PH, rr = 10 + 22 * r();
          c.fillStyle = rad(c, x, y, rr, [[0, alpha('#7a5a30', 0.45 * age)], [0.7, alpha('#7a5a30', 0.2 * age)], [1, alpha('#7a5a30', 0)]]);
          c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
        c.fillStyle = rad(c, 0, 0, PW * 0.75, [[0.5, 'rgba(90,60,30,0)'], [1, alpha('#5a3c1e', 0.55 * age)]]);
        c.fillRect(-PW / 2, -PH / 2, PW, PH);
      }
      // glass: a soft sheen, cracks when old
      c.globalAlpha = 1;
      c.fillStyle = lin(c, -PW / 2, -PH / 2, PW / 2, PH / 2, [[0, 'rgba(255,255,255,0.18)'], [0.35, 'rgba(255,255,255,0)'], [0.6, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]);
      c.fillRect(-PW / 2, -PH / 2, PW, PH);
      if (age > 0.3) {
        const k = ss(0.3, 0.8, age), r = RNG(5);
        c.strokeStyle = alpha('#ffffff', 0.55 * k); c.lineWidth = 1.1;
        const cx = 30, cy = -18;
        for (let i = 0; i < 6; i++) {
          let a = (i / 6) * TAU + r() * 0.5, x = cx, y = cy;
          c.beginPath(); c.moveTo(x, y);
          for (let j = 0; j < 4; j++) { a += r.range(-0.5, 0.5); x += Math.cos(a) * 22 * k; y += Math.sin(a) * 22 * k; c.lineTo(x, y); }
          c.stroke();
        }
      }
    });
    if (!frame) c.strokeStyle = alpha('#3b2a1c', 0.6), c.lineWidth = lw, c.stroke(pr);
  });
}

// ----------------------------------------------------------------------- collar ---
export function drawCollar(c, o) {
  const age = clamp(o.age ?? 0);
  place(c, o, (s) => {
    const lw = inkW(s) / s, red = mix('#d23a2e', '#6e4a3c', age * 0.85), line = tone(red, -0.6);
    shadow(c, 0, 0, 52, 7, 0.3);
    const ring = P();
    ring.ellipse(0, -12, 46, 13, 0, 0, TAU); ring.ellipse(0, -12, 37, 7, 0, 0, TAU);
    c.save(); c.fillStyle = lin(c, 0, -26, 0, 2, [[0, tone(red, 0.2)], [1, tone(red, -0.25)]]); c.fill(ring, 'evenodd');
    c.strokeStyle = line; c.lineWidth = lw * 1.6; c.stroke(ring); c.restore();
    // buckle
    const met = mix('#c9ccd2', '#7a7262', age);
    ink(c, rrect(-58, -20, 16, 16, 3), 'rgba(0,0,0,0)', tone(met, -0.4), lw * 2.4);
    c.strokeStyle = met; c.lineWidth = lw * 1.4; c.stroke(rrect(-58, -20, 16, 16, 3));
    // bone tag
    const gold = mix('#f2c14e', '#8a8a5a', age), gl = tone(gold, -0.55);
    const bone = union(rrect(-12, 2, 24, 10, 3), circle(-12, 4, 5), circle(-12, 10, 5), circle(12, 4, 5), circle(12, 10, 5));
    c.save(); c.translate(6, 0); c.rotate(0.12);
    ink(c, bone, lin(c, 0, 0, 0, 16, [[0, tone(gold, 0.3)], [1, tone(gold, -0.1)]]), gl, lw * 1.3);
    txt(c, 'MAX', 0, 7.5, { size: 8.5, weight: 800, color: tone(gold, -0.6), track: 0.5 });
    if (age > 0.4) { c.globalAlpha = ss(0.4, 1, age) * 0.7; fill(c, bone, '#5f8a62'); c.globalAlpha = 1; }
    c.restore();
    c.strokeStyle = gl; c.lineWidth = lw; c.beginPath(); c.arc(0, 1, 4, 0, TAU); c.stroke();
    grime(c, ring, age, 9, [-48, -26, 96, 28]);
    if (age > 0.5) mossCap(c, -30, 40, -2, ss(0.5, 1, age) * 1.4, 1);
  });
}

// ------------------------------------------------------------------------- bowl ---
export function drawBowl(c, o) {
  const age = clamp(o.age ?? 0), name = o.name ?? 'MAX';
  place(c, o, (s) => {
    const lw = inkW(s) / s, cer = mix('#f4ead6', '#a49a80', age * 0.8), line = tone(cer, -0.62);
    shadow(c, 0, 0, 58, 8, 0.3);
    const outer = blob([[-48, -30, 1], [48, -30, 1], [40, -4], [32, 0, 1], [-32, 0, 1], [-40, -4]]);
    ink(c, outer, lin(c, 0, -34, 0, 0, [[0, tone(cer, 0.15)], [0.7, cer], [1, tone(cer, -0.2)]]), line, lw * 1.6);
    const band = mix('#3f73c0', '#6a7680', age * 0.8);
    clipped(c, outer, () => { fill(c, rrect(-60, -12, 120, 7, 0), band); });
    txt(c, name, 0, -20, { size: 15, weight: 800, color: band, track: 2, font: 'Barlow Condensed' });
    ink(c, oval(0, -30, 48, 6), lin(c, 0, -36, 0, -24, [[0, tone(cer, -0.35)], [1, tone(cer, -0.1)]]), line, lw * 1.3);
    if (o.food) fill(c, oval(0, -31, 40, 4), '#9a6a3a');
    if (age > 0.25) {
      const k = ss(0.25, 0.7, age);
      c.strokeStyle = alpha(line, k); c.lineWidth = lw * 1.1; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(18, -30); c.lineTo(14, -20); c.lineTo(20, -12); c.lineTo(16, -2); c.stroke();
      c.beginPath(); c.moveTo(-30, -29); c.lineTo(-27, -22); c.lineTo(-33, -15); c.stroke();
      fill(c, poly([[30, -36], [40, -33], [35, -27]]), alpha('#5a5040', k));
    }
    grime(c, outer, age, 13, [-48, -32, 96, 34]);
    if (age > 0.45) mossCap(c, -40, 40, 0, ss(0.45, 1, age) * 1.5, 0);
    if ((o.sapling ?? 0) > 0) tree(c, 4, -32, { kind: 'sapling', h: 90, grow: clamp(o.sapling), seed: 6, t: o.t ?? 0, shadow: 0 });
  });
}

// ----------------------------------------------------------------------- feeder ---
export function drawFeeder(c, o) {
  const led = clamp(o.led ?? 0), age = clamp(o.age ?? 0);
  let ledPt = [0, 0];
  place(c, o, (s) => {
    const lw = inkW(s) / s, body = mix('#eef0f2', '#a6a49a', age * 0.8), line = '#3a4250';
    shadow(c, 0, 0, 50, 7, 0.3);
    ink(c, rrect(-42, -60, 84, 60, 10), lin(c, 0, -60, 0, 0, [[0, tone(body, 0.05)], [1, tone(body, -0.18)]]), line, lw * 1.5);
    ink(c, rrect(-30, -128, 60, 72, 8), 'rgba(205,228,240,0.55)', line, lw * 1.3);
    clipped(c, rrect(-30, -128, 60, 72, 8), () => {
      fill(c, rrect(-30, -96 + 20 * age, 60, 60, 0), '#b07a45');
      const r = RNG(3);
      for (let i = 0; i < 26; i++) fill(c, circle(-26 + r() * 52, -92 + 20 * age + r() * 30, 3.5), i % 2 ? '#8a5a2e' : '#c48d55');
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-24, -124, 8, 64);
    });
    ink(c, rrect(-34, -134, 68, 12, 5), tone(body, -0.05), line, lw * 1.3);
    fill(c, rrect(-26, -16, 52, 14, 5), tone(body, -0.35));
    fill(c, rrect(-24, -50, 34, 16, 3), '#20262e');
    fill(c, rrect(-22, -48, 30, 12, 2), led > 0.05 ? alpha('#7fe0a0', 0.25 + 0.4 * led) : '#262e36');
    fill(c, circle(26, -42, 5), '#1c2128');
    fill(c, circle(26, -42, 3.6), mix('#24402c', '#7dff9e', led));
    if (led > 0.05) fill(c, circle(25, -43, 1.3), alpha('#ffffff', led));
    ledPt = [26, -42];
  });
  const s = o.s ?? 1;
  return [(o.x ?? 0) + ledPt[0] * s, (o.y ?? 0) + ledPt[1] * s];
}

// ------------------------------------------------------------------ perch stand ---
export function drawPerchStand(c, o) {
  const age = clamp(o.age ?? 0), s = o.s ?? 1;
  place(c, o, () => {
    const lw = inkW(s) / s, wood = mix('#a7764a', '#6d6656', age * 0.7), line = tone(wood, -0.6);
    shadow(c, 0, 0, 80, 9, 0.3);
    ink(c, union(rrect(-74, -14, 148, 14, 6), rrect(-7, -330, 14, 320, 6)), lin(c, -10, 0, 10, 0, [[0, tone(wood, 0.2)], [1, tone(wood, -0.15)]]), line, lw * 1.5);
    ink(c, rrect(-66, -346, 132, 14, 7), lin(c, 0, -346, 0, -332, [[0, tone(wood, 0.25)], [1, tone(wood, -0.1)]]), line, lw * 1.5);
    ink(c, blob([[44, -352, 1], [70, -352, 1], [67, -334], [47, -334]]), mix('#f3f0e8', '#9a9480', age), '#4a4640', lw * 1.2);
    fill(c, oval(57, -352, 12, 3), '#c9a14a');
    if (age > 0.4) mossCap(c, -70, 70, -14, ss(0.4, 1, age) * 1.6, 2);
  });
  return [(o.x ?? 0), (o.y ?? 0) - 346 * s];
}

// ---------------------------------------------------------------------- dog bed ---
export function drawDogBed(c, o) {
  const age = clamp(o.age ?? 0), s = o.s ?? 1, flat = 1 - 0.35 * ss(0.3, 1, age);
  place(c, o, () => {
    const lw = inkW(s) / s, red = mix('#c8423a', '#7a5a4c', age * 0.85), line = tone(red, -0.62);
    shadow(c, 0, 0, 150, 12, 0.32);
    const h = 74 * flat;
    const outer = blob([[-135, -4], [-138, -h * 0.75], [-118, -h], [118, -h], [138, -h * 0.75], [135, -4], [0, 2]]);
    ink(c, outer, red, line, lw * 1.6);
    clipped(c, outer, () => {
      c.globalAlpha = 0.28;
      for (let i = -150; i < 150; i += 28) { fill(c, rrect(i, -100, 9, 110, 0), '#1f2a44'); }
      for (let j = -h; j < 0; j += 20) { fill(c, rrect(-150, j, 300, 6, 0), '#f1e0c4'); }
      c.globalAlpha = 1;
      c.fillStyle = lin(c, 0, -h, 0, 0, [[0, 'rgba(255,240,220,0.25)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(40,10,10,0.35)']]);
      c.fillRect(-150, -h - 10, 300, h + 14);
    });
    const cush = blob([[-110, -h * 0.72], [0, -h * 0.9], [110, -h * 0.72], [96, -h * 0.55], [0, -h * 0.6], [-96, -h * 0.55]]);
    ink(c, cush, mix('#e9d8bc', '#8a8070', age * 0.8), tone(red, -0.5), lw * 1.2);
    if (age > 0.5) {
      const k = ss(0.5, 0.9, age);
      fill(c, blob([[60, -h * 0.9], [80, -h * 1.05 - 6 * k], [96, -h * 0.85], [76, -h * 0.72]]), alpha('#ebe6d8', k));
    }
    grime(c, outer, age, 23, [-138, -h, 276, h]);
    if (age > 0.35) mossCap(c, -130, 130, -2, ss(0.35, 1, age) * 2, 1);
  });
  return [(o.x ?? 0), (o.y ?? 0) - 74 * flat * 0.62 * s];
}

// ------------------------------------------------------------------------- ball ---
export function drawBall(c, o) {
  const age = clamp(o.age ?? 0);
  place(c, o, (s) => {
    const lw = inkW(s) / s, col = mix('#d8e84a', '#8a8a6a', age * 0.9);
    shadow(c, 0, 0, 15, 3.5, 0.32);
    c.save(); c.translate(0, -14); c.rotate(o.spin ?? 0);
    const b = circle(0, 0, 14);
    ink(c, b, rad(c, -5, -5, 20, [[0, tone(col, 0.35)], [0.6, col], [1, tone(col, -0.25)]]), tone(col, -0.6), lw * 1.3);
    c.strokeStyle = alpha('#ffffff', 0.85 - 0.5 * age); c.lineWidth = lw * 1.2;
    c.beginPath(); c.arc(-14, 0, 11, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(14, 0, 11, Math.PI - 0.9, Math.PI + 0.9); c.stroke();
    grime(c, b, age, 3, [-14, -14, 28, 28]);
    c.restore();
  });
}

// ------------------------------------------------------------------------- cage ---
export function drawCage(c, o) {
  const age = clamp(o.age ?? 0), open = clamp(o.open ?? 0), fern = clamp(o.fern ?? 0);
  place(c, o, (s) => {
    const lw = inkW(s) / s, wire = mix('#c9ced6', '#8a4a26', age), wl = tone(wire, -0.55);
    const tray = mix('#3a8fd0', '#6a5a48', age * 0.9);
    shadow(c, 0, 0, 96, 9, 0.3);
    if (fern > 0) tree(c, -20, -18, { kind: 'sapling', h: 150 * fern, grow: fern, seed: 12, t: o.t ?? 0, shadow: 0 });
    c.strokeStyle = wl; c.lineWidth = lw * 2.2;
    const top = -124;
    c.beginPath();
    for (let x = -80; x <= 80; x += 14) { c.moveTo(x, -22); c.lineTo(x, top + (Math.abs(x) > 60 ? 6 : 0)); }
    c.stroke();
    c.strokeStyle = wire; c.lineWidth = lw * 1.1; c.stroke();
    c.beginPath(); c.moveTo(-82, top + 8); c.quadraticCurveTo(0, top - 14, 82, top + 8); c.strokeStyle = wl; c.lineWidth = lw * 2.4; c.stroke();
    c.strokeStyle = wire; c.lineWidth = lw * 1.3; c.stroke();
    ink(c, rrect(-90, -26, 180, 26, 6), lin(c, 0, -26, 0, 0, [[0, tone(tray, 0.15)], [1, tone(tray, -0.2)]]), tone(tray, -0.6), lw * 1.5);
    // door (front panel) swings open around its left hinge
    c.save(); c.translate(-30, -26);
    c.transform(Math.cos(open * 1.2), 0, 0, 1, 0, 0);
    c.strokeStyle = wl; c.lineWidth = lw * 2.3; c.strokeRect(0, -64, 58, 62);
    c.beginPath(); for (let x = 12; x < 58; x += 12) { c.moveTo(x, -64); c.lineTo(x, -2); } c.stroke();
    c.restore();
    if (fern > 0) {
      const r = RNG(4);
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.45, L = (50 + 30 * r()) * fern;
        c.strokeStyle = LEAF.mid; c.lineWidth = 2.5; c.beginPath(); c.moveTo(20, -26); c.quadraticCurveTo(20 + Math.cos(a) * L * 0.5, -26 + Math.sin(a) * L * 0.7, 20 + Math.cos(a) * L, -26 + Math.sin(a) * L); c.stroke();
        for (let j = 1; j < 7; j++) {
          const u = j / 7, px = 20 + Math.cos(a) * L * u, py = -26 + Math.sin(a) * L * u;
          fill(c, oval(px + 6, py, 7 * (1 - u * 0.6), 2.6, a + 0.6), LEAF.light); fill(c, oval(px - 6, py, 7 * (1 - u * 0.6), 2.6, a - 0.6), LEAF.mid);
        }
      }
    }
    if (age > 0.45) mossCap(c, -88, 88, -1, ss(0.45, 1, age) * 1.8, 2);
  });
}
