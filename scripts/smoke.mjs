// Renderer capability + speed smoke test for @napi-rs/canvas.
import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fontsDir = path.join(root, 'assets/fonts');
for (const f of fs.readdirSync(fontsDir)) {
  if (f.endsWith('.ttf')) console.log('font', f, !!GlobalFonts.registerFromPath(path.join(fontsDir, f)));
}
console.log('families:', GlobalFonts.families.map((f) => f.family).filter((n) => /Barlow|Bebas|Pacifico|Caveat/.test(n)).join(' | '));

const W = 1920, H = 1080;
const c = createCanvas(W, H);
const ctx = c.getContext('2d');
const time = (label, fn) => { const t0 = performance.now(); fn(); console.log(label.padEnd(34), (performance.now() - t0).toFixed(1) + ' ms'); };

time('gradient bg', () => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1030'); g.addColorStop(0.6, '#3b2a5a'); g.addColorStop(1, '#f5a623');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
});
time('filter blur(24px) circle', () => {
  ctx.save(); ctx.filter = 'blur(24px)'; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(300, 260, 120, 0, Math.PI * 2); ctx.fill();
  console.log('  ctx.filter reads back as:', JSON.stringify(ctx.filter));
  ctx.restore();
});
time('shadowBlur rect', () => {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
  ctx.fillStyle = '#e8a33d'; ctx.beginPath(); ctx.roundRect(520, 160, 260, 200, 40); ctx.fill(); ctx.restore();
});
time('blend modes', () => {
  const modes = ['multiply', 'screen', 'overlay', 'soft-light', 'lighter', 'color-dodge', 'hard-light', 'color'];
  modes.forEach((m, i) => {
    ctx.save(); ctx.globalCompositeOperation = m;
    console.log('  gco', m, '->', ctx.globalCompositeOperation);
    ctx.fillStyle = '#2a9d8f'; ctx.fillRect(860 + i * 120, 160, 100, 200); ctx.restore();
  });
});
time('conic gradient', () => {
  const g = ctx.createConicGradient(0, 300, 620);
  g.addColorStop(0, '#f5a623'); g.addColorStop(0.5, '#0b1030'); g.addColorStop(1, '#f5a623');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(300, 620, 120, 0, Math.PI * 2); ctx.fill();
});
time('Path2D op union + stroke', () => {
  const a = new Path2D(); a.arc(600, 620, 90, 0, Math.PI * 2);
  const b = new Path2D(); b.arc(700, 620, 90, 0, Math.PI * 2);
  let u = a;
  try { u = a.op(b, 'union'); console.log('  Path2D.op union ok'); } catch (e) { console.log('  Path2D.op failed', e.message); }
  ctx.fillStyle = '#f08a24'; ctx.fill(u);
  ctx.strokeStyle = '#5a2a0e'; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.stroke(u);
});
time('text + letterSpacing + glow', () => {
  ctx.save();
  ctx.font = '800 96px "Barlow Condensed"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = '8px'; console.log('  letterSpacing reads back:', ctx.letterSpacing); } catch (e) { console.log('  letterSpacing unsupported'); }
  ctx.shadowColor = '#ffb52e'; ctx.shadowBlur = 30; ctx.fillStyle = '#ffc857';
  ctx.fillText('THE LAST PETS ON EARTH', 1280, 560);
  ctx.shadowBlur = 0; ctx.letterSpacing = '0px';
  ctx.font = '700 44px "Barlow Semi Condensed"'; ctx.fillStyle = '#fff';
  ctx.fillText('A golden retriever waits by the front door,', 1280, 660);
  ctx.font = '400 60px "Pacifico"'; ctx.fillText('Café Luna', 1100, 760);
  ctx.font = '400 60px "Bebas Neue"'; ctx.fillText('PET SHOP', 1460, 760);
  ctx.font = '600 56px "Caveat"'; ctx.fillText('Max & me, summer', 1280, 850);
  ctx.restore();
});
time('5000 small leaf paths', () => {
  let s = 12345; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 5000; i++) {
    const x = 60 + r() * 700, y = 800 + r() * 240, a = r() * 6.28, k = 5 + r() * 6;
    ctx.fillStyle = ['#3f8f3a', '#5cae45', '#2f6f33'][i % 3];
    ctx.beginPath(); ctx.ellipse(x, y, k, k * 0.55, a, 0, Math.PI * 2); ctx.fill();
  }
});
const off = createCanvas(W, H); const o = off.getContext('2d');
time('offscreen layer + source-atop tint', () => {
  o.clearRect(0, 0, W, H);
  o.fillStyle = '#c96b4a'; o.fillRect(900, 880, 400, 160);
  o.fillStyle = '#fff'; o.fillRect(940, 900, 60, 60);
  o.globalCompositeOperation = 'source-atop'; o.fillStyle = 'rgba(40,60,160,0.55)'; o.fillRect(0, 0, W, H);
  o.globalCompositeOperation = 'source-over';
  ctx.drawImage(off, 0, 0);
});
time('downscale blur trick (1/8)', () => {
  const small = createCanvas(W / 8, H / 8); const sc = small.getContext('2d');
  sc.drawImage(c, 0, 0, W / 8, H / 8);
  ctx.save(); ctx.globalAlpha = 0.0; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, W, H); ctx.restore();
});
time('full-frame blur(12px) of canvas', () => {
  ctx.save(); ctx.globalAlpha = 0.0; ctx.filter = 'blur(12px)'; ctx.drawImage(off, 0, 0); ctx.restore();
});
let raw;
time('canvas.data() raw', () => { raw = c.data(); });
console.log('raw bytes', raw.length, 'expected', W * H * 4, 'first px', raw[0], raw[1], raw[2], raw[3]);
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
time('encode jpeg', () => { fs.writeFileSync(path.join(root, 'build/smoke.jpg'), c.toBuffer('image/jpeg', 90)); });
console.log('done');
