"""Cinematic / editorial one-shots: vanish, whoosh, riser, boom, sub drop,
shimmer, time ticks, UI pop. Tonal parts sit on D / A / F so they agree with
the score (D minor / F major).
"""
from __future__ import annotations

import numpy as np

from . import dsp
from .dsp import (SR, F32, TAU, bpc, cos_ramp, env_ar, exp_decay, fade, lp, hp, n_of, place, smooth_noise, tone)
from .sfx_animals import _f, _i, _rng, _rms
from .sfx_foley import _pulse_idx

# Seconds of sound that precede the cue time `t` (the event itself lands on t).
PREROLL = {"vanish": 0.85}


def vanish(params, sr=SR):
    """The instant every human disappears: airy reverse swell -> soft vacuum
    pop + sub drop -> a hush. The pop lands PREROLL['vanish'] s into the sound."""
    rng = _rng(params, "vanish")
    pre = n_of(PREROLL["vanish"], sr)
    post = n_of(3.0, sr)
    out = np.zeros((pre + post, 2), dtype=np.float32)
    u = np.linspace(0.0, 1.0, pre)
    env = u ** 3.2
    for ch in range(2):
        fc = 500.0 * (9000.0 / 500.0) ** (u ** 1.5)
        air = dsp.moving_band_noise(pre, rng, fc, q=1.2, fmin=400.0, fmax=9000.0, per_oct=2.0, sr=sr)
        tonal = np.zeros(pre, dtype=np.float32)
        for f, a in ((587.33, 1.0), (880.0, 0.8), (1174.66, 0.6), (1760.0, 0.35)):
            tonal += a * tone(np.full(pre, f * (1.0 + rng.uniform(-0.003, 0.003))), 1.0, sr, rng.uniform(0, TAU))
        out[:pre, ch] = (0.5 * air + 0.07 * tonal) * env
    out[:pre] = fade(out[:pre], 0.0, 0.004, sr)

    m = n_of(0.3, sr)
    tt = np.arange(m) / sr
    pop = tone(55.0 + 260.0 * np.exp(-tt / 0.022), exp_decay(m, 0.06, sr), sr)
    pop[:96] *= cos_ramp(96)  # 2 ms rise keeps it soft
    place(pop, dsp.noise_burst(rng, 0.05, 150.0, 900.0, 0.012, sr=sr), 0, 0.35)
    m2 = n_of(1.8, sr)
    t2 = np.arange(m2) / sr
    sub = tone(30.0 + 52.0 * np.exp(-t2 / 0.35), env_ar(m2, 0.015, 0.4, sr) * exp_decay(m2, 0.55, sr), sr)
    sub = dsp.soft_clip(sub * 1.3, 1.3)
    body = np.zeros(post, dtype=np.float32)
    place(body, pop, 0, 0.9)
    place(body, sub, 0, 0.8)
    wet = dsp.reverb(body, "hall", wet=0.22, dry=1.0)
    place(out, wet[:post], pre)
    h = n_of(2.4, sr)
    for ch in range(2):  # the hush: soft air draining away
        hush = dsp.band_noise(h, rng, 250.0, 2200.0, slope=-4.0) * exp_decay(h, 0.7, sr) * env_ar(h, 0.03, 0.5, sr)
        place(out[:, ch], hush, pre, 0.035)
    return fade(out, 0.0, 0.3, sr)


def whoosh(params, sr=SR):
    """Airy pass-by. params: dur, dir (-1 right-to-left, +1 left-to-right). Stereo."""
    rng = _rng(params, "whoosh")
    dur = _f(params, "dur", 0.8, 0.15, 8.0)
    n = n_of(dur, sr)
    u = np.linspace(0.0, 1.0, n)
    pk = 0.55
    env = np.where(u < pk, (u / pk) ** 2.2, ((1.0 - u) / (1.0 - pk)) ** 1.6)
    fc = 350.0 * 2.0 ** (3.0 * bpc(n, [(0, 0.0), (pk, 1.0), (1.0, 0.35)]))
    x = dsp.moving_band_noise(n, rng, fc, q=1.6, fmin=250.0, fmax=4000.0, per_oct=3.0, sr=sr)
    low = dsp.band_noise(n, rng, 60.0, 250.0) * 0.3
    y = (x + low) * env
    d = params.get("dir")
    d = float(d) if isinstance(d, (int, float)) and d != 0 else (1.0 if rng.random() < 0.5 else -1.0)
    return dsp.pan_curve(fade(y, 0.01, 0.03, sr), np.sign(d) * (-0.7 + 1.4 * u))


def riser(params, sr=SR):
    """Swell into a transition; peaks at t + dur, then cuts. params: dur. Stereo."""
    rng = _rng(params, "riser")
    dur = _f(params, "dur", 3.0, 0.3, 30.0)
    rel = 0.09
    n = n_of(dur + rel, sr)
    u = np.clip(np.arange(n) / (dur * sr), 0.0, 1.0)
    env = u ** 2.4
    out = np.zeros((n, 2), dtype=np.float32)
    trem = 1.0 - 0.35 * (0.5 + 0.5 * np.sin(TAU * np.cumsum(4.0 + 12.0 * u) / sr))
    for ch in range(2):
        nz = dsp.moving_band_noise(n, rng, 220.0 * (6000.0 / 220.0) ** u, q=1.4, fmin=200.0, fmax=6500.0, per_oct=2.5, sr=sr)
        tonal = np.zeros(n, dtype=np.float32)
        for f in (146.83, 220.0, 293.66):
            tonal += tone(f * (1.0 + rng.uniform(-0.002, 0.002)) * 2.0 ** u, 1.0, sr, rng.uniform(0, TAU))
        out[:, ch] = (0.8 * nz + 0.13 * tonal * trem) * env
    sub = tone(40.0 + 25.0 * u, env, sr) * 0.5
    out += sub[:, None]
    return fade(out, 0.02, rel, sr)


def boom(params, sr=SR):
    """Deep title impact with a long dark tail. Never harsh. Stereo."""
    rng = _rng(params, "boom")
    n = n_of(2.6, sr)
    tt = np.arange(n) / sr
    sub = tone(38.0 + 36.0 * np.exp(-tt / 0.085), exp_decay(n, 0.75, sr), sr)
    sub[:n_of(0.004, sr)] *= cos_ramp(n_of(0.004, sr))
    sub = dsp.soft_clip(sub * 1.5, 1.4)  # odd harmonics so it reads on small speakers
    dry = sub.copy()
    place(dry, dsp.noise_burst(rng, 0.3, 0, 190.0, 0.07, sr=sr), 0, 0.5)
    place(dry, dsp.noise_burst(rng, 0.2, 90.0, 420.0, 0.045, sr=sr), 0, 0.35)
    place(dry, dsp.noise_burst(rng, 0.9, 200.0, 2400.0, 0.22, attack=0.004, sr=sr), 0, 0.1)
    y = dsp.reverb(dry, "boom", wet=0.55, dry=1.0)
    return fade(lp(y, 3000.0, 2, sr), 0.0, 0.6, sr)


def sub_drop(params, sr=SR):
    """Falling sub-bass sweep. params: dur."""
    dur = _f(params, "dur", 1.8, 0.4, 8.0)
    n = n_of(dur, sr)
    tt = np.arange(n) / sr
    f = 28.0 + 62.0 * np.exp(-tt / (0.3 * dur / 1.8))
    y = tone(f, env_ar(n, 0.012, 0.3 * dur, sr) * exp_decay(n, 0.5 * dur / 1.8, sr), sr)
    return fade(dsp.soft_clip(y * 1.4, 1.3), 0.0, 0.1, sr)


_PENTA = [698.46, 783.99, 880.0, 1046.5, 1174.66, 1396.91, 1567.98, 1760.0, 2093.0, 2349.32, 2793.83]


def shimmer(params, sr=SR):
    """Warm memory sparkle (F-major pentatonic bells in a hall). params: dur. Stereo."""
    rng = _rng(params, "shimmer")
    dur = _f(params, "dur", 3.0, 0.5, 30.0)
    n = n_of(dur, sr)
    dry = np.zeros((n, 2), dtype=np.float32)
    k = int(dur * 10)
    for _ in range(k):
        t = rng.uniform(0.0, dur * 0.85)
        f = _PENTA[int(rng.integers(0, len(_PENTA)))]
        tau = rng.uniform(0.3, 0.7) * (900.0 / f) ** 0.3
        m = n_of(min(tau * 5, dur - t), sr)
        freqs, taus, amps = [f], [tau], [1.0]
        if f * 2.76 < 9000:
            freqs.append(f * 2.76)
            taus.append(tau * 0.4)
            amps.append(0.12)
        g = dsp.modal(freqs, taus, amps, m / sr, sr)
        a = n_of(0.01, sr)
        g[:a] *= cos_ramp(a)
        place(dry, dsp.pan(g, rng.uniform(-0.8, 0.8)), int(t * sr), rng.uniform(0.15, 0.5) * (900.0 / f) ** 0.5)
    env = bpc(n, [(0, 0), (0.2, 1.0), (0.65, 1.0), (1.0, 0)])
    dry *= env[:, None]
    tt = np.arange(n) / sr
    for ch in range(2):  # soft pad underneath
        pad = np.zeros(n, dtype=np.float32)
        for f in (174.61, 220.0, 261.63, 349.23):
            pad += tone(np.full(n, f * (1.0 + rng.uniform(-0.002, 0.002))), 1.0, sr, rng.uniform(0, TAU))
        dry[:, ch] += 0.02 * pad * env * (0.9 + 0.1 * np.sin(TAU * 0.35 * tt + ch))
    y = dsp.reverb(dry, "hall", wet=0.5, dry=0.8)
    return fade(lp(y, 9000.0, 2, sr), 0.0, 0.5, sr)


def time_tick(params, sr=SR):
    """Accelerating clock ticks for time-lapse transitions. params: dur, accel, rate (initial ticks/s)."""
    rng = _rng(params, "time_tick")
    dur = _f(params, "dur", 3.0, 0.3, 30.0)
    accel = _f(params, "accel", 8.0, 1.0, 64.0)
    r0 = _f(params, "rate", 2.0, 0.5, 20.0)
    n = n_of(dur, sr)
    u = np.arange(n) / n
    rate = r0 * accel ** u
    idx = np.concatenate([[0], _pulse_idx(rate, sr)])
    idx = idx[idx < n - 8]
    tick = dsp.modal([3200.0, 5100.0, 900.0], [0.006, 0.004, 0.012], [1.0, 0.6, 0.5], 0.06, sr)
    tock = dsp.modal([2400.0, 4000.0, 760.0], [0.008, 0.005, 0.014], [1.0, 0.6, 0.6], 0.06, sr)
    click = dsp.noise_burst(rng, 0.003, 2500.0, 9000.0, 0.0008, sr=sr)
    y = np.zeros(n + n_of(0.08, sr), dtype=np.float32)
    for j, i in enumerate(idx):
        r = float(rate[i])
        a = (0.65 + 0.35 * u[i]) * (1.0 if r < 10.0 else (10.0 / r) ** 0.5) * rng.uniform(0.9, 1.0)
        place(y, tick if j % 2 == 0 else tock, int(i), a)
        place(y, click, int(i), 0.3 * a)
    return dsp.reverb(y, "room", wet=0.1)


def ui_pop(params, sr=SR):
    """Tiny soft pop for on-screen labels."""
    rng = _rng(params, "ui_pop")
    n = n_of(0.09, sr)
    tt = np.arange(n) / sr
    k = rng.uniform(0.94, 1.06)
    y = tone(k * (420.0 + 360.0 * np.exp(-tt / 0.012)), exp_decay(n, 0.018, sr), sr)
    y[:96] *= cos_ramp(96)
    return fade(y, 0.0, 0.01, sr)


GENERATORS = {
    "vanish": vanish, "whoosh": whoosh, "riser": riser, "boom": boom, "sub_drop": sub_drop,
    "shimmer": shimmer, "time_tick": time_tick, "ui_pop": ui_pop,
}
