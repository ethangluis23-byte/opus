// Stage: output canvas, multiplane camera, buffered layers, colour grade.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alpha } from './util.js';
import { rad } from './draw.js';

export const W = 1920, H = 1080, FPS = 30;
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let fontsLoaded = false;
export function loadFonts() {
  if (fontsLoaded) return;
  const dir = path.join(ROOT, 'assets/fonts');
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.ttf')) GlobalFonts.registerFromPath(path.join(dir, f));
  fontsLoaded = true;
}

// All drawing uses a logical 1920x1080 space; `scale` only changes output resolution (0.5 for previews).
export class Gfx {
  constructor(scale = 1) {
    loadFonts();
    this.scale = scale;
    this.pw = Math.round(W * scale); this.ph = Math.round(H * scale);
    this.canvas = createCanvas(this.pw, this.ph);
    this.ctx = this.canvas.getContext('2d');
    this.pool = [];
    this.cam = { x: W / 2, y: H / 2, z: 1, r: 0 };
    this.t = 0; this.T = 0; this.dur = 1; this.frame = 0; this.shot = null;
  }

  _reset(c) {
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
    c.shadowBlur = 0; c.shadowColor = 'transparent'; c.shadowOffsetX = 0; c.shadowOffsetY = 0; c.letterSpacing = '0px';
  }
  begin() {
    const c = this.ctx;
    this._reset(c);
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    this.cam = { x: W / 2, y: H / 2, z: 1, r: 0 };
  }

  // Camera looks at world point (x, y) on the main plane with zoom z (1 = the 1920x1080 world rect fills the frame).
  camera(x, y, z = 1, r = 0) { this.cam = { x, y, z, r }; return this; }

  // Parallax depth d: 0 = backdrop fixed to the frame, 1 = main action plane, > 1 = foreground (moves and zooms more).
  _apply(c, d) {
    const k = this.cam, z = Math.pow(k.z, d);
    c.translate(W / 2, H / 2);
    if (k.r) c.rotate(k.r * Math.min(d, 1));
    c.scale(z, z);
    c.translate(-(W / 2 + (k.x - W / 2) * d), -(H / 2 + (k.y - H / 2) * d));
  }
  // World -> screen for a point on plane d (ignores camera roll). Use to pin UI callouts to world objects.
  toScreen(x, y, d = 1) {
    const k = this.cam, z = Math.pow(k.z, d);
    return [(x - (W / 2 + (k.x - W / 2) * d)) * z + W / 2, (y - (H / 2 + (k.y - H / 2) * d)) * z + H / 2];
  }
  // Visible world rectangle on plane d (for culling / spawning).
  view(d = 1, pad = 0) {
    const k = this.cam, z = Math.pow(k.z, d);
    const cx = W / 2 + (k.x - W / 2) * d, cy = H / 2 + (k.y - H / 2) * d, hw = W / 2 / z + pad, hh = H / 2 / z + pad;
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
  }

  _buf() {
    let b = this.pool.pop();
    if (!b) { const cv = createCanvas(this.pw, this.ph); b = { cv, c: cv.getContext('2d') }; }
    return b;
  }

  // Draw fn(ctx) in world coordinates on a parallax plane.
  // Options (any of these routes the layer through an offscreen buffer):
  //   fog: [color, amount]   mix the layer toward a haze colour (atmospheric perspective)
  //   tint: [color, amount]  mix toward a tint colour (e.g. silhouette or night shade)
  //   alpha, blend, blur     composite controls (blur in logical px: depth-of-field for near/far planes)
  layer(depth, fn, o) {
    const c = this.ctx;
    if (!o || !(o.fog || o.tint || o.blur || o.blend || (o.alpha != null && o.alpha < 1))) {
      c.save(); this._apply(c, depth); fn(c); c.restore();
      return;
    }
    if (o.alpha != null && o.alpha <= 0) return;
    const b = this._buf(), x = b.c;
    this._reset(x); x.clearRect(0, 0, W, H);
    x.save(); this._apply(x, depth); fn(x); x.restore();
    this._reset(x);
    x.globalCompositeOperation = 'source-atop';
    if (o.tint && o.tint[1] > 0) { x.globalAlpha = o.tint[1]; x.fillStyle = o.tint[0]; x.fillRect(0, 0, W, H); }
    if (o.fog && o.fog[1] > 0) { x.globalAlpha = o.fog[1]; x.fillStyle = o.fog[0]; x.fillRect(0, 0, W, H); }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (o.alpha != null) c.globalAlpha = o.alpha;
    if (o.blend) c.globalCompositeOperation = o.blend;
    if (o.blur) c.filter = `blur(${(o.blur * this.scale).toFixed(2)}px)`;
    c.drawImage(b.cv, 0, 0);
    c.restore();
    this.pool.push(b);
  }

  // Draw in screen space (UI, light effects that ignore the camera).
  screen(fn) { const c = this.ctx; c.save(); fn(c); c.restore(); }

  // Global colour grade for a look (see sky.js LOOKS) plus vignette. Call after the scene layers, before emissive effects/UI.
  grade(look, k = 1) {
    const c = this.ctx;
    for (const [mode, color, a] of look.grade || []) {
      if (a * k <= 0) continue;
      c.save(); c.globalCompositeOperation = mode; c.globalAlpha = a * k; c.fillStyle = color; c.fillRect(0, 0, W, H); c.restore();
    }
    this.vignette(look.vig ?? 0.3);
  }
  vignette(a = 0.3, color = '#04060f') {
    if (a <= 0) return;
    const c = this.ctx;
    c.save();
    c.translate(W / 2, H / 2); c.scale(1, H / W);
    c.fillStyle = rad(c, 0, 0, W * 0.74, [[0, alpha(color, 0)], [0.55, alpha(color, 0)], [0.85, alpha(color, a * 0.55)], [1, alpha(color, a)]]);
    c.fillRect(-W, -W, W * 2, W * 2);
    c.restore();
  }
  // Flat colour wash over the frame (fades, flashes).
  wash(color, a, mode = 'source-over') {
    if (a <= 0) return;
    const c = this.ctx;
    c.save(); c.globalCompositeOperation = mode; c.globalAlpha = Math.min(1, a); c.fillStyle = color; c.fillRect(0, 0, W, H); c.restore();
  }
}
