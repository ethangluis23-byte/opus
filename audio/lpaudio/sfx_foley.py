"""Foley, objects, machines and weather one-shots (all synthesised).

fn(params, sr=48000) -> float32 mono or stereo. Impacts are modal (damped
sinusoids), scrapes/creaks are stick-slip pulse trains through resonators,
textures are shaped noise with event-level randomisation.
"""
from __future__ import annotations

import numpy as np

from . import dsp
from .dsp import (SR, F32, TAU, bpc, cos_ramp, distance_fx, env_ar, exp_decay, fade, lp, hp, bp, n_of, place,
                  sequence, smooth_noise, tone, white)
from .sfx_animals import _f, _i, _rng, _rms


def _pulse_idx(rate, sr=SR):
    """Sample indices of a pulse train with a per-sample rate curve (Hz)."""
    ph = np.cumsum(np.asarray(rate, dtype=np.float64)) / sr
    return np.nonzero(np.diff(np.floor(ph)) > 0)[0] + 1


# ---------------------------------------------------------------- creaks ---

def creak(rng, dur=1.4, kind="metal", sr=SR):
    """Stick-slip groan: irregular pulses ringing a set of resonances."""
    n = n_of(dur, sr)
    rate = bpc(n, [(0, 25.0), (0.2, rng.uniform(70, 110)), (0.45, rng.uniform(40, 70)),
                   (0.7, rng.uniform(80, 130)), (1.0, 20.0)]) * (1.0 + 0.15 * smooth_noise(n, rng, 9.0))
    idx = _pulse_idx(np.maximum(rate, 5.0), sr)
    idx = idx[idx < n]
    amp = bpc(n, [(0, 0), (0.15, 1.0), (0.5, 0.6), (0.75, 1.0), (1.0, 0)])
    imp = np.zeros(n, dtype=np.float32)
    imp[idx] = rng.uniform(0.5, 1.0, len(idx)) * amp[idx]
    k = rng.uniform(0.8, 1.3)
    if kind == "metal":
        modes, qs, gains = [410, 730, 1180, 1870, 2650, 3900], [30, 35, 40, 40, 35, 30], [1.0, 0.9, 0.8, 0.6, 0.4, 0.25]
    else:  # wood
        modes, qs, gains = [230, 480, 870, 1500], [12, 14, 16, 16], [1.0, 0.8, 0.5, 0.3]
    y = dsp.resonator_bank(imp, [m * k for m in modes], qs, gains, sr)
    y = y + 0.05 * _rms(y) * dsp.band_noise(n, rng, 1500.0, 4500.0) * amp
    return fade(y, 0.01, 0.08, sr)


def metal_creak(params, sr=SR):
    """params: dur, dist, kind metal|wood."""
    rng = _rng(params, "metal_creak")
    y = creak(rng, _f(params, "dur", 1.5, 0.3, 8.0), str(params.get("kind", "metal")), sr)
    return distance_fx(y, _f(params, "dist", 0.4, 0, 1), str(params.get("space", "street")))


# --------------------------------------------------------------- objects ---

def door_scratch(params, sr=SR):
    """A dog scratching at a wooden door. params: dur."""
    rng = _rng(params, "door_scratch")
    dur = _f(params, "dur", 2.5, 0.3, 30.0)
    n = n_of(dur, sr)
    y = np.zeros(n, dtype=np.float32)
    grain = dsp.noise_burst(rng, 0.006, 1200.0, 5500.0, 0.0018, sr=sr)
    t = 0.04
    while t < dur - 0.2:
        for _ in range(int(rng.integers(3, 6))):
            d = rng.uniform(0.12, 0.19)
            m = n_of(d, sr)
            rate = rng.uniform(170.0, 260.0) * bpc(m, [(0, 1.0), (1.0, 0.55)])
            idx = _pulse_idx(rate, sr)
            idx = idx[idx < m]
            imp = np.zeros(m, dtype=np.float32)
            imp[idx] = rng.uniform(0.4, 1.0, len(idx))
            env = bpc(m, [(0, 0), (0.1, 1.0), (0.7, 0.7), (1.0, 0)])
            scrape = (dsp.conv_same(imp * rng.choice([-1.0, 1.0], m).astype(np.float32), grain)
                      + 0.25 * dsp.band_noise(m, rng, 1500.0, 6000.0)) * env
            body = dsp.resonator_bank(imp * env, [190.0, 340.0, 620.0], [10.0, 12.0, 14.0], [1.0, 0.8, 0.5], sr)
            stroke = scrape / _rms(scrape) + 0.9 * body / _rms(body)
            tap = dsp.modal([140.0, 260.0], [0.03, 0.02], [1.0, 0.5], 0.12, sr)
            g = rng.uniform(0.7, 1.0)
            place(y, stroke.astype(F32), int(t * sr), 0.3 * g)
            place(y, tap, int(t * sr), 1.2 * g)
            t += d + rng.uniform(0.05, 0.1)
            if t > dur - 0.2:
                break
        t += rng.uniform(0.35, 0.8)
    return dsp.reverb(fade(y, 0.002, 0.03, sr), "room", wet=0.12)


def ball_bounce(params, sr=SR):
    """A rubber ball bouncing to rest. params: count."""
    rng = _rng(params, "ball_bounce")
    count = _i(params, "count", 5, 1, 20)
    ev = []
    t = 0.0
    gap = rng.uniform(0.46, 0.56)
    for k in range(count):
        a = 0.74 ** k
        n = n_of(0.22, sr)
        tt = np.arange(n) / sr
        f = (150.0 + 45.0 * np.exp(-tt / 0.01)) * (1.0 + 0.05 * k)
        y = tone(f, exp_decay(n, 0.04, sr), sr)
        y[:36] *= cos_ramp(36)
        y += dsp.modal([520.0 * (1 + 0.03 * k)], [0.018], [0.35], 0.22, sr)
        place(y, dsp.noise_burst(rng, 0.008, 0, 3000.0, 0.002, sr=sr), 0, 0.3)
        ev.append((t, y.astype(F32), a))
        t += gap * (0.74 ** k) * rng.uniform(0.97, 1.03)
    return dsp.reverb(fade(sequence(ev, sr=sr), 0.0, 0.03, sr), "room", wet=0.12)


def squeaky_toy(params, sr=SR):
    """Dog toy: squeeze 'squee' then the softer intake 'eek'."""
    rng = _rng(params, "squeaky_toy")
    k = rng.uniform(0.92, 1.08)

    def reed(f, amp, breath):
        n = len(f)
        v = dsp.harmonic_voice(f, amp, None, tilt_db_oct=-6.0, fmax=7500.0, hgains=[1.0, 0.55, 0.35, 0.2, 0.1], sr=sr)
        nz = dsp.band_noise(n, rng, 2000.0, 7000.0) * amp
        return (v / _rms(v) + breath * nz / _rms(nz)).astype(F32)

    n1 = n_of(0.21, sr)
    f1 = 1500.0 * k * bpc(n1, [(0, 1.0), (0.7, 1.52), (1.0, 1.56)])
    a1 = env_ar(n1, 0.012, 0.03, sr) * (0.8 + 0.2 * np.sin(TAU * 45.0 * np.arange(n1) / sr))
    n2 = n_of(0.24, sr)
    f2 = 1500.0 * k * bpc(n2, [(0, 1.38), (1.0, 0.9)])
    a2 = env_ar(n2, 0.02, 0.1, sr) * 0.5
    y = sequence([(0.0, reed(f1, a1, 0.1)), (0.27, reed(f2, a2, 0.25), 0.55)], sr=sr)
    return dsp.reverb(lp(fade(y, 0.003, 0.02, sr), 7000.0, 2, sr), "room", wet=0.1)


def plush_rustle(params, sr=SR):
    """Soft fabric / plush toy being nuzzled. params: dur. Returns stereo."""
    rng = _rng(params, "plush_rustle")
    dur = _f(params, "dur", 1.5, 0.2, 30.0)
    n = n_of(dur, sr)
    env = np.zeros(n, dtype=np.float32)
    t = 0.0
    while t < dur:
        m = n_of(rng.uniform(0.09, 0.26), sr)
        place(env, (bpc(m, [(0, 0), (0.35, 1.0), (1.0, 0)]) * rng.uniform(0.35, 1.0)).astype(F32), int(t * sr))
        t += rng.uniform(0.1, 0.3)
    out = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        out[:, ch] = dsp.band_noise(n, rng, 700.0, 4500.0, slope=-4.0) * env
    thump = lp(env * white(n, rng), 160.0, 2, sr) * 2.0
    out += thump[:, None]
    return fade(out, 0.01, 0.08, sr)


def glass_break(params, sr=SR):
    """Window shattering, default at some distance. params: dist."""
    rng = _rng(params, "glass_break")
    n = n_of(1.3, sr)
    y = np.zeros(n, dtype=np.float32)
    place(y, dsp.noise_burst(rng, 0.03, 1000.0, 9000.0, 0.006, sr=sr), 0, 1.0)
    place(y, dsp.modal([240.0, 410.0], [0.03, 0.02], [1.0, 0.6], 0.15, sr), 0, 0.6)
    for _ in range(46):
        t = min(rng.exponential(0.13), 0.95)
        f = float(np.exp(rng.uniform(np.log(2200.0), np.log(10500.0))))
        tau = rng.uniform(0.008, 0.09) * (2500.0 / f) ** 0.5
        ping = dsp.modal([f, f * 2.3], [tau, tau * 0.5], [1.0, 0.4], min(0.35, tau * 7), sr)
        place(y, ping, int(t * sr), rng.uniform(0.08, 0.4) * np.exp(-t / 0.5))
    y = lp(y, 11000.0, 2, sr)
    return distance_fx(fade(y, 0.0, 0.05, sr), _f(params, "dist", 0.5, 0, 1), str(params.get("space", "street")))


def paper_flutter(params, sr=SR):
    """Loose paper fluttering. params: dur. Returns stereo."""
    rng = _rng(params, "paper_flutter")
    dur = _f(params, "dur", 0.9, 0.2, 10.0)
    n = n_of(dur, sr)
    y = np.zeros(n, dtype=np.float32)
    t = 0.0
    while t < dur - 0.03:
        m = n_of(rng.uniform(0.03, 0.06), sr)
        flap = dsp.band_noise(m, rng, 1500.0, 7000.0) * bpc(m, [(0, 0), (0.12, 1.0), (1.0, 0)])
        place(y, flap.astype(F32), int(t * sr), rng.uniform(0.5, 1.0))
        place(y, dsp.modal([rng.uniform(180.0, 380.0)], [0.012], [1.0], 0.05, sr), int(t * sr), 0.25)
        t += rng.uniform(0.045, 0.085)
    u = np.linspace(0, 1, n)
    y = y * bpc(n, [(0, 0.3), (0.3, 1.0), (0.7, 0.8), (1.0, 0)])
    p0 = rng.uniform(-0.4, 0.4)
    return dsp.pan_curve(fade(y, 0.003, 0.05, sr), p0 + 0.4 * np.sin(TAU * 0.7 * u + rng.uniform(0, TAU)))


def water_drip(params, sr=SR):
    """Drops into a puddle. params: count, space (ruin|room|none)."""
    rng = _rng(params, "water_drip")
    count = _i(params, "count", 3, 1, 60)
    ev = []
    t = 0.0
    for _ in range(count):
        ev.append((t, drip(rng, sr), float(rng.uniform(0.6, 1.0))))
        t += rng.uniform(0.55, 1.3)
    y = sequence(ev, sr=sr)
    space = str(params.get("space", "ruin"))
    if space in dsp.IR_SPECS:
        return dsp.reverb(y, space, wet=_f(params, "wet", 0.28, 0, 1))
    return y


def drip(rng, sr=SR):
    n = n_of(0.24, sr)
    tt = np.arange(n) / sr
    f0 = rng.uniform(520.0, 900.0)
    y = tone(f0 * (1.0 + 0.9 * (1.0 - np.exp(-tt / 0.02))), exp_decay(n, rng.uniform(0.025, 0.045), sr), sr)
    y[:24] *= cos_ramp(24)
    place(y, dsp.noise_burst(rng, 0.008, 2000.0, 7000.0, 0.002, sr=sr), 0, 0.22)
    if rng.random() < 0.7:  # trailing smaller bubble
        m = n_of(0.1, sr)
        f1 = f0 * rng.uniform(1.3, 1.7)
        b = tone(f1 * (1.0 + 0.7 * (1.0 - np.exp(-np.arange(m) / sr / 0.012))), exp_decay(m, 0.02, sr), sr)
        b[:24] *= cos_ramp(24)
        place(y, b, int(rng.uniform(0.05, 0.09) * sr), 0.4)
    return y.astype(F32)


# -------------------------------------------------------------- machines ---

def feeder_beep(params, sr=SR):
    """Automatic feeder beeps. params: count, freq."""
    count = _i(params, "count", 3, 1, 20)
    f = _f(params, "freq", 1760.0, 300.0, 5000.0)
    n = n_of(0.1, sr)
    a = env_ar(n, 0.004, 0.01, sr)
    beep = (tone(np.full(n, f), a, sr) + 0.12 * tone(np.full(n, 3.0 * f), a, sr) + 0.06 * tone(np.full(n, 2.0 * f), a, sr)).astype(F32)
    ev = [(k * 0.21, beep) for k in range(count)]
    return dsp.reverb(sequence(ev, sr=sr), "room", wet=0.12)


def feeder_power_down(params, sr=SR):
    """Device giving up: falling beeps, motor winding down, relay click."""
    rng = _rng(params, "feeder_power_down")
    ev = []
    t = 0.0
    for f, d in ((1760.0, 0.075), (1318.5, 0.075), (880.0, 0.13)):
        n = n_of(d, sr)
        a = env_ar(n, 0.004, 0.012, sr)
        ev.append((t, (tone(np.full(n, f), a, sr) + 0.1 * tone(np.full(n, 2 * f), a, sr)).astype(F32), 0.8))
        t += d + 0.015
    m = n_of(0.78, sr)
    tt = np.arange(m) / sr
    f = 210.0 * np.exp(-tt / 0.28) + 32.0
    amp = bpc(m, [(0, 0.0), (0.04, 0.8), (0.5, 0.6), (1.0, 0.0)])
    motor = dsp.harmonic_voice(f, amp, None, tilt_db_oct=-6.0, fmax=3000.0, sr=sr)
    gear = dsp.band_noise(m, rng, 900.0, 3200.0) * amp * (0.5 + 0.5 * np.sin(TAU * np.cumsum(f) / sr))
    ev.append((0.3, (motor / _rms(motor) + 0.45 * gear / _rms(gear)).astype(F32), 0.16))
    ev.append((1.1, dsp.modal([2400.0, 3900.0, 700.0], [0.004, 0.003, 0.01], [1.0, 0.6, 0.6], 0.05, sr), 0.6))
    return dsp.reverb(sequence(ev, sr=sr), "room", wet=0.12)


def electric_flicker(params, sr=SR):
    """Lights flickering: buzzing bursts with spark crackle. params: dur."""
    rng = _rng(params, "electric_flicker")
    dur = _f(params, "dur", 0.9, 0.2, 10.0)
    n = n_of(dur + 0.05, sr)
    gate = np.zeros(n, dtype=np.float32)
    onsets = []
    t = 0.0
    while t < dur - 0.03:
        d = rng.uniform(0.03, 0.14)
        a, b = int(t * sr), min(n, int((t + d) * sr))
        gate[a:b] = rng.uniform(0.5, 1.0)
        onsets.append(a)
        t += d + rng.uniform(0.03, 0.16)
    gate = lp(gate, 250.0, 1, sr)
    hg = [0.5, 1.0, 0.4, 0.8, 0.3, 0.6] + [0.5 / (1 + 0.15 * k) for k in range(60)]
    buzz = dsp.harmonic_voice(np.full(n, 60.0), gate, None, tilt_db_oct=-4.0, fmax=3600.0, hgains=hg, sr=sr)
    crack = dsp.conv_same(dsp.impulses(n, rng, 380.0, sr) * gate, dsp.noise_burst(rng, 0.003, 2500.0, 9000.0, 0.0008, sr=sr))
    y = buzz / _rms(buzz) + 0.55 * crack / _rms(crack)
    tink = dsp.modal([4300.0, 6900.0], [0.01, 0.006], [1.0, 0.5], 0.05, sr)
    for a in onsets:
        place(y, tink, a, 0.8 * rng.uniform(0.4, 1.0))
    place(y, dsp.modal([2100.0, 3300.0, 600.0], [0.004, 0.003, 0.012], [1.0, 0.6, 0.7], 0.05, sr), n - n_of(0.05, sr), 1.5)
    return dsp.reverb(fade(y.astype(F32), 0.002, 0.01, sr), "room", wet=0.1)


def power_down_big(params, sr=SR):
    """A whole city losing power: descending hum collapsing into silence. Stereo. params: dur."""
    rng = _rng(params, "power_down_big")
    T = _f(params, "dur", 4.2, 1.5, 12.0)
    n = n_of(T + 0.6, sr)
    tt = np.arange(n) / sr
    u = np.clip(tt / T, 0.0, 1.0)
    glide = 1.0 - 0.88 * u ** 1.6
    amp = (1.0 + 0.3 * np.sin(np.pi * u)) * (1.0 - u ** 2.4)
    out = np.zeros((n, 2), dtype=np.float32)
    for f, a in ((60.0, 0.5), (120.0, 1.0), (180.0, 0.45), (87.0, 0.5), (174.0, 0.6), (233.0, 0.35), (311.0, 0.25), (466.0, 0.12)):
        for ch in range(2):
            fr = f * glide * (1.0 + rng.uniform(-0.004, 0.004))
            ph = rng.uniform(0, TAU)
            out[:, ch] += a * (tone(fr, 1.0, sr, ph) + 0.4 * tone(2 * fr, 1.0, sr, ph) + 0.2 * tone(3 * fr, 1.0, sr, ph))
    out *= (amp * 0.2)[:, None]
    w_hi, w_mid = np.clip(1.0 - 2.5 * u, 0, 1), np.clip(1.0 - 1.4 * u, 0, 1)
    for ch in range(2):  # the city's air handling dying away
        p = dsp.pink(n, rng)
        air = lp(p, 220.0, 2, sr) * 1.5 + lp(p, 900.0, 2, sr) * w_mid + lp(p, 3200.0, 2, sr) * w_hi * 0.8
        out[:, ch] += 0.22 * air * amp
    clunks = np.zeros((n, 2), dtype=np.float32)
    times = [0.0] + sorted(rng.uniform(0.25, T * 0.7, 5).tolist())
    for i, tk in enumerate(times):  # breakers tripping across the grid
        f = rng.uniform(65.0, 110.0)
        c = dsp.modal([f, f * 2.1], [0.07, 0.03], [1.0, 0.5], 0.4, sr)
        place(c, dsp.noise_burst(rng, 0.03, 700.0, 2600.0, 0.008, sr=sr), 0, 0.5)
        place(clunks, dsp.pan(c, 0.0 if i == 0 else rng.uniform(-0.9, 0.9)), int(tk * sr), 1.0 if i == 0 else rng.uniform(0.3, 0.7))
    wet = dsp.reverb(clunks * 0.45, "street", wet=0.5)
    res = np.zeros((max(len(wet), n), 2), dtype=np.float32)
    res[:n] += fade(out, 0.03, 0.5, sr)
    res[:len(wet)] += wet
    return res


def car_engine_die(params, sr=SR):
    """Idling engine sputters and dies."""
    rng = _rng(params, "car_engine_die")
    n = n_of(2.7, sr)
    rate = bpc(n, [(0, 27.0), (0.2, 27.0), (0.3, 21.0), (0.36, 25.0), (0.5, 16.0), (0.56, 19.0), (0.72, 9.0),
                   (0.84, 5.0), (0.9, 0.01), (1.0, 0.01)], kind="linear")
    idx = _pulse_idx(rate, sr)
    idx = idx[idx < n]
    amp = bpc(n, [(0, 0.8), (0.2, 0.8), (0.5, 1.0), (0.75, 0.9), (0.88, 0.6), (1.0, 0.0)], kind="linear")
    imp = np.zeros(n, dtype=np.float32)
    imp[idx] = amp[idx] * (1.0 + 0.2 * rng.standard_normal(len(idx)))
    kern = dsp.modal([62.0, 124.0, 190.0], [0.03, 0.018, 0.012], [1.0, 0.6, 0.35], 0.16, sr)
    place(kern, dsp.noise_burst(rng, 0.06, 0, 650.0, 0.016, sr=sr), 0, 0.5)
    y = dsp.conv_same(imp, kern)
    envn = lp(np.abs(imp), 12.0, 1, sr)
    y = y + 0.35 * dsp.band_noise(n, rng, 120.0, 900.0) * envn / (float(envn.max()) + 1e-9) * _rms(y) * 2.0
    for tk in (2.05, 2.12, 2.17):  # last shudder
        place(y, dsp.modal([rng.uniform(700, 1500)], [0.01], [1.0], 0.05, sr), int(tk * sr), 0.25 * _rms(y) * 4)
    for tk in (2.4, 2.62):  # hot metal ticking
        place(y, dsp.modal([2900.0, 4700.0], [0.02, 0.012], [1.0, 0.5], 0.08, sr), int(tk * sr), 0.12 * _rms(y) * 4)
    return dsp.reverb(fade(y, 0.02, 0.03, sr), "street", wet=0.09)


def traffic_light_click(params, sr=SR):
    """Relay clack of a traffic-light controller."""
    rng = _rng(params, "traffic_light_click")
    n = n_of(0.2, sr)
    y = np.zeros(n, dtype=np.float32)
    tick = dsp.modal([2900.0, 4400.0, 6100.0], [0.003, 0.0025, 0.002], [1.0, 0.7, 0.4], 0.03, sr)
    place(tick, dsp.noise_burst(rng, 0.004, 2000.0, 9000.0, 0.001, sr=sr), 0, 0.6)
    place(y, tick, 0, 1.0)
    place(y, tick, n_of(0.009, sr), 0.55)
    place(y, dsp.modal([520.0, 830.0], [0.014, 0.01], [1.0, 0.5], 0.08, sr), 0, 0.9)
    place(y, dsp.modal([1400.0, 2150.0], [0.03, 0.02], [0.25, 0.15], 0.15, sr), 0, 1.0)
    return dsp.reverb(y, "street", wet=0.1)


# --------------------------------------------------------------- weather ---

def rumble_collapse(params, sr=SR):
    """Distant masonry collapse. params: dist. Returns stereo."""
    rng = _rng(params, "rumble_collapse")
    dur = _f(params, "dur", 5.0, 2.0, 15.0)
    n = n_of(dur, sr)
    out = np.zeros((n, 2), dtype=np.float32)
    env = bpc(n, [(0, 0), (0.08, 1.0), (0.4, 0.8), (1.0, 0)])
    for ch in range(2):
        out[:, ch] = lp(dsp.brown(n, rng), 170.0, 2, sr) * env * (1.0 + 0.4 * smooth_noise(n, rng, 5.0)) * 0.9
    place(out, dsp.modal([48.0, 77.0], [0.25, 0.15], [1.0, 0.6], 1.0, sr), 0, 0.5)
    for _ in range(90):
        t = min(float(rng.gamma(2.2, 0.55 * dur / 5.0)), dur * 0.85)
        b = dsp.noise_burst(rng, 0.16, 0, rng.uniform(300.0, 1600.0), rng.uniform(0.015, 0.06), sr=sr)
        place(out, dsp.pan(b, rng.uniform(-0.8, 0.8)), int(t * sr), float(min(rng.lognormal(-2.0, 0.7), 0.6)))
    dust = bpc(n, [(0, 0), (0.25, 1.0), (1.0, 0)])
    for ch in range(2):
        out[:, ch] += 0.035 * dsp.band_noise(n, rng, 900.0, 4500.0) * dust
    return distance_fx(fade(out, 0.01, 0.4, sr), _f(params, "dist", 0.7, 0, 1), str(params.get("space", "street")))


def thunder(params, sr=SR):
    """Rolling thunder. params: dist (0 = overhead crack, 1 = far rumble). Returns stereo."""
    rng = _rng(params, "thunder")
    dist = _f(params, "dist", 0.6, 0.0, 1.0)
    dur = 6.0 + 2.0 * dist
    n = n_of(dur, sr)
    out = np.zeros((n, 2), dtype=np.float32)
    fc = 2200.0 * (0.06 ** dist) + 70.0
    times = [0.0] + sorted(rng.uniform(0.15, 2.0 + dist, 5).tolist())
    for i, tk in enumerate(times):
        m = n_of(rng.uniform(1.4, 2.8), sr)
        env = env_ar(m, rng.uniform(0.02, 0.12) * (1.0 + 3.0 * dist), 0.0, sr) * exp_decay(m, rng.uniform(0.5, 1.3), sr)
        for ch in range(2):
            c = lp(dsp.brown(m, rng), fc * rng.uniform(0.5, 1.3), 2, sr) * env
            place(out[:, ch], c, int(tk * sr), 1.0 if i == 0 else rng.uniform(0.35, 0.9))
    roll = bpc(n, [(0, 0), (0.15, 1.0), (0.5, 0.6), (1.0, 0)])
    for ch in range(2):
        out[:, ch] += 1.2 * lp(dsp.brown(n, rng), 90.0, 2, sr) * roll * (1.0 + 0.5 * smooth_noise(n, rng, 3.0))
    if dist < 0.35:
        k = 1.0 - dist / 0.35
        m = n_of(0.6, sr)
        crack = dsp.band_noise(m, rng, 400.0, 5000.0) * exp_decay(m, 0.07, sr)
        crack = crack + dsp.conv_same(dsp.impulses(m, rng, 60.0, sr) * exp_decay(m, 0.2, sr), dsp.noise_burst(rng, 0.01, 800.0, 6000.0, 0.003, sr=sr))
        place(out, crack.astype(F32), 0, 0.9 * k * float(np.max(np.abs(out))))
    return dsp.reverb(fade(out, 0.005, 1.2, sr), "open", wet=0.25 + 0.2 * dist)


def leaves_rustle(params, sr=SR):
    """Leaves / undergrowth moving. params: dur, intensity 0..1. Returns stereo."""
    rng = _rng(params, "leaves_rustle")
    dur = _f(params, "dur", 2.0, 0.2, 60.0)
    inten = _f(params, "intensity", 0.5, 0.0, 1.0)
    n = n_of(dur, sr)
    g = (0.25 + 0.75 * np.clip(0.5 + 0.6 * smooth_noise(n, rng, 2.5), 0.0, 1.5)) ** 1.5
    kern = dsp.noise_burst(rng, 0.004, 3000.0, 9000.0, 0.0012, sr=sr)
    out = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        base = dsp.band_noise(n, rng, 2000.0, 9000.0, slope=-2.0)
        crackle = dsp.conv_same(dsp.impulses(n, rng, 120.0 + 500.0 * inten, sr), kern)
        out[:, ch] = (base * (0.5 + 0.3 * inten) + crackle * (0.25 + 0.5 * inten) / _rms(crackle)) * g
    return fade(out, min(0.25, dur / 4), min(0.4, dur / 3), sr)


def grass_rustle(params, sr=SR):
    """Something moving through grass. params: dur. Returns stereo."""
    rng = _rng(params, "grass_rustle")
    dur = _f(params, "dur", 2.0, 0.2, 60.0)
    n = n_of(dur, sr)
    env = np.full(n, 0.12, dtype=np.float32)
    t = 0.0
    while t < dur:
        m = n_of(rng.uniform(0.15, 0.35), sr)
        place(env, (bpc(m, [(0, 0), (0.4, 1.0), (1.0, 0)]) * rng.uniform(0.4, 1.0)).astype(F32), int(t * sr))
        t += rng.uniform(0.2, 0.42)
    out = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        out[:, ch] = dsp.band_noise(n, rng, 1000.0, 5500.0, slope=-3.0) * env
    return fade(out, min(0.2, dur / 4), min(0.35, dur / 3), sr)


GENERATORS = {
    "door_scratch": door_scratch, "ball_bounce": ball_bounce, "squeaky_toy": squeaky_toy,
    "plush_rustle": plush_rustle, "feeder_beep": feeder_beep, "feeder_power_down": feeder_power_down,
    "electric_flicker": electric_flicker, "power_down_big": power_down_big, "car_engine_die": car_engine_die,
    "traffic_light_click": traffic_light_click, "glass_break": glass_break, "metal_creak": metal_creak,
    "rumble_collapse": rumble_collapse, "leaves_rustle": leaves_rustle, "grass_rustle": grass_rustle,
    "water_drip": water_drip, "thunder": thunder, "paper_flutter": paper_flutter,
}
