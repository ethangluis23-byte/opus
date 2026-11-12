"""Animal vocalisations and body sounds, synthesised with source-filter models.

Every generator is fn(params, sr=48000) -> float32 mono or stereo. Voiced sounds
are additive harmonic stacks (alias-free) with realistic pitch contours, jitter,
shimmer and sub-harmonics, shaped by time-varying formant envelopes; the breathy
part is noise through the same formants. Randomness comes from params["_seed"].
"""
from __future__ import annotations

import os

import numpy as np

from . import dsp
from .dsp import (SR, F32, TAU, bpc, cos_ramp, distance_fx, env_ar, exp_decay, fade, formant_noise,
                  harmonic_voice, lp, hp, bp, make_rng, n_of, place, sequence, smooth_noise, tone, white)


def _rng(params, name):
    return make_rng(name, params.get("_seed", 0))


def _f(params, key, default, lo=None, hi=None):
    try:
        v = float(params.get(key, default))
    except (TypeError, ValueError):
        v = float(default)
    if lo is not None:
        v = max(lo, v)
    if hi is not None:
        v = min(hi, v)
    return v


def _i(params, key, default, lo=1, hi=64):
    try:
        v = int(round(float(params.get(key, default))))
    except (TypeError, ValueError):
        v = int(default)
    return int(min(max(v, lo), hi))


def _rms(x):
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64))) + 1e-12)


def _mix_vn(v, nz, ratio):
    """Voiced + noise with a given noise/voiced RMS ratio."""
    return (v / _rms(v) + ratio * nz / _rms(nz)).astype(F32)


_SIZE = {"small": 0, "medium": 1, "large": 2}


def _size(params, default="medium"):
    s = params.get("size", default)
    if isinstance(s, (int, float)):
        return ("small", "medium", "large")[int(np.clip(round(float(s) * 2), 0, 2))]
    s = str(s).lower()
    return s if s in _SIZE else default


# ------------------------------------------------------------------ dogs ---

_DOG = {
    # peak f0 (Hz), vocal-tract scale (1 = ~15 cm tract), bark duration (s)
    "small": dict(f0=660.0, fs=1.55, dur=0.115),
    "medium": dict(f0=430.0, fs=1.12, dur=0.165),
    "large": dict(f0=250.0, fs=0.84, dur=0.235),
}


def _bark(rng, f0p, fs, dur, harsh, sr=SR):
    n = n_of(dur, sr)
    f0 = f0p * bpc(n, [(0, 0.70), (0.22, 1.0), (0.55, 0.93), (1.0, 0.60)])
    f0 = f0 * (1.0 + (0.02 + 0.05 * harsh) * smooth_noise(n, rng, 180.0))
    mouth = bpc(n, [(0, 0.70), (0.25, 1.0), (0.6, 1.0), (1.0, 0.76)])  # opens, then closes
    F = (600.0 * fs * mouth, 1700.0 * fs * (0.9 + 0.1 * mouth), 2900.0 * fs, 4100.0 * fs)
    B = (170.0 * fs, 280.0 * fs, 420.0 * fs, 560.0 * fs)
    G = (1.0, 0.75, 0.42, 0.22)
    u = np.linspace(0, 1, n)
    amp = env_ar(n, 0.010, dur * 0.30, sr) * np.exp(-1.1 * u)
    amp = amp * (1.0 + 0.12 * harsh * smooth_noise(n, rng, 90.0))
    v = harmonic_voice(f0, amp, (F, B, G), tilt_db_oct=-7.0, fmax=9000.0, sub=0.22 + 0.35 * harsh, sr=sr)
    nz = formant_noise(n, rng, F, tuple(b * 1.7 for b in B), (0.8, 0.9, 0.7, 0.5), tilt_db_oct=-2.0,
                       lo=300.0 * fs, hi=9000.0, sr=sr)
    pulse = 0.65 + 0.35 * np.sin(TAU * np.cumsum(f0) / sr)
    y = _mix_vn(v, nz * amp * pulse, 0.42 + 0.5 * harsh)
    k = n_of(0.006, sr)  # plosive-like onset
    y[:k] += 0.8 * white(k, rng) * cos_ramp(k, up=False) * _rms(y) * 2.0
    return fade(y, 0.002, 0.012, sr)


def dog_bark(params, sr=SR):
    """params: size small|medium|large, dist 0..1, count, urgency 0..1, space."""
    rng = _rng(params, "dog_bark")
    spec = _DOG[_size(params)]
    count = _i(params, "count", 2, 1, 16)
    urg = _f(params, "urgency", 0.4, 0.0, 1.0)
    dist = _f(params, "dist", 0.2, 0.0, 1.0)
    gap = 0.62 - 0.42 * urg
    f0p = spec["f0"] * (1.0 + 0.22 * urg) * rng.uniform(0.92, 1.08)
    ev = []
    t = 0.0
    for i in range(count):
        d = spec["dur"] * rng.uniform(0.86, 1.16) * (1.0 - 0.15 * urg)
        b = _bark(rng, f0p * rng.uniform(0.94, 1.06), spec["fs"], d, 0.35 + 0.55 * urg, sr)
        ev.append((t, b, float(rng.uniform(0.75, 1.0))))
        g = gap * rng.uniform(0.75, 1.3)
        if i % 2 == 0 and rng.random() < 0.5:
            g *= 0.55  # barks tend to come in pairs
        t += d + g
    return distance_fx(sequence(ev, sr=sr), dist, str(params.get("space", "street")))


def dog_whine(params, sr=SR):
    """params: count, dist, space."""
    rng = _rng(params, "dog_whine")
    count = _i(params, "count", 2, 1, 8)
    ev = []
    t = 0.0
    for i in range(count):
        dur = rng.uniform(0.5, 0.95)
        n = n_of(dur, sr)
        fpk = rng.uniform(980.0, 1350.0) * (0.94 ** i)
        tt = np.arange(n) / sr
        f0 = fpk * bpc(n, [(0, 0.62), (0.3, 0.96), (0.5, 1.0), (0.8, 0.9), (1.0, 0.58)])
        f0 = f0 * (1.0 + 0.012 * np.sin(TAU * 7.5 * tt + rng.uniform(0, TAU)) * np.linspace(0.2, 1, n))
        f0 = f0 * (1.0 + 0.006 * smooth_noise(n, rng, 30.0))
        amp = env_ar(n, 0.07, 0.2, sr) * (0.8 + 0.2 * smooth_noise(n, rng, 9.0))
        v = harmonic_voice(f0, amp, ((1100.0, 2600.0), (500.0, 800.0), (1.0, 0.5)), tilt_db_oct=-6.0,
                           fmax=8000.0, hgains=[1.0, 0.38, 0.22, 0.10, 0.05], sr=sr)
        breath = dsp.band_noise(n, rng, 1500.0, 5000.0) * amp
        y = _mix_vn(v, breath, 0.06)
        ev.append((t, fade(y, 0.01, 0.05, sr), float(rng.uniform(0.8, 1.0))))
        t += dur + rng.uniform(0.12, 0.3)
    return distance_fx(sequence(ev, sr=sr), _f(params, "dist", 0.15, 0, 1), str(params.get("space", "room")))


def dog_pant(params, sr=SR):
    """params: dur (s), rate (breaths/s), size."""
    rng = _rng(params, "dog_pant")
    dur = _f(params, "dur", 3.0, 0.3, 60.0)
    rate = _f(params, "rate", 4.2, 1.5, 8.0)
    fs = _DOG[_size(params)]["fs"]
    n = n_of(dur, sr)
    amp = np.zeros(n, dtype=np.float32)
    mix = np.zeros(n, dtype=np.float32)  # 0 = exhale formants, 1 = inhale formants
    t = 0.0
    while t < dur:
        per = (1.0 / rate) * rng.uniform(0.93, 1.07)
        a, b = int(t * sr), int((t + 0.54 * per) * sr)
        c, d = int((t + 0.60 * per) * sr), int((t + 0.95 * per) * sr)
        if b <= n and b - a > 16:  # exhale: quick rise, slower fall
            amp[a:b] = bpc(b - a, [(0, 0), (0.22, 1.0), (0.6, 0.6), (1.0, 0)]) * rng.uniform(0.85, 1.0)
        if d <= n and d - c > 16:  # inhale: softer, rises to the end
            amp[c:d] = bpc(d - c, [(0, 0), (0.6, 0.5), (0.85, 0.55), (1.0, 0)]) * rng.uniform(0.75, 1.0)
            mix[c:d] = 1.0
        t += per
    mix = lp(mix, 40.0, 1, sr)
    F = ((950.0 + 550.0 * mix) * fs, (1900.0 + 800.0 * mix) * fs, (3200.0 + 1000.0 * mix) * fs)
    y = formant_noise(n, rng, F, (500.0, 700.0, 1000.0), (1.0, 0.8, 0.5), tilt_db_oct=-3.0, lo=350.0, hi=8000.0, sr=sr)
    y = y * amp * (0.85 + 0.15 * smooth_noise(n, rng, 0.5))
    return fade(y, 0.02, 0.08, sr)


def _howl(rng, fpk, dur, sr=SR):
    n = n_of(dur, sr)
    tt = np.arange(n) / sr
    drift = rng.uniform(-0.05, 0.06)
    f0 = fpk * bpc(n, [(0, 0.60), (0.08, 0.90), (0.16, 1.0), (0.55, 1.0 + drift), (0.78, 0.97 + drift), (1.0, 0.70)])
    f0 = f0 * (1.0 + 0.006 * np.sin(TAU * 5.3 * tt + rng.uniform(0, TAU)) * np.linspace(0.3, 1.0, n))
    f0 = f0 * (1.0 + 0.004 * smooth_noise(n, rng, 8.0))
    amp = bpc(n, [(0, 0), (0.07, 0.7), (0.2, 1.0), (0.7, 0.9), (1.0, 0)]) * (1.0 + 0.08 * smooth_noise(n, rng, 6.0))
    mouth = bpc(n, [(0, 0.3), (0.2, 1.0), (0.8, 1.0), (1.0, 0.5)])
    F = (560.0 + 220.0 * mouth, 1250.0, 2500.0)
    v = harmonic_voice(f0, amp, (F, (220.0, 320.0, 500.0), (1.0, 0.5, 0.2)), tilt_db_oct=-10.0, fmax=6000.0, sr=sr)
    breath = dsp.band_noise(n, rng, 600.0, 3000.0) * amp
    return fade(_mix_vn(v, breath, 0.04), 0.02, 0.1, sr)


def dog_howl(params, sr=SR):
    """params: count (pack size), dist, space. Returns stereo."""
    rng = _rng(params, "dog_howl")
    count = _i(params, "count", 3, 1, 9)
    dist = _f(params, "dist", 0.6, 0.0, 1.0)
    ratios = [1.0, 0.84, 1.19, 0.75, 1.33, 0.92, 1.1, 0.67, 1.26]
    base = rng.uniform(470.0, 560.0)
    ev = []
    t = 0.0
    for i in range(count):
        dur = rng.uniform(2.3, 4.0)
        h = _howl(rng, base * ratios[i] * rng.uniform(0.97, 1.03), dur, sr)
        p = 0.0 if count == 1 else rng.uniform(-0.75, 0.75)
        ev.append((t, dsp.pan(h, p), float(rng.uniform(0.6, 1.0)) if i else 1.0))
        t += rng.uniform(0.5, 1.3)
    return distance_fx(sequence(ev, sr=sr, stereo=True), dist, str(params.get("space", "open")))


def dog_growl(params, sr=SR):
    """params: dur, size, dist."""
    rng = _rng(params, "dog_growl")
    dur = _f(params, "dur", 1.6, 0.3, 12.0)
    fs = _DOG[_size(params, "large")]["fs"]
    n = n_of(dur, sr)
    tt = np.arange(n) / sr
    f0 = 108.0 / fs ** 0.5 * (1.0 + 0.05 * smooth_noise(n, rng, 3.0)) * (1.0 + 0.06 * smooth_noise(n, rng, 45.0))
    roll = 0.72 + 0.28 * np.sin(TAU * (26.0 * tt + 0.3 * np.cumsum(smooth_noise(n, rng, 4.0)) / sr * 20.0))
    amp = bpc(n, [(0, 0), (0.25, 0.8), (0.6, 1.0), (0.85, 0.8), (1.0, 0)]) * roll
    amp = amp * (1.0 + 0.15 * smooth_noise(n, rng, 50.0))
    F = (430.0 * fs, 1250.0 * fs, 2350.0 * fs, 3500.0 * fs)
    B = (180.0, 300.0, 450.0, 600.0)
    v = harmonic_voice(f0, amp, (F, B, (1.0, 0.6, 0.35, 0.18)), tilt_db_oct=-5.0, fmax=5500.0, sub=0.3, sr=sr)
    nz = formant_noise(n, rng, F, tuple(b * 1.5 for b in B), (0.7, 0.9, 0.7, 0.4), tilt_db_oct=-3.0, lo=250.0, hi=6000.0, sr=sr)
    y = _mix_vn(v, nz * amp, 0.4)
    return distance_fx(fade(y, 0.03, 0.12, sr), _f(params, "dist", 0.1, 0, 1), str(params.get("space", "street")))


def puppy_yip(params, sr=SR):
    """params: count, dist, space."""
    rng = _rng(params, "puppy_yip")
    count = _i(params, "count", 2, 1, 12)
    ev = []
    t = 0.0
    base = rng.uniform(1000.0, 1250.0)
    for i in range(count):
        dur = rng.uniform(0.085, 0.13)
        n = n_of(dur, sr)
        f0 = base * rng.uniform(0.93, 1.1) * bpc(n, [(0, 0.72), (0.35, 1.0), (0.7, 0.95), (1.0, 0.76)])
        f0 = f0 * (1.0 + 0.012 * smooth_noise(n, rng, 120.0))
        mouth = bpc(n, [(0, 0.75), (0.3, 1.0), (1.0, 0.8)])
        F = (1350.0 * mouth, 3600.0, 5600.0)
        B = (350.0, 600.0, 900.0)
        amp = env_ar(n, 0.007, dur * 0.4, sr)
        v = harmonic_voice(f0, amp, (F, B, (1.0, 0.6, 0.25)), tilt_db_oct=-9.0, fmax=9000.0, sub=0.08, sr=sr)
        nz = formant_noise(n, rng, F, (600.0, 900.0, 1200.0), (0.8, 0.8, 0.5), lo=600.0, hi=9000.0, sr=sr) * amp
        ev.append((t, fade(_mix_vn(v, nz, 0.22), 0.002, 0.01, sr), float(rng.uniform(0.75, 1.0))))
        t += dur + rng.uniform(0.16, 0.36)
    return distance_fx(sequence(ev, sr=sr), _f(params, "dist", 0.15, 0, 1), str(params.get("space", "room")))


def sniff(params, sr=SR):
    """params: count, size."""
    rng = _rng(params, "sniff")
    count = _i(params, "count", 4, 1, 40)
    size = _size(params)
    k = {"small": 1.4, "medium": 1.0, "large": 0.82}[size]
    ev = []
    t = 0.0
    for i in range(count):
        dur = rng.uniform(0.085, 0.14)
        n = n_of(dur, sr)
        up = np.linspace(0.0, 1.0, n)
        F = ((1900.0 + 900.0 * up) * k, 3600.0 * k, 900.0 * k)
        x = formant_noise(n, rng, F, (900.0, 1500.0, 500.0), (1.0, 0.6, 0.35), tilt_db_oct=-2.0, lo=500.0, hi=9000.0, sr=sr)
        env = bpc(n, [(0, 0), (0.45, 0.8), (0.7, 1.0), (1.0, 0)])
        ev.append((t, (x * env).astype(F32), float(rng.uniform(0.6, 1.0))))
        t += dur + (rng.uniform(0.04, 0.09) if i % 2 == 0 else rng.uniform(0.12, 0.3))
    return fade(sequence(ev, sr=sr), 0.003, 0.01, sr)


# ------------------------------------------------------------------ cats ---

def _meow(rng, mood, sr=SR):
    if mood == "sad":
        dur = rng.uniform(1.05, 1.4)
        fpk = rng.uniform(600.0, 720.0)
        f0c = [(0, 0.78), (0.15, 1.0), (0.5, 0.93), (0.8, 0.78), (1.0, 0.62)]
        ampc = [(0, 0), (0.1, 0.6), (0.3, 1.0), (0.6, 0.8), (1.0, 0)]
        openc = [(0, 0.15), (0.2, 0.8), (0.4, 1.0), (0.7, 0.6), (1.0, 0.15)]
    else:
        dur = rng.uniform(0.44, 0.62)
        fpk = rng.uniform(640.0, 780.0)
        f0c = [(0, 0.70), (0.3, 0.78), (0.75, 1.0), (1.0, 0.96)]
        ampc = [(0, 0), (0.15, 0.8), (0.6, 1.0), (1.0, 0)]
        openc = [(0, 0.2), (0.4, 0.9), (0.7, 1.0), (1.0, 0.5)]
    n = n_of(dur, sr)
    tt = np.arange(n) / sr
    o = bpc(n, openc)
    F = (520.0 + 880.0 * o, bpc(n, [(0, 2650.0), (0.35, 2050.0), (1.0, 1300.0)]), 4300.0, 6000.0)
    B = (160.0, 280.0, 450.0, 700.0)
    f0 = fpk * bpc(n, f0c) * (1.0 + 0.005 * smooth_noise(n, rng, 40.0))
    if mood == "sad":
        f0 = f0 * (1.0 + 0.013 * np.sin(TAU * 5.6 * tt) * np.linspace(0.0, 1.0, n) ** 1.5)
    amp = bpc(n, ampc) * (1.0 + 0.05 * smooth_noise(n, rng, 20.0))
    if mood != "sad":  # short chirruped onset: "mrr-ow?"
        k = min(n, n_of(0.11, sr))
        amp[:k] *= 0.3 + 0.7 * np.abs(np.sin(np.pi * 27.0 * tt[:k]))
    v = harmonic_voice(f0, amp, (F, B, (1.0, 0.8, 0.45, 0.25)), tilt_db_oct=-8.0, fmax=9000.0, sub=0.06, sr=sr)
    nz = formant_noise(n, rng, F, tuple(b * 1.5 for b in B), (0.6, 0.9, 0.7, 0.4), lo=400.0, hi=9000.0, sr=sr) * amp
    return fade(_mix_vn(v, nz, 0.13), 0.01, 0.04, sr)


def cat_meow(params, sr=SR):
    """params: mood curious|sad, dist, space."""
    rng = _rng(params, "cat_meow")
    mood = str(params.get("mood", "curious")).lower()
    y = _meow(rng, "sad" if mood in ("sad", "plaintive", "lonely") else "curious", sr)
    return distance_fx(y, _f(params, "dist", 0.15, 0, 1), str(params.get("space", "room")))


def cat_purr(params, sr=SR):
    """params: dur."""
    rng = _rng(params, "cat_purr")
    dur = _f(params, "dur", 4.0, 0.5, 120.0)
    n = n_of(dur, sr)
    cyc = 2.7
    t = 0.0
    rate = np.full(n, 25.0, dtype=np.float32)
    env = np.zeros(n, dtype=np.float32)
    while t < dur:
        c = cyc * rng.uniform(0.92, 1.08)
        a, b = int(t * sr), min(n, int((t + 0.39 * c) * sr))          # inhale
        e, f = min(n, int((t + 0.43 * c) * sr)), min(n, int((t + 0.95 * c) * sr))  # exhale
        if b > a:
            env[a:b] = 0.62 * env_ar(b - a, 0.09, 0.09, sr)
            rate[a:b] = 23.5
        if f > e:
            env[e:f] = env_ar(f - e, 0.09, 0.12, sr)
            rate[e:f] = 26.5
        t += c
    rate = rate * (1.0 + 0.04 * smooth_noise(n, rng, 6.0))
    ph = np.cumsum(rate) / sr
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    imp = np.zeros(n, dtype=np.float32)
    imp[idx] = env[idx] * (1.0 + 0.12 * rng.standard_normal(len(idx)))
    kern = dsp.modal([110.0, 240.0, 470.0, 820.0], [0.016, 0.011, 0.007, 0.004], [1.0, 0.8, 0.5, 0.25], 0.07, sr)
    kern[:n_of(0.012, sr)] += 0.25 * dsp.noise_burst(rng, 0.012, 0, 1200.0, 0.004, sr=sr)
    y = dsp.conv_same(imp, kern)
    breath = dsp.band_noise(n, rng, 300.0, 2000.0) * env * 0.02 * float(np.max(np.abs(y)) + 1e-9)
    return fade(lp(y + breath, 2600.0, 2, sr), 0.05, 0.2, sr)


def cat_hiss(params, sr=SR):
    """params: dur, dist."""
    rng = _rng(params, "cat_hiss")
    dur = _f(params, "dur", 0.9, 0.3, 4.0)
    n = n_of(dur, sr)
    mag = lambda f: dsp.mag_band(f, 1500.0, 11000.0, 2) * (0.25 + dsp.mag_peak(f, 5500.0, 1.2) +
                                                         0.5 * dsp.mag_peak(f, 2900.0, 3.0) + 0.6 * dsp.mag_peak(f, 8500.0, 2.5))
    x = dsp.shaped_noise(n, rng, mag, sr)
    env = bpc(n, [(0, 0), (0.02, 1.0), (0.1, 0.62), (0.7, 0.42), (1.0, 0)])
    env = env * (1.0 + 0.15 * smooth_noise(n, rng, 25.0))
    y = fade(x * env, 0.004, 0.08, sr)
    return distance_fx(y, _f(params, "dist", 0.1, 0, 1), str(params.get("space", "room")))


def pounce(params, sr=SR):
    """Soft landing thud with a rustle. params: surface floor|grass|leaves."""
    rng = _rng(params, "pounce")
    surface = str(params.get("surface", "grass"))
    n = n_of(0.75, sr)
    y = np.zeros(n, dtype=np.float32)
    pre = dsp.band_noise(n_of(0.22, sr), rng, 900.0, 5000.0) * bpc(n_of(0.22, sr), [(0, 0), (0.8, 1.0), (1.0, 0.2)])
    place(y, pre, 0, 0.16)  # the leap: a quick swish
    t0 = n_of(0.22, sr)
    thud = dsp.modal([82.0, 131.0], [0.05, 0.03], [1.0, 0.5], 0.3, sr)
    place(thud, dsp.noise_burst(rng, 0.12, 0, 380.0, 0.03, sr=sr), 0, 0.5)
    place(y, thud, t0, 1.0)
    lo, hi = (1500.0, 8000.0) if surface == "leaves" else ((700.0, 3500.0) if surface == "floor" else (1000.0, 5500.0))
    m = n_of(0.4, sr)
    rust = dsp.band_noise(m, rng, lo, hi) * exp_decay(m, 0.09, sr) * (1.0 + 0.5 * smooth_noise(m, rng, 30.0))
    place(y, rust.astype(F32), t0, 0.3)
    return fade(y, 0.01, 0.05, sr)


def mouse_squeak(params, sr=SR):
    """params: count."""
    rng = _rng(params, "mouse_squeak")
    count = _i(params, "count", 3, 1, 12)
    ev = []
    t = 0.0
    for i in range(count):
        dur = rng.uniform(0.045, 0.085)
        n = n_of(dur, sr)
        f = rng.uniform(3900.0, 4700.0) * bpc(n, [(0, 0.9), (0.25, 1.0), (1.0, 0.76)])
        amp = env_ar(n, 0.005, dur * 0.5, sr)
        y = tone(f, amp, sr) + 0.15 * tone(2.0 * f, amp, sr)
        ev.append((t, y.astype(F32), float(0.9 ** i * rng.uniform(0.8, 1.0))))
        t += dur + rng.uniform(0.05, 0.12)
    return distance_fx(lp(sequence(ev, sr=sr), 9000.0, 2, sr), _f(params, "dist", 0.2, 0, 1), str(params.get("space", "room")))


# ----------------------------------------------------------------- birds ---

def _squawk(rng, f0p=None, dur=None, rough=0.85, sr=SR):
    f0p = f0p or rng.uniform(950.0, 1350.0)
    dur = dur or rng.uniform(0.32, 0.55)
    n = n_of(dur, sr)
    f0 = f0p * bpc(n, [(0, 0.78), (0.12, 1.0), (0.6, 0.96), (1.0, 0.74)]) * (1.0 + 0.015 * smooth_noise(n, rng, 60.0))
    fm = rng.uniform(105.0, 165.0) * (1.0 + 0.12 * smooth_noise(n, rng, 12.0))
    am = 1.0 - rough + rough * np.abs(np.sin(np.pi * np.cumsum(fm) / sr)) ** 1.5  # the rasp
    amp = env_ar(n, 0.006, min(0.07, dur * 0.4), sr) * bpc(n, [(0, 0.8), (0.2, 1.0), (0.7, 0.9), (1.0, 0.5)]) * am
    fm_ = ((2300.0, 3700.0, 5600.0), (700.0, 900.0, 1200.0), (1.0, 0.7, 0.3))
    v = harmonic_voice(f0, amp, fm_, tilt_db_oct=-3.0, fmax=8500.0, sr=sr)
    nz = formant_noise(n, rng, *fm_, lo=1200.0, hi=8500.0, sr=sr) * amp
    return fade(lp(_mix_vn(v, nz, 0.5), 8000.0, 2, sr), 0.002, 0.02, sr)


def parrot_squawk(params, sr=SR):
    """params: dist, count, space."""
    rng = _rng(params, "parrot_squawk")
    count = _i(params, "count", 1, 1, 8)
    ev = []
    t = 0.0
    f0p = rng.uniform(980.0, 1300.0)
    for i in range(count):
        s = _squawk(rng, f0p * rng.uniform(0.94, 1.06), None, 0.85, sr)
        ev.append((t, s, float(rng.uniform(0.75, 1.0))))
        t += len(s) / sr + rng.uniform(0.08, 0.3)
    return distance_fx(sequence(ev, sr=sr), _f(params, "dist", 0.3, 0, 1), str(params.get("space", "street")))


def _contact_call(rng, sr=SR):
    dur = rng.uniform(0.1, 0.2)
    n = n_of(dur, sr)
    f = rng.uniform(1700.0, 2300.0) * bpc(n, [(0, 0.8), (0.6, 1.25), (1.0, 1.15)])
    amp = env_ar(n, 0.01, dur * 0.4, sr) * (0.8 + 0.2 * np.sin(TAU * 38.0 * np.arange(n) / sr))
    return (tone(f, amp, sr) + 0.3 * tone(2 * f, amp, sr) + 0.1 * tone(3 * f, amp, sr)).astype(F32)


def parrot_flock(params, sr=SR):
    """A noisy colony. params: dur, count (birds), dist. Returns stereo."""
    rng = _rng(params, "parrot_flock")
    dur = _f(params, "dur", 5.0, 0.5, 60.0)
    count = _i(params, "count", 8, 1, 40)
    dist = _f(params, "dist", 0.45, 0.0, 1.0)
    n = n_of(dur, sr)
    dry = np.zeros((n, 2), dtype=np.float32)
    for b in range(count):
        p = rng.uniform(-0.9, 0.9)
        far = rng.uniform(0.2, 1.0)
        pitch = rng.uniform(0.85, 1.35)
        t = rng.uniform(0.0, 1.6)
        while t < dur - 0.15:
            kind = rng.random()
            if kind < 0.4:
                s = _squawk(rng, 1100.0 * pitch * rng.uniform(0.95, 1.05), rng.uniform(0.2, 0.42), 0.8, sr)
            elif kind < 0.75:
                parts = []
                tt = 0.0
                for _ in range(int(rng.integers(2, 5))):
                    c = _squawk(rng, 1500.0 * pitch * rng.uniform(0.9, 1.2), rng.uniform(0.07, 0.14), 0.55, sr)
                    parts.append((tt, c, float(rng.uniform(0.6, 1.0))))
                    tt += len(c) / sr + rng.uniform(0.02, 0.07)
                s = sequence(parts, sr=sr)
            else:
                s = _contact_call(rng, sr)
            s = lp(s, 9000.0 * (0.35 ** far) + 1500.0, 1, sr)
            place(dry, dsp.pan(s, p), int(t * sr), (1.0 - 0.7 * far) * rng.uniform(0.6, 1.0))
            t += len(s) / sr + rng.uniform(0.5, 2.4)
    dry *= dsp.env_ar(n, min(0.5, dur / 4), min(0.9, dur / 3), sr)[:, None]
    return distance_fx(dry, dist, str(params.get("space", "open")))


def parrot_talk(params, sr=SR):
    """Plays build/audio/parrot/<id>.wav with light room reverb; squawks if missing."""
    path = params.get("_file")
    if not path:
        path = os.path.join(str(params.get("_root", ".")), "build", "audio", "parrot", f"{params.get('id', '')}.wav")
    try:
        import soundfile as sf
        x, fs = sf.read(path, dtype="float32", always_2d=False)
        if x.ndim == 2:
            x = x.mean(axis=1)
        x = dsp.resample_to(x, fs, sr)
        if len(x) < 64 or not np.any(x):
            raise ValueError("empty parrot file")
    except Exception:
        q = dict(params)
        q.setdefault("dist", 0.15)
        q.setdefault("space", "room")
        return parrot_squawk(q, sr)
    x = hp(fade(x, 0.003, 0.01, sr), 180.0, 2, sr)
    return dsp.reverb(x, "room", wet=_f(params, "wet", 0.16, 0, 1), dry=1.0)


def wing_flaps(params, sr=SR):
    """params: dur, size small|medium|large. Returns stereo (drifts across)."""
    rng = _rng(params, "wing_flaps")
    dur = _f(params, "dur", 1.5, 0.2, 20.0)
    size = _size(params)
    rate, lo, hi = {"small": (11.0, 700.0, 6000.0), "medium": (7.5, 350.0, 3600.0), "large": (4.6, 160.0, 2300.0)}[size]
    n = n_of(dur, sr)
    y = np.zeros(n, dtype=np.float32)
    t = 0.0
    while t < dur - 0.02:
        per = (1.0 / rate) * rng.uniform(0.9, 1.1)
        m = n_of(per * 0.62, sr)
        down = dsp.band_noise(m, rng, lo, hi) * bpc(m, [(0, 0), (0.25, 1.0), (1.0, 0)])
        k = n_of(per * 0.32, sr)
        up = dsp.band_noise(k, rng, lo * 1.5, hi) * bpc(k, [(0, 0), (0.5, 1.0), (1.0, 0)])
        place(y, down.astype(F32), int(t * sr), rng.uniform(0.8, 1.0))
        place(y, up.astype(F32), int((t + per * 0.62) * sr), 0.35)
        if size == "large":
            place(y, dsp.modal([70.0], [0.03], [1.0], 0.1, sr), int(t * sr), 0.5)
        t += per
    u = np.linspace(0.0, 1.0, n)
    y = y * (0.35 + 0.65 * np.exp(-2.2 * u)) * env_ar(n, 0.02, min(0.3, dur / 3), sr)
    p0 = rng.uniform(-0.5, 0.5)
    return dsp.pan_curve(y, p0 + (0.9 if p0 < 0 else -0.9) * u)


def hawk_cry(params, sr=SR):
    """Hoarse descending scream, usually far away. params: dist."""
    rng = _rng(params, "hawk_cry")
    dur = rng.uniform(1.7, 2.3)
    n = n_of(dur, sr)
    f0 = rng.uniform(3000.0, 3400.0) * bpc(n, [(0, 0.90), (0.07, 1.0), (0.6, 0.84), (1.0, 0.62)])
    f0 = f0 * (1.0 + 0.01 * smooth_noise(n, rng, 70.0))
    rasp = np.clip(1.0 + 0.55 * smooth_noise(n, rng, 260.0), 0.15, 2.0)
    amp = bpc(n, [(0, 0), (0.03, 1.0), (0.5, 0.75), (0.85, 0.4), (1.0, 0)]) * rasp
    v = harmonic_voice(f0, amp, None, tilt_db_oct=-12.0, fmax=9500.0, hgains=[1.0, 0.5, 0.2], sr=sr)
    nz = formant_noise(n, rng, (f0, 2.0 * f0), (900.0, 1500.0), (1.0, 0.3), lo=1500.0, hi=9000.0, sr=sr) * amp
    y = fade(_mix_vn(v, nz, 0.45), 0.004, 0.1, sr)
    return distance_fx(y, _f(params, "dist", 0.6, 0, 1), str(params.get("space", "open")))


def owl_hoot(params, sr=SR):
    """Great-horned-owl style hoot phrase. params: dist."""
    rng = _rng(params, "owl_hoot")
    f = rng.uniform(325.0, 365.0)
    pattern = [(0.0, 0.40), (0.66, 0.14), (0.86, 0.30), (1.52, 0.38), (2.2, 0.44)]
    ev = []
    for t0, d in pattern:
        d *= rng.uniform(0.92, 1.08)
        n = n_of(d, sr)
        fc = f * rng.uniform(0.985, 1.015) * bpc(n, [(0, 0.96), (0.3, 1.0), (1.0, 0.95)])
        amp = env_ar(n, 0.05, min(0.1, d * 0.45), sr)
        y = tone(fc, amp, sr) + 0.08 * tone(2 * fc, amp, sr) + 0.03 * tone(3 * fc, amp, sr)
        y = y + 0.04 * dsp.band_noise(n, rng, 300.0, 800.0) * amp
        ev.append((t0 * rng.uniform(0.97, 1.03), y.astype(F32), float(rng.uniform(0.8, 1.0))))
    return distance_fx(sequence(ev, sr=sr), _f(params, "dist", 0.6, 0, 1), str(params.get("space", "forest")))


# --------------------------------------------------------- small animals ---

def rabbit_thump(params, sr=SR):
    """Hind-foot alarm thump. params: count, surface."""
    rng = _rng(params, "rabbit_thump")
    count = _i(params, "count", 1, 1, 6)
    ev = []
    t = 0.0
    for _ in range(count):
        n = n_of(0.3, sr)
        tt = np.arange(n) / sr
        f = 58.0 + 60.0 * np.exp(-tt / 0.018)
        body = tone(f, exp_decay(n, 0.055, sr), sr)
        body[:48] *= cos_ramp(48)
        dirt = dsp.noise_burst(rng, 0.1, 150.0, 1400.0, 0.02, sr=sr)
        y = body.copy()
        place(y, dirt, 0, 0.3)
        ev.append((t, y, float(rng.uniform(0.8, 1.0))))
        t += rng.uniform(0.28, 0.5)
    return fade(sequence(ev, sr=sr), 0.001, 0.03, sr)


def hop(params, sr=SR):
    """Rabbit hops. params: count, surface grass|leaves|floor|asphalt."""
    rng = _rng(params, "hop")
    count = _i(params, "count", 3, 1, 30)
    surface = str(params.get("surface", "grass"))
    lo, hi = {"grass": (1200.0, 5500.0), "leaves": (1800.0, 8500.0)}.get(surface, (500.0, 2500.0))
    ev = []
    t = 0.0
    for _ in range(count):
        n = n_of(0.22, sr)
        y = np.zeros(n, dtype=np.float32)
        for k, dt in enumerate((0.0, rng.uniform(0.025, 0.045))):  # hind feet land almost together
            th = dsp.modal([rng.uniform(95.0, 125.0)], [0.022], [1.0], 0.1, sr)
            place(y, th, int(dt * sr), 0.8 if k == 0 else 0.6)
        m = n_of(0.16, sr)
        sw = dsp.band_noise(m, rng, lo, hi) * bpc(m, [(0, 0), (0.2, 1.0), (1.0, 0)])
        place(y, sw.astype(F32), 0, 0.35 if surface in ("grass", "leaves") else 0.12)
        ev.append((t, y, float(rng.uniform(0.7, 1.0))))
        t += rng.uniform(0.26, 0.42)
    return fade(sequence(ev, sr=sr), 0.002, 0.03, sr)


def munch(params, sr=SR):
    """A rabbit crunching a carrot. params: dur."""
    rng = _rng(params, "munch")
    dur = _f(params, "dur", 2.5, 0.3, 30.0)
    n = n_of(dur, sr)
    imp = np.zeros(n, dtype=np.float32)
    t = 0.05
    burst_left = int(rng.integers(5, 10))
    while t < dur - 0.08:
        strength = rng.uniform(0.55, 1.0)
        k = int(rng.integers(5, 12))
        offs = np.sort(rng.exponential(0.014, k))
        offs[0] = 0.0
        for j, o in enumerate(offs):
            i = int((t + o) * sr)
            if i < n:
                imp[i] += strength * (1.0 if j == 0 else rng.uniform(0.15, 0.6)) * rng.choice([-1.0, 1.0])
        burst_left -= 1
        if burst_left <= 0:
            t += rng.uniform(0.35, 0.7)  # swallow / reposition
            burst_left = int(rng.integers(5, 10))
        else:
            t += rng.uniform(0.15, 0.21)
    kern = dsp.modal([1250.0, 2600.0, 4400.0, 6300.0], [0.0035, 0.0028, 0.002, 0.0015], [1.0, 0.9, 0.6, 0.3], 0.03, sr)
    place(kern, dsp.noise_burst(rng, 0.004, 1500.0, 9000.0, 0.0012, sr=sr), 0, 0.8)
    crisp = dsp.conv_same(imp, kern)
    jaw = dsp.conv_same(np.abs(imp) * (np.abs(imp) > 0.5), dsp.modal([310.0], [0.012], [1.0], 0.06, sr))
    y = crisp + 0.25 * jaw
    return fade(lp(y, 9500.0, 2, sr), 0.005, 0.05, sr)


def hamster_wheel(params, sr=SR):
    """Plastic wheel rattle with a tiny rhythmic squeak. params: dur, speed (rev/s)."""
    rng = _rng(params, "hamster_wheel")
    dur = _f(params, "dur", 4.0, 0.5, 120.0)
    rev = _f(params, "speed", 2.4, 0.8, 5.0)
    n = n_of(dur, sr)
    tt = np.arange(n) / sr
    speed = rev * (1.0 + 0.05 * smooth_noise(n, rng, 0.6))
    ph = np.cumsum(speed) / sr
    roll = dsp.band_noise(n, rng, 300.0, 2400.0) * (0.55 + 0.45 * np.sin(TAU * ph)) * (0.8 + 0.2 * smooth_noise(n, rng, 11.0))
    y = 0.22 * roll
    revs = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    clack = dsp.modal([640.0, 1130.0, 1890.0], [0.012, 0.008, 0.005], [1.0, 0.6, 0.35], 0.06, sr)
    for i in revs:
        place(y, clack, int(i), rng.uniform(0.35, 0.6))
        if rng.random() < 0.93:  # the squeak, once per turn
            m = n_of(rng.uniform(0.05, 0.075), sr)
            f = rng.uniform(3050.0, 3250.0) * bpc(m, [(0, 0.94), (0.6, 1.04), (1.0, 1.0)])
            sq = tone(f, env_ar(m, 0.008, 0.03, sr), sr) + 0.2 * tone(2 * f, env_ar(m, 0.008, 0.03, sr), sr)
            place(y, sq.astype(F32), int(i) + n_of(0.11 / rev * 2.4, sr), rng.uniform(0.16, 0.26))
    feet = np.nonzero(np.diff(np.floor(ph * rng.uniform(4.6, 5.2) + 0.3 * smooth_noise(n, rng, 3.0))) > 0)[0]
    tick = dsp.modal([1500.0, 2300.0], [0.004, 0.003], [1.0, 0.5], 0.02, sr)
    for i in feet:
        place(y, tick, int(i), rng.uniform(0.1, 0.25))
    return fade(y.astype(F32), 0.08, 0.25, sr)


def cage_rattle(params, sr=SR):
    """Small animal shaking/biting cage bars. params: dur."""
    rng = _rng(params, "cage_rattle")
    dur = _f(params, "dur", 2.0, 0.2, 30.0)
    n = n_of(dur, sr)
    y = np.zeros(n, dtype=np.float32)
    bars = []
    for _ in range(5):
        f = rng.uniform(1500.0, 2700.0)
        bars.append(dsp.modal([f, f * 2.76, f * 5.4], [rng.uniform(0.05, 0.12), 0.04, 0.02], [1.0, 0.5, 0.2], 0.4, sr))
    frame = dsp.modal([380.0, 610.0], [0.03, 0.02], [1.0, 0.5], 0.12, sr)
    t = 0.03
    while t < dur - 0.05:
        blen = rng.uniform(0.25, 0.7)
        rate = rng.uniform(9.0, 14.0)
        tb = t
        while tb < min(t + blen, dur - 0.03):
            a = rng.uniform(0.35, 1.0)
            place(y, bars[int(rng.integers(0, 5))], int(tb * sr), a)
            place(y, frame, int(tb * sr), 0.5 * a)
            tb += (1.0 / rate) * rng.uniform(0.7, 1.4)
        t += blen + rng.uniform(0.15, 0.6)
    return fade(lp(y, 10000.0, 2, sr), 0.002, 0.1, sr)


def scurry(params, sr=SR):
    """Tiny fast footsteps. params: dur, surface. Returns stereo (moves across)."""
    rng = _rng(params, "scurry")
    dur = _f(params, "dur", 1.2, 0.2, 20.0)
    n = n_of(dur, sr)
    y = np.zeros(n, dtype=np.float32)
    t = 0.01
    rate = rng.uniform(16.0, 22.0)
    while t < dur - 0.01:
        tick = dsp.noise_burst(rng, 0.012, 2500.0, 7500.0, 0.0025, sr=sr)
        place(y, tick, int(t * sr), rng.uniform(0.4, 1.0))
        place(y, dsp.modal([rng.uniform(260.0, 420.0)], [0.006], [1.0], 0.03, sr), int(t * sr), 0.2)
        t += (1.0 / rate) * rng.uniform(0.75, 1.3)
    u = np.linspace(0.0, 1.0, n)
    y = y * bpc(n, [(0, 0.2), (0.3, 1.0), (0.7, 0.9), (1.0, 0.15)])
    d = 1.0 if rng.random() < 0.5 else -1.0
    return dsp.pan_curve(fade(y, 0.002, 0.03, sr), d * (-0.7 + 1.4 * u))


def paws(params, sr=SR):
    """Dog/cat footsteps. params: surface floor|asphalt|grass|leaves, steps, rate (steps/s), size."""
    rng = _rng(params, "paws")
    surface = str(params.get("surface", "floor"))
    steps = _i(params, "steps", 6, 1, 200)
    rate = _f(params, "rate", 3.4, 0.5, 14.0)
    k = {"small": 0.6, "medium": 1.0, "large": 1.35}[_size(params)]
    ev = []
    t = 0.0
    for i in range(steps):
        n = n_of(0.2, sr)
        y = np.zeros(n, dtype=np.float32)
        thud_f = rng.uniform(105.0, 150.0) / k ** 0.5
        if surface in ("floor", "asphalt"):
            place(y, dsp.modal([thud_f, thud_f * 2.3], [0.022, 0.012], [1.0, 0.4], 0.12, sr), 0, 0.9 * k)
            place(y, dsp.noise_burst(rng, 0.03, 0, 350.0 if surface == "floor" else 260.0, 0.01, sr=sr), 0, 0.5 * k)
            for _ in range(int(rng.integers(2, 4))):  # claws
                dt = rng.uniform(0.0, 0.014)
                if surface == "floor":
                    f = rng.uniform(3000.0, 5200.0)
                    c = dsp.modal([f, f * 1.6], [0.003, 0.002], [1.0, 0.5], 0.015, sr)
                    place(c, dsp.noise_burst(rng, 0.004, 2500.0, 9000.0, 0.0012, sr=sr), 0, 0.5)
                    place(y, c, int(dt * sr), rng.uniform(0.12, 0.3))
                else:
                    place(y, dsp.noise_burst(rng, 0.02, 1500.0, 5000.0, 0.006, sr=sr), int(dt * sr), rng.uniform(0.12, 0.25))
        elif surface == "leaves":
            m = n_of(0.13, sr)
            imp = dsp.impulses(m, rng, 170.0, sr) * exp_decay(m, 0.04, sr)
            kern = dsp.noise_burst(rng, 0.006, 2200.0, 9000.0, 0.0015, sr=sr)
            place(y, dsp.conv_same(imp, kern), 0, 0.5)
            place(y, dsp.modal([thud_f], [0.02], [1.0], 0.1, sr), 0, 0.35 * k)
        else:  # grass
            m = n_of(0.12, sr)
            sw = dsp.band_noise(m, rng, 1200.0, 6000.0) * bpc(m, [(0, 0), (0.18, 1.0), (1.0, 0)])
            place(y, sw.astype(F32), 0, 0.5)
            place(y, dsp.modal([thud_f], [0.02], [1.0], 0.1, sr), 0, 0.4 * k)
        ev.append((t, y, float(rng.uniform(0.7, 1.0))))
        t += (1.0 / rate) * rng.uniform(0.88, 1.12)
    return fade(sequence(ev, sr=sr), 0.001, 0.03, sr)


GENERATORS = {
    "dog_bark": dog_bark, "dog_whine": dog_whine, "dog_pant": dog_pant, "dog_howl": dog_howl,
    "dog_growl": dog_growl, "puppy_yip": puppy_yip, "sniff": sniff, "paws": paws,
    "cat_meow": cat_meow, "cat_purr": cat_purr, "cat_hiss": cat_hiss, "pounce": pounce,
    "mouse_squeak": mouse_squeak, "parrot_squawk": parrot_squawk, "parrot_flock": parrot_flock,
    "parrot_talk": parrot_talk, "wing_flaps": wing_flaps, "hawk_cry": hawk_cry, "owl_hoot": owl_hoot,
    "rabbit_thump": rabbit_thump, "hop": hop, "munch": munch, "hamster_wheel": hamster_wheel,
    "cage_rattle": cage_rattle, "scurry": scurry,
}
