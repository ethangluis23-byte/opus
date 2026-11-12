"""Ambience beds. fn(params, sr=48000) -> float32 stereo of exactly params["dur"] seconds.

Nothing loops: every bed is generated for its full length from noise processes
and Poisson-scheduled events, so any duration is seamless.
"""
from __future__ import annotations

import numpy as np

from . import dsp
from .dsp import (SR, F32, TAU, bpc, cos_ramp, env_ar, exp_decay, fade, gust_env, lp, hp, bp, n_of, place,
                  smooth_noise, tone, white)
from .sfx_animals import _f, _rng, _rms, owl_hoot
from .sfx_foley import creak, drip


def _n(params, sr):
    return n_of(_f(params, "dur", 30.0, 0.5, 7200.0), sr)


def _events(rng, dur, mean_gap, first=None, jitter=0.5):
    t = rng.uniform(0.15, 1.0) * mean_gap if first is None else first
    out = []
    while t < dur:
        out.append(t)
        t += mean_gap * rng.uniform(1.0 - jitter, 1.0 + jitter)
    return out


def _poisson_layer(n, rng, density, kern, rms, sr=SR, sigma=0.6):
    """Random impulses through a kernel, scaled to a target RMS that does not
    depend on the duration (so a bed has the same level at any length)."""
    k = kern / (np.sqrt(np.sum(np.square(kern, dtype=np.float64))) + 1e-12)
    expected = np.sqrt(max(density, 1e-6) * np.exp(2 * sigma * sigma) / sr)
    return dsp.conv_same(dsp.impulses(n, rng, density, sr, sigma), k.astype(F32)) * (rms / expected)


def _with_send(dry, send, ir, wet, n):
    out = dry
    if np.any(send):
        out = dry + wet * dsp.convolve_ir(send, dsp.make_ir(ir))[:n]
    return out.astype(F32)


# ------------------------------------------------------------------ wind ---

def wind_street(params, sr=SR):
    """Hollow wind through empty streets, gusts, distant metal creaks and flapping."""
    rng = _rng(params, "wind_street")
    n = _n(params, sr)
    dur = n / sr
    g = gust_env(n, rng, rate=0.13, depth=0.8, power=1.6)
    out = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        gch = np.clip(g * (1.0 + 0.12 * smooth_noise(n, rng, 0.4)), 0.05, 1.3)
        body = dsp.moving_band_noise(n, rng, 300.0 * 2.0 ** (1.5 * gch), q=3.5, fmin=220.0, fmax=1100.0, per_oct=4.0, sr=sr)
        hiss = dsp.band_noise(n, rng, 1800.0, 6000.0, slope=-3.0) * gch ** 2 * 0.10
        out[:, ch] = body * gch * 0.8 + hiss
    rumble = lp(dsp.brown(n, rng), 160.0, 2, sr) * (0.5 + 0.5 * g) * 1.1
    out += rumble[:, None]
    fcw = 1100.0 * 2.0 ** (0.5 * smooth_noise(n, rng, 0.25))
    wh = dsp.moving_band_noise(n, rng, fcw, q=11.0, fmin=750.0, fmax=1800.0, per_oct=6.0, sr=sr)
    wh = wh * np.clip(g - 0.55, 0.0, 1.0) ** 2 * 0.9
    out += dsp.pan_curve(wh, 0.6 * smooth_noise(n, rng, 0.1))
    send = np.zeros((n, 2), dtype=np.float32)
    for t in _events(rng, dur, 12.0, first=rng.uniform(3.0, 8.0)):
        c = lp(creak(rng, rng.uniform(0.9, 1.8), "metal", sr), 2500.0, 1, sr)
        place(send, dsp.pan(c / (np.max(np.abs(c)) + 1e-9), rng.uniform(-0.8, 0.8)), int(t * sr), rng.uniform(0.1, 0.22))
    for t in _events(rng, dur, 9.0, first=rng.uniform(1.0, 6.0)):
        i = min(n - 1, int(t * sr))
        if g[i] < 0.45:
            continue  # tarps only flap when it gusts
        d = rng.uniform(1.0, 2.4)
        p = rng.uniform(-0.8, 0.8)
        tk = 0.0
        while tk < d:
            b = dsp.noise_burst(rng, 0.07, 0, rng.uniform(600.0, 1100.0), 0.02, sr=sr)
            place(out, dsp.pan(b, p), int((t + tk) * sr), 0.16 * float(g[i]) * rng.uniform(0.5, 1.0))
            tk += rng.uniform(0.075, 0.115)
    return _with_send(out + 0.35 * send, send, "street", 0.9, n)


def wind_high(params, sr=SR):
    """Open rooftop / aerial air: smooth, airy, no objects."""
    rng = _rng(params, "wind_high")
    n = _n(params, sr)
    g = gust_env(n, rng, rate=0.09, depth=0.55, power=1.2)
    out = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        fc = 900.0 * 2.0 ** (1.0 * (g - 0.5) + 0.3 * smooth_noise(n, rng, 0.3))
        body = dsp.moving_band_noise(n, rng, fc, q=1.3, fmin=500.0, fmax=2600.0, per_oct=2.5, sr=sr)
        air = dsp.band_noise(n, rng, 2500.0, 8000.0, slope=-4.0) * (0.5 + 0.5 * g) * 0.18
        out[:, ch] = body * g * 0.7 + air
    out += (lp(dsp.brown(n, rng), 120.0, 2, sr) * (0.6 + 0.4 * g) * 0.8)[:, None]
    return out


# ------------------------------------------------------------- interiors ---

def room_tone(params, sr=SR):
    """Quiet lived-in interior: faint fridge/electrical hum and air. params.clock adds a soft tick."""
    rng = _rng(params, "room_tone")
    n = _n(params, sr)
    tt = np.arange(n) / sr
    hum = np.zeros(n, dtype=np.float32)
    for k, a in enumerate((1.0, 0.5, 0.25, 0.1, 0.05), start=1):
        hum += (a * np.sin(TAU * 60.0 * k * tt + rng.uniform(0, TAU))).astype(F32)
    hum *= 1.0 + 0.08 * smooth_noise(n, rng, 0.07)
    buzz = bp(white(n, rng), 90.0, 420.0, 2, sr) * (0.6 + 0.4 * np.sin(TAU * 120.0 * tt)) * 0.5
    out = np.zeros((n, 2), dtype=np.float32)
    for ch, hg in enumerate((0.85, 1.0)):
        out[:, ch] = 0.25 * hg * (hum + buzz) + 0.16 * lp(dsp.pink(n, rng), 2500.0, 2, sr)
    if params.get("clock"):
        tick = dsp.modal([2600.0, 4200.0, 1100.0], [0.005, 0.004, 0.01], [1.0, 0.6, 0.5], 0.05, sr)
        tock = dsp.modal([2100.0, 3500.0, 950.0], [0.006, 0.004, 0.012], [1.0, 0.6, 0.6], 0.05, sr)
        st = [dsp.reverb(dsp.pan(k, 0.35), "room", wet=0.25) for k in (tick, tock)]
        for i in range(int(n / sr) + 1):
            place(out, st[i % 2], int((i + 0.5) * sr), 0.11)
    return out


def room_dead(params, sr=SR):
    """The same room with the power out: no hum, faint wind outside, an occasional creak."""
    rng = _rng(params, "room_dead")
    n = _n(params, sr)
    dur = n / sr
    g = gust_env(n, rng, rate=0.1, depth=0.85, power=2.0)
    out = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        out[:, ch] = lp(dsp.brown(n, rng), 260.0, 2, sr) * g * 0.9 + lp(dsp.pink(n, rng), 900.0, 2, sr) * 0.05
    moan = dsp.moving_band_noise(n, rng, 240.0 * 2.0 ** (0.3 * smooth_noise(n, rng, 0.15)), q=8.0, fmin=170.0,
                                 fmax=360.0, per_oct=6.0, sr=sr) * g ** 2 * 0.3
    out += moan[:, None]
    send = np.zeros((n, 2), dtype=np.float32)
    for t in _events(rng, dur, 11.0, first=rng.uniform(2.0, 7.0)):
        c = creak(rng, rng.uniform(0.35, 0.8), "wood", sr)
        place(send, dsp.pan(c / (np.max(np.abs(c)) + 1e-9), rng.uniform(-0.7, 0.7)), int(t * sr), rng.uniform(0.2, 0.42))
    for t in _events(rng, dur, 14.0, first=rng.uniform(5.0, 12.0)):
        f = rng.uniform(900.0, 2200.0)
        place(send, dsp.pan(dsp.modal([f, f * 1.7], [0.02, 0.01], [1.0, 0.4], 0.1, sr), rng.uniform(-0.7, 0.7)),
              int(t * sr), rng.uniform(0.1, 0.2))
    return _with_send(out + send, send, "room", 0.35, n)


def ruin_interior(params, sr=SR):
    """Hollow reverberant space: drips, a faint wind moan, small creaks."""
    rng = _rng(params, "ruin_interior")
    n = _n(params, sr)
    dur = n / sr
    g = gust_env(n, rng, rate=0.08, depth=0.8, power=1.8)
    out = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        out[:, ch] = lp(dsp.brown(n, rng), 130.0, 2, sr) * 0.6 + lp(dsp.pink(n, rng), 1200.0, 2, sr) * 0.04
    send = np.zeros((n, 2), dtype=np.float32)
    fc = 290.0 * 2.0 ** (0.45 * smooth_noise(n, rng, 0.12))
    moan = dsp.moving_band_noise(n, rng, fc, q=12.0, fmin=180.0, fmax=460.0, per_oct=8.0, sr=sr) * g ** 1.5
    send += dsp.pan_curve(moan * 0.35, 0.5 * smooth_noise(n, rng, 0.07))
    for t in _events(rng, dur, 3.6, first=rng.uniform(0.5, 3.0), jitter=0.7):
        place(send, dsp.pan(drip(rng, sr), rng.uniform(-0.85, 0.85)), int(t * sr), rng.uniform(0.2, 0.55))
    for t in _events(rng, dur, 17.0, first=rng.uniform(6.0, 14.0)):
        c = creak(rng, rng.uniform(0.5, 1.2), "metal" if rng.random() < 0.5 else "wood", sr)
        place(send, dsp.pan(c / (np.max(np.abs(c)) + 1e-9), rng.uniform(-0.8, 0.8)), int(t * sr), rng.uniform(0.08, 0.2))
    for t in _events(rng, dur, 21.0, first=rng.uniform(8.0, 18.0)):  # a pebble lets go somewhere
        f = rng.uniform(700.0, 1800.0)
        peb = dsp.modal([f, f * 2.2], [0.008, 0.005], [1.0, 0.5], 0.05, sr)
        p = rng.uniform(-0.8, 0.8)
        for k, dt in enumerate((0.0, rng.uniform(0.12, 0.2), rng.uniform(0.24, 0.34))):
            place(send, dsp.pan(peb, p), int((t + dt) * sr), 0.18 * 0.55 ** k)
    return _with_send(out + 0.5 * send, send, "ruin", 0.9, n)


# ----------------------------------------------------------------- water ---

def _stream(n, rng, sr=SR):
    mag = lambda f: dsp.mag_band(f, 200.0, 4500.0) * (0.5 + dsp.mag_peak(f, 900.0, 0.8)) * dsp.mag_slope(f, -2.0)
    flow = dsp.shaped_noise(n, rng, mag, sr) * (1.0 + 0.15 * smooth_noise(n, rng, 0.7))
    bub = np.zeros(n, dtype=np.float32)
    for _ in range(14):
        f0 = float(np.exp(rng.uniform(np.log(350.0), np.log(2600.0))))
        m = n_of(rng.uniform(0.008, 0.035), sr)
        tt = np.arange(m) / sr
        d = m / sr
        kern = np.sin(TAU * f0 * (1.0 + rng.uniform(0.3, 0.9) * tt / d) * tt) * np.exp(-tt / (d / 3.0))
        kern[:16] *= cos_ramp(16)
        bub += _poisson_layer(n, rng, 11.0, kern, 0.11, sr)
    return (0.5 * flow + bub + 0.5 * lp(dsp.brown(n, rng), 180.0, 2, sr)).astype(F32)


def river(params, sr=SR):
    """Flowing water with bubbling detail."""
    rng = _rng(params, "river")
    n = _n(params, sr)
    out = np.stack([_stream(n, rng, sr), _stream(n, rng, sr)], axis=1)
    hiss = np.stack([dsp.band_noise(n, rng, 3000.0, 8000.0, slope=-3.0) for _ in range(2)], axis=1) * 0.06
    return dsp.width(out + hiss, 0.8)


def rain(params, sr=SR):
    """Steady rain on roofs, metal and leaves, with drips. params: intensity 0..1."""
    rng = _rng(params, "rain")
    n = _n(params, sr)
    dur = n / sr
    inten = _f(params, "intensity", 0.5, 0.0, 1.0)
    out = np.zeros((n, 2), dtype=np.float32)
    wave = 1.0 + 0.18 * smooth_noise(n, rng, 0.2)
    hiss_mag = lambda f: dsp.mag_band(f, 500.0, 13000.0) * (0.35 + dsp.mag_peak(f, 4500.0, 0.7)) * dsp.mag_slope(f, -1.5)
    roof = dsp.modal([900.0, 1700.0], [0.003, 0.002], [1.0, 0.6], 0.02, sr)
    place(roof, dsp.noise_burst(rng, 0.006, 500.0, 3000.0, 0.002, sr=sr), 0, 0.6)
    leaf = dsp.noise_burst(rng, 0.02, 0, 1500.0, 0.005, sr=sr)
    for ch in range(2):
        hiss = dsp.shaped_noise(n, rng, hiss_mag, sr) * (0.12 + 0.3 * inten)
        r = _poisson_layer(n, rng, 90.0 + 500.0 * inten, roof, 0.1 + 0.16 * inten, sr)
        l = _poisson_layer(n, rng, 15.0 + 70.0 * inten, leaf, 0.06 + 0.08 * inten, sr)
        out[:, ch] = (hiss + r + l) * wave
    out += (lp(dsp.brown(n, rng), 220.0, 2, sr) * (0.12 + 0.12 * inten))[:, None]
    tins = []
    for _ in range(4):
        f = rng.uniform(1000.0, 1900.0)
        tins.append(dsp.modal([f, f * 2.1, f * 3.6], [rng.uniform(0.012, 0.025), 0.01, 0.006], [1.0, 0.5, 0.25], 0.12, sr))
    k = int(rng.poisson((1.5 + 8.0 * inten) * dur))
    for t in rng.uniform(0.0, dur, k):  # gutters and sheet metal
        place(out, dsp.pan(tins[int(rng.integers(0, 4))], rng.uniform(-0.9, 0.9)), int(t * sr),
              float(min(rng.lognormal(-2.6, 0.5), 0.25)))
    k = int(rng.poisson((0.5 + 1.2 * inten) * dur))
    for t in rng.uniform(0.0, dur, k):  # puddle drips
        place(out, dsp.pan(drip(rng, sr), rng.uniform(-0.8, 0.8)), int(t * sr), rng.uniform(0.04, 0.1))
    return out


# ----------------------------------------------------------------- birds ---

def _syll(rng, f0, f1, dur, bend=0.0, am=0.0, am_rate=0.0, sr=SR):
    n = n_of(dur, sr)
    u = np.linspace(0.0, 1.0, n)
    f = f0 * (f1 / f0) ** u + bend * f0 * np.sin(np.pi * u)
    a = env_ar(n, min(0.012, dur * 0.3), min(0.02, dur * 0.4), sr)
    if am > 0:
        a = a * (1.0 - am * (0.5 + 0.5 * np.sin(TAU * am_rate * u * dur)))
    y = tone(f, a, sr)
    if float(f.max()) * 2 < 11000.0:
        y = y + 0.04 * tone(2.0 * f, a, sr)
    return y.astype(F32)


def _join(parts, sr=SR):
    return dsp.sequence(parts, sr=sr)


def _phrase(kind, rng, sr=SR):
    ev = []
    t = 0.0
    if kind == "chirp":
        for _ in range(int(rng.integers(2, 6))):
            f = rng.uniform(4200.0, 5600.0)
            d = rng.uniform(0.05, 0.09)
            ev.append((t, _syll(rng, f, f * rng.uniform(0.62, 0.8), d, sr=sr), rng.uniform(0.6, 1.0)))
            t += d + rng.uniform(0.08, 0.22)
    elif kind == "cheep":
        for _ in range(int(rng.integers(1, 3))):
            f = rng.uniform(3300.0, 4300.0)
            ev.append((t, _syll(rng, f, f * 0.97, 0.11, bend=-0.16, sr=sr), rng.uniform(0.7, 1.0)))
            t += rng.uniform(0.22, 0.4)
    elif kind == "warble":
        for _ in range(int(rng.integers(5, 10))):
            f = rng.uniform(2200.0, 4400.0)
            d = rng.uniform(0.07, 0.2)
            tr = rng.random() < 0.3
            ev.append((t, _syll(rng, f, f * rng.uniform(0.8, 1.25), d, am=0.8 if tr else 0.0,
                                am_rate=rng.uniform(30.0, 45.0), sr=sr), rng.uniform(0.6, 1.0)))
            t += d + rng.uniform(0.02, 0.08)
    elif kind == "twonote":
        k = rng.uniform(0.92, 1.08)
        ev.append((0.0, _syll(rng, 3900.0 * k, 3850.0 * k, 0.34, sr=sr), 1.0))
        ev.append((0.44, _syll(rng, 3250.0 * k, 3200.0 * k, 0.4, sr=sr), 0.9))
    elif kind == "teacher":
        hi = rng.uniform(4300.0, 5000.0)
        lo = hi * rng.uniform(0.74, 0.82)
        for _ in range(int(rng.integers(3, 6))):
            ev.append((t, _syll(rng, hi, hi * 0.98, 0.1, sr=sr), 1.0))
            ev.append((t + 0.13, _syll(rng, lo, lo * 0.99, 0.12, sr=sr), 0.9))
            t += 0.31
    elif kind == "trill":
        f = rng.uniform(4200.0, 5400.0)
        rate = rng.uniform(13.0, 18.0)
        k = int(rng.integers(12, 24))
        for i in range(k):
            ev.append((t, _syll(rng, f, f * rng.uniform(0.8, 0.88), 0.035, sr=sr), 0.6 + 0.4 * np.sin(np.pi * i / k)))
            t += 1.0 / rate
    elif kind == "coo":
        f = rng.uniform(440.0, 520.0)
        for d, r in ((0.26, 1.0), (0.62, 1.08), (0.36, 1.0), (0.34, 0.98)):
            n = n_of(d, sr)
            a = env_ar(n, 0.06, min(0.12, d * 0.45), sr)
            fc = f * r * (1.0 + 0.04 * np.sin(np.pi * np.linspace(0, 1, n)))
            y = tone(fc, a, sr) + 0.08 * tone(2 * fc, a, sr) + 0.03 * dsp.band_noise(n, rng, 300.0, 900.0) * a
            ev.append((t, y.astype(F32), 1.0))
            t += d + 0.12
    else:  # "flute": mellow blackbird-like phrase with a little twitter at the end
        for _ in range(int(rng.integers(4, 8))):
            f = rng.uniform(1700.0, 2900.0)
            d = rng.uniform(0.12, 0.32)
            ev.append((t, _syll(rng, f, f * rng.uniform(0.86, 1.16), d, bend=rng.uniform(-0.05, 0.05), sr=sr), rng.uniform(0.7, 1.0)))
            t += d + rng.uniform(0.01, 0.05)
        if rng.random() < 0.6:
            for _ in range(2):
                f = rng.uniform(4000.0, 5000.0)
                ev.append((t, _syll(rng, f, f * 1.15, 0.05, sr=sr), 0.35))
                t += 0.08
    return _join(ev, sr)


_BIRD_KINDS = ("chirp", "cheep", "warble", "twonote", "teacher", "trill", "coo", "flute")
_BIRD_W = np.array([0.18, 0.08, 0.2, 0.08, 0.1, 0.08, 0.1, 0.18])


def _bird_layer(n, rng, density, kinds=None, far_bias=0.0, sr=SR):
    """Returns (dry, send) stereo buffers with a chorus of individual birds."""
    dur = n / sr
    dry = np.zeros((n, 2), dtype=np.float32)
    send = np.zeros((n, 2), dtype=np.float32)
    nb = int(round(4 + 10 * density))
    if kinds is None:
        kinds, w = _BIRD_KINDS, _BIRD_W / _BIRD_W.sum()
    else:
        w = np.ones(len(kinds)) / len(kinds)
    for _ in range(nb):
        kind = kinds[int(rng.choice(len(kinds), p=w))]
        far = float(np.clip(rng.uniform(0.0, 1.0) + far_bias, 0.0, 1.0))
        p = rng.uniform(-0.95, 0.95)
        gain = (1.0 - 0.8 * far) * rng.uniform(0.7, 1.0) * (0.55 if kind == "coo" else 1.0)
        songs = [lp(_phrase(kind, rng, sr), 12000.0 * (0.3 ** far), 1, sr) for _ in range(2)]  # each bird has its own repertoire
        gap = rng.uniform(2.5, 7.0) / (0.6 + density)
        t = rng.uniform(0.0, gap * 1.5)
        while t < dur - 0.1:
            s = dsp.pan(songs[int(rng.integers(0, 2))], p)
            place(dry, s, int(t * sr), gain)
            place(send, s, int(t * sr), gain * (0.2 + 0.6 * far))
            t += len(s) / sr + gap * rng.uniform(0.5, 1.6)
    return dry, send


def birds_day(params, sr=SR):
    """Songbird chorus. params: density 0..1."""
    rng = _rng(params, "birds_day")
    n = _n(params, sr)
    dry, send = _bird_layer(n, rng, _f(params, "density", 0.5, 0.0, 1.0), sr=sr)
    air = np.stack([lp(dsp.pink(n, rng), 3000.0, 1, sr) for _ in range(2)], axis=1) * 0.012
    return _with_send(dry + air, send, "forest", 0.7, n)


def forest(params, sr=SR):
    """Lush forest: many birds, insects, leaf rustle, distant water."""
    rng = _rng(params, "forest")
    n = _n(params, sr)
    dur = n / sr
    tt = np.arange(n) / sr
    dry, send = _bird_layer(n, rng, 0.8, far_bias=0.2, sr=sr)
    for ch in range(2):
        canopy = dsp.band_noise(n, rng, 1500.0, 7000.0, slope=-3.0) * gust_env(n, rng, rate=0.08, depth=0.7) * 0.05
        f = (5800.0, 6150.0)[ch] + 60.0 * smooth_noise(n, rng, 0.3)
        insects = tone(f, (0.5 + 0.5 * np.cos(TAU * 31.0 * tt)) ** 2 * (0.6 + 0.4 * smooth_noise(n, rng, 0.1)), sr) * 0.006
        dry[:, ch] += canopy + insects + lp(dsp.brown(n, rng), 150.0, 2, sr) * 0.03
    water = lp(_stream(n, rng, sr), 1400.0, 2, sr) * 0.035
    dry += dsp.pan(water, -0.45)
    knock = lp(dsp.modal([900.0, 1500.0], [0.006, 0.004], [1.0, 0.6], 0.04, sr), 4000.0, 1, sr)
    for t in _events(rng, dur, 32.0, first=rng.uniform(6.0, 20.0)):  # woodpecker
        p = rng.uniform(-0.8, 0.8)
        k = int(rng.integers(13, 19))
        rate = rng.uniform(19.0, 22.0)
        for i in range(k):
            place(send, dsp.pan(knock, p), int((t + i / rate) * sr), 0.22 * (1.0 - 0.6 * i / k))
    return _with_send(dry, send, "forest", 0.9, n)


def meadow(params, sr=SR):
    """Open grassland: grass in wind, insects, a few birds."""
    rng = _rng(params, "meadow")
    n = _n(params, sr)
    dur = n / sr
    dry, send = _bird_layer(n, rng, 0.15, kinds=("warble", "chirp", "trill", "flute"), far_bias=0.35, sr=sr)
    dry *= 0.6
    send *= 0.6
    g = gust_env(n, rng, rate=0.11, depth=0.75, power=1.4)
    for ch in range(2):
        gch = g * (1.0 + 0.15 * smooth_noise(n, rng, 0.5))
        dry[:, ch] += dsp.band_noise(n, rng, 800.0, 5000.0, slope=-3.0) * gch * 0.12
        dry[:, ch] += lp(dsp.brown(n, rng), 140.0, 2, sr) * (0.5 + 0.5 * g) * 0.12
    for _ in range(4):  # grasshoppers
        p = rng.uniform(-0.9, 0.9)
        lvl = rng.uniform(0.012, 0.035)
        fc = rng.uniform(4300.0, 6500.0)
        rate = rng.uniform(32.0, 48.0)
        for t in _events(rng, dur, rng.uniform(2.5, 5.0)):
            m = n_of(rng.uniform(0.4, 1.1), sr)
            tt = np.arange(m) / sr
            x = dsp.band_noise(m, rng, fc * 0.8, fc * 1.25) * (0.5 + 0.5 * np.cos(TAU * rate * tt)) ** 3 * env_ar(m, 0.08, 0.12, sr)
            place(dry, dsp.pan(x.astype(F32), p), int(t * sr), lvl)
    for t in _events(rng, dur, 15.0, first=rng.uniform(3.0, 12.0)):  # a bee drifts past
        m = n_of(rng.uniform(1.6, 3.0), sr)
        u = np.linspace(0.0, 1.0, m)
        f = rng.uniform(190.0, 240.0) * (1.03 - 0.06 * u) * (1.0 + 0.02 * smooth_noise(m, rng, 9.0))
        x = dsp.harmonic_voice(f, np.sin(np.pi * u) ** 2, None, tilt_db_oct=-5.0, fmax=3000.0, sr=sr)
        d = 1.0 if rng.random() < 0.5 else -1.0
        place(dry, dsp.pan_curve(x, d * (-0.9 + 1.8 * u)), int(t * sr), 0.03)
    return _with_send(dry, send, "forest", 0.5, n)


def night(params, sr=SR):
    """Night: crickets, soft wind, a rare distant owl."""
    rng = _rng(params, "night")
    n = _n(params, sr)
    dur = n / sr
    tt = np.arange(n) / sr
    out = np.zeros((n, 2), dtype=np.float32)
    for _ in range(6):  # chirping field crickets
        fc = rng.uniform(4000.0, 5000.0)
        period = rng.uniform(0.36, 0.62)
        pulses = int(rng.integers(3, 5))
        pp = rng.uniform(0.026, 0.036)
        shape = np.hanning(n_of(pp * 0.6, sr)).astype(F32)
        env = np.zeros(n, dtype=np.float32)
        t = rng.uniform(0.0, period)
        while t < dur:
            for k in range(pulses):
                place(env, shape, int((t + k * pp) * sr), 0.7 + 0.3 * k / pulses)
            t += period * rng.uniform(0.92, 1.12)
        voice = np.sin(TAU * fc * tt + rng.uniform(0, TAU)).astype(F32) * env
        out += dsp.pan(voice, rng.uniform(-0.9, 0.9)) * rng.uniform(0.02, 0.07)
    for ch in range(2):  # distant continuous tree crickets
        f = rng.uniform(2700.0, 3100.0)
        trill = np.sin(TAU * f * tt).astype(F32) * (0.5 + 0.5 * np.cos(TAU * rng.uniform(40.0, 47.0) * tt)) ** 2
        out[:, ch] += trill * (0.6 + 0.4 * smooth_noise(n, rng, 0.08)) * 0.012
        out[:, ch] += lp(dsp.brown(n, rng), 220.0, 2, sr) * gust_env(n, rng, rate=0.07, depth=0.6) * 0.1
        out[:, ch] += lp(dsp.pink(n, rng), 2000.0, 1, sr) * 0.01
    for t in _events(rng, dur, 36.0, first=rng.uniform(7.0, 18.0)):
        h = owl_hoot({"_seed": int(rng.integers(0, 2 ** 31)), "dist": 0.85}, sr)
        h = h / (np.max(np.abs(h)) + 1e-9)
        place(out, dsp.pan(h, rng.uniform(-0.6, 0.6)), int(t * sr), 0.09)
    return lp(out, 9000.0, 1, sr)


def space(params, sr=SR):
    """Deep soft drone for an Earth-from-orbit shot (D and A, to sit under the score)."""
    rng = _rng(params, "space")
    n = _n(params, sr)
    tt = np.arange(n) / sr
    out = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        for f, a in ((36.71, 0.5), (55.0, 0.7), (73.42, 1.0), (110.0, 0.5), (146.83, 0.25)):
            am = 0.75 + 0.25 * np.sin(TAU * rng.uniform(0.03, 0.08) * tt + rng.uniform(0, TAU))
            out[:, ch] += (a * am * np.sin(TAU * (f + rng.uniform(-0.15, 0.15)) * tt + rng.uniform(0, TAU))).astype(F32) * 0.2
        x = white(n, rng)
        glass = np.zeros(n, dtype=np.float32)
        for f in (293.66, 440.0, 587.33, 698.46):
            r = dsp.resonator(x, f, 70.0, sr)
            glass += r / _rms(r) * (0.5 + 0.5 * np.sin(TAU * rng.uniform(0.02, 0.06) * tt + rng.uniform(0, TAU)))
        out[:, ch] += glass * 0.012 + dsp.band_noise(n, rng, 2000.0, 5000.0, slope=-6.0) * 0.004
    return out


# ------------------------------------------------------------------ city ---

def _polyblep_saw(f0, sr=SR):
    dt = np.asarray(f0, dtype=np.float64) / sr
    t = np.mod(np.cumsum(dt), 1.0)
    saw = 2.0 * t - 1.0
    a = t < dt
    x = t[a] / dt[a]
    saw[a] -= x + x - x * x - 1.0
    b = t > 1.0 - dt
    x = (t[b] - 1.0) / dt[b]
    saw[b] -= x * x + x + x + 1.0
    return saw.astype(F32)


_VOWELS = ((700.0, 1200.0), (400.0, 2000.0), (500.0, 900.0), (300.0, 2400.0))


def _babble(n, rng, voices=7, sr=SR):
    """Unintelligible crowd murmur: a few voice-like sources with wandering
    pitch, syllable envelopes and vowel formants."""
    out = np.zeros((n, 2), dtype=np.float32)
    for _ in range(voices):
        f0 = rng.uniform(105.0, 235.0) * 2.0 ** (0.12 * smooth_noise(n, rng, 2.5))
        src = _polyblep_saw(f0, sr)
        syl = np.clip(smooth_noise(n, rng, 4.5) * 1.2 + 0.2, 0.0, 1.0) ** 1.5
        phrase = np.clip(smooth_noise(n, rng, 0.25) * 2.0 + 0.3, 0.0, 1.0)
        sel = smooth_noise(n, rng, 3.0) * 1.2
        v = np.zeros(n, dtype=np.float32)
        for i, (f1, f2) in enumerate(_VOWELS):
            w = np.exp(-0.5 * ((sel - (i - 1.5)) / 0.6) ** 2)
            v += w * (dsp.resonator(src, f1, 6.0, sr) + 0.6 * dsp.resonator(src, f2, 8.0, sr))
        out += dsp.pan(v * syl * phrase, rng.uniform(-0.85, 0.85)) * rng.uniform(0.5, 1.0)
    return lp(out, 3500.0, 1, sr)


def city_alive(params, sr=SR):
    """A pleasant living city: soft traffic hum, an occasional distant horn and
    bicycle bell, faint crowd babble, a few birds."""
    rng = _rng(params, "city_alive")
    n = _n(params, sr)
    dur = n / sr
    out = np.zeros((n, 2), dtype=np.float32)
    send = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        out[:, ch] += lp(dsp.brown(n, rng), 240.0, 2, sr) * 0.5 * (1.0 + 0.15 * smooth_noise(n, rng, 0.15))
        out[:, ch] += dsp.band_noise(n, rng, 300.0, 1400.0, slope=-4.0) * 0.05 * (1.0 + 0.3 * smooth_noise(n, rng, 0.2))
    for t in _events(rng, dur, 5.0, first=rng.uniform(0.0, 3.0), jitter=0.6):  # cars passing
        m = n_of(rng.uniform(3.0, 5.5), sr)
        u = np.linspace(0.0, 1.0, m)
        env = np.sin(np.pi * u) ** 2.5
        x = dsp.band_noise(m, rng, 250.0, 1900.0, slope=-3.0) * env
        f = rng.uniform(75.0, 120.0) * (1.03 - 0.06 * u)
        eng = dsp.harmonic_voice(f, env, None, tilt_db_oct=-8.0, fmax=900.0, sr=sr)
        d = 1.0 if rng.random() < 0.5 else -1.0
        place(out, dsp.pan_curve(x + 0.5 * eng, d * (-0.9 + 1.8 * u)), int(t * sr), rng.uniform(0.07, 0.16))
    for t in _events(rng, dur, 20.0, first=rng.uniform(5.0, 14.0)):  # a friendly distant horn
        f1 = rng.uniform(390.0, 440.0)
        p = rng.uniform(-0.8, 0.8)
        tk = 0.0
        for _ in range(int(rng.integers(1, 3))):
            m = n_of(rng.uniform(0.18, 0.4), sr)
            a = env_ar(m, 0.015, 0.05, sr)
            h = dsp.harmonic_voice(np.full(m, f1), a, None, tilt_db_oct=-5.0, fmax=2500.0, sr=sr) \
                + dsp.harmonic_voice(np.full(m, f1 * 1.26), a, None, tilt_db_oct=-5.0, fmax=2500.0, sr=sr)
            place(send, dsp.pan(lp(h, 1800.0, 1, sr), p), int((t + tk) * sr), 0.035)
            tk += m / sr + rng.uniform(0.08, 0.18)
    for t in _events(rng, dur, 22.0, first=rng.uniform(2.0, 16.0)):  # bicycle bell
        k = rng.uniform(0.92, 1.1)
        bell = dsp.modal([2800.0 * k, 4150.0 * k, 5600.0 * k, 7300.0 * k], [0.28, 0.2, 0.12, 0.08], [1.0, 0.6, 0.35, 0.15], 0.9, sr)
        place(bell, dsp.noise_burst(rng, 0.004, 2500.0, 8000.0, 0.001, sr=sr), 0, 0.5)
        p = rng.uniform(-0.7, 0.7)
        for j in range(int(rng.integers(1, 4))):
            place(out, dsp.pan(bell, p), int((t + 0.17 * j) * sr), 0.03)
            place(send, dsp.pan(bell, p), int((t + 0.17 * j) * sr), 0.012)
    bab = _babble(n, rng, sr=sr)
    out += bab * 0.07
    send += bab * 0.03
    bd, bs = _bird_layer(n, rng, 0.12, kinds=("chirp", "cheep", "coo", "chirp"), sr=sr)
    out += bd * 0.35
    send += bs * 0.3
    return _with_send(out + send, send, "street", 0.8, n)


GENERATORS = {
    "city_alive": city_alive, "room_tone": room_tone, "room_dead": room_dead, "wind_street": wind_street,
    "wind_high": wind_high, "night": night, "rain": rain, "birds_day": birds_day, "forest": forest,
    "meadow": meadow, "ruin_interior": ruin_interior, "river": river, "space": space,
}
