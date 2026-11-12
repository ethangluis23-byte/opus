// Hero props. Flat vector, dark tinted outline, top-light gradients, rim light, soft contact shadow.
// Every prop: (x, y) = ground / contact point (bottom centre), s = scale, rot = radians about that point, flip = +-1,
// shadow = contact-shadow strength (0 disables; set 0 when the prop is carried or airborne). Unknown options are ignored.
// age: 0 = new on day 0 .. 1 = after 100-200 years (faded, dirty, mossy, damaged); interpolates continuously.
//
// drawPlush(c, {x, y, s, rot, age, squash, leaves})   THE teddy. ~60 units tall, ~50 wide, sitting, facing the camera.
//     squash -1..1 (+ = squeezed flat/wide, - = stretched), leaves 0..1 dead leaves gathering on it (6 leaves, one by one).
//     age 1: grey-brown, right button eye hanging on a thread, open seam with stuffing, dusty, bow faded.
// drawCollar(c, {x, y, s, rot, age})                  red collar in a loop on the ground, ~76 wide, gold tag. age: cracks, tarnish, moss.
// drawPhoto(c, {x, y, s, rot, age, glint, flat})      framed photo 120 x 90 (boy hugging the retriever), origin = bottom centre.
//     glint 0..1 sweeps a light reflection left -> right; flat 0..1 foreshortens it as if lying on the floor.
// drawBowl(c, {x, y, s, label, food, water, age, crack, color})   side view, ~88 wide, 32 tall. label e.g. 'MAX', food/water 0..1 fill,
//     crack 0..1 (defaults from age), color = body colour (default blue).
// drawBall(c, {x, y, r, rot, age})                    tennis ball; (x, y) = point under the ball, r radius (default 11), rot rolls it.
// drawDogBed(c, {x, y, s, age, color})                round cushion bed ~190 wide, ~56 tall (age 1: collapsed, mouldy, leaves).
//     DOGBED_SEAT_Y = -30 : y (in bed units) where a lying dog's ground line should sit.
// drawFeeder(c, {x, y, s, led, age, food})            automatic feeder ~80 wide, 110 tall, tray to the right. led 0..1, food 0..1 hopper fill.
// feederGlow(c, {x, y, s, led, flip})                 LED bloom, draw AFTER the grade. feederLed({x, y, s, flip}) -> [x, y] screen point.
// drawKibbleBag(c, {x, y, s, torn, age})              sack lying on its side ~180 wide, 66 tall; torn 0..1 opens the right end and spills kibble.
// drawLeash(c, ax, ay, bx, by, {slack, color, w, ground, loop, clip})   absolute coords, hand (a) -> collar (b). slack 0..1 sag;
//     ground = y of the floor (the leash never sinks below it and lies in lazy waves on it); loop 0..1 handle loop at a; clip at b.
// drawCarrot(c, {x, y, s, rot, bite})                 ~56 long lying carrot with greens on the left; bite 0..1 eats it from the tip.
// drawSeed(c, {x, y, s, rot, color})                  sunflower seed ~10 long ((x, y) = its centre).
// drawCup(c, {x, y, s, rot, spill})                   takeaway cup ~40 tall; spill 0..1 tips it over to the right, puddle spreads.
// drawBin(c, {x, y, s, tip, age})                     metal dustbin ~64 wide, 96 tall; tip 0..1 falls to the right, lid and litter spill.
// drawBench(c, {x, y, s, age})                        park bench ~260 wide, 104 tall. BENCH_SEAT_Y = -48 (sit height).
// drawCageRelic(c, {x, y, s})                         rusted small-pet cage ~160 wide, 104 tall, door hanging open.
// drawTV(c, {x, y, s, on, age, t, noise})             flat screen on a low stand ~250 wide, 182 tall. on 0..1 picture, noise 0..1 static.
// tvGlow(c, {x, y, s, on, t})                         screen bloom, draw AFTER the grade.
import { blob, capsule, circle, oval, rrect, rect, poly, union, fill, line, clipped, lin, rad, shadow, glow, txt } from '../engine/draw.js';
import { TAU, DEG, clamp, lerp, ss, mix, tone, alpha, rgb, css, hash, noise1, RNG } from '../engine/util.js';
import { inkW } from '../chars/rig.js';
import { LEAF } from '../env/nature.js';

export const DOGBED_SEAT_Y = -30;
export const BENCH_SEAT_Y = -48;
const DUST = '#958c7c', RUST = '#8a4f2c';
const DEAD = ['#b9843a', '#a8622c', '#c9a04a', '#8a5a2e', '#b9a45a'];
const num = (v, d) => (Number.isFinite(v) ? v : d);

// Colour after `age`: desaturated, pulled toward dusty grey-brown.
function aged(col, age, k = 1) {
  const a = clamp(age * k);
  if (a <= 0) return col;
  const v = rgb(col), l = 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2], g = rgb(DUST), d = 0.6 * a, m = 0.36 * a;
  return css([lerp(lerp(v[0], l, d), g[0], m), lerp(lerp(v[1], l, d), g[1], m), lerp(lerp(v[2], l, d), g[2], m)]);
}
// Common placement. Returns outline width in prop units.
function open(c, o, shRx = 0, shRy = 6, shDx = 0) {
  const s = num(o.s, 1), x = num(o.x, 0), y = num(o.y, 0), a = o.shadow ?? 0.28;
  if (shRx > 0 && a > 0) shadow(c, x + shDx * s * (o.flip ?? 1), y + 1 * s, shRx * s, Math.max(shRy * s, 1), a);
  c.save();
  c.translate(x, y); c.rotate(num(o.rot, 0)); c.scale(s * (o.flip === -1 ? -1 : 1), s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  return inkW(s) * 0.86;
}
// Rim light along top-left edges + soft form shadow at the bottom of a silhouette.
function shade(c, sil, lw, light, dark, y0, y1, a = 0.34) {
  clipped(c, sil, () => {
    c.fillStyle = lin(c, 0, y0, 0, y1, [[0, alpha(dark, 0)], [1, alpha(dark, 0.5)]]);
    c.fillRect(-400, y0, 800, y1 - y0 + 4);
    c.save(); c.translate(1.2, 2.6); c.globalAlpha *= a; line(c, sil, light, lw * 2.3); c.restore();
  });
}
function leaf(c, x, y, r, rot, col, lw = 1) {
  if (r <= 0.05) return;
  c.save(); c.translate(x, y); c.rotate(rot);
  const p = blob([[-r, 0, 1], [-r * 0.25, -r * 0.46], [r, 0, 1], [-r * 0.25, r * 0.46]]);
  fill(c, p, col); line(c, p, tone(col, -0.5), lw * 0.7);
  c.strokeStyle = tone(col, -0.35); c.lineWidth = lw * 0.6; c.beginPath(); c.moveTo(-r * 0.9, 0); c.lineTo(r * 0.8, 0); c.stroke();
  c.restore();
}
// Moss cushions: list of [x, y, r]; k scales them in.
function mossAt(c, list, k) {
  if (k <= 0.02) return;
  for (const [x, y, r] of list) {
    const q = r * k;
    c.fillStyle = LEAF.dark; c.beginPath(); c.ellipse(x, y, q, q * 0.62, 0, 0, TAU); c.fill();
    c.fillStyle = LEAF.mid; c.beginPath(); c.ellipse(x - q * 0.15, y - q * 0.16, q * 0.68, q * 0.4, 0, 0, TAU); c.fill();
    c.fillStyle = alpha(LEAF.lime, 0.7); c.beginPath(); c.ellipse(x - q * 0.3, y - q * 0.26, q * 0.3, q * 0.16, 0, 0, TAU); c.fill();
  }
}
function crackLine(c, pts, k, col, w) {
  if (k <= 0.02) return;
  const n = pts.length - 1, f = k * n;
  c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= n; i++) {
    const u = clamp(f - (i - 1));
    if (u <= 0) break;
    c.lineTo(lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u));
  }
  c.stroke();
}
const _cache = new Map();
const cached = (key, make) => { let v = _cache.get(key); if (!v) { v = make(); _cache.set(key, v); } return v; };

// ------------------------------------------------------------------ plush teddy
export function drawPlush(c, o = {}) {
  const age = clamp(num(o.age, 0)), sq = clamp(num(o.squash, 0), -1, 1), lv = clamp(num(o.leaves, 0));
  const lw = open(c, o, 30 * (1 + sq * 0.15), 5.5);
  c.scale(1 + sq * 0.2, 1 - sq * 0.22);
  const fur = aged('#b0733c', age), furL = aged('#d49a5c', age), furD = aged('#804c25', age), cream = aged('#f0d9ae', age, 0.9);
  const L = aged('#4a2812', age, 0.55), red = aged('#d9453c', age, 0.85), redD = aged('#8f241f', age, 0.7);
  const droop = age * 1.6;

  // ---- body: torso + arms + feet in one silhouette
  const footL = oval(-13.5, -7.2, 10.5, 8, -0.22), footR = oval(13.5, -7.2, 10.5, 8, 0.22);
  const armL = capsule(-13.5, -30, 6.2, -22.5, -17 + droop, 5.6), armR = capsule(13.5, -30, 6.2, 22.5, -17 + droop, 5.6);
  const torso = oval(0, -20.5, 17.5, 19);
  const body = union(torso, armL, armR, footL, footR);
  fill(c, body, lin(c, 0, -42, 0, 0, [[0, furL], [0.45, fur], [1, furD]]));
  clipped(c, body, () => {
    fill(c, oval(0, -17.5, 10.8, 12.5), cream);
    c.fillStyle = alpha(furD, 0.28); c.beginPath(); c.ellipse(0, -5.5, 15, 4.5, 0, 0, TAU); c.fill();
    fill(c, oval(-14.2, -6.4, 6, 4.8, -0.22), cream); fill(c, oval(14.2, -6.4, 6, 4.8, 0.22), cream);
  });
  shade(c, body, lw, furL, mix(furD, L, 0.35), -14, 0);
  c.globalAlpha = 0.55;
  line(c, footL, L, lw * 0.75); line(c, footR, L, lw * 0.75);
  c.strokeStyle = L; c.lineWidth = lw * 0.75;
  c.beginPath(); c.moveTo(-10.5, -33); c.quadraticCurveTo(-18.5, -27, -17.5, -15 + droop); c.stroke();
  c.beginPath(); c.moveTo(10.5, -33); c.quadraticCurveTo(18.5, -27, 17.5, -15 + droop); c.stroke();
  // belly seam stitches
  c.setLineDash([2.2, 2.2]); c.lineWidth = lw * 0.6; c.strokeStyle = alpha(furD, 0.9);
  c.beginPath(); c.moveTo(0, -29); c.lineTo(0, -7); c.stroke(); c.setLineDash([]);
  c.globalAlpha = 1;
  line(c, body, L, lw);

  // open seam + stuffing (age)
  const tear = ss(0.38, 0.9, age);
  if (tear > 0.02) {
    c.save(); c.translate(-12.5, -19); c.rotate(-0.35); c.scale(tear, tear);
    fill(c, oval(0, 0, 3.6, 7), mix(L, '#000000', 0.2));
    const puff = union(circle(-3.2, -1.5, 4.4), circle(-6.4, 1.8, 3.6), circle(-2.4, 3.2, 3.4), circle(-7.2, -2.6, 2.8));
    fill(c, puff, '#efe8d8'); clipped(c, puff, () => { c.fillStyle = alpha('#a79f8c', 0.45); c.fillRect(-12, 1.5, 16, 8); });
    line(c, puff, alpha(L, 0.75), lw * 0.7 / Math.max(tear, 0.3));
    c.restore();
  }

  // ---- head
  c.save();
  c.translate(0, -33); c.rotate(age * 0.11 + sq * 0.04);
  const earL = circle(-12.6, -23.2, 6.6), earR = circle(12.6, -23.2, 6.6), skull = oval(0, -12, 16.8, 14.6);
  const head = union(skull, earL, earR);
  fill(c, head, lin(c, 0, -30, 0, 3, [[0, furL], [0.5, fur], [1, mix(fur, furD, 0.7)]]));
  clipped(c, head, () => {
    fill(c, circle(-12.8, -22.6, 3.5), mix(cream, fur, 0.25)); fill(c, circle(12.8, -22.6, 3.5), mix(cream, fur, 0.25));
    fill(c, oval(0, -6.6, 9, 6.9), cream);
    c.fillStyle = alpha(furD, 0.22); c.beginPath(); c.ellipse(0, 3, 15, 4, 0, 0, TAU); c.fill();
  });
  shade(c, head, lw, furL, mix(furD, L, 0.3), -6, 3, 0.4);
  c.globalAlpha = 0.5; c.strokeStyle = L; c.lineWidth = lw * 0.7;
  c.beginPath(); c.arc(-12.6, -23.2, 6.6, 0.35, 1.9); c.stroke(); c.beginPath(); c.arc(12.6, -23.2, 6.6, 1.25, 2.8); c.stroke();
  c.setLineDash([2, 2.2]); c.strokeStyle = alpha(furD, 0.9); c.lineWidth = lw * 0.6;
  c.beginPath(); c.moveTo(0, -26.2); c.lineTo(0, -14); c.stroke(); c.setLineDash([]);
  c.globalAlpha = 1;
  line(c, head, L, lw);
  // nose + stitched smile
  const nose = blob([[-3.4, -11.2], [0, -12.2], [3.4, -11.2], [2, -8.6], [0, -7.8], [-2, -8.6]]);
  fill(c, nose, '#3a2318'); line(c, nose, L, lw * 0.6);
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(-0.9, -10.9, 1.3, 0.6, -0.2, 0, TAU); c.fill();
  c.strokeStyle = L; c.lineWidth = lw * 0.85;
  c.beginPath(); c.moveTo(0, -7.8); c.lineTo(0, -5.4);
  c.moveTo(-5.4, -5.6); c.quadraticCurveTo(-3, -2.2, 0, -5.2); c.quadraticCurveTo(3, -2.2, 5.4, -5.6); c.stroke();
  // button eyes (the right one comes loose with age)
  const hang = ss(0.42, 0.9, age);
  const button = (bx, by, r) => {
    const b = circle(bx, by, r);
    fill(c, b, rad(c, bx - r * 0.3, by - r * 0.35, r * 1.3, [[0, '#5b4334'], [0.55, '#2c1c14'], [1, '#170e0a']]));
    line(c, b, mix(L, '#000000', 0.3), lw * 0.6);
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = lw * 0.45; c.beginPath(); c.arc(bx, by, r * 0.62, 0, TAU); c.stroke();
    c.fillStyle = alpha(cream, 0.85); c.beginPath(); c.arc(bx - r * 0.24, by, r * 0.13, 0, TAU); c.arc(bx + r * 0.24, by, r * 0.13, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(bx - r * 0.38, by - r * 0.42, r * 0.24, 0, TAU); c.fill();
  };
  button(-6.9, -14.4, 3.3);
  if (hang > 0.02) {
    const hx = 6.9 + 1.6 * hang, hy = -14.4 + 9.5 * hang;
    c.strokeStyle = alpha(L, 0.8 * hang); c.lineWidth = lw * 0.6;
    c.beginPath(); c.moveTo(5.6, -15.6); c.lineTo(8.2, -13.2); c.moveTo(8.2, -15.6); c.lineTo(5.6, -13.2); c.stroke();
    c.strokeStyle = alpha('#e8dcc0', 0.9); c.lineWidth = lw * 0.5;
    c.beginPath(); c.moveTo(6.9, -14.4); c.quadraticCurveTo(6.9 + 2.6 * hang, -14.4 + 4 * hang, hx, hy - 2); c.stroke();
    c.save(); c.translate(hx, hy); c.rotate(0.5 * hang); c.scale(1, lerp(1, 0.82, hang)); button(0, 0, 3.3); c.restore();
  } else button(6.9, -14.4, 3.3);
  // brow stitches give it a gentle expression
  c.strokeStyle = alpha(L, 0.55); c.lineWidth = lw * 0.6;
  c.beginPath(); c.moveTo(-9.6, -19.4); c.lineTo(-5.2, -20); c.moveTo(9.6, -19.4); c.lineTo(5.2, -20); c.stroke();
  c.restore();

  // ---- bow
  const by = -33.4 + age * 1.4, sag = age * 2.4;
  const bow = union(
    blob([[0, by], [-10.5, by - 5.6 + sag * 0.5], [-12, by + 4.6 + sag], [-5, by + 2.4]]),
    blob([[0, by], [10.5, by - 5.6 + sag * 0.5], [12, by + 4.6 + sag], [5, by + 2.4]]),
    blob([[-1.6, by + 1.5], [-5.8, by + 9 + sag * 0.5], [-2.4, by + 9.6 + sag * 0.5], [0.6, by + 2.5]]),
    blob([[1.6, by + 1.5], [5.8, by + 9 + sag * 0.5], [2.4, by + 9.6 + sag * 0.5], [-0.6, by + 2.5]]),
  );
  fill(c, bow, lin(c, 0, by - 6, 0, by + 10, [[0, tone(red, 0.16)], [1, mix(red, redD, 0.6)]]));
  line(c, bow, redD, lw * 0.85);
  const knot = circle(0, by + 0.4, 3.1);
  fill(c, knot, red); line(c, knot, redD, lw * 0.8);
  c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.ellipse(-6, by - 1.6, 2.6, 1.1, -0.4, 0, TAU); c.fill();

  // ---- dust, grime (age)
  if (age > 0.02) {
    clipped(c, union(body, oval(0, -45, 17, 15), circle(-12.6, -56.2, 6.6), circle(12.6, -56.2, 6.6)), () => {
      c.fillStyle = lin(c, 0, -64, 0, -22, [[0, alpha('#cfc6b2', 0.42 * age)], [1, alpha('#cfc6b2', 0)]]);
      c.fillRect(-32, -66, 64, 46);
      c.fillStyle = alpha('#3d2f22', 0.17 * age);
      for (const [dx, dy, rx, ry] of [[-9, -9, 6, 3.4], [8, -26, 5, 3], [-5, -50, 5, 2.6], [15, -9, 5, 3], [3, -38, 4, 2]]) { c.beginPath(); c.ellipse(dx, dy, rx, ry, 0.3, 0, TAU); c.fill(); }
    });
  }
  // ---- dead leaves gathering on and around it
  if (lv > 0.01) {
    const spots = [[-25, -3, 7.5, 0.25], [20, -2.6, 7, -0.5], [-7, -59, 6.2, 0.7], [11, -30, 5.6, -0.9], [31, -2, 6, 0.15], [-15, -13, 5.8, 1.1]];
    spots.forEach(([lx, ly, r, a], i) => leaf(c, lx, ly, r * ss(0, 1, lv * 6 - i), a, DEAD[i % DEAD.length], lw));
  }
  c.restore();
}

// ------------------------------------------------------------------ collar
export function drawCollar(c, o = {}) {
  const age = clamp(num(o.age, 0));
  const lw = open(c, o, 44, 7);
  const red = aged('#d9453c', age, 0.9), redD = aged('#96281f', age, 0.9), L = aged('#5a1c14', age, 0.5);
  const gold = mix('#f6c544', '#7d8463', age * 0.85), goldL = mix('#ffe9a0', '#a7ab8c', age * 0.85), goldD = mix('#8a5a12', '#4c4a36', age * 0.8);
  // floppy loop seen from slightly above; back half = inside of the strap, front half = outside
  const loopPts = cached('collarLoop', () => {
    const pts = [];
    for (let i = 0; i <= 32; i++) { const a = (i / 32) * TAU; pts.push([Math.cos(a) * 36 + Math.sin(a * 2 + 0.6) * 2.4, -12.5 + Math.sin(a) * 9.5 + Math.cos(a * 3) * 0.9]); }
    return pts;
  });
  const back = blob(loopPts.slice(16), false), front = blob(loopPts.slice(0, 17), false), all = blob(loopPts.slice(0, 32));
  c.lineCap = 'butt';
  line(c, all, L, 7.6 + lw * 2, 'butt');
  line(c, back, mix(redD, L, 0.3), 7.6, 'butt');
  line(c, front, red, 7.6, 'butt');
  c.save(); c.translate(0, -2); line(c, front, alpha(tone(red, 0.3), 0.7), 1.6, 'butt'); c.restore();
  c.save(); c.translate(0, 2.4); line(c, front, alpha(redD, 0.7), 1.6, 'butt'); c.restore();
  // stitching + holes
  c.save(); c.setLineDash([2.4, 2.4]); line(c, front, alpha('#ffe2c8', lerp(0.55, 0.2, age)), 0.7, 'butt'); c.restore();
  c.fillStyle = L; for (const i of [3, 4, 5]) { const q = loopPts[i]; c.beginPath(); c.arc(q[0], q[1], 0.95, 0, TAU); c.fill(); }
  // cracked leather
  if (age > 0.05) {
    c.strokeStyle = alpha(L, 0.75 * age); c.lineWidth = 0.8;
    for (const i of [1, 6, 8, 10, 12, 14, 15]) { const q = loopPts[i], w = 3.2 * ss(0.05, 0.8, age); c.beginPath(); c.moveTo(q[0] - 0.8, q[1] - w); c.lineTo(q[0] + 0.6, q[1] - w * 0.2); c.lineTo(q[0] - 0.5, q[1] + w); c.stroke(); }
  }
  // buckle
  const bq = loopPts[13], buckle = rrect(bq[0] - 4.2, bq[1] - 5.6, 8.4, 11.2, 2);
  fill(c, buckle, lin(c, 0, bq[1] - 6, 0, bq[1] + 6, [[0, goldL], [0.5, gold], [1, goldD]])); line(c, buckle, L, lw * 0.8);
  line(c, rrect(bq[0] - 1.9, bq[1] - 3.2, 3.8, 6.4, 1), mix(redD, L, 0.4), 1.2);
  // tag on its ring, lying in front
  const tq = loopPts[7], tx = tq[0] + 3, ty = tq[1] + 6.4;
  c.strokeStyle = L; c.lineWidth = lw * 0.9 + 1.2; c.beginPath(); c.arc(tq[0] + 1.2, tq[1] + 2.2, 2.6, 0, TAU); c.stroke();
  c.strokeStyle = goldL; c.lineWidth = 1.2; c.beginPath(); c.arc(tq[0] + 1.2, tq[1] + 2.2, 2.6, 0, TAU); c.stroke();
  const tag = oval(tx, ty, 7.4, 5.6, 0.12);
  fill(c, tag, rad(c, tx - 2.4, ty - 2, 9, [[0, goldL], [0.55, gold], [1, goldD]]));
  clipped(c, tag, () => {
    c.strokeStyle = alpha(goldD, 0.55); c.lineWidth = 0.8; c.beginPath(); c.moveTo(tx - 3.4, ty - 0.6); c.lineTo(tx + 3.2, ty - 0.2); c.moveTo(tx - 2.4, ty + 1.8); c.lineTo(tx + 2.2, ty + 2.1); c.stroke();
    if (age > 0.05) { c.fillStyle = alpha('#3f6b55', 0.5 * age); c.beginPath(); c.ellipse(tx + 3, ty + 2.4, 4.4, 3, 0.4, 0, TAU); c.ellipse(tx - 4.4, ty - 2.5, 3, 2, 0, 0, TAU); c.fill(); }
    else { c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(tx - 2.6, ty - 2.4, 2.4, 1.1, -0.4, 0, TAU); c.fill(); }
  });
  line(c, tag, L, lw * 0.8);
  mossAt(c, [[-30, -6.5, 8], [-17, -3.4, 6], [24, -5, 7.5], [33, -10, 5], [-5, -21, 6]], ss(0.35, 1, age));
  c.restore();
}

// ------------------------------------------------------------------ framed photograph
export function drawPhoto(c, o = {}) {
  const age = clamp(num(o.age, 0)), gl = num(o.glint, -1), flat = clamp(num(o.flat, 0));
  const lw = open({ save() {}, translate() {}, rotate() {}, scale() {} }, o) && open(c, { ...o, shadow: (o.shadow ?? 0.28) * (1 - flat) }, 66, 6);
  if (flat > 0) { c.transform(1, 0, -0.42 * flat, lerp(1, 0.46, flat), 0, 0); }
  const v = rgb('#c2cbd0'), sep = rgb('#d8c9a8');
  // picture colours bleach toward pale sepia-blue
  const pc = (col) => {
    if (age <= 0) return col;
    const q = rgb(col), l = 0.299 * q[0] + 0.587 * q[1] + 0.114 * q[2], d = 0.78 * age, m = 0.5 * age, w = l > 150 ? sep : v;
    return css([lerp(lerp(q[0], l, d), w[0], m), lerp(lerp(q[1], l, d), w[1], m), lerp(lerp(q[2], l, d), w[2], m)]);
  };
  const wood = aged('#9a6234', age, 0.8), woodL = aged('#c58a4e', age, 0.8), woodD = aged('#6a3d1c', age, 0.8), L = aged('#3f2412', age, 0.5);
  const brk = ss(0.5, 1, age);
  const outer = poly([[-60, -90], [60 - 19 * brk, -90], [60 - 12 * brk, -90 + 7 * brk], [60 - 15 * brk, -90 + 12 * brk], [60 - 5 * brk, -90 + 13 * brk], [60, -90 + 20 * brk], [60, 0], [-60, 0]]);
  if (flat > 0.02) { c.save(); c.translate(3, 5); c.globalAlpha *= 0.3 * flat; fill(c, outer, '#000000'); c.restore(); }
  clipped(c, outer, () => {
    c.fillStyle = lin(c, -60, -90, 60, 0, [[0, woodL], [0.5, wood], [1, woodD]]); c.fillRect(-60, -90, 120, 90);
    // mitre joints + bevel
    c.strokeStyle = alpha(woodD, 0.8); c.lineWidth = 0.8; c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(60 * sx, -45 + 45 * sy); c.lineTo(51 * sx, -45 + 36 * sy); }
    c.stroke();
    c.strokeStyle = alpha(woodL, 0.8); c.lineWidth = 1.2; c.beginPath(); c.moveTo(-58.5, -1.5); c.lineTo(-58.5, -88.5); c.lineTo(58.5, -88.5); c.stroke();
    // mat
    c.fillStyle = aged('#f5eedd', age, 0.7); c.fillRect(-51, -81, 102, 72);
    // picture
    const pic = rect(-46, -76, 92, 62);
    clipped(c, pic, () => {
      c.fillStyle = lin(c, 0, -76, 0, -14, [[0, pc('#6fc0ee')], [0.62, pc('#c9ecf2')], [1, pc('#bfe6b0')]]); c.fillRect(-46, -76, 92, 62);
      c.fillStyle = rad(c, -30, -70, 30, [[0, alpha(pc('#fff6c8'), 0.9)], [1, alpha(pc('#fff6c8'), 0)]]); c.fillRect(-60, -100, 60, 60);
      fill(c, blob([[-50, -30], [-28, -37], [-4, -32], [22, -38], [50, -31], [50, -10], [-50, -10]]), pc('#6db455'));
      fill(c, circle(-36, -44, 9), pc('#4b9645')); fill(c, circle(39, -47, 8), pc('#58a34c'));
      const pl = alpha(pc('#4a2a14'), lerp(0.9, 0.5, age));
      // dog (right): chest, head, ears, muzzle
      const chest = blob([[2, -10], [3, -24], [12, -31], [27, -30], [36, -22], [38, -10]]);
      fill(c, chest, pc('#e09a36')); line(c, chest, pl, 0.9);
      fill(c, oval(19, -18, 8, 7), pc('#f8d68e'));
      const dEarL = blob([[5, -52], [-1, -46], [-1, -34], [4, -31], [8, -40]]), dEarR = blob([[31, -53], [38, -47], [38, -35], [33, -32], [29, -41]]);
      const dHead = oval(18, -43, 14.5, 13.5);
      fill(c, dEarL, pc('#c98529')); line(c, dEarL, pl, 0.9); fill(c, dEarR, pc('#c98529')); line(c, dEarR, pl, 0.9);
      fill(c, dHead, lin(c, 0, -57, 0, -29, [[0, pc('#f5c468')], [1, pc('#e39f3a')]])); line(c, dHead, pl, 0.9);
      fill(c, oval(18, -37.5, 8.6, 6.8), pc('#fbe5b4'));
      fill(c, oval(18, -41.4, 3.3, 2.3), pc('#33221a'));
      c.strokeStyle = pl; c.lineWidth = 0.9; c.beginPath(); c.moveTo(18, -39); c.lineTo(18, -36.4); c.moveTo(12.6, -36.8); c.quadraticCurveTo(18, -31.4, 23.4, -36.8); c.stroke();
      fill(c, blob([[15.4, -35], [20.6, -35], [20.4, -30.6], [18, -29.2], [15.6, -30.6]]), pc('#f58d9b'));
      c.fillStyle = pc('#2a1a12'); c.beginPath(); c.arc(12.4, -46, 2, 0, TAU); c.arc(23.6, -46, 2, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(11.8, -46.7, 0.7, 0, TAU); c.arc(23, -46.7, 0.7, 0, TAU); c.fill();
      c.strokeStyle = pc('#d9453c'); c.lineWidth = 3.2; c.beginPath(); c.moveTo(8, -30.4); c.quadraticCurveTo(18, -26.4, 29, -30.6); c.stroke();
      fill(c, circle(18.5, -26, 2.2), pc('#f6c544'));
      // boy (left): shirt, arm round the dog, head, hair, smile
      const shirt = blob([[-44, -10], [-42, -24], [-31, -31], [-14, -31], [-3, -25], [0, -10]]);
      fill(c, shirt, pc('#3f7fc4')); line(c, shirt, pl, 0.9);
      c.strokeStyle = pl; c.lineWidth = 8.6; c.beginPath(); c.moveTo(-8, -24); c.quadraticCurveTo(10, -17, 30, -24); c.stroke();
      c.strokeStyle = pc('#4d8ed2'); c.lineWidth = 7; c.beginPath(); c.moveTo(-8, -24); c.quadraticCurveTo(10, -17, 28, -23.4); c.stroke();
      const hand = circle(31.5, -24.6, 4); fill(c, hand, pc('#f4c9a2')); line(c, hand, pl, 0.9);
      fill(c, rect(-21, -34, 8, 6), pc('#e8b48a'));
      c.save(); c.translate(-17, -45); c.rotate(0.1);
      const bHead = oval(0, 0, 12.6, 13.2);
      fill(c, circle(-12, 1, 2.6), pc('#efbd94')); fill(c, circle(12, 1, 2.6), pc('#efbd94'));
      fill(c, bHead, pc('#f6cda6')); line(c, bHead, pl, 0.9);
      const hair = blob([[-13, -2], [-12.6, -10], [-5, -15.4], [5, -15], [12.6, -9], [13, -1.6], [8.6, -7], [0, -8.6], [-8, -6.4]]);
      fill(c, hair, pc('#6b4226')); line(c, hair, pl, 0.8);
      c.strokeStyle = pl; c.lineWidth = 1.1; c.beginPath();
      c.moveTo(-7.4, -0.6); c.quadraticCurveTo(-5, -3.4, -2.6, -0.6); c.moveTo(2.6, -0.6); c.quadraticCurveTo(5, -3.4, 7.4, -0.6); c.stroke();
      const grin = blob([[-6, 3.6, 1], [0, 5], [6, 3.6, 1], [3.4, 8.4], [-3.4, 8.4]]);
      fill(c, grin, pc('#ffffff')); line(c, grin, pl, 0.8);
      c.fillStyle = alpha(pc('#f08a8a'), 0.55); c.beginPath(); c.arc(-8.4, 4, 2.4, 0, TAU); c.arc(8.4, 4, 2.4, 0, TAU); c.fill();
      c.restore();
      // bleaching wash + vignette of the old print
      if (age > 0.02) {
        c.fillStyle = alpha('#e3d6b6', 0.2 * age); c.fillRect(-46, -76, 92, 62);
        c.fillStyle = rad(c, 0, -45, 62, [[0.5, 'rgba(120,100,70,0)'], [1, alpha('#6d5a3c', 0.3 * age)]]); c.fillRect(-46, -76, 92, 62);
      }
    });
    c.strokeStyle = alpha(L, 0.5); c.lineWidth = 0.8; c.strokeRect(-46, -76, 92, 62);
    // glass: soft standing reflection, moving glint, dust, cracks
    clipped(c, rect(-51, -81, 102, 72), () => {
      c.fillStyle = alpha('#ffffff', lerp(0.13, 0.05, age));
      c.beginPath(); c.moveTo(-51, -81); c.lineTo(-12, -81); c.lineTo(-51, -30); c.closePath(); c.fill();
      if (gl > -0.2 && gl < 1.2) {
        const gx = lerp(-80, 80, gl), ga = Math.sin(clamp(gl) * Math.PI) * 0.5 + 0.12;
        c.fillStyle = lin(c, gx - 22, 0, gx + 22, 0, [[0, 'rgba(255,255,255,0)'], [0.5, alpha('#ffffff', ga)], [1, 'rgba(255,255,255,0)']]);
        c.beginPath(); c.moveTo(gx - 4, -81); c.lineTo(gx + 40, -81); c.lineTo(gx + 4, -9); c.lineTo(gx - 40, -9); c.closePath(); c.fill();
      }
      if (age > 0.02) {
        c.fillStyle = lin(c, 0, -81, 0, -9, [[0, alpha('#cfc4a8', 0.1 * age)], [1, alpha('#b8ab8c', 0.5 * age)]]); c.fillRect(-51, -81, 102, 72);
        c.fillStyle = alpha('#8b7d62', 0.3 * age);
        for (let i = 0; i < 16; i++) { c.beginPath(); c.arc(-50 + hash(i, 4) * 100, -80 + hash(i, 9) * 70, 0.5 + hash(i, 2) * 1.1, 0, TAU); c.fill(); }
      }
      const ck = ss(0.4, 0.95, age);
      if (ck > 0.02) {
        const cx = 27, cy = -62;
        for (const [w, col] of [[1.5, alpha('#20303a', 0.5)], [0.6, 'rgba(255,255,255,0.85)']]) {
          crackLine(c, [[cx, cy], [10, -55], [-8, -58], [-30, -44], [-51, -40]], ck, col, w);
          crackLine(c, [[cx, cy], [33, -44], [26, -28], [34, -9]], ck, col, w);
          crackLine(c, [[cx, cy], [40, -70], [51, -72]], ck, col, w);
          crackLine(c, [[cx, cy], [20, -72], [22, -81]], ck, col, w);
          crackLine(c, [[10, -55], [6, -40], [-6, -30]], clamp(ck * 2 - 1), col, w);
          crackLine(c, [[33, -44], [44, -40], [51, -32]], clamp(ck * 2 - 1), col, w);
        }
        c.fillStyle = alpha('#ffffff', 0.16 * ck); c.beginPath(); c.moveTo(cx, cy); c.lineTo(10, -55); c.lineTo(6, -40); c.lineTo(33, -44); c.closePath(); c.fill();
      }
    });
    c.strokeStyle = alpha(L, 0.6); c.lineWidth = 0.9; c.strokeRect(-51, -81, 102, 72);
    c.fillStyle = lin(c, 0, -14, 0, 0, [[0, alpha(woodD, 0)], [1, alpha(mix(woodD, L, 0.4), 0.45)]]); c.fillRect(-60, -14, 120, 14);
  });
  line(c, outer, L, lw);
  if (brk > 0.02) { // the broken-off corner lies beside the frame
    c.save(); c.translate(70 + 4 * brk, -5); c.rotate(0.5); c.globalAlpha *= brk;
    const chip = poly([[-8, -6], [7, -5], [9, 1], [1, 6], [-6, 3]]);
    fill(c, chip, wood); line(c, chip, L, lw * 0.85); c.restore();
  }
  c.restore();
}

// ------------------------------------------------------------------ bowl
const _kib = (seed, n) => cached('kib' + seed + '_' + n, () => {
  const r = RNG(seed), a = [];
  for (let i = 0; i < n; i++) a.push([r(), r(), r.range(0.75, 1.2), r.int(0, 2), r.range(0, 3)]);
  return a;
});
const KIB = ['#a56a3a', '#c08a4e', '#855029'];
function kibble(c, x, y, r, k, rot = 0) {
  c.fillStyle = KIB[k % 3]; c.beginPath(); c.ellipse(x, y, r, r * 0.74, rot, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(70,38,16,0.75)'; c.lineWidth = 0.7; c.stroke();
  c.fillStyle = 'rgba(255,228,180,0.35)'; c.beginPath(); c.ellipse(x - r * 0.25, y - r * 0.28, r * 0.4, r * 0.22, rot, 0, TAU); c.fill();
}
export function drawBowl(c, o = {}) {
  const age = clamp(num(o.age, 0)), food = clamp(num(o.food, 0)), water = clamp(num(o.water, 0));
  const crack = clamp(num(o.crack, ss(0.5, 1, age)));
  const lw = open(c, o, 54, 6);
  const base = o.color || '#4a8fd0';
  const col = aged(base, age, 0.85), colL = aged(tone(base, 0.32), age, 0.85), colD = aged(tone(base, -0.36), age, 0.85), L = aged(tone(base, -0.68), age, 0.5);
  // inside of the bowl (back rim)
  const rim = oval(0, -30, 37, 6.4);
  fill(c, rim, mix(colD, L, 0.35)); line(c, rim, L, lw);
  clipped(c, rim, () => {
    if (water > 0.01) {
      const wy = lerp(-23.5, -29.4, water);
      fill(c, oval(0, wy, 36, 6), '#7fc4ea');
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-12, wy - 1.4, 9, 1.4, 0, 0, TAU); c.fill();
    }
    if (food > 0.01 && food < 0.35) for (const [u, v, r, k, a] of _kib(3, 26)) kibble(c, lerp(-28, 28, u), -28 + v * 4, 3.1 * r * ss(0, 0.3, food), k, a);
  });
  // kibble mound above the rim
  if (food >= 0.2) {
    const h = ss(0.2, 1, food) * 13, n = _kib(7, 46);
    n.forEach(([u, v, r, k, a], i) => {
      const px = lerp(-30, 30, u), top = h * (1 - (px / 32) ** 2);
      kibble(c, px, -30.5 - top * v, 3.3 * r * ss(0.2, 0.36, food), k, a);
    });
  }
  // body: flared towards the base
  const body = blob([[-37, -30, 1], [-40, -15], [-43.5, -3], [-41, 0, 1], [41, 0, 1], [43.5, -3], [40, -15], [37, -30, 1]], true, 0.6);
  const front = union(body, blob([[-37, -30, 1], [0, -23.6], [37, -30, 1], [37, -24, 1], [-37, -24, 1]]));
  fill(c, front, lin(c, -44, 0, 44, 0, [[0, colL], [0.3, col], [1, colD]]));
  clipped(c, front, () => {
    c.fillStyle = lin(c, 0, -30, 0, 0, [[0, alpha(colL, 0.4)], [0.35, alpha(colL, 0)], [0.7, alpha(colD, 0)], [1, alpha(mix(colD, L, 0.5), 0.7)]]); c.fillRect(-46, -32, 92, 34);
    c.fillStyle = alpha('#ffffff', lerp(0.3, 0.06, age)); c.beginPath(); c.ellipse(-26, -15, 3.2, 9, 0.16, 0, TAU); c.fill();
    c.strokeStyle = alpha(L, 0.4); c.lineWidth = lw * 0.7; c.beginPath(); c.moveTo(-43, -4.6); c.quadraticCurveTo(0, 0.6, 43, -4.6); c.stroke();
    if (age > 0.03) { // stains and rust
      const r = _kib(11, 9);
      r.forEach(([u, v, q], i) => { c.fillStyle = alpha(i % 2 ? RUST : '#5b4a36', 0.5 * ss(i * 0.06, 0.6 + i * 0.04, age)); c.beginPath(); c.ellipse(lerp(-38, 38, u), lerp(-26, -1, v), 7 * q, 4.4 * q, u * 3, 0, TAU); c.fill(); });
    }
  });
  if (o.label) {
    c.save(); c.globalAlpha *= lerp(1, 0.5, age);
    txt(c, String(o.label).toUpperCase().slice(0, 8), 0, -11.5, { size: 15, weight: 700, color: aged('#fdf3dc', age, 0.6), track: 1.6, outline: [alpha(L, 0.75), 2.4] });
    c.restore();
  }
  // front rim lip
  c.strokeStyle = L; c.lineWidth = lw * 0.9; c.beginPath(); c.moveTo(-37, -30); c.quadraticCurveTo(0, -17.4, 37, -30); c.stroke();
  c.strokeStyle = alpha(colL, 0.9); c.lineWidth = 1.5; c.beginPath(); c.moveTo(-35.4, -28); c.quadraticCurveTo(0, -16.2, 35.4, -28); c.stroke();
  line(c, front, L, lw);
  if (crack > 0.02) {
    crackLine(c, [[14, -24.6], [11, -18], [15.5, -12], [11, -6], [14, 0]], crack, L, lw * 0.9);
    crackLine(c, [[15.5, -12], [22, -9], [25, -3.6]], clamp(crack * 2 - 1), L, lw * 0.75);
    const ch = ss(0.3, 1, crack);
    fill(c, blob([[14 - 5 * ch, -26.4], [14, -24.4 + 2 * ch], [14 + 6 * ch, -27.4]]), mix(colD, L, 0.6));
  }
  mossAt(c, [[-39, -1.4, 8], [-27, 0, 6], [34, -1, 9], [-33, -29.6, 5], [24, -27.4, 4.4]], ss(0.4, 1, age));
  c.restore();
}

// ------------------------------------------------------------------ ball
export function drawBall(c, o = {}) {
  const age = clamp(num(o.age, 0)), r = Math.max(num(o.r, 11), 0.5) * num(o.s, 1), x = num(o.x, 0), y = num(o.y, 0);
  const a = o.shadow ?? 0.28;
  if (a > 0) shadow(c, x, y + 1, r * 1.25, Math.max(r * 0.3, 1), a);
  const lw = inkW(r / 16) * 0.8 * (r / 11) ** 0.5;
  const col = aged('#cfe23c', age, 0.8), colL = aged('#f1f79a', age, 0.8), colD = aged('#8fa51f', age, 0.8), L = aged('#4a5510', age, 0.5);
  c.save(); c.translate(x, y - r);
  const b = circle(0, 0, r);
  fill(c, b, rad(c, -r * 0.35, -r * 0.4, r * 1.45, [[0, colL], [0.5, col], [1, colD]]));
  clipped(c, b, () => {
    c.save(); c.rotate(num(o.rot, 0));
    c.strokeStyle = aged('#fbfbee', age, 0.7); c.lineWidth = r * 0.13; c.lineCap = 'round';
    c.beginPath(); c.arc(-r * 1.28, 0, r * 0.98, -0.95, 0.95); c.stroke();
    c.beginPath(); c.arc(r * 1.28, 0, r * 0.98, Math.PI - 0.95, Math.PI + 0.95); c.stroke();
    if (age > 0.03) { c.fillStyle = alpha('#5a4a30', 0.4 * age); c.beginPath(); c.ellipse(r * 0.1, r * 0.45, r * 0.6, r * 0.3, 0.4, 0, TAU); c.ellipse(-r * 0.3, -r * 0.5, r * 0.3, r * 0.2, 0, 0, TAU); c.fill(); }
    c.restore();
    c.fillStyle = lin(c, 0, r * 0.2, 0, r, [[0, alpha(colD, 0)], [1, alpha(mix(colD, L, 0.4), 0.55)]]); c.fillRect(-r, 0, r * 2, r);
    c.fillStyle = alpha('#ffffff', lerp(0.4, 0.1, age)); c.beginPath(); c.ellipse(-r * 0.36, -r * 0.48, r * 0.26, r * 0.14, -0.6, 0, TAU); c.fill();
    if (age > 0.4) { const k = ss(0.4, 1, age); c.fillStyle = LEAF.dark; c.beginPath(); c.ellipse(-r * 0.5, r * 0.9, r * 0.7 * k, r * 0.4 * k, 0, 0, TAU); c.fill(); c.fillStyle = LEAF.mid; c.beginPath(); c.ellipse(-r * 0.56, r * 0.82, r * 0.4 * k, r * 0.2 * k, 0, 0, TAU); c.fill(); }
  });
  line(c, b, L, lw);
  c.restore();
}

// ------------------------------------------------------------------ dog bed
export function drawDogBed(c, o = {}) {
  const age = clamp(num(o.age, 0));
  const lw = open(c, o, 108, 9);
  const base = o.color || '#5c84a6', ys = lerp(1, 0.5, ss(0.15, 1, age));
  const mould = (col) => mix(aged(col, age, 0.9), '#5f6650', 0.3 * age);
  const col = mould(base), colL = mould(tone(base, 0.3)), colD = mould(tone(base, -0.34)), L = aged(tone(base, -0.66), age, 0.5);
  const cu = mould('#f2e4c6'), cuD = mould('#cdb98f');
  const Y = (v) => v * ys;
  // back bolster
  const back = blob([[-95, Y(-18)], [-90, Y(-40)], [-62, Y(-53)], [0, Y(-57)], [62, Y(-53)], [90, Y(-40)], [95, Y(-18)], [60, Y(-10)], [-60, Y(-10)]]);
  fill(c, back, lin(c, 0, Y(-57), 0, Y(-10), [[0, colL], [0.5, col], [1, colD]]));
  shade(c, back, lw, colL, mix(colD, L, 0.3), Y(-30), Y(-10), 0.3);
  line(c, back, L, lw);
  // inner cushion
  const cush = oval(0, Y(-31), 72, Math.max(13 * ys, 3));
  fill(c, cush, lin(c, 0, Y(-44), 0, Y(-18), [[0, cu], [1, cuD]]));
  clipped(c, cush, () => {
    c.fillStyle = alpha(mix(cuD, L, 0.3), 0.4); c.beginPath(); c.ellipse(0, Y(-40), 70, 6 * ys, 0, 0, TAU); c.fill();
    c.strokeStyle = alpha(cuD, 0.9); c.lineWidth = 1; c.beginPath(); c.moveTo(-30, Y(-30)); c.quadraticCurveTo(-6, Y(-26), 18, Y(-31)); c.moveTo(24, Y(-27)); c.quadraticCurveTo(38, Y(-25), 50, Y(-28)); c.stroke();
  });
  line(c, cush, alpha(L, 0.8), lw * 0.85);
  // front bolster, dipping in the middle
  const frontB = blob([[-96, Y(-20)], [-78, Y(-31)], [-40, Y(-24)], [0, Y(-21)], [40, Y(-24)], [78, Y(-31)], [96, Y(-20)], [90, -4], [60, 0], [-60, 0], [-90, -4]]);
  fill(c, frontB, lin(c, 0, Y(-31), 0, 0, [[0, colL], [0.4, col], [1, colD]]));
  clipped(c, frontB, () => {
    c.strokeStyle = alpha(L, 0.3); c.lineWidth = lw * 0.7;
    for (const px of [-58, -20, 20, 58]) { c.beginPath(); c.moveTo(px, Y(-27)); c.quadraticCurveTo(px + 3, Y(-12), px - 1, 0); c.stroke(); }
    if (age > 0.03) {
      const sp = _kib(21, 14);
      sp.forEach(([u, v, q], i) => { c.fillStyle = alpha(i % 3 ? '#39432f' : '#c9cdb6', 0.55 * ss(i * 0.04, 0.5 + i * 0.03, age)); c.beginPath(); c.ellipse(lerp(-88, 88, u), Y(lerp(-27, -2, v)), 8 * q, 4.6 * q, u * 4, 0, TAU); c.fill(); });
    }
  });
  shade(c, frontB, lw, colL, mix(colD, L, 0.35), Y(-12), 0, 0.36);
  line(c, frontB, L, lw);
  // tear with stuffing, moss, leaves (age)
  const tear = ss(0.45, 0.95, age);
  if (tear > 0.02) {
    c.save(); c.translate(46, Y(-17)); c.scale(tear, tear);
    fill(c, oval(0, 0, 12, 4.4, -0.1), mix(L, '#000000', 0.2));
    const puff = union(circle(-4, -2.4, 5), circle(3, -3.4, 5.6), circle(8, -0.6, 4));
    fill(c, puff, '#dcd6c2'); line(c, puff, alpha(L, 0.7), lw * 0.7); c.restore();
  }
  mossAt(c, [[-84, -3, 13], [-60, Y(-50), 9], [70, -2, 12], [12, Y(-56), 8], [-22, -1, 8]], ss(0.45, 1, age));
  if (age > 0.25) {
    const k = ss(0.25, 0.9, age);
    [[-36, Y(-32), 9, 0.3], [20, Y(-28), 8, -0.6], [-70, Y(-30), 7, 1], [66, Y(-33), 7.5, 0.5], [-4, -3, 8, -0.2], [100, -2, 8, 0.2], [-104, -2, 7, -0.4]]
      .forEach(([lx, ly, r, a], i) => leaf(c, lx, ly, r * k, a, DEAD[i % DEAD.length], lw));
  }
  c.restore();
}

// ------------------------------------------------------------------ automatic feeder
const FEED_LED = [-21, -27];
export function feederLed(o = {}) {
  const s = num(o.s, 1), f = o.flip === -1 ? -1 : 1, ca = Math.cos(num(o.rot, 0)), sa = Math.sin(num(o.rot, 0));
  const lx = FEED_LED[0] * s * f, ly = FEED_LED[1] * s;
  return [num(o.x, 0) + lx * ca - ly * sa, num(o.y, 0) + lx * sa + ly * ca];
}
export function feederGlow(c, o = {}) {
  const led = clamp(num(o.led, 0));
  if (led <= 0.01) return;
  const [gx, gy] = feederLed(o), s = num(o.s, 1);
  glow(c, gx, gy, 46 * s, '#57f08a', 0.55 * led);
  glow(c, gx, gy, 9 * s, '#e8ffe8', 0.9 * led);
}
export function drawFeeder(c, o = {}) {
  const age = clamp(num(o.age, 0)), led = clamp(num(o.led, 0)), food = clamp(num(o.food, 0.6));
  const lw = open(c, o, 60, 7, 8);
  const yel = (col) => mix(aged(col, age, 0.7), '#c9b98a', 0.3 * age);
  const body = yel('#eef1f3'), bodyD = yel('#b4bfc8'), L = aged('#33414d', age, 0.5), dark = aged('#4a5967', age, 0.7), darkL = aged('#70808f', age, 0.7);
  // tray (right)
  const tray = blob([[22, -17, 1], [62, -17, 1], [66, -13], [61, -1], [56, 0, 1], [22, 0, 1]], true, 0.6);
  fill(c, tray, lin(c, 0, -17, 0, 0, [[0, darkL], [1, dark]])); 
  clipped(c, tray, () => {
    fill(c, oval(44, -16.4, 19, 4.4), mix(dark, L, 0.5));
    if (food > 0.02) for (const [u, v, r, k, a] of _kib(31, 12)) kibble(c, lerp(30, 58, u), -17.2 + v * 3, 2.8 * r * ss(0, 0.2, food), k, a);
  });
  line(c, tray, L, lw);
  // hopper
  const hop = blob([[-27, -106, 1], [27, -106, 1], [24, -62], [22, -50, 1], [-22, -50, 1], [-24, -62]], true, 0.5);
  fill(c, hop, lin(c, -27, 0, 27, 0, [[0, alpha(yel('#dfeaf2'), 0.9)], [0.5, alpha(yel('#c2d2de'), 0.82)], [1, alpha(yel('#9fb2c2'), 0.9)]]));
  clipped(c, hop, () => {
    const top = lerp(-52, -98, food);
    if (food > 0.01) {
      fill(c, rect(-30, top, 60, 60), mix('#a56a3a', bodyD, 0.25 + 0.2 * age));
      for (const [u, v, r, k, a] of _kib(33, 60)) { const py = lerp(top + 1, -50, v); kibble(c, lerp(-25, 25, u), py, 3 * r, k, a); }
      c.fillStyle = alpha(yel('#cfe0ec'), 0.3); c.fillRect(-30, -110, 60, 62);
    }
    c.fillStyle = alpha('#ffffff', lerp(0.45, 0.12, age)); c.beginPath(); c.moveTo(-21, -102); c.lineTo(-14, -102); c.lineTo(-13, -54); c.lineTo(-19, -54); c.closePath(); c.fill();
    if (age > 0.03) { c.fillStyle = lin(c, 0, -106, 0, -50, [[0, alpha('#8a7d5e', 0.12 * age)], [1, alpha('#6d6248', 0.55 * age)]]); c.fillRect(-30, -108, 60, 60); }
  });
  line(c, hop, L, lw);
  const lid = rrect(-30, -112, 60, 9, 3.5);
  fill(c, lid, lin(c, 0, -112, 0, -103, [[0, darkL], [1, dark]])); line(c, lid, L, lw);
  // base unit
  const base = blob([[-33, -52, 1], [33, -52, 1], [36, -30], [37, -4], [33, 0, 1], [-33, 0, 1], [-37, -4], [-36, -30]], true, 0.6);
  fill(c, base, lin(c, -37, 0, 37, 0, [[0, body], [0.45, mix(body, bodyD, 0.25)], [1, bodyD]]));
  clipped(c, base, () => {
    // chute opening above the tray
    fill(c, rrect(15, -24, 26, 20, 5), mix(dark, L, 0.55));
    // control panel
    const pan = rrect(-28, -44, 36, 26, 4);
    fill(c, pan, dark); line(c, pan, alpha(L, 0.8), lw * 0.7);
    fill(c, rrect(-24.5, -40.5, 29, 8.5, 1.6), mix('#1d2a30', '#7fe0a8', 0.12 + 0.4 * led));
    if (led > 0.05) { c.fillStyle = alpha('#c9ffe0', 0.85 * led); for (const dx of [0, 5, 12, 17]) c.fillRect(-22 + dx, -38.6, 3.4, 4.8); }
    fill(c, circle(-9, -27, 3.4), darkL); fill(c, circle(0.5, -27, 3.4), darkL);
    c.fillStyle = lin(c, 0, -14, 0, 0, [[0, alpha(bodyD, 0)], [1, alpha(mix(bodyD, L, 0.4), 0.6)]]); c.fillRect(-40, -14, 80, 14);
    if (age > 0.03) { const sp = _kib(41, 8); sp.forEach(([u, v, q], i) => { c.fillStyle = alpha(i % 2 ? '#6b5a3e' : '#4f5a3c', 0.42 * ss(i * 0.07, 0.6 + i * 0.05, age)); c.beginPath(); c.ellipse(lerp(-34, 34, u), lerp(-50, -2, v), 8 * q, 5 * q, u * 3, 0, TAU); c.fill(); }); }
  });
  shade(c, base, lw, '#ffffff', mix(bodyD, L, 0.2), -6, 0, 0.5);
  line(c, base, L, lw);
  // LED
  const ld = circle(FEED_LED[0], FEED_LED[1], 3);
  fill(c, ld, mix('#24382c', '#4dff8c', led)); line(c, ld, L, lw * 0.6);
  if (led > 0.05) { c.fillStyle = alpha('#eaffef', 0.9 * led); c.beginPath(); c.arc(FEED_LED[0] - 0.7, FEED_LED[1] - 0.8, 1.1, 0, TAU); c.fill(); }
  crackLine(c, [[30, -52], [24, -40], [29, -30], [22, -20]], ss(0.5, 1, age), L, lw * 0.8);
  mossAt(c, [[-35, -1.6, 9], [58, -1, 8], [-18, -112, 7], [14, -111, 5]], ss(0.45, 1, age));
  c.restore();
}

// ------------------------------------------------------------------ kibble sack
export function drawKibbleBag(c, o = {}) {
  const age = clamp(num(o.age, 0)), torn = clamp(num(o.torn, 0));
  const lw = open(c, o, 104 + 40 * torn, 8, 16 * torn);
  const col = aged('#2f8394', age), colL = aged('#5fb4c2', age), colD = aged('#1c5260', age), L = aged('#12333c', age, 0.5);
  const gold = aged('#f7c35f', age), cream = aged('#fbefd2', age);
  // spilled kibble on the ground (behind the mouth flaps)
  if (torn > 0.01) {
    const n = _kib(51, 70);
    n.forEach(([u, v, r, k, a], i) => {
      const q = ss(0, 1, torn * 70 - i * 0.9) * (0.9 + 0.2 * r);
      if (q <= 0) return;
      const d = u * u, px = 84 + d * 96 * lerp(0.5, 1, torn), h = (1 - d) * 22 * torn;
      kibble(c, px, -3 - v * h, 4.2 * q * r, k, a);
    });
  }
  const j = torn;
  const sack = blob([[-88, -8, 1], [-90, -52, 1], [-70, -58], [-20, -65], [40, -63], [76, -57 + 6 * j], [86 + 4 * j, -44 + 4 * j, 1], [80 + 3 * j, -34, j > 0.3 ? 1 : 0], [88 + 5 * j, -22, 1], [80, -12 + 2 * j, j > 0.3 ? 1 : 0], [86 + 3 * j, -3, 1], [40, 0], [-40, 0], [-76, -1]], true, 0.8);
  fill(c, sack, lin(c, 0, -66, 0, 0, [[0, colL], [0.4, col], [1, colD]]));
  clipped(c, sack, () => {
    // band + label
    c.fillStyle = gold; c.fillRect(-58, -70, 14, 80);
    c.fillStyle = alpha(colD, 0.5); c.fillRect(-90, -70, 9, 80);
    const lab = oval(4, -32, 36, 21);
    fill(c, lab, cream); line(c, lab, alpha(L, 0.6), lw * 0.7);
    // paw print
    c.fillStyle = col; c.beginPath(); c.ellipse(-8, -28, 9.5, 7.6, 0, 0, TAU); c.fill();
    for (const [dx, dy] of [[-18, -38], [-11.5, -42.5], [-4, -42.5], [2.5, -38]]) { c.beginPath(); c.ellipse(dx, dy, 3.4, 4.2, 0, 0, TAU); c.fill(); }
    c.fillStyle = gold; c.fillRect(10, -40, 22, 5); c.fillStyle = alpha(col, 0.7); c.fillRect(10, -31, 18, 3.4); c.fillRect(10, -25, 13, 3.4);
    // creases
    c.strokeStyle = alpha(L, 0.3); c.lineWidth = lw * 0.8;
    c.beginPath(); c.moveTo(-80, -50); c.quadraticCurveTo(-66, -30, -80, -10); c.moveTo(52, -58); c.quadraticCurveTo(60, -36, 50, -6); c.moveTo(-40, -6); c.quadraticCurveTo(0, -11, 36, -5); c.stroke();
    // inside of the torn mouth
    if (j > 0.02) { fill(c, oval(84, -27, 13 * j, 23 * j), mix(colD, L, 0.7)); for (const [u, v, r, k, a] of _kib(53, 9)) kibble(c, 74 + u * 12, -30 + v * 24, 4 * r * j, k, a); }
    if (age > 0.03) { const sp = _kib(55, 10); sp.forEach(([u, v, q], i) => { c.fillStyle = alpha(i % 2 ? '#5b4a36' : '#3f4a34', 0.45 * ss(i * 0.05, 0.6 + i * 0.04, age)); c.beginPath(); c.ellipse(lerp(-84, 80, u), lerp(-60, -2, v), 10 * q, 6 * q, u * 3, 0, TAU); c.fill(); }); }
  });
  shade(c, sack, lw, colL, mix(colD, L, 0.4), -18, 0);
  // crimped bottom seam (left)
  c.strokeStyle = alpha(L, 0.55); c.lineWidth = lw * 0.7; c.beginPath();
  for (let yy = -48; yy <= -12; yy += 6) { c.moveTo(-88.5, yy); c.lineTo(-82, yy + 1); }
  c.stroke();
  line(c, sack, L, lw);
  mossAt(c, [[-70, -1.4, 11], [30, -1, 9], [-30, -64, 8]], ss(0.5, 1, age));
  c.restore();
}

// ------------------------------------------------------------------ leash
export function drawLeash(c, ax, ay, bx, by, o = {}) {
  ax = num(ax, 0); ay = num(ay, 0); bx = num(bx, ax + 100); by = num(by, ay);
  const slack = clamp(num(o.slack, 0.3)), w = Math.max(num(o.w, 3.2), 0.5), col = o.color || '#d9453c', L = tone(col, -0.62);
  const g = Number.isFinite(o.ground) ? o.ground - w * 0.5 : null;
  const d = Math.hypot(bx - ax, by - ay), sagD = slack * (d * 0.38 + 14), n = 22, pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n; let px = lerp(ax, bx, u), py = lerp(ay, by, u) + sagD * 4 * u * (1 - u);
    if (g !== null && py > g) { const over = clamp((py - g) / 12); px += Math.sin(u * 11 + 1) * 5 * over * slack; py = g - Math.abs(Math.sin(u * 9 + 0.5)) * 1.1 * over; }
    pts.push([px, py]);
  }
  const path = blob(pts, false);
  c.save(); c.lineJoin = 'round';
  const lw = clamp(w * 0.34, 0.7, 1.6);
  const loop = clamp(num(o.loop, 0));
  if (loop > 0.02) { // handle loop at the hand end
    const lp = oval(ax - 9 * loop * w / 3.2, ay - 1.5, 10 * loop * w / 3.2, 5.4 * loop * w / 3.2, -0.2);
    line(c, lp, L, w + lw * 2); line(c, lp, col, w);
  }
  line(c, path, L, w + lw * 2); line(c, path, col, w);
  c.save(); c.translate(0, -w * 0.22); line(c, path, alpha(tone(col, 0.35), 0.6), w * 0.28); c.restore();
  if (o.clip !== false && o.clip !== 0) { // snap hook at the collar end
    const r = w * 0.95, k = circle(bx, by, r);
    fill(c, k, '#c9d2d8'); line(c, k, '#3a454c', lw);
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(bx - r * 0.3, by - r * 0.3, r * 0.3, 0, TAU); c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ small food props
export function drawCarrot(c, o = {}) {
  const bite = clamp(num(o.bite, 0));
  const lw = open(c, o, 30 * (1 - bite * 0.5), 3.4) * 0.9;
  const L = '#8a3d10', tipX = lerp(27, -14, bite), tipR = lerp(1.6, 6.2, ss(0, 0.5, bite));
  // greens
  for (const [a, len, col] of [[-0.5, 17, LEAF.dark], [0.28, 15, LEAF.mid], [-0.1, 20, LEAF.light]]) {
    c.save(); c.translate(-20, -7); c.rotate(Math.PI + a);
    const g = blob([[0, -1.6], [len * 0.5, -4.2], [len, 0, 1], [len * 0.5, 4.2], [0, 1.6]]);
    fill(c, g, col); line(c, g, LEAF.deep, lw * 0.75); c.restore();
  }
  const root = capsule(-19, -7.4, 7.2, tipX, -3.6 - tipR * 0.5 + 0.8, tipR);
  fill(c, root, lin(c, 0, -15, 0, 0, [[0, '#ffb04f'], [0.5, '#f2852a'], [1, '#c95f14']]));
  clipped(c, root, () => {
    c.strokeStyle = alpha(L, 0.4); c.lineWidth = lw * 0.6; c.beginPath();
    for (const px of [-13, -6, 2, 9, 16]) if (px < tipX - 2) { c.moveTo(px, -14); c.quadraticCurveTo(px + 1.6, -10, px + 0.6, -7.6); }
    c.stroke();
    c.fillStyle = 'rgba(255,240,200,0.4)'; c.beginPath(); c.ellipse(-10, -11.6, 9, 1.5, 0.1, 0, TAU); c.fill();
    if (bite > 0.03) fill(c, oval(tipX + tipR * 0.45, -3.6 - tipR * 0.5 + 0.8, tipR * 0.6, tipR * 0.95), '#ffd08a');
  });
  line(c, root, L, lw);
  c.restore();
}
export function drawSeed(c, o = {}) {
  const s = num(o.s, 1);
  c.save(); c.translate(num(o.x, 0), num(o.y, 0)); c.rotate(num(o.rot, 0)); c.scale(s, s);
  const col = o.color || '#3d3a36', p = blob([[-5, 0, 1], [-1, -2.8], [4, -1.6], [5, 0], [4, 1.6], [-1, 2.8]]);
  fill(c, p, lin(c, 0, -3, 0, 3, [[0, tone(col, 0.25)], [1, col]]));
  clipped(c, p, () => { c.strokeStyle = '#e9e2cf'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-4.4, -0.9); c.quadraticCurveTo(0, -1.9, 4.4, -0.7); c.moveTo(-4.4, 0.9); c.quadraticCurveTo(0, 1.9, 4.4, 0.7); c.stroke(); });
  line(c, p, tone(col, -0.5), inkW(s) * 0.45);
  c.restore();
}
export function drawCup(c, o = {}) {
  const spill = clamp(num(o.spill, 0)), s = num(o.s, 1), x = num(o.x, 0), y = num(o.y, 0), f = o.flip === -1 ? -1 : 1;
  const fall = ss(0, 0.45, spill), pud = ss(0.3, 1, spill);
  if (pud > 0.01) { // coffee puddle on the ground
    c.save(); c.translate(x + 50 * s * f, y + 1.5 * s); c.scale(s, s);
    const p = oval(0, 0, 34 * pud + 2, 5.6 * pud + 0.6);
    fill(c, p, '#6b4024'); c.fillStyle = 'rgba(255,225,190,0.3)'; c.beginPath(); c.ellipse(-8 * pud, -1.2 * pud, 12 * pud, 1.3 * pud, 0, 0, TAU); c.fill();
    line(c, p, 'rgba(50,26,12,0.55)', 1); c.restore();
  }
  const lw = open(c, { ...o, shadow: (o.shadow ?? 0.28) }, lerp(16, 26, fall), 4, lerp(0, 22, fall)) * 0.9;
  c.translate(9, 0); c.rotate(fall * 96 * DEG); c.translate(-9, 0);
  const L = '#4a3628';
  const cup = poly([[-9, 0], [9, 0], [13, -33], [-13, -33]]);
  fill(c, cup, lin(c, -13, 0, 13, 0, [[0, '#ffffff'], [0.4, '#f1ece2'], [1, '#cfc6b6']]));
  clipped(c, cup, () => {
    c.fillStyle = lin(c, -13, 0, 13, 0, [[0, '#d2a06a'], [1, '#9c6c3e']]); c.fillRect(-14, -25, 28, 15);
    fill(c, circle(0, -17.5, 4.6), '#2f7d5c'); fill(c, circle(0, -17.5, 2.2), '#f1ece2');
  });
  line(c, cup, L, lw);
  const lid = rrect(-14.5, -38, 29, 6, 2), cap = rrect(-11, -41, 22, 4, 1.6);
  fill(c, cap, '#e9e3d6'); line(c, cap, L, lw * 0.85);
  fill(c, lid, lin(c, 0, -38, 0, -32, [[0, '#ffffff'], [1, '#d6cebf']])); line(c, lid, L, lw);
  if (fall > 0.3 && spill < 0.98) { c.fillStyle = alpha('#6b4024', 0.9 * (1 - ss(0.7, 1, spill))); c.beginPath(); c.ellipse(4, -43, 2.4, 5 * fall, 0, 0, TAU); c.fill(); }
  c.restore();
}

// ------------------------------------------------------------------ dustbin
export function drawBin(c, o = {}) {
  const age = clamp(num(o.age, 0)), tip = clamp(num(o.tip, 0));
  const s = num(o.s, 1), x = num(o.x, 0), y = num(o.y, 0), f = o.flip === -1 ? -1 : 1, sa = o.shadow ?? 0.28;
  const rusty = (col) => mix(aged(col, age, 0.5), RUST, 0.42 * age);
  const col = rusty('#9fadb4'), colL = rusty('#d3dde1'), colD = rusty('#66757c'), L = aged('#2a363c', age, 0.4);
  if (sa > 0) shadow(c, x + lerp(0, 62, tip) * s * f, y + s, lerp(40, 78, tip) * s, 7 * s, sa);
  c.save(); c.translate(x, y); c.rotate(num(o.rot, 0)); c.scale(s * f, s); c.lineJoin = 'round'; c.lineCap = 'round';
  const lw = inkW(s) * 0.86;
  // litter spilling from the mouth
  const sp = ss(0.55, 1, tip);
  if (sp > 0.01) {
    const items = [[128, 0, 0], [150, 1, 0.5], [172, 0, -0.4], [141, 2, 0.2], [190, 3, 1.1], [116, 4, 0.3], [162, 5, -0.8]];
    items.forEach(([ix, kind, a], i) => {
      const k = ss(0, 1, sp * 1.6 - i * 0.08), px = lerp(104, ix, k);
      c.save(); c.translate(px, -5); c.rotate(a * k + (1 - k) * 2); c.scale(k, k);
      if (kind === 0 || kind === 5) { const p = blob([[-6, 0, 1], [-5, -6], [0, -8, 1], [5, -5.4], [7, 0, 1], [2, 3.6], [-3, 4, 1]]); fill(c, p, kind ? '#e3ddc9' : '#f4f0e4'); line(c, p, '#6d675a', lw * 0.7); c.strokeStyle = 'rgba(90,84,70,0.5)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-3, -4); c.lineTo(1, -1); c.lineTo(4, -4); c.stroke(); }
      else if (kind === 1) { const p = rrect(-7, -4, 14, 8, 1.6); fill(c, p, '#c9453c'); c.fillStyle = '#e8e2d4'; c.fillRect(-2.4, -4, 4, 8); line(c, p, '#5a1c14', lw * 0.7); }
      else if (kind === 2) { const p = blob([[-8, 2], [-4, -3], [3, -4], [8, 1], [3, 0], [-2, 1]]); fill(c, p, '#e9c93e'); line(c, p, '#7a5a12', lw * 0.7); }
      else if (kind === 3) { const p = blob([[-7, 3, 1], [-6, -4], [0, -6], [6, -3], [7, 3, 1]]); fill(c, p, '#5f8f6a'); line(c, p, '#243d2c', lw * 0.7); }
      else { const p = oval(0, 0, 5, 3.4); fill(c, p, '#8a5a34'); line(c, p, '#3f2412', lw * 0.7); }
      c.restore();
    });
  }
  // lid: lifts, slides off and comes to rest leaning on the ground
  const drawLid = () => {
    const k = ss(0.15, 0.85, tip);
    c.save();
    c.translate(lerp(0, -58, k), lerp(-80, -3, k) - Math.sin(k * Math.PI) * 26); c.rotate(lerp(0, -1.9, k));
    const lid = blob([[-36, 0, 1], [-33, -6], [-14, -11], [14, -11], [33, -6], [36, 0, 1], [30, 3], [-30, 3]], true, 0.7);
    const hd = rrect(-8, -17, 16, 8, 3.4);
    line(c, hd, L, lw + 2.6); line(c, hd, col, 2.4);
    fill(c, lid, lin(c, -36, 0, 36, 0, [[0, colL], [0.35, col], [1, colD]]));
    clipped(c, lid, () => { c.fillStyle = alpha(mix(colD, L, 0.4), 0.5); c.fillRect(-40, -1, 80, 6); c.fillStyle = alpha('#ffffff', lerp(0.4, 0.1, age)); c.beginPath(); c.ellipse(-16, -7, 9, 1.6, -0.2, 0, TAU); c.fill(); });
    line(c, lid, L, lw); c.restore();
  };
  if (tip > 0.5) drawLid();
  // body pivots on its lower right edge
  c.save();
  c.translate(27, 0); c.rotate(tip * 90 * DEG); c.translate(-27, 0);
  if (tip > 0.2) { const mouth = oval(0, -80, 31, 7); fill(c, mouth, mix(colD, L, 0.75)); line(c, mouth, L, lw); }
  const body = blob([[-31, -80, 1], [31, -80, 1], [29, -40], [27, -2], [24, 0, 1], [-24, 0, 1], [-27, -2], [-29, -40]], true, 0.5);
  fill(c, body, lin(c, -31, 0, 31, 0, [[0, colL], [0.3, col], [0.75, colD], [1, mix(colD, L, 0.25)]]));
  clipped(c, body, () => {
    c.strokeStyle = alpha(L, 0.28); c.lineWidth = lw * 0.8; c.beginPath();
    for (const px of [-20, -10, 0, 10, 20]) { c.moveTo(px * 1.02, -76); c.lineTo(px * 0.9, -4); }
    c.stroke();
    for (const by of [-62, -22]) { c.fillStyle = alpha(colL, 0.55); c.fillRect(-32, by - 2.4, 64, 2.4); c.fillStyle = alpha(mix(colD, L, 0.4), 0.6); c.fillRect(-32, by, 64, 2.6); }
    c.fillStyle = alpha('#ffffff', lerp(0.35, 0.08, age)); c.beginPath(); c.ellipse(-19, -42, 2.6, 26, 0.02, 0, TAU); c.fill();
    if (age > 0.03) { const q = _kib(61, 12); q.forEach(([u, v, r], i) => { c.fillStyle = alpha(i % 3 ? RUST : '#4f3220', 0.6 * ss(i * 0.05, 0.5 + i * 0.04, age)); c.beginPath(); c.ellipse(lerp(-30, 30, u), lerp(-78, -2, v), 8 * r, 6 * r, u * 4, 0, TAU); c.fill(); }); }
  });
  // side handle
  line(c, blob([[27, -58], [35, -56], [35, -46], [27, -44]], false), L, lw + 2.4); line(c, blob([[27, -58], [35, -56], [35, -46], [27, -44]], false), colD, 2.2);
  line(c, body, L, lw);
  c.strokeStyle = L; c.lineWidth = lw; c.beginPath(); c.moveTo(-31.5, -80); c.lineTo(31.5, -80); c.stroke();
  c.restore();
  if (tip <= 0.5) drawLid();
  if (tip < 0.5) mossAt(c, [[-25, -1.4, 9], [22, -1, 8]], ss(0.45, 1, age));
  c.restore();
}

// ------------------------------------------------------------------ park bench
export function drawBench(c, o = {}) {
  const age = clamp(num(o.age, 0));
  const lw = open(c, o, 140, 9);
  const wood = (k) => mix(aged(k ? '#c98f55' : '#b87d45', age, 1), '#8f8f84', 0.25 * age);
  const woodD = aged('#7e4d26', age), L = aged('#4a2812', age, 0.6);
  const iron = mix(aged('#2f4d40', age, 0.6), RUST, 0.45 * age), ironL = mix(aged('#4f7563', age, 0.6), '#b0703e', 0.45 * age), IL = aged('#16261f', age, 0.4);
  const plank = (x0, y0, w, h, rot, i, k = 1) => {
    if (k <= 0.02) return;
    c.save(); c.translate(x0, y0); c.rotate(rot);
    const p = rrect(0, 0, w * k, h, 1.6);
    fill(c, p, lin(c, 0, 0, 0, h, [[0, wood(1)], [1, mix(wood(0), woodD, 0.35)]]));
    clipped(c, p, () => {
      c.strokeStyle = alpha(woodD, 0.35); c.lineWidth = 0.7; c.beginPath(); c.moveTo(8, h * 0.4); c.lineTo(w * 0.42, h * 0.5); c.moveTo(w * 0.55, h * 0.62); c.lineTo(w * 0.9, h * 0.5); c.stroke();
      c.fillStyle = alpha('#fff3d6', 0.3); c.fillRect(0, 0, w, 1.4);
      if (age > 0.03) { c.fillStyle = alpha('#55604a', 0.4 * age); for (let j = 0; j < 4; j++) { c.beginPath(); c.ellipse(w * hash(j, i * 7 + 1), h * 0.5, 16 * hash(j, i + 3) + 5, h * 0.5, 0, 0, TAU); c.fill(); } }
    });
    line(c, p, L, lw * 0.85); c.restore();
  };
  // far legs
  for (const sx of [-1, 1]) { const p = capsule(sx * 98, -46, 3.4, sx * 100, -2, 3); fill(c, p, mix(iron, IL, 0.45)); line(c, p, IL, lw * 0.8); }
  // back slats (one sags, one breaks with age)
  const sagK = ss(0.35, 1, age);
  plank(-126, -103, 252, 11, 0, 1);
  plank(-126, -88, 252, 11, 0.045 * sagK, 2, lerp(1, 0.62, ss(0.5, 1, age)));
  plank(-126, -73, 252, 11, 0, 3);
  // seat slats (perspective: three boards, the front one thicker)
  plank(-128, -58, 256, 5, 0, 4);
  plank(-129, -52, 258, 6, 0, 5, lerp(1, 0.0, ss(0.6, 0.98, age)));
  if (age > 0.6) { c.save(); c.globalAlpha *= ss(0.6, 0.98, age); plank(-40, -9, 120, 6, 0.07, 6); c.restore(); }
  plank(-130, -45, 260, 9, 0, 7);
  // near iron frames with arm rests
  for (const sx of [-1, 1]) {
    c.save(); c.translate(sx * 108, 0); c.scale(sx, 1);
    const fr = union(
      capsule(0, -108, 4, 0, -36, 4.4), capsule(0, -36, 4.4, -4, -2, 3.6), capsule(-9, -1.6, 2.8, 5, -1.6, 2.8),
      capsule(0, -66, 3, 15, -67, 3.4), capsule(15, -67, 3.4, 15, -40, 3), capsule(0, -38, 3.6, 15, -40, 3),
    );
    fill(c, fr, lin(c, -8, 0, 16, 0, [[0, ironL], [0.5, iron], [1, mix(iron, IL, 0.4)]]));
    line(c, fr, IL, lw * 0.9);
    c.fillStyle = alpha(ironL, 0.8); c.beginPath(); c.arc(0, -108, 2, 0, TAU); c.fill();
    c.restore();
  }
  mossAt(c, [[-112, -1.6, 10], [106, -1.6, 9], [-70, -104, 9], [36, -104, 11], [88, -59, 8], [-30, -59, 7]], ss(0.4, 1, age));
  if (age > 0.3) { const k = ss(0.3, 0.9, age); [[-60, -60, 8, 0.2], [40, -60.5, 7, -0.5], [-8, -2, 8, 0.4], [70, -2, 7, -0.2]].forEach(([lx, ly, r, a], i) => leaf(c, lx, ly, r * k, a, DEAD[(i + 1) % DEAD.length], lw)); }
  c.restore();
}

// ------------------------------------------------------------------ rusted cage (200-year relic)
export function drawCageRelic(c, o = {}) {
  const lw = open(c, o, 96, 8);
  const L = '#3a2012', r0 = '#9a5a30', r1 = '#c58a52', r2 = '#5e3520';
  // dim interior so the bars read against any background
  const dome = blob([[-72, -22, 1], [-72, -84], [-60, -100], [60, -100], [72, -84], [72, -22, 1]], true, 0.7);
  fill(c, dome, 'rgba(40,30,20,0.2)');
  const bar = (x0, y0, x1, y1, w = 2.2, bend = 0) => {
    const p = blob([[x0, y0], [(x0 + x1) / 2 + bend, (y0 + y1) / 2], [x1, y1]], false);
    line(c, p, L, w + lw * 1.2); line(c, p, r0, w);
    c.save(); c.translate(-0.5, -0.4); line(c, p, alpha(r1, 0.8), w * 0.35); c.restore();
  };
  // back bars (thinner, darker)
  c.save(); c.globalAlpha = 0.55; for (let bx = -60; bx <= 60; bx += 15) bar(bx + 5, -98, bx + 5, -22, 1.4); c.restore();
  // door opening (dark) on the right half
  fill(c, rrect(16, -76, 38, 46, 3), 'rgba(30,20,12,0.4)');
  // front bars: a few bent or broken
  const bends = [0, 3, -2, 0, 6, 0, 0, 0, -4, 0, 2];
  for (let i = 0; i <= 10; i++) {
    const bx = -70 + i * 14;
    if (bx > 14 && bx < 56) { bar(bx, -100, bx, -76, 2.2); bar(bx, -30, bx, -22, 2.2); continue; }
    if (i === 3) { bar(bx, -100, bx - 5, -58, 2.2, 2); continue; }
    bar(bx, -100 + (Math.abs(bx) > 62 ? 14 : 0), bx, -22, 2.2, bends[i]);
  }
  bar(-72, -62, 16, -62 + 1, 2, 0); bar(54, -61, 72, -62, 2, 0);
  line(c, dome, L, 3.4 + lw * 1.2); line(c, dome, r0, 3.4);
  c.save(); c.translate(-0.6, -0.8); line(c, dome, alpha(r1, 0.7), 1); c.restore();
  // door frame + hanging door (one hinge left)
  line(c, rrect(16, -76, 38, 46, 3), L, 2.6 + lw); line(c, rrect(16, -76, 38, 46, 3), r2, 2.2);
  c.save(); c.translate(54, -32); c.rotate(0.62);
  const dr = rrect(0, -44, 36, 44, 3);
  fill(c, dr, 'rgba(40,28,18,0.18)');
  for (let dx = 7; dx < 36; dx += 7.4) bar(dx, -44, dx, 0, 1.8);
  bar(0, -22, 36, -22, 1.6);
  line(c, dr, L, 2.6 + lw); line(c, dr, r0, 2.4); c.restore();
  // tray
  const tray = blob([[-80, -24, 1], [80, -24, 1], [78, -4], [72, 0, 1], [-72, 0, 1], [-78, -4]], true, 0.6);
  fill(c, tray, lin(c, 0, -24, 0, 0, [[0, '#8f8a74'], [1, '#55523f']]));
  clipped(c, tray, () => {
    const q = _kib(71, 12); q.forEach(([u, v, r], i) => { c.fillStyle = alpha(i % 2 ? RUST : '#3f4a34', 0.55); c.beginPath(); c.ellipse(lerp(-78, 78, u), lerp(-22, -2, v), 10 * r, 5 * r, u * 3, 0, TAU); c.fill(); });
    c.fillStyle = alpha('#d6d0b6', 0.4); c.fillRect(-80, -24, 160, 2);
  });
  line(c, tray, L, lw);
  crackLine(c, [[-30, -24], [-34, -15], [-27, -9], [-31, 0]], 1, L, lw * 0.8);
  mossAt(c, [[-70, -2, 14], [-44, -1, 9], [40, -1.4, 13], [74, -3, 10], [-8, -1, 8], [-66, -25, 8], [30, -25, 6], [-40, -100, 7], [50, -99, 6]], 1);
  [[-92, -2, 8, 0.3], [18, -2.4, 7, -0.4], [88, -3, 7, 0.9]].forEach(([lx, ly, r, a], i) => leaf(c, lx, ly, r, a, DEAD[i], lw));
  c.restore();
}

// ------------------------------------------------------------------ TV
const TV_C = [0, -121];
export function tvGlow(c, o = {}) {
  const on = clamp(num(o.on, 0));
  if (on <= 0.01) return;
  const s = num(o.s, 1), t = num(o.t, 0), fl = 0.82 + 0.18 * noise1(t * 7, 5);
  glow(c, num(o.x, 0) + TV_C[0] * s, num(o.y, 0) + TV_C[1] * s, 300 * s, '#9fd0ff', 0.3 * on * fl);
}
export function drawTV(c, o = {}) {
  const age = clamp(num(o.age, 0)), on = clamp(num(o.on, 0)) * (1 - ss(0.2, 0.5, age)), t = num(o.t, 0), nz = clamp(num(o.noise, 0));
  const lw = open(c, o, 132, 9);
  const wood = aged('#9a6e48', age), woodL = aged('#c0946a', age), woodD = aged('#684428', age), L = aged('#3f2714', age, 0.5);
  const bez = aged('#262b33', age, 0.7), bezL = aged('#4a5260', age, 0.7), BL = '#11141a';
  // stand
  const st = rrect(-124, -56, 248, 50, 4);
  for (const lx of [-108, 100]) { const leg = rect(lx, -8, 8, 8); fill(c, leg, woodD); line(c, leg, L, lw * 0.85); }
  fill(c, st, lin(c, 0, -56, 0, -6, [[0, woodL], [0.2, wood], [1, woodD]]));
  clipped(c, st, () => {
    c.strokeStyle = alpha(L, 0.5); c.lineWidth = lw * 0.75; c.beginPath(); c.moveTo(-124, -48); c.lineTo(124, -48); c.moveTo(0, -48); c.lineTo(0, -6); c.moveTo(-62, -48); c.lineTo(-62, -6); c.moveTo(62, -48); c.lineTo(62, -6); c.stroke();
    c.fillStyle = alpha(woodL, 0.9); for (const kx of [-8, 8]) { c.beginPath(); c.arc(kx, -28, 2.2, 0, TAU); c.fill(); }
    c.fillStyle = alpha('#fff0d0', 0.25); c.fillRect(-124, -56, 248, 2);
    if (age > 0.03) { const q = _kib(81, 10); q.forEach(([u, v, r], i) => { c.fillStyle = alpha(i % 2 ? '#4f5a3c' : '#4a3a2a', 0.4 * ss(i * 0.05, 0.6 + i * 0.04, age)); c.beginPath(); c.ellipse(lerp(-120, 120, u), lerp(-54, -8, v), 16 * r, 8 * r, u * 3, 0, TAU); c.fill(); }); }
  });
  line(c, st, L, lw);
  // foot + screen (tilts a little with age)
  c.save(); c.translate(0, -56); c.rotate(-0.045 * ss(0.4, 1, age));
  const foot = union(poly([[-34, 0], [34, 0], [26, -5], [-26, -5]]), rect(-9, -12, 18, 9));
  fill(c, foot, bez); line(c, foot, BL, lw);
  const frame = rrect(-104, -128, 208, 120, 5), scr = rect(-98, -122, 196, 106);
  fill(c, frame, lin(c, 0, -128, 0, -8, [[0, bezL], [0.2, bez], [1, mix(bez, BL, 0.4)]]));
  fill(c, scr, lin(c, -98, -122, 98, -16, [[0, '#1b222c'], [1, '#0c1016']]));
  clipped(c, scr, () => {
    if (on > 0.01) {
      const fl = 0.9 + 0.1 * noise1(t * 9, 3);
      c.save(); c.globalAlpha *= on * fl;
      c.fillStyle = lin(c, 0, -122, 0, -16, [[0, '#5fb1ee'], [0.6, '#bfe6fb'], [1, '#d9f0c8']]); c.fillRect(-98, -122, 196, 106);
      fill(c, circle(52 + Math.sin(t * 0.2) * 6, -92, 13), '#fff3b0');
      fill(c, blob([[-98, -52], [-60, -66], [-20, -50], [30, -62], [98, -48], [98, -16], [-98, -16]]), '#69b45a');
      fill(c, blob([[-98, -38], [-40, -46], [20, -34], [98, -42], [98, -16], [-98, -16]]), '#4b9645');
      const cx = ((t * 9) % 240) - 120; fill(c, union(circle(cx, -100, 8), circle(cx + 10, -103, 10), circle(cx + 22, -99, 7)), 'rgba(255,255,255,0.9)');
      c.fillStyle = 'rgba(11,16,48,0.82)'; c.fillRect(-98, -34, 196, 12); c.fillStyle = '#f7c35f'; c.fillRect(-98, -34, 34, 12);
      c.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 5; i++) c.fillRect(-58 + i * 30, -30, 22, 4);
      c.restore();
    }
    if (nz > 0.01) { // no-signal static
      const fr = Math.floor(t * 20);
      c.save(); c.globalAlpha *= nz;
      c.fillStyle = '#6d727a'; c.fillRect(-98, -122, 196, 106);
      for (let i = 0; i < 150; i++) { const g = hash(i, fr * 3.1 + 1); c.fillStyle = g > 0.5 ? 'rgba(240,240,240,0.8)' : 'rgba(20,20,24,0.8)'; c.fillRect(-98 + hash(i, fr + 7) * 190, -122 + hash(i, fr + 31) * 102, 3 + g * 9, 2.4); }
      c.restore();
    }
    // glass reflection
    c.fillStyle = alpha('#ffffff', lerp(0.09, 0.03, age) * (1 - on * 0.5)); c.beginPath(); c.moveTo(-98, -122); c.lineTo(-30, -122); c.lineTo(-98, -40); c.closePath(); c.fill();
    if (age > 0.03) { c.fillStyle = lin(c, 0, -122, 0, -16, [[0, alpha('#8f8468', 0.14 * age)], [1, alpha('#8f8468', 0.5 * age)]]); c.fillRect(-98, -122, 196, 106); }
    const ck = ss(0.35, 0.95, age);
    if (ck > 0.02) for (const [w, col] of [[1.6, 'rgba(0,0,0,0.6)'], [0.7, 'rgba(210,225,235,0.8)']]) {
      crackLine(c, [[-40, -84], [-64, -100], [-98, -108]], ck, col, w); crackLine(c, [[-40, -84], [-20, -110], [-14, -122]], ck, col, w);
      crackLine(c, [[-40, -84], [-10, -70], [30, -74], [98, -50]], ck, col, w); crackLine(c, [[-40, -84], [-52, -50], [-44, -16]], ck, col, w);
      crackLine(c, [[-10, -70], [0, -40], [-10, -16]], clamp(ck * 2 - 1), col, w);
    }
  });
  line(c, scr, BL, lw * 0.7); line(c, frame, BL, lw);
  if (on > 0.3) { fill(c, circle(92, -12.4, 1.4), '#7fe0a8'); }
  // vines wrapping the set
  const vk = ss(0.3, 1, age);
  if (vk > 0.02) {
    const vine = (pts, seed) => {
      const n = Math.max(2, Math.round(pts.length * vk)), sub = pts.slice(0, n);
      line(c, blob(sub, false), LEAF.stem, 2.6); line(c, blob(sub, false), LEAF.dark, 1.4);
      for (let i = 1; i < n; i++) {
        const q = sub[i], a = hash(i, seed) * TAU, r = (5 + hash(i, seed + 2) * 4) * ss(0, 1, vk * pts.length - i);
        leaf(c, q[0] + Math.cos(a) * 4, q[1] + Math.sin(a) * 4, r, a, i % 2 ? LEAF.mid : LEAF.light, lw * 0.9);
        leaf(c, q[0] - Math.cos(a) * 5, q[1] - Math.sin(a) * 3, r * 0.8, a + 2.4, LEAF.dark, lw * 0.9);
      }
    };
    vine([[-112, 50], [-108, 20], [-112, -10], [-100, -40], [-106, -70], [-90, -98], [-70, -120], [-40, -130], [-10, -126], [14, -132]], 3);
    vine([[110, 52], [106, 24], [112, -4], [98, -30], [70, -44], [40, -36], [14, -52], [-12, -44]], 9);
    vine([[60, 56], [52, 30], [64, 4], [84, -10], [108, -40], [100, -80], [106, -112]], 15);
  }
  c.restore();
  mossAt(c, [[-110, -57, 11], [70, -57, 9], [-118, -3, 9], [112, -3, 10]], ss(0.45, 1, age));
  c.restore();
}
