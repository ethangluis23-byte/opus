// Film assembly: scenes -> absolute shot list, per-frame rendering with transitions and global overlays.
import { Gfx, W, H, FPS } from './stage.js';
import { timePill, pawBadge, buildCaptions, drawCaptions, grain } from './overlays.js';
import { ease, ss, clamp } from './util.js';

export const SCENE_LEN = 60;

// scenes: [{n, shots: [{id, at (seconds from scene start), draw(g, t), pill, trans: {type, dur}, ui, caps}]}]
export function makeFilm(scenes, narration, duration = 600) {
  const shots = [];
  for (const sc of scenes) {
    const base = (sc.n - 1) * SCENE_LEN;
    for (const s of sc.shots) {
      if (typeof s.at !== 'number' || Number.isNaN(s.at)) throw new Error(`shot ${s.id}: missing/invalid "at"`);
      if (typeof s.draw !== 'function') throw new Error(`shot ${s.id}: missing draw()`);
      shots.push({ ...s, scene: sc.n, start: base + s.at });
    }
  }
  shots.sort((a, b) => a.start - b.start);
  shots.forEach((s, i) => {
    s.idx = i;
    s.end = i + 1 < shots.length ? shots[i + 1].start : duration;
    s.dur = s.end - s.start;
    if (s.dur <= 0.05) throw new Error(`shot ${s.id}: zero/negative duration (start ${s.start.toFixed(2)})`);
  });
  if (shots.length && shots[0].start > 0) throw new Error('first shot must start at 0');
  return { shots, duration, narration, caps: buildCaptions(narration?.lines || []) };
}

export function shotAt(film, T) {
  const s = film.shots;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m].start <= T) lo = m; else hi = m - 1; }
  return s[lo];
}

export class Renderer {
  constructor(film, scale = 1) {
    this.film = film; this.scale = scale;
    this.A = new Gfx(scale); this.B = new Gfx(scale);
  }

  drawShot(g, s, T) {
    g.begin();
    g.t = T - s.start; g.T = T; g.dur = s.dur; g.shot = s; g.frame = Math.round(T * FPS);
    g.ctx.save();
    s.draw(g, g.t);
    g.ctx.restore();
    g._reset(g.ctx);
  }

  // Render the film frame at absolute time T. Returns the canvas (valid until the next call).
  frame(T, o = {}) {
    const f = this.film, s = shotAt(f, T), A = this.A, B = this.B, c = A.ctx;
    const tr = s.trans, u = tr ? (T - s.start) / tr.dur : 1;
    const raw = (fn) => { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); fn(); c.restore(); };
    if (tr && u < 1 && s.idx > 0) {
      const p = f.shots[s.idx - 1];
      if (tr.type === 'fade') {
        this.drawShot(A, p, T); this.drawShot(B, s, T);
        raw(() => { c.globalAlpha = ease.io(u); c.drawImage(B.canvas, 0, 0); });
      } else if (tr.type === 'dip' || tr.type === 'dipwhite') {
        const col = tr.type === 'dip' ? '#000000' : '#ffffff';
        if (u < 0.5) { this.drawShot(A, p, T); A.wash(col, ease.io(u * 2)); } else { this.drawShot(A, s, T); A.wash(col, ease.io((1 - u) * 2)); }
      } else if (tr.type === 'flash') {
        this.drawShot(A, s, T); A.wash(tr.color || '#ffffff', Math.pow(1 - u, 2) * (tr.amount ?? 1));
      } else if (tr.type === 'wipe') {
        // soft vertical-edge wipe, left to right (dir -1 for right to left)
        this.drawShot(A, p, T); this.drawShot(B, s, T);
        const e = ease.io(u), dir = tr.dir ?? 1, pw = A.pw, ph = A.ph, soft = Math.round(pw * 0.12);
        raw(() => {
          const edge = dir > 0 ? e * (pw + soft) - soft : pw - e * (pw + soft);
          for (let i = 0; i < 12; i++) {
            const x0 = dir > 0 ? edge + (soft * i) / 12 : edge + soft - (soft * (i + 1)) / 12;
            c.globalAlpha = 1 - (i + 0.5) / 12;
            c.drawImage(B.canvas, Math.max(0, x0), 0, soft / 12 + 1, ph, Math.max(0, x0), 0, soft / 12 + 1, ph);
          }
          c.globalAlpha = 1;
          if (dir > 0) { if (edge > 0) c.drawImage(B.canvas, 0, 0, edge, ph, 0, 0, edge, ph); } else if (edge + soft < pw) c.drawImage(B.canvas, edge + soft, 0, pw - edge - soft, ph, edge + soft, 0, pw - edge - soft, ph);
        });
      } else {
        this.drawShot(A, s, T);
      }
    } else {
      this.drawShot(A, s, T);
    }

    if (o.overlays !== false) {
      if (s.ui !== false) {
        const prev = s.idx > 0 ? f.shots[s.idx - 1] : null, changed = !prev || prev.pill !== s.pill || prev.ui === false;
        const k = changed ? ss(0.05, 0.5, T - s.start) : 1;
        timePill(c, s.pill, k, changed ? 0.9 + 0.1 * ease.back(k) : 1);
        pawBadge(c, 0.9);
      }
      if (s.caps !== false) drawCaptions(c, f.caps, T);
      grain(c, Math.round(T * FPS), o.grain ?? 0.055);
      // film fade in / out
      A.wash('#000000', 1 - ss(0, 1.4, T));
      A.wash('#000000', ss(f.duration - 1.6, f.duration - 0.1, T));
    }
    return A.canvas;
  }
}
